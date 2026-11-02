"""Test app/services/pipeline.py (WSEA-127). Embedder va bo y dinh GIA, khong nap torch."""

import numpy as np
import pytest

from app.models.schemas import AskContext, AskRequest
from app.services import pipeline as pl
from app.services import pipeline_rules as rules
from app.services.embedder import DIM
from app.services.intent import IntentResult

TAU = 0.40


class FakeEmbedder:
    def __init__(self):
        self.calls = []

    def encode_queries(self, texts):
        self.calls.append(list(texts))
        v = np.zeros((len(texts), DIM), dtype=np.float32)
        v[:, 0] = 1.0
        return v


class FakeIntent:
    """Luon tra cung mot nhan/do tin cay; is_out_of_scope giong IntentClassifier that."""

    def __init__(self, label="ngu_phap", confidence=0.9, tau=TAU):
        self.label, self.confidence, self.tau = label, confidence, tau
        self.calls = 0

    def predict(self, vecs):
        self.calls += 1
        return [IntentResult(self.label, self.confidence, {self.label: self.confidence})]

    def is_out_of_scope(self, r):
        return r.label == "ngoai_pham_vi" and r.confidence >= self.tau


def ctx(id_, d):
    return {"id": id_, "content": f"noi dung {id_}", "source": "WSEA", "distance": d}


def voc(term, match="vector", d=0.1):
    return {"term": term, "pos": "n", "meaning_vi": "nghia", "match": match, "distance": d}


def req(contexts=None, vocab=None, word=None, history=None, question="khi nào dùng since"):
    body = {"question": question, "contexts": contexts if contexts is not None else [ctx("g1", 0.1)]}
    if vocab is not None:
        body["vocab"] = vocab
    if word is not None:
        body["word"] = word
    if history is not None:
        body["history"] = history
    return AskRequest.model_validate(body)


def run(r, intent=None, embedder=None, **kw):
    return pl.run_pipeline(r, embedder or FakeEmbedder(), intent, **kw)


OOS = dict(label="ngoai_pham_vi", confidence=0.9)


# --- Luat 1 ------------------------------------------------------------------------------------


def test_rule1_empty_candidates_no_embed():
    emb, intent = FakeEmbedder(), FakeIntent()
    res = run(req(contexts=[]), intent, emb)
    assert (res.decision, res.reason) == (rules.NO_CONTEXT, "empty_candidates")
    assert emb.calls == [] and intent.calls == 0
    assert res.contexts == [] and res.intent is None


def test_empty_contexts_with_vocab_answers_and_skips_rule3():
    res = run(req(contexts=[], vocab=[voc("since", "vector", 0.5)]), FakeIntent())
    assert res.decision == rules.ANSWER
    assert res.contexts == [] and [v.term for v in res.vocab] == ["since"]


# --- Luat 2 ------------------------------------------------------------------------------------


def test_rule2_out_of_scope_blocks():
    res = run(req(), FakeIntent(**OOS))
    assert (res.decision, res.reason) == (rules.OUT_OF_SCOPE, "intent_out_of_scope")
    assert res.intent.label == "ngoai_pham_vi"


def test_rule2_below_tau_does_not_block():
    assert run(req(), FakeIntent("ngoai_pham_vi", 0.39)).decision == rules.ANSWER
    assert run(req(), FakeIntent("ngoai_pham_vi", TAU)).decision == rules.OUT_OF_SCOPE


@pytest.mark.parametrize("extra", [
    {"word": {"term": "since", "pos": "prep", "meaning_vi": "kể từ"}},
    {"vocab": [voc("since", "exact", 0.0)]},
    {"history": [{"role": "user", "content": "thì hiện tại hoàn thành là gì"}]},
], ids=["word", "vocab-exact", "history"])
def test_rule2_exemptions(extra):
    res = run(req(**extra), FakeIntent(**OOS))
    assert res.decision == rules.ANSWER


def test_rule2_vector_vocab_is_not_exemption():
    assert run(req(vocab=[voc("since", "vector")]), FakeIntent(**OOS)).decision == rules.OUT_OF_SCOPE


def test_intent_uses_original_question_only():
    emb = FakeEmbedder()
    run(req(word={"term": "since", "pos": "prep", "meaning_vi": "kể từ"}, question="  dùng thế nào "),
        FakeIntent(), emb)
    assert emb.calls == [["dùng thế nào"]]


def test_intent_none_skips_rule2_and_marks_reason():
    emb = FakeEmbedder()
    res = run(req(), None, emb)
    assert (res.decision, res.reason) == (rules.ANSWER, "ok;intent_unavailable")
    assert emb.calls == [] and res.intent is None
    assert run(req(contexts=[]), None).reason == "empty_candidates;intent_unavailable"
    assert run(req(contexts=[ctx("g", 0.5)]), None).reason == "top1_too_far;intent_unavailable"


