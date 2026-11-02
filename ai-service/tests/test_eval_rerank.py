"""Test phan thuan cua scripts/eval_rerank.py (WSEA-126 B1a). Bo cham gia, khong nap mo hinh."""

import pytest

from scripts import eval_rerank as er

# 10 doan d0..d9, e5 xep theo thu tu d0, d1, ..., d9.
IDS = [f"d{i}" for i in range(10)]
CONTENT = {i: f"noi dung {i}" for i in IDS}


def fake_scorer(score_by_id: dict[str, float], calls: list | None = None):
    """Diem theo id doan (suy tu content); doan khong khai bao = 0. Ghi lai cac cap da cham."""
    by_content = {CONTENT[i]: s for i, s in score_by_id.items()}

    def scorer(pairs):
        if calls is not None:
            calls.append(list(pairs))
        return [by_content.get(c, 0.0) for _, c in pairs]

    return scorer


def row(qid, gold, lang="vi", question=None):
    return {"qid": qid, "question": question or f"cau hoi {qid}", "gold": gold, "lang": lang,
            "ranked": list(IDS), "dists": [0.1 + 0.01 * i for i in range(len(IDS))]}


# --- Ghep cap --------------------------------------------------------------------------------


def test_make_pairs_verbatim_without_e5_prefix():
    pairs = er.make_pairs("khi nào dùng since", ["d2", "d0"], CONTENT)
    assert pairs == [("khi nào dùng since", "noi dung d2"), ("khi nào dùng since", "noi dung d0")]
    for q, p in pairs:
        assert not q.startswith("query:") and not p.startswith("passage:")


def test_rerank_scores_exactly_top8_once_per_question():
    calls = []
    er.rerank_rows([row("q1", ["d0"])], CONTENT, fake_scorer({}, calls))
    assert len(calls) == 1
    assert [c for _, c in calls[0]] == [CONTENT[i] for i in IDS[:er.TOP_N_IN]]


# --- Xep lai ---------------------------------------------------------------------------------


def test_rerank_orders_by_score_desc_and_never_pulls_beyond_top8():
    # d9 ngoai top-8 du diem cao nhat -> khong duoc keo vao
    out = er.rerank_rows([row("q1", ["d5"])], CONTENT, fake_scorer({"d5": 0.9, "d2": 0.5, "d9": 5.0}))[0]
    assert len(out["ranked"]) == er.TOP_N_IN
    assert out["ranked"][:2] == ["d5", "d2"]
    assert "d9" not in out["ranked"]
    assert out["scores"] == sorted(out["scores"], reverse=True)


def test_rerank_ties_keep_e5_order():
    out = er.rerank_rows([row("q1", ["d0"])], CONTENT, fake_scorer({}))[0]
    assert out["ranked"] == IDS[:er.TOP_N_IN]


def test_rerank_raises_when_scorer_returns_wrong_count():
    with pytest.raises(ValueError):
        er.rerank_one("q", ["d0", "d1"], CONTENT, lambda pairs: [1.0])


# --- hit / MRR truoc va sau ------------------------------------------------------------------


def test_metrics_before_after_rerank():
    rows = [row("q1", ["d4"], "vi"), row("q2", ["d0"], "en"), row("q3", ["d9"], "en")]
    before = er.metrics(er.cut(rows))
    # q1 gold hang 5, q2 hang 1, q3 ngoai top-8
    assert before["overall"]["hit@1"] == pytest.approx(1 / 3)
    assert before["overall"]["hit@3"] == pytest.approx(1 / 3)
    assert before["overall"]["hit@5"] == pytest.approx(2 / 3)
    assert before["overall"]["hit@8"] == pytest.approx(2 / 3)
    assert before["overall"]["mrr@8"] == pytest.approx((1 / 5 + 1) / 3)

    # rerank day d4 len dau -> q1 hang 1, q2 tut xuong hang 2, q3 van ngoai
    after = er.metrics(er.rerank_rows(rows, CONTENT, fake_scorer({"d4": 1.0})))
    assert after["overall"]["hit@1"] == pytest.approx(1 / 3)
    assert after["overall"]["hit@3"] == pytest.approx(2 / 3)
    assert after["overall"]["hit@8"] == pytest.approx(2 / 3)  # rerank khong doi duoc hit@8
    assert after["overall"]["mrr@8"] == pytest.approx((1 + 1 / 2) / 3)
    assert after["by_lang"]["vi"]["hit@1"] == 1.0
    assert after["by_lang"]["en"]["hit@1"] == 0.0
    assert after["by_lang"]["en"]["n"] == 2


def test_rank_changes_lists_only_moved_questions():
    rows = [row("q1", ["d4"]), row("q2", ["d0"]), row("q3", ["d9"]), row("q4", ["d7"])]
    before = er.cut(rows)
    after = er.rerank_rows(rows, CONTENT, fake_scorer({"d4": 1.0}))
    changes = {c["qid"]: c for c in er.rank_changes(before, after)}
    assert set(changes) == {"q1", "q2"}  # q3 ngoai top-8 ca hai phia, q4 van hang 8
    assert (changes["q1"]["before"], changes["q1"]["after"], changes["q1"]["better"]) == (5, 1, True)
    assert (changes["q2"]["before"], changes["q2"]["after"], changes["q2"]["better"]) == (1, 2, False)


