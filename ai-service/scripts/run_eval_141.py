"""Danh gia pipeline tro ly tren bo cau WSEA-141 (truy hoi + luat 127, va phan sinh tuy chon).

    # Truy hoi + luat 127 (0 loi goi LLM) -> reports/141_retrieval.json
    .\\.venv\\Scripts\\python.exe scripts\\run_eval_141.py --questions kb\\eval_set_141.csv --negatives kb\\eval_set_141_neg.csv

    # Phan sinh: can server local (uvicorn app.main:app --host 127.0.0.1 --port 8000, .env that)
    .\\.venv\\Scripts\\python.exe scripts\\run_eval_141.py --questions ... --negatives ... --gen [--limit 1]

Tieu chi va thang cham: docs/eval/WSEA-141_tieu_chi.md (chot truoc khi chay that).
- Truy hoi: vector doan tu .npz da nap DB (kiem manifest), rank_all / positive_metrics cua
  scripts/eval_retrieval.py — dung cach WSEA-111. Khong dat nguong dat/truot.
- Luat 127: moi cau -> AskRequest top-8 (word null, vocab [], history []) -> run_pipeline that
  (Embedder + IntentClassifier that), dung scripts/check_pipeline.evaluate.
- Phan sinh (--gen): 20 cau chon bang random.Random(141), phan tang (mac dinh 14 duong + 6 am).
  Moi cau: top-8 nhu tren -> POST /assistant/rank (lay decision cua server) -> POST /assistant/ask JSON.
  Ngu --sleep giay sau moi cau co goi LLM (Groq ~8K token/phut). Ket qua: reports/141_gen.json +
  reports/141_cham.csv (2 cot diem, ghi_chu de trong cho Phuc cham).
  Cau degraded (tieu chi muc 4.2), theo reason trong 503: rate_limited/timeout/upstream_error -> cho
  --retry-wait (>= 60 s) roi chay lai DUNG 1 lan (retried, first_reason); empty_content/bad_response ->
  khong chay lai, bao rieng; no_key -> dung ca luot, KHONG ghi file nao.
Khoa x-api-key doc INTERNAL_API_KEY tu .env, KHONG in/ghi. Goi HTTP co User-Agent rieng.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import re
import sys
import time
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services import pipeline_rules as rules  # noqa: E402
from scripts import check_pipeline as cp  # noqa: E402
from scripts import compare_embedders as ce  # noqa: E402
from scripts import eval_retrieval as ev  # noqa: E402
from scripts import load_vectors as lv  # noqa: E402
from scripts import smoke_ask as sa  # noqa: E402

DEFAULT_QUESTIONS = ROOT / "kb" / "eval_set_141.csv"
DEFAULT_NEGATIVES = ROOT / "kb" / "eval_set_141_neg.csv"
DEFAULT_OUT_DIR = ROOT / "reports"
SEED = 141
N_POS, N_NEG = 14, 6
SLEEP_S = 30.0
REPORT_KS = (1, 5, 8)
# Bo 31 cau cu (WSEA-110/111, docs/eval/retrieval_k_sweep.json) — dat canh, KHONG phai nguong.
BASELINE_31 = {"source": "docs/eval/retrieval_k_sweep.json (WSEA-111), 31 câu dương",
               "hit@1": 0.613, "hit@5": 0.839, "hit@8": 0.871, "mrr@20": 0.681,
               "note": "MRR 0,678 hay được trích là MRR@8 (WSEA-110/126); MRR@20 của cùng bộ là 0,681"}
CHAM_COLUMNS = ("qid", "question", "nguon", "answer", "diem", "ghi_chu")


# --- Ham thuan -----------------------------------------------------------------------------------


def load_sets(q_path: Path, n_path: Path) -> tuple[list[dict], list[dict]]:
    positives = [{**q, "kind": "pos"} for q in ce.load_questions(q_path)]
    negatives = [{**q, "kind": "neg", "group": (q.get("group") or "").strip()} for q in ce.load_questions(n_path)]
    return positives, negatives


def validate_sets(positives: list[dict], negatives: list[dict], chunk_ids: set[str]) -> list[str]:
    """Loi du lieu (rong = hop le): gold_id co trong kb, qid khong trung (trong tung file: ham cu; giua hai file: o day)."""
    errors = ce.validate_questions(positives, chunk_ids) + ev.validate_negatives(negatives)
    cross = sorted({q["qid"] for q in positives if q["qid"]} & {q["qid"] for q in negatives if q["qid"]})
    if cross:
        errors.append(f"qid trùng giữa file dương và file âm: {cross}")
    return errors


def retrieval_metrics(pos_rows: list[dict]) -> dict:
    """hit@1/5/8 + MRR@20 (tong va theo lang) tu positive_metrics cua eval_retrieval."""
    full = ev.positive_metrics(pos_rows)
    keep = [f"hit@{k}" for k in REPORT_KS] + [f"mrr@{ev.MRR_K}"]

    def pick(m):
        return {"n": m["n"], **{k: round(m[k], 4) for k in keep}}
    return {"overall": pick(full["overall"]), "by_lang": {lang: pick(m) for lang, m in full["by_lang"].items()}}


def top1_distributions(pos_rows: list[dict], neg_rows: list[dict]) -> dict:
    out = {"pos": ev.distribution([r["dists"][0] for r in pos_rows])}
    for g in sorted({r["group"] for r in neg_rows}):
        out[f"neg_{g}"] = ev.distribution([r["dists"][0] for r in neg_rows if r["group"] == g])
    if neg_rows:
        out["neg_all"] = ev.distribution([r["dists"][0] for r in neg_rows])
    return out


def pipeline_summary(rows: list[dict]) -> dict:
    """Ti le bi chan (decision != answer): cau duong, cau off, cau gap. Chi ghi nhan."""
    def rate(rs):
        blocked = [r["qid"] for r in rs if r["decision"] != rules.ANSWER]
        return {"n": len(rs), "blocked": len(blocked), "rate": round(len(blocked) / len(rs), 4) if rs else None,
                "blocked_qids": blocked}
    pos = [r for r in rows if r["kind"] == "pos"]
    neg = [r for r in rows if r["kind"] == "neg"]
    out = {"pos": rate(pos)}
    for g in ("off", "gap"):
        out[g] = rate([r for r in neg if r["group"] == g])
    out["by_decision"] = cp.table_c(neg) if neg else {}
    return out


def _alloc(sizes: dict[str, int], n: int) -> dict[str, int]:
    """Chia n theo ti le kich thuoc tung tang (phan du lon nhat; hoa -> ten tang tang dan)."""
    total = sum(sizes.values())
    if n >= total:
        return dict(sizes)
    raw = {k: n * v / total for k, v in sizes.items()}
    out = {k: int(x) for k, x in raw.items()}
    for k in sorted(raw, key=lambda k: (-(raw[k] - out[k]), k))[: n - sum(out.values())]:
        out[k] += 1
    return out


def select_gen(positives: list[dict], negatives: list[dict], seed: int = SEED,
               n_pos: int = N_POS, n_neg: int = N_NEG) -> list[str]:
    """Chon cau cho phan sinh, tat dinh theo seed.

    - Duong: phan tang theo lang, chia n_pos theo ti le (phan du lon nhat).
    - Am: uu tien du off va gap — chia deu n_neg cho hai nhom (le thi off nhieu hon), nhom thieu
      thi bu tu nhom con lai.
    - Trong moi tang: sap qid tang dan roi rng.sample; cac tang duyet theo ten tang dan, mot rng duy nhat.
    Tra danh sach qid: duong truoc, am sau, moi phan sap qid tang dan.
    """
    rng = random.Random(seed)
    by_lang: dict[str, list[str]] = {}
    for q in positives:
        by_lang.setdefault(q["lang"], []).append(q["qid"])
    want = _alloc({k: len(v) for k, v in by_lang.items()}, n_pos)
    chosen_pos = []
    for lang in sorted(by_lang):
        chosen_pos += rng.sample(sorted(by_lang[lang]), want[lang])

    groups = {g: sorted(q["qid"] for q in negatives if q["group"] == g) for g in ("off", "gap")}
    half = {"off": (n_neg + 1) // 2, "gap": n_neg // 2}
    take = {g: min(half[g], len(groups[g])) for g in groups}
    spare = n_neg - sum(take.values())
    for g in ("off", "gap"):  # bu cho nhom thieu
        extra = min(spare, len(groups[g]) - take[g])
        take[g] += extra
        spare -= extra
    chosen_neg = []
    for g in ("gap", "off"):  # ten tang dan
        chosen_neg += rng.sample(groups[g], take[g])
    return sorted(chosen_pos) + sorted(chosen_neg)


def cham_rows(gen_rows: list[dict], chunks_by_id: dict[str, dict]) -> list[dict]:
    """Dong cho file cham: nguon = toan van cac doan duoc trich (de Phuc doi chieu); diem, ghi_chu trong."""
    out = []
    for r in gen_rows:
        src = "\n\n".join(f"[{i}] {chunks_by_id[i]['content']}" for i in r.get("source_ids") or [] if i in chunks_by_id)
        answer = r["answer"] if r.get("answer") is not None else f"(LỖI: {r.get('error')})"
        out.append({"qid": r["qid"], "question": r["question"], "nguon": src, "answer": answer,
                    "diem": "", "ghi_chu": ""})
    return out


def write_cham_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:  # utf-8-sig: Excel doc dung tieng Viet
        w = csv.DictWriter(f, fieldnames=CHAM_COLUMNS)
        w.writeheader()
        w.writerows(rows)


def summary_text(report: dict) -> str:
    m, b, p = report["retrieval"]["overall"], report["baseline_31"], report["pipeline"]
    d = report["top1_distance"]
    lines = [f"{report['n_positives']} câu dương · {report['n_negatives']} câu âm · top-8 e5 → K_PROMPT {rules.K_PROMPT}",
             "", "| chỉ số | bộ này | 31 câu cũ |", "|---|---|---|"]
    for k in [f"hit@{k}" for k in REPORT_KS] + [f"mrr@{ev.MRR_K}"]:
        lines.append(f"| {k} | {m[k]:.3f} | {b[k]:.3f} |")
    lines += ["", "distance top-1: " + " · ".join(f"{g} p50 {v['p50']} (min {v['min']}, max {v['max']}, n={v['n']})"
                                                for g, v in d.items()),
              "", "Luật 127 — bị chặn (decision ≠ answer), chỉ ghi nhận:"]
    for g in ("pos", "off", "gap"):
        r = p[g]
        lines.append(f"- {g}: {r['blocked']}/{r['n']}" + (f" — {', '.join(r['blocked_qids'])}" if r["blocked_qids"] else ""))
    lines += ["", f"Câu cho phần sinh (seed {report['gen_selection']['seed']}): {', '.join(report['gen_selection']['qids'])}"]
    return "\n".join(lines)


# --- Chay that -----------------------------------------------------------------------------------


def paths_args():
    a = cp.parse_args([])
    a.reencode = False
    return a


def retrieval_part(args) -> tuple[dict, list[dict], list, dict]:
    from app.services import embedder as emb
    from app.services.intent import IntentClassifier

    paths = paths_args()
    chunks_by_id = {str(c["id"]): c for c in lv.load_chunks(paths.chunks)}
    positives, negatives = load_sets(args.questions, args.negatives)
    errors = validate_sets(positives, negatives, set(chunks_by_id))
    ids, p_vecs, _, manifest, errors2 = ev.load_passage_vectors(paths)
    if errors or errors2:
        raise SystemExit(lv.fail(errors + errors2, "dữ liệu"))
    print(f"{ev.rel(args.questions)}: {len(positives)} câu dương · {ev.rel(args.negatives)}: {len(negatives)} câu âm")

    embedder = emb.Embedder(local_files_only=True)
    clf = IntentClassifier.load()
    items = positives + negatives
    ranking = ev.rank_all(embedder.encode_queries([q["question"] for q in items]), p_vecs, ids)
    rows = cp.evaluate(items, ranking, chunks_by_id, embedder, clf)
    for row, (ranked, dists) in zip(rows, ranking):
        row["ranked"], row["dists"] = ranked[:ev.MRR_K], dists[:ev.MRR_K]
    pos_rows = [r for r in rows if r["kind"] == "pos"]
    neg_rows = [r for r in rows if r["kind"] == "neg"]
    commit = cp.rule_commit()
    report = {
        "task": "WSEA-141", "part": "retrieval",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rule_commit": commit["hash"], "rule_files_dirty": commit["dirty"],
        "rules": {"k_prompt": rules.K_PROMPT, "k_vocab": rules.K_VOCAB, "max_top1_distance": rules.MAX_TOP1_DISTANCE,
                  "tau": clf.tau, "candidates": cp.TOP_N_CANDIDATES},
        "e5": emb.model_info(), "manifest_created_at": manifest.get("created_at") if manifest else None,
        "files": {ev.rel(p): lv.sha256(p) for p in (args.questions, args.negatives, paths.chunks)},
        "n_positives": len(pos_rows), "n_negatives": len(neg_rows),
        "retrieval": retrieval_metrics(pos_rows), "baseline_31": BASELINE_31,
        "top1_distance": top1_distributions(pos_rows, neg_rows),
        "pipeline": pipeline_summary(rows),
        "gen_selection": {"seed": SEED, "n_pos": N_POS, "n_neg": N_NEG,
                          "qids": select_gen(positives, negatives)},
        "rows": [{k: v for k, v in r.items() if k not in ("ranked", "dists")}
                 | {"top8": [{"id": i, "distance": round(x, 4)} for i, x in zip(r["ranked"][:8], r["dists"][:8])]}
                 for r in rows],
    }
    by_qid = {q["qid"]: (q, rk) for q, rk in zip(items, ranking)}
    return report, rows, by_qid, chunks_by_id


# --- Cau degraded (tieu chi muc 4.2): phan loai theo reason cua 503 /assistant/ask ---------------
RETRY_REASONS = ("rate_limited", "timeout", "upstream_error")  # ha tang: cho RETRY_WAIT_S, chay lai 1 lan
MODEL_REASONS = ("empty_content", "bad_response")              # phia mo hinh: KHONG chay lai, bao rieng
FATAL_REASONS = ("no_key",)                                    # cau hinh: dung ca luot, khong ghi ket qua
RETRY_WAIT_S = 60.0
_REASON_RE = re.compile(r"\(([a-z_]+)\)\s*$")


class FatalRunError(Exception):
    """Loi cau hinh (vd server thieu LLM_API_KEY): dung ca luot chay, khong ghi ket qua."""


def parse_reason(error_body: str) -> str | None:
    """Body loi cua dich vu ({"detail": "Khong goi duoc LLM (<reason>)"}) -> reason; khong doc duoc -> None."""
    try:
        detail = json.loads(error_body).get("detail")
    except (ValueError, AttributeError):
        return None
    m = _REASON_RE.search(detail) if isinstance(detail, str) else None
    return m.group(1) if m else None


def run_with_retry(call, body: dict, sleep=time.sleep, wait_s: float = RETRY_WAIT_S) -> dict:
    """Goi call(body) -> row. Degraded: no_key -> FatalRunError; reason ha tang -> cho wait_s, chay lai
    DUNG 1 lan (retried=True, first_reason); reason phia mo hinh hoac khac -> giu nguyen, khong chay lai."""
    row = call(body)
    row["retried"], row["first_reason"] = False, None
    if not row.get("degraded"):
        return row
    if row.get("error_reason") in FATAL_REASONS:
        raise FatalRunError(row["error_reason"])
    if row.get("error_reason") not in RETRY_REASONS:
        return row
    first = row["error_reason"]
    sleep(wait_s)
    row = call(body)
    if row.get("degraded") and row.get("error_reason") in FATAL_REASONS:
        raise FatalRunError(row["error_reason"])
    row["retried"], row["first_reason"] = True, first
    return row


def degraded_summary(rows: list[dict]) -> dict:
    """So cau chay lai; cau van degraded theo reason; cau loi phia mo hinh (khong chay lai)."""
    still: dict[str, int] = {}
    for r in rows:
        if r.get("degraded"):
            k = r.get("error_reason") or "khac"
            still[k] = still.get(k, 0) + 1
    return {"retried": sum(bool(r.get("retried")) for r in rows),
            "retried_ok": [r["qid"] for r in rows if r.get("retried") and not r.get("degraded")],
            "still_degraded": dict(sorted(still.items())),
            "model_errors": [r["qid"] for r in rows if r.get("degraded") and r.get("error_reason") in MODEL_REASONS]}


def make_call(base: str, key: str, chunks_by_id: dict):
    """call(body) -> row: /assistant/rank (decision cua server) roi /assistant/ask JSON."""
    def call(body: dict) -> dict:
        row: dict = {}
        try:
            with sa.request(base, "/assistant/rank", key, body) as r:
                rank = json.loads(r.read())
            row["decision"], row["reason"], row["intent"] = rank["decision"], rank["reason"], rank["intent"]
            row["contexts"] = [{"id": c["id"], "distance": c["distance"], "text": chunks_by_id[c["id"]]["content"]}
                               for c in rank["contexts"]]
            t0 = time.perf_counter()
            with sa.request(base, "/assistant/ask", key, body) as r:
                ask = json.loads(r.read())
            row.update(answer=ask["answer"], source_ids=ask["source_ids"], degraded=False, error_reason=None,
                       latency_ms=round((time.perf_counter() - t0) * 1000))
        except urllib.error.HTTPError as exc:
            text = exc.read().decode("utf-8", "replace")
            row.update(answer=None, source_ids=[], degraded=True, status=exc.code, error=text[:300],
                       error_reason=parse_reason(text))
        except (urllib.error.URLError, TimeoutError) as exc:
            # loi phia may chay script (khong toi duoc server / het gio doc) -> coi nhu loi ha tang
            row.update(answer=None, source_ids=[], degraded=True, error=type(exc).__name__,
                       error_reason="timeout" if isinstance(exc, TimeoutError) else "upstream_error")
        return row
    return call


def gen_part(args, report: dict, by_qid: dict, chunks_by_id: dict, call=None, sleep=time.sleep) -> list[dict]:
    if call is None:
        key = sa.read_env_key(args.env)
        if not key:
            raise SystemExit("Thiếu INTERNAL_API_KEY trong .env / biến môi trường")
        sa.wait_health(args.base, key)
        call = make_call(args.base, key, chunks_by_id)
    qids = report["gen_selection"]["qids"][: args.limit] if args.limit else report["gen_selection"]["qids"]
    out = []
    for n, qid in enumerate(qids, 1):
        q, (ranked, dists) = by_qid[qid]
        body = cp.build_request(q["question"], ranked, dists, chunks_by_id).model_dump(mode="json")
        row = {"qid": qid, "kind": q["kind"], "group": q.get("group"), "gold": q.get("gold"),
               "question": q["question"], "candidates": [c["id"] for c in body["contexts"]]}
        row.update(run_with_retry(call, body, sleep=sleep, wait_s=args.retry_wait))
        out.append(row)
        print(f"[{n}/{len(qids)}] {qid}: {row.get('decision')} · degraded={row['degraded']}"
              + (f" ({row['error_reason']})" if row["degraded"] else "")
              + (f" · chạy lại sau lỗi {row['first_reason']}" if row["retried"] else ""), flush=True)
        if row.get("decision") == rules.ANSWER and n < len(qids):
            sleep(args.sleep)  # Groq ~8K token/phut/model
    return out


def parse_args(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--questions", type=Path, default=DEFAULT_QUESTIONS)
    ap.add_argument("--negatives", type=Path, default=DEFAULT_NEGATIVES)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    ap.add_argument("--gen", action="store_true", help="chạy phần sinh (gọi /assistant/ask của server local)")
    ap.add_argument("--limit", type=int, default=None, help="chỉ chạy N câu đầu của danh sách sinh (chạy thử)")
    ap.add_argument("--base", default="http://127.0.0.1:8000")
    ap.add_argument("--env", type=Path, default=ROOT / ".env")
    ap.add_argument("--sleep", type=float, default=SLEEP_S)
    ap.add_argument("--retry-wait", type=float, default=RETRY_WAIT_S,
                    help="chờ bao lâu (s) trước khi chạy lại câu degraded do hạ tầng; tiêu chí: ≥ 60")
    return ap.parse_args(argv)


def degraded_text(s: dict) -> str:
    still = ", ".join(f"{k} {v}" for k, v in s["still_degraded"].items()) or "0"
    return (f"Câu chạy lại: {s['retried']} (thành công: {', '.join(s['retried_ok']) or '—'}) · "
            f"vẫn degraded theo reason: {still} · lỗi phía mô hình (không chạy lại): "
            f"{', '.join(s['model_errors']) or '—'}")


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args(argv)
    if args.retry_wait < RETRY_WAIT_S and not args.limit:
        raise SystemExit(f"--retry-wait phải ≥ {RETRY_WAIT_S:.0f} s cho lượt chính thức (tiêu chí mục 4.2)")
    report, _, by_qid, chunks_by_id = retrieval_part(args)
    print(summary_text(report))
    gen = None
    if args.gen:
        try:
            gen_rows = gen_part(args, report, by_qid, chunks_by_id)
        except FatalRunError as exc:
            print(f"\nDỪNG — lỗi cấu hình phía dịch vụ ({exc}): không ghi kết quả nào.")
            return 2
        summary = degraded_summary(gen_rows)
        gen = {"task": "WSEA-141", "part": "gen", "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "base": args.base, "limit": args.limit, "official": not args.limit, "retry_wait_s": args.retry_wait,
               "selection": report["gen_selection"], "files": report["files"], "degraded": summary, "rows": gen_rows}
        print("\n" + degraded_text(summary))
    # Ghi sau cung: loi cau hinh o tren thi khong co file nao duoc ghi.
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "141_retrieval.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                                                     encoding="utf-8")
    if gen is not None:
        (args.out_dir / "141_gen.json").write_text(json.dumps(gen, ensure_ascii=False, indent=2) + "\n",
                                                   encoding="utf-8")
        write_cham_csv(args.out_dir / "141_cham.csv", cham_rows(gen["rows"], chunks_by_id))
        print(f"Đã ghi {ev.rel(args.out_dir)}/141_gen.json, 141_cham.csv ({len(gen['rows'])} câu)")
    print(f"Đã ghi {ev.rel(args.out_dir)}/141_retrieval.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
