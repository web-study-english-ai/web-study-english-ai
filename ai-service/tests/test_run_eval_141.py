"""Test phan thuan cua scripts/run_eval_141.py (WSEA-141). Khong mang, khong nap mo hinh."""

import csv

import pytest

from scripts import run_eval_141 as r141


def pos(qid, lang="vi", gold=("g1",)):
    return {"qid": qid, "question": f"câu {qid}", "lang": lang, "gold": list(gold), "kind": "pos"}


def neg(qid, group, lang="vi"):
    return {"qid": qid, "question": f"câu {qid}", "lang": lang, "gold": [], "group": group, "kind": "neg"}


POS = [pos(f"p{i:02d}", lang) for i, lang in enumerate(["vi"] * 20 + ["en"] * 6 + ["mixed"] * 10)]
NEG = [neg(f"n{i:02d}", "off") for i in range(8)] + [neg(f"n{i:02d}", "gap") for i in range(8, 14)]


# --- Du lieu -------------------------------------------------------------------------------------


def test_load_sets_reads_csv(tmp_path):
    q = tmp_path / "q.csv"
    q.write_text("qid,question,gold_ids,lang\nq1,câu một,gram_001|gram_002,vi\n", encoding="utf-8")
    n = tmp_path / "n.csv"
    n.write_text("qid,question,group,lang\nn1,thời tiết,off,vi\n", encoding="utf-8")
    p, ng = r141.load_sets(q, n)
    assert p == [{"qid": "q1", "question": "câu một", "gold_ids": "gram_001|gram_002", "lang": "vi",
                  "gold": ["gram_001", "gram_002"], "kind": "pos", "qgroup": "kb",
                  "gold_kb": ["gram_001", "gram_002"], "gold_words": []}]
    assert ng[0]["group"] == "off" and ng[0]["kind"] == "neg"


def test_validate_sets():
    ids = {"g1", "g2"}
    assert r141.validate_sets([pos("q1")], [neg("n1", "off")], ids) == []
    errs = r141.validate_sets([pos("q1", gold=("gX",)), pos("q1")], [neg("q1", "off"), neg("n2", "khac")], ids)
    text = " | ".join(errs)
    assert "gX" in text and "trùng qid" in text and "giữa file dương và file âm" in text and "group" in text


def test_real_old_files_are_valid():
    from scripts import load_vectors as lv
    chunk_ids = {str(c["id"]) for c in lv.load_chunks(lv.DEFAULT_KB_JSONL)}
    p, n = r141.load_sets(lv.DEFAULT_QUESTIONS, r141.ev.DEFAULT_NEGATIVES)
    assert r141.validate_sets(p, n, chunk_ids) == []


# --- Chon cau sinh -------------------------------------------------------------------------------


def test_select_gen_deterministic_and_stratified():
    a = r141.select_gen(POS, NEG)
    assert a == r141.select_gen(POS, NEG)  # cung seed 141 -> cung danh sach
    assert len(a) == 20 and len(set(a)) == 20
    chosen_pos = [q for q in POS if q["qid"] in a]
    assert len(chosen_pos) == 14
    langs = [q["lang"] for q in chosen_pos]
    assert (langs.count("vi"), langs.count("mixed"), langs.count("en")) == (8, 4, 2)  # 20/10/6 tren 36
    chosen_neg = [q for q in NEG if q["qid"] in a]
    assert sorted(q["group"] for q in chosen_neg) == ["gap"] * 3 + ["off"] * 3
    assert a[:14] == sorted(a[:14]) and a[14:] == sorted(a[14:])
    assert r141.select_gen(POS, NEG, seed=7) != a


def test_select_gen_fills_missing_group():
    negs = [neg(f"n{i}", "off") for i in range(10)] + [neg("g1", "gap")]
    chosen = r141.select_gen(POS, negs)
    groups = [q["group"] for q in negs if q["qid"] in chosen]
    assert len(groups) == 6 and groups.count("gap") == 1 and groups.count("off") == 5


def test_select_gen_small_sets_take_all():
    chosen = r141.select_gen([pos("q1"), pos("q2", "en")], [neg("n1", "gap")])
    assert chosen == ["q1", "q2", "n1"]


def test_alloc_largest_remainder():
    assert r141._alloc({"vi": 20, "en": 6, "mixed": 10}, 14) == {"vi": 8, "en": 2, "mixed": 4}
    assert sum(r141._alloc({"a": 1, "b": 1, "c": 1}, 2).values()) == 2


