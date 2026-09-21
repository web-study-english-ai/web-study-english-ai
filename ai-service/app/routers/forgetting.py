"""Router /predict/forgetting - du doan xac suat quen tu (stub)."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import verify_internal_api_key
from app.models.schemas import ForgettingRequest, ForgettingResponse

router = APIRouter(
    prefix="/predict",
    tags=["forgetting"],
    dependencies=[Depends(verify_internal_api_key)],
)


@router.post("/forgetting", response_model=ForgettingResponse)
async def predict_forgetting(payload: ForgettingRequest) -> ForgettingResponse:
    """Du doan xac suat nho lai cua the tu vung.

    TODO(WSEA): nap model da train tu du lieu FSRS-Anki-20k va tra ket qua that.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Chuc nang du doan quen tu chua duoc trien khai",
    )
