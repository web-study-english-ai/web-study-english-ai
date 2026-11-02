"""Router /assistant - vector cau hoi (/embed), pipeline truy hoi (/rank), tro ly hoi dap (/ask, stub)."""

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.deps import verify_internal_api_key
from app.models.schemas import (
    AskRequest,
    AskResponse,
    EmbedRequest,
    EmbedResponse,
    RankContext,
    RankIntent,
    RankResponse,
)
from app.services.embedder import DIM, MODEL_NAME, MODEL_REVISION
from app.services.pipeline import run_pipeline

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


@router.post("/rank", response_model=RankResponse)
async def rank(payload: AskRequest, request: Request) -> RankResponse:
    """Pipeline truy hoi truoc LLM: quyet dinh tra loi/chan + chon ngu canh (WSEA-127).

    Cung body voi /ask. Luat o app/services/pipeline_rules.py.
    """
    models = request.app.state.models
    embedder = models.get("embedder")
    if embedder is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mo hinh embedding chua nap",
        )

    try:
        result = await run_in_threadpool(
            run_pipeline,
            payload,
            embedder,
            models.get("intent"),
            k_prompt=settings.pipeline_k_prompt,
            k_vocab=settings.pipeline_k_vocab,
            max_top1_distance=settings.pipeline_max_top1_distance,
        )
    except ValueError as exc:
        # check_vectors / IntentClassifier bao vector hong.
        logger.error("Pipeline loi vector/y dinh: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Mo hinh embedding hoac y dinh tra ket qua khong hop le",
        ) from exc

    request.state.timings = result.timings
    logger.info("rank: %s (%s), %d doan", result.decision, result.reason, len(result.contexts))

    return RankResponse(
        decision=result.decision,
        reason=result.reason,
        intent=None if result.intent is None else RankIntent(
            label=result.intent.label, confidence=result.intent.confidence),
        contexts=[RankContext(id=c.id, distance=c.distance, rank=i)
                  for i, c in enumerate(result.contexts, 1)],
        vocab=[v.term for v in result.vocab],
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