# --- Chi so va bao cao ---------------------------------------------------------------------------


def ranked_row(qid, ranked, dists, lang="vi", gold=("g1",), kind="pos", group=None, decision="answer"):
    return {"qid": qid, "ranked": ranked, "dists": dists, "lang": lang, "gold": list(gold), "kind": kind,
            "group": group, "decision": decision, "question": qid}


def test_retrieval_metrics_and_distributions():
    rows = [ranked_row("a", ["g1", "g2"], [0.1, 0.2]), ranked_row("b", ["g2", "g1"], [0.15, 0.3], lang="en")]
    m = r141.retrieval_metrics(rows)
    assert m["overall"] == {"n": 2, "hit@1": 0.5, "hit@5": 1.0, "hit@8": 1.0, "mrr@20": 0.75}
    assert set(m["by_lang"]) == {"en", "vi"}
    negs = [ranked_row("n", ["g3"], [0.2], kind="neg", group="off")]
    d = r141.top1_distributions(rows, negs)
    assert d["pos_kb"]["min"] == 0.1 and d["neg_off"]["n"] == 1 and "neg_all" in d and "pos_vocab" not in d


def test_pipeline_summary():
    rows = [ranked_row("a", [], [], decision="answer"), ranked_row("b", [], [], decision="no_context"),
            ranked_row("n1", [], [], kind="neg", group="off", decision="out_of_scope"),
            ranked_row("n2", [], [], kind="neg", group="gap", decision="answer")]
    s = r141.pipeline_summary(rows)
    assert (s["pos"]["blocked"], s["pos"]["rate"], s["pos"]["blocked_qids"]) == (1, 0.5, ["b"])
    assert s["off"]["blocked_qids"] == ["n1"] and s["gap"]["blocked"] == 0


def test_cham_rows_and_csv(tmp_path):
    chunks = {"gram_001": {"content": "Đoạn một"}, "gram_002": {"content": "Đoạn hai"}}
    gen = [{"qid": "q1", "question": "hỏi", "answer": "đáp", "source_ids": ["gram_002", "gram_001"]},
           {"qid": "n1", "question": "lạc đề", "answer": None, "source_ids": [], "error": "503"}]
    rows = r141.cham_rows(gen, chunks)
    assert rows[0]["nguon"] == "[gram_002] Đoạn hai\n\n[gram_001] Đoạn một"
    assert rows[1]["answer"] == "(LỖI: 503)" and rows[1]["nguon"] == ""
    assert all(r["diem"] == "" and r["ghi_chu"] == "" for r in rows)
    path = tmp_path / "out" / "141_cham.csv"
    r141.write_cham_csv(path, rows)
    assert path.read_bytes().startswith(b"\xef\xbb\xbf")  # BOM cho Excel
    with path.open(encoding="utf-8-sig", newline="") as f:
        back = list(csv.DictReader(f))
    assert list(back[0]) == list(r141.CHAM_COLUMNS) and back[0]["nguon"].startswith("[gram_002]")


def test_parse_args_defaults():
    a = r141.parse_args([])
    assert a.questions.name == "eval_set_141.csv" and a.negatives.name == "eval_set_141_neg.csv"
    assert a.out_dir.name == "reports" and a.gen is False and a.limit is None and a.sleep == 30.0
    assert r141.parse_args(["--gen", "--limit", "1"]).limit == 1


@pytest.mark.parametrize("k", ["hit@1", "hit@5", "hit@8", "mrr@20"])
def test_baseline_has_report_keys(k):
    assert isinstance(r141.BASELINE_31[k], float)


# --- Chay lai cau degraded (tieu chi muc 4.2) ----------------------------------------------------


def ok_row():
    return {"decision": "answer", "answer": "đáp", "source_ids": ["g1"], "degraded": False, "error_reason": None}


def bad_row(reason):
    return {"decision": "answer", "answer": None, "source_ids": [], "degraded": True, "error_reason": reason}


class FakeCall:
    def __init__(self, *rows):
        self.rows, self.n = list(rows), 0

    def __call__(self, body):
        self.n += 1
        return dict(self.rows.pop(0))


class FakeSleep:
    def __init__(self):
        self.calls = []

    def __call__(self, s):
        self.calls.append(s)


