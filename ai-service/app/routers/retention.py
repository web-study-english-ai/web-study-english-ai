"""Router POST /predict-retention - du bao kha nang nho va khoang on (WSEA-81)."""

from __future__ import annotations

import logging
import math
import time

import torch
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.config import settings
from app.deps import verify_internal_api_key
from app.models.schemas import (
    CardOut,
    PredictRetentionRequest,
    PredictRetentionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["retention"],
    dependencies=[Depends(verify_internal_api_key)],
)


def _to_tensors(cards) -> tuple[torch.Tensor, ...]:
    """Gom ca lo the thanh tensor. Mot lan chuyen doi, khong vong lap tung the."""
    # The moi khong co S/D - dien 1.0 / 5.0 lam gia tri giu cho hop le.
    # predict_step se bo qua chung theo co is_new.
    stability = torch.tensor(
        [c.stability if c.stability is not None else 1.0 for c in cards],
        dtype=torch.float32,
    )
    difficulty = torch.tensor(
        [c.difficulty if c.difficulty is not None else 5.0 for c in cards],
        dtype=torch.float32,
    )
    elapsed = torch.tensor([c.elapsed_days for c in cards], dtype=torch.float32)
    rating = torch.tensor([c.rating for c in cards], dtype=torch.long)
    is_new = torch.tensor([c.is_new for c in cards], dtype=torch.bool)
    return stability, difficulty, elapsed, rating, is_new


def _check_finite(
    retrievability: torch.Tensor,
    new_stability: torch.Tensor,
    new_difficulty: torch.Tensor,
    interval_days: torch.Tensor,
    is_new: torch.Tensor,
) -> None:
    """Chan NaN/Inf truoc khi tra ve backend.

    NaN cua retrievability o cac the moi la co chu dinh nen bo qua; moi gia tri
    khong huu han khac deu la loi. Tha bao hong con hon de backend ghi mot lich
    on vo nghia vao co so du lieu cua nguoi hoc.
    """
    bad = []
    if not torch.isfinite(retrievability[~is_new]).all():
        bad.append("retrievability")
    if not torch.isfinite(new_stability).all():
        bad.append("new_stability")
    if not torch.isfinite(new_difficulty).all():
        bad.append("new_difficulty")
    if not torch.isfinite(interval_days).all():
        bad.append("interval_days")
    if bad:
        raise ValueError(f"Mo hinh tra gia tri khong huu han o: {', '.join(bad)}")


@router.post("/predict-retention", response_model=PredictRetentionResponse)
async def predict_retention(
    payload: PredictRetentionRequest, request: Request
) -> PredictRetentionResponse:
    """Nhan mot lo the vua duoc on, tra ve R, S moi, D moi va khoang on ke tiep."""
    model = request.app.state.models.get("fsrs")
    meta = request.app.state.model_meta

    if model is None:
        # Hop dong: backend retry mot lan sau 2 giay roi dung fallback TypeScript.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mo hinh du bao chua san sang. Dung fallback phia backend.",
        )

    started = time.perf_counter()
    cards = payload.cards

    try:
        stability, difficulty, elapsed, rating, is_new = _to_tensors(cards)

        # model.eval() da goi luc nap; no_grad de khong dung bo nho cho autograd.
        model.eval()
        with torch.no_grad():
            retrievability, new_stability, new_difficulty, interval_days = (
                model.predict_step(
                    stability=stability,
                    difficulty=difficulty,
                    elapsed_days=elapsed,
                    rating=rating,
                    is_new=is_new,
                    max_interval=settings.fsrs_max_interval,
                )
            )

        _check_finite(
            retrievability, new_stability, new_difficulty, interval_days, is_new
        )
    except Exception as exc:  # noqa: BLE001 - khong de traceback van ra ngoai
        logger.error(
            "Loi khi du bao cho %d the (%s): %s",
            len(cards),
            type(exc).__name__,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Mo hinh du bao gap loi. Dung fallback phia backend.",
        ) from exc

    r_list = retrievability.tolist()
    s_list = new_stability.tolist()
    d_list = new_difficulty.tolist()
    i_list = interval_days.tolist()

    results = [
        CardOut(
            card_id=card.card_id,
            # NaN cua the moi doi thanh None mot cach tuong minh: JSON khong co NaN,
            # va ta khong muon phu thuoc vao cach Pydantic xu ly gia tri nay.
            retrievability=None if math.isnan(r) else r,
            new_stability=s,
            new_difficulty=d,
            interval_days=int(i),
        )
        for card, r, s, d, i in zip(cards, r_list, s_list, d_list, i_list)
    ]

    elapsed_ms = (time.perf_counter() - started) * 1000
    # So lieu nay la dau vao san cho WSEA-80 (do va toi uu hieu nang).
    logger.info(
        "predict-retention: %d the trong %.1f ms (%.3f ms/the), model=%s",
        len(cards),
        elapsed_ms,
        elapsed_ms / len(cards),
        meta.get("version"),
    )

    return PredictRetentionResponse(
        results=results, model_version=str(meta.get("version"))
    )
