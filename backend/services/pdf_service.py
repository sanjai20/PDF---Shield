import io
import re
import base64
import hashlib
import zipfile
import os
from typing import Dict, List, Tuple, Optional
import pikepdf
import fitz  # PyMuPDF


PATTERN_REGEXES = {
    "email":      r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
    "phone":      r"(\+?\d[\d\s\-().]{7,}\d)",
    "ssn":        r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b",
    "creditcard": r"\b(?:\d[ -]?){13,16}\b",
    "ipaddress":  r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
    "url":        r"https?://[^\s<>\"']+",
}

COLOR_MAP = {
    "red":   (1, 0, 0),
    "gray":  (0.5, 0.5, 0.5),
    "blue":  (0, 0.2, 0.8),
    "black": (0, 0, 0),
}

class PDFService:

    # ── Encrypt ───────────────────────────────────────────────────────────────
    def encrypt(self, data: bytes, password: str, allow_print=True,
                allow_copy=False, allow_annotations=False) -> bytes:
        with pikepdf.open(io.BytesIO(data)) as pdf:
            perms = pikepdf.Permissions(
                print_lowres=allow_print,
                print_highres=allow_print,
                extract=allow_copy,
                modify_annotation=allow_annotations,
            )
            enc = pikepdf.Encryption(user=password, owner=password, R=6, allow=perms)
            out = io.BytesIO()
            pdf.save(out, encryption=enc)
        return out.getvalue()

    # ── Decrypt ───────────────────────────────────────────────────────────────
    def decrypt(self, data: bytes, password: str) -> bytes:
        try:
            with pikepdf.open(io.BytesIO(data)) as probe_pdf:
                if not probe_pdf.is_encrypted:
                    raise ValueError("This PDF is not encrypted.")
            with pikepdf.open(io.BytesIO(data), password=password) as pdf:
                out = io.BytesIO()
                pdf.save(out)
            return out.getvalue()
        except pikepdf.PasswordError:
            raise ValueError("Incorrect password.")

    # ── Watermark ─────────────────────────────────────────────────────────────
    def watermark(self, data: bytes, text: str, opacity: float = 0.3,
                  position: str = "diagonal", font_size: int = 48,
                  color: str = "red") -> bytes:
        doc = fitz.open(stream=data, filetype="pdf")
        if position not in {"diagonal", "center", "top", "bottom"}:
            doc.close()
            raise ValueError("Unsupported watermark position.")
        opacity = max(0.05, min(opacity, 1.0))
        base_rgb = COLOR_MAP.get(color, (1, 0, 0))
        # Approximate opacity by blending the text color toward white.
        rgb = tuple(1 - opacity * (1 - channel) for channel in base_rgb)
        for page in doc:
            w, h = page.rect.width, page.rect.height

            if position == "diagonal":
                # Tiled diagonal watermarks across page
                for row in range(-1, 4):
                    for col in range(-1, 3):
                        x = col * w / 2 + w / 6
                        y = row * h / 2 + h / 4
                        page.insert_text(
                            (x, y), text,
                            fontsize=font_size,
                            color=rgb,
                            rotate=45,
                            overlay=True,
                        )
            elif position == "center":
                page.insert_text(
                    (w / 2 - len(text) * font_size * 0.3, h / 2),
                    text, fontsize=font_size * 2, color=rgb, overlay=True
                )
            elif position == "top":
                page.insert_text(
                    (w / 2 - len(text) * font_size * 0.3, 40),
                    text, fontsize=font_size, color=rgb, overlay=True
                )
            elif position == "bottom":
                page.insert_text(
                    (w / 2 - len(text) * font_size * 0.3, h - 20),
                    text, fontsize=font_size, color=rgb, overlay=True
                )

        out = io.BytesIO()
        doc.save(out)
        doc.close()
        return out.getvalue()

    # ── Remove Metadata ───────────────────────────────────────────────────────
    def remove_metadata(self, data: bytes) -> bytes:
        with pikepdf.open(io.BytesIO(data)) as pdf:
            fields = ['/Title', '/Author', '/Subject', '/Keywords',
                      '/Creator', '/Producer', '/CreationDate', '/ModDate']
            for f in fields:
                if f in pdf.docinfo:
                    del pdf.docinfo[f]
            if '/Metadata' in pdf.Root:
                del pdf.Root['/Metadata']
            out = io.BytesIO()
            pdf.save(out)
        return out.getvalue()

    # ── Smart Redactor ────────────────────────────────────────────────────────
    def smart_redact(self, data: bytes, patterns: List[str],
                     custom_pattern: str = "", redact_color: str = "black") -> bytes:
        doc = fitz.open(stream=data, filetype="pdf")
        fill = (0, 0, 0) if redact_color == "black" else (1, 1, 1)

        # Build combined pattern
        active = []
        for p in patterns:
            if p in PATTERN_REGEXES:
                active.append(PATTERN_REGEXES[p])
        if custom_pattern.strip():
            active.append(custom_pattern.strip())

        if not active:
            doc.close()
            return data

        combined = re.compile("|".join(f"({r})" for r in active), re.IGNORECASE)

        total_redacted = 0
        for page in doc:
            page_redactions = 0
            text = page.get_text("text")
            matches = list(combined.finditer(text))
            for match in matches:
                matched_text = match.group(0)
                # Search for all quads of the matched text on this page
                areas = page.search_for(matched_text)
                for rect in areas:
                    page.add_redact_annot(rect, fill=fill)
                    total_redacted += 1
                    page_redactions += 1
            if page_redactions > 0:
                page.apply_redactions()

        out = io.BytesIO()
        doc.save(out)
        doc.close()
        return out.getvalue()

    # ── Permission Matrix ─────────────────────────────────────────────────────
    def set_permissions(self, data: bytes, owner_password: str,
                        perms: Dict[str, bool]) -> bytes:
        if not owner_password.strip():
            raise ValueError("Owner password is required.")
        with pikepdf.open(io.BytesIO(data)) as pdf:
            permission_obj = pikepdf.Permissions(
                print_lowres=perms.get("print", False),
                print_highres=perms.get("print_hq", False),
                extract=perms.get("copy", False),
                modify_other=perms.get("modify", False),
                modify_annotation=perms.get("annotations", False),
                modify_form=perms.get("forms", False),
                modify_assembly=perms.get("assembly", False),
                accessibility=perms.get("accessibility", True),
            )
            enc = pikepdf.Encryption(
                user="",  # No user password — anyone can open
                owner=owner_password,
                R=6,
                allow=permission_obj,
            )
            out = io.BytesIO()
            pdf.save(out, encryption=enc)
        return out.getvalue()

    # ── Security Scanner ──────────────────────────────────────────────────────
    def security_scan(self, data: bytes) -> Dict:
        report = {
            "encrypted": False,
            "encryption_level": None,
            "has_javascript": False,
            "javascript_count": 0,
            "external_links": [],
            "embedded_files": [],
            "form_fields": [],
            "has_digital_signatures": False,
            "metadata": {},
            "page_count": 0,
            "file_size_kb": round(len(data) / 1024, 2),
            "risk_score": 0,
            "risk_level": "Low",
            "findings": [],
            "summary": "",
            "recommendations": [],
            "document_properties": {
                "title": None,
                "author": None,
                "creator": None,
                "producer": None,
                "creation_date": None,
                "modification_date": None,
            },
            "counts": {
                "external_links": 0,
                "embedded_files": 0,
                "form_fields": 0,
                "metadata_fields": 0,
                "pages": 0,
            },
            "suspicious_text_hits": [],
        }

        # Check encryption via pikepdf
        try:
            with pikepdf.open(io.BytesIO(data)) as pdf:
                report["encrypted"] = False
                report["page_count"] = len(pdf.pages)

                # Metadata
                for key in ['/Title', '/Author', '/Creator', '/Producer',
                            '/CreationDate', '/ModDate']:
                    if key in pdf.docinfo:
                        clean_key = key.lstrip('/')
                        clean_value = str(pdf.docinfo[key])
                        report["metadata"][clean_key] = clean_value
                        mapping = {
                            "Title": "title",
                            "Author": "author",
                            "Creator": "creator",
                            "Producer": "producer",
                            "CreationDate": "creation_date",
                            "ModDate": "modification_date",
                        }
                        if clean_key in mapping:
                            report["document_properties"][mapping[clean_key]] = clean_value

                # Check for embedded files
                if '/Names' in pdf.Root:
                    names = pdf.Root['/Names']
                    if '/EmbeddedFiles' in names:
                        report["embedded_files"].append("Embedded file attachments detected")
                        report["risk_score"] += 20
                        report["findings"].append({
                            "severity": "medium",
                            "type": "Embedded Files",
                            "detail": "PDF contains embedded file attachments which may carry malware."
                        })

                # Check for JavaScript actions
                def scan_obj(obj, depth=0):
                    if depth > 10:
                        return
                    if isinstance(obj, pikepdf.Dictionary):
                        if '/JS' in obj or '/JavaScript' in obj:
                            report["has_javascript"] = True
                            report["javascript_count"] += 1
                        if obj.get('/FT') == '/Sig' or obj.get('/Type') == '/Sig':
                            report["has_digital_signatures"] = True
                        for v in obj.values():
                            scan_obj(v, depth + 1)
                    elif isinstance(obj, pikepdf.Array):
                        for item in obj:
                            scan_obj(item, depth + 1)

                scan_obj(pdf.Root)

        except pikepdf.PasswordError:
            report["encrypted"] = True
            report["encryption_level"] = "Password protected"
            report["findings"].append({
                "severity": "info",
                "type": "Encrypted",
                "detail": "PDF is password-protected."
            })

        # Deep scan with PyMuPDF
        try:
            doc = fitz.open(stream=data, filetype="pdf")
            report["page_count"] = len(doc)

            for page in doc:
                # Extract external links
                for link in page.get_links():
                    uri = link.get("uri", "")
                    if uri and uri not in report["external_links"]:
                        report["external_links"].append(uri)

                # Check for form fields
                for widget in page.widgets() if hasattr(page, 'widgets') else []:
                    report["form_fields"].append(widget.field_name or "unnamed")

                suspicious_patterns = ['eval(', 'unescape(', 'app.alert', 'this.submitForm',
                                       'app.launchURL', 'app.openDoc', 'util.printf', '/JS', '/JavaScript']
                page_text = page.get_text()
                for pat in suspicious_patterns:
                    if pat.lower() in page_text.lower() and pat not in report["suspicious_text_hits"]:
                        report["suspicious_text_hits"].append(pat)

            # Check JS in PyMuPDF
            for i in range(len(doc)):
                page = doc[i]
                text = page.get_text()
                js_patterns = ['eval(', 'unescape(', 'app.alert', 'this.submitForm',
                               'app.launchURL', 'app.openDoc', 'util.printf']
                for pat in js_patterns:
                    if pat.lower() in text.lower():
                        report["has_javascript"] = True
                        report["javascript_count"] += 1

            doc.close()
        except Exception:
            pass

        # Score and risk level
        if report["has_javascript"]:
            report["risk_score"] += 40
            report["findings"].append({
                "severity": "high",
                "type": "JavaScript Detected",
                "detail": f"Found {report['javascript_count']} JavaScript block(s). JS in PDFs is a common malware vector."
            })
        if len(report["external_links"]) > 10:
            report["risk_score"] += 15
            report["findings"].append({
                "severity": "medium",
                "type": "Many External Links",
                "detail": f"PDF contains {len(report['external_links'])} external URLs — review for phishing."
            })
        elif len(report["external_links"]) > 0:
            report["findings"].append({
                "severity": "low",
                "type": "External Links",
                "detail": f"{len(report['external_links'])} external link(s) found."
            })
        if report["form_fields"]:
            report["findings"].append({
                "severity": "info",
                "type": "Interactive Form",
                "detail": f"PDF contains {len(report['form_fields'])} form field(s)."
            })
        if report["has_digital_signatures"]:
            report["findings"].append({
                "severity": "info",
                "type": "Digital Signatures",
                "detail": "PDF contains at least one digital signature field."
            })

        score = report["risk_score"]
        report["risk_level"] = "Critical" if score >= 60 else "High" if score >= 40 else "Medium" if score >= 20 else "Low"

        report["counts"] = {
            "external_links": len(report["external_links"]),
            "embedded_files": len(report["embedded_files"]),
            "form_fields": len(report["form_fields"]),
            "metadata_fields": len(report["metadata"]),
            "pages": report["page_count"],
        }

        if report["risk_level"] in {"High", "Critical"}:
            report["recommendations"].append("Do not trust this PDF until it has been reviewed in a sandboxed environment.")
        if report["has_javascript"]:
            report["recommendations"].append("Disable or strip JavaScript before sharing this document.")
        if report["embedded_files"]:
            report["recommendations"].append("Inspect embedded attachments individually before opening them.")
        if report["external_links"]:
            report["recommendations"].append("Validate all external URLs to reduce phishing risk.")
        if report["metadata"]:
            report["recommendations"].append("Remove metadata before external distribution if privacy matters.")
        if not report["recommendations"]:
            report["recommendations"].append("No major security indicators were found, but standard document hygiene is still recommended.")

        report["summary"] = (
            f"Risk level {report['risk_level']} with score {report['risk_score']}. "
            f"Pages: {report['page_count']}, links: {len(report['external_links'])}, "
            f"forms: {len(report['form_fields'])}, embedded files: {len(report['embedded_files'])}, "
            f"JavaScript blocks: {report['javascript_count']}."
        )

        return report

    # ── Steganography (metadata-based) ───────────────────────────────────────
    def stego_hide(self, data: bytes, message: str, key: str) -> bytes:
        h = hashlib.sha256(key.encode()).hexdigest()[:16]
        encoded = base64.b64encode(message.encode()).decode()
        payload = f"{h}:{encoded}"

        with pikepdf.open(io.BytesIO(data)) as pdf:
            pdf.docinfo["/X-PDFShield-Stego"] = payload
            out = io.BytesIO()
            pdf.save(out)
        return out.getvalue()

    def stego_reveal(self, data: bytes, key: str) -> Optional[str]:
        h = hashlib.sha256(key.encode()).hexdigest()[:16]
        try:
            with pikepdf.open(io.BytesIO(data)) as pdf:
                payload = str(pdf.docinfo.get("/X-PDFShield-Stego", ""))
                if not payload or ":" not in payload:
                    return None
                stored_hash, encoded = payload.split(":", 1)
                if stored_hash != h:
                    return None
                return base64.b64decode(encoded.encode()).decode()
        except Exception:
            return None

    # ── Compress ──────────────────────────────────────────────────────────────
    def compress(self, data: bytes, quality: int = 75) -> Tuple[bytes, Dict]:
        original_size = len(data)
        doc = fitz.open(stream=data, filetype="pdf")
        out = io.BytesIO()

        # Rewrite with garbage collection and deflate compression
        doc.save(
            out,
            garbage=4,
            deflate=True,
            deflate_images=True,
            deflate_fonts=True,
        )
        doc.close()

        compressed = out.getvalue()
        compressed_size = len(compressed)
        reduction = round((1 - compressed_size / original_size) * 100, 1)

        return compressed, {
            "original": original_size,
            "compressed": compressed_size,
            "reduction_pct": max(0, reduction),
        }

    # ── Batch ZIP ─────────────────────────────────────────────────────────────
    def batch_process(self, zip_data: bytes, operation: str,
                      password: str = "", watermark_text: str = "CONFIDENTIAL") -> bytes:
        in_zip = zipfile.ZipFile(io.BytesIO(zip_data))
        out_buf = io.BytesIO()
        valid_operations = {"encrypt", "decrypt", "watermark", "remove_metadata", "compress"}
        if operation not in valid_operations:
            raise ValueError("Unsupported batch operation.")
        if operation in {"encrypt", "decrypt"} and not password:
            raise ValueError("Password is required for batch encrypt/decrypt.")
        pdf_names = [name for name in in_zip.namelist() if name.lower().endswith(".pdf")]
        if not pdf_names:
            raise ValueError("ZIP file does not contain any PDFs.")

        with zipfile.ZipFile(out_buf, "w", zipfile.ZIP_DEFLATED) as out_zip:
            for name in pdf_names:
                safe_name = os.path.basename(name.replace("\\", "/")) or "document.pdf"
                pdf_data = in_zip.read(name)
                try:
                    if operation == "encrypt":
                        result = self.encrypt(pdf_data, password)
                        out_name = f"encrypted_{safe_name}"
                    elif operation == "decrypt":
                        result = self.decrypt(pdf_data, password)
                        out_name = f"decrypted_{safe_name}"
                    elif operation == "watermark":
                        result = self.watermark(pdf_data, watermark_text)
                        out_name = f"watermarked_{safe_name}"
                    elif operation == "remove_metadata":
                        result = self.remove_metadata(pdf_data)
                        out_name = f"clean_{safe_name}"
                    elif operation == "compress":
                        result, _ = self.compress(pdf_data)
                        out_name = f"compressed_{safe_name}"
                    out_zip.writestr(out_name, result)
                except Exception as e:
                    out_zip.writestr(f"ERROR_{safe_name}.txt", str(e))

        return out_buf.getvalue()
