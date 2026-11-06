"""Do toc do truy van vector tren pgvector cua mot moi truong (WSEA-110 buoc 5).

CHI DOC: moi khoi do chay trong mot transaction READ ONLY rieng va luon rollback;
chi dung SELECT, EXPLAIN va SET LOCAL. Moi (bang, che do) mot transaction rieng de
SET LOCAL cua che do nay khong lan sang che do khac.

Hai truy van, cung dang SQL voi backend (assistant.service.ts, hop dong v0.3):
  kb_chunks top-8                       WHERE embedding_model = %s ORDER BY embedding <=> %s::vector
  word_embeddings JOIN words top-3      WHERE we.model = %s ORDER BY we.embedding <=> %s::vector
Ba che do cho moi bang:
  default : de planner tu chon
  index   : SET LOCAL enable_seqscan = off           (ep dung chi muc HNSW)
  exact   : SET LOCAL enable_indexscan/bitmapscan = off (tim chinh xac)

Chay (PowerShell):
  $env:KB_DATABASE_URL = "postgresql://..."
  $env:PYTHONIOENCODING = "utf-8"
  .\\.venv\\Scripts\\python.exe scripts\\bench_vector_search.py --env staging
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services import embedder as emb  # noqa: E402
from scripts.compare_embedders import percentile  # noqa: E402
from scripts.load_vectors import ENV_VAR, ConfigError, fail, mask_url, prepare_url, redact  # noqa: E402

DEFAULT_QUESTIONS = ROOT / "kb" / "eval_questions.csv"
DEFAULT_OUT = ROOT / "docs" / "kb" / "vector_bench.json"
WARMUP = 3
DEFAULT_REPEAT = 5
SHOWN_QUESTIONS = 5
SCAN_TYPES = {"Seq Scan", "Index Scan", "Index Only Scan", "Bitmap Heap Scan", "Bitmap Index Scan"}

QUERIES = {
    "kb_chunks": {
        "k": 8,
        "sql": """SELECT id, content, source, topic, cefr::text AS cefr,
       (embedding <=> %(v)s::vector) AS distance
FROM kb_chunks
WHERE embedding IS NOT NULL
  AND embedding_model = %(model)s
ORDER BY embedding <=> %(v)s::vector
LIMIT 8""",
        "key_col": 0,  # id
    },
    "word_embeddings": {
        "k": 3,
        "sql": """SELECT w.term, w.pos::text AS pos, w.meaning_vi, w.example_en,
       (we.embedding <=> %(v)s::vector) AS distance
