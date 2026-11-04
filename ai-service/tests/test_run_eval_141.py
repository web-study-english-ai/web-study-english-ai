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
