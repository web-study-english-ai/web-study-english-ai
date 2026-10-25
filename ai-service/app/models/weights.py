"""Nap trong so mo hinh du bao quen tu Hugging Face Hub (WSEA-81).

Chi duoc goi MOT LAN trong lifespan cua FastAPI (quy tac 4 cua CLAUDE.md).

Vi sao doc params.json chu khong phai best.pt:
  - params.json chi chua 17 so, khoang 500 byte; best.pt nang hon nhieu lan va
    keo theo ca state_dict lan config - khong can thiet cho suy luan.
  - torch.load tren file tai tu mang co the thuc thi ma tuy y. Doc JSON thi khong.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.models.fsrs import N_PARAMS, W_MAX, W_MIN, FSRSModel

logger = logging.getLogger(__name__)

DEFAULT_VERSION = "default-untrained"


class WeightsError(RuntimeError):
    """Trong so tai ve khong dung dinh dang hoac ngoai mien hop le."""


def _validate(w: Any) -> list[float]:
    """Kiem tra 17 tham so truoc khi nap vao mo hinh.

    Tha tu choi nap con hon phuc vu so lieu tinh tu trong so rac: backend da co
    fallback TypeScript (NF-12), con mot lich on sai thi nguoi hoc khong biet ma sua.
    """
    if not isinstance(w, list):
        raise WeightsError(f"Truong 'w' phai la list, nhan duoc {type(w).__name__}")

    if len(w) != N_PARAMS:
        raise WeightsError(f"Can dung {N_PARAMS} tham so, file co {len(w)}")

    out: list[float] = []
    for i, (value, lo, hi) in enumerate(zip(w, W_MIN, W_MAX)):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise WeightsError(f"w[{i}] khong phai so: {value!r}")
        value = float(value)
        if value != value or value in (float("inf"), float("-inf")):
            raise WeightsError(f"w[{i}] khong huu han: {value}")
        if not (lo <= value <= hi):
            raise WeightsError(f"w[{i}] = {value} nam ngoai mien hop le [{lo}, {hi}]")
        out.append(value)
    return out


def _load_from_hub(settings: Any) -> tuple[list[float], dict]:
    """Tai va doc params.json tu HF Hub. Nem ngoai le neu that bai."""
    from huggingface_hub import hf_hub_download

    token = settings.hf_token.get_secret_value() if settings.hf_token else None
    if not token:
        raise WeightsError(
            "Thieu HF_TOKEN. Repo trong so la private nen bat buoc phai co token."
        )

    # Truyen token= TRUC TIEP, khong trong vao login ngam - da tung dinh 401/403
    # vi dieu nay (xem PROGRESS.md muc 7).
    path = hf_hub_download(
        repo_id=settings.fsrs_weights_repo,
        filename=settings.fsrs_weights_file,
        revision=settings.fsrs_weights_revision,
        token=token,
    )
    with open(path, encoding="utf-8") as f:
        payload = json.load(f)

    w = _validate(payload.get("w"))
    meta = {
        "version": payload.get("version") or settings.fsrs_weights_revision,
        "source": "hub",
        "repo": settings.fsrs_weights_repo,
        "revision": settings.fsrs_weights_revision,
        "epoch": payload.get("epoch"),
        "val_log_loss": payload.get("val_log_loss"),
    }
    return w, meta


def load_fsrs(settings: Any) -> tuple[FSRSModel | None, dict]:
    """Tra ve (model, metadata). model la None khi khong nap duoc.

    KHONG nem ngoai le ra ngoai: neu lifespan nem thi container chet va HF Spaces
    se restart lien tuc, ca /health cung khong goi duoc - rat kho chan doan tu xa.
    Thay vao do tra None, de /health bao degraded (503) va endpoint tra 503.

    Cung KHONG am tham roi ve DEFAULT_W khi source=hub: trong so chua huan luyen
    van cho ra so lieu trong hop ly, nen loi se lot len production ma khong ai biet.
    """
    if settings.fsrs_weights_source == "default":
        logger.warning(
            "FSRS_WEIGHTS_SOURCE=default - dung 17 tham so MAC DINH chua huan luyen. "
            "Chi dung cho test va CI, khong duoc dung tren production."
        )
        model = FSRSModel()
        model.eval()
        return model, {"version": DEFAULT_VERSION, "source": "default"}

    try:
        w, meta = _load_from_hub(settings)
    except Exception as exc:  # noqa: BLE001 - co y bat rong, xem docstring
        logger.error(
            "Khong nap duoc trong so FSRS tu %s@%s (%s): %s. "
            "Dich vu chay o trang thai degraded, /predict-retention se tra 503.",
            settings.fsrs_weights_repo,
            settings.fsrs_weights_revision,
            type(exc).__name__,
            exc,
        )
        return None, {"version": None, "source": "hub", "error": type(exc).__name__}

    model = FSRSModel(w)
    model.eval()
    logger.info(
        "Da nap trong so FSRS %s tu %s@%s (val_log_loss=%s)",
        meta["version"],
        meta["repo"],
        meta["revision"],
        meta["val_log_loss"],
    )
    return model, meta
