import hashlib
import os
import threading
import time
from collections import OrderedDict
from typing import Any


class BillingAndBudgetGuard:
    """Protects against unexpected cloud billing and manages API quotas and caching."""

    def __init__(
        self,
        max_daily_calls: int | None = None,
        max_hourly_calls: int | None = None,
        cache_capacity: int = 500,
    ) -> None:
        self.max_daily_calls = (
            max_daily_calls
            or int(os.getenv("GEMINI_DAILY_BUDGET_CALLS", "150"))
        )
        self.max_hourly_calls = (
            max_hourly_calls
            or int(os.getenv("GEMINI_HOURLY_BUDGET_CALLS", "45"))
        )
        self.cache_capacity = cache_capacity

        self._lock = threading.Lock()
        self._call_timestamps: list[float] = []
        self._cache: OrderedDict[str, Any] = OrderedDict()
        self._total_cache_hits = 0
        self._total_api_calls = 0

    @staticmethod
    def compute_image_hash(image_bytes: bytes) -> str:
        return hashlib.sha256(image_bytes).hexdigest()

    @staticmethod
    def compute_query_hash(image_bytes: bytes | None, question: str) -> str:
        h = hashlib.sha256(question.strip().lower().encode("utf-8"))
        if image_bytes:
            h.update(hashlib.sha256(image_bytes).digest())
        return h.hexdigest()

    def can_call_gemini(self) -> bool:
        """Check whether current usage is safely within daily and hourly budget limits."""
        now = time.time()
        one_hour_ago = now - 3600
        one_day_ago = now - 86400

        with self._lock:
            # Purge timestamps older than 24 hours
            self._call_timestamps = [t for t in self._call_timestamps if t > one_day_ago]

            daily_count = len(self._call_timestamps)
            hourly_count = sum(1 for t in self._call_timestamps if t > one_hour_ago)

            if daily_count >= self.max_daily_calls:
                return False
            if hourly_count >= self.max_hourly_calls:
                return False

            return True

    def record_call(self) -> None:
        """Record an API call timestamp."""
        now = time.time()
        with self._lock:
            self._call_timestamps.append(now)
            self._total_api_calls += 1

    def get_cached(self, key: str) -> Any | None:
        """Retrieve cached result to save API tokens ($0 cost)."""
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                self._total_cache_hits += 1
                return self._cache[key]
            return None

    def set_cached(self, key: str, value: Any) -> None:
        """Store result in LRU cache."""
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = value
            if len(self._cache) > self.cache_capacity:
                self._cache.popitem(last=False)

    def get_status(self) -> dict[str, Any]:
        """Return budget and cache metrics for transparency."""
        now = time.time()
        one_hour_ago = now - 3600
        one_day_ago = now - 86400

        with self._lock:
            recent_day = [t for t in self._call_timestamps if t > one_day_ago]
            recent_hour = [t for t in recent_day if t > one_hour_ago]

            return {
                "budget_active": True,
                "daily_calls_used": len(recent_day),
                "daily_limit": self.max_daily_calls,
                "hourly_calls_used": len(recent_hour),
                "hourly_limit": self.max_hourly_calls,
                "daily_remaining": max(0, self.max_daily_calls - len(recent_day)),
                "total_cache_hits": self._total_cache_hits,
                "total_api_calls": self._total_api_calls,
                "cost_saved_usd": round(self._total_cache_hits * 0.005, 4),
            }


# Global singleton instance for the process
billing_guard = BillingAndBudgetGuard()

