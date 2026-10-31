"""Test phan thuan cua scripts/eval_retrieval.py (WSEA-111). Vector gia, khong nap torch, khong DB."""

import numpy as np
import pytest

from scripts import compare_embedders as ce
from scripts import eval_retrieval as ev

# 25 doan: d00..d24, vector don vi theo truc -> cau hoi = truc nao thi doan do gan nhat.
N = 25
IDS = [f"d{i:02d}" for i in range(N)]
P_VECS = np.eye(N, dtype=np.float32)


def query(weights: dict[int, float]) -> np.ndarray:
    """Vector cau hoi chuan hoa L2, trong so lon hon -> doan do xep cao hon."""
    v = np.zeros(N, dtype=np.float32)
    for i, w in weights.items():
        v[i] = w
    return v / np.linalg.norm(v)


def ranked_for(weights):
    (ranked, dists), = ev.rank_all(query(weights)[None, :], P_VECS, IDS)
    return ranked, dists


# --- rank_all: distance = 1 - cosine --------------------------------------------------------


def test_rank_all_sorted_by_distance_and_equals_one_minus_cosine():
    q = query({3: 1.0, 7: 0.5})
    ranked, dists = ranked_for({3: 1.0, 7: 0.5})
    assert ranked[:2] == ["d03", "d07"]
    assert dists == sorted(dists)
    assert dists[0] == pytest.approx(1 - float(q[3]))
    assert len(ranked) == N


# --- hit@k / recall@k / MRR -----------------------------------------------------------------


def rows():
    """3 cau: hai gold (1 o hang 1, 1 o hang 4); gold o hang 2; gold ngoai top-20."""
    r1, d1 = ranked_for({0: 1.0, 1: 0.9, 2: 0.8, 5: 0.7})          # d00, d01, d02, d05
    r2, d2 = ranked_for({4: 1.0, 6: 0.9})                          # d04, d06
    weights = {i: 1.0 - i * 0.01 for i in range(21)}               # d00..d20, d24 o cuoi
    r3, d3 = ranked_for(weights)
    return [
        {"qid": "q1", "question": "hai gold", "lang": "vi", "gold": ["d00", "d05"], "ranked": r1, "dists": d1},
        {"qid": "q2", "question": "gold hang 2", "lang": "en", "gold": ["d06"], "ranked": r2, "dists": d2},
        {"qid": "q3", "question": "ngoai top 20", "lang": "vi", "gold": ["d24"], "ranked": r3, "dists": d3},
    ]


def test_recall_counts_fraction_of_gold():
    r = rows()[0]
    assert ev.recall_at_k(r["ranked"], {"d00", "d05"}, 1) == 0.5
    assert ev.recall_at_k(r["ranked"], {"d00", "d05"}, 3) == 0.5
    assert ev.recall_at_k(r["ranked"], {"d00", "d05"}, 5) == 1.0


def test_recall_empty_gold_raises():
    with pytest.raises(ValueError):
        ev.recall_at_k(["a"], set(), 1)


def test_positive_metrics_overall_and_by_lang():
    m = ev.positive_metrics(rows())
    o = m["overall"]
    assert o["n"] == 3
    assert o["hit@1"] == pytest.approx(1 / 3)        # chi q1
    assert o["hit@3"] == pytest.approx(2 / 3)        # q1, q2
    assert o["hit@20"] == pytest.approx(2 / 3)       # q3 truot ca top-20
    assert o["recall@1"] == pytest.approx(0.5 / 3)
    assert o["recall@5"] == pytest.approx(2 / 3)     # q1 du ca 2 gold
    assert o["mrr@20"] == pytest.approx((1 + 0.5 + 0) / 3)
    assert m["by_lang"]["en"]["hit@1"] == 0.0 and m["by_lang"]["en"]["mrr@20"] == 0.5
    assert m["by_lang"]["vi"]["n"] == 2


