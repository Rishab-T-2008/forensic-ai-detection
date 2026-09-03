import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.api.routes.auth import router as auth_router
from app.api.routes.detect import router as detect_router
from app.core.billing_guard import billing_guard
from app.core.config import get_settings
from app.core.security_middleware import SecurityHeadersMiddleware

settings = get_settings()
app = FastAPI(title="AI Forensics & Detection Suite", version="1.0.0")

# Security headers and rate limiting middleware
app.add_middleware(SecurityHeadersMiddleware)

# Flexible CORS control for local dev, custom origins, and LAN access
allowed_origins = list({
    settings.frontend_origin,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://0.0.0.0:3000",
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(detect_router)
app.include_router(auth_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "security": "hardened", "billing_protection": "active"}


@app.get("/download-pdf")
def download_pdf():
    """Direct one-click download endpoint for the Codebase File Navigation Guide PDF."""
    from fastapi import HTTPException
    from pathlib import Path

    base_dir = Path(__file__).resolve().parent.parent.parent
    candidate_paths = [
        base_dir / "Project_Codebase_File_Guide.pdf",
        base_dir.parent / "Project_Codebase_File_Guide.pdf",
        Path("/Users/rishabt/Documents/1/ai-detector/Project_Codebase_File_Guide.pdf"),
    ]

    for p in candidate_paths:
        if p.is_file():
            return FileResponse(
                str(p.resolve()),
                media_type="application/pdf",
                filename="Project_Codebase_File_Guide.pdf",
            )
    raise HTTPException(status_code=404, detail="File guide PDF not found.")


@app.get("/api/v1/billing/status")
def billing_status():
    """Transparent cloud budget, rate limit, and zero-cost caching telemetry."""
    return billing_guard.get_status()