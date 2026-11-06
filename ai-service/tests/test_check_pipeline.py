"""Test phan thuan cua scripts/check_pipeline.py (WSEA-127 B3). Khong nap mo hinh."""

import pytest

from app.services import pipeline_rules as rules
from scripts import check_pipeline as cp

CHUNKS = {f"g{i}": {"id": f"g{i}", "content": f"noi dung {i}", "source": "WSEA", "topic": "t", "cefr": "A1"}
          for i in range(10)}
RANKED = [f"g{i}" for i in range(10)]
DISTS = [0.10 + 0.01 * i for i in range(10)]


def test_build_request_takes_top8_verbatim_without_word_vocab_history():
    req = cp.build_request("khi nào dùng since", RANKED, DISTS, CHUNKS)
    assert [c.id for c in req.contexts] == RANKED[:8]
    assert req.contexts[0].content == "noi dung 0" and req.contexts[0].distance == pytest.approx(0.10)
    assert req.word is None and req.vocab == [] and req.history == []


@pytest.mark.parametrize("gold,expected", [(["g4"], True), (["g5"], False), (["g9", "g0"], True)])
def test_gold_in_selected_top5(gold, expected):
    req = cp.build_request("q", RANKED, DISTS, CHUNKS)
    assert cp.gold_in_selected(req, gold) is expected


def pos(qid, decision=rules.ANSWER, hit=True):
    return {"qid": qid, "decision": decision, "gold_in_top5": hit}


def test_check_a_limit_inclusive():
    rows = [pos("q1"), pos("q2", rules.NO_CONTEXT)]
    assert cp.check_a(rows) == {"blocked": 1, "blocked_qids": ["q2"], "limit": 1, "pass": True}
    assert cp.check_a(rows + [pos("q3", rules.OUT_OF_SCOPE)])["pass"] is False


def test_check_b_exact_match_to_4_digits():
    rows = [pos(f"q{i}", hit=i < 26) for i in range(31)]
    b = cp.check_b(rows, 0.8387096774193549)
    assert (b["hits"], b["n"], b["rate"], b["pass"]) == (26, 31, 0.8387, True)
    assert b["missing_qids"] == [f"q{i}" for i in range(26, 31)]
    assert cp.check_b(rows, 27 / 31)["pass"] is False


def test_check_b_counts_blocked_questions_too():
    # (b) khong phu thuoc quyet dinh: cau bi chan van tinh neu gold co trong top-5
    rows = [pos("q1", rules.NO_CONTEXT, hit=True), pos("q2", hit=False)]
    assert cp.check_b(rows, 0.5)["pass"] is True


def test_table_c_groups_decisions():
    neg = [{"qid": "n1", "group": "off", "decision": rules.NO_CONTEXT},
           {"qid": "n2", "group": "off", "decision": rules.ANSWER},
           {"qid": "n3", "group": "gap", "decision": rules.OUT_OF_SCOPE}]
    t = cp.table_c(neg)
    assert t["off"] == {"n": 2, "answer": 1, "no_context": 1, "out_of_scope": 0, "blocked_qids": ["n1"]}
    assert t["gap"]["blocked_qids"] == ["n3"]


def test_summary_text_marks_pass_fail():
    report = {"rule_commit": "9011f9cabc", "n_positives": 2, "n_negatives": 1,
              "a": cp.check_a([pos("q1"), pos("q2", rules.NO_CONTEXT)]),
              "b": cp.check_b([pos("q1"), pos("q2", hit=False)], 0.6),
              "c": cp.table_c([{"qid": "n1", "group": "off", "decision": rules.NO_CONTEXT}]),
              "intent_ms": cp.timing_summary([10.0, 20.0])}
    text = cp.summary_text(report)
    assert "(a) câu dương bị chặn 1 ≤ 1: ĐẠT — q2" in text
    assert "0.5000 so với hit@5 gốc 0.6000: TRƯỢT" in text
    assert "| off | 1 | 0 | 1 | 0 | n1 |" in text
