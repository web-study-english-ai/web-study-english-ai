"""Test app/vision/classifier.py (WSEA-152) bang backend GIA. KHONG tai mo hinh that."""

import json

import numpy as np
import pytest

from app.vision import classifier as vc

DIM = 8
WORDS = ["apple", "banana", "chair", "dog", "egg", "fish"]


class FakeBackend:
    """Moi tu -> mot truc rieng (+ nhieu theo template); anh = chuoi ten tu -> vector truc do."""

    logit_scale = 100.0

    def __init__(self):
        self.text_calls = []
        self.axis = {w: i for i, w in enumerate(WORDS)}

    def encode_texts(self, texts):
        self.text_calls.append(list(texts))
        out = np.zeros((len(texts), DIM), dtype=np.float32)
        for i, t in enumerate(texts):
            word = t.rstrip(".").split()[-1]
            out[i, self.axis[word]] = 3.0             # chua chuan hoa
            out[i, DIM - 1] = 0.5 if "close-up" in t else 0.1  # khac nhau theo template
        return out

    def encode_image(self, image):
        v = np.zeros(DIM, dtype=np.float32)
        v[self.axis[image]] = 2.0
        return v


@pytest.fixture
def vectors():
    return vc.build_label_vectors(FakeBackend(), WORDS)


def test_build_label_vectors_ensemble_normalized(vectors):
    be = FakeBackend()
    v = vc.build_label_vectors(be, WORDS)
    assert v.shape == (len(WORDS), DIM) and v.dtype == np.float32
    assert np.allclose(np.linalg.norm(v, axis=1), 1, atol=1e-6)
    assert len(be.text_calls) == len(vc.TEMPLATES)  # mot lo cho moi template, khong tung cau
    assert be.text_calls[0] == [vc.TEMPLATES[0].format(w=w) for w in WORDS]
    # trung binh cua 3 vector da chuan hoa roi chuan hoa lai
    t = [vc.l2_normalize(be.encode_texts([tp.format(w="apple")]))[0] for tp in vc.TEMPLATES]
    expect = np.mean(t, axis=0)
    assert np.allclose(v[0], expect / np.linalg.norm(expect), atol=1e-6)


@pytest.mark.parametrize("words", [[], ["apple", "apple"]])
def test_build_rejects_empty_or_duplicate(words):
    with pytest.raises(ValueError):
        vc.build_label_vectors(FakeBackend(), words)


def test_predict_top5_softmax(vectors):
    clf = vc.ZeroShotClassifier(FakeBackend(), WORDS, vectors)
    top = clf.predict("dog")
    assert len(top) == 5 and top[0]["word"] == "dog"
    scores = [t["score"] for t in top]
    assert scores == sorted(scores, reverse=True) and 0 < scores[0] <= 1
    full = clf.scores("dog")
    assert np.isclose(full.sum(), 1.0) and full.shape == (len(WORDS),)
    # logit = logit_scale * cosine
    img = vc.l2_normalize(FakeBackend().encode_image("dog"))
    logits = 100.0 * (vectors @ img)
    assert np.allclose(full, np.exp(logits - logits.max()) / np.exp(logits - logits.max()).sum())


def test_predict_k_capped_and_custom_scale(vectors):
    clf = vc.ZeroShotClassifier(FakeBackend(), WORDS, vectors, logit_scale=1.0)
    assert len(clf.predict("egg", k=50)) == len(WORDS)
    assert clf.predict("egg", k=1)[0]["score"] < 0.5  # scale nho -> phan bo deu hon


def test_classifier_shape_mismatch(vectors):
    with pytest.raises(ValueError):
        vc.ZeroShotClassifier(FakeBackend(), WORDS[:-1], vectors)


def test_softmax_stable():
    p = vc.softmax(np.array([1000.0, 1000.0, -1000.0]))
    assert np.isfinite(p).all() and np.allclose(p, [0.5, 0.5, 0.0])


def test_l2_normalize_rejects_bad():
    for bad in (np.zeros(3), np.array([np.nan, 1, 1])):
        with pytest.raises(ValueError):
            vc.l2_normalize(bad)


# --- Luu / nap vector nhan -----------------------------------------------------------------------


def save(tmp_path, vectors, **kw):
    npy, man = tmp_path / "v.npy", tmp_path / "v.json"
    m = vc.save_label_vectors(vectors, WORDS, rule_version="v1-2026-11-04", labels_source_sha256="abc",
                              npy_path=npy, manifest_path=man, logit_scale=100.0, **kw)
    return npy, man, m


def test_save_load_roundtrip(tmp_path, vectors):
    npy, man, m = save(tmp_path, vectors)
    assert m["n_labels"] == len(WORDS) and m["revision"] == vc.MODEL_REVISION and m["labels"] == WORDS
    words, v, m2 = vc.load_label_vectors(npy, man)
    assert words == WORDS and np.array_equal(v, vectors) and m2["rule_version"] == "v1-2026-11-04"


def test_load_rejects_other_revision(tmp_path, vectors):
    npy, man, _ = save(tmp_path, vectors, revision="khac")
    with pytest.raises(ValueError, match="revision"):
        vc.load_label_vectors(npy, man)


def test_load_rejects_tampered_vectors(tmp_path, vectors):
    npy, man, _ = save(tmp_path, vectors)
    np.save(npy, vectors * 2)
    with pytest.raises(ValueError, match="sha256"):
        vc.load_label_vectors(npy, man)


def test_load_rejects_tampered_labels(tmp_path, vectors):
    npy, man, _ = save(tmp_path, vectors)
    m = json.loads(man.read_text(encoding="utf-8"))
    m["labels"][0] = "pear"
    man.write_text(json.dumps(m), encoding="utf-8")
    with pytest.raises(ValueError, match="nhãn"):
        vc.load_label_vectors(npy, man)


def test_load_rejects_unnormalized(tmp_path):
    npy, man, _ = save(tmp_path, np.ones((len(WORDS), DIM), dtype=np.float32))
    with pytest.raises(ValueError, match="chuẩn hoá"):
        vc.load_label_vectors(npy, man)


def test_save_rejects_count_mismatch(tmp_path, vectors):
    with pytest.raises(ValueError):
        vc.save_label_vectors(vectors[:2], WORDS, rule_version="v", labels_source_sha256="x",
                              npy_path=tmp_path / "a.npy", manifest_path=tmp_path / "a.json")


def test_module_import_does_not_load_transformers_or_torch():
    """Chi HFClipBackend.__init__ moi import transformers/torch -> test va script nhe khong keo mo hinh."""
    import subprocess
    import sys
    from pathlib import Path
    code = "import sys, app.vision.classifier, app.vision.preprocess; print('transformers' in sys.modules, 'torch' in sys.modules)"
    out = subprocess.run([sys.executable, "-c", code], cwd=Path(vc.__file__).resolve().parents[2],
                         capture_output=True, text=True, check=True).stdout.strip()
    assert out == "False False"
