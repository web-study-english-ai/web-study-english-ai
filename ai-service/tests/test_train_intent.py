"""Test scripts/train_intent.py (WSEA-125). Dung tmp_path, embedder gia, khong nap mo hinh."""

import csv
import hashlib
import json

import numpy as np
import pytest

from app.services import embedder as emb
from scripts import train_intent as ti

LABELS = ["nghia_tu", "cach_dung", "ngu_phap", "phan_biet", "ngoai_pham_vi"]
WORDS = {
    "nghia_tu": "nghĩa là gì",
    "cach_dung": "đi với giới từ gì",
    "ngu_phap": "thì hiện tại hoàn thành",
    "phan_biet": "khác nhau thế nào",
    "ngoai_pham_vi": "thời tiết hôm nay",
}


class HashFake:
    """Embedder gia: vector co dinh theo sha256 cua text, da chuan hoa L2."""

    def __init__(self):
        self.calls = 0

    def encode_queries(self, texts):
        self.calls += 1
        out = np.zeros((len(texts), emb.DIM), dtype=np.float32)
        for i, t in enumerate(texts):
            seed = int.from_bytes(hashlib.sha256(t.encode("utf-8")).digest()[:8], "little")
            v = np.random.default_rng(seed).standard_normal(emb.DIM)
            out[i] = v / np.linalg.norm(v)
        return out


