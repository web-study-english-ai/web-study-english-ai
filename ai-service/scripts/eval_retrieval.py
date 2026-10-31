"""Danh gia truy hoi kb_chunks: quet k, nguong distance, doi chieu SQL (WSEA-111 buoc B3).

    .\\.venv\\Scripts\\python.exe scripts\\eval_retrieval.py              # vector trong .npz (dung ban da nap DB)
    .\\.venv\\Scripts\\python.exe scripts\\eval_retrieval.py --reencode   # sinh lai vector doan bang Embedder
    $env:KB_DATABASE_URL = "postgresql://..."                              # chi dat trong phien terminal
    .\\.venv\\Scripts\\python.exe scripts\\eval_retrieval.py --db         # them doi chieu voi pgvector (chi doc)

Dau vao: kb/grammar_chunks.jsonl, kb/eval_questions.csv (cau duong), kb/eval_negatives.csv (cau am),
data/embeddings/*.npz + docs/kb/embedding_manifest.json (sinh boi scripts/embed_kb.py).
Cau hoi luon ma hoa bang app/services/embedder.Embedder.encode_queries.
distance = 1 - cosine, dung bang toan tu <=> cua pgvector.

Dau ra: docs/eval/retrieval_k_sweep.json + bang tom tat in ra man hinh.
Ham tinh chi so la ham thuan, test o tests/test_eval_retrieval.py.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services import embedder as emb  # noqa: E402
from scripts import compare_embedders as ce  # noqa: E402
from scripts import load_vectors as lv  # noqa: E402

KS = (1, 3, 5, 8, 10, 20)
MRR_K = 20
HARD_RANK = 3  # liet ke cau co gold dau tien o hang > 3
TOP_SHOWN = 3
THRESHOLDS = tuple(round(0.14 + 0.01 * i, 2) for i in range(9))  # 0.14 -> 0.22
NEG_GROUPS = ("off", "gap")
NEG_LANGS = ("vi", "en", "mixed")
SQL_K = 8

DEFAULT_NEGATIVES = ROOT / "kb" / "eval_negatives.csv"
DEFAULT_OUT = ROOT / "docs" / "eval" / "retrieval_k_sweep.json"

# Dung cau SQL kb_chunks trong docs/API_CONTRACT.md ($1 -> %(q)s, $2 -> %(model)s).
KB_SQL = """
SELECT id, content, source, topic, cefr::text AS cefr,
       (embedding <=> %(q)s::vector) AS distance
FROM kb_chunks
WHERE embedding IS NOT NULL
  AND embedding_model = %(model)s