@pytest.mark.parametrize("body, reason", [
    ('{"detail": "Khong goi duoc LLM (rate_limited)"}', "rate_limited"),
    ('{"detail": "Khong goi duoc LLM (no_key)"}', "no_key"),
    ('{"detail": "Mo hinh embedding chua nap"}', None),
    ("khong phai json", None),
    ('{"detail": [{"loc": ["body"]}]}', None),
])
def test_parse_reason(body, reason):
    assert r141.parse_reason(body) == reason


@pytest.mark.parametrize("reason", r141.RETRY_REASONS)
def test_retry_once_after_wait_then_ok(reason):
    call, sleep = FakeCall(bad_row(reason), ok_row()), FakeSleep()
    row = r141.run_with_retry(call, {}, sleep=sleep)
    assert call.n == 2 and sleep.calls == [60.0]
    assert (row["degraded"], row["retried"], row["first_reason"]) == (False, True, reason)


def test_retry_only_once_even_if_still_degraded():
    call, sleep = FakeCall(bad_row("timeout"), bad_row("rate_limited")), FakeSleep()
    row = r141.run_with_retry(call, {}, sleep=sleep)
    assert call.n == 2 and len(sleep.calls) == 1
    assert (row["degraded"], row["error_reason"], row["retried"], row["first_reason"]) == \
        (True, "rate_limited", True, "timeout")


@pytest.mark.parametrize("reason", r141.MODEL_REASONS + (None, "khac"))
def test_model_or_unknown_reason_not_retried(reason):
    call, sleep = FakeCall(bad_row(reason)), FakeSleep()
    row = r141.run_with_retry(call, {}, sleep=sleep)
    assert call.n == 1 and sleep.calls == []
    assert (row["degraded"], row["retried"]) == (True, False)


def test_no_key_is_fatal_first_or_after_retry():
    with pytest.raises(r141.FatalRunError):
        r141.run_with_retry(FakeCall(bad_row("no_key")), {}, sleep=FakeSleep())
    with pytest.raises(r141.FatalRunError):
        r141.run_with_retry(FakeCall(bad_row("timeout"), bad_row("no_key")), {}, sleep=FakeSleep())


def test_ok_first_time_no_retry():
    row = r141.run_with_retry(FakeCall(ok_row()), {}, sleep=FakeSleep())
    assert (row["retried"], row["first_reason"], row["degraded"]) == (False, None, False)


def test_degraded_summary():
    rows = [{"qid": "a", **ok_row(), "retried": True}, {"qid": "b", **bad_row("timeout"), "retried": True},
            {"qid": "c", **bad_row("empty_content"), "retried": False},
            {"qid": "d", **bad_row("bad_response"), "retried": False}, {"qid": "e", **ok_row(), "retried": False}]
    s = r141.degraded_summary(rows)
    assert s == {"retried": 2, "retried_ok": ["a"], "still_degraded": {"bad_response": 1, "empty_content": 1,
                                                                        "timeout": 1},
                 "model_errors": ["c", "d"]}
    assert "Câu chạy lại: 2" in r141.degraded_text(s)


# --- gen_part va main voi call gia (khong mang) --------------------------------------------------

CHUNKS = {f"g{i}": {"id": f"g{i}", "content": f"noi dung {i}", "source": "WSEA", "topic": "t", "cefr": "A1"}
          for i in range(10)}
RANKED = ([f"g{i}" for i in range(10)], [0.10 + 0.01 * i for i in range(10)])


def gen_fixture(qids, tmp_path, **over):
    report = {"gen_selection": {"seed": 141, "qids": qids}, "files": {}}
    by_qid = {q: ({"qid": q, "question": f"câu {q}", "kind": "pos", "gold": ["g1"], "lang": "vi", "qgroup": "kb"},
                  RANKED, []) for q in qids}
    args = r141.parse_args(["--gen", "--out-dir", str(tmp_path / "out"), *over.get("argv", [])])
    return args, report, by_qid


def test_gen_part_three_branches(tmp_path):
    args, report, by_qid = gen_fixture(["q1", "q2", "q3"], tmp_path)
    call = FakeCall(bad_row("rate_limited"), ok_row(),  # q1: chay lai thanh cong
                    bad_row("empty_content"),           # q2: loi mo hinh, khong chay lai
                    ok_row())                           # q3: ok
    sleep = FakeSleep()
    rows = r141.gen_part(args, report, by_qid, CHUNKS, call=call, sleep=sleep)
    assert call.n == 4
    assert [(r["qid"], r["degraded"], r["retried"]) for r in rows] == \
        [("q1", False, True), ("q2", True, False), ("q3", False, False)]
    assert rows[0]["first_reason"] == "rate_limited" and rows[0]["candidates"] == RANKED[0][:8]
    assert sleep.calls == [60.0, 30.0, 30.0]  # cho chay lai, roi nhip sau q1, q2 (khong sau cau cuoi)
    s = r141.degraded_summary(rows)
    assert s["retried"] == 1 and s["model_errors"] == ["q2"] and s["still_degraded"] == {"empty_content": 1}


