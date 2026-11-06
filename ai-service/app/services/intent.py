"""Phan loai y dinh cau hoi bang LogisticRegression tren vector e5 (WSEA-125).

Trong so xuat boi scripts/train_intent.py --export ra app/resources/intent_e5_lr_v1.json.
Suy luan chi dung numpy (softmax cua coef @ x + intercept), KHONG can sklearn trong image.
Dau vao la vector da sinh boi app.services.embedder.Embedder.encode_queries
(tien to "query: ", chuan hoa L2) — dung vector "passage: " se sai ma khong bao loi.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app.services import embedder as emb

FORMAT_VERSION = 1
DEFAULT_PATH = Path(__file__).resolve().parents[1] / "resources" / "intent_e5_lr_v1.json"
# Thu tu phai trung kb/intent/label_map.json (kb/ khong vao image nen chep o day;
# tests/test_intent.py kiem hai noi khop nhau).
LABELS = ("nghia_tu", "cach_dung", "ngu_phap", "phan_biet", "ngoai_pham_vi")
OUT_OF_SCOPE = "ngoai_pham_vi"


@dataclass(frozen=True)
class IntentResult:
    label: str
    confidence: float
    probs: dict[str, float]


class IntentClassifier:
    def __init__(self, labels: list[str], coef: np.ndarray, intercept: np.ndarray, tau: float):
        self.labels = list(labels)
        self.coef = coef
        self.intercept = intercept
        self.tau = tau

    @classmethod
    def load(cls, path: Path | str = DEFAULT_PATH) -> "IntentClassifier":
        with Path(path).open(encoding="utf-8") as f:
            return cls.from_dict(json.load(f))

    @classmethod
    def from_dict(cls, data: dict) -> "IntentClassifier":
        """Kiem file trong so; sai bat ky muc nao -> ValueError noi ro muc nao."""
        if data.get("format_version") != FORMAT_VERSION:
            raise ValueError(f"format_version {data.get('format_version')!r}, cần {FORMAT_VERSION}")
        labels = data.get("labels")
        if labels != list(LABELS):
            raise ValueError(f"labels {labels!r} không khớp label_map {list(LABELS)}")
        _check_embedder(data.get("embedder") or {})
        coef = np.asarray(data.get("coef"), dtype=np.float64)
        intercept = np.asarray(data.get("intercept"), dtype=np.float64)
        if coef.shape != (len(LABELS), emb.DIM):
            raise ValueError(f"coef shape {coef.shape}, cần {(len(LABELS), emb.DIM)}")
        if intercept.shape != (len(LABELS),):
            raise ValueError(f"intercept shape {intercept.shape}, cần {(len(LABELS),)}")
        if not (np.isfinite(coef).all() and np.isfinite(intercept).all()):
            raise ValueError("coef/intercept có NaN hoặc inf")
        tau = data.get("tau_oos")
        if not isinstance(tau, (int, float)) or isinstance(tau, bool) or not 0 < tau < 1:
            raise ValueError(f"tau_oos {tau!r} phải nằm trong (0, 1)")
        return cls(labels, coef, intercept, float(tau))

    def predict_proba(self, vecs: np.ndarray) -> np.ndarray:
        x = np.asarray(vecs, dtype=np.float64)
        if x.ndim != 2 or x.shape[1] != self.coef.shape[1]:
            raise ValueError(f"vector sai chiều: shape {x.shape}, cần (n, {self.coef.shape[1]})")
        if not np.isfinite(x).all():
            raise ValueError("vector có NaN hoặc inf")
        logits = x @ self.coef.T + self.intercept
        logits -= logits.max(axis=1, keepdims=True)  # on dinh so: exp khong tran
        p = np.exp(logits)
        return p / p.sum(axis=1, keepdims=True)

    def predict(self, vecs: np.ndarray) -> list[IntentResult]:
        proba = self.predict_proba(vecs)
        out = []
        for row in proba:
            k = int(row.argmax())
            out.append(IntentResult(self.labels[k], float(row[k]),
                                    {lb: float(p) for lb, p in zip(self.labels, row)}))
        return out

    def is_out_of_scope(self, result: IntentResult) -> bool:
        """Luat chan som: doan ngoai_pham_vi VA do tin cay >= tau."""
        return result.label == OUT_OF_SCOPE and result.confidence >= self.tau


def _check_embedder(info: dict) -> None:
    expected = {"model": emb.MODEL_NAME, "revision": emb.MODEL_REVISION, "dim": emb.DIM,
                "query_prefix": emb.QUERY_PREFIX}
    bad = [f"{k}={info.get(k)!r} (cần {v!r})" for k, v in expected.items() if info.get(k) != v]
    if bad:
        raise ValueError("embedder không khớp app/services/embedder.py: " + ", ".join(bad))
