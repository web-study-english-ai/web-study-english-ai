"""Sinh vector dung chung cho kho tri thuc, tu vung va cau hoi (WSEA-110).

Day la noi DUY NHAT quyet dinh cach ma hoa: mo hinh, revision, tien to, chuan hoa.
Script nap du lieu (scripts/embed_kb.py) va endpoint /assistant/embed sau nay deu
goi qua day, de vector luc nap va vector luc hoi luon cung mot cach tinh.
Doi bat ky hang so nao o day thi phai sinh lai toan bo vector da luu.

Mo hinh duoc nap LUOI (lan encode dau tien): import module nay khong keo theo
torch/sentence-transformers.
"""

from __future__ import annotations

import numpy as np

MODEL_NAME = "intfloat/multilingual-e5-small"
# Lay tu docs/kb/embedder_comparison.json (so sanh 3 mo hinh, WSEA-110).
MODEL_REVISION = "614241f622f53c4eeff9890bdc4f31cfecc418b3"
DIM = 384
QUERY_PREFIX = "query: "
PASSAGE_PREFIX = "passage: "
NORM_TOLERANCE = 1e-3


def word_text(term: str, pos: str, meaning_vi: str) -> str:
    """Van ban dai dien cho mot tu vung, vi du 'grateful (adj): biet on'."""
    return f"{term} ({pos}): {meaning_vi}"


def normalize_term(term: str) -> str:
    """Chuan hoa tu tieng Anh giong seed backend (trim + chu thuong) de khop words.term.

    vocab_7000.csv tung bi Excel doi true/false thanh TRUE/FALSE; seed luu chu thuong.
    """
    return term.strip().lower()


def model_info() -> dict:
    """Thong tin cach ma hoa, ghi kem moi lan sinh vector de doi chieu ve sau."""
    return {
        "model": MODEL_NAME,
        "revision": MODEL_REVISION,
        "dim": DIM,
        "query_prefix": QUERY_PREFIX,
        "passage_prefix": PASSAGE_PREFIX,
    }


class Embedder:
    """Bao quanh SentenceTransformer, tu them tien to va kiem tra dau ra.

    `model` chi dung de truyen mo hinh gia trong test; binh thuong de None va
    mo hinh that duoc nap o lan encode dau tien.
    """

    def __init__(self, model=None, batch_size: int = 32):
        self._model = model
        self.batch_size = batch_size

    @property
    def model(self):
        if self._model is None:
            self._model = self._load_model()
        return self._model

    @staticmethod
    def _load_model():
        from sentence_transformers import SentenceTransformer

        return SentenceTransformer(MODEL_NAME, revision=MODEL_REVISION, device="cpu")

    def encode_queries(self, texts: list[str]) -> np.ndarray:
        return self._encode(texts, QUERY_PREFIX)

    def encode_passages(self, texts: list[str]) -> np.ndarray:
        return self._encode(texts, PASSAGE_PREFIX)

    def _encode(self, texts: list[str], prefix: str) -> np.ndarray:
        if isinstance(texts, str):
            raise TypeError("texts phai la list[str], khong phai mot chuoi")
        if not texts:
            return np.zeros((0, DIM), dtype=np.float32)
        vectors = self.model.encode(
            [prefix + t for t in texts],
            batch_size=self.batch_size,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        vectors = np.asarray(vectors, dtype=np.float32)
        check_vectors(vectors, expected_rows=len(texts))
        return vectors


def check_vectors(vectors: np.ndarray, expected_rows: int | None = None) -> None:
    """Bao loi neu sai so chieu, co NaN/inf hoac chua chuan hoa L2.

    Dung raise thay vi assert de kiem tra van chay khi Python bat -O.
    """
    if vectors.ndim != 2 or vectors.shape[1] != DIM:
        raise ValueError(f"vector sai so chieu: shape {vectors.shape}, can (n, {DIM})")
    if expected_rows is not None and vectors.shape[0] != expected_rows:
        raise ValueError(f"so vector {vectors.shape[0]} khac so van ban {expected_rows}")
    if not np.isfinite(vectors).all():
        raise ValueError("vector co NaN hoac inf")
    norms = np.linalg.norm(vectors, axis=1)
    bad = np.flatnonzero(np.abs(norms - 1.0) > NORM_TOLERANCE)
    if bad.size:
        raise ValueError(
            f"{bad.size} vector chua chuan hoa L2 (vi du dong {int(bad[0])}: chuan {norms[bad[0]]:.4f})"
        )
