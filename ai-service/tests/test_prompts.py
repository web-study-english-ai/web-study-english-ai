"""Test app/services/prompts.py (WSEA-140). Khong goi mang, khong nap mo hinh."""

import json
import re
from pathlib import Path

import pytest

from app.models.schemas import AskRequest
from app.services import pipeline as pl
from app.services import pipeline_rules as rules
from app.services import prompts as pr
from app.services.intent import IntentResult

CASES = Path(__file__).resolve().parents[1] / "kb" / "eval_llm_cases.jsonl"


def ctx(i, d, cefr="B1"):
    return {"id": f"gram_{i:03d}", "content": f"  Tiêu đề {i}\nNội dung đoạn {i}.  ", "source": "s",
            "topic": "t", "cefr": cefr, "distance": d}


def make_req(**kw):
    body = {"question": "khi nào dùng hiện tại hoàn thành", "contexts": [], **kw}
    return AskRequest.model_validate(body)


def answer_result(req, label="ngu_phap"):
    intent = None if label is None else IntentResult(label, 0.6, {label: 0.6})
    return pl.PipelineResult(rules.ANSWER, pl.REASON_OK, intent,
                             pl.select_contexts(req.contexts, rules.K_PROMPT),
                             pl.select_vocab(req.vocab, rules.K_VOCAB))


def user_msg(msgs):
    assert msgs[-1]["role"] == "user"
    return msgs[-1]["content"]


# --- Danh so ngu canh ----------------------------------------------------------------------------


def test_contexts_numbered_in_pipeline_order():
    req = make_req(contexts=[ctx(3, 0.30), ctx(1, 0.10), ctx(2, 0.20)])
    res = answer_result(req)
    text = user_msg(pr.build_messages(req, res))
    assert re.findall(r"^\[(\d+)\]", text, flags=re.M) == ["1", "2", "3"]
    # [1] la doan distance nho nhat (gram_001), dung thu tu pipeline
    assert text.index("[1]") < text.index("Nội dung đoạn 1") < text.index("[2]") < text.index("Nội dung đoạn 2")
    assert pr.context_number_map(res.contexts) == {1: "gram_001", 2: "gram_002", 3: "gram_003"}


def test_contexts_capped_at_k_prompt_and_ids_hidden():
    req = make_req(contexts=[ctx(i, 0.1 + i / 100) for i in range(1, 9)])
    text = user_msg(pr.build_messages(req, answer_result(req)))
    assert re.findall(r"^\[(\d+)\]", text, flags=re.M) == [str(i) for i in range(1, rules.K_PROMPT + 1)]
    assert "gram_0" not in text  # LLM chi thay so, khong thay id


def test_context_content_stripped_and_cefr_shown():
    req = make_req(contexts=[ctx(1, 0.1, cefr="A2"), ctx(2, 0.2, cefr=None)])
    text = user_msg(pr.build_messages(req, answer_result(req)))
    assert "[1] (trình độ A2)\nTiêu đề 1\nNội dung đoạn 1." in text
    assert "[2]\nTiêu đề 2" in text


def test_no_context_block_when_empty():
    req = make_req(word={"term": "reluctant", "pos": "adj", "meaning_vi": "miễn cưỡng"})
    res = answer_result(req)
    assert res.contexts == []
    text = user_msg(pr.build_messages(req, res))
    assert pr.NO_DOCS_WORD_LINE in text and pr.NO_DOCS_LINE not in text  # v2: chi ro quy tac 4
    assert "quy tắc 4" in pr.NO_DOCS_WORD_LINE
    assert not re.search(r"\[\d+\]", text)
    assert "TỪ ĐANG HỌC: reluctant (adj) — miễn cưỡng" in text
    assert pr.context_number_map(res.contexts) == {}


def test_word_absent_when_null_and_vocab_rendered():
    req = make_req(contexts=[ctx(1, 0.1)], vocab=[
        {"term": "already", "pos": "adv", "meaning_vi": "đã, rồi", "example_en": "I have already eaten.",
         "match": "exact", "distance": 0.0},
        {"term": "yet", "pos": "adv", "meaning_vi": "chưa", "match": "vector", "distance": 0.2}])
    text = user_msg(pr.build_messages(req, answer_result(req)))
    assert "TỪ ĐANG HỌC" not in text
    assert "- already (adv): đã, rồi — Ví dụ: I have already eaten." in text
    assert "- yet (adv): chưa" in text and "chưa — Ví dụ" not in text  # example_en null -> khong in


def test_cefr_and_question_in_user_message():
    req = make_req(contexts=[ctx(1, 0.1)], user_cefr="A2")
    text = user_msg(pr.build_messages(req, answer_result(req)))
    assert text.startswith("TRÌNH ĐỘ: A2")
    assert text.endswith("CÂU HỎI:\n<<<\nkhi nào dùng hiện tại hoàn thành\n>>>")
    req2 = make_req(contexts=[ctx(1, 0.1)])
    assert user_msg(pr.build_messages(req2, answer_result(req2))).startswith("TRÌNH ĐỘ: không rõ")


# --- History -------------------------------------------------------------------------------------


