"""Cau hinh dich vu AI, doc tu bien moi truong."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.services import pipeline_rules as rules
from app.services import prompts

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

    # Nap mo hinh embedding (WSEA-111) luc khoi dong. Tat trong pytest de khong nap torch.
    embedder_enabled: bool = True
    # Dockerfile bat true vi mo hinh da nuong vao image -> khong goi Hub luc khoi dong.
    # KHONG dung HF_HUB_OFFLINE toan cuc: load_fsrs van can tai params.json tu Hub.
    embedder_local_files_only: bool = False

    # --- Nhan dien anh CLIP (WSEA-153). Nap luc khoi dong; tat trong pytest de khong tai mo hinh ---
    vision_enabled: bool = True
    vision_local_files_only: bool = False
    # Nguong tin cay: top-1 score < tau -> low_confidence. Chon tren tap dev (docs/eval/WSEA-153_tieu_chi.md
    # muc 4, scripts/tune_vision_tau.py), KHONG chinh theo tap test.
    # KHOA 2026-11-05: 0,40 = tau theo luat tren dev 18 anh (9 spike + 9 vision_dev), reports/153_tau_dev.json.
    # Khong chinh lai sau khi chay tap test.
    vision_tau: float = Field(default=0.40, gt=0, lt=1)

    # --- Pipeline truy hoi (WSEA-127). Mac dinh = luat chot truoc trong pipeline_rules.py ---
    pipeline_k_prompt: int = Field(default=rules.K_PROMPT, ge=1, le=20)
    pipeline_k_vocab: int = Field(default=rules.K_VOCAB, ge=0, le=10)
    pipeline_max_top1_distance: float = Field(default=rules.MAX_TOP1_DISTANCE, ge=0, le=2)

    # --- Goi LLM sinh cau tra loi (WSEA-140). API tuong thich OpenAI (Groq), goi bang httpx ---
    # Thieu khoa -> /assistant/ask tra 503 no_key, dich vu van len.
    llm_api_key: SecretStr | None = None
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_model: str = "openai/gpt-oss-120b"
    llm_fallback_model: str = "openai/gpt-oss-20b"  # chi dung khi model chinh tra 429
    # Ngan sach TONG cho ca lan chinh + lan du phong; phai < 15 s timeout JSON cua backend.
    llm_timeout_s: float = Field(default=12.0, gt=0, lt=15)
    # Ngan sach TONG cho mot luong SSE (ca lan du phong); phai < 45 s timeout SSE cua backend.
    llm_stream_timeout_s: float = Field(default=40.0, gt=0, lt=45)
    llm_temperature: float = Field(default=prompts.TEMPERATURE, ge=0, le=2)
    llm_max_completion_tokens: int = Field(default=prompts.MAX_COMPLETION_TOKENS, ge=1, le=65536)
    llm_reasoning_effort: Literal["low", "medium", "high"] = prompts.REASONING_EFFORT

    # Token Hugging Face - repo trong so la private nen bat buoc khi source=hub
    hf_token: SecretStr | None = None


@lru_cache
def get_settings() -> Settings:
    """Tra ve Settings dang cache (chi doc env mot lan)."""
    return Settings()


settings = get_settings()