def test_rank_beyond_top20_gives_zero_mrr():
    r = rows()[2]
    assert ce.first_gold_rank(r["ranked"], {"d24"}) > 20
    assert ce.reciprocal_rank(r["ranked"], {"d24"}, ev.MRR_K) == 0.0


def test_hard_questions_lists_rank_over_3_with_gold_distance():
    hard = ev.hard_questions(rows())
    assert [h["qid"] for h in hard] == ["q3"]
    h = hard[0]
    assert h["first_gold_rank"] == N
    assert h["gold_distance"] == pytest.approx(1.0, abs=1e-4)   # truc truc giao -> cosine 0
    assert [t["id"] for t in h["top3"]] == ["d00", "d01", "d02"]


# --- phan bo va bang nguong -----------------------------------------------------------------


def test_distribution():
    d = ev.distribution([0.1, 0.2, 0.3, 0.4, 0.5])
    assert d == {"n": 5, "min": 0.1, "p50": 0.3, "p90": 0.46, "max": 0.5}


def test_threshold_table_rule_block_when_above():
    pos = [0.10, 0.15, 0.18, 0.25]
    neg = {"off": [0.16, 0.30], "gap": [0.14, 0.20]}
    table = ev.threshold_table(pos, neg, thresholds=(0.15, 0.18, 0.20))
    assert table[0] == {"threshold": 0.15, "pos_kept": 0.5, "off_blocked": 1.0, "gap_blocked": 0.5}
    assert table[1] == {"threshold": 0.18, "pos_kept": 0.75, "off_blocked": 0.5, "gap_blocked": 0.5}
    # d = t khong bi chan
    assert table[2] == {"threshold": 0.20, "pos_kept": 0.75, "off_blocked": 0.5, "gap_blocked": 0.0}


def test_default_thresholds_014_to_022():
    assert ev.THRESHOLDS == (0.14, 0.15, 0.16, 0.17, 0.18, 0.19, 0.20, 0.21, 0.22)


# --- doi chieu SQL --------------------------------------------------------------------------


def test_compare_sql_match_and_mismatch():
    ranked = [f"d{i}" for i in range(10)]
    dist = {i: 0.1 * n for n, i in enumerate(ranked)}
    same = ev.compare_sql([(i, dist[i] + 1e-6) for i in ranked[:8]], ranked, dist)
    assert same["top1_match"] and same["order_match"]
    assert same["max_abs_distance_diff"] == pytest.approx(1e-6)

    swapped = [ranked[0], ranked[2], ranked[1]] + ranked[3:8]
    diff = ev.compare_sql([(i, dist[i]) for i in swapped], ranked, dist)
    assert diff["top1_match"] and not diff["order_match"]


def test_sql_uses_contract_query():
    sql = " ".join(ev.KB_SQL.split())
    assert "FROM kb_chunks WHERE embedding IS NOT NULL AND embedding_model = %(model)s" in sql
    assert "ORDER BY embedding <=> %(q)s::vector LIMIT 8" in sql


# --- file cau am ----------------------------------------------------------------------------


def test_negatives_file():
    rows_ = ce.load_questions(ev.DEFAULT_NEGATIVES)
    assert len(rows_) == 12
    assert {r["group"] for r in rows_} <= {"off", "gap"}
    assert len({r["qid"] for r in rows_}) == 12
    assert ev.validate_negatives(rows_) == []
    # Khong kiem LF o day: may Windows bat core.autocrlf se checkout ra CRLF.
    assert ev.DEFAULT_NEGATIVES.read_bytes().startswith(b"qid,question,group,lang")


def test_validate_negatives_catches_errors():
    bad = [
        {"qid": "n1", "question": "a", "group": "off", "lang": "vi"},
        {"qid": "n1", "question": "", "group": "other", "lang": "fr"},
    ]
    errors = ev.validate_negatives(bad)
    assert any("trùng qid" in e for e in errors)
    assert any("rỗng" in e for e in errors)
    assert any("group" in e for e in errors)
    assert any("lang" in e for e in errors)
