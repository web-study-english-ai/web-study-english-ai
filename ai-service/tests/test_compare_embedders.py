"""Test phan thuan cua scripts/compare_embedders.py (WSEA-110). Khong nap mo hinh, khong goi mang."""

import pytest

from scripts import compare_embedders as ce

RANKED = ["a", "b", "c", "d", "e"]


# --- hit@k, reciprocal rank -------------------------------------------------------


@pytest.mark.parametrize("gold, k, expected", [
    ({"a"}, 1, 1.0),          # gold o hang 1
    ({"c"}, 1, 0.0),          # gold o hang 3, top-1 truot
    ({"c"}, 3, 1.0),          # ... nhung top-3 trung
    ({"e"}, 3, 0.0),          # hang 5 ngoai top-3
    ({"e"}, 5, 1.0),
    ({"z"}, 5, 0.0),          # gold khong co trong danh sach
    ({"z", "b"}, 3, 1.0),     # nhieu gold: chi can 1 cai trung
])
def test_hit_at_k(gold, k, expected):
    assert ce.hit_at_k(RANKED, gold, k) == expected


@pytest.mark.parametrize("gold, expected", [
    ({"a"}, 1.0),
    ({"b"}, 0.5),
    ({"d"}, 0.25),
    ({"d", "b"}, 0.5),        # lay gold dau tien gap duoc (hang 2)
    ({"z"}, 0.0),
])
def test_reciprocal_rank(gold, expected):
    assert ce.reciprocal_rank(RANKED, gold) == expected


def test_reciprocal_rank_respects_cutoff():
    ranked = [f"x{i}" for i in range(10)] + ["gold"]   # gold o hang 11
    assert ce.reciprocal_rank(ranked, {"gold"}, k=10) == 0.0
    assert ce.reciprocal_rank(ranked, {"gold"}, k=11) == pytest.approx(1 / 11)


def test_first_gold_rank():
    assert ce.first_gold_rank(RANKED, {"c", "e"}) == 3
    assert ce.first_gold_rank(RANKED, {"z"}) is None


# --- tong hop, tach theo ngon ngu ----------------------------------------------------


def test_aggregate_hand_computed():
    # q1 vi: gold hang 1 -> R@1=1, RR=1
    # q2 vi: gold hang 2 -> R@1=0, R@3=1, RR=1/2
    # q3 en: gold hang 4 -> R@1=0, R@3=0, R@5=1, RR=1/4
    # q4 en: khong co gold -> 0 het
    results = [
        {"ranked": ["g1", "x", "y", "z"], "gold": ["g1"], "lang": "vi"},
        {"ranked": ["x", "g2", "y", "z"], "gold": ["g2"], "lang": "vi"},
        {"ranked": ["x", "y", "z", "g3", "w"], "gold": ["g3"], "lang": "en"},
        {"ranked": ["x", "y", "z"], "gold": ["g4"], "lang": "en"},
    ]
    agg = ce.aggregate(results)
    o = agg["overall"]
    assert o["n"] == 4
    assert o["recall@1"] == pytest.approx(1 / 4)
    assert o["recall@3"] == pytest.approx(2 / 4)
    assert o["recall@5"] == pytest.approx(3 / 4)
    assert o["mrr@10"] == pytest.approx((1 + 0.5 + 0.25 + 0) / 4)

    vi, en = agg["by_lang"]["vi"], agg["by_lang"]["en"]
    assert (vi["n"], vi["recall@1"], vi["recall@3"], vi["mrr@10"]) == (2, 0.5, 1.0, pytest.approx(0.75))
    assert (en["n"], en["recall@3"], en["recall@5"], en["mrr@10"]) == (2, 0.0, 0.5, pytest.approx(0.125))


def test_percentile_matches_linear_interpolation():
    xs = [float(i) for i in range(1, 11)]               # 1..10
    assert ce.percentile(xs, 50) == pytest.approx(5.5)
    assert ce.percentile(xs, 95) == pytest.approx(9.55)  # 1 + 0.95*9
    assert ce.percentile([7.0], 95) == 7.0
    with pytest.raises(ValueError):
        ce.percentile([], 50)


# --- doc va kiem cau hoi ------------------------------------------------------------


def write_csv(tmp_path, text):
    p = tmp_path / "q.csv"
    p.write_text(text, encoding="utf-8")
    return p


def test_load_questions_splits_gold_ids(tmp_path):
    p = write_csv(tmp_path, 'qid,question,gold_ids,lang\nq1,"sau ""suggest"" dùng gì",gram_059| gram_064 ,vi\n')
    q = ce.load_questions(p)
    assert q[0]["gold"] == ["gram_059", "gram_064"]
    assert q[0]["question"] == 'sau "suggest" dùng gì'


def test_validate_ok(tmp_path):
    p = write_csv(tmp_path, "qid,question,gold_ids,lang\nq1,a,gram_001,vi\nq2,b,gram_001|gram_002,en\n")
    assert ce.validate_questions(ce.load_questions(p), {"gram_001", "gram_002"}) == []


def test_validate_catches_duplicate_qid_and_unknown_gold(tmp_path):
    p = write_csv(tmp_path, "qid,question,gold_ids,lang\nq1,a,gram_001,vi\nq1,b,gram_0xx,en\nq3,c,,vi\n")
    errors = ce.validate_questions(ce.load_questions(p), {"gram_001"})
    assert any("q1: trùng qid" in e for e in errors)
    assert any("gram_0xx" in e for e in errors)
    assert any("q3: không có gold_ids" in e for e in errors)


def test_main_exits_1_on_bad_questions(tmp_path, capsys):
    chunks = tmp_path / "c.jsonl"
    chunks.write_text('{"id": "gram_001", "content": "x"}\n', encoding="utf-8")
    q = write_csv(tmp_path, "qid,question,gold_ids,lang\nq1,a,gram_0xx,vi\n")
    code = ce.main(["--chunks", str(chunks), "--questions", str(q), "--out", str(tmp_path / "o.json")])
    assert code == 1
    assert "gram_0xx" in capsys.readouterr().out
    assert not (tmp_path / "o.json").exists()
