"""Phan loai anh zero-shot bang CLIP tren tap nhan tu vung (WSEA-152).

Thiet ke: docs/vision/WSEA-152_tap_nhan_va_tieu_chi.md muc 2.
- Vector nhan: ensemble TEMPLATES, moi cau chuan hoa L2, trung binh roi chuan hoa lai. Tinh sẵn MOT lan
  (build_label_vectors), luu .npy + manifest (save_label_vectors); luc chay chi nap (load_label_vectors),
  khong encode lai text (CLAUDE.md quy tac 5). Manifest chua ca danh sach tu (kb/ khong vao image).
- predict: vector anh chuan hoa -> logit_scale * cosine -> softmax tren toan bo nhan -> top-k.
Backend mo hinh tach rieng (HFClipBackend) de test dung backend gia, khong tai mo hinh that.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any, Protocol

import numpy as np

MODEL_NAME = "openai/clip-vit-base-patch32"
MODEL_REVISION = "3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268"  # ghim 2026-11-04 (metadata HF Hub)
TEMPLATES = ("a photo of a {w}.", "a close-up photo of a {w}.", "a photo of the {w}.")
FORMAT_VERSION = 1
RESOURCES = Path(__file__).resolve().parents[1] / "resources"
DEFAULT_VECTORS = RESOURCES / "vision_label_vectors.npy"
DEFAULT_MANIFEST = RESOURCES / "vision_label_vectors.json"
TOP_K = 5
NORM_TOL = 1e-3


class ClipBackend(Protocol):
    """Phan mo hinh can cho classifier. Vector tra ve CHUA chuan hoa."""

    logit_scale: float

    def encode_texts(self, texts: Sequence[str]) -> np.ndarray: ...  # (n, d)

    def encode_image(self, image: Any) -> np.ndarray: ...  # (d,)


def l2_normalize(x: np.ndarray, axis: int = -1) -> np.ndarray:
    x = np.asarray(x, dtype=np.float32)
    norm = np.linalg.norm(x, axis=axis, keepdims=True)
    if not np.isfinite(x).all() or (norm == 0).any():
        raise ValueError("vector có NaN/inf hoặc bằng 0")
    return x / norm


def build_label_vectors(backend: ClipBackend, words: Sequence[str],
                        templates: Sequence[str] = TEMPLATES) -> np.ndarray:
    """(n_nhan, d) float32: moi template ma hoa ca lo nhan, chuan hoa; trung binh qua template, chuan hoa lai."""
    if not words:
        raise ValueError("tập nhãn rỗng")
    if len(set(words)) != len(words):
        raise ValueError("tập nhãn có từ trùng")
    per_template = [l2_normalize(backend.encode_texts([t.format(w=w) for w in words])) for t in templates]
    return l2_normalize(np.mean(np.stack(per_template), axis=0))


def labels_sha256(words: Sequence[str]) -> str:
    return hashlib.sha256("\n".join(words).encode("utf-8")).hexdigest()


def save_label_vectors(vectors: np.ndarray, words: Sequence[str], *, rule_version: str, labels_source_sha256: str,
                       npy_path: Path = DEFAULT_VECTORS, manifest_path: Path = DEFAULT_MANIFEST,
                       model: str = MODEL_NAME, revision: str = MODEL_REVISION,
                       templates: Sequence[str] = TEMPLATES, logit_scale: float | None = None) -> dict:
    vectors = np.asarray(vectors, dtype=np.float32)
    if vectors.shape[0] != len(words):
        raise ValueError(f"{vectors.shape[0]} vector nhưng {len(words)} nhãn")
    npy_path.parent.mkdir(parents=True, exist_ok=True)
    np.save(npy_path, vectors)
    manifest = {"format_version": FORMAT_VERSION, "model": model, "revision": revision,
                "templates": list(templates), "n_labels": len(words), "dim": int(vectors.shape[1]),
                "rule_version": rule_version, "labels_source_sha256": labels_source_sha256,
                "labels_sha256": labels_sha256(words), "logit_scale": logit_scale,
                "vectors_sha256": hashlib.sha256(npy_path.read_bytes()).hexdigest(), "labels": list(words)}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def load_label_vectors(npy_path: Path = DEFAULT_VECTORS, manifest_path: Path = DEFAULT_MANIFEST, *,
                       model: str = MODEL_NAME, revision: str = MODEL_REVISION,
                       templates: Sequence[str] = TEMPLATES) -> tuple[list[str], np.ndarray, dict]:
    """Nap + kiem: format, model/revision/template khop, sha256 file, shape, huu han, da chuan hoa. Sai -> ValueError."""
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    if manifest.get("format_version") != FORMAT_VERSION:
        raise ValueError(f"format_version {manifest.get('format_version')!r}, cần {FORMAT_VERSION}")
    bad = [f"{k}={manifest.get(k)!r} (cần {v!r})" for k, v in
           (("model", model), ("revision", revision), ("templates", list(templates))) if manifest.get(k) != v]
    if bad:
        raise ValueError("vector nhãn không khớp mô hình: " + ", ".join(bad))
    raw = Path(npy_path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != manifest.get("vectors_sha256"):
        raise ValueError("sha256 file vector khác manifest")
    vectors = np.load(npy_path)
    words = manifest.get("labels") or []
    if labels_sha256(words) != manifest.get("labels_sha256") or len(words) != manifest.get("n_labels"):
        raise ValueError("danh sách nhãn trong manifest bị sửa")
    if vectors.ndim != 2 or vectors.shape != (len(words), manifest.get("dim")):
        raise ValueError(f"vector shape {vectors.shape}, cần ({len(words)}, {manifest.get('dim')})")
    if not np.isfinite(vectors).all() or np.abs(np.linalg.norm(vectors, axis=1) - 1).max() > NORM_TOL:
        raise ValueError("vector nhãn có NaN/inf hoặc chưa chuẩn hoá")
    return list(words), vectors.astype(np.float32), manifest


def softmax(logits: np.ndarray) -> np.ndarray:
    z = logits - logits.max()  # on dinh so
    e = np.exp(z)
    return e / e.sum()


class ZeroShotClassifier:
    def __init__(self, backend: ClipBackend, words: Sequence[str], vectors: np.ndarray,
                 logit_scale: float | None = None):
        vectors = np.asarray(vectors, dtype=np.float32)
        if vectors.shape[0] != len(words):
            raise ValueError(f"{vectors.shape[0]} vector nhưng {len(words)} nhãn")
        self.backend = backend
        self.words = list(words)
        self.vectors = vectors
        self.logit_scale = float(backend.logit_scale if logit_scale is None else logit_scale)

    def scores(self, image: Any) -> np.ndarray:
        img = l2_normalize(self.backend.encode_image(image))
        return softmax(self.logit_scale * (self.vectors @ img))

    def predict(self, image: Any, k: int = TOP_K) -> list[dict]:
        """-> [{word, score}] top-k theo score giam dan; score la xac suat softmax tren toan bo nhan."""
        p = self.scores(image)
        k = min(k, len(self.words))
        idx = np.argsort(-p, kind="stable")[:k]
        return [{"word": self.words[i], "score": float(p[i])} for i in idx]


class HFClipBackend:
    """CLIP that qua transformers (ghim revision). CPU, eval(), no_grad. KHONG dung trong test."""

    def __init__(self, model: str = MODEL_NAME, revision: str = MODEL_REVISION, local_files_only: bool = False,
                 num_threads: int | None = None):
        import torch
        from transformers import CLIPModel, CLIPProcessor

        if num_threads:
            torch.set_num_threads(num_threads)
        self._torch = torch
        self.processor = CLIPProcessor.from_pretrained(model, revision=revision, local_files_only=local_files_only)
        self.model = CLIPModel.from_pretrained(model, revision=revision, local_files_only=local_files_only)
        self.model.eval()
        self.logit_scale = float(self.model.logit_scale.exp().item())  # ngoai do thi autograd, chi doc 1 lan

    def _features(self, out: Any):
        # transformers 5.x: get_*_features tra BaseModelOutputWithPooling, vector DA chieu o pooler_output;
        # 4.x tra thang tensor.
        return out if isinstance(out, self._torch.Tensor) else out.pooler_output

    def encode_texts(self, texts: Sequence[str], batch_size: int = 256) -> np.ndarray:
        out = []
        with self._torch.no_grad():
            for i in range(0, len(texts), batch_size):
                inp = self.processor(text=list(texts[i:i + batch_size]), return_tensors="pt", padding=True)
                out.append(self._features(self.model.get_text_features(**inp)).cpu().numpy())
        return np.concatenate(out).astype(np.float32)

    def encode_image(self, image: Any) -> np.ndarray:
        with self._torch.no_grad():
            inp = self.processor(images=image, return_tensors="pt")
            return self._features(self.model.get_image_features(**inp))[0].cpu().numpy().astype(np.float32)
