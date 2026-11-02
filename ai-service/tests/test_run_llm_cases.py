"""Test phan thuan cua scripts/run_llm_cases.py (WSEA-140 B3). Khong mang, khong nap mo hinh."""

import json

import pytest

from app.services import prompts as pr
from scripts import run_llm_cases as rc

CHUNKS = {f"g{i}": {"id": f"g{i}", "content": f"noi dung {i}", "source": "WSEA", "topic": "t", "cefr": "A1"}
          for i in range(10)}
RANKED = [f"g{i}" for i in range(10)]
DISTS = [0.10 + 0.01 * i for i in range(10)]


def case(**over):
    c = {"id": "d01", "source": "q01", "question": "khi nào dùng since", "word": None, "history": [],
         "user_cefr": "B1", "contexts": "e5_top8", "expected": "grounded", "note": "n"}
    c.update(over)
    return c


def row(**over):
    r = {"id": "d01", "expected": "grounded", "answer": "Dùng since.", "source_ids": ["g0"],
         "selected_ids": ["g0", "g1"]}
    r.update(over)
    return r


# --- Dung request --------------------------------------------------------------------------------


def test_real_cases_file_loads_and_builds():
    cases = rc.load_cases(rc.DEFAULT_CASES)
    assert len(cases) == 12
    for c in cases:
        req = rc.build_case_request(c, RANKED, DISTS, CHUNKS)
        assert len(req.contexts) == (0 if c["contexts"] == "empty" else 8)
        assert req.vocab == []


def test_build_case_request_keeps_word_history_cefr():
    hist = [{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}]
    req = rc.build_case_request(case(word={"term": "gold", "pos": "noun", "meaning_vi": "vàng"}, history=hist,
                                     user_cefr="A2"), RANKED, DISTS, CHUNKS)
    assert req.word.term == "gold" and req.user_cefr == "A2"
    assert [t.content for t in req.history] == ["a", "b"]
    assert [c.id for c in req.contexts] == RANKED[:8]


def test_empty_contexts_case():
    req = rc.build_case_request(case(contexts="empty"), None, None, CHUNKS)
    assert req.contexts == []


def test_embed_text_appends_term_only_with_word():
    assert rc.embed_text(case()) == "khi nào dùng since"
    assert rc.embed_text(case(word={"term": "gold", "pos": "n", "meaning_vi": "v"})) == "khi nào dùng since (gold)"


def test_select_cases():
    cases = [case(id="d01"), case(id="d02"), case(id="d03")]
    assert [c["id"] for c in rc.select_cases(cases, None)] == ["d01", "d02", "d03"]
    assert [c["id"] for c in rc.select_cases(cases, "d03, d01")] == ["d01", "d03"]
    with pytest.raises(ValueError):
        rc.select_cases(cases, "d09")


# --- Gian nhip -----------------------------------------------------------------------------------


@pytest.mark.parametrize("s, sec", [("7.66s", 7.66), ("2m59.56s", 179.56), ("1h2m3s", 3723), ("350ms", 0.35),
                                    ("", None), (None, None), ("abc", None), ("5s x", None)])
def test_parse_duration(s, sec):
    got = rc.parse_duration(s)
    assert got == (None if sec is None else pytest.approx(sec))


def test_wait_seconds():
    assert rc.wait_seconds({}, 5000) == rc.DEFAULT_WAIT_S
    assert rc.wait_seconds({"x-ratelimit-remaining-tokens": "abc"}, 5000) == rc.DEFAULT_WAIT_S
    assert rc.wait_seconds({"x-ratelimit-remaining-tokens": "7000"}, 5000) == 0
    h = {"x-ratelimit-remaining-tokens": "3000", "x-ratelimit-reset-tokens": "40.5s"}
    assert rc.wait_seconds(h, 5000) == pytest.approx(41.5)
    assert rc.wait_seconds({"x-ratelimit-remaining-tokens": "3000"}, 5000) == rc.DEFAULT_WAIT_S


def test_need_tokens():
    assert rc.need_tokens([]) == rc.MIN_NEED_TOKENS
    assert rc.need_tokens([2000]) == rc.MIN_NEED_TOKENS
    assert rc.need_tokens([4000, 2000]) == 6000


def test_reasoning_tokens():
    assert rc.reasoning_tokens({"completion_tokens_details": {"reasoning_tokens": 42}}) == 42
    assert rc.reasoning_tokens({"total_tokens": 3}) is None


# --- (A) va (C) ----------------------------------------------------------------------------------


def test_check_a_grounded_pass_and_fail():
    assert rc.check_a(row())["pass"] is True
    a = rc.check_a(row(source_ids=["g9"], answer="x [1]" + "y" * 1200))
    assert (a["source_subset"], a["no_marker"], a["max_chars"], a["pass"]) == (False, False, False, False)


def test_check_a_refuse():
    ok = rc.check_a(row(expected="refuse", answer=pr.TEXT_OUT_OF_SCOPE, source_ids=[]))
    assert ok["pass"] and ok["refuse_no_sources"] and ok["refuse_no_solution"]
    bad = rc.check_a(row(expected="refuse", answer="def f(n):\n    return f(n-1)", source_ids=[]))
    assert bad["refuse_no_solution"] is False and bad["pass"] is False
    assert rc.check_a(row(expected="refuse", answer=pr.TEXT_OUT_OF_SCOPE))["refuse_no_sources"] is False


