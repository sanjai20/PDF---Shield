import io
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import time
import urllib.error
import urllib.request
import zipfile
from collections import defaultdict, deque
from datetime import datetime, timedelta

import pikepdf
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from config import get_settings
from database import Base, SessionLocal, engine, get_db
from models import Job, User
from schemas import (
    AdminStatsResponse,
    BillingCheckoutRequest,
    BillingCheckoutResponse,
    BillingPortalResponse,
    BillingPlanResponse,
    JobResponse,
    PlanUpdate,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserResponse,
)
from security import (
    authenticate_user,
    create_access_token,
    get_admin_user,
    get_current_user,
    get_optional_user,
    get_user_by_email,
    hash_password,
)
from services.pdf_service import PDFService


settings = get_settings()
app = FastAPI(title=settings.app_name, version=settings.app_version)
audit_logger = logging.getLogger("pdf_shield.audit")
rate_limit_store: dict[str, deque[float]] = defaultdict(deque)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

service = PDFService()


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    logging.basicConfig(level=logging.INFO)
    os.makedirs(settings.job_storage_dir, exist_ok=True)
    cleanup_expired_artifacts()


def log_audit_event(event: str, **fields):
    audit_logger.info(json.dumps({"event": event, **fields}, default=str))


def cleanup_expired_artifacts():
    cutoff = datetime.utcnow() - timedelta(hours=settings.job_retention_hours)
    if not os.path.isdir(settings.job_storage_dir):
        return

    for name in os.listdir(settings.job_storage_dir):
        path = os.path.join(settings.job_storage_dir, name)
        if not os.path.isfile(path):
            continue
        modified = datetime.utcfromtimestamp(os.path.getmtime(path))
        if modified < cutoff:
            try:
                os.remove(path)
                log_audit_event("artifact_deleted", path=path, reason="retention_expired")
            except OSError:
                pass


def build_artifact_path(job_id: int, output_filename: str) -> str:
    safe_name = os.path.basename(output_filename.replace("\\", "/"))
    return os.path.join(settings.job_storage_dir, f"job_{job_id}_{safe_name}")


def get_plan_limits(plan_name: str | None) -> dict:
    normalized = (plan_name or "free").lower()
    if normalized == "business":
        return {
            "daily_jobs": settings.business_daily_jobs,
            "max_batch_entries": min(settings.max_zip_entries, settings.business_batch_entries),
        }
    if normalized == "pro":
        return {
            "daily_jobs": settings.pro_daily_jobs,
            "max_batch_entries": min(settings.max_zip_entries, settings.pro_batch_entries),
        }
    return {
        "daily_jobs": settings.free_daily_jobs,
        "max_batch_entries": min(settings.max_zip_entries, settings.free_batch_entries),
    }


def build_plan_features(daily_jobs: int, batch_entries: int, extra_feature: str) -> list[str]:
    return [
        f"{daily_jobs} jobs/day",
        f"{batch_entries} PDFs per batch",
        extra_feature,
    ]


def get_billing_catalog(current_plan: str | None = None) -> list[BillingPlanResponse]:
    free_batch_entries = min(settings.max_zip_entries, settings.free_batch_entries)
    pro_batch_entries = min(settings.max_zip_entries, settings.pro_batch_entries)
    business_batch_entries = min(settings.max_zip_entries, settings.business_batch_entries)
    plans = [
        BillingPlanResponse(
            id="free",
            name="free",
            label="Free",
            description="Core PDF tools for lightweight personal use.",
            price_label="$0 / month",
            price_monthly=0,
            currency="usd",
            daily_jobs_limit=settings.free_daily_jobs,
            batch_pdf_limit=free_batch_entries,
            features=build_plan_features(settings.free_daily_jobs, free_batch_entries, "Core PDF tools"),
            is_current=(current_plan or "free").lower() == "free",
            checkout_enabled=False,
        ),
        BillingPlanResponse(
            id="pro",
            name="pro",
            label="Pro",
            description="Higher limits and priority processing for active individual users.",
            price_label="$29 / month",
            price_monthly=29,
            currency="usd",
            daily_jobs_limit=settings.pro_daily_jobs,
            batch_pdf_limit=pro_batch_entries,
            features=build_plan_features(settings.pro_daily_jobs, pro_batch_entries, "Priority processing"),
            is_current=(current_plan or "free").lower() == "pro",
            checkout_enabled=bool(settings.razorpay_plan_pro and settings.razorpay_key_id and settings.razorpay_key_secret),
        ),
        BillingPlanResponse(
            id="business",
            name="business",
            label="Business",
            description="Large team limits and admin-oriented controls for heavier workloads.",
            price_label="$99 / month",
            price_monthly=99,
            currency="usd",
            daily_jobs_limit=settings.business_daily_jobs,
            batch_pdf_limit=business_batch_entries,
            features=build_plan_features(settings.business_daily_jobs, business_batch_entries, "Admin controls"),
            is_current=(current_plan or "free").lower() == "business",
            checkout_enabled=bool(settings.razorpay_plan_business and settings.razorpay_key_id and settings.razorpay_key_secret),
        ),
    ]
    return plans


