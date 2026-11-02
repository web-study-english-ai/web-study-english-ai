"""Test SSE cua POST /assistant/ask va LLMClient.open_stream (WSEA-140 B4).

Luong SSE cua Groq gia lap bang httpx.MockTransport. KHONG goi mang.
"""

import asyncio
import json
import logging

import httpx
import pytest

from app.services import llm as L
from app.services.prompts import TEXT_NO_CONTEXT, TEXT_OUT_OF_SCOPE
from tests.conftest import TEST_LLM_KEY
from tests.test_assistant_ask import AUTH, body, make_client  # noqa: F401 (fixture)
from tests.test_llm import MSGS, Recorder, make
from tests.test_pipeline import FakeIntent, ctx

SSE = {**AUTH, "accept": "text/event-stream"}
URL = "/assistant/ask"


def chunk(text=None, finish=None, **extra):
    delta = {} if text is None else {"content": text}
    return {"id": "c", "object": "chat.completion.chunk", "choices": [{"index": 0, "delta": delta,
                                                                       "finish_reason": finish}], **extra}


def groq_bytes(pieces, done=True, usage=True):
    """Luong Groq gia: moi doan mot su kien data:, chunk cuoi co finish_reason (+ x_groq.usage), [DONE]."""
    out = [": keep-alive\n\n",  # dong chu thich SSE: phai bo qua
           "data: " + json.dumps({"choices": [{"index": 0, "delta": {"role": "assistant"},
                                               "finish_reason": None}]}) + "\n\n"]
    out += ["data: " + json.dumps(chunk(p), ensure_ascii=False) + "\n\n" for p in pieces]
    extra = {"x_groq": {"usage": {"prompt_tokens": 9, "completion_tokens": 3, "total_tokens": 12}}} if usage else {}
    out.append("data: " + json.dumps(chunk(finish="stop", **extra)) + "\n\n")
    if done:
        out.append("data: [DONE]\n\n")
    return "".join(out).encode("utf-8")


def sse_ok(pieces, **kw):
    return httpx.Response(200, content=groq_bytes(pieces, **kw), headers={"content-type": "text/event-stream"})


class BrokenStream(httpx.AsyncByteStream):
    """Tra vai doan roi nem loi mang (dut giua luong)."""

    def __init__(self, parts: list[bytes]):
        self.parts = parts

    async def __aiter__(self):
        for p in self.parts:
            yield p
        raise httpx.ReadError("dut ket noi")


def sse_broken(pieces):
    data = [("data: " + json.dumps(chunk(p), ensure_ascii=False) + "\n\n").encode() for p in pieces]
    return httpx.Response(200, stream=BrokenStream(data), headers={"content-type": "text/event-stream"})


def events(res) -> list:
    """Body SSE -> danh sach payload (dict hoac '[DONE]')."""
    out = []
    for block in res.text.split("\n\n"):
        block = block.strip()
        if not block:
            continue
        assert block.startswith("data: "), block
        data = block[len("data: "):]
        out.append(data if data == "[DONE]" else json.loads(data))
    return out


# --- LLMClient.open_stream ------------------------------------------------------------------------


def collect(client):
    async def go():
        try:
            st = await client.open_stream(MSGS)
            parts = [p async for p in st.chunks()]
            return st, parts
        finally:
            await client.aclose()
    return asyncio.run(go())


def test_open_stream_body_headers_and_chunks():
    rec = Recorder(sse_ok(["Dùng ", "since [1]", "."]))
    st, parts = collect(make(rec))
    assert parts == ["Dùng ", "since [1]", "."]
    assert (st.model_used, st.attempts, st.finish_reason) == ("openai/gpt-oss-120b", 1, "stop")
    assert st.usage["total_tokens"] == 12
    req = rec.requests[0]
    sent = json.loads(req.content)
    assert sent["stream"] is True and sent["reasoning_effort"] == "low" and sent["include_reasoning"] is False
    assert req.headers["user-agent"].startswith("wsea-ai-service/")
    assert req.headers["authorization"] == f"Bearer {TEST_LLM_KEY}"


