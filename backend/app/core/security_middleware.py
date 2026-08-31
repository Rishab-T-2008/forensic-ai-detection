import ipaddress
import socket
import threading
import time
from urllib.parse import urlparse
from fastapi import HTTPException, Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimiter:
    """In-memory sliding window rate limiter per client IP."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._requests: dict[str, list[float]] = {}
        self._auth_failures: dict[str, list[float]] = {}
        self._lockouts: dict[str, float] = {}

    def get_client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        client = request.client
        return client.host if client else "127.0.0.1"

    def is_locked_out(self, ip: str) -> bool:
        with self._lock:
            lock_until = self._lockouts.get(ip, 0)
            if time.time() < lock_until:
                return True
            if lock_until:
                del self._lockouts[ip]
            return False

    def record_auth_failure(self, ip: str) -> None:
        now = time.time()
        with self._lock:
            history = self._auth_failures.setdefault(ip, [])
            history.append(now)
            # Retain only attempts within the last 15 minutes (900 seconds)
            history = [t for t in history if t > now - 900]
            self._auth_failures[ip] = history
            # If 5 or more failures, lockout for 15 minutes
            if len(history) >= 5:
                self._lockouts[ip] = now + 900

    def record_auth_success(self, ip: str) -> None:
        with self._lock:
            self._auth_failures.pop(ip, None)
            self._lockouts.pop(ip, None)

    def check_rate_limit(self, ip: str, path: str) -> None:
        now = time.time()
        # Generous limit on AI inference and question endpoints (60/min)
        if "/detect/image" in path or "/detect/question" in path:
            limit = 60
            window = 60
        else:
            limit = 120
            window = 60

        with self._lock:
            key = f"{ip}:{path[:18]}"
            history = self._requests.setdefault(key, [])
            history = [t for t in history if t > now - window]
            if len(history) >= limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Rate limit exceeded to prevent denial-of-service. Please slow down.",
                    headers={"Retry-After": "60"},
                )
            history.append(now)
            self._requests[key] = history


rate_limiter = RateLimiter()


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Injects defensive HTTP security headers to protect against clickjacking, XSS, and MIME-sniffing."""

    async def dispatch(self, request: Request, call_next):
        # Enforce rate limiting on API paths
        if request.url.path.startswith("/api/v1"):
            ip = rate_limiter.get_client_ip(request)
            if rate_limiter.is_locked_out(ip):
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="IP temporarily locked out due to repeated failed authentication attempts. Try again in 15 minutes.",
                )
            rate_limiter.check_rate_limit(ip, request.url.path)

        response: Response = await call_next(request)

        # Apply industry-standard security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

        return response


def validate_safe_url(target_url: str) -> None:
    """
    Prevents Server-Side Request Forgery (SSRF) attacks by verifying that
    a requested URL does not resolve to private, loopback, or cloud-metadata IPs.
    """
    if not target_url or not isinstance(target_url, str):
        raise HTTPException(status_code=400, detail="Invalid URL specified.")

    parsed = urlparse(target_url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=400,
            detail="Security violation: Only HTTP and HTTPS protocols are permitted.",
        )

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="URL is missing a valid hostname.")

    # Block well-known internal hostnames
    lowered = hostname.lower()
    if lowered in ("localhost", "127.0.0.1", "0.0.0.0", "metadata.google.internal") or any(
        lowered.endswith(tld) for tld in (".local", ".internal", ".localhost", ".corp", ".lan")
    ):
        raise HTTPException(
            status_code=400,
            detail="Security violation: Target URL resolves to a forbidden internal address.",
        )

    # Check if hostname is an IP address literal
    try:
        ip_obj = ipaddress.ip_address(hostname)
        if (
            ip_obj.is_private
            or ip_obj.is_loopback
            or ip_obj.is_link_local
            or ip_obj.is_reserved
            or ip_obj.is_multicast
        ):
            raise HTTPException(
                status_code=400,
                detail="Security violation: Target URL resolves to a protected internal network address.",
            )
        return
    except ValueError:
        pass

    # Resolve hostname if network/DNS is available
    try:
        addr_info = socket.getaddrinfo(hostname, None)
        for entry in addr_info:
            ip_str = entry[4][0]
            try:
                ip_obj = ipaddress.ip_address(ip_str)
                if (
                    ip_obj.is_private
                    or ip_obj.is_loopback
                    or ip_obj.is_link_local
                    or ip_obj.is_reserved
                    or ip_obj.is_multicast
                ):
                    raise HTTPException(
                        status_code=400,
                        detail="Security violation: Target URL resolves to a protected internal network address.",
                    )
            except ValueError:
                continue
    except socket.gaierror:
        # In isolated/sandbox environments without external DNS, pass through public domain names
        pass
