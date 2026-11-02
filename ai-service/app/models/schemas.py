"""Pydantic schema dung chung cho request/response cua ai-service.

Nguon su that cho cac truong o day la docs/API_CONTRACT.md. Sua hop dong TRUOC.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

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


class EmbedRequest(BaseModel):
    # Bo khoang trang hai dau TRUOC khi kiem do dai: chuoi chi co khoang trang -> 422.
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)

    text: str = Field(min_length=1, max_length=1000)


class EmbedResponse(BaseModel):
    embedding: list[float]
    model: str
    revision: str
    dim: int


# --- /assistant/ask va /assistant/rank (hop dong v0.3, WSEA-127) ---------------------------


class AskWord(BaseModel):
    """Tu nguoi hoc dang xem (thay cho word_id: dich vu AI khong co DB de tra id)."""

    model_config = STRICT_INPUT

    term: str = Field(min_length=1, max_length=100)
    pos: str
    meaning_vi: str


class AskContext(BaseModel):
    """Mot doan ngu phap ung vien do backend truy hoi bang pgvector."""

    model_config = STRICT_INPUT

    id: str = Field(min_length=1)
    content: str = Field(max_length=4000)
    source: str
    topic: str | None = None
    cefr: str | None = None
    distance: float = Field(ge=0, le=2)


class AskVocab(BaseModel):
    model_config = STRICT_INPUT

    term: str
    pos: str
    meaning_vi: str
    example_en: str | None = None
    match: Literal["exact", "vector"]
    distance: float = Field(ge=0, le=2)


class AskTurn(BaseModel):
    model_config = STRICT_INPUT

    role: Literal["user", "assistant"]
    content: str = Field(max_length=2000)


class AskRequest(BaseModel):
    """Body chung cua /assistant/ask va /assistant/rank.

    contexts KHONG bat buoc da sap: pipeline tu sap theo distance. Chi bat id khong trung.
    """

    model_config = STRICT_INPUT

    # Rieng question: bo khoang trang hai dau truoc khi kiem do dai -> chuoi rong/toan
    # khoang trang tra 422. Khong bat str_strip_whitespace cho ca model de content giu nguyen van.
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
    word: AskWord | None = None
    user_cefr: Literal["A1", "A2", "B1", "B2"] | None = None
    contexts: list[AskContext] = Field(max_length=20)
    vocab: list[AskVocab] = Field(default_factory=list, max_length=10)
    history: list[AskTurn] = Field(default_factory=list, max_length=6)

    @model_validator(mode="after")
    def unique_context_ids(self) -> "AskRequest":
        ids = [c.id for c in self.contexts]
        dup = sorted({i for i in ids if ids.count(i) > 1})
        if dup:
            raise ValueError(f"contexts co id trung: {dup}")
        return self


class AskResponse(BaseModel):
    answer: str
    source_ids: list[str] = Field(default_factory=list)


class RankIntent(BaseModel):
    label: str
    confidence: float


class RankContext(BaseModel):
    id: str
    distance: float
    rank: int


class RankResponse(BaseModel):
    """Ket qua pipeline truy hoi (truoc LLM): quyet dinh + ngu canh da chon."""

    decision: Literal["answer", "no_context", "out_of_scope"]
    reason: str
    intent: RankIntent | None = None
    contexts: list[RankContext] = Field(default_factory=list)
    vocab: list[str] = Field(default_factory=list)
