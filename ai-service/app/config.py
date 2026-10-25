"""Cau hinh dich vu AI, doc tu bien moi truong."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
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

    # Khoa API noi bo: backend NestJS phai gui kem khi goi ai-service.
    # SecretStr chu khong phai str: gia tri bi che khi log hoac repr(settings),
    # nen mot dong logging bat can khong lam lo khoa ra file log cua Spaces.
    internal_api_key: SecretStr = Field(min_length=32)

    # --- Trong so mo hinh du bao quen ---
    # hub     = tai tu Hugging Face Hub (production)
    # default = dung DEFAULT_W chua huan luyen, CHI de chay test va CI
    fsrs_weights_source: Literal["hub", "default"] = "hub"
    fsrs_weights_repo: str = "Hieusss/wsea-fsrs-weights"
    fsrs_weights_file: str = "params.json"
    fsrs_weights_revision: str = "v1"

    # Tran khoang on. Trung voi S_MAX cua mo hinh; dat rieng de ha xuong duoc
    # (vd 365 ngay) ma khong phai sua ma nguon mo hinh.
    fsrs_max_interval: int = Field(default=36500, ge=1, le=36500)

    # Token Hugging Face - repo trong so la private nen bat buoc khi source=hub
    hf_token: SecretStr | None = None


@lru_cache
def get_settings() -> Settings:
    """Tra ve Settings dang cache (chi doc env mot lan)."""
    return Settings()


settings = get_settings()