def write_rows(path, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(ti.COLUMNS)
        for r in rows:
            w.writerow(r)


def setup(tmp_path, n_train=6, n_test=2):
    train, test = [], []
    for lb in LABELS:
        for k in range(n_train):
            train.append((f"it_{len(train) + 1:04d}", f"word{k} {WORDS[lb]} {lb}", lb, "vi", "llm", ""))
        for k in range(n_test):
            test.append((f"ie_{len(test) + 1:04d}", f"term{k} {WORDS[lb]}", lb, "en", "binh", ""))
    write_rows(tmp_path / "train.csv", train)
    write_rows(tmp_path / "test.csv", test)
    (tmp_path / "label_map.json").write_text(json.dumps({lb: i for i, lb in enumerate(LABELS)}), encoding="utf-8")
    return ["--train", str(tmp_path / "train.csv"), "--test", str(tmp_path / "test.csv"),
            "--label-map", str(tmp_path / "label_map.json"),
            "--cache", str(tmp_path / "vec.npz"), "--out", str(tmp_path / "report.json")]


# --- Luat chon A/B ---------------------------------------------------------------------------


def cv_row(kind, c, f1, std=0.05):
    return {"features": kind, "C": c, "accuracy_mean": f1, "accuracy_std": std,
            "macro_f1_mean": f1, "macro_f1_std": std}


@pytest.mark.parametrize("f1_b, chosen", [(0.731, "B"), (0.73, "A"), (0.72, "A"), (0.60, "A")])
def test_select_a_unless_b_wins_by_more_than_margin(f1_b, chosen):
    table = [cv_row("A", 0.1, 0.65), cv_row("A", 3, 0.70), cv_row("A", 10, 0.69),
             cv_row("B", 1, 0.50), cv_row("B", 10, f1_b)]
    sel = ti.select_model(table)
    assert sel["chosen"] == chosen
    assert sel["best"]["A"]["C"] == 3 and sel["best"]["B"]["C"] == 10
    assert sel["chosen_C"] == (3 if chosen == "A" else 10)
    assert sel["other"] == ("B" if chosen == "A" else "A")


def test_best_c_tie_prefers_lower_std_then_smaller_c():
    table = [cv_row("A", 10, 0.7, 0.05), cv_row("A", 1, 0.7, 0.05), cv_row("A", 3, 0.7, 0.01)]
    assert ti.best_of(table, "A")["C"] == 3
    assert ti.best_of(table[:2], "A")["C"] == 1


# --- Nguong tau ------------------------------------------------------------------------------


def oop_proba(p_oop):
    """Ma tran xac suat 2 cot [khac, ngoai_pham_vi]."""
    p = np.asarray(p_oop, dtype=float)
    return np.column_stack([1 - p, p])


def test_tau_is_smallest_grid_value_reaching_precision():
    classes = ["nghia_tu", "ngoai_pham_vi"]
    # 19 cau oop co p 0.9, 1 cau oop p 0.6, 1 cau sai (nghia_tu) p 0.62
    p = [0.9] * 19 + [0.6, 0.62]
    y = np.array(["ngoai_pham_vi"] * 20 + ["nghia_tu"])
    t = ti.choose_tau(oop_proba(p), classes, y)
    # tau 0.30..0.60: 20 dung / 21 chan = 0.952 >= 0.95 -> nhung chi khi argmax la oop (p > 0.5)
    assert t["reached"] and t["tau"] == 0.30
    assert t["precision_at_tau"] == round(20 / 21, 4) and t["recall_at_tau"] == 1.0

    # them 1 cau sai -> 20/22 = 0.909 < 0.95 cho toi khi tau vuot 0.62 (0.65): 19/19
    p2 = p + [0.61]
    y2 = np.append(y, "nghia_tu")
    t2 = ti.choose_tau(oop_proba(p2), classes, y2)
    assert t2["tau"] == 0.65
    assert t2["precision_at_tau"] == 1.0 and t2["recall_at_tau"] == 0.95
    assert [r["tau"] for r in t2["grid"]] == list(ti.TAU_GRID)
    assert ti.TAU_GRID[0] == 0.30 and ti.TAU_GRID[-1] == 0.95 and len(ti.TAU_GRID) == 14


def test_tau_not_reached_is_reported_not_lowered():
    classes = ["nghia_tu", "ngoai_pham_vi"]
    y = np.array(["ngoai_pham_vi", "nghia_tu"] * 5)
    t = ti.choose_tau(oop_proba([0.99] * 10), classes, y)
    assert not t["reached"] and t["tau"] is None
    assert t["target_precision"] == 0.95


def test_block_requires_argmax_oop():
    classes = ["nghia_tu", "ngu_phap", "ngoai_pham_vi"]
    proba = np.array([[0.1, 0.5, 0.4], [0.2, 0.2, 0.6]])
    assert ti.block_mask(proba, classes, 0.35).tolist() == [False, True]


# --- Cache vector e5 -------------------------------------------------------------------------


def test_cache_reused_then_recomputed_when_csv_or_model_changes(tmp_path, monkeypatch):
    args = setup(tmp_path)
    fake = HashFake()
    assert ti.main(args, embedder_factory=lambda: fake) == 0
    assert fake.calls == 1 and (tmp_path / "vec.npz").exists()

    assert ti.main(args, embedder_factory=lambda: fake) == 0
    assert fake.calls == 1  # doc cache

    train = tmp_path / "train.csv"
    train.write_text(train.read_text(encoding="utf-8").replace("word0 ", "wordX ", 1), encoding="utf-8")
    assert ti.main(args, embedder_factory=lambda: fake) == 0
    assert fake.calls == 2  # csv doi -> tinh lai

    test = tmp_path / "test.csv"
    test.write_text(test.read_text(encoding="utf-8") + "ie_0099,them cau,nghia_tu,vi,tam,\n", encoding="utf-8")
    assert ti.main(args, embedder_factory=lambda: fake) == 0
    assert fake.calls == 3  # test csv doi -> tinh lai

    monkeypatch.setattr(emb, "model_info", lambda: {"model": "khac", "revision": "x"})
    assert ti.main(args, embedder_factory=lambda: fake) == 0
    assert fake.calls == 4  # mo hinh doi -> tinh lai

    with np.load(tmp_path / "vec.npz", allow_pickle=False) as z:
        meta = json.loads(str(z["meta"]))
        assert meta["embedder"]["model"] == "khac"
        assert z["test"].shape == (11, emb.DIM)


# --- Thu tu: test chi cham sau khi chon ------------------------------------------------------


def test_test_set_evaluated_only_after_selection(tmp_path, monkeypatch):
    args = setup(tmp_path)
    log = []
    real_cv, real_select, real_tau, real_eval = ti.run_cv, ti.select_model, ti.choose_tau, ti.evaluate_test

    def spy_cv(features, y):
        assert all(len(X) == len(y) == 30 for X in features.values())  # chi train
        log.append("cv")
        return real_cv(features, y)

    def spy_select(table, *a, **k):
        log.append("select")
        return real_select(table, *a, **k)

    def spy_tau(*a, **k):
        log.append("tau")
        return real_tau(*a, **k)

    def spy_eval(kind, *a, **k):
        log.append(f"eval_{kind}")
        return real_eval(kind, *a, **k)

    monkeypatch.setattr(ti, "run_cv", spy_cv)
    monkeypatch.setattr(ti, "select_model", spy_select)
    monkeypatch.setattr(ti, "choose_tau", spy_tau)
    monkeypatch.setattr(ti, "evaluate_test", spy_eval)
    assert ti.main(args, embedder_factory=HashFake) == 0

    report = json.loads((tmp_path / "report.json").read_text(encoding="utf-8"))
    chosen, other = report["selection"]["chosen"], report["selection"]["other"]
    assert log == ["cv", "select", "tau", f"eval_{chosen}", f"eval_{other}"]
    t = report["test"]
    assert t["chosen"]["features"] == chosen and t["not_chosen_for_reference_only"]["features"] == other
    assert t["n"] == 10 and sum(map(sum, t["chosen"]["confusion_matrix"]["values"])) == 10
    assert len(t["chosen"]["wrong"]) == t["chosen"]["n_wrong"]
    assert report["seed"] == ti.SEED and len(report["cv"]["table"]) == 2 * len(ti.CS)
    assert set(report["inputs"].values()) == {ti.sha256(tmp_path / "train.csv"), ti.sha256(tmp_path / "test.csv")}


# --- Kiem du lieu ----------------------------------------------------------------------------


def test_rejects_id_overlap_and_unknown_label(tmp_path, capsys):
    args = setup(tmp_path)
    test = tmp_path / "test.csv"
    test.write_text(test.read_text(encoding="utf-8") + "it_0001,cau trung id,nhan_la,vi,tam,\n", encoding="utf-8")
    fake = HashFake()
    assert ti.main(args, embedder_factory=lambda: fake) == 1
    out = capsys.readouterr().out
    assert "it_0001" in out and "nhan_la" in out
    assert fake.calls == 0


# --- --export: chi xuat dung ket qua da chot -------------------------------------------------


def test_export_check_report_rejects_changed_selection_or_data():
    meta = {"train_sha256": "a", "test_sha256": "b", "embedder": {"model": "m"}}
    good = {"selection": {"chosen": "A", "chosen_C": 3}, "tau": {"tau": 0.4},
            "inputs": {"train.csv": "a", "test.csv": "b"}, "embedder": {"model": "m"}}
    assert ti.check_report(good, meta) == []
    assert len(ti.check_report({**good, "selection": {"chosen": "A", "chosen_C": 10}}, meta)) == 1
    assert len(ti.check_report({**good, "tau": {"tau": 0.35}}, meta)) == 1
    assert len(ti.check_report({**good, "inputs": {"train.csv": "x", "test.csv": "b"}}, meta)) == 1
    assert len(ti.check_report({**good, "embedder": {"model": "khac"}}, meta)) == 1


def test_expected_predictions_from_report():
    report = {"test": {"chosen": {"wrong": [{"id": "ie_2", "pred": "ngu_phap"}]}}}
    test = [{"id": "ie_1", "label": "nghia_tu"}, {"id": "ie_2", "label": "phan_biet"}]
    assert ti.expected_predictions(report, test) == {"ie_1": "nghia_tu", "ie_2": "ngu_phap"}