def test_gen_part_no_key_stops(tmp_path):
    args, report, by_qid = gen_fixture(["q1", "q2"], tmp_path)
    call = FakeCall(ok_row(), bad_row("no_key"))
    with pytest.raises(r141.FatalRunError):
        r141.gen_part(args, report, by_qid, CHUNKS, call=call, sleep=FakeSleep())


def test_main_no_key_writes_nothing(tmp_path, monkeypatch, capsys):
    args, report, by_qid = gen_fixture(["q1"], tmp_path)
    report.update({"retrieval": {}, "n_positives": 1, "n_negatives": 0})
    monkeypatch.setattr(r141, "retrieval_part", lambda a: (report, None, by_qid, CHUNKS, {}))
    monkeypatch.setattr(r141, "summary_text", lambda rep: "tom tat")

    def fatal(*a, **k):
        raise r141.FatalRunError("no_key")
    monkeypatch.setattr(r141, "gen_part", fatal)
    assert r141.main(["--gen", "--out-dir", str(tmp_path / "out")]) == 2
    assert not (tmp_path / "out").exists()
    assert "không ghi kết quả" in capsys.readouterr().out


def test_main_writes_gen_with_degraded_summary(tmp_path, monkeypatch):
    args, report, by_qid = gen_fixture(["q1"], tmp_path)
    monkeypatch.setattr(r141, "retrieval_part", lambda a: (report, None, by_qid, CHUNKS, {}))
    monkeypatch.setattr(r141, "summary_text", lambda rep: "tom tat")
    monkeypatch.setattr(r141, "gen_part", lambda *a, **k: [{"qid": "q1", "question": "câu", **bad_row("timeout"),
                                                            "retried": True, "first_reason": "timeout"}])
    assert r141.main(["--gen", "--out-dir", str(tmp_path / "out")]) == 0
    import json
    gen = json.loads((tmp_path / "out" / "141_gen.json").read_text(encoding="utf-8"))
    assert gen["degraded"]["retried"] == 1 and gen["retry_wait_s"] == 60.0
    assert gen["rows"][0]["retried"] is True and gen["rows"][0]["first_reason"] == "timeout"
    assert (tmp_path / "out" / "141_cham.csv").exists() and (tmp_path / "out" / "141_retrieval.json").exists()


def test_main_rejects_short_retry_wait_for_official_run():
    with pytest.raises(SystemExit):
        r141.main(["--gen", "--retry-wait", "5"])


# --- Nhom cau hoi nghia tu (vocab) — sua 2026-11-05 truoc khi co du lieu --------------------------

META = {w: {"pos": "n", "meaning_vi": f"nghĩa {w}", "example_en": f"An example with {w}.", "rank": i}
        for i, w in enumerate(("reluctant", "eager", "apple", "since", "for", "an", "hi", "hay"), 1)}


@pytest.mark.parametrize("gold, kb, words, group", [
    (["gram_001"], ["gram_001"], [], "kb"),
    (["word:reluctant"], [], ["reluctant"], "vocab"),
    (["word: Eager ", "word:apple"], [], ["eager", "apple"], "vocab"),
    (["gram_001", "word:apple"], ["gram_001"], ["apple"], None),
    ([], [], [], None),
])
def test_split_gold_and_group(gold, kb, words, group):
    assert r141.split_gold(gold) == (kb, words)
    assert r141.question_group({"gold": gold}) == group


def test_validate_sets_vocab_rules():
    ids, terms = {"g1"}, frozenset(META)
    ok = [{**pos("q1"), "gold": ["word:reluctant"]}, pos("q2")]
    assert r141.validate_sets(ok, [neg("n1", "off")], ids, terms) == []
    bad = [{**pos("q1"), "gold": ["word:khongco"]}, {**pos("q2"), "gold": ["g1", "word:apple"]}]
    text = " | ".join(r141.validate_sets(bad, [], ids, terms))
    assert "word:khongco" in text and "trộn" in text
    assert "word:reluctant" in " ".join(r141.validate_sets([{**pos("q1"), "gold": ["word:reluctant"]}], [], ids))