def get_razorpay_plan_id_for_plan(plan: str) -> str:
    normalized = plan.lower()
    if normalized == "pro":
        return settings.razorpay_plan_pro
    if normalized == "business":
        return settings.razorpay_plan_business
    return ""


def get_plan_for_razorpay_plan_id(plan_id: str | None) -> str | None:
    if not plan_id:
        return None
    if plan_id == settings.razorpay_plan_pro:
        return "pro"
    if plan_id == settings.razorpay_plan_business:
        return "business"
    return None


def require_razorpay_configured():
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise HTTPException(status_code=503, detail="Razorpay billing is not configured yet.")


def razorpay_request(method: str, path: str, payload: dict | None = None) -> dict:
    require_razorpay_configured()
    url = f"https://api.razorpay.com{path}"
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    token = base64.b64encode(f"{settings.razorpay_key_id}:{settings.razorpay_key_secret}".encode("utf-8")).decode("ascii")
    headers = {
        "Authorization": f"Basic {token}",
        "Content-Type": "application/json",
    }
    request = urllib.request.Request(url, data=body, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore")
        try:
            data = json.loads(raw) if raw else {}
            message = data.get("error", {}).get("description") or data.get("error", {}).get("reason") or raw
        except json.JSONDecodeError:
            message = raw or str(exc)
        raise HTTPException(status_code=502, detail=f"Razorpay request failed: {message}")
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"Razorpay request failed: {exc.reason}")


def scan_upload_threats(data: bytes, expected_extension: str | None) -> list[str]:
    findings: list[str] = []
    lowered = data[:200000].lower()

    if expected_extension == ".pdf":
        suspicious_pdf_patterns = {
            b"/launch": "launch action",
            b"/openaction": "open action",
            b"powershell": "powershell command",
            b"cmd.exe": "cmd.exe reference",
            b"wget ": "wget command",
            b"curl ": "curl command",
            b"/richmedia": "rich media object",
        }
        for pattern, label in suspicious_pdf_patterns.items():
            if pattern in lowered:
                findings.append(label)

    if expected_extension == ".zip":
        disallowed_extensions = {".exe", ".dll", ".js", ".jse", ".vbs", ".vbe", ".bat", ".cmd", ".ps1", ".scr", ".com", ".msi"}
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                for info in archive.infolist():
                    if info.is_dir():
                        continue
                    name = info.filename.replace("\\", "/")
                    ext = os.path.splitext(name.lower())[1]
                    if ext in disallowed_extensions:
                        findings.append(f"disallowed archive entry: {name}")
                    if info.file_size > 0:
                        with archive.open(info) as handle:
                            head = handle.read(4096)
                            if head.startswith(b"MZ"):
                                findings.append(f"executable content detected in archive entry: {name}")
        except zipfile.BadZipFile:
            findings.append("unreadable zip archive")

    return findings


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    if not path.startswith("/api") or path == "/api/health":
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"
    limit = settings.auth_rate_limit_per_minute if path.startswith("/api/auth/") else settings.rate_limit_per_minute
    bucket_key = f"{client_ip}:{'auth' if path.startswith('/api/auth/') else 'default'}"
    now = time.time()
    bucket = rate_limit_store[bucket_key]

    while bucket and now - bucket[0] > 60:
        bucket.popleft()

    if len(bucket) >= limit:
        log_audit_event("rate_limit_exceeded", ip=client_ip, path=path, limit=limit)
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Please slow down and try again shortly."},
        )

    bucket.append(now)
    return await call_next(request)


def run_pdf_operation(fn, *, bad_request_message="Invalid PDF request."):
    try:
        return fn()
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except re.error as exc:
        raise HTTPException(status_code=400, detail=f"Invalid regex pattern: {exc}")
    except pikepdf.PasswordError:
        raise HTTPException(status_code=400, detail="Incorrect password or PDF is encrypted.")
    except pikepdf.PdfError as exc:
        raise HTTPException(status_code=400, detail=str(exc) or bad_request_message)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc) or "Unexpected server error.")


def validate_upload(
    file: UploadFile,
    data: bytes,
    expected_extension: str | None = ".pdf",
    *,
    user: User | None = None,
    db: Session | None = None,
):
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    plan_limits = get_plan_limits(user.plan if user else "free")
    max_upload_mb = settings.max_upload_mb
    if len(data) > max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {max_upload_mb} MB limit.")
    if user and db:
        daily_window = datetime.utcnow() - timedelta(days=1)
        daily_jobs = (
            db.query(Job)
            .filter(Job.user_id == user.id, Job.created_at >= daily_window)
            .count()
        )
        if daily_jobs >= plan_limits["daily_jobs"]:
            log_audit_event(
                "plan_limit_exceeded",
                user_id=user.id,
                plan=user.plan,
                daily_jobs=daily_jobs,
                limit=plan_limits["daily_jobs"],
                filename=file.filename or "unknown",
            )
            raise HTTPException(
                status_code=403,
                detail=f"Your {user.plan} plan has reached its daily job limit of {plan_limits['daily_jobs']}.",
            )
    if expected_extension and not (file.filename or "").lower().endswith(expected_extension):
        raise HTTPException(status_code=400, detail=f"Expected a {expected_extension} file upload.")
    if expected_extension == ".pdf" and not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid PDF.")
    if expected_extension == ".pdf":
        try:
            with pikepdf.open(io.BytesIO(data)) as pdf:
                if len(pdf.pages) > settings.max_pdf_pages:
                    raise HTTPException(
                        status_code=413,
                        detail=f"PDF exceeds the {settings.max_pdf_pages} page limit.",
                    )
        except pikepdf.PasswordError:
            pass
    if expected_extension == ".zip" and data[:4] not in {b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"}:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid ZIP archive.")
    if expected_extension == ".zip":
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                infos = [info for info in archive.infolist() if not info.is_dir()]
                pdf_infos = [info for info in infos if info.filename.lower().endswith(".pdf")]
                if not pdf_infos:
                    raise HTTPException(status_code=400, detail="ZIP file does not contain any PDFs.")
                max_batch_entries = plan_limits["max_batch_entries"]
                if len(pdf_infos) > max_batch_entries:
                    log_audit_event(
                        "plan_limit_exceeded",
                        user_id=user.id if user else None,
                        plan=user.plan if user else "free",
                        pdf_entries=len(pdf_infos),
                        limit=max_batch_entries,
                        filename=file.filename or "unknown",
                    )
                    raise HTTPException(
                        status_code=413,
                        detail=f"ZIP exceeds the {max_batch_entries} PDF file limit for your plan.",
                    )

                total_uncompressed = 0
                for info in pdf_infos:
                    normalized = info.filename.replace("\\", "/")
                    if normalized.startswith("/") or ".." in normalized.split("/"):
                        raise HTTPException(status_code=400, detail="ZIP contains unsafe file paths.")
                    total_uncompressed += info.file_size

                if total_uncompressed > settings.max_zip_uncompressed_mb * 1024 * 1024:
                    raise HTTPException(
                        status_code=413,
                        detail=f"ZIP exceeds the {settings.max_zip_uncompressed_mb} MB uncompressed size limit.",
                    )
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Uploaded file is not a readable ZIP archive.")

    threat_findings = scan_upload_threats(data, expected_extension)
    if threat_findings:
        findings_text = ", ".join(threat_findings[:3])
        log_audit_event(
            "upload_blocked_suspicious",
            filename=file.filename or "unknown",
            user_id=user.id if user else None,
            findings=threat_findings,
        )
        raise HTTPException(
            status_code=400,
            detail=f"Upload was blocked because suspicious content was detected: {findings_text}.",
        )


