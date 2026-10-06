"""Pydantic schema dung chung cho request/response cua ai-service.

Nguon su that cho cac truong o day la docs/API_CONTRACT.md. Sua hop dong TRUOC.
"""

from pydantic import BaseModel, ConfigDict, Field, model_validator

# Moi schema DAU VAO dung cau hinh nay:
#   extra="forbid"       -> truong la (go sai "stabilty", camelCase "elapsedDays")
#                           tra 422 thay vi bi bo qua im lang. Khong co no thi the cu
#                           bi coi la the moi va tra ve khoang on sai hoan toan, ma
#                           khong ai nhan ra luc tich hop.
#   allow_inf_nan=False  -> NaN/Infinity trong JSON tra 422, khong lot vao mo hinh.
STRICT_INPUT = ConfigDict(extra="forbid", allow_inf_nan=False)

# Pydantic v2 giu rieng tien to "model_" cho cac thuoc tinh cua chinh no va se
# canh bao khi ta dat ten truong model_version. Ten nay do hop dong API quy dinh
# nen tat bao luu thay vi doi ten truong.
ALLOW_MODEL_PREFIX = ConfigDict(protected_namespaces=())


class HealthResponse(BaseModel):
    model_config = ALLOW_MODEL_PREFIX

    status: str
    service: str
    version: str
    environment: str
    models: list[str] = Field(default_factory=list)
    model_version: str | None = None


class CardIn(BaseModel):
    """Trang thai mot the tu vung ngay sau khi nguoi hoc vua cham diem."""

    model_config = STRICT_INPUT

    card_id: str = Field(min_length=1, max_length=64)
    stability: float | None = Field(default=None, gt=0, le=36500)
    difficulty: float | None = Field(default=None, ge=1, le=10)
    elapsed_days: float = Field(ge=0, le=36500)
    rating: int = Field(ge=1, le=4)

    @model_validator(mode="after")
    def _stability_and_difficulty_together(self) -> "CardIn":
        """S va D phai cung co hoac cung vang.

        Co mot cai ma thieu cai kia la du lieu hong o phia backend. Doan thay
        (vd lay D mac dinh) se tra ve khoang on sai ma khong ai biet - bao 422.
        """
        if (self.stability is None) != (self.difficulty is None):
            raise ValueError(
                "stability va difficulty phai cung co hoac cung vang "
                "(cung vang = the moi chua tung on)"
            )
        return self

    @property
    def is_new(self) -> bool:
        return self.stability is None


class PredictRetentionRequest(BaseModel):
    model_config = STRICT_INPUT

    # max_length=500 theo hop dong: chan mot request khong lo lam het RAM cua
    # Space free. min_length=1 vi lo rong khong co nghia gi.
    cards: list[CardIn] = Field(min_length=1, max_length=500)


class CardOut(BaseModel):
    card_id: str
    # null voi the moi: chua co lan on truoc nen xac suat nho khong ton tai.
    # Bia 1.0 se lam sai moi thong ke neu backend gop trung binh.
    retrievability: float | None = Field(default=None, ge=0, le=1)
    new_stability: float = Field(gt=0, le=36500)
    new_difficulty: float = Field(ge=1, le=10)
    interval_days: int = Field(ge=1)


class PredictRetentionResponse(BaseModel):
    model_config = ALLOW_MODEL_PREFIX

    results: list[CardOut]
    model_version: str


class RecognizedLabel(BaseModel):
    label: str
    confidence: float = Field(..., ge=0, le=1)


class VisionResponse(BaseModel):
    labels: list[RecognizedLabel]


class AskRequest(BaseModel):
    model_config = STRICT_INPUT

    question: str = Field(..., min_length=1, description="Cau hoi cua nguoi hoc")
    top_k: int = Field(default=5, ge=1, le=20, description="So doan ngu lieu truy hoi")


class AskSource(BaseModel):
    source_id: str
    score: float


class AskResponse(BaseModel):
    answer: str
    sources: list[AskSource] = Field(default_factory=list)
