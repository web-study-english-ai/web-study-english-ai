"""Cau hinh dich vu AI, doc tu bien moi truong."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# ai-service/
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Bien moi truong cua ai-service.

    Tren Hugging Face Spaces, cac bien nay duoc khai bao trong phan
    Settings > Variables and secrets.
    """

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Thong tin dich vu
    app_name: str = "web-study-english-ai-service"
    app_version: str = "0.1.0"
    environment: str = "development"

    # Khoa API noi bo: backend NestJS phai gui kem khi goi ai-service
    internal_api_key: str = "dev-internal-key"

    # Duong dan model ML (se dung o cac giai doan sau)
    models_dir: Path = BASE_DIR / "app" / "models"
    forgetting_model_path: Path = BASE_DIR / "app" / "models" / "forgetting.pkl"
    vision_model_path: Path = BASE_DIR / "app" / "models" / "vision.pt"


@lru_cache
def get_settings() -> Settings:
    """Tra ve Settings dang cache (chi doc env mot lan)."""
    return Settings()


settings = get_settings()