def test_history_kept_in_order_between_system_and_user():
    hist = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"lượt {i}"} for i in range(6)]
    req = make_req(contexts=[ctx(1, 0.1)], history=hist)
    msgs = pr.build_messages(req, answer_result(req))
    assert msgs[0] == {"role": "system", "content": pr.SYSTEM_PROMPT}
    assert msgs[1:-1] == hist
    assert len(msgs) == 8


def test_no_history_gives_two_messages():
    req = make_req(contexts=[ctx(1, 0.1)])
    msgs = pr.build_messages(req, answer_result(req))
    assert [m["role"] for m in msgs] == ["system", "user"]


# --- Goi y theo nhan -----------------------------------------------------------------------------


@pytest.mark.parametrize("label", ["nghia_tu", "cach_dung", "ngu_phap", "phan_biet"])
def test_hint_added_for_in_scope_labels(label):
    req = make_req(contexts=[ctx(1, 0.1)])
    text = user_msg(pr.build_messages(req, answer_result(req, label)))
    assert pr.HINT_PREFIX + pr.INTENT_HINTS[label] in text
    assert text.index("GỢI Ý") < text.index("CÂU HỎI")


@pytest.mark.parametrize("label", ["ngoai_pham_vi", None])
def test_no_hint_without_in_scope_label(label):
    req = make_req(contexts=[ctx(1, 0.1)])
    text = user_msg(pr.build_messages(req, answer_result(req, label)))
    assert "GỢI Ý" not in text


def test_hint_labels_match_intent_labels():
    from app.services.intent import LABELS, OUT_OF_SCOPE
    assert set(pr.INTENT_HINTS) == set(LABELS) - {OUT_OF_SCOPE}


# --- Chi dung prompt khi answer, hang so ---------------------------------------------------------


@pytest.mark.parametrize("decision", [rules.NO_CONTEXT, rules.OUT_OF_SCOPE])
def test_refuses_to_build_for_non_answer(decision):
    req = make_req(contexts=[ctx(1, 0.1)])
    with pytest.raises(ValueError):
        pr.build_messages(req, pl.PipelineResult(decision, "x", None))


def test_system_prompt_is_fixed_and_quotes_fixed_texts():
    assert pr.TEXT_OUT_OF_SCOPE in pr.SYSTEM_PROMPT and pr.TEXT_NO_CONTEXT in pr.SYSTEM_PROMPT
    assert "{" not in pr.SYSTEM_PROMPT  # f-string da dien het, khong con cho trong
    req = make_req(contexts=[ctx(1, 0.1)], user_cefr="B2")
    assert pr.build_messages(req, answer_result(req))[0]["content"] == pr.SYSTEM_PROMPT


def test_generation_constants():
    assert pr.PROMPT_VERSION == "v2"
    assert pr.GENERATION_PARAMS == {"temperature": 0.2, "max_completion_tokens": 500,
                                    "reasoning_effort": "low", "include_reasoning": False}
    assert "max_tokens" not in pr.GENERATION_PARAMS and "reasoning_format" not in pr.GENERATION_PARAMS


# --- File 12 ca phat trien -----------------------------------------------------------------------


def test_dev_cases_file_shape():
    rows = [json.loads(line) for line in CASES.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(rows) == 12
    assert len({r["id"] for r in rows}) == 12
    keys = {"id", "source", "question", "word", "history", "user_cefr", "contexts", "expected", "note"}
    for r in rows:
        assert set(r) == keys, r["id"]
        assert r["expected"] in {"grounded", "refuse", "word_only"}
        assert r["contexts"] in {"e5_top8", "empty"}
        assert r["user_cefr"] in {None, "A1", "A2", "B1", "B2"}
        # dung duoc thanh AskRequest that (contexts dung luc chay)
        AskRequest.model_validate({"question": r["question"], "word": r["word"], "history": r["history"],
                                   "user_cefr": r["user_cefr"], "contexts": []})
    exp = [r["expected"] for r in rows]
    assert exp.count("grounded") == 6 and exp.count("refuse") == 5 and exp.count("word_only") == 1
    word_only = [r for r in rows if r["expected"] == "word_only"]
    assert all(r["contexts"] == "empty" and r["word"] for r in word_only)
    assert {r["source"] for r in rows} >= {"n03", "n04"}
    assert any(r["history"] for r in rows)


def test_no_docs_without_word_uses_plain_line():
    req = make_req(vocab=[{"term": "since", "pos": "prep", "meaning_vi": "kể từ", "match": "exact",
                           "distance": 0.0}])
    text = user_msg(pr.build_messages(req, answer_result(req)))
    assert pr.NO_DOCS_LINE in text and pr.NO_DOCS_WORD_LINE not in text


def test_v2_rules_present_in_system_prompt():
    sp = pr.SYSTEM_PROMPT
    assert 'không viết "Tài liệu 1"' in sp
    assert "phải kết thúc bằng [n]" in sp
    assert "không tự khái quát" in sp
    assert '"từ này", "nó"' in sp and "KHÔNG dùng câu của quy tắc 5" in sp
    assert "Không ghi tên trình độ" in sp
