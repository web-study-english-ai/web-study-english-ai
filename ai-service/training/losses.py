"""Ham mat mat entropy cheo nhi phan cho bai toan du bao quen (WSEA-41 buoc 3).

Nhan y = 1 nghia la nguoi hoc NHO duoc (rating > 1), y = 0 nghia la QUEN.
Du doan p la xac suat truy xuat R(t, S) do mo hinh tinh ra.
"""
from __future__ import annotations

import torch
import torch.nn.functional as F

EPS = 1e-6


class TrainingError(RuntimeError):
    """Loi lam hong qua trinh huan luyen - dung ngay thay vi chay tiep vo nghia."""


def check_finite(t: torch.Tensor, name: str) -> None:
    if not torch.isfinite(t).all():
        n_nan = int(torch.isnan(t).sum())
        n_inf = int(torch.isinf(t).sum())
        raise TrainingError(
            f"{name} co gia tri khong huu han: {n_nan} NaN, {n_inf} Inf. "
            "Kiem tra: clamp do ben/do kho, elapsed am, lr qua lon."
        )


def bce_loss(preds: torch.Tensor, labels: torch.Tensor, eps: float = EPS) -> torch.Tensor:
    """Entropy cheo nhi phan trung binh tren cac luot on hop le.

    preds, labels da duoc mo hinh loc theo mask va lam phang thanh vector 1 chieu.

    Hai chi tiet bat buoc:
      - clamp xac suat ve [eps, 1-eps]: log(0) la am vo cung, chi mot mau
        co p dung bang 0 hoac 1 la ca lo thanh NaN.
      - kiem tra huu han ngay sau khi tinh: bat loi som thay vi huan luyen
        50 epoch roi moi phat hien ket qua rac.
    """
    if preds.numel() == 0:
        raise TrainingError("Lo khong co luot on hop le nao - kiem tra mask va min_len.")
    if preds.shape != labels.shape:
        raise TrainingError(f"Lech hinh dang: preds {tuple(preds.shape)} vs labels {tuple(labels.shape)}")

    check_finite(preds, "preds")
    p = preds.clamp(eps, 1.0 - eps)
    loss = F.binary_cross_entropy(p, labels.float(), reduction="mean")
    check_finite(loss, "loss")
    return loss


@torch.no_grad()
def batch_stats(preds: torch.Tensor, labels: torch.Tensor) -> dict[str, float]:
    """Thong ke nhanh mot lo - de in ra khi co su co."""
    return {
        "n": int(preds.numel()),
        "p_min": float(preds.min()),
        "p_mean": float(preds.mean()),
        "p_max": float(preds.max()),
        "y_mean": float(labels.float().mean()),
    }