def pdf_response(data: bytes, filename: str):
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


def create_job(
    db: Session,
    *,
    user: User | None,
    operation: str,
    original_filename: str,
    file_size_bytes: int,
    metadata_json: dict | None = None,
) -> Job:
    job = Job(
        user_id=user.id if user else None,
        operation=operation,
        original_filename=original_filename,
        file_size_bytes=file_size_bytes,
        metadata_json=metadata_json,
        status="processing",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    log_audit_event(
        "job_created",
        job_id=job.id,
        user_id=user.id if user else None,
        operation=operation,
        filename=original_filename,
        file_size_bytes=file_size_bytes,
    )
    return job


def complete_job(
    db: Session,
    job: Job | None,
    *,
    output_filename: str | None = None,
    result_size_bytes: int | None = None,
    metadata_json: dict | None = None,
):
    if not job:
        return
    job.status = "completed"
    job.output_filename = output_filename
    job.result_size_bytes = result_size_bytes
    if metadata_json is not None:
        job.metadata_json = metadata_json
    db.add(job)
    db.commit()
    db.refresh(job)
    log_audit_event(
        "job_completed",
        job_id=job.id,
        user_id=job.user_id,
        operation=job.operation,
        output_filename=output_filename,
        result_size_bytes=result_size_bytes,
    )


def fail_job(db: Session, job: Job | None, error_message: str):
    if not job:
        return
    job.status = "failed"
    job.error_message = error_message
    db.add(job)
    db.commit()
    db.refresh(job)
    log_audit_event(
        "job_failed",
        job_id=job.id,
        user_id=job.user_id,
        operation=job.operation,
        error_message=error_message,
    )


def save_job_artifact(job_id: int, output_filename: str, data: bytes) -> str:
    path = build_artifact_path(job_id, output_filename)
    with open(path, "wb") as handle:
        handle.write(data)
    log_audit_event("artifact_saved", job_id=job_id, output_filename=output_filename, path=path, size_bytes=len(data))
    return path


def process_pdf_result(
    *,
    db: Session,
    user: User | None,
    operation: str,
    file: UploadFile,
    data: bytes,
    executor,
    output_filename: str,
    metadata_json: dict | None = None,
):
    validate_upload(file, data, user=user, db=db)
    job = create_job(
        db,
        user=user,
        operation=operation,
        original_filename=file.filename or "upload.pdf",
        file_size_bytes=len(data),
        metadata_json=metadata_json,
    )
    try:
        result = run_pdf_operation(executor)
    except HTTPException as exc:
        fail_job(db, job, exc.detail)
        raise
    save_job_artifact(job.id, output_filename, result)
    complete_job(db, job, output_filename=output_filename, result_size_bytes=len(result), metadata_json=metadata_json)
    return pdf_response(result, output_filename)


def process_json_result(
    *,
    db: Session,
    user: User | None,
    operation: str,
    file: UploadFile,
    data: bytes,
    executor,
    metadata_json: dict | None = None,
):
    validate_upload(file, data, user=user, db=db)
    job = create_job(
        db,
        user=user,
        operation=operation,
        original_filename=file.filename or "upload.pdf",
        file_size_bytes=len(data),
        metadata_json=metadata_json,
    )
    try:
        result = run_pdf_operation(executor)
    except HTTPException as exc:
        fail_job(db, job, exc.detail)
        raise
    final_metadata = result if isinstance(result, dict) else metadata_json
    complete_job(db, job, metadata_json=final_metadata)
    return JSONResponse(result if isinstance(result, dict) else {"message": result})


def run_batch_job_async(job_id: int, zip_data: bytes, operation: str, password: str, watermark_text: str):
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return
        result_zip = run_pdf_operation(
            lambda: service.batch_process(zip_data, operation, password, watermark_text),
            bad_request_message="Failed to process ZIP batch.",
        )
        output_filename = "processed_batch.zip"
        save_job_artifact(job.id, output_filename, result_zip)
        complete_job(
            db,
            job,
            output_filename=output_filename,
            result_size_bytes=len(result_zip),
            metadata_json={**(job.metadata_json or {}), "mode": "async"},
        )
    except HTTPException as exc:
        fail_job(db, job, exc.detail if 'job' in locals() and job else str(exc.detail))
    except Exception as exc:
        fail_job(db, job, str(exc) if 'job' in locals() and job else str(exc))
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok", "version": settings.app_version}


@app.post("/api/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, request: Request, db: Session = Depends(get_db)):
    email = payload.email.lower()
    if get_user_by_email(db, email):
        log_audit_event("register_conflict", email=email, ip=request.client.host if request.client else "unknown")
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = User(
        email=email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.email)
    log_audit_event("register_success", user_id=user.id, email=user.email, ip=request.client.host if request.client else "unknown")
    return TokenResponse(access_token=token, user=user)


@app.post("/api/auth/login", response_model=TokenResponse)
def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)):
    user = authenticate_user(db, payload.email.lower(), payload.password)
    if not user:
        log_audit_event("login_failed", email=payload.email.lower(), ip=request.client.host if request.client else "unknown")
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token(user.email)
    log_audit_event("login_success", user_id=user.id, email=user.email, ip=request.client.host if request.client else "unknown")
    return TokenResponse(access_token=token, user=user)


