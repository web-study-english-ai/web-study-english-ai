"""Test app/services/intent.py (WSEA-125). Khong nap mo hinh e5."""

import copy
import csv
import json
from pathlib import Path

import numpy as np
import pytest

from app.services import embedder as emb
from app.services import intent
from app.services.intent import IntentClassifier, IntentResult

ROOT = Path(__file__).resolve().parents[1]
VECTORS = ROOT / "data" / "intent_vectors.npz"
TEST_CSV = ROOT / "kb" / "intent" / "intent_test.csv"


@pytest.fixture(scope="module")
def raw():
    return json.loads(intent.DEFAULT_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def clf():
    return IntentClassifier.load()


def unit_vectors(n, seed=0):
    v = np.random.default_rng(seed).standard_normal((n, emb.DIM))
    return v / np.linalg.norm(v, axis=1, keepdims=True)


# --- Nap file --------------------------------------------------------------------------------


def test_real_file_loads(clf):
    assert clf.labels == list(intent.LABELS)
    assert clf.coef.shape == (5, emb.DIM) and clf.intercept.shape == (5,)
    assert clf.tau == 0.40


def test_labels_match_label_map():
    label_map = json.loads((ROOT / "kb" / "intent" / "label_map.json").read_text(encoding="utf-8"))
    assert [lb for lb, _ in sorted(label_map.items(), key=lambda kv: kv[1])] == list(intent.LABELS)


def tamper(raw, fn):
    d = copy.deepcopy(raw)
    fn(d)
    return d


@pytest.mark.parametrize("fn, msg", [
    (lambda d: d["embedder"].update(revision="sai"), "revision"),
    (lambda d: d["embedder"].update(model="khac/model"), "model"),
    (lambda d: d["embedder"].update(dim=768), "dim"),
    (lambda d: d["embedder"].update(query_prefix="passage: "), "query_prefix"),
    (lambda d: d.update(labels=d["labels"][:4]), "labels"),
    (lambda d: d.update(labels=list(reversed(d["labels"]))), "labels"),
    (lambda d: d.update(coef=d["coef"][:4]), "coef shape"),
    (lambda d: d.update(coef=[row[:383] for row in d["coef"]]), "coef shape"),
    (lambda d: d.update(intercept=d["intercept"][:4]), "intercept shape"),
    (lambda d: d.update(tau_oos=0), "tau_oos"),
    (lambda d: d.update(tau_oos=1), "tau_oos"),
    (lambda d: d.update(tau_oos=1.5), "tau_oos"),
    (lambda d: d.update(tau_oos=None), "tau_oos"),
    (lambda d: d.update(format_version=2), "format_version"),
])
def test_invalid_file_raises(raw, fn, msg):
    with pytest.raises(ValueError, match=msg):
        IntentClassifier.from_dict(tamper(raw, fn))


def test_load_reads_from_path(raw, tmp_path):
    p = tmp_path / "bad.json"
    p.write_text(json.dumps(tamper(raw, lambda d: d.update(tau_oos=-0.1))), encoding="utf-8")
    with pytest.raises(ValueError, match="tau_oos"):
        IntentClassifier.load(p)


# --- Suy luan --------------------------------------------------------------------------------


def test_proba_rows_sum_to_one(clf):
    p = clf.predict_proba(unit_vectors(50))
    assert p.shape == (50, 5)
    assert np.isfinite(p).all() and (p >= 0).all()
    np.testing.assert_allclose(p.sum(axis=1), 1.0, atol=1e-12)


def test_softmax_stable_with_huge_logits(clf):
    big = IntentClassifier(clf.labels, clf.coef * 1e6, clf.intercept, clf.tau)
    p = big.predict_proba(unit_vectors(5))
    assert np.isfinite(p).all()
    np.testing.assert_allclose(p.sum(axis=1), 1.0)


@pytest.mark.parametrize("bad", [
    np.zeros(emb.DIM),  # 1 chieu
    np.zeros((2, 383)),
    np.zeros((2, emb.DIM, 1)),
])
def test_wrong_shape_raises(clf, bad):
    with pytest.raises(ValueError, match="chiều"):
        clf.predict_proba(bad)


@pytest.mark.parametrize("value", [np.nan, np.inf])
def test_non_finite_raises(clf, value):
    x = unit_vectors(3)
    x[1, 7] = value
    with pytest.raises(ValueError, match="NaN"):
        clf.predict(x)


def test_predict_returns_results(clf):
    res = clf.predict(unit_vectors(4))
    assert len(res) == 4
    for r in res:
        assert r.label in intent.LABELS
        assert r.confidence == max(r.probs.values())
        assert list(r.probs) == list(intent.LABELS)


def test_sklearn_parity():
    """Fit LR nho tren du lieu gia, xuat bang lr_payload (cung ham --export dung) -> so numpy voi sklearn."""
    from sklearn.linear_model import LogisticRegression

    from scripts import train_intent as ti

    rng = np.random.default_rng(125)
    X = unit_vectors(100, seed=1)
    y = np.array(intent.LABELS)[rng.integers(0, 5, 100)]
    model = LogisticRegression(C=3, class_weight="balanced", max_iter=5000).fit(X, y)
    clf = IntentClassifier.from_dict(ti.lr_payload(model, list(intent.LABELS), 0.4))

    Xt = unit_vectors(40, seed=2)
    cols = [list(model.classes_).index(lb) for lb in intent.LABELS]
    err = np.abs(clf.predict_proba(Xt) - model.predict_proba(Xt)[:, cols]).max()
    assert err < 1e-9
    assert [r.label for r in clf.predict(Xt)] == model.predict(Xt).tolist()


# --- Luat chan som ---------------------------------------------------------------------------


def test_out_of_scope_boundary(clf):
    def res(label, conf):
        return IntentResult(label, conf, {})

    assert clf.is_out_of_scope(res("ngoai_pham_vi", clf.tau))  # bang tau -> chan
    assert clf.is_out_of_scope(res("ngoai_pham_vi", 0.99))
    assert not clf.is_out_of_scope(res("ngoai_pham_vi", np.nextafter(clf.tau, 0)))
    assert not clf.is_out_of_scope(res("nghia_tu", 0.99))


# --- Tai tao so lieu test (can data/intent_vectors.npz, khong commit) ------------------------


def test_reproduces_test_metrics(clf, raw):
    if not VECTORS.exists():
        pytest.skip("không có data/intent_vectors.npz — chạy scripts/train_intent.py để tạo")
    with np.load(VECTORS, allow_pickle=False) as z:
        meta, vecs = json.loads(str(z["meta"])), z["test"]
    if meta["test_sha256"] not in raw["inputs"].values():
        pytest.skip("cache vector không ứng với tập test mô hình đã đánh giá")
    with TEST_CSV.open(encoding="utf-8") as f:
        labels = [r["label"] for r in csv.DictReader(f)]
    res = clf.predict(vecs)
    acc = sum(r.label == lb for r, lb in zip(res, labels)) / len(labels)
    assert round(acc, 4) == raw["test_summary"]["accuracy"] == 0.72
    assert sum(clf.is_out_of_scope(r) for r in res) == 10
