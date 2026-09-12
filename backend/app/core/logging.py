"""Structured JSON logging.

Why JSON: on AWS these lines are collected by the ECS awslogs driver into a
CloudWatch log group. CloudWatch Logs Insights can query JSON fields directly
(``fields request_id, duration_ms | filter status_code >= 500``), which is the
difference between a usable demo and grepping raw text.

What is deliberately NOT logged: request bodies, response bodies, headers,
Authorization tokens, passwords, resume content. See RESTRICTIONS.md.
"""

from __future__ import annotations

import contextvars
import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

from app.core.config import settings

# Carries the per-request id from the middleware into every log record emitted
# while handling that request, without threading it through every function.
request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_ctx.get(),
        }
        # Structured extras attached via logger.info("...", extra={"extra_fields": {...}})
        extra = getattr(record, "extra_fields", None)
        if isinstance(extra, dict):
            payload.update(extra)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level.upper())

    # uvicorn's own access log would duplicate our request middleware log line
    # in a different (unstructured) format, so it is silenced.
    logging.getLogger("uvicorn.access").handlers = []
    logging.getLogger("uvicorn.access").propagate = False
    logging.getLogger("uvicorn.error").handlers = [handler]
    logging.getLogger("uvicorn.error").propagate = False


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
