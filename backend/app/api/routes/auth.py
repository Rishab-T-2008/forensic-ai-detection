from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import threading
import time
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


class OAuthLoginRequest(BaseModel):
    provider: str = Field(..., pattern=r"^(google|apple|x|twitter)$")
    provider_id: str | None = Field(default=None, max_length=200)
    email: str | None = Field(default=None, max_length=120)
    full_name: str | None = Field(default=None, max_length=100)
    avatar_url: str | None = Field(default=None, max_length=500)
    id_token: str | None = Field(default=None, max_length=2000)


class PhoneSendOtpRequest(BaseModel):
    phone_number: str = Field(..., min_length=7, max_length=25)


class PhoneVerifyOtpRequest(BaseModel):
    phone_number: str = Field(..., min_length=7, max_length=25)
    otp_code: str = Field(..., min_length=4, max_length=8)
    full_name: str | None = Field(default=None, max_length=100)


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


# Constant dummy hash used to neutralize timing attacks when an email does not exist
_DUMMY_SALT = "00" * 16
_DUMMY_HASH = hashlib.pbkdf2_hmac("sha256", b"dummy_password_timing_defense", bytes.fromhex(_DUMMY_SALT), 100_000).hex()
TOKEN_TTL_SECONDS = 7 * 86400  # 7 days


class UserStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._users: Dict[str, dict] = {}
        self._tokens: Dict[str, tuple[str, float]] = {}  # token -> (email, expires_at)
        self._phone_otps: Dict[str, tuple[str, str, float]] = {}  # phone -> (hash, salt, expires_at)
        self._load()

    def _load(self) -> None:
        with self._lock:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            if USERS_FILE.exists():
                try:
                    with open(USERS_FILE, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        self._users = data.get("users", {})
                except Exception:
                    self._users = {}
            else:
                # Seed default demo account for instant testing if not configured
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
                self._save_locked()

    def _save_locked(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        tmp_file = USERS_FILE.with_suffix(".tmp")
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump({"users": self._users}, f, indent=2)
        tmp_file.replace(USERS_FILE)

    def _prune_expired_tokens(self, now: float) -> None:
        self._tokens = {k: v for k, v in self._tokens.items() if v[1] > now}
        self._phone_otps = {k: v for k, v in self._phone_otps.items() if v[2] > now}

    def signup(self, req: UserSignupRequest) -> AuthResponse:
        email = req.email.lower().strip()
        with self._lock:
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
                "auth_provider": "email",
            }
            self._users[email] = user_data
            self._save_locked()

            token = f"son_auth_{secrets.token_urlsafe(32)}"
            now = time.time()
            self._prune_expired_tokens(now)
            self._tokens[token] = (email, now + TOKEN_TTL_SECONDS)

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
        with self._lock:
            user = self._users.get(email)
            if not user:
                # Constant-time dummy check to prevent timing attack enumeration
                _verify_password(req.password, _DUMMY_SALT, _DUMMY_HASH)
                rate_limiter.record_auth_failure(ip)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials. Please verify your email and password.",
                )

            if not _verify_password(req.password, user["salt"], user["hash"]):
                rate_limiter.record_auth_failure(ip)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials. Please verify your email and password.",
                )

            rate_limiter.record_auth_success(ip)

            token = f"son_auth_{secrets.token_urlsafe(32)}"
            now = time.time()
            self._prune_expired_tokens(now)
            self._tokens[token] = (email, now + TOKEN_TTL_SECONDS)

            profile = UserProfile(
                id=user["id"],
                email=email,
                full_name=user["full_name"],
                organization=user["organization"],
                tier=user.get("tier", "Senior Forensic Analyst"),
                scans_remaining=user.get("scans_remaining", 500),
                created_at=user["created_at"],
            )
            return AuthResponse(token=token, user=profile)

    def oauth_login(self, req: OAuthLoginRequest) -> AuthResponse:
        provider = req.provider.lower().strip()
        if provider == "twitter":
            provider = "x"

        # Deterministic identifier
        if req.email:
            email = req.email.lower().strip()
        else:
            p_id = (req.provider_id or secrets.token_hex(4)).replace("@", "_")
            email = f"{provider}_{p_id}@auth.{provider}.com"

        display_name = req.full_name or f"{provider.capitalize()} Verified Analyst"
        org = f"{provider.capitalize()} ID Authenticated"

        with self._lock:
            if email not in self._users:
                user_id = f"usr_{provider}_{secrets.token_hex(4)}"
                created_at = datetime.now(timezone.utc).isoformat()
                salt_hex, hash_hex = _hash_password(secrets.token_urlsafe(24))
                self._users[email] = {
                    "id": user_id,
                    "email": email,
                    "full_name": display_name,
                    "organization": org,
                    "tier": "Senior Forensic Analyst",
                    "scans_remaining": 500,
                    "created_at": created_at,
                    "salt": salt_hex,
                    "hash": hash_hex,
                    "auth_provider": provider,
                }
                self._save_locked()

            user_data = self._users[email]
            token = f"son_auth_{secrets.token_urlsafe(32)}"
            now = time.time()
            self._prune_expired_tokens(now)
            self._tokens[token] = (email, now + TOKEN_TTL_SECONDS)

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

    def send_phone_otp(self, req: PhoneSendOtpRequest) -> dict:
        clean_phone = re.sub(r"[^\d+]", "", req.phone_number)
        if len(clean_phone) < 7:
            raise HTTPException(status_code=400, detail="Invalid phone number. Please enter a valid number with country code.")

        otp = f"{secrets.randbelow(900000) + 100000}"
        salt_hex, hash_hex = _hash_password(otp)

        with self._lock:
            now = time.time()
            self._phone_otps[clean_phone] = (hash_hex, salt_hex, now + 300)

        return {
            "status": "ok",
            "message": f"Verification code sent to {clean_phone}.",
            "phone_number": clean_phone,
            "demo_otp": otp,
        }

    def verify_phone_otp(self, req: PhoneVerifyOtpRequest) -> AuthResponse:
        clean_phone = re.sub(r"[^\d+]", "", req.phone_number)
        with self._lock:
            now = time.time()
            otp_entry = self._phone_otps.get(clean_phone)
            if not otp_entry or otp_entry[2] < now:
                self._phone_otps.pop(clean_phone, None)
                raise HTTPException(status_code=400, detail="Verification code expired or invalid. Please request a new code.")

            stored_hash, stored_salt, _ = otp_entry
            if not _verify_password(req.otp_code.strip(), stored_salt, stored_hash):
                raise HTTPException(status_code=400, detail="Incorrect 6-digit verification code.")

            self._phone_otps.pop(clean_phone, None)

            email = f"phone_{clean_phone.replace('+', '')}@mobile.auth"
            if email not in self._users:
                user_id = f"usr_phone_{secrets.token_hex(4)}"
                created_at = datetime.now(timezone.utc).isoformat()
                salt_hex, hash_hex = _hash_password(secrets.token_urlsafe(24))
                self._users[email] = {
                    "id": user_id,
                    "email": email,
                    "full_name": req.full_name or f"Mobile Analyst ({clean_phone[-4:]})",
                    "organization": "Verified Mobile Examiner",
                    "tier": "Senior Forensic Analyst",
                    "scans_remaining": 500,
                    "created_at": created_at,
                    "salt": salt_hex,
                    "hash": hash_hex,
                    "auth_provider": "phone",
                }
                self._save_locked()

            user_data = self._users[email]
            token = f"son_auth_{secrets.token_urlsafe(32)}"
            self._prune_expired_tokens(now)
            self._tokens[token] = (email, now + TOKEN_TTL_SECONDS)

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

    def logout(self, token: str | None) -> None:
        if not token:
            return
        clean_token = token.replace("Bearer ", "").strip()
        with self._lock:
            self._tokens.pop(clean_token, None)

    def get_current_user(self, token: str | None) -> UserProfile:
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token missing.",
            )
        clean_token = token.replace("Bearer ", "").strip()
        with self._lock:
            token_entry = self._tokens.get(clean_token)
            now = time.time()
            if not token_entry or token_entry[1] < now:
                self._tokens.pop(clean_token, None)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session expired or invalid token.",
                )
            email = token_entry[0]
            if email not in self._users:
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

    def update_plan(self, token: str | None, plan_id: str) -> UserProfile:
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
        clean_token = token.replace("Bearer ", "").strip()
        with self._lock:
            token_entry = self._tokens.get(clean_token)
            now = time.time()
            if not token_entry or token_entry[1] < now:
                self._tokens.pop(clean_token, None)
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired.")
            email = token_entry[0]
            if email not in self._users:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")

            plans = {
                "starter": ("Free Community Starter", 25),
                "pro": ("Pro Forensic Analyst", 500),
                "enterprise": ("Enterprise Lab Tier", 5000),
            }
            tier_name, scans = plans.get(plan_id.lower(), ("Pro Forensic Analyst", 500))

            self._users[email]["tier"] = tier_name
            self._users[email]["scans_remaining"] = scans
            self._save_locked()

            u = self._users[email]
            return UserProfile(
                id=u["id"],
                email=email,
                full_name=u["full_name"],
                organization=u["organization"],
                tier=u["tier"],
                scans_remaining=u["scans_remaining"],
                created_at=u["created_at"],
            )


class PlanUpdateRequest(BaseModel):
    plan_id: str = Field(..., pattern="^(starter|pro|enterprise)$")


store = UserStore()


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(request: UserSignupRequest) -> AuthResponse:
    return store.signup(request)


@router.post("/login", response_model=AuthResponse)
def login(request: UserLoginRequest, http_req: Request) -> AuthResponse:
    ip = rate_limiter.get_client_ip(http_req)
    return store.login(request, ip=ip)


@router.post("/oauth", response_model=AuthResponse)
def oauth_login(request: OAuthLoginRequest) -> AuthResponse:
    return store.oauth_login(request)


@router.post("/phone/send-otp")
def phone_send_otp(request: PhoneSendOtpRequest) -> dict:
    return store.send_phone_otp(request)


@router.post("/phone/verify-otp", response_model=AuthResponse)
def phone_verify_otp(request: PhoneVerifyOtpRequest) -> AuthResponse:
    return store.verify_phone_otp(request)


@router.post("/update-plan", response_model=UserProfile)
def update_plan(request: PlanUpdateRequest, authorization: str | None = Header(default=None)) -> UserProfile:
    return store.update_plan(authorization, request.plan_id)


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)) -> dict[str, str]:
    store.logout(authorization)
    return {"message": "Successfully logged out."}


@router.get("/me", response_model=UserProfile)
def get_me(authorization: str | None = Header(default=None)) -> UserProfile:
    return store.get_current_user(authorization)
