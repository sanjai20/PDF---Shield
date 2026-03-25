import os
from functools import lru_cache


class Settings:
    def __init__(self):
        self.app_name = os.getenv("APP_NAME", "PDF Shield API")
        self.app_version = os.getenv("APP_VERSION", "1.1.0")
        self.database_url = os.getenv("DATABASE_URL", "sqlite:///./data/pdf_shield.db")
        self.jwt_secret = os.getenv("JWT_SECRET", "change-me-in-production")
        self.jwt_algorithm = os.getenv("JWT_ALGORITHM", "HS256")
        self.access_token_expire_minutes = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120"))
        self.max_upload_mb = int(os.getenv("MAX_UPLOAD_MB", "25"))
        self.max_pdf_pages = int(os.getenv("MAX_PDF_PAGES", "250"))
        self.max_zip_entries = int(os.getenv("MAX_ZIP_ENTRIES", "50"))
        self.max_zip_uncompressed_mb = int(os.getenv("MAX_ZIP_UNCOMPRESSED_MB", "100"))
        self.rate_limit_per_minute = int(os.getenv("RATE_LIMIT_PER_MINUTE", "120"))
        self.auth_rate_limit_per_minute = int(os.getenv("AUTH_RATE_LIMIT_PER_MINUTE", "20"))
        self.job_storage_dir = os.getenv("JOB_STORAGE_DIR", "./data/job_artifacts")
        self.job_retention_hours = int(os.getenv("JOB_RETENTION_HOURS", "24"))
        self.free_daily_jobs = int(os.getenv("FREE_DAILY_JOBS", "50"))
        self.pro_daily_jobs = int(os.getenv("PRO_DAILY_JOBS", "500"))
        self.business_daily_jobs = int(os.getenv("BUSINESS_DAILY_JOBS", "5000"))
        self.free_batch_entries = int(os.getenv("FREE_BATCH_ENTRIES", "25"))
        self.pro_batch_entries = int(os.getenv("PRO_BATCH_ENTRIES", "100"))
        self.business_batch_entries = int(os.getenv("BUSINESS_BATCH_ENTRIES", "250"))
        admin_emails = os.getenv("ADMIN_EMAILS", "admin@example.com")
        self.admin_emails = {email.strip().lower() for email in admin_emails.split(",") if email.strip()}
        self.app_base_url = os.getenv("APP_BASE_URL", "http://localhost:3000")
        self.razorpay_key_id = os.getenv("RAZORPAY_KEY_ID", "")
        self.razorpay_key_secret = os.getenv("RAZORPAY_KEY_SECRET", "")
        self.razorpay_webhook_secret = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
        self.razorpay_plan_pro = os.getenv("RAZORPAY_PLAN_PRO", "")
        self.razorpay_plan_business = os.getenv("RAZORPAY_PLAN_BUSINESS", "")
        cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
        self.cors_origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