@pytest.mark.parametrize("question, tokens", [
    # \b ASCII nhu JS: chu co dau cat manh; manh 1 ky tu bi bo ({2,30})
    ("khi nào dùng hiện tại", ["khi", "ng", "hi"]),  # "dùng" -> "ng", "hiện" -> "hi"
    ("thời tiết", ["th", "ti"]),
    ("Since hay FOR, since", ["since", "hay", "for"]),
    ("I am", ["am"]),
])
def test_exact_tokens_like_backend_regex(question, tokens):
    assert r141.exact_tokens(question) == tokens


def test_exact_tokens_cap_15():
    q = " ".join(chr(97 + i) * 2 for i in range(20))
    assert len(r141.exact_tokens(q)) == 15 and r141.exact_tokens(q)[0] == "aa"


def test_exact_terms_take_5_by_rank():
    q = "nghĩa của từ Reluctant là gì, reluctant khác eager thế nào (since 2020)"
    assert r141.exact_terms(q, META) == ["reluctant", "eager", "since"]
    assert r141.exact_terms("khi nào dùng hiện tại", META) == ["hi"]  # manh "hi" khop tu tieng Anh — nhu backend
    many = "hay hi an for since apple eager reluctant"
    assert r141.exact_terms(many, META) == ["reluctant", "eager", "apple", "since", "for"]  # take 5, xap xi theo rank


def test_backend_vocab_exact_then_vector_dedupe_and_valid():
    v = r141.backend_vocab("eager hoặc reluctant", ["reluctant", "apple", "for", "since"], [0.10, 0.12, 0.13, 0.2], META)
    assert [(x["term"], x["match"]) for x in v] == [("reluctant", "exact"), ("eager", "exact"),
                                                   ("apple", "vector"), ("for", "vector")]
    assert v[0]["distance"] == 0.0 and v[2]["distance"] == 0.12 and v[2]["meaning_vi"] == "nghĩa apple"
    from app.models.schemas import AskRequest
    AskRequest.model_validate({"question": "q", "contexts": [], "vocab": v})  # dung schema /rank


def test_backend_vocab_max_5_exact_plus_3_vector():
    letters = {chr(97 + i) * 3: {"pos": "n", "meaning_vi": "x", "example_en": "", "rank": i} for i in range(15)}
    vec = {t: {"pos": "n", "meaning_vi": "x", "example_en": "", "rank": 100} for t in ("vecone", "vectwo", "vecthree")}
    v = r141.backend_vocab(" ".join(letters), ["vecone", "vectwo", "vecthree"], [0.1, 0.2, 0.3], letters | vec)
    assert [x["match"] for x in v] == ["exact"] * 5 + ["vector"] * 3
    assert v[0]["example_en"] is None  # example rong -> None nhu backend (null)


def test_three_exact_push_vector_gold_out_of_top3():
    """Nhu backend + select_vocab: >= 3 tu exact (ke ca manh "hi", "hay") thi tu tim bang vector khong vao top-3."""
    v = r141.backend_vocab("khi hiện tại dùng for hay since", ["eager"], [0.05], META)
    sel = r141.selected_vocab_terms(v)
    assert sel == ["since", "for", "hi"] and r141.vocab_found_by(["eager"], v, sel) == "none"


def test_selected_vocab_terms_and_found_by():
    v = r141.backend_vocab("eager", ["reluctant", "apple", "eager"], [0.15, 0.11, 0.2], META)
    sel = r141.selected_vocab_terms(v)
    assert sel == ["eager", "apple", "reluctant"]  # exact truoc, roi vector theo distance
    assert r141.vocab_found_by(["eager"], v, sel) == "exact"
    assert r141.vocab_found_by(["reluctant"], v, sel) == "vector"
    assert r141.vocab_found_by(["since"], v, sel) == "none"


def test_vocab_metrics():
    rows = [{"qid": "a", "lang": "vi", "vocab_hit": True, "vocab_found_by": "exact"},
            {"qid": "b", "lang": "vi", "vocab_hit": True, "vocab_found_by": "vector"},
            {"qid": "c", "lang": "en", "vocab_hit": False, "vocab_found_by": "none"}]
    m = r141.vocab_metrics(rows)
    assert m["overall"] == {"n": 3, "hit@3": 0.6667, "hits": 2, "found_exact": 1, "found_vector": 1}
    assert m["by_lang"]["en"]["hit@3"] == 0.0 and m["missed_qids"] == ["c"]


