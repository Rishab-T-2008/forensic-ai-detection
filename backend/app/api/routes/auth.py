from __future__ import annotations

import hashlib
import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.security_middleware import rate_limiter

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data"
USERS_FILE = DATA_DIR / "users.json"


class UserSignupRequest(BaseModel):
    email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=120)
    password: str = Field(..., min_length=6, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=100)
    organization: str = Field(default="Forensic Investigation Unit", max_length=100)


class UserLoginRequest(BaseModel):
    email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=120)
    password: str = Field(..., min_length=1, max_length=128)


class UserProfile(BaseModel):
    id: str
    email: str
    full_name: str
    organization: str
    tier: str = "Senior Analyst"
    scans_remaining: int = 500
    created_at: str


class AuthResponse(BaseModel):
    token: str
    user: UserProfile


def _hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_bytes(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return salt.hex(), hashed.hex()


def _verify_password(password: str, salt_hex: str, hash_hex: str) -> bool:
    salt = bytes.fromhex(salt_hex)
    _, calculated_hash = _hash_password(password, salt)
    return secrets.compare_digest(calculated_hash, hash_hex)


class UserStore:
    def __init__(self) -> None:
        self._users: Dict[str, dict] = {}
        self._tokens: Dict[str, str] = {}  # token -> email
        self._load()

    def _load(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        if USERS_FILE.exists():
            try:
                with open(USERS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._users = data.get("users", {})
            except Exception:
                self._users = {}
        else:
            # Seed default demo account for instant testing
            salt_hex, hash_hex = _hash_password("password123")
            demo_email = "analyst@forensics.org"
            self._users[demo_email] = {
                "id": "usr_demo_101",
                "email": demo_email,
                "full_name": "Dr. Sarah Chen",
                "organization": "National Forensic Digital Lab",
                "tier": "Principal Forensics Examiner",
                "scans_remaining": 999,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "salt": salt_hex,
                "hash": hash_hex,
            }
            self._save()

    def _save(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        tmp_file = USERS_FILE.with_suffix(".tmp")
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump({"users": self._users}, f, indent=2)
        tmp_file.replace(USERS_FILE)

    def signup(self, req: UserSignupRequest) -> AuthResponse:
        email = req.email.lower().strip()
        if email in self._users:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email address already exists.",
            )

        salt_hex, hash_hex = _hash_password(req.password)
        user_id = f"usr_{secrets.token_hex(6)}"
        created_at = datetime.now(timezone.utc).isoformat()

        user_data = {
            "id": user_id,
            "email": email,
            "full_name": req.full_name.strip(),
            "organization": req.organization.strip() or "Independent Forensic Lab",
            "tier": "Senior Forensic Analyst",
            "scans_remaining": 500,
            "created_at": created_at,
            "salt": salt_hex,
            "hash": hash_hex,
        }
        self._users[email] = user_data
        self._save()

        token = f"son_auth_{secrets.token_urlsafe(32)}"
        self._tokens[token] = email

        profile = UserProfile(
            id=user_id,
            email=email,
            full_name=user_data["full_name"],
            organization=user_data["organization"],
            tier=user_data["tier"],
            scans_remaining=user_data["scans_remaining"],
            created_at=created_at,
        )
        return AuthResponse(token=token, user=profile)

    def login(self, req: UserLoginRequest, ip: str = "127.0.0.1") -> AuthResponse:
        email = req.email.lower().strip()
        user_data = self._users.get(email)
        if not user_data or not _verify_password(req.password, user_data["salt"], user_data["hash"]):
            rate_limiter.record_auth_failure(ip)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )

        rate_limiter.record_auth_success(ip)
        token = f"son_auth_{secrets.token_urlsafe(32)}"
        self._tokens[token] = email

        profile = UserProfile(
            id=user_data["id"],
            email=email,
            full_name=user_data["full_name"],
            organization=user_data["organization"],
            tier=user_data.get("tier", "Senior Forensic Analyst"),
            scans_remaining=user_data.get("scans_remaining", 500),
            created_at=user_data["created_at"],
        )
        return AuthResponse(token=token, user=profile)

    def get_current_user(self, token: str | None) -> UserProfile:
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token missing.",
            )
        clean_token = token.replace("Bearer ", "").strip()
        email = self._tokens.get(clean_token)
        if not email or email not in self._users:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired or invalid token.",
            )
        u = self._users[email]
        return UserProfile(
            id=u["id"],
            email=email,
            full_name=u["full_name"],
            organization=u["organization"],
            tier=u.get("tier", "Senior Forensic Analyst"),
            scans_remaining=u.get("scans_remaining", 500),
            created_at=u["created_at"],
        )


store = UserStore()


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(request: UserSignupRequest) -> AuthResponse:
    return store.signup(request)


@router.post("/login", response_model=AuthResponse)
def login(request: UserLoginRequest, http_req: Request) -> AuthResponse:
    ip = rate_limiter.get_client_ip(http_req)
    return store.login(request, ip=ip)


@router.get("/me", response_model=UserProfile)
def get_me(authorization: str | None = Header(default=None)) -> UserProfile:
    return store.get_current_user(authorization)
