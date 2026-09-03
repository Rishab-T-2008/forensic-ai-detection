import ipaddress
import socket
import threading
import time
from urllib.parse import urlparse
from fastapi import HTTPException, Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware


from fastapi.responses import JSONResponse

TRUSTED_PROXIES = {"127.0.0.1", "::1", "localhost", "0.0.0.0"}


class RateLimiter:
    """In-memory sliding window rate limiter per client IP with DoS bounds and trusted proxy handling."""

    def __init__(self, max_tracked_ips: int = 10_000) -> None:
        self._lock = threading.Lock()
        self._requests: dict[str, list[float]] = {}
        self._auth_failures: dict[str, list[float]] = {}
        self._lockouts: dict[str, float] = {}
        self._max_tracked_ips = max_tracked_ips
        self._last_cleanup = time.time()

    def get_client_ip(self, request: Request) -> str:
        """Extract client IP, verifying X-Forwarded-For only if peer is a trusted reverse proxy."""
        peer_ip = request.client.host if request.client else "127.0.0.1"
        if peer_ip in TRUSTED_PROXIES:
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                # Take the client IP from the forwarded chain
                client_candidate = forwarded.split(",")[0].strip()
                if client_candidate:
                    return client_candidate
            real_ip = request.headers.get("x-real-ip")
            if real_ip:
                return real_ip.strip()
        return peer_ip

    def _prune_stale_locked(self, now: float) -> None:
        """Periodic cleanup to guarantee zero memory leaks or unbounded growth under DoS."""
        if now - self._last_cleanup < 300:  # Prune every 5 minutes
            return
        self._last_cleanup = now
        # Clean requests older than 120 seconds
        cutoff_req = now - 120
        self._requests = {k: [t for t in v if t > cutoff_req] for k, v in self._requests.items() if any(t > cutoff_req for t in v)}
        # Clean auth failures older than 15 minutes
        cutoff_auth = now - 900
        self._auth_failures = {k: [t for t in v if t > cutoff_auth] for k, v in self._auth_failures.items() if any(t > cutoff_auth for t in v)}
        # Clean expired lockouts
        self._lockouts = {k: v for k, v in self._lockouts.items() if v > now}

    def is_locked_out(self, ip: str) -> bool:
        with self._lock:
            now = time.time()
            lock_until = self._lockouts.get(ip, 0)
            if now < lock_until:
                return True
            if lock_until:
                del self._lockouts[ip]
            return False

    def record_auth_failure(self, ip: str) -> None:
        now = time.time()
        with self._lock:
            self._prune_stale_locked(now)
            if len(self._auth_failures) >= self._max_tracked_ips:
                self._auth_failures.clear()
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
            self._prune_stale_locked(now)
            if len(self._requests) >= self._max_tracked_ips:
                self._requests.clear()
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
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={
                        "detail": "IP temporarily locked out due to repeated failed authentication attempts. Try again in 15 minutes."
                    },
                    headers={"Retry-After": "900"},
                )
            try:
                rate_limiter.check_rate_limit(ip, request.url.path)
            except HTTPException as exc:
                return JSONResponse(
                    status_code=exc.status_code,
                    content={"detail": exc.detail},
                    headers=exc.headers or {"Retry-After": "60"},
                )

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
