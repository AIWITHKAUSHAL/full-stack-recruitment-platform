"""Request-scoped middleware: correlation id + access logging.

Flow:

    HTTP request -> generate request id -> set context -> handle
                 -> log method/path/status/duration -> return X-Request-ID
"""

from __future__ import annotations

import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import get_logger, request_id_ctx

logger = get_logger("app.request")

REQUEST_ID_HEADER = "X-Request-ID"


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns every request an id, logs its outcome, echoes the id back.

    The same id appears in the error envelope, so a student can paste the id
    from a failed browser call straight into CloudWatch Logs Insights.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Honour an upstream id (ALB/CloudFront can propagate one) or mint one.
        incoming = request.headers.get(REQUEST_ID_HEADER)
        request_id = incoming or uuid.uuid4().hex[:16]
        token = request_id_ctx.set(request_id)
        request.state.request_id = request_id

        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            logger.exception(
                "request failed",
                extra={
                    "extra_fields": {
                        "method": request.method,
                        "path": request.url.path,
                        "status_code": 500,
                        "duration_ms": duration_ms,
                    }
                },
            )
            request_id_ctx.reset(token)
            raise

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers[REQUEST_ID_HEADER] = request_id

        # /health is polled by the ALB every 30s; logging it at INFO would bury
        # the real traffic, so health checks drop to DEBUG.
        level = 10 if request.url.path.startswith("/health") else 20
        logger.log(
            level,
            "request completed",
            extra={
                "extra_fields": {
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "duration_ms": duration_ms,
                }
            },
        )
        request_id_ctx.reset(token)
        return response
