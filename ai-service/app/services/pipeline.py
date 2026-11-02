"""Pipeline truy hoi trong dich vu AI: sau khi nhan ung vien tu backend, truoc LLM (WSEA-127).

Luat va ly do: app/services/pipeline_rules.py + docs/DECISIONS.md muc "2026-11-02 — WSEA-127".
Module nay KHONG import FastAPI: router goi run_pipeline trong threadpool, script danh gia
offline goi thang select_contexts / select_vocab.
"""

from __future__ import annotations

import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from app.services import pipeline_rules as rules
from app.services.intent import IntentResult

# Ma ly do co dinh (backend/log co the loc theo ma, khong theo cau chu).
REASON_EMPTY = "empty_candidates"
REASON_INTENT = "intent_out_of_scope"
REASON_TOP1 = "top1_too_far"
REASON_OK = "ok"
REASON_NO_INTENT = "intent_unavailable"


@dataclass
class PipelineResult:
    decision: str
    reason: str
    intent: IntentResult | None
    contexts: list = field(default_factory=list)  # object day du (AskContext) de WSEA-140 dua vao prompt
    vocab: list = field(default_factory=list)
    timings: dict[str, float] = field(default_factory=dict)


# --- Buoc chon (luat 4), ham thuan --------------------------------------------------------------


def select_contexts(contexts: Sequence[Any], k: int) -> list:
    """Sap theo distance tang (hoa giu thu tu gui), bo id trung (giu lan dau), lay k."""
    seen: set[str] = set()
    unique = []
    for c in contexts:
        if c.id not in seen:
            seen.add(c.id)
            unique.append(c)
    return sorted(unique, key=lambda c: c.distance)[:k]  # sorted on dinh -> hoa giu thu tu


def select_vocab(vocab: Sequence[Any], k: int) -> list:
    """exact truoc, roi vector theo distance tang (hoa giu thu tu gui), lay k."""
    return sorted(vocab, key=lambda v: (v.match != "exact", v.distance))[:k]


# --- Pipeline ----------------------------------------------------------------------------------


def _has_exact(vocab: Sequence[Any]) -> bool:
    return any(v.match == "exact" for v in vocab)


def _classify(req, embedder, intent_clf) -> IntentResult:
    vec = embedder.encode_queries([req.question])  # cau GOC, khong noi term
    return intent_clf.predict(vec)[0]


def _intent_blocks(req, intent_clf, intent: IntentResult) -> bool:
    """Luat 2: chi chan khi rat chac VA khong co dau hieu cau nam trong pham vi."""
    return (intent_clf.is_out_of_scope(intent) and req.word is None
            and not _has_exact(req.vocab) and not req.history)


def _top1_too_far(req, max_top1_distance: float) -> bool:
    """Luat 3: contexts rong thi khong co top-1 -> khong ap. Co word hoac vocab exact -> mien."""
    if not req.contexts or _has_exact(req.vocab) or req.word is not None:
        return False
    return min(c.distance for c in req.contexts) > max_top1_distance


def run_pipeline(req, embedder, intent_clf, *, k_prompt: int = rules.K_PROMPT,
                 k_vocab: int = rules.K_VOCAB, max_top1_distance: float = rules.MAX_TOP1_DISTANCE,
                 reranker=None) -> PipelineResult:
    """Ap luat 1 -> 4 theo thu tu; luat dau tien khop thi dung.

    req: AskRequest (hoac object cung truong). embedder can encode_queries; intent_clf can
    predict + is_out_of_scope, hoac None (bo luat 2, reason them ";intent_unavailable").
    ValueError tu embedder/intent duoc de noi len cho router tra 500.
    """
    if reranker is not None:
        raise NotImplementedError("rerank đã TẮT ở WSEA-126; bước xếp hạng lại là identity")

    timings: dict[str, float] = {}
    suffix = "" if intent_clf is not None else ";" + REASON_NO_INTENT

    # Luat 1: khong embed gi ca. Co word thi van tra loi duoc (LLM dung word).
    if not req.contexts and not req.vocab and req.word is None:
        return PipelineResult(rules.NO_CONTEXT, REASON_EMPTY + suffix, None, timings=timings)

    intent = None
    if intent_clf is not None:
        t = time.perf_counter()
        intent = _classify(req, embedder, intent_clf)
        timings["intent"] = (time.perf_counter() - t) * 1000
        if _intent_blocks(req, intent_clf, intent):
            return PipelineResult(rules.OUT_OF_SCOPE, REASON_INTENT, intent, timings=timings)

    if _top1_too_far(req, max_top1_distance):
        return PipelineResult(rules.NO_CONTEXT, REASON_TOP1 + suffix, intent, timings=timings)

    t = time.perf_counter()
    contexts = select_contexts(req.contexts, k_prompt)
    vocab = select_vocab(req.vocab, k_vocab)
    timings["select"] = (time.perf_counter() - t) * 1000
    return PipelineResult(rules.ANSWER, REASON_OK + suffix, intent, contexts, vocab, timings)
