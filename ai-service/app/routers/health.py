"""Router /health - dot nay chi can endpoint nay chay duoc."""

from fastapi import APIRouter

from app.config import settings
from app.models.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Kiem tra dich vu con song, dung cho HF Spaces va CI."""
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
    )
