"""Goi LLM sinh cau tra loi qua API tuong thich OpenAI (Groq) bang httpx (WSEA-140).

Thiet ke: docs/DECISIONS.md muc "2026-11-02 — WSEA-140" (Q1, Q2, Q5).
- Mot httpx.AsyncClient tao trong lifespan, dong khi tat. Header User-Agent rieng: Groq/Cloudflare
  tra 403 "error code: 1010" voi User-Agent mac dinh cua Python.
- 429 o model chinh -> goi lai DUNG 1 lan bang model du phong, trong phan thoi gian con lai.
  Moi loi khac -> LLMUnavailable(reason); router tra 503. Khong thu lai kieu khac.
- llm_timeout_s la ngan sach TONG cho moi lan goi (phai < 15 s timeout JSON cua backend).
KHONG log khoa, KHONG log noi dung tin nhan.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger(__name__)

CHAT_PATH = "chat/completions"  # tuong doi: httpx noi vao sau base_url (.../openai/v1/)
GPT_OSS_PREFIX = "openai/gpt-oss"

NO_KEY = "no_key"
RATE_LIMITED = "rate_limited"
TIMEOUT = "timeout"
UPSTREAM_ERROR = "upstream_error"
EMPTY_CONTENT = "empty_content"
BAD_RESPONSE = "bad_response"
REASONS = (NO_KEY, RATE_LIMITED, TIMEOUT, UPSTREAM_ERROR, EMPTY_CONTENT, BAD_RESPONSE)


class LLMUnavailable(Exception):
    """Khong lay duoc cau tra loi tu LLM. reason thuoc REASONS (router dua vao detail 503)."""

    def __init__(self, reason: str, attempts: int = 0):
        if reason not in REASONS:
            raise ValueError(f"reason {reason!r} không thuộc {REASONS}")
        super().__init__(reason)
        self.reason = reason
        self.attempts = attempts


@dataclass
class LLMResult:
    text: str
    model_used: str
    usage: dict[str, Any] = field(default_factory=dict)
    finish_reason: str | None = None
    attempts: int = 1


def user_agent(version: str) -> str:
    return f"wsea-ai-service/{version}"


def build_body(model: str, messages: list[dict[str, str]], *, temperature: float,
               max_completion_tokens: int, reasoning_effort: str, stream: bool = False) -> dict[str, Any]:
    """Body chat completions. Tham so suy luan CHI gui cho gpt-oss (model khac co the tra 400)."""
    body: dict[str, Any] = {"model": model, "messages": messages, "temperature": temperature,
                            "max_completion_tokens": max_completion_tokens}
    if stream:
        body["stream"] = True
    if model.startswith(GPT_OSS_PREFIX):
        body["reasoning_effort"] = reasoning_effort
        body["include_reasoning"] = False  # reasoning_format khong ho tro voi gpt-oss
    return body


def parse_response(resp: httpx.Response, model: str, attempts: int) -> LLMResult:
    try:
        data = resp.json()
        choice = data["choices"][0]
        content = choice["message"].get("content")
        finish = choice.get("finish_reason")
        usage = data.get("usage") or {}
    except (ValueError, KeyError, IndexError, TypeError, AttributeError) as exc:
        logger.error("LLM %s: phan hoi hong (%s)", model, type(exc).__name__)
        raise LLMUnavailable(BAD_RESPONSE, attempts) from exc
    if not isinstance(content, str) or not content.strip():
        # finish_reason=length + content rong: suy luan an het max_completion_tokens.
        logger.error("LLM %s: content rong (finish_reason=%s, usage=%s)", model, finish, usage)
        raise LLMUnavailable(EMPTY_CONTENT, attempts)
    if finish == "length":
        logger.warning("LLM %s: cat do max_completion_tokens (usage=%s), van dung noi dung", model, usage)
    return LLMResult(content.strip(), model, usage if isinstance(usage, dict) else {}, finish, attempts)


# --- Luong SSE (B4) ------------------------------------------------------------------------------
# Tai lieu Groq (doc 02/11) chi xac nhan: su kien "data: ..." va ket thuc bang "data: [DONE]".
# Hinh chunk doc theo kieu tuong thich OpenAI (choices[0].delta.content); usage lay o "usage" hoac
# "x_groq.usage" neu co. Su kien co "error", hoac het luong ma khong co [DONE] -> coi la dut luong.

SSE_DONE = object()


class LLMStreamError(Exception):
    """Luong dut SAU khi da co token dau (router da mo SSE) -> chi dong luong, khong gui khung cuoi."""


class _ReadFailed(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def parse_sse_line(line: str) -> Any:
    """'data: {...}' -> dict; 'data: [DONE]' -> SSE_DONE; dong rong/chu thich/truong khac -> None.

    JSON hong -> ValueError.
    """
    if not line.startswith("data:"):
        return None
    payload = line[5:].strip()
    if payload == "[DONE]":
        return SSE_DONE
    data = json.loads(payload)
    if not isinstance(data, dict):
        raise ValueError("chunk không phải object")
    return data


def chunk_parts(chunk: dict) -> tuple[str, str | None, dict | None]:
    """-> (text, finish_reason, usage). Chunk co 'error' -> ValueError."""
    if "error" in chunk:
        raise ValueError("chunk báo lỗi")
    text, finish = "", None
    choices = chunk.get("choices") or []
    if choices:
        delta = choices[0].get("delta") or {}
        content = delta.get("content")
        text = content if isinstance(content, str) else ""
        finish = choices[0].get("finish_reason")
    usage = chunk.get("usage") or (chunk.get("x_groq") or {}).get("usage")
    return text, finish, usage if isinstance(usage, dict) else None


async def _read_line(lines, deadline: float, clock: Callable[[], float]) -> str | None:
    """Dong tiep theo trong ngan sach con lai; het luong -> None. Loi -> _ReadFailed(reason)."""
    remaining = deadline - clock()
    if remaining <= 0:
        raise _ReadFailed(TIMEOUT)
    try:
        return await asyncio.wait_for(lines.__anext__(), remaining)
    except StopAsyncIteration:
        return None
    except (asyncio.TimeoutError, httpx.TimeoutException) as exc:
        raise _ReadFailed(TIMEOUT) from exc
    except httpx.HTTPError as exc:
        raise _ReadFailed(UPSTREAM_ERROR) from exc


class LLMStream:
    """Luong da co token dau. chunks() tra lan luot cac doan text; loi giua luong -> LLMStreamError."""

    def __init__(self, resp: httpx.Response, lines, first: str, model_used: str, attempts: int,
                 deadline: float, clock: Callable[[], float]):
        self._resp, self._lines = resp, lines
        self.first, self.model_used, self.attempts = first, model_used, attempts
        self._deadline, self._clock = deadline, clock
        self.finish_reason: str | None = None
        self.usage: dict[str, Any] = {}

    def _take(self, chunk: dict) -> str:
        text, finish, usage = chunk_parts(chunk)
        if finish:
            self.finish_reason = finish
        if usage:
            self.usage = usage
        return text

    async def chunks(self):
        yield self.first
        while True:
            try:
                line = await _read_line(self._lines, self._deadline, self._clock)
                if line is None:
                    raise LLMStreamError("het luong ma khong co [DONE]")
                item = parse_sse_line(line)
            except _ReadFailed as exc:
                raise LLMStreamError(exc.reason) from exc
            except ValueError as exc:
                raise LLMStreamError(BAD_RESPONSE) from exc
            if item is SSE_DONE:
                break
            if item is None:
                continue
            try:
                text = self._take(item)
            except ValueError as exc:
                raise LLMStreamError("chunk bao loi") from exc
            if text:
                yield text
        if self.finish_reason == "length":
            logger.warning("LLM %s (stream): cat do max_completion_tokens (usage=%s)", self.model_used, self.usage)

    async def aclose(self) -> None:
        await self._resp.aclose()


class LLMClient:
    """Giu AsyncClient + cau hinh. Tao mot lan trong lifespan, dung lai moi request."""

    def __init__(self, http: httpx.AsyncClient, *, api_key: str | None, model: str, fallback_model: str | None,
                 timeout_s: float, temperature: float, max_completion_tokens: int, reasoning_effort: str,
                 stream_timeout_s: float = 40.0, clock: Callable[[], float] = time.monotonic):
        self._http = http
        self._api_key = api_key.strip() if api_key else None
        self.model = model
        self.fallback_model = fallback_model or None
        self.timeout_s = timeout_s
        self.stream_timeout_s = stream_timeout_s
        self.temperature = temperature
        self.max_completion_tokens = max_completion_tokens
        self.reasoning_effort = reasoning_effort
        self._clock = clock

    @classmethod
    def from_settings(cls, s: Any, transport: httpx.AsyncBaseTransport | None = None,
                      clock: Callable[[], float] = time.monotonic) -> "LLMClient":
        base = s.llm_base_url.rstrip("/") + "/"
        http = httpx.AsyncClient(base_url=base, headers={"User-Agent": user_agent(s.app_version)},
                                 transport=transport)
        key = s.llm_api_key.get_secret_value() if s.llm_api_key is not None else None
        return cls(http, api_key=key, model=s.llm_model, fallback_model=s.llm_fallback_model,
                   timeout_s=s.llm_timeout_s, temperature=s.llm_temperature,
                   max_completion_tokens=s.llm_max_completion_tokens,
                   reasoning_effort=s.llm_reasoning_effort, stream_timeout_s=s.llm_stream_timeout_s,
                   clock=clock)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _post(self, model: str, messages: list[dict[str, str]], remaining: float,
                    attempts: int) -> httpx.Response:
        body = build_body(model, messages, temperature=self.temperature,
                          max_completion_tokens=self.max_completion_tokens,
                          reasoning_effort=self.reasoning_effort)
        headers = {"Authorization": f"Bearer {self._api_key}"}
        try:
            # timeout cua httpx tinh RIENG tung pha (connect/read...) -> boc them wait_for cho tong.
            return await asyncio.wait_for(
                self._http.post(CHAT_PATH, json=body, headers=headers, timeout=remaining), remaining)
        except (httpx.TimeoutException, asyncio.TimeoutError) as exc:
            logger.error("LLM %s: het gio (lan %d)", model, attempts)
            raise LLMUnavailable(TIMEOUT, attempts) from exc
        except httpx.HTTPError as exc:
            logger.error("LLM %s: loi ket noi %s (lan %d)", model, type(exc).__name__, attempts)
            raise LLMUnavailable(UPSTREAM_ERROR, attempts) from exc

    async def complete(self, messages: list[dict[str, str]]) -> LLMResult:
        if not self._api_key:
            logger.error("LLM: thieu LLM_API_KEY")
            raise LLMUnavailable(NO_KEY, 0)
        deadline = self._clock() + self.timeout_s
        models = [self.model]
        if self.fallback_model and self.fallback_model != self.model:
            models.append(self.fallback_model)
        attempts = 0
        for i, model in enumerate(models):
            remaining = deadline - self._clock()
            if remaining <= 0:
                logger.error("LLM: het ngan sach %.1f s truoc lan %d", self.timeout_s, attempts + 1)
                raise LLMUnavailable(TIMEOUT, attempts)
            attempts += 1
            resp = await self._post(model, messages, remaining, attempts)
            if resp.status_code == 429:
                if i + 1 < len(models):
                    logger.warning("LLM %s: 429, goi lai 1 lan bang %s", model, models[i + 1])
                    continue
                logger.error("LLM %s: 429 (lan %d)", model, attempts)
                raise LLMUnavailable(RATE_LIMITED, attempts)
            if resp.status_code != 200:
                logger.error("LLM %s: HTTP %d (lan %d)", model, resp.status_code, attempts)
                raise LLMUnavailable(UPSTREAM_ERROR, attempts)
            return parse_response(resp, model, attempts)
        raise LLMUnavailable(RATE_LIMITED, attempts)  # khong toi duoc: vong lap luon return/raise

    def _models(self) -> list[str]:
        if self.fallback_model and self.fallback_model != self.model:
            return [self.model, self.fallback_model]
        return [self.model]

    async def _send_stream(self, model: str, messages: list[dict[str, str]], remaining: float,
                           attempts: int) -> httpx.Response:
        body = build_body(model, messages, temperature=self.temperature,
                          max_completion_tokens=self.max_completion_tokens,
                          reasoning_effort=self.reasoning_effort, stream=True)
        req = self._http.build_request("POST", CHAT_PATH, json=body, timeout=remaining,
                                       headers={"Authorization": f"Bearer {self._api_key}",
                                                "Accept": "text/event-stream"})
        try:
            return await asyncio.wait_for(self._http.send(req, stream=True), remaining)
        except (httpx.TimeoutException, asyncio.TimeoutError) as exc:
            logger.error("LLM %s (stream): het gio truoc phan hoi (lan %d)", model, attempts)
            raise LLMUnavailable(TIMEOUT, attempts) from exc
        except httpx.HTTPError as exc:
            logger.error("LLM %s (stream): loi ket noi %s (lan %d)", model, type(exc).__name__, attempts)
            raise LLMUnavailable(UPSTREAM_ERROR, attempts) from exc

    async def _first_text(self, lines, deadline: float, model: str, attempts: int) -> str:
        """Doc toi doan text dau tien. Loi o day van la 'truoc token dau' -> LLMUnavailable."""
        while True:
            try:
                line = await _read_line(lines, deadline, self._clock)
                item = None if line is None else parse_sse_line(line)
                if line is None or item is SSE_DONE:
                    logger.error("LLM %s (stream): het luong truoc token dau", model)
                    raise LLMUnavailable(EMPTY_CONTENT, attempts)
                if item is None:
                    continue
                text = chunk_parts(item)[0]
            except _ReadFailed as exc:
                logger.error("LLM %s (stream): %s truoc token dau", model, exc.reason)
                raise LLMUnavailable(exc.reason, attempts) from exc
            except ValueError as exc:
                logger.error("LLM %s (stream): chunk hong truoc token dau", model)
                raise LLMUnavailable(BAD_RESPONSE, attempts) from exc
            if text:
                return text

    async def open_stream(self, messages: list[dict[str, str]]) -> LLMStream:
        """Mo luong va doc toi token dau. Moi loi truoc token dau -> LLMUnavailable (router tra 503).

        429 o model chinh -> goi lai DUNG 1 lan bang model du phong trong ngan sach stream_timeout_s.
        """
        if not self._api_key:
            logger.error("LLM: thieu LLM_API_KEY")
            raise LLMUnavailable(NO_KEY, 0)
        deadline = self._clock() + self.stream_timeout_s
        models = self._models()
        attempts = 0
        for i, model in enumerate(models):
            remaining = deadline - self._clock()
            if remaining <= 0:
                logger.error("LLM (stream): het ngan sach %.1f s truoc lan %d", self.stream_timeout_s, attempts + 1)
                raise LLMUnavailable(TIMEOUT, attempts)
            attempts += 1
            resp = await self._send_stream(model, messages, remaining, attempts)
            if resp.status_code != 200:
                await resp.aclose()
                if resp.status_code == 429 and i + 1 < len(models):
                    logger.warning("LLM %s (stream): 429, goi lai 1 lan bang %s", model, models[i + 1])
                    continue
                logger.error("LLM %s (stream): HTTP %d (lan %d)", model, resp.status_code, attempts)
                raise LLMUnavailable(RATE_LIMITED if resp.status_code == 429 else UPSTREAM_ERROR, attempts)
            lines = resp.aiter_lines()
            try:
                first = await self._first_text(lines, deadline, model, attempts)
            except BaseException:
                await resp.aclose()
                raise
            return LLMStream(resp, lines, first, model, attempts, deadline, self._clock)
        raise LLMUnavailable(RATE_LIMITED, attempts)  # khong toi duoc
