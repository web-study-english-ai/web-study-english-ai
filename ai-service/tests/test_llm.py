"""Test app/services/llm.py (WSEA-140) bang httpx.MockTransport. KHONG goi mang."""

import asyncio
import json
import logging

import httpx
import pytest

from app.config import settings
from app.services import llm as L
from tests.conftest import TEST_LLM_KEY

MSGS = [{"role": "system", "content": "s"}, {"role": "user", "content": "câu hỏi bí mật của người học"}]


def ok(content="Trả lời [1].", finish="stop", usage=None):
    return httpx.Response(200, json={
        "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": finish}],
        "usage": usage or {"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120}})


class Recorder:
    """Handler MockTransport: tra lan luot cac phan hoi, ghi lai request."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests: list[httpx.Request] = []

    def __call__(self, request):
        self.requests.append(request)
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r

    def bodies(self):
        return [json.loads(r.content) for r in self.requests]


def make(handler, clock=None, **over):
    s = settings.model_copy(update=over)
    kw = {"clock": clock} if clock else {}
    return L.LLMClient.from_settings(s, transport=httpx.MockTransport(handler), **kw)


def run(client, msgs=MSGS):
    async def go():
        try:
            return await client.complete(msgs)
        finally:
            await client.aclose()
    return asyncio.run(go())


def unavailable(client):
    with pytest.raises(L.LLMUnavailable) as ei:
        run(client)
    return ei.value


# --- Thanh cong ---------------------------------------------------------------------------------


def test_success_returns_text_usage_and_request_shape():
    rec = Recorder(ok("Dùng hiện tại hoàn thành [1][3]."))
    out = run(make(rec))
    assert out.text == "Dùng hiện tại hoàn thành [1][3]."  # client khong hau xu ly
    assert (out.model_used, out.attempts, out.finish_reason) == ("openai/gpt-oss-120b", 1, "stop")
    assert out.usage["total_tokens"] == 120
    req = rec.requests[0]
    assert req.method == "POST"
    assert str(req.url) == "http://llm.invalid/openai/v1/chat/completions"
    assert req.headers["user-agent"].startswith("wsea-ai-service/")
    assert "python" not in req.headers["user-agent"].lower()
    assert req.headers["authorization"] == f"Bearer {TEST_LLM_KEY}"


def test_body_gpt_oss_has_reasoning_params():
    rec = Recorder(ok())
    run(make(rec))
    body = rec.bodies()[0]
    assert body["model"] == "openai/gpt-oss-120b"
    assert body["messages"] == MSGS
    assert body["temperature"] == 0.2
    assert body["max_completion_tokens"] == 500
    assert body["reasoning_effort"] == "low"
    assert body["include_reasoning"] is False
    assert "max_tokens" not in body and "reasoning_format" not in body


def test_body_other_model_has_no_reasoning_params():
    rec = Recorder(ok())
    run(make(rec, llm_model="llama-3.3-70b-versatile"))
    body = rec.bodies()[0]
    assert body["model"] == "llama-3.3-70b-versatile"
    assert "reasoning_effort" not in body and "include_reasoning" not in body
    assert body["max_completion_tokens"] == 500


def test_length_with_content_is_kept_with_warning(caplog):
    caplog.set_level(logging.WARNING, logger="app.services.llm")
    out = run(make(Recorder(ok("Câu trả lời bị cắt", finish="length"))))
    assert (out.text, out.finish_reason) == ("Câu trả lời bị cắt", "length")
    assert any(r.levelno == logging.WARNING and "max_completion_tokens" in r.getMessage() for r in caplog.records)


# --- 429 va du phong ----------------------------------------------------------------------------


def test_429_then_fallback_success():
    rec = Recorder(httpx.Response(429, json={"error": {"message": "rate"}}), ok("ok [2]"))
    out = run(make(rec))
    assert [b["model"] for b in rec.bodies()] == ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]
    assert (out.model_used, out.attempts, out.text) == ("openai/gpt-oss-20b", 2, "ok [2]")
    assert rec.bodies()[1]["reasoning_effort"] == "low"  # fallback cung la gpt-oss


def test_429_twice_is_rate_limited_and_only_two_calls():
    rec = Recorder(httpx.Response(429), httpx.Response(429))
    err = unavailable(make(rec))
    assert (err.reason, err.attempts, len(rec.requests)) == (L.RATE_LIMITED, 2, 2)


def test_429_without_fallback_model_no_retry():
    rec = Recorder(httpx.Response(429))
    err = unavailable(make(rec, llm_fallback_model=""))
    assert (err.reason, len(rec.requests)) == (L.RATE_LIMITED, 1)


def test_fallback_uses_remaining_budget_and_stops_when_spent():
    t = iter([0.0, 0.5, 13.0])  # deadline 12; lan 2 bat dau o 13 -> het ngan sach, khong goi
    rec = Recorder(httpx.Response(429))
    err = unavailable(make(rec, clock=lambda: next(t)))
    assert (err.reason, len(rec.requests)) == (L.TIMEOUT, 1)


@pytest.mark.parametrize("status", [500, 502, 503])
def test_5xx_is_upstream_error_no_retry(status):
    rec = Recorder(httpx.Response(status))
    err = unavailable(make(rec))
    assert (err.reason, len(rec.requests)) == (L.UPSTREAM_ERROR, 1)


def test_403_is_upstream_error():
    assert unavailable(make(Recorder(httpx.Response(403, text="error code: 1010")))).reason == L.UPSTREAM_ERROR


# --- Het gio, thieu khoa, phan hoi hong ---------------------------------------------------------


def test_httpx_timeout_is_timeout():
    rec = Recorder(httpx.ReadTimeout("slow"))
    assert unavailable(make(rec)).reason == L.TIMEOUT


def test_total_budget_enforced_by_wait_for():
    async def slow(request):
        await asyncio.sleep(1)
        return ok()
    assert unavailable(make(slow, llm_timeout_s=0.05)).reason == L.TIMEOUT


def test_connect_error_is_upstream_error():
    assert unavailable(make(Recorder(httpx.ConnectError("dns")))).reason == L.UPSTREAM_ERROR


@pytest.mark.parametrize("key", [None, "", "   "])
def test_missing_key_no_call(key):
    rec = Recorder()
    client = L.LLMClient(httpx.AsyncClient(transport=httpx.MockTransport(rec)), api_key=key,
                         model="openai/gpt-oss-120b", fallback_model="openai/gpt-oss-20b", timeout_s=12,
                         temperature=0.2, max_completion_tokens=500, reasoning_effort="low")
    err = unavailable(client)
    assert (err.reason, rec.requests) == (L.NO_KEY, [])


def test_from_settings_without_key_is_no_key():
    rec = Recorder()
    assert unavailable(make(rec, llm_api_key=None)).reason == L.NO_KEY
    assert rec.requests == []


def test_empty_content_with_length_is_empty_content():
    rec = Recorder(ok(content="", finish="length", usage={"completion_tokens": 500}))
    assert unavailable(make(rec)).reason == L.EMPTY_CONTENT


def test_null_content_is_empty_content():
    rec = Recorder(httpx.Response(200, json={"choices": [{"message": {"content": None}, "finish_reason": "stop"}]}))
    assert unavailable(make(rec)).reason == L.EMPTY_CONTENT


@pytest.mark.parametrize("resp", [
    httpx.Response(200, text="khong phai json"),
    httpx.Response(200, json={"choices": []}),
    httpx.Response(200, json={"foo": 1}),
    httpx.Response(200, json=[1, 2]),
])
def test_bad_response(resp):
    assert unavailable(make(Recorder(resp))).reason == L.BAD_RESPONSE


# --- Log ----------------------------------------------------------------------------------------


def test_key_and_question_never_logged(caplog):
    caplog.set_level(logging.DEBUG)
    run(make(Recorder(ok())))
    unavailable(make(Recorder(httpx.Response(429), httpx.Response(429))))
    unavailable(make(Recorder(httpx.Response(500))))
    unavailable(make(Recorder(ok(content=""))))
    unavailable(make(Recorder(httpx.Response(200, text="x"))))
    text = caplog.text
    assert caplog.records  # co log that
    assert TEST_LLM_KEY not in text
    assert "câu hỏi bí mật" not in text


def test_unavailable_rejects_unknown_reason():
    with pytest.raises(ValueError):
        L.LLMUnavailable("khac")
