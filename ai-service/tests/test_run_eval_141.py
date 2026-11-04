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
                  "gold": ["gram_001", "gram_002"], "kind": "pos"}]
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
    assert d["pos"]["min"] == 0.1 and d["neg_off"]["n"] == 1 and "neg_all" in d


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
    by_qid = {q: ({"qid": q, "question": f"câu {q}", "kind": "pos", "gold": ["g1"], "lang": "vi"}, RANKED)
              for q in qids}
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
    monkeypatch.setattr(r141, "retrieval_part", lambda a: (report, None, by_qid, CHUNKS))
    monkeypatch.setattr(r141, "summary_text", lambda rep: "tom tat")

    def fatal(*a, **k):
        raise r141.FatalRunError("no_key")
    monkeypatch.setattr(r141, "gen_part", fatal)
    assert r141.main(["--gen", "--out-dir", str(tmp_path / "out")]) == 2
    assert not (tmp_path / "out").exists()
    assert "không ghi kết quả" in capsys.readouterr().out


def test_main_writes_gen_with_degraded_summary(tmp_path, monkeypatch):
    args, report, by_qid = gen_fixture(["q1"], tmp_path)
    monkeypatch.setattr(r141, "retrieval_part", lambda a: (report, None, by_qid, CHUNKS))
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