def test_evaluate_items_two_groups():
    from tests.test_pipeline import FakeEmbedder, FakeIntent
    items = [{**pos("q1"), "gold": ["g1"], "gold_kb": ["g1"], "gold_words": [], "qgroup": "kb"},
             {**pos("q2"), "question": "reluctant nghĩa là gì", "gold": ["word:reluctant"], "gold_kb": [],
              "gold_words": ["reluctant"], "qgroup": "vocab"},
             {**pos("q3"), "question": "từ chỉ sự háo hức", "gold": ["word:eager"], "gold_kb": [],
              "gold_words": ["eager"], "qgroup": "vocab"},
             neg("n1", "off")]
    ranking = [RANKED] * 4
    word_ranking = [(["apple", "for", "since"], [0.1, 0.2, 0.3])] * 3 + [(["eager"], [0.1])]
    rows = r141.evaluate_items(items, ranking, word_ranking, CHUNKS, META, FakeEmbedder(), FakeIntent())
    by = {r["qid"]: r for r in rows}
    assert by["q1"]["gold_in_top5"] is True and "vocab_hit" not in by["q1"]
    assert by["q2"]["vocab_hit"] is True and by["q2"]["vocab_found_by"] == "exact"
    assert by["q3"]["vocab_hit"] is False and by["q3"]["gold_word_vector_rank"] == {"eager": None}
    assert by["q2"]["vocab_selected"][0] == "reluctant" and by["q2"]["vocab_sent"][0]["match"] == "exact"
    assert all(r["decision"] == "answer" for r in rows)
    s = r141.pipeline_summary(rows)
    assert s["pos_kb"]["n"] == 1 and s["pos_vocab"]["n"] == 2


def test_select_gen_strata_by_group_and_lang():
    positives = [{**pos(f"k{i:02d}"), "qgroup": "kb"} for i in range(30)] + \
                [{**pos(f"v{i:02d}"), "qgroup": "vocab"} for i in range(10)]
    chosen = r141.select_gen(positives, NEG)
    assert sum(c.startswith("k") for c in chosen) == 11 and sum(c.startswith("v") for c in chosen) == 3  # 14*30/40, 14*10/40
    no_group = [{k: v for k, v in q.items() if k != "qgroup"} for q in POS]
    assert r141.select_gen(no_group, NEG) == r141.select_gen(POS, NEG)  # thieu qgroup = kb, giong ban cu


def test_cham_rows_includes_vocab_entries():
    rows = r141.cham_rows([{"qid": "q2", "question": "reluctant?", "answer": "đáp", "source_ids": [],
                            "vocab": ["reluctant"]}], CHUNKS, META)
    assert rows[0]["nguon"] == "[word:reluctant] reluctant (n): nghĩa reluctant — Ví dụ: An example with reluctant."


def test_summary_text_reports_groups_separately():
    rep = {"n_positives": 3, "n_kb": 2, "n_vocab": 1, "n_negatives": 1,
           "retrieval": {"kb": {"overall": {"hit@1": 0.5, "hit@5": 1.0, "hit@8": 1.0, "mrr@20": 0.75}},
                         "vocab": {"overall": {"n": 1, "hit@3": 1.0, "hits": 1, "found_exact": 1, "found_vector": 0},
                                   "missed_qids": []}},
           "baseline_31": r141.BASELINE_31, "top1_distance": {},
           "pipeline": {g: {"n": 1, "blocked": 0, "blocked_qids": []} for g in ("pos_kb", "pos_vocab", "off", "gap")},
           "gen_selection": {"seed": 141, "qids": ["q1"]}}
    t = r141.summary_text(rep)
    assert "Nhóm kb" in t and "Nhóm vocab" in t and "hit@3 1/1" in t and "pos_vocab: 0/1" in t
    rep["retrieval"]["vocab"], rep["n_vocab"] = None, 0
    assert "(không có câu vocab)" in r141.summary_text(rep)


def test_real_vocab_source_and_word_vectors_consistent():
    if not r141.VOCAB_SOURCE.exists() or not r141.lv.DEFAULT_WORDS_NPZ.exists():
        pytest.skip("thiếu vocab_7000.csv hoặc words .npz (data/ không có trong git)")
    meta = r141.load_vocab_meta()
    terms, vecs, errors = r141.load_word_vectors(r141.lv.DEFAULT_WORDS_NPZ, meta)
    assert errors == [] and len(terms) == vecs.shape[0] == 7000