FROM word_embeddings we
JOIN words w ON w.id = we.word_id
WHERE we.model = %(model)s
ORDER BY we.embedding <=> %(v)s::vector
LIMIT 3""",
        "key_col": 0,  # term
    },
}

MODES = {
    "default": [],
    "index": ["SET LOCAL enable_seqscan = off"],
    "exact": ["SET LOCAL enable_indexscan = off", "SET LOCAL enable_bitmapscan = off"],
}


# --- ham thuan -----------------------------------------------------------------------------


def summarize(values_ms: list[float]) -> dict:
    return {
        "n": len(values_ms),
        "p50_ms": round(percentile(values_ms, 50), 3),
        "p95_ms": round(percentile(values_ms, 95), 3),
    }


def overlap_at_k(approx: list[list[str]], exact: list[list[str]], k: int) -> float:
    """Trung binh |top-k(approx) giao top-k(exact)| / k tren cac cau hoi."""
    if len(approx) != len(exact) or not exact:
        raise ValueError("hai danh sach phai cung so cau hoi va khong rong")
    return sum(len(set(a[:k]) & set(e[:k])) / k for a, e in zip(approx, exact)) / len(exact)


def _plan_root(explain_json):
    """Ket qua EXPLAIN FORMAT JSON: [ { "Plan": ..., "Execution Time": ... } ] (co the la chuoi)."""
    if isinstance(explain_json, str):
        explain_json = json.loads(explain_json)
    if isinstance(explain_json, list):
        explain_json = explain_json[0]
    return explain_json


def scan_nodes(explain_json, relation: str) -> list[str]:
    """Cac nut quet tren `relation`, vi du 'Index Scan using kb_chunks_embedding_idx'."""
    found = []

    def walk(node):
        if node.get("Node Type") in SCAN_TYPES:
            rel, index = node.get("Relation Name"), node.get("Index Name")
            # Bitmap Index Scan khong co Relation Name: nhan qua ten chi muc (Prisma dat <bang>_..._idx)
            if rel == relation or (rel is None and index and index.startswith(relation + "_")):
                found.append(f"{node['Node Type']} using {index}" if index else f"{node['Node Type']} on {relation}")
        for child in node.get("Plans", []):
            walk(child)

    walk(_plan_root(explain_json)["Plan"])
    return found


def execution_time_ms(explain_json) -> float:
    return float(_plan_root(explain_json)["Execution Time"])


def vector_literal(vec) -> str:
    """Giong backend: chuoi '[x1,x2,...]' roi ep ::vector."""
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


def first_line(text: str) -> str:
    return (text or "").split("\n", 1)[0].strip()


def load_questions(path: Path) -> list[str]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return [row["question"] for row in csv.DictReader(f) if (row.get("question") or "").strip()]


def markdown_table(results: dict) -> str:
    lines = [
        "| Bảng | Chế độ | Nút quét | Server p50 / p95 (ms) | Khứ hồi p50 / p95 (ms) |",
        "|---|---|---|---|---|",
    ]
    for table, modes in results.items():
        for mode, r in modes.items():
            s, rt = r["server_execution"], r["round_trip"]
            lines.append(
                f"| {table} | {mode} | {', '.join(r['scan_nodes']) or '?'} | "
                f"{s['p50_ms']:.2f} / {s['p95_ms']:.2f} | {rt['p50_ms']:.1f} / {rt['p95_ms']:.1f} |"
            )
    return "\n".join(lines)


# --- do tren DB ------------------------------------------------------------------------------


def run_mode(conn, table: str, mode: str, vectors: list[str], repeat: int) -> dict:
    q = QUERIES[table]
    params = [{"v": v, "model": emb.MODEL_NAME} for v in vectors]
    try:
        with conn.cursor() as cur:
            for stmt in MODES[mode]:
                cur.execute(stmt)
            for p in params[:WARMUP]:
                cur.execute(q["sql"], p)
                cur.fetchall()
            cur.execute("SELECT current_setting('hnsw.ef_search', true)")
            ef_search = cur.fetchone()[0]

            nodes, server_ms = [], []
            for p in params:
                cur.execute("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + q["sql"], p)
                plan = cur.fetchone()[0]
                server_ms.append(execution_time_ms(plan))
                for n in scan_nodes(plan, table):
                    if n not in nodes:
                        nodes.append(n)

            round_trip, top_keys, rows_first = [], [], []
            for i, p in enumerate(params):
                for r in range(repeat):
                    t0 = time.perf_counter()
                    cur.execute(q["sql"], p)
                    rows = cur.fetchall()
                    round_trip.append((time.perf_counter() - t0) * 1000)
                    if r == 0:
                        top_keys.append([row[q["key_col"]] for row in rows])
                        if table == "kb_chunks" and i < SHOWN_QUESTIONS:
                            rows_first.append([(row[0], first_line(row[1]), float(row[5])) for row in rows[:3]])
    finally:
        conn.rollback()
    return {
        "settings": MODES[mode],
        "hnsw_ef_search": ef_search,
        "scan_nodes": nodes,
        "server_execution": summarize(server_ms),
        "round_trip": summarize(round_trip),
        "top_keys": top_keys,
        "_shown": rows_first,
    }


def encode_questions(questions: list[str]):
    embedder = emb.Embedder()
    embedder.encode_queries(questions[:WARMUP])  # nap mo hinh + khoi dong
    t0 = time.perf_counter()
    vectors = embedder.encode_queries(questions)
    batch_ms = (time.perf_counter() - t0) * 1000
    single = []
    for q in questions:
        t0 = time.perf_counter()
        embedder.encode_queries([q])
        single.append((time.perf_counter() - t0) * 1000)
    return vectors, {"batch_all_ms": round(batch_ms, 1), "per_question": summarize(single)}


def main(argv: list[str] | None = None, environ=None) -> int:
    import os

    environ = os.environ if environ is None else environ
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--env", choices=["staging", "production"], required=True)
    ap.add_argument("--repeat", type=int, default=DEFAULT_REPEAT, help="số lần lặp mỗi câu khi đo khứ hồi")
    ap.add_argument("--questions", type=Path, default=DEFAULT_QUESTIONS)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args(argv)
    if args.repeat < 1:
        return fail(["--repeat phải >= 1"], "tham số")

    try:
        url = prepare_url(environ.get(ENV_VAR, ""))
    except ConfigError as e:
        return fail([str(e)], "chuỗi kết nối")
    target = mask_url(url)

    questions = load_questions(args.questions)
    if len(questions) < WARMUP:
        return fail([f"chỉ có {len(questions)} câu hỏi"], "câu hỏi")
    print(f"Mã hoá {len(questions)} câu hỏi bằng {emb.MODEL_NAME} ...")
    q_vecs, encode_stats = encode_questions(questions)
    vectors = [vector_literal(v) for v in q_vecs]

    import psycopg

    print(f"Môi trường {args.env} → {target} (chỉ đọc)")
    try:
        conn = psycopg.connect(url, connect_timeout=15)
    except (psycopg.Error, UnicodeError, OSError) as e:
        return fail([redact(f"{type(e).__name__}: {e}", url)], "không kết nối được")

    conn.read_only = True
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
            row = cur.fetchone()
            pg_version = row[0] if row else None
            if pg_version is None:
                return fail(["chưa có extension vector"], "schema")
            cur.execute("SELECT count(*) FROM kb_chunks WHERE embedding IS NOT NULL AND embedding_model = %s",
                        (emb.MODEL_NAME,))
            kb_rows = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM word_embeddings WHERE model = %s", (emb.MODEL_NAME,))
            word_rows = cur.fetchone()[0]
            cur.execute("SELECT version()")
            server_version = cur.fetchone()[0].split(",")[0]
        conn.rollback()
        if not kb_rows or not word_rows:
            return fail([f"kb_chunks {kb_rows} dòng, word_embeddings {word_rows} dòng với model {emb.MODEL_NAME}"],
                        "chưa nạp vector (chạy load_vectors.py trước)")

        results = {}
        for table in QUERIES:
            results[table] = {}
            for mode in MODES:
                print(f"  đo {table} / {mode} ...")
                results[table][mode] = run_mode(conn, table, mode, vectors, args.repeat)
    finally:
        conn.rollback()
        conn.close()

    shown = results["kb_chunks"]["default"].pop("_shown")
    for modes in results.values():
        for r in modes.values():
            r.pop("_shown", None)

    recall = {}
    for table, modes in results.items():
        k = QUERIES[table]["k"]
        exact = modes["exact"]["top_keys"]
        recall[table] = {
            "k": k,
            "index_vs_exact": round(overlap_at_k(modes["index"]["top_keys"], exact, k), 4),
            "default_vs_exact": round(overlap_at_k(modes["default"]["top_keys"], exact, k), 4),
        }

    report = {
        "task": "WSEA-110",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "env": args.env,
        "target": target,
        "server": server_version,
        "pgvector_version": pg_version,
        **emb.model_info(),
        "rows": {"kb_chunks": kb_rows, "word_embeddings": word_rows},
        "n_questions": len(questions),
        "method": {
            "warmup": WARMUP,
            "repeat": args.repeat,
            "server_execution": "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON), 1 lần mỗi câu",
            "round_trip": "perf_counter quanh execute + fetchall từ máy chạy script",
            "transactions": "READ ONLY, mỗi (bảng, chế độ) một transaction, luôn rollback",
        },
        "encode": encode_stats,
        "queries": {t: {"k": q["k"], "sql": q["sql"]} for t, q in QUERIES.items()},
        "results": results,
        "ann_recall_vs_exact": recall,
        "sample_top3_kb": [{"question": q, "top3": [{"id": i, "title": t, "distance": round(d, 4)} for i, t, d in rows]}
                           for q, rows in zip(questions, shown)],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"\npgvector {pg_version} · kb_chunks {kb_rows} dòng · word_embeddings {word_rows} dòng · "
          f"hnsw.ef_search = {results['kb_chunks']['index']['hnsw_ef_search']}")
    print(f"Mã hoá câu hỏi (CPU): 1 câu p50 {encode_stats['per_question']['p50_ms']:.1f} ms, "
          f"p95 {encode_stats['per_question']['p95_ms']:.1f} ms; cả {len(questions)} câu {encode_stats['batch_all_ms']:.0f} ms\n")
    print(markdown_table(results))
    print("\n| Bảng | k | Độ khớp index vs chính xác | default vs chính xác |\n|---|---|---|---|")
    for table, r in recall.items():
        print(f"| {table} | {r['k']} | {r['index_vs_exact']:.3f} | {r['default_vs_exact']:.3f} |")
    print("\nTop-3 đoạn tri thức (chế độ default) cho 5 câu đầu:")
    for item in report["sample_top3_kb"]:
        print(f"\n{item['question']}")
        for n, t in enumerate(item["top3"], 1):
            print(f"  {n}. {t['id']} {t['title']}  (d={t['distance']:.3f})")
    print(f"\nĐã ghi {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
