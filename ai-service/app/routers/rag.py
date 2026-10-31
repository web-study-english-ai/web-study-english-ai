"""Router /assistant - sinh vector cau hoi (/embed) va tro ly hoi dap (/ask, stub)."""

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from starlette.concurrency import run_in_threadpool

from app.deps import verify_internal_api_key
from app.models.schemas import AskRequest, AskResponse, EmbedRequest, EmbedResponse
from app.services.embedder import DIM, MODEL_NAME, MODEL_REVISION

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/assistant",
    tags=["rag"],
    dependencies=[Depends(verify_internal_api_key)],
)


@router.post("/embed", response_model=EmbedResponse)
async def embed(payload: EmbedRequest, request: Request) -> EmbedResponse:
    """Sinh vector 384 chieu (da chuan hoa L2) cho cau hoi de backend truy van pgvector.

    Tien to "query: " va chuan hoa do embedder.py lam, giong luc nap kho tri thuc.
    """
    embedder = request.app.state.models.get("embedder")
    if embedder is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mo hinh embedding chua nap",
        )

    started = time.perf_counter()
    try:
        # encode chay CPU nang -> day ra threadpool de khong chan event loop.
        vectors = await run_in_threadpool(embedder.encode_queries, [payload.text])
    except ValueError as exc:
        # check_vectors bao vector hong (sai chieu, NaN, chua chuan hoa).
        logger.error("Vector embedding khong hop le: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Mo hinh embedding tra vector khong hop le",
        ) from exc
    embed_ms = (time.perf_counter() - started) * 1000

    request.state.timings = {"embed": embed_ms}
    logger.info("embed: %d ky tu trong %.1f ms", len(payload.text), embed_ms)

    return EmbedResponse(
        embedding=vectors[0].tolist(),
        model=MODEL_NAME,
        revision=MODEL_REVISION,
        dim=DIM,
    )


@router.post("/ask", response_model=AskResponse)
async def ask(payload: AskRequest) -> AskResponse:
    """Tra loi cau hoi cua nguoi hoc dua tren ngu lieu da index (RAG).

    TODO(WSEA): truy hoi pgvector va sinh cau tra loi.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Chuc nang tro ly hoi dap chua duoc trien khai",
    )