def test_open_stream_other_model_no_reasoning_params():
    rec = Recorder(sse_ok(["ok"]))
    collect(make(rec, llm_model="llama-3.3-70b-versatile"))
    sent = json.loads(rec.requests[0].content)
    assert sent["stream"] is True and "reasoning_effort" not in sent and "include_reasoning" not in sent


def test_open_stream_429_then_fallback():
    rec = Recorder(httpx.Response(429), sse_ok(["ok"]))
    st, parts = collect(make(rec))
    assert [json.loads(r.content)["model"] for r in rec.requests] == ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]
    assert (st.model_used, st.attempts, parts) == ("openai/gpt-oss-20b", 2, ["ok"])


@pytest.mark.parametrize("responses, reason", [
    ((httpx.Response(429), httpx.Response(429)), L.RATE_LIMITED),
    ((httpx.Response(500),), L.UPSTREAM_ERROR),
    ((httpx.ReadTimeout("slow"),), L.TIMEOUT),
    ((httpx.Response(200, content=b"data: [DONE]\n\n"),), L.EMPTY_CONTENT),
    ((httpx.Response(200, content=b"data: {hong\n\n"),), L.BAD_RESPONSE),
    ((httpx.Response(200, content=b'data: {"error": {"message": "x"}}\n\n'),), L.BAD_RESPONSE),
    ((sse_broken([]),), L.UPSTREAM_ERROR),
])
def test_open_stream_errors_before_first_token(responses, reason):
    with pytest.raises(L.LLMUnavailable) as ei:
        collect(make(Recorder(*responses)))
    assert ei.value.reason == reason


def test_open_stream_no_key():
    rec = Recorder()
    with pytest.raises(L.LLMUnavailable) as ei:
        collect(make(rec, llm_api_key=None))
    assert ei.value.reason == L.NO_KEY and rec.requests == []


def test_stream_broken_mid_stream_raises_stream_error():
    with pytest.raises(L.LLMStreamError):
        collect(make(Recorder(sse_broken(["Dùng ", "since"]))))


def test_stream_without_done_is_broken():
    with pytest.raises(L.LLMStreamError):
        collect(make(Recorder(sse_ok(["a", "b"], done=False))))