# --- Luat 3 ------------------------------------------------------------------------------------


def test_rule3_boundary_inclusive_at_threshold():
    assert rules.MAX_TOP1_DISTANCE == 0.22
    assert run(req(contexts=[ctx("g", 0.22)]), FakeIntent()).decision == rules.ANSWER
    res = run(req(contexts=[ctx("g", 0.2201)]), FakeIntent())
    assert (res.decision, res.reason) == (rules.NO_CONTEXT, "top1_too_far")


def test_rule3_uses_min_distance_even_if_unsorted():
    res = run(req(contexts=[ctx("a", 0.5), ctx("b", 0.1)]), FakeIntent())
    assert res.decision == rules.ANSWER


WORD = {"term": "since", "pos": "prep", "meaning_vi": "kể từ"}


def test_rule1_with_word_answers_with_empty_lists():
    res = run(req(contexts=[], word=WORD), FakeIntent())
    assert (res.decision, res.reason) == (rules.ANSWER, "ok")
    assert res.contexts == [] and res.vocab == []


def test_rule3_with_word_answers():
    res = run(req(contexts=[ctx("g", 0.9)], word=WORD), FakeIntent())
    assert res.decision == rules.ANSWER
    assert [c.id for c in res.contexts] == ["g"]


def test_rule3_without_word_still_blocks():
    res = run(req(contexts=[ctx("g", 0.9)], vocab=[voc("x", "vector", 0.1)]), FakeIntent())
    assert (res.decision, res.reason) == (rules.NO_CONTEXT, "top1_too_far")


def test_rule3_exempt_with_exact_vocab():
    res = run(req(contexts=[ctx("g", 0.9)], vocab=[voc("since", "exact", 0.0)]), FakeIntent())
    assert res.decision == rules.ANSWER


# --- Luat 4: chon ------------------------------------------------------------------------------


def test_select_sorts_keeps_tie_order_dedups_and_cuts():
    cs = [ctx("e", 0.15), ctx("a", 0.10), ctx("t1", 0.12), ctx("t2", 0.12), ctx("a", 0.01),
          ctx("f", 0.18), ctx("g", 0.19), ctx("h", 0.11)]
    # AskRequest chan id trung (422) nen dung thang AskContext: ham chon van phai tu bo trung.
    out = pl.select_contexts([AskContext.model_validate(c) for c in cs], 5)
    # "a" trung: giu lan dau (0.10), bo lan sau (0.01). t1/t2 hoa: giu thu tu gui.
    assert [c.id for c in out] == ["a", "h", "t1", "t2", "e"]
    assert out[0].distance == 0.10


def test_run_pipeline_answer_cuts_to_k_prompt_and_ids_subset():
    cs = [ctx(f"g{i}", 0.20 - 0.01 * i) for i in range(8)]
    r = req(contexts=cs)
    res = run(r, FakeIntent())
    assert (res.decision, res.reason) == (rules.ANSWER, "ok")
    assert len(res.contexts) == rules.K_PROMPT == 5
    assert [c.id for c in res.contexts] == ["g7", "g6", "g5", "g4", "g3"]
    assert {c.id for c in res.contexts} <= {c.id for c in r.contexts}
    assert res.contexts[0].content == "noi dung g7"  # giu object day du cho prompt
    assert set(res.timings) == {"intent", "select"}


def test_select_vocab_exact_first_then_distance():
    r = req(vocab=[voc("v2", "vector", 0.3), voc("v1", "vector", 0.1), voc("ex", "exact", 0.5),
                   voc("v0", "vector", 0.05)])
    assert [v.term for v in pl.select_vocab(r.vocab, 3)] == ["ex", "v0", "v1"]
    assert pl.select_vocab(r.vocab, 0) == []


def test_k_overrides():
    cs = [ctx(f"g{i}", 0.1 + 0.01 * i) for i in range(4)]
    res = run(req(contexts=cs), FakeIntent(), k_prompt=2, max_top1_distance=0.05)
    assert res.decision == rules.NO_CONTEXT
    res = run(req(contexts=cs), FakeIntent(), k_prompt=2)
    assert [c.id for c in res.contexts] == ["g0", "g1"]


def test_reranker_not_implemented():
    with pytest.raises(NotImplementedError):
        run(req(), FakeIntent(), reranker=object())


def test_value_error_from_intent_propagates():
    class Bad(FakeIntent):
        def predict(self, vecs):
            raise ValueError("vector có NaN hoặc inf")

    with pytest.raises(ValueError):
        run(req(), Bad())
