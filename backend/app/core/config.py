from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/roadservice"
    database_url_sync: str = "postgresql://postgres:postgres@localhost:5432/roadservice"
    secret_key: str = "change-me-to-a-long-random-string"
    access_token_expire_minutes: int = 60
    algorithm: str = "HS256"
    cors_origins: str = "http://localhost:8001,http://127.0.0.1:8001"
    upload_dir: str = "./uploads"
    verification_pending_hours: int = 24
    scheduler_enabled: bool = True
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