ORDER BY embedding <=> %(q)s::vector
LIMIT 8
"""


# --- Du lieu ------------------------------------------------------------------------------


def validate_negatives(rows: list[dict]) -> list[str]:
    """Kiem file cau am (doc bang ce.load_questions). Tra danh sach loi; rong la hop le."""
    errors = []
    if not rows:
        errors.append("không có câu âm nào")
    seen: set[str] = set()
    for i, r in enumerate(rows, 2):  # dong 1 la header
        where = r["qid"] or f"dòng {i}"
        if not r["qid"]:
            errors.append(f"dòng {i}: thiếu qid")
        elif r["qid"] in seen:
            errors.append(f"{where}: trùng qid")
        seen.add(r["qid"])
        if not r["question"]:
            errors.append(f"{where}: câu hỏi rỗng")
        if (r.get("group") or "").strip() not in NEG_GROUPS:
            errors.append(f"{where}: group {r.get('group')!r} phải thuộc {NEG_GROUPS}")
        if r["lang"] not in NEG_LANGS:
            errors.append(f"{where}: lang {r['lang']!r} phải thuộc {NEG_LANGS}")
    return errors


def load_passage_vectors(args) -> tuple[list[str], np.ndarray, str, dict | None, list[str]]:
    """Tra (ids, vectors, nguon, manifest, loi). Mac dinh doc .npz da nap DB, kiem manifest."""
    chunks = lv.load_chunks(args.chunks)
    if args.reencode:
        ids = [str(c["id"]) for c in chunks]
        vectors = emb.Embedder().encode_passages([c["content"] for c in chunks])
        return ids, vectors, "reencode", None, []
    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return [], np.zeros((0, emb.DIM), np.float32), "npz", None, [f"không đọc được manifest: {e}"]
    errors = lv.verify_manifest(manifest, args.chunks, args.kb_npz, args.words_npz)
    if errors:
        return [], np.zeros((0, emb.DIM), np.float32), "npz", manifest, errors
    npz = np.load(args.kb_npz)
    ids = [str(x) for x in npz["ids"]]
    vectors = npz["vectors"].astype(np.float32)
    errors = lv.check_npz(ids, vectors, "kb") + lv.match_chunks(chunks, ids)
    return ids, vectors, "npz", manifest, errors


# --- Chi so (ham thuan) ---------------------------------------------------------------------


def rank_all(q_vecs: np.ndarray, p_vecs: np.ndarray, ids: list[str]) -> list[tuple[list[str], list[float]]]:
    """Moi cau hoi -> (toan bo id xep tang dan theo distance, distance tuong ung)."""
    dist = 1.0 - q_vecs @ p_vecs.T
    out = []
    for row in dist:
        order = np.argsort(row, kind="stable")
        out.append(([ids[j] for j in order], [float(row[j]) for j in order]))
    return out


def recall_at_k(ranked: list[str], gold: set[str], k: int) -> float:
    """Ti le gold nam trong top-k (cau nhieu gold: 1 trung / 2 gold = 0.5)."""
    if not gold:
        raise ValueError("gold rỗng")
    return len(gold & set(ranked[:k])) / len(gold)


def positive_metrics(rows: list[dict], ks=KS, mrr_k: int = MRR_K) -> dict:
    """rows: [{'ranked', 'gold', 'lang'}] -> hit@k, recall@k, MRR@k tong va theo lang."""
    def summary(rs):
        n = len(rs)
        out = {"n": n}
        for k in ks:
            out[f"hit@{k}"] = sum(ce.hit_at_k(r["ranked"], set(r["gold"]), k) for r in rs) / n
        for k in ks:
            out[f"recall@{k}"] = sum(recall_at_k(r["ranked"], set(r["gold"]), k) for r in rs) / n
        out[f"mrr@{mrr_k}"] = sum(ce.reciprocal_rank(r["ranked"], set(r["gold"]), mrr_k) for r in rs) / n
        return out

    langs = sorted({r["lang"] for r in rows})
    return {"overall": summary(rows), "by_lang": {lang: summary([r for r in rows if r["lang"] == lang]) for lang in langs}}


def hard_questions(rows: list[dict], min_rank: int = HARD_RANK) -> list[dict]:
    """Cau co gold dau tien o hang > min_rank (hoac khong co gold nao trong ranked)."""
    out = []
    for r in rows:
        gold = set(r["gold"])
        rank = ce.first_gold_rank(r["ranked"], gold)
        if rank is None or rank > min_rank:
            out.append({
                "qid": r["qid"], "lang": r["lang"], "question": r["question"], "gold": r["gold"],
                "first_gold_rank": rank,
                "gold_distance": None if rank is None else round(r["dists"][rank - 1], 4),
                "top3": [{"id": i, "distance": round(d, 4)} for i, d in zip(r["ranked"][:TOP_SHOWN], r["dists"])],
            })
    return out


def distribution(values: list[float]) -> dict:
    return {
        "n": len(values),
        "min": round(min(values), 4),
        "p50": round(ce.percentile(values, 50), 4),
        "p90": round(ce.percentile(values, 90), 4),
        "max": round(max(values), 4),
    }


def threshold_table(pos_top1: list[float], neg_top1: dict[str, list[float]], thresholds=THRESHOLDS) -> list[dict]:
    """Quy tac: chan khi distance top-1 > t.

    pos_kept = ti le cau duong co top-1 <= t (giu lai); <group>_blocked = ti le cau am > t (bi chan).
    """
    table = []
    for t in thresholds:
        row = {"threshold": t, "pos_kept": sum(d <= t for d in pos_top1) / len(pos_top1)}
        for group, ds in neg_top1.items():
            row[f"{group}_blocked"] = sum(d > t for d in ds) / len(ds) if ds else None
        table.append(row)
    return table


def compare_sql(sql_rows: list[tuple[str, float]], np_ranked: list[str], np_dist_by_id: dict[str, float]) -> dict:
    """So top-8 SQL (id, distance) voi numpy cho mot cau hoi."""
    sql_ids = [i for i, _ in sql_rows]
    diffs = [abs(d - np_dist_by_id[i]) for i, d in sql_rows if i in np_dist_by_id]
    return {
        "top1_match": bool(sql_ids) and sql_ids[0] == np_ranked[0],
        "order_match": sql_ids == np_ranked[:SQL_K],
        "max_abs_distance_diff": max(diffs) if diffs else None,
        "sql_ids": sql_ids,
        "numpy_ids": np_ranked[:SQL_K],
    }


# --- DB (chi doc) ----------------------------------------------------------------------------


def run_db(url: str, items: list[dict], q_vecs: np.ndarray, ranking) -> dict:
    """Chay KB_SQL cho tung cau, so voi numpy. items: [{'qid', ...}] cung thu tu voi q_vecs."""
    import psycopg
    from pgvector.psycopg import register_vector

    target = lv.mask_url(url)
    print(f"\nĐối chiếu SQL trên {target} (chỉ đọc)")
    try:
        conn = psycopg.connect(url, connect_timeout=15)
    except (psycopg.Error, UnicodeError, OSError) as e:
        raise lv.ConfigError(lv.redact(f"không kết nối được: {type(e).__name__}: {e}", url)) from None

    per_q, times_ms = [], []
    with conn:
        conn.read_only = True
        register_vector(conn)
        with conn.cursor() as cur:
            for item, qv, (ranked, dists) in zip(items, q_vecs, ranking):
                t = time.perf_counter()
                cur.execute(KB_SQL, {"q": qv, "model": emb.MODEL_NAME})
                rows = cur.fetchall()
                times_ms.append((time.perf_counter() - t) * 1000)
                cmp = compare_sql([(r[0], float(r[5])) for r in rows], ranked, dict(zip(ranked, dists)))
                per_q.append({"qid": item["qid"], **cmp})
        conn.rollback()

    diffs = [q["max_abs_distance_diff"] for q in per_q if q["max_abs_distance_diff"] is not None]
    n = len(per_q)
    return {
        "target": target,
        "n_questions": n,
        "top1_match_rate": sum(q["top1_match"] for q in per_q) / n,
        "order_match_rate": sum(q["order_match"] for q in per_q) / n,
        "max_abs_distance_diff": max(diffs) if diffs else None,
        "sql_ms": {"p50": round(ce.percentile(times_ms, 50), 2), "max": round(max(times_ms), 2)},
        "mismatches": [q for q in per_q if not q["order_match"]],
    }


# --- Dau ra ---------------------------------------------------------------------------------


def fmt(x, digits=3):
    return "—" if x is None else f"{x:.{digits}f}"


def summary_text(report: dict) -> str:
    pos = report["positives"]
    lines = [f"Mô hình {report['model']} @ {report['revision'][:8]} · vector đoạn: {report['passage_vectors']} "
             f"· {report['n_chunks']} đoạn · {pos['metrics']['overall']['n']} câu dương · "
             f"{report['negatives']['n']} câu âm", ""]

    head = " | ".join(f"@{k}" for k in KS)
    for kind in ("hit", "recall"):
        lines += [f"{kind}@k (MRR@{MRR_K} ở cột cuối):", "",
                  f"| nhóm | n | {head} | MRR |", "|---|---|" + "---|" * (len(KS) + 1)]
        groups = [("tất cả", pos["metrics"]["overall"])] + list(pos["metrics"]["by_lang"].items())
        for name, m in groups:
            cells = " | ".join(fmt(m[f"{kind}@{k}"], 2) for k in KS)
            lines.append(f"| {name} | {m['n']} | {cells} | {fmt(m[f'mrr@{MRR_K}'], 3)} |")
        lines.append("")

    lines += [f"Câu dương có gold đầu tiên ở hạng > {HARD_RANK}:", ""]
    if pos["hard"]:
        lines += ["| qid | hạng | d(gold) | top-3 (distance) |", "|---|---|---|---|"]
        for h in pos["hard"]:
            top = ", ".join(f"{t['id']} ({t['distance']:.3f})" for t in h["top3"])
            lines.append(f"| {h['qid']} | {h['first_gold_rank']} | {fmt(h['gold_distance'])} | {top} |")
    else:
        lines.append("(không có)")

    lines += ["", "Câu âm — top-1:", "", "| qid | nhóm | d top-1 | id top-1 | câu |", "|---|---|---|---|---|"]
    for r in report["negatives"]["top1"]:
        lines.append(f"| {r['qid']} | {r['group']} | {r['distance']:.3f} | {r['id']} | {r['question']} |")

    lines += ["", "Phân bố distance top-1:", "", "| tập | n | min | p50 | p90 | max |", "|---|---|---|---|---|---|"]
    for name, d in report["distance_top1"].items():
        lines.append(f"| {name} | {d['n']} | {d['min']:.3f} | {d['p50']:.3f} | {d['p90']:.3f} | {d['max']:.3f} |")

    lines += ["", "Ngưỡng (chặn khi distance top-1 > t):", "",
              "| t | dương giữ lại | âm off bị chặn | âm gap bị chặn |", "|---|---|---|---|"]
    for r in report["thresholds"]:
        lines.append(f"| {r['threshold']:.2f} | {fmt(r['pos_kept'], 2)} | {fmt(r.get('off_blocked'), 2)} | "
                     f"{fmt(r.get('gap_blocked'), 2)} |")

    db = report.get("db")
    if db:
        lines += ["", f"SQL ({db['target']}, {db['n_questions']} câu): top-1 khớp {db['top1_match_rate']:.2f}, "
                      f"nguyên thứ tự top-8 khớp {db['order_match_rate']:.2f}, "
                      f"|Δdistance| max {fmt(db['max_abs_distance_diff'], 6)}, "
                      f"SQL p50 {db['sql_ms']['p50']} ms / max {db['sql_ms']['max']} ms"]
    return "\n".join(lines)


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/") if path.is_relative_to(ROOT) else str(path)


def parse_args(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--chunks", type=Path, default=lv.DEFAULT_KB_JSONL)
    ap.add_argument("--questions", type=Path, default=lv.DEFAULT_QUESTIONS)
    ap.add_argument("--negatives", type=Path, default=DEFAULT_NEGATIVES)
    ap.add_argument("--kb-npz", type=Path, default=lv.DEFAULT_KB_NPZ)
    ap.add_argument("--words-npz", type=Path, default=lv.DEFAULT_WORDS_NPZ)
    ap.add_argument("--manifest", type=Path, default=lv.DEFAULT_MANIFEST)
    ap.add_argument("--reencode", action="store_true", help="sinh lại vector đoạn bằng Embedder thay vì đọc .npz")
    ap.add_argument("--db", action="store_true", help=f"đối chiếu với pgvector (chuỗi kết nối từ {lv.ENV_VAR})")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    return ap.parse_args(argv)


def main(argv: list[str] | None = None, environ=os.environ) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args(argv)

    url = None
    if args.db:
        try:
            url = lv.prepare_url(environ.get(lv.ENV_VAR, ""))
        except lv.ConfigError as e:
            return lv.fail([str(e)], "chuỗi kết nối")

    chunk_ids = {str(c["id"]) for c in lv.load_chunks(args.chunks)}
    positives = ce.load_questions(args.questions)
    negatives = ce.load_questions(args.negatives)
    for r in negatives:
        r["group"] = (r.get("group") or "").strip()
    errors = ce.validate_questions(positives, chunk_ids) + validate_negatives(negatives)
    if errors:
        return lv.fail(errors, "dữ liệu câu hỏi")

    ids, p_vecs, source, manifest, errors = load_passage_vectors(args)
    if errors:
        return lv.fail(errors, "vector đoạn")

    embedder = emb.Embedder()
    items = positives + negatives
    q_vecs = embedder.encode_queries([q["question"] for q in items])
    ranking = rank_all(q_vecs, p_vecs, ids)
    pos_rank, neg_rank = ranking[: len(positives)], ranking[len(positives):]

    pos_rows = [{**q, "ranked": r, "dists": d} for q, (r, d) in zip(positives, pos_rank)]
    pos_top1 = [d[0] for _, d in pos_rank]
    neg_top1 = [{"qid": q["qid"], "group": q["group"], "lang": q["lang"], "question": q["question"],
                 "id": r[0], "distance": round(d[0], 4)} for q, (r, d) in zip(negatives, neg_rank)]
    neg_by_group = {g: [d[0] for q, (_, d) in zip(negatives, neg_rank) if q["group"] == g] for g in NEG_GROUPS}

    report = {
        "task": "WSEA-111",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        **emb.model_info(),
        "passage_vectors": source,
        "manifest_created_at": manifest.get("created_at") if manifest else None,
        "distance": "1 - cosine (= toán tử <=> của pgvector)",
        "files": {
            rel(args.questions): lv.sha256(args.questions),
            rel(args.negatives): lv.sha256(args.negatives),
        },
        "n_chunks": len(ids),
        "positives": {
            "by_lang": dict(sorted(Counter(q["lang"] for q in positives).items())),
            "metrics": positive_metrics(pos_rows),
            "hard": hard_questions(pos_rows),
        },
        "negatives": {
            "n": len(negatives),
            "by_group": {g: len(v) for g, v in neg_by_group.items()},
            "top1": neg_top1,
        },
        "distance_top1": {
            "dương": distribution(pos_top1),
            **{f"âm {g}": distribution(v) for g, v in neg_by_group.items() if v},
        },
        "thresholds": threshold_table(pos_top1, neg_by_group),
        "threshold_rule": "chặn khi distance top-1 > t",
    }

    if url:
        try:
            report["db"] = run_db(url, items, q_vecs, ranking)
        except lv.ConfigError as e:
            return lv.fail([str(e), "kiểm tra lại KB_DATABASE_URL"], "DB")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(summary_text(report))
    print(f"\nĐã ghi {rel(args.out)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