def test_stream_budget_enforced():
    async def slow_stream(request):
        class Slow(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield ("data: " + json.dumps(chunk("a")) + "\n\n").encode()
                await asyncio.sleep(1)
                yield b"data: [DONE]\n\n"
        return httpx.Response(200, stream=Slow())
    with pytest.raises(L.LLMStreamError):
        collect(make(slow_stream, llm_stream_timeout_s=0.1))


# --- Endpoint SSE ---------------------------------------------------------------------------------


def test_sse_normal_stream_hides_citation_split_across_chunks(make_client):
    pieces = ["Dùng **since** với mốc thời gian ", "[", "1]. Dùng for với khoảng ", "【3", "】", " và [Tài ", "liệu 2]."]
    c, rec = make_client(sse_ok(pieces))
    res = c.post(URL, json=body(), headers=SSE)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    assert res.headers["cache-control"] == "no-cache" and res.headers["x-accel-buffering"] == "no"
    ev = events(res)
    assert ev[-1] == "[DONE]"
    final = ev[-2]
    assert final == {"answer": "Dùng since với mốc thời gian. Dùng for với khoảng và.",
                     "source_ids": ["g0", "g2", "g1"]}
    deltas = [e["delta"] for e in ev[:-2]]
    assert all(set(e) == {"delta"} for e in ev[:-2]) and len(deltas) >= 2
    joined = "".join(deltas)
    assert joined == final["answer"]
    for d in deltas:
        assert "[" not in d and "]" not in d and "【" not in d and "*" not in d and "Tài liệu" not in d
    assert json.loads(rec.requests[0].content)["stream"] is True
    assert "llm_first;dur=" in res.headers["server-timing"]


def test_sse_bullets_and_star_kept(make_client):
    c, _ = make_client(sse_ok(["- Ví dụ:", "\n", "  * I *", "lost*", " my keys [1]", "\n2*3*4"]))
    ev = events(c.post(URL, json=body(), headers=SSE))
    final = ev[-2]
    assert final["answer"] == "- Ví dụ:\n  * I lost my keys\n2*3*4"
    assert "".join(e["delta"] for e in ev[:-2]) == final["answer"]


def test_sse_fixed_text_in_stream_final_uses_fixed(make_client):
    c, _ = make_client(sse_ok(["Ừm. ", TEXT_OUT_OF_SCOPE, " [1]"]))
    ev = events(c.post(URL, json=body(), headers=SSE))
    assert ev[-2] == {"answer": TEXT_OUT_OF_SCOPE, "source_ids": []} and ev[-1] == "[DONE]"


def test_sse_out_of_scope_no_llm(make_client):
    c, rec = make_client(intent=FakeIntent("ngoai_pham_vi", 0.9))
    res = c.post(URL, json=body(question="thời tiết hôm nay"), headers=SSE)
    assert res.status_code == 200
    assert events(res) == [{"delta": TEXT_OUT_OF_SCOPE}, {"answer": TEXT_OUT_OF_SCOPE, "source_ids": []}, "[DONE]"]
    assert rec.requests == []


def test_sse_no_context_no_llm(make_client):
    c, rec = make_client()
    res = c.post(URL, json=body(contexts=[ctx("far", 0.5)]), headers=SSE)
    assert events(res) == [{"delta": TEXT_NO_CONTEXT}, {"answer": TEXT_NO_CONTEXT, "source_ids": []}, "[DONE]"]
    assert rec.requests == []


def test_sse_429_then_fallback(make_client):
    c, rec = make_client(httpx.Response(429), sse_ok(["ok [2]"]))
    ev = events(c.post(URL, json=body(), headers=SSE))
    assert ev[-2] == {"answer": "ok", "source_ids": ["g1"]}
    assert [json.loads(r.content)["model"] for r in rec.requests] == ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]


@pytest.mark.parametrize("responses, reason", [
    ((httpx.Response(500),), "upstream_error"),
    ((httpx.Response(429), httpx.Response(429)), "rate_limited"),
    ((httpx.Response(200, content=b"data: [DONE]\n\n"),), "empty_content"),
])
def test_sse_error_before_first_token_is_http_503(make_client, responses, reason):
    c, _ = make_client(*responses)
    res = c.post(URL, json=body(), headers=SSE)
    assert res.status_code == 503
    assert res.headers["content-type"].startswith("application/json")
    assert reason in res.json()["detail"]


def test_sse_no_key_503(make_client):
    c, rec = make_client(llm_api_key=None)
    res = c.post(URL, json=body(), headers=SSE)
    assert res.status_code == 503 and "no_key" in res.json()["detail"] and rec.requests == []


def test_sse_broken_mid_stream_has_no_final_frame(make_client, caplog):
    caplog.set_level(logging.ERROR)
    c, _ = make_client(sse_broken(["Dùng since ", "với mốc thời gian [1]. ", "Còn"]))
    res = c.post(URL, json=body(), headers=SSE)
    assert res.status_code == 200
    ev = events(res)
    assert ev and all(isinstance(e, dict) and set(e) == {"delta"} for e in ev)  # khong co answer, khong [DONE]
    assert "[DONE]" not in res.text and '"answer"' not in res.text
    assert any("dut giua chung" in r.getMessage() for r in caplog.records)
    assert TEST_LLM_KEY not in caplog.text


def test_sse_auth_and_validation(make_client):
    c, rec = make_client()
    assert c.post(URL, json=body(), headers={"accept": "text/event-stream"}).status_code == 401
    assert c.post(URL, json=body(question=""), headers=SSE).status_code == 422
    assert rec.requests == []
