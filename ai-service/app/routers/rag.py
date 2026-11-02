"""Router /assistant - vector cau hoi (/embed), pipeline truy hoi (/rank), tro ly hoi dap (/ask)."""

import json
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
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
from app.services import pipeline_rules as rules
from app.services.answer import StreamCleaner, postprocess
from app.services.embedder import DIM, MODEL_NAME, MODEL_REVISION
from app.services.llm import EMPTY_CONTENT, LLMStream, LLMStreamError, LLMUnavailable
from app.services.pipeline import PipelineResult, run_pipeline
from app.services.prompts import TEXT_NO_CONTEXT, TEXT_OUT_OF_SCOPE, build_messages

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


async def _pipeline(payload: AskRequest, request: Request) -> PipelineResult:
    """Chung cho /rank va /ask: embedder chua nap -> 503; vector/y dinh hong -> 500."""
    models = request.app.state.models
    embedder = models.get("embedder")
    if embedder is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mo hinh embedding chua nap",
        )
    try:
        return await run_in_threadpool(
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


@router.post("/rank", response_model=RankResponse)
async def rank(payload: AskRequest, request: Request) -> RankResponse:
    """Pipeline truy hoi truoc LLM: quyet dinh tra loi/chan + chon ngu canh (WSEA-127).

    Cung body voi /ask. Luat o app/services/pipeline_rules.py.
    """
    result = await _pipeline(payload, request)

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


FIXED_TEXT = {rules.OUT_OF_SCOPE: TEXT_OUT_OF_SCOPE, rules.NO_CONTEXT: TEXT_NO_CONTEXT}


def _llm_503(reason: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"Khong goi duoc LLM ({reason})",
    )


# --- SSE (B4) ------------------------------------------------------------------------------------
SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
SSE_DONE = b"data: [DONE]\n\n"


def _sse(obj: dict) -> bytes:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n".encode("utf-8")


async def _fixed_events(text: str):
    yield _sse({"delta": text})
    yield _sse({"answer": text, "source_ids": []})
    yield SSE_DONE


async def _llm_events(st: LLMStream, contexts: list, question_len: int, first_ms: float):
    """Delta da sach -> khung cuoi -> [DONE]. Loi giua luong: log + dong, KHONG gui khung cuoi."""
    cleaner = StreamCleaner()
    started = time.perf_counter()
    try:
        async for piece in st.chunks():
            delta = cleaner.feed(piece)
            if delta:
                yield _sse({"delta": delta})
        tail, answer, source_ids = cleaner.finish(contexts)
        if not answer:
            logger.error("ask/sse: cau tra loi rong sau hau xu ly (model %s), dong luong", st.model_used)
            return
        if tail:
            yield _sse({"delta": tail})
        yield _sse({"answer": answer, "source_ids": source_ids})
        yield SSE_DONE
        logger.info("ask/sse: model=%s attempts=%d finish=%s usage=%s cau_hoi=%d ky_tu nguon=%d "
                    "dau=%.0f ms luong=%.0f ms", st.model_used, st.attempts, st.finish_reason, st.usage,
                    question_len, len(source_ids), first_ms, (time.perf_counter() - started) * 1000)
    except LLMStreamError as exc:
        logger.error("ask/sse: luong dut giua chung (%s, model %s), khong gui khung cuoi", exc, st.model_used)
    finally:
        await st.aclose()


async def _ask_sse(payload: AskRequest, request: Request) -> StreamingResponse:
    """Loi TRUOC khung dau -> HTTPException (503...) nhu JSON; sau do chi co the dong luong."""
    result = await _pipeline(payload, request)
    timings = dict(result.timings)
    request.state.timings = timings
    if result.decision != rules.ANSWER:
        logger.info("ask/sse: %s (%s), khong goi LLM", result.decision, result.reason)
        return StreamingResponse(_fixed_events(FIXED_TEXT[result.decision]), media_type="text/event-stream",
                                 headers=SSE_HEADERS)

    llm = getattr(request.app.state, "llm", None)
    if llm is None:
        raise _llm_503("not_initialized")
    started = time.perf_counter()
    try:
        st = await llm.open_stream(build_messages(payload, result))
    except LLMUnavailable as exc:
        logger.error("ask/sse: LLM loi %s sau %d lan goi truoc token dau, cau hoi %d ky tu",
                     exc.reason, exc.attempts, len(payload.question))
        raise _llm_503(exc.reason) from exc
    timings["llm_first"] = (time.perf_counter() - started) * 1000
    return StreamingResponse(_llm_events(st, result.contexts, len(payload.question), timings["llm_first"]),
                             media_type="text/event-stream", headers=SSE_HEADERS)


@router.post("/ask", response_model=AskResponse)
async def ask(payload: AskRequest, request: Request) -> AskResponse:
    """Tra loi cau hoi (JSON): pipeline WSEA-127 -> prompt -> LLM -> trich nguon (WSEA-140).

    decision != "answer" -> cau co dinh, source_ids [], KHONG goi LLM.
    """
    if "text/event-stream" in request.headers.get("accept", ""):
        return await _ask_sse(payload, request)

    result = await _pipeline(payload, request)
    timings = dict(result.timings)
    request.state.timings = timings
    if result.decision != rules.ANSWER:
        logger.info("ask: %s (%s), khong goi LLM", result.decision, result.reason)
        return AskResponse(answer=FIXED_TEXT[result.decision], source_ids=[])

    llm = getattr(request.app.state, "llm", None)
    if llm is None:
        raise _llm_503("not_initialized")

    started = time.perf_counter()
    try:
        out = await llm.complete(build_messages(payload, result))
    except LLMUnavailable as exc:
        timings["llm"] = (time.perf_counter() - started) * 1000
        logger.error("ask: LLM loi %s sau %d lan goi, cau hoi %d ky tu",
                     exc.reason, exc.attempts, len(payload.question))
        raise _llm_503(exc.reason) from exc
    timings["llm"] = (time.perf_counter() - started) * 1000

    answer, source_ids = postprocess(out.text, result.contexts)
    if not answer:
        logger.error("ask: cau tra loi rong sau khi xoa ky hieu trich (model %s)", out.model_used)
        raise _llm_503(EMPTY_CONTENT)
    logger.info("ask: model=%s attempts=%d finish=%s usage=%s cau_hoi=%d ky_tu nguon=%d llm=%.0f ms",
                out.model_used, out.attempts, out.finish_reason, out.usage, len(payload.question),
                len(source_ids), timings["llm"])
    return AskResponse(answer=answer, source_ids=source_ids)
