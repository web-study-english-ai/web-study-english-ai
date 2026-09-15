"""Pydantic schema dung chung cho request/response cua ai-service."""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    environment: str


class ForgettingRequest(BaseModel):
    """Lich su on tap cua mot the tu vung."""

    user_card_id: str = Field(..., description="Id the tu vung cua nguoi hoc")
    elapsed_days: float = Field(..., ge=0, description="So ngay ke tu lan on gan nhat")
    reps: int = Field(..., ge=0, description="So lan da on tap")
    lapses: int = Field(..., ge=0, description="So lan quen")
    stability: float | None = Field(default=None, ge=0, description="Do ben tri nho (FSRS)")
    difficulty: float | None = Field(default=None, description="Do kho cua the (FSRS)")


class ForgettingResponse(BaseModel):
    user_card_id: str
    retrievability: float = Field(..., ge=0, le=1, description="Xac suat nho lai")
    next_review_days: float = Field(..., ge=0, description="So ngay den lan on ke tiep")


class RecognizedLabel(BaseModel):
    label: str
    confidence: float = Field(..., ge=0, le=1)


class VisionResponse(BaseModel):
    labels: list[RecognizedLabel]


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, description="Cau hoi cua nguoi hoc")
    top_k: int = Field(default=5, ge=1, le=20, description="So doan ngu lieu truy hoi")


class AskSource(BaseModel):
    source_id: str
    score: float


class AskResponse(BaseModel):
    answer: str
    sources: list[AskSource] = Field(default_factory=list)