@app.get("/api/auth/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@app.get("/api/billing/plans", response_model=list[BillingPlanResponse])
def billing_plans(current_user: User | None = Depends(get_optional_user)):
    return get_billing_catalog(current_user.plan if current_user else "free")


@app.post("/api/billing/checkout", response_model=BillingCheckoutResponse)
def create_billing_checkout(
    payload: BillingCheckoutRequest,
    current_user: User = Depends(get_current_user),
):
    require_razorpay_configured()
    plan_id = get_razorpay_plan_id_for_plan(payload.plan)
    if not plan_id:
        raise HTTPException(status_code=503, detail=f"Razorpay plan for the {payload.plan} plan is not configured.")

    session = razorpay_request(
        "POST",
        "/v1/subscriptions",
        {
            "plan_id": plan_id,
            "total_count": 120,
            "customer_notify": 1,
            "notes": {
                "user_email": current_user.email,
                "target_plan": payload.plan,
            },
        },
    )
    checkout_url = session.get("short_url")
    session_id = session.get("id")
    if not checkout_url or not session_id:
        raise HTTPException(status_code=502, detail="Razorpay did not return a usable subscription link.")

    log_audit_event(
        "billing_checkout_created",
        user_id=current_user.id,
        email=current_user.email,
        target_plan=payload.plan,
        session_id=session_id,
    )
    return BillingCheckoutResponse(checkout_url=checkout_url, session_id=session_id)


@app.post("/api/billing/portal", response_model=BillingPortalResponse)
def create_billing_portal(current_user: User = Depends(get_current_user)):
    raise HTTPException(
        status_code=501,
        detail="Razorpay customer self-serve billing portal is not configured. Manage subscriptions from the Razorpay dashboard for now.",
    )


@app.post("/api/billing/webhook")
async def billing_webhook(request: Request, db: Session = Depends(get_db)):
    require_razorpay_configured()
    payload = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")

    if settings.razorpay_webhook_secret:
        expected_signature = hmac.new(
            settings.razorpay_webhook_secret.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected_signature, signature):
            raise HTTPException(status_code=400, detail="Invalid Razorpay webhook signature.")

    try:
        event = json.loads(payload.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid Razorpay webhook payload: {exc}")

    event_type = event.get("event")
    payload_entity = event.get("payload", {})

    def sync_subscription(entity: dict, *, cancelled: bool = False):
        notes = entity.get("notes", {}) or {}
        user_email = (notes.get("user_email") or "").lower()
        matched_plan = get_plan_for_razorpay_plan_id(entity.get("plan_id"))
        if not user_email:
            return
        user = get_user_by_email(db, user_email)
        if not user:
            return
        previous_plan = user.plan
        user.plan = "free" if cancelled else (matched_plan or user.plan)
        db.add(user)
        db.commit()
        db.refresh(user)
        log_audit_event(
            "billing_subscription_synced" if not cancelled else "billing_subscription_cancelled",
            user_id=user.id,
            email=user.email,
            previous_plan=previous_plan,
            new_plan=user.plan,
            event_type=event_type,
            subscription_id=entity.get("id"),
        )

    if event_type in {"subscription.authenticated", "subscription.activated", "subscription.charged"}:
        entity = payload_entity.get("subscription", {}).get("entity", {})
        if entity:
            sync_subscription(entity)

    if event_type in {"subscription.cancelled", "subscription.completed", "subscription.halted"}:
        entity = payload_entity.get("subscription", {}).get("entity", {})
        if entity:
            sync_subscription(entity, cancelled=True)

    return {"received": True}


@app.get("/api/jobs", response_model=list[JobResponse])
def list_jobs(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    safe_limit = max(1, min(limit, 100))
    jobs = (
        db.query(Job)
        .filter(Job.user_id == current_user.id)
        .order_by(Job.created_at.desc())
        .limit(safe_limit)
        .all()
    )
    return jobs


@app.get("/api/jobs/{job_id}", response_model=JobResponse)
def get_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@app.get("/api/jobs/{job_id}/download")
def download_job_artifact(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.status != "completed" or not job.output_filename:
        raise HTTPException(status_code=409, detail="Job output is not available yet.")

    artifact_path = build_artifact_path(job.id, job.output_filename)
    if not os.path.exists(artifact_path):
        raise HTTPException(status_code=404, detail="Stored job output was not found.")

    media_type = "application/zip" if job.output_filename.lower().endswith(".zip") else "application/pdf"
    return FileResponse(
        artifact_path,
        media_type=media_type,
        filename=job.output_filename,
    )


@app.get("/api/admin/stats", response_model=AdminStatsResponse)
def admin_stats(
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    stats = AdminStatsResponse(
        total_users=db.query(User).count(),
        active_users=db.query(User).filter(User.is_active.is_(True)).count(),
        total_jobs=db.query(Job).count(),
        failed_jobs=db.query(Job).filter(Job.status == "failed").count(),
        processing_jobs=db.query(Job).filter(Job.status == "processing").count(),
    )
    log_audit_event("admin_stats_viewed", admin_user_id=admin_user.id)
    return stats


@app.get("/api/admin/users", response_model=list[UserResponse])
def admin_list_users(
    limit: int = 100,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    safe_limit = max(1, min(limit, 500))
    users = db.query(User).order_by(User.created_at.desc()).limit(safe_limit).all()
    log_audit_event("admin_users_listed", admin_user_id=admin_user.id, limit=safe_limit)
    return users


@app.patch("/api/admin/users/{user_id}/plan", response_model=UserResponse)
def admin_update_user_plan(
    user_id: int,
    payload: PlanUpdate,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    previous_plan = user.plan
    user.plan = payload.plan
    db.add(user)
    db.commit()
    db.refresh(user)
    log_audit_event(
        "admin_plan_updated",
        admin_user_id=admin_user.id,
        target_user_id=user.id,
        previous_plan=previous_plan,
        new_plan=user.plan,
    )
    return user


@app.get("/api/admin/jobs", response_model=list[JobResponse])
def admin_list_jobs(
    limit: int = 100,
    status_filter: str | None = None,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    safe_limit = max(1, min(limit, 500))
    query = db.query(Job).order_by(Job.created_at.desc())
    if status_filter:
        query = query.filter(Job.status == status_filter)
    jobs = query.limit(safe_limit).all()
    log_audit_event("admin_jobs_listed", admin_user_id=admin_user.id, limit=safe_limit, status_filter=status_filter)
    return jobs


@app.post("/api/encrypt")
async def encrypt(
    file: UploadFile = File(...),
    password: str = Form(...),
    allow_print: bool = Form(True),
    allow_copy: bool = Form(False),
    allow_annotations: bool = Form(False),
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    data = await file.read()
    return process_pdf_result(
        db=db,
        user=current_user,
        operation="encrypt",
        file=file,
        data=data,
        executor=lambda: service.encrypt(data, password, allow_print, allow_copy, allow_annotations),
        output_filename=f"encrypted_{file.filename}",
        metadata_json={
            "allow_print": allow_print,
            "allow_copy": allow_copy,
            "allow_annotations": allow_annotations,
        },
    )


@app.post("/api/decrypt")
async def decrypt(
    file: UploadFile = File(...),
    password: str = Form(...),
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    data = await file.read()
    return process_pdf_result(
        db=db,
        user=current_user,
        operation="decrypt",
        file=file,
        data=data,
        executor=lambda: service.decrypt(data, password),
        output_filename=f"decrypted_{file.filename}",
    )


@app.post("/api/watermark")
async def watermark(
    file: UploadFile = File(...),
    text: str = Form(...),
    opacity: float = Form(0.3),
    position: str = Form("diagonal"),
    font_size: int = Form(48),
    color: str = Form("red"),
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    data = await file.read()
    return process_pdf_result(
        db=db,
        user=current_user,
        operation="watermark",
        file=file,
        data=data,
        executor=lambda: service.watermark(data, text, opacity, position, font_size, color),
        output_filename=f"watermarked_{file.filename}",
        metadata_json={"text": text, "opacity": opacity, "position": position, "font_size": font_size, "color": color},
    )


@app.post("/api/remove-metadata")
async def remove_metadata(
    file: UploadFile = File(...),
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    data = await file.read()
    return process_pdf_result(
        db=db,
        user=current_user,
        operation="remove_metadata",
        file=file,
        data=data,
        executor=lambda: service.remove_metadata(data),
        output_filename=f"clean_{file.filename}",
    )


@app.post("/api/redact")
async def redact(
    file: UploadFile = File(...),
    patterns: str = Form(...),
    custom_pattern: str = Form(""),
    redact_color: str = Form("black"),
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    data = await file.read()
    pattern_list = [p.strip() for p in patterns.split(",") if p.strip()]
    return process_pdf_result(
        db=db,
        user=current_user,
        operation="redact",
        file=file,
        data=data,
        executor=lambda: service.smart_redact(data, pattern_list, custom_pattern, redact_color),
        output_filename=f"redacted_{file.filename}",
        metadata_json={"patterns": pattern_list, "custom_pattern": custom_pattern, "redact_color": redact_color},
    )


@app.post("/api/permissions")
async def set_permissions(
    file: UploadFile = File(...),
    owner_password: str = Form(...),
    allow_print: bool = Form(False),
    allow_print_hq: bool = Form(False),
    allow_copy: bool = Form(False),
    allow_modify: bool = Form(False),
    allow_annotations: bool = Form(False),
    allow_forms: bool = Form(False),
    allow_assembly: bool = Form(False),
    allow_accessibility: bool = Form(True),
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    data = await file.read()
    perms = {
        "print": allow_print,
        "print_hq": allow_print_hq,
        "copy": allow_copy,
        "modify": allow_modify,
        "annotations": allow_annotations,
        "forms": allow_forms,
        "assembly": allow_assembly,
        "accessibility": allow_accessibility,
    }
    return process_pdf_result(
        db=db,
        user=current_user,
        operation="permissions",
        file=file,
        data=data,
        executor=lambda: service.set_permissions(data, owner_password, perms),
        output_filename=f"permissions_{file.filename}",
        metadata_json=perms,
    )


@app.post("/api/scan")
async def scan(
    file: UploadFile = File(...),
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    data = await file.read()
    return process_json_result(
        db=db,
        user=current_user,
        operation="scan",
        file=file,
        data=data,
        executor=lambda: service.security_scan(data),
    )


@app.post("/api/stego/hide")
async def stego_hide(
    file: UploadFile = File(...),
    message: str = Form(...),
    key: str = Form(...),
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    data = await file.read()
    return process_pdf_result(
        db=db,
        user=current_user,
        operation="stego_hide",
        file=file,
        data=data,
        executor=lambda: service.stego_hide(data, message, key),
        output_filename=f"stego_{file.filename}",
        metadata_json={"message_length": len(message)},
    )


@app.post("/api/stego/reveal")
async def stego_reveal(
    file: UploadFile = File(...),
    key: str = Form(...),
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    data = await file.read()
    return process_json_result(
        db=db,
        user=current_user,
        operation="stego_reveal",
        file=file,
        data=data,
        executor=lambda: {"message": service.stego_reveal(data, key)},
    )


@app.post("/api/compress")
async def compress(
    file: UploadFile = File(...),
    quality: int = Form(75),
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    data = await file.read()
    validate_upload(file, data, user=current_user, db=db)
    job = create_job(
        db,
        user=current_user,
        operation="compress",
        original_filename=file.filename or "upload.pdf",
        file_size_bytes=len(data),
        metadata_json={"quality": quality},
    )
    try:
        result, stats = run_pdf_operation(lambda: service.compress(data, quality), bad_request_message="Failed to compress PDF.")
    except HTTPException as exc:
        fail_job(db, job, exc.detail)
        raise
    save_job_artifact(job.id, f"compressed_{file.filename}", result)
    complete_job(
        db,
        job,
        output_filename=f"compressed_{file.filename}",
        result_size_bytes=len(result),
        metadata_json={**stats, "quality": quality},
    )
    return StreamingResponse(
        io.BytesIO(result),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=compressed_{file.filename}",
            "X-Original-Size": str(stats["original"]),
            "X-Compressed-Size": str(stats["compressed"]),
            "X-Reduction-Pct": str(stats["reduction_pct"]),
            "Access-Control-Expose-Headers": "Content-Disposition,X-Original-Size,X-Compressed-Size,X-Reduction-Pct",
        },
    )


@app.post("/api/batch")
async def batch(
    file: UploadFile = File(...),
    operation: str = Form(...),
    password: str = Form(""),
    watermark_text: str = Form("CONFIDENTIAL"),
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    zip_data = await file.read()
    validate_upload(file, zip_data, expected_extension=".zip", user=current_user, db=db)
    job = create_job(
        db,
        user=current_user,
        operation="batch",
        original_filename=file.filename or "batch.zip",
        file_size_bytes=len(zip_data),
        metadata_json={"operation": operation},
    )
    try:
        result_zip = run_pdf_operation(
            lambda: service.batch_process(zip_data, operation, password, watermark_text),
            bad_request_message="Failed to process ZIP batch.",
        )
    except HTTPException as exc:
        fail_job(db, job, exc.detail)
        raise
    save_job_artifact(job.id, "processed_batch.zip", result_zip)
    complete_job(
        db,
        job,
        output_filename="processed_batch.zip",
        result_size_bytes=len(result_zip),
        metadata_json={"operation": operation, "watermark_text": watermark_text if operation == "watermark" else None},
    )
    return StreamingResponse(
        io.BytesIO(result_zip),
        media_type="application/zip",
        headers={
            "Content-Disposition": "attachment; filename=processed_batch.zip",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@app.post("/api/batch/async", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def batch_async(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    operation: str = Form(...),
    password: str = Form(""),
    watermark_text: str = Form("CONFIDENTIAL"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    zip_data = await file.read()
    validate_upload(file, zip_data, expected_extension=".zip", user=current_user, db=db)
    job = create_job(
        db,
        user=current_user,
        operation="batch_async",
        original_filename=file.filename or "batch.zip",
        file_size_bytes=len(zip_data),
        metadata_json={"operation": operation, "mode": "async"},
    )
    background_tasks.add_task(run_batch_job_async, job.id, zip_data, operation, password, watermark_text)
    return job
