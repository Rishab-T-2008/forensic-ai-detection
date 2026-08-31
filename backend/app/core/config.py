from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables or backend/.env."""

    max_upload_size: int = Field(default=25 * 1024 * 1024, gt=0)
    allowed_mime_types: str = "image/jpeg,image/png,image/webp"
    model_path: str = "models/detector_v1.onnx"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    third_party_api_key: str | None = None
    third_party_api_url: str | None = None
    redis_url: str = "redis://localhost:6379/0"
    detector_threshold: float = Field(default=0.65, ge=0.0, le=1.0)
    frontend_origin: str = "http://localhost:3000"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="", case_sensitive=False, extra="ignore")

    @property
    def allowed_mime_type_list(self) -> tuple[str, ...]:
        return tuple(item.strip() for item in self.allowed_mime_types.split(",") if item.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
