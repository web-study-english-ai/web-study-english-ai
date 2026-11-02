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
               max_completion_tokens: int, reasoning_effort: str) -> dict[str, Any]:
    """Body chat completions. Tham so suy luan CHI gui cho gpt-oss (model khac co the tra 400)."""
    body: dict[str, Any] = {"model": model, "messages": messages, "temperature": temperature,
                            "max_completion_tokens": max_completion_tokens}
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


class LLMClient:
    """Giu AsyncClient + cau hinh. Tao mot lan trong lifespan, dung lai moi request."""

    def __init__(self, http: httpx.AsyncClient, *, api_key: str | None, model: str, fallback_model: str | None,
                 timeout_s: float, temperature: float, max_completion_tokens: int, reasoning_effort: str,
                 clock: Callable[[], float] = time.monotonic):
        self._http = http
        self._api_key = api_key.strip() if api_key else None
        self.model = model
        self.fallback_model = fallback_model or None
        self.timeout_s = timeout_s
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
                   reasoning_effort=s.llm_reasoning_effort, clock=clock)

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
