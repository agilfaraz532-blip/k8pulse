"""
In-memory rate limiting for the public auth endpoints (sign-in, sign-up, admin sign-up).

Once K8sPulse is reachable from the internet, password guessing is the obvious attack.
Each client IP gets a budget of attempts per window; going over returns 429 with Retry-After.
In-memory is enough for the single backend process K8sPulse runs.
"""
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import HTTPException, Request, status

from app.core.config import settings


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            retry = int(self.window - (now - hits[0])) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many attempts. Please wait {retry} seconds and try again.",
                headers={"Retry-After": str(retry)},
            )
        hits.append(now)

    def reset(self) -> None:
        self._hits.clear()


def client_ip(request: Request) -> str:
    """Real client address; behind a tunnel or proxy the first X-Forwarded-For entry is the client."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


auth_limiter = RateLimiter(limit=settings.AUTH_RATE_LIMIT, window_seconds=settings.AUTH_RATE_WINDOW_SECONDS)


def limit_auth_attempts(request: Request) -> None:
    """FastAPI dependency for sign-in / registration endpoints."""
    if settings.AUTH_RATE_LIMIT > 0:
        auth_limiter.check(f"{client_ip(request)}:{request.url.path}")
