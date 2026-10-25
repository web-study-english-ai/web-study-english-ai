"""Router /health - kiem tra dich vu con song va da nap mo hinh chua."""

from fastapi import APIRouter, Request, Response, status

from app.config import settings
from app.models.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(request: Request, response: Response) -> HealthResponse:
    """Kiem tra dich vu con song, dung cho HF Spaces va CI. Khong can khoa.

    Nap mo hinh that bai -> HTTP 503 kem status="degraded". Tra 200 luc do la
    noi doi voi health check: HF Spaces va GitHub Actions se tuong dich vu on
    trong khi /predict-retention dang tra 503 cho moi request.
    """
    models = request.app.state.models
    loaded = [name for name, m in models.items() if m is not None]
    meta = request.app.state.model_meta

    if not loaded:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return HealthResponse(
        status="ok" if loaded else "degraded",
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        models=loaded,
        model_version=meta.get("version"),
    )
