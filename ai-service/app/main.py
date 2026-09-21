"""Diem khoi tao ung dung FastAPI cua ai-service."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.routers import forgetting, health, rag, vision


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Nap model ML mot lan khi khoi dong, giai phong khi tat.

    TODO(WSEA): nap model du doan quen tu / thi giac may tinh vao app.state.
    """
    app.state.models = {}
    yield
    app.state.models.clear()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Dich vu AI cho nen tang hoc tieng Anh Web Study English AI",
    lifespan=lifespan,
)

app.include_router(health.router)
app.include_router(forgetting.router)
app.include_router(vision.router)
app.include_router(rag.router)
