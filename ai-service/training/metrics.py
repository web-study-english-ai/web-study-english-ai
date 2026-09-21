"""Chi so danh gia dung trong vong huan luyen (WSEA-41) va o dot danh gia.

Dat o day de dot sau (danh gia mo hinh, so voi SM-2) dung lai chinh cac ham nay
- so lieu trong bao cao va so lieu theo doi luc huan luyen phai cung mot cach tinh.
"""
from __future__ import annotations

import numpy as np

EPS = 1e-6


def log_loss(p: np.ndarray, y: np.ndarray) -> float:
    p = np.clip(np.asarray(p, dtype=np.float64), EPS, 1 - EPS)
    y = np.asarray(y, dtype=np.float64)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def rmse_bins(p: np.ndarray, y: np.ndarray, n_bins: int = 10) -> float:
    """RMSE theo nhom - do do LECH HIEU CHINH, khong phai do chinh xac tung mau.

    Chia du doan thanh n_bins nhom theo gia tri, trong moi nhom so sanh xac suat
    du doan trung binh voi ty le nho thuc te. Day la chi so cong dong FSRS dung.
    """
    p = np.asarray(p, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1]), 0, n_bins - 1)
    num, den = 0.0, 0.0
    for b in range(n_bins):
        m = idx == b
        if not m.any():
            continue
        w = m.sum()
        num += w * (p[m].mean() - y[m].mean()) ** 2
        den += w
    return float(np.sqrt(num / den)) if den else float("nan")


def auc(p: np.ndarray, y: np.ndarray) -> float:
    """AUC tinh bang cong thuc hang (Mann-Whitney), khong can sklearn."""
    p = np.asarray(p, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    n_pos, n_neg = float((y == 1).sum()), float((y == 0).sum())
    if n_pos == 0 or n_neg == 0:
        return float("nan")
    order = np.argsort(p, kind="mergesort")
    ranks = np.empty(len(p), dtype=np.float64)
    ranks[order] = np.arange(1, len(p) + 1, dtype=np.float64)
    # xu ly gia tri bang nhau: gan hang trung binh
    sp = p[order]
    i = 0
    while i < len(sp):
        j = i
        while j + 1 < len(sp) and sp[j + 1] == sp[i]:
            j += 1
        if j > i:
            avg = (i + j + 2) / 2.0
            ranks[order[i : j + 1]] = avg
        i = j + 1
    return float((ranks[y == 1].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def calibration_table(p: np.ndarray, y: np.ndarray, n_bins: int = 10) -> list[dict]:
    """Bang hieu chinh - nguon cho bieu do o dot danh gia.

    Luu y trung thuc: du lieu on tap gan nhu khong co vung xac suat thap,
    nen nua trai cua bang se thua hoac trong. Giu nguyen, ghi chu ro trong
    bao cao thay vi cat bo cho dep.
    """
    p = np.asarray(p, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1]), 0, n_bins - 1)
    rows = []
    for b in range(n_bins):
        m = idx == b
        rows.append(
            {
                "bin": f"[{edges[b]:.1f}, {edges[b+1]:.1f})",
                "n": int(m.sum()),
                "p_mean": float(p[m].mean()) if m.any() else None,
                "y_rate": float(y[m].mean()) if m.any() else None,
            }
        )
    return rows


def all_metrics(p: np.ndarray, y: np.ndarray) -> dict[str, float]:
    return {
        "log_loss": log_loss(p, y),
        "rmse_bins": rmse_bins(p, y),
        "auc": auc(p, y),
        "n": int(len(p)),
        "base_rate": float(np.mean(y)),
    }
