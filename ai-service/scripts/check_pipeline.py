"""Kiem offline pipeline truy hoi tren 43 cau (WSEA-127 buoc B3).

    .\\.venv\\Scripts\\python.exe scripts\\check_pipeline.py

Luat dat da chot truoc (docs/DECISIONS.md muc "2026-11-02 — WSEA-127", phan c):
  (a) so cau duong bi chan (decision != answer) <= MAX_WRONG_BLOCK_POS
  (b) ti le cau duong co gold trong select_contexts(top-8, K_PROMPT), tinh cho CA 31 cau
      khong phu thuoc quyet dinh chan, PHAI BANG hit@5 trong docs/eval/retrieval_k_sweep.json
      (so toi 4 chu so). Lech la bug, khong phai ket qua.
  (c) cau am bi chan theo nhom off/gap: chi ghi nhan.

Ung vien dung DUNG cach WSEA-111: vector doan tu .npz da nap DB (kiem manifest), rank_all cua
scripts/eval_retrieval.py, top-8 (= AI_ASSISTANT_TOP_K cua backend). Moi cau thanh AskRequest
that (word null, vocab [], history []), chay run_pipeline voi Embedder that + IntentClassifier that.

Dau ra: docs/eval/pipeline_check.json + bang tom tat. Ham thuan test o tests/test_check_pipeline.py.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.models.schemas import AskRequest  # noqa: E402
from app.services import embedder as emb  # noqa: E402
from app.services import pipeline as pl  # noqa: E402
from app.services import pipeline_rules as rules  # noqa: E402
from scripts import compare_embedders as ce  # noqa: E402
from scripts import eval_retrieval as ev  # noqa: E402
from scripts import load_vectors as lv  # noqa: E402

TOP_N_CANDIDATES = 8  # backend gui top-8 (AI_ASSISTANT_TOP_K, hop dong v0.3)
DIGITS = 4            # so khop (b) toi 4 chu so
DEFAULT_SWEEP = ROOT / "docs" / "eval" / "retrieval_k_sweep.json"
DEFAULT_OUT = ROOT / "docs" / "eval" / "pipeline_check.json"
RULE_FILES = ("app/services/pipeline_rules.py", "app/services/pipeline.py")
DECISIONS = (rules.ANSWER, rules.NO_CONTEXT, rules.OUT_OF_SCOPE)


# --- Ham thuan -------------------------------------------------------------------------------


def build_request(question: str, ranked: list[str], dists: list[float], chunks_by_id: dict[str, dict],
                  n: int = TOP_N_CANDIDATES) -> AskRequest:
    """AskRequest that tu top-n e5: content/source/topic/cefr lay nguyen tu grammar_chunks.jsonl."""
    contexts = [{"id": i, "content": chunks_by_id[i]["content"], "source": chunks_by_id[i]["source"],
                 "topic": chunks_by_id[i].get("topic"), "cefr": chunks_by_id[i].get("cefr"), "distance": d}
                for i, d in zip(ranked[:n], dists[:n])]
    return AskRequest.model_validate({"question": question, "word": None, "contexts": contexts,
                                      "vocab": [], "history": []})


def gold_in_selected(req: AskRequest, gold: list[str], k: int = rules.K_PROMPT) -> bool:
    """(b): co gold nao trong select_contexts(contexts, k) khong — khong phu thuoc quyet dinh."""
    return any(c.id in set(gold) for c in pl.select_contexts(req.contexts, k))


def check_a(pos_rows: list[dict], limit: int = rules.MAX_WRONG_BLOCK_POS) -> dict:
    blocked = [r["qid"] for r in pos_rows if r["decision"] != rules.ANSWER]
    return {"blocked": len(blocked), "blocked_qids": blocked, "limit": limit, "pass": len(blocked) <= limit}


def check_b(pos_rows: list[dict], expected_hit5: float, digits: int = DIGITS) -> dict:
    n = len(pos_rows)
    hits = sum(r["gold_in_top5"] for r in pos_rows)
    rate = hits / n
    return {"hits": hits, "n": n, "rate": round(rate, digits), "expected_hit5": round(expected_hit5, digits),
            "pass": round(rate, digits) == round(expected_hit5, digits),
            "missing_qids": [r["qid"] for r in pos_rows if not r["gold_in_top5"]]}


def table_c(neg_rows: list[dict]) -> dict:
    """{group: {decision: so cau}} + danh sach qid bi chan theo nhom. Chi ghi nhan."""
    table = {}
    for g in sorted({r["group"] for r in neg_rows}):
        rows = [r for r in neg_rows if r["group"] == g]
        cnt = Counter(r["decision"] for r in rows)
        table[g] = {"n": len(rows), **{d: cnt.get(d, 0) for d in DECISIONS},
                    "blocked_qids": [r["qid"] for r in rows if r["decision"] != rules.ANSWER]}
    return table


def timing_summary(ms: list[float]) -> dict:
    return {"n": len(ms), "p50": round(ce.percentile(ms, 50), 2), "p95": round(ce.percentile(ms, 95), 2),
            "max": round(max(ms), 2)}


def mark(ok: bool) -> str:
    return "ĐẠT" if ok else "TRƯỢT"


def summary_text(report: dict) -> str:
    a, b, c = report["a"], report["b"], report["c"]
    lines = [f"Luật ở commit {report['rule_commit'][:7]} · {report['n_positives']} câu dương · "
             f"{report['n_negatives']} câu âm · top-{TOP_N_CANDIDATES} e5 → K_PROMPT {rules.K_PROMPT}", "",
             f"(a) câu dương bị chặn {a['blocked']} ≤ {a['limit']}: {mark(a['pass'])}"
             + (f" — {', '.join(a['blocked_qids'])}" if a["blocked_qids"] else ""),
             f"(b) gold trong top-{rules.K_PROMPT} {b['hits']}/{b['n']} = {b['rate']:.4f} so với hit@5 gốc "
             f"{b['expected_hit5']:.4f}: {mark(b['pass'])}", "",
             "(c) câu âm (chỉ ghi nhận):", "",
             "| nhóm | n | " + " | ".join(DECISIONS) + " | qid bị chặn |", "|---|---|" + "---|" * (len(DECISIONS) + 1)]
    for g, row in c.items():
        lines.append(f"| {g} | {row['n']} | " + " | ".join(str(row[d]) for d in DECISIONS)
                     + f" | {', '.join(row['blocked_qids']) or '—'} |")
    t = report["intent_ms"]
    lines += ["", f"Bước intent (encode e5 + phân loại, CPU laptop): p50 {t['p50']} ms · p95 {t['p95']} ms · "
                  f"max {t['max']} ms (n={t['n']})"]
    return "\n".join(lines)


# --- Chay that ---------------------------------------------------------------------------------


def rule_commit() -> dict:
    """Hash commit gan nhat sua luat/pipeline + co thay doi chua commit khong."""
    def git(*a):
        return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, check=False).stdout.strip()
    return {"hash": git("log", "-1", "--format=%H", "--", *RULE_FILES),
            "dirty": bool(git("status", "--porcelain", "--", *RULE_FILES))}


def evaluate(items: list[dict], ranking, chunks_by_id, embedder, clf) -> list[dict]:
    rows = []
    for q, (ranked, dists) in zip(items, ranking):
        req = build_request(q["question"], ranked, dists, chunks_by_id)
        res = pl.run_pipeline(req, embedder, clf)
        row = {"qid": q["qid"], "kind": q["kind"], "lang": q["lang"], "group": q.get("group"),
               "question": q["question"], "decision": res.decision, "reason": res.reason,
               "intent": None if res.intent is None else
               {"label": res.intent.label, "confidence": round(res.intent.confidence, 4)},
               "top1_id": ranked[0], "top1_distance": round(dists[0], 4),
               "intent_ms": round(res.timings.get("intent", 0.0), 2),
               "selected_ids": [c.id for c in res.contexts]}
        if q["kind"] == "pos":
            row["gold"] = q["gold"]
            row["gold_in_top5"] = gold_in_selected(req, q["gold"])
        rows.append(row)
    return rows


def parse_args(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--chunks", type=Path, default=lv.DEFAULT_KB_JSONL)
    ap.add_argument("--questions", type=Path, default=lv.DEFAULT_QUESTIONS)
    ap.add_argument("--negatives", type=Path, default=ev.DEFAULT_NEGATIVES)
    ap.add_argument("--kb-npz", type=Path, default=lv.DEFAULT_KB_NPZ)
    ap.add_argument("--words-npz", type=Path, default=lv.DEFAULT_WORDS_NPZ)
    ap.add_argument("--manifest", type=Path, default=lv.DEFAULT_MANIFEST)
    ap.add_argument("--sweep", type=Path, default=DEFAULT_SWEEP)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.set_defaults(reencode=False)  # luon dung .npz da nap DB, nhu WSEA-111
    return ap.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args(argv)
    from app.services.intent import IntentClassifier

    chunks = lv.load_chunks(args.chunks)
    chunks_by_id = {str(c["id"]): c for c in chunks}
    positives = [{**q, "kind": "pos"} for q in ce.load_questions(args.questions)]
    negatives = [{**q, "kind": "neg", "group": (q.get("group") or "").strip()}
                 for q in ce.load_questions(args.negatives)]
    errors = ce.validate_questions(positives, set(chunks_by_id)) + ev.validate_negatives(negatives)
    ids, p_vecs, _, manifest, errors2 = ev.load_passage_vectors(args)
    if errors or errors2:
        return lv.fail(errors + errors2, "dữ liệu")
    expected = json.loads(args.sweep.read_text(encoding="utf-8"))["positives"]["metrics"]["overall"]["hit@5"]

    embedder = emb.Embedder(local_files_only=True)
    clf = IntentClassifier.load()
    items = positives + negatives
    ranking = ev.rank_all(embedder.encode_queries([q["question"] for q in items]), p_vecs, ids)
    rows = evaluate(items, ranking, chunks_by_id, embedder, clf)
    pos_rows = [r for r in rows if r["kind"] == "pos"]
    neg_rows = [r for r in rows if r["kind"] == "neg"]

    commit = rule_commit()
    report = {
        "task": "WSEA-127", "step": "B3",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rule_commit": commit["hash"], "rule_files_dirty": commit["dirty"],
        "rules": {"k_prompt": rules.K_PROMPT, "k_vocab": rules.K_VOCAB,
                  "max_top1_distance": rules.MAX_TOP1_DISTANCE, "max_wrong_block_pos": rules.MAX_WRONG_BLOCK_POS,
                  "tau": clf.tau, "candidates": TOP_N_CANDIDATES},
        "e5": emb.model_info(), "manifest_created_at": manifest.get("created_at") if manifest else None,
        "files": {ev.rel(p): lv.sha256(p) for p in (args.questions, args.negatives, args.chunks, args.sweep)},
        "n_positives": len(pos_rows), "n_negatives": len(neg_rows),
        "a": check_a(pos_rows), "b": check_b(pos_rows, expected), "c": table_c(neg_rows),
        "intent_ms": timing_summary([r["intent_ms"] for r in rows]),
        "rows": rows,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(summary_text(report))
    print(f"\nĐã ghi {ev.rel(args.out)}")
    return 0 if report["a"]["pass"] and report["b"]["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