# --- AUC ------------------------------------------------------------------------------------


def test_auc_perfect_reversed_and_mixed():
    assert er.auc([0.9, 0.8], [0.1, 0.2]) == 1.0
    assert er.auc([0.1, 0.2], [0.9, 0.8]) == 0.0
    assert er.auc([0.9, 0.3], [0.5, 0.1]) == pytest.approx(0.75)


def test_separation_distance_is_flipped_so_low_distance_means_positive():
    s = er.separation([0.10, 0.12], [0.20, 0.25], higher_is_positive=False)
    assert s["auc"] == 1.0
    assert s["positive"] == {"n": 2, "min": 0.10, "p50": 0.11, "max": 0.12}
    assert s["negative"]["max"] == 0.25
    assert er.separation([0.9, 0.8], [0.1, 0.2], higher_is_positive=True)["auc"] == 1.0


# --- Do tre ----------------------------------------------------------------------------------


def test_latency_warmup_not_measured():
    calls, ticks = [], iter(range(0, 100, 1))
    batches = [[("q", "a")], [("q", "b")]]
    lat = er.latency_ms(lambda b: calls.append(b), batches, warmup=3, clock=lambda: next(ticks) * 0.01)
    assert len(calls) == 3 + 2
    assert lat == pytest.approx([10.0, 10.0])  # moi lan do = 2 tick lien tiep = 0.01 s


# --- decide: ca bien ------------------------------------------------------------------------

OK = {"hit@3_rerank": 0.90, "hit@5_base": 0.90, "p95_ms": 100.0, "ram_mib": 300.0}


def test_decide_all_pass():
    d = er.decide(OK)
    assert d["decision"] == "BAT"
    assert len(d["reasons"]) == 3 and all(r.startswith("✓") for r in d["reasons"])


def test_decide_hit3_exactly_at_margin_passes_despite_float():
    # 0.90 - 0.03 = 0.8700000000000001 trong so thuc -> van phai BAT
    assert er.decide({**OK, "hit@3_rerank": 0.87})["decision"] == "BAT"


def test_decide_hit3_below_margin_fails():
    d = er.decide({**OK, "hit@3_rerank": 0.869})
    assert d["decision"] == "TAT"
    assert d["reasons"][0].startswith("✗")


def test_decide_one_question_drop_at_n31_exceeds_margin():
    # n=31: mat 1 cau = 0.032 > 0.03 -> TAT (luat chot truoc, ghi ro de khong bat ngo)
    assert er.decide({**OK, "hit@3_rerank": 27 / 31, "hit@5_base": 28 / 31})["decision"] == "TAT"
    assert er.decide({**OK, "hit@3_rerank": 28 / 31, "hit@5_base": 28 / 31})["decision"] == "BAT"


@pytest.mark.parametrize("key,limit", [("p95_ms", er.RULE_P95_MS), ("ram_mib", er.RULE_RAM_MIB)])
def test_decide_resource_limits_inclusive(key, limit):
    assert er.decide({**OK, key: float(limit)})["decision"] == "BAT"
    d = er.decide({**OK, key: limit + 0.1})
    assert d["decision"] == "TAT"
    assert sum(r.startswith("✗") for r in d["reasons"]) == 1


@pytest.mark.parametrize("key", list(OK))
def test_decide_missing_measurement_is_tat(key):
    d = er.decide({k: v for k, v in OK.items() if k != key})
    assert d["decision"] == "TAT"
    assert any("thiếu" in r for r in d["reasons"])


# --- Lap report cho mot ung vien (bo cham gia, khong mo hinh) ----------------------------------


def test_build_candidate_report_wires_metrics_and_decision():
    pos = [row("q1", ["d4"]), row("q2", ["d0"])]
    neg = [row("n1", [], question="thoi tiet")]
    scorer = fake_scorer({"d4": 2.0, "d0": 1.0})
    cand = {"key": "A", "latency_ms": {"p95": 50.0}, "rss_mib": {"increase": 200.0},
            "_pos_after": er.rerank_rows(pos, CONTENT, scorer),
            "_neg_after": er.rerank_rows(neg, CONTENT, lambda p: [-1.0] * len(p))}
    before = er.cut(pos)
    e5_sep = er.separation([0.1, 0.1], [0.3], higher_is_positive=False)
    rep = er.build_candidate_report(cand, before, er.metrics(before), e5_sep)
    assert rep["rule_input"] == {"hit@3_rerank": 1.0, "hit@5_base": 1.0, "p95_ms": 50.0, "ram_mib": 200.0}
    assert rep["decision"] == "BAT"
    assert rep["negatives"]["rerank_top1"]["auc"] == 1.0
    assert rep["top_out"][0]["ids"] == ["d4", "d0", "d1"]
    assert "_pos_after" not in rep


def test_parse_candidates():
    assert er.parse_args([]).candidates == ["A"]
    assert er.parse_args(["--candidates", "a,B,A"]).candidates == ["A", "B"]
    with pytest.raises(SystemExit):
        er.parse_args(["--candidates", "C"])
