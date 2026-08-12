from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.db_url import normalize_database_urls


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
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,https://road-service-flax.vercel.app"
    )
    upload_dir: str = "./uploads"
    verification_pending_hours: int = 24
    scheduler_enabled: bool = True
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    def model_post_init(self, __context) -> None:  # noqa: ANN001
        async_url, sync_url = normalize_database_urls(self.database_url, self.database_url_sync)
        object.__setattr__(self, "database_url", async_url)
        object.__setattr__(self, "database_url_sync", sync_url)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def cloudinary_enabled(self) -> bool:
        return bool(
            self.cloudinary_cloud_name and self.cloudinary_api_key and self.cloudinary_api_secret
        )


settings = Settings()