def test_check_a_word_only_and_llm_error():
    assert rc.check_a(row(expected="word_only", source_ids=["g0"]))["pass"] is False
    assert rc.check_a(row(expected="word_only", source_ids=[]))["pass"] is True
    assert rc.check_a({"error": "timeout"}) == {"pass": False, "llm_error": "timeout"}


@pytest.mark.parametrize("text, flag", [
    ("x = 2 hoặc x = 3", "math"), ("Phương trình có hai nghiệm", "math"), ("(x - 2)(x - 3) = 0", "math"),
    ("```python\nprint(1)\n```", "code"),
    ("Lá vàng rơi nhẹ\nGió thu se lạnh\nTrời xanh cao vời\nLòng ai bâng khuâng", "poem"),
])
def test_refuse_flags_detect(text, flag):
    assert rc.refuse_flags(text)[flag] is True


def test_refuse_flags_clean_on_fixed_texts():
    for t in (pr.TEXT_OUT_OF_SCOPE, pr.TEXT_NO_CONTEXT):
        assert not any(rc.refuse_flags(t).values())


def test_check_c_exact_only():
    assert rc.check_c(row(expected="grounded")) is None
    assert rc.check_c(row(id="d06", expected="refuse", answer=pr.TEXT_OUT_OF_SCOPE)) == "dat"
    assert rc.check_c(row(id="d06", expected="refuse", answer=pr.TEXT_NO_CONTEXT)) == "can_xem"
    assert rc.check_c(row(id="d08", expected="refuse", answer=pr.TEXT_NO_CONTEXT)) == "dat"
    assert rc.check_c(row(id="d08", expected="refuse", answer=pr.TEXT_OUT_OF_SCOPE)) == "can_xem"
    assert rc.check_c(row(id="d06", expected="refuse", answer=pr.TEXT_OUT_OF_SCOPE + " ")) == "can_xem"


# --- Cham (B) va bao cao -------------------------------------------------------------------------


def report(rows):
    return {"prompt_version": "v1", "official": True, "created_at": "t", "commit": "abc1234def", "dirty": False,
            "model": "m", "fallback_model": "f", "generation": {}, "rows": rows,
            "observations": rc.observations(rows)}


def full_row(**over):
    r = {**case(), **row(), "decision": "answer", "reason": "ok", "intent": None, "usage": {"total_tokens": 10},
         "model_used": "m", "attempts": 1, "finish_reason": "stop", "latency_ms": 100.0}
    r.update(over)
    r["a"] = rc.check_a(r)
    r["c_machine"] = rc.check_c(r)
    return r


def test_apply_grades_validates_and_writes():
    rows = [full_row(id="d01"), full_row(id="d10", expected="word_only", source_ids=[]),
            full_row(id="d06", expected="refuse", answer=pr.TEXT_OUT_OF_SCOPE, source_ids=[])]
    rep = report(rows)
    with pytest.raises(ValueError):
        rc.apply_grades(rep, {"d01": {"grade_cc": "dung", "reason_cc": "x"}})  # thieu d10
    with pytest.raises(ValueError):
        rc.apply_grades(rep, {"d01": {"grade_cc": "tot", "reason_cc": "x"}, "d10": {"grade_cc": "dung",
                                                                                   "reason_cc": "y"}})
    with pytest.raises(ValueError):
        rc.apply_grades(rep, {"d01": {"grade_cc": "dung", "reason_cc": " "}, "d10": {"grade_cc": "dung",
                                                                                    "reason_cc": "y"}})
    rc.apply_grades(rep, {"d01": {"grade_cc": "mot_phan", "reason_cc": "thiếu ý"},
                          "d10": {"grade_cc": "dung", "reason_cc": "ok"}})
    assert rep["rows"][0]["grade_cc"] == "mot_phan" and "grade_cc" not in rep["rows"][2]


def test_markdown_and_summary_never_show_grades():
    rows = [full_row(id="d01", grade_cc="sai", reason_cc="LY_DO_BI_MAT"),
            full_row(id="d06", expected="refuse", answer="Đây là code", source_ids=[])]
    rep = report(rows)
    md, summary = rc.report_markdown(rep), rc.summary_text(rep)
    for text in (md, summary):
        assert "LY_DO_BI_MAT" not in text  # ly do cham khong lo
        assert "sai" not in text.replace("ai-service", "")  # gia tri diem khong lo (dung/mot_phan/sai)
    assert md.count("Hiếu quyết (nếu lệch): ___") == 2
    assert "Hiếu chấm" not in md
    assert "CẦN XEM" in md and "CẦN XEM" in summary
    assert "> Đây là code" in md  # toan van cau tra loi cho ca can xem
    json.dumps(rep, ensure_ascii=False)


def test_observations():
    rows = [full_row(id="d01", source_ids=[]), full_row(id="d02", attempts=2, finish_reason="length"),
            full_row(id="d06", expected="refuse", decision="out_of_scope", model_used=None, usage={},
                     latency_ms=None)]
    obs = rc.observations(rows)
    assert obs["grounded_empty_sources"] == ["d01"]
    assert obs["fallback_used"] == ["d02"] and obs["finish_length"] == ["d02"]
    assert obs["llm_calls"] == 2 and obs["tokens"]["total"] == 20
    assert obs["latency_ms"]["n"] == 2
