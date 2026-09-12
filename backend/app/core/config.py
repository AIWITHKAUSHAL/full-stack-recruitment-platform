"""Application configuration.

Every tunable value in the backend is read here, once, from the environment.
No other module calls ``os.environ`` — that keeps the twelve-factor promise
("config in the environment") auditable and makes the ECS task definition the
single place where AWS-side configuration lives.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# The development JWT secret is deliberately recognisable so that
# ``Settings.validate_production_safety`` can refuse to start with it outside
# local development.
INSECURE_JWT_DEFAULT = "local-development-only-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ---------------------------------------------------------------- runtime
    project_name: str = "Mini Job Board Application Tracker"
    environment: str = "local"  # local | dev | prod
    log_level: str = "INFO"
    api_v1_prefix: str = "/api/v1"

    # --------------------------------------------------------------- database
    # postgresql+psycopg://user:password@host:5432/dbname
    database_url: str = "postgresql+psycopg://jobboard:jobboard_local_password@localhost:5432/jobboard"
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_recycle_seconds: int = 1800  # recycle before RDS idle timeouts bite

    # ------------------------------------------------------------------- auth
    jwt_secret_key: str = INSECURE_JWT_DEFAULT
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60

    # Bootstrap administrator, created by the seed script. Never used at runtime.
    admin_email: str = "admin@minijobboard.dev"
    admin_password: str = "ChangeMe123!"

    # ------------------------------------------------------------------- cors
    # Held as a comma-separated STRING rather than list[str] on purpose:
    # pydantic-settings tries to json.loads() any complex-typed value it reads
    # from the environment, so CORS_ORIGINS=http://a,http://b would fail to
    # parse before any validator could see it. The parsed list is exposed by
    # the cors_origin_list property below.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --------------------------------------------------------------- storage
    # Empty bucket name => local filesystem fallback (see services/storage.py).
    s3_resume_bucket: str = ""
    aws_region: str = "us-east-1"
    resume_max_bytes: int = 5 * 1024 * 1024  # 5 MB
    resume_presign_expiry_seconds: int = 300

    # ------------------------------------------------------------ convenience
    run_migrations_on_start: bool = False
    seed_on_start: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        """The allowed browser origins, parsed from the comma-separated value."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_local(self) -> bool:
        return self.environment.lower() == "local"

    @property
    def resume_storage_is_s3(self) -> bool:
        return bool(self.s3_resume_bucket)

    def validate_production_safety(self) -> None:
        """Fail fast rather than run a deployed environment with demo secrets."""
        if self.is_local:
            return
        problems: list[str] = []
        if self.jwt_secret_key == INSECURE_JWT_DEFAULT or len(self.jwt_secret_key) < 32:
            problems.append("JWT_SECRET_KEY must be a strong value (openssl rand -hex 32)")
        if "*" in self.cors_origin_list:
            problems.append("CORS_ORIGINS must not be '*' outside local development")
        if problems:
            raise RuntimeError("Unsafe configuration: " + "; ".join(problems))


@lru_cache
def get_settings() -> Settings:
    """Cached accessor so the environment is parsed exactly once per process."""
    return Settings()


settings = get_settings()
