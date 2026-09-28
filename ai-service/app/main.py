"""Diem khoi tao ung dung FastAPI cua ai-service."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import settings
from app.models.weights import load_fsrs
from app.routers import health, rag, retention, vision

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Nap model ML mot lan khi khoi dong, giai phong khi tat (quy tac 4).

    load_fsrs khong nem ngoai le: nap that bai thi model = None, dich vu van len
    de /health bao degraded thay vi container crash-loop tren HF Spaces.
    """
    model, meta = load_fsrs(settings)
    app.state.models = {"fsrs": model}
    app.state.model_meta = meta
    yield
    app.state.models.clear()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Dich vu AI cho nen tang hoc tieng Anh Web Study English AI",
    lifespan=lifespan,
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Tra loi 422 gon, bo truong 'input' cua Pydantic.

    Ban mac dinh cua FastAPI nhet gia tri nguoi dung gui vao truong 'input'. Khi
    gia tri do la NaN hoac Infinity thi chinh body loi lai khong serialize duoc ->
    dich vu tra 500 thay vi 422. Da kiem chung tren FastAPI 0.115.6.

    Giu nguyen ma 422 va vo boc {"detail": [...]} de backend khong phai doi parser.
    """
    errors = [
        {
            "loc": [str(part) for part in err.get("loc", [])],
            "msg": err.get("msg", ""),
            "type": err.get("type", ""),
        }
        for err in exc.errors()
    ]
    logger.warning("422 tai %s: %s", request.url.path, errors)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": errors},
    )


app.include_router(health.router)
app.include_router(retention.router)
app.include_router(vision.router)
app.include_router(rag.router)
