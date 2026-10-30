"""Test app/services/embedder.py bang mo hinh GIA: khong tai mang, khong nap torch."""

import sys

import numpy as np
import pytest

from app.services import embedder as emb


class FakeModel:
    """Ghi lai van ban nhan duoc, tra vector co dinh theo do dai chuoi."""

    def __init__(self, dim=emb.DIM, normalize=True, nan=False):
        self.dim, self.normalize, self.nan = dim, normalize, nan
        self.calls = []

    def encode(self, texts, normalize_embeddings=False, **kwargs):
        self.calls.append({"texts": list(texts), "normalize_embeddings": normalize_embeddings})
        out = np.zeros((len(texts), self.dim), dtype=np.float64)
        for i, t in enumerate(texts):
            out[i, i % self.dim] = 3.0
            out[i, (i + 1) % self.dim] = float(len(t))
        if self.normalize and normalize_embeddings:
            out /= np.linalg.norm(out, axis=1, keepdims=True)
        if self.nan:
            out[0, 0] = np.nan
        return out


def test_query_prefix_and_normalize_flag():
    fake = FakeModel()
    vecs = emb.Embedder(model=fake).encode_queries(["sau suggest dùng gì", "so sánh hơn"])
    assert fake.calls[0]["texts"] == ["query: sau suggest dùng gì", "query: so sánh hơn"]
    assert fake.calls[0]["normalize_embeddings"] is True
    assert vecs.shape == (2, emb.DIM) and vecs.dtype == np.float32


def test_passage_prefix():
    fake = FakeModel()
    emb.Embedder(model=fake).encode_passages(["Present simple — form"])
    assert fake.calls[0]["texts"] == ["passage: Present simple — form"]


def test_output_is_unit_norm():
    vecs = emb.Embedder(model=FakeModel()).encode_passages(["a", "bb", "ccc"])
    assert np.allclose(np.linalg.norm(vecs, axis=1), 1.0, atol=1e-6)


def test_unnormalized_output_raises():
    with pytest.raises(ValueError, match="chuẩn hoá|chuan hoa"):
        emb.Embedder(model=FakeModel(normalize=False)).encode_passages(["a"])


def test_wrong_dim_raises():
    with pytest.raises(ValueError, match="sai so chieu"):
        emb.Embedder(model=FakeModel(dim=768)).encode_queries(["a"])


def test_nan_raises():
    with pytest.raises(ValueError, match="NaN"):
        emb.Embedder(model=FakeModel(nan=True)).encode_queries(["a"])


def test_single_string_rejected():
    with pytest.raises(TypeError):
        emb.Embedder(model=FakeModel()).encode_queries("một chuỗi")


def test_empty_list_returns_empty_matrix():
    fake = FakeModel()
    vecs = emb.Embedder(model=fake).encode_passages([])
    assert vecs.shape == (0, emb.DIM) and fake.calls == []


def test_lazy_load_uses_pinned_revision(monkeypatch):
    seen = {}

    def fake_load():
        seen["called"] = True
        return FakeModel()

    monkeypatch.setattr(emb.Embedder, "_load_model", staticmethod(fake_load))
    e = emb.Embedder()
    assert "called" not in seen            # chua nap khi khoi tao
    e.encode_queries(["x"])
    assert seen["called"]


def test_load_model_passes_name_revision_cpu(monkeypatch):
    captured = {}

    class FakeST:
        def __init__(self, name, **kwargs):
            captured.update(name=name, **kwargs)

    fake_module = type(sys)("sentence_transformers")
    fake_module.SentenceTransformer = FakeST
    monkeypatch.setitem(sys.modules, "sentence_transformers", fake_module)
    emb.Embedder._load_model()
    assert captured == {"name": emb.MODEL_NAME, "revision": emb.MODEL_REVISION, "device": "cpu"}


def test_normalize_term_matches_backend_seed():
    assert emb.normalize_term(" TRUE ") == "true"
    assert emb.normalize_term("Look") == "look"


def test_word_text_format():
    assert emb.word_text("grateful", "adj", "biết ơn") == "grateful (adj): biết ơn"


def test_model_info():
    assert emb.model_info() == {
        "model": "intfloat/multilingual-e5-small",
        "revision": "614241f622f53c4eeff9890bdc4f31cfecc418b3",
        "dim": 384,
        "query_prefix": "query: ",
        "passage_prefix": "passage: ",
    }


def test_importing_module_does_not_load_torch():
    # Chay trong tien trinh moi vi tien trinh pytest co the da import torch o test khac.
    import subprocess
    from pathlib import Path

    code = (
        "import sys; import app.services.embedder as m; m.Embedder();"
        "print('sentence_transformers' in sys.modules, 'torch' in sys.modules)"
    )
    root = Path(__file__).resolve().parents[1]
    out = subprocess.run([sys.executable, "-c", code], cwd=root, capture_output=True, text=True, check=True)
    assert out.stdout.strip() == "False False"
