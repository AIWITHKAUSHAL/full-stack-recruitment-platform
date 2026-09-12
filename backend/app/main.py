"""FastAPI application factory and global wiring.

Why FastAPI: the same Python type hints give request validation (Pydantic),
serialization, and an OpenAPI/Swagger document for free — which is what lets a
React client and a classroom demo share one contract without a hand-written spec.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1 import api_router
from app.api.v1.health import router as health_router
from app.core.config import settings
from app.core.exceptions import AppError, error_body
from app.core.logging import configure_logging, get_logger
from app.core.middleware import RequestContextMiddleware

logger = get_logger("app.main")

DESCRIPTION = """
A lightweight careers portal and applicant tracking system.

* **Candidates** browse active jobs, apply (optionally with a resume) and track
  their application with the code they receive plus their email address.
* **Administrators** authenticate with a JWT, manage jobs, and move candidates
  through `APPLIED → SCREENING → INTERVIEW → SELECTED`, with `REJECTED`
  reachable from any non-terminal stage.

Every error uses the same envelope:
`{"success": false, "error": {"code", "message"}, "request_id"}`.
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    # Refuse to start a deployed environment with development secrets rather
    # than silently running an insecure service.
    settings.validate_production_safety()
    logger.info(
        "application starting",
        extra={
            "extra_fields": {
                "environment": settings.environment,
                "resume_storage": "s3" if settings.resume_storage_is_s3 else "local-fallback",
            }
        },
    )
    yield
    logger.info("application stopping")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.project_name,
        description=DESCRIPTION,
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    # Order matters: the request-context middleware wraps everything so even a
    # CORS-rejected request still gets a request id in the log.
    app.add_middleware(RequestContextMiddleware)

    # CORS is restricted to the known frontend origins. On AWS that is the
    # CloudFront URL; "*" is never used for an API with authenticated routes
    # (RESTRICTIONS.md #25, CLAUDE.md §12).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,  # the token travels in a header, not a cookie
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )

    app.include_router(health_router)
    app.include_router(api_router, prefix=settings.api_v1_prefix)

    _register_exception_handlers(app)
    return app


def _register_exception_handlers(app: FastAPI) -> None:
    """One envelope for every failure (project rule R5)."""

    def request_id_of(request: Request) -> str:
        return getattr(request.state, "request_id", "-")

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        # Expected, named failures: logged at WARNING, returned as-is.
        logger.warning(
            "application error",
            extra={"extra_fields": {"code": exc.code, "path": request.url.path}},
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message, request_id_of(request), exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        # FastAPI's own 422 reshaped into our envelope, with a field map the
        # React forms can render next to the inputs.
        fields = {
            ".".join(str(part) for part in error["loc"][1:]) or "body": error["msg"]
            for error in exc.errors()
        }
        return JSONResponse(
            status_code=422,
            content=error_body(
                "VALIDATION_ERROR",
                "Please correct the highlighted fields.",
                request_id_of(request),
                {"fields": fields},
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        codes = {401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(
                codes.get(exc.status_code, "HTTP_ERROR"),
                str(exc.detail),
                request_id_of(request),
            ),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        # The traceback goes to CloudWatch; the caller gets a request id and
        # nothing else. Never leak stack traces, SQL or credentials.
        logger.exception("unhandled error", extra={"extra_fields": {"path": request.url.path}})
        return JSONResponse(
            status_code=500,
            content=error_body(
                "INTERNAL_ERROR",
                "An unexpected error occurred. Quote the request id when reporting this.",
                request_id_of(request),
            ),
        )


app = create_app()
