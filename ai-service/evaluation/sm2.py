"""Duong co so SM-2 (WSEA-67).

Cai theo DAC TA GOC (Wozniak, 1990), khong theo doan ma trong cam nang:
  - Khi quen (q < 3): hoc lai tu dau va KHONG doi he so de EF (buoc 6 dac ta).
  - Khoang cach lam tron LEN (buoc 3 dac ta: "round it up").
Nguon: https://www-v1.supermemo.com/archives1990-2015/english/ol/sm2

SM-2 khong cho ra xac suat. De so log-loss/AUC voi DSR, coi khoang cach SM-2 dat
la do ben S roi ap CUNG cong thuc R(t, S) cua DSR. Cach quy doi nay phai ghi ro
trong bao cao.
"""
from __future__ import annotations

import math
from typing import Any, Sequence

import numpy as np

from app.models.fsrs import DECAY, FACTOR

# 4 nut bam -> thang SM-2 0..5. Khi quen EF khong doi nen moi gia tri < 3 cho
# "Chua nho" deu cho cung ket qua; lua chon thuc su chi la Kho -> 3.
QUALITY = {1: 1, 2: 3, 3: 4, 4: 5}
EF_START = 2.5
EF_MIN = 1.3


def sm2_step(interval: int, reps: int, ef: float, q: int) -> tuple[int, int, float]:
    """Mot luot on SM-2. Tra ve (khoang cach moi, so lan dung lien tiep, EF moi)."""
    if q < 3:
        return 1, 0, ef
    if reps == 0:
        interval = 1
    elif reps == 1:
        interval = 6
    else:
        # round(..., 6) chan sai so so thuc: 2.5 * 6 co the thanh 15.000000000000002
        interval = math.ceil(round(interval * ef, 6))
    ef = max(EF_MIN, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
    return interval, reps + 1, ef


def sm2_predict(seqs: Sequence[dict[str, Any]]) -> np.ndarray:
    """Xac suat nho theo SM-2 cho moi luot tu luot thu 2.

    Thu tu dau ra: het chuoi 0 roi toi chuoi 1..., trong moi chuoi theo vi tri.
    """
    preds: list[float] = []
    for s in seqs:
        ratings, elapsed = s["ratings"], s["elapsed"]
        interval, reps, ef = sm2_step(0, 0, EF_START, QUALITY[int(ratings[0])])
        for i in range(1, len(ratings)):
            preds.append((1 + FACTOR * float(elapsed[i]) / interval) ** DECAY)
            interval, reps, ef = sm2_step(interval, reps, ef, QUALITY[int(ratings[i])])
    return np.asarray(preds, dtype=np.float64)