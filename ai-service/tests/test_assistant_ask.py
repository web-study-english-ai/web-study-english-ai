"""Test POST /assistant/ask JSON (WSEA-140). Embedder + y dinh GIA, LLM qua httpx.MockTransport.

KHONG goi mang: client LLM that cua lifespan bi thay bang client dung MockTransport.
"""

import json
import logging

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services.embedder import Embedder
from app.services.llm import LLMClient
from app.services.prompts import TEXT_NO_CONTEXT, TEXT_OUT_OF_SCOPE
from tests.conftest import TEST_API_KEY, TEST_LLM_KEY
from tests.test_embedder import FakeModel
from tests.test_llm import Recorder, ok
from tests.test_pipeline import FakeIntent, ctx, voc

AUTH = {"x-api-key": TEST_API_KEY}
URL = "/assistant/ask"


@pytest.fixture
def make_client(monkeypatch):
    """make_client(*responses, intent=FakeIntent()) -> (TestClient, Recorder)."""
    opened = []

    def factory(*responses, intent=None, **over):
        rec = Recorder(*responses)
        c = TestClient(app)
        c.__enter__()
        opened.append(c)
        models = c.app.state.models
        monkeypatch.setitem(models, "embedder", Embedder(model=FakeModel()))
        monkeypatch.setitem(models, "intent", intent or FakeIntent())
        llm = LLMClient.from_settings(settings.model_copy(update=over), transport=httpx.MockTransport(rec))
        monkeypatch.setattr(c.app.state, "llm", llm)
        return c, rec

    yield factory
    for c in opened:
        c.__exit__(None, None, None)


def body(**over):
    b = {"question": "khi nào dùng since", "contexts": [ctx(f"g{i}", 0.1 + 0.01 * i) for i in range(8)],
         "vocab": [], "history": [], "user_cefr": "B1"}
    b.update(over)
    return b


def post(c, b, headers=AUTH):
    return c.post(URL, json=b, headers=headers)


# --- answer -> LLM ------------------------------------------------------------------------------


def test_answer_with_citations(make_client):
    c, rec = make_client(ok("Dùng since với mốc thời gian [1]. Dùng for với khoảng [3][1]."))
    res = post(c, body())
    assert res.status_code == 200
    assert res.json() == {"answer": "Dùng since với mốc thời gian. Dùng for với khoảng.",
                          "source_ids": ["g0", "g2"]}
    assert "llm;dur=" in res.headers["server-timing"]
    sent = json.loads(rec.requests[0].content)
    assert sent["messages"][0]["role"] == "system"
    assert "[5]" in sent["messages"][-1]["content"] and "[6]" not in sent["messages"][-1]["content"]


def test_nonexistent_citation_dropped(make_client):
    c, _ = make_client(ok("Ý A [7]. Ý B [2]."))
    data = post(c, body()).json()
    assert data == {"answer": "Ý A. Ý B.", "source_ids": ["g1"]}


def test_word_only_no_sources(make_client):
    c, rec = make_client(ok("Reluctant nghĩa là miễn cưỡng.\n- She was reluctant to help."))
    res = post(c, body(question="cho mình ví dụ với từ này", contexts=[],
                       word={"term": "reluctant", "pos": "adj", "meaning_vi": "miễn cưỡng"}))
    assert res.status_code == 200
    assert res.json()["source_ids"] == []
    assert "TỪ ĐANG HỌC: reluctant" in json.loads(rec.requests[0].content)["messages"][-1]["content"]


def test_fixed_text_inside_long_answer(make_client):
    c, _ = make_client(ok("Hmm. " + TEXT_OUT_OF_SCOPE + " [2] Nhưng đây là code: def f(): pass"))
    assert post(c, body()).json() == {"answer": TEXT_OUT_OF_SCOPE, "source_ids": []}


def test_429_fallback_through_endpoint(make_client):
    c, rec = make_client(httpx.Response(429), ok("ok [1]"))
    res = post(c, body())
    assert res.status_code == 200 and res.json()["source_ids"] == ["g0"]
    assert [json.loads(r.content)["model"] for r in rec.requests] == ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]


# --- Khong goi LLM ------------------------------------------------------------------------------


def test_out_of_scope_does_not_call_llm(make_client):
    c, rec = make_client(intent=FakeIntent("ngoai_pham_vi", 0.9))
    res = post(c, body(question="thời tiết hôm nay"))
    assert res.status_code == 200
    assert res.json() == {"answer": TEXT_OUT_OF_SCOPE, "source_ids": []}
    assert rec.requests == []


def test_no_context_does_not_call_llm(make_client):
    c, rec = make_client()
    res = post(c, body(contexts=[], vocab=[]))
    assert res.json() == {"answer": TEXT_NO_CONTEXT, "source_ids": []}
    assert rec.requests == []
    res2 = post(c, body(contexts=[ctx("far", 0.5)]))  # top1_too_far
    assert res2.json() == {"answer": TEXT_NO_CONTEXT, "source_ids": []}
    assert rec.requests == []


def test_exact_vocab_answers(make_client):
    c, rec = make_client(ok("since [1]"))
    res = post(c, body(contexts=[ctx("far", 0.5)], vocab=[voc("since", "exact", 0.0)]))
    assert res.json()["source_ids"] == ["far"] and len(rec.requests) == 1


# --- 503 ----------------------------------------------------------------------------------------


@pytest.mark.parametrize("responses, reason", [
    ((httpx.Response(429), httpx.Response(429)), "rate_limited"),
    ((httpx.Response(500),), "upstream_error"),
    ((httpx.ReadTimeout("slow"),), "timeout"),
    ((ok(content="", finish="length"),), "empty_content"),
    ((httpx.Response(200, text="hong"),), "bad_response"),
    ((ok("[1][2]"),), "empty_content"),  # chi co ky hieu trich -> rong sau hau xu ly
])
def test_llm_failures_are_503(make_client, responses, reason):
    c, _ = make_client(*responses)
    res = post(c, body())
    assert res.status_code == 503
    assert reason in res.json()["detail"]
    assert "llm;dur=" in res.headers["server-timing"]


def test_missing_key_503_no_key(make_client):
    c, rec = make_client(llm_api_key=None)
    res = post(c, body())
    assert res.status_code == 503 and "no_key" in res.json()["detail"]
    assert rec.requests == []


def test_embedder_missing_503(make_client, monkeypatch):
    c, rec = make_client()
    monkeypatch.setitem(c.app.state.models, "embedder", None)
    assert post(c, body()).status_code == 503
    assert rec.requests == []


def test_auth_and_validation(make_client):
    c, rec = make_client()
    assert post(c, body(), headers={}).status_code == 401
    assert post(c, body(question="")).status_code == 422
    assert rec.requests == []


def test_key_and_question_not_logged(make_client, caplog):
    caplog.set_level(logging.DEBUG)
    c, _ = make_client(ok("ok [1]"), httpx.Response(500))
    q = "câu hỏi riêng tư của người học về since"
    assert post(c, body(question=q)).status_code == 200
    assert post(c, body(question=q)).status_code == 503
    assert TEST_LLM_KEY not in caplog.text
    assert q not in caplog.text
    assert any("cau_hoi=" in r.getMessage() for r in caplog.records)


def test_lifespan_creates_llm_client():
    with TestClient(app) as c:
        assert isinstance(c.app.state.llm, LLMClient)
        assert "llm" not in c.app.state.models  # /health khong doi


def test_llm_not_initialized_503(make_client, monkeypatch):
    c, rec = make_client()
    monkeypatch.setattr(c.app.state, "llm", None)
    res = post(c, body())
    assert res.status_code == 503 and "not_initialized" in res.json()["detail"]
