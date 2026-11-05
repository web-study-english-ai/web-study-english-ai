"""Router /recognize/image - nhan dien vat the trong anh bang CLIP zero-shot roi tra ve tu vung (WSEA-153).

Nhan dien VAT THE, khong phai OCR. Mo hinh nap mot lan trong lifespan (app.state.models["vision"]).
Hop dong: docs/API_CONTRACT.md muc POST /recognize/image (nhap v0.4).
"""

import logging
import time

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.deps import verify_internal_api_key
from app.models.schemas import RecognizedLabel, VisionResponse
from app.vision import preprocess as pp

logger = logging.getLogger(__name__)

TOP_K = 10

router = APIRouter(
    prefix="/recognize",
    tags=["vision"],
    dependencies=[Depends(verify_internal_api_key)],
)


async def _read_limited(upload: UploadFile) -> bytes:
    """Doc toi da MAX_BYTES+1 byte: file lon hon gioi han bi tu choi ma khong doc het vao RAM."""
    limit = pp.MAX_BYTES
    data = await upload.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=f"Anh vuot gioi han {limit // 1024 // 1024} MB")
    return data


def _predict(clf, data: bytes):
    return clf.predict(pp.load_image(data), k=TOP_K)


@router.post("/image", response_model=VisionResponse)
async def recognize_image(request: Request, image: UploadFile = File(...)) -> VisionResponse:
    """Anh -> top-10 {word, score} + low_confidence (top-1 score < tau)."""
    clf = request.app.state.models.get("vision")
    if clf is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Mo hinh nhan dien anh chua nap")
    data = await _read_limited(image)
    started = time.perf_counter()
    try:
        top = await run_in_threadpool(_predict, clf, data)
    except pp.ImageError as exc:
        code = (status.HTTP_413_REQUEST_ENTITY_TOO_LARGE if exc.code in (pp.TOO_LARGE, pp.TOO_MANY_PIXELS)
                else status.HTTP_422_UNPROCESSABLE_ENTITY)
        raise HTTPException(status_code=code, detail=f"{exc.code}: {exc.message}") from exc
    except ValueError as exc:  # vector anh NaN/0 tu mo hinh
        logger.error("Mo hinh anh tra vector khong hop le: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Mo hinh nhan dien anh tra ket qua khong hop le") from exc
    ms = (time.perf_counter() - started) * 1000
    request.state.timings = {"vision": ms}
    tau = settings.vision_tau
    low = not top or top[0]["score"] < tau
    logger.info("recognize: %d byte, top1=%s %.3f, low=%s, %.0f ms", len(data),
                top[0]["word"] if top else None, top[0]["score"] if top else 0.0, low, ms)
    return VisionResponse(labels=[RecognizedLabel(word=t["word"], score=min(max(t["score"], 0.0), 1.0))
                                  for t in top], low_confidence=low, tau=tau)
