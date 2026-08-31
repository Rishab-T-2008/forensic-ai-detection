import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.billing_guard import BillingAndBudgetGuard
from app.core.security_middleware import RateLimiter, validate_safe_url
from app.main import app


def test_security_headers_injected() -> None:
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert "Strict-Transport-Security" in response.headers
    assert response.json().get("billing_protection") == "active"


def test_ssrf_validator_blocks_private_and_metadata_ips() -> None:
    # Localhost / Loopback
    with pytest.raises(HTTPException) as exc:
        validate_safe_url("http://127.0.0.1:8000/internal")
    assert exc.value.status_code == 400

    # Localhost hostname
    with pytest.raises(HTTPException) as exc:
        validate_safe_url("http://localhost/secret")
    assert exc.value.status_code == 400

    # Cloud link-local metadata (AWS/GCP/Azure)
    with pytest.raises(HTTPException) as exc:
        validate_safe_url("http://169.254.169.254/latest/meta-data")
    assert exc.value.status_code == 400

    # Non-HTTP/HTTPS schemes
    with pytest.raises(HTTPException) as exc:
        validate_safe_url("file:///etc/passwd")
    assert exc.value.status_code == 400


def test_billing_guard_quota_and_caching() -> None:
    # Test strict budget limits
    guard = BillingAndBudgetGuard(max_daily_calls=3, max_hourly_calls=2)

    assert guard.can_call_gemini() is True
    guard.record_call()
    guard.record_call()
    # Hourly limit reached (2 calls)
    assert guard.can_call_gemini() is False

    # Test SHA-256 caching ($0 API cost)
    fake_img = b"fake_pixel_stream_data_12345"
    h = guard.compute_image_hash(fake_img)
    guard.set_cached(h, {"verdict": "likely_real", "cost": 0.0})

    cached = guard.get_cached(h)
    assert cached is not None
    assert cached["verdict"] == "likely_real"

    status = guard.get_status()
    assert status["total_cache_hits"] >= 1
    assert status["total_api_calls"] == 2


def test_rate_limiter_blocks_dos() -> None:
    limiter = RateLimiter()
    test_ip = "198.51.100.42"

    # Make 60 rapid calls to AI endpoint
    for _ in range(60):
        limiter.check_rate_limit(test_ip, "/api/v1/detect/question")

    # 61st call should trigger 429 Too Many Requests
    with pytest.raises(HTTPException) as exc:
        limiter.check_rate_limit(test_ip, "/api/v1/detect/question")
    assert exc.value.status_code == 429


def test_brute_force_auth_lockout() -> None:
    limiter = RateLimiter()
    attacker_ip = "203.0.113.88"

    assert limiter.is_locked_out(attacker_ip) is False

    # 5 failed login attempts
    for _ in range(5):
        limiter.record_auth_failure(attacker_ip)

    # Should now be locked out
    assert limiter.is_locked_out(attacker_ip) is True

