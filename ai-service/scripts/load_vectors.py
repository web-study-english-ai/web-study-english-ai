"""Nap vector kho tri thuc va tu vung vao pgvector cua mot moi truong (WSEA-110 buoc 4).

Dau vao (sinh boi scripts/embed_kb.py):
  data/embeddings/kb_e5-small.npz, data/embeddings/words_e5-small.npz,
  docs/kb/embedding_manifest.json, kb/grammar_chunks.jsonl
Dich: bang kb_chunks va word_embeddings (vector(384)) cua DB moi truong do.

Chuoi ket noi CHI lay tu bien moi truong KB_DATABASE_URL; script khong doc .env va
khong bao gio in chuoi nay (chi in host va ten db).

Chay (PowerShell):
  $env:KB_DATABASE_URL = "postgresql://..."      # dat trong phien, khong luu file
  .\\.venv\\Scripts\\python.exe scripts\\load_vectors.py --env staging --dry-run
  .\\.venv\\Scripts\\python.exe scripts\\load_vectors.py --env staging
  .\\.venv\\Scripts\\python.exe scripts\\load_vectors.py --env production --confirm-production

Ma thoat: 0 ok · 1 loi cau hinh/du lieu/schema (chua ghi gi) · 2 da ghi nhung kiem cheo lech.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services import embedder as emb  # noqa: E402

ENV_VAR = "KB_DATABASE_URL"
TRANSACTION_POOLER_PORT = 6543
BATCH_SIZE = 500
CROSS_CHECK_QUESTIONS = 3
TOP_K = 3
MISSING_SHOWN = 10

DEFAULT_KB_JSONL = ROOT / "kb" / "grammar_chunks.jsonl"
DEFAULT_KB_NPZ = ROOT / "data" / "embeddings" / "kb_e5-small.npz"
DEFAULT_WORDS_NPZ = ROOT / "data" / "embeddings" / "words_e5-small.npz"
DEFAULT_MANIFEST = ROOT / "docs" / "kb" / "embedding_manifest.json"
DEFAULT_QUESTIONS = ROOT / "kb" / "eval_questions.csv"

EXPECTED_TYPE = f"vector({emb.DIM})"
# (bang, cot) -> kieu mong doi; None nghia la chi can cot ton tai
REQUIRED_COLUMNS = {
    ("kb_chunks", "embedding"): EXPECTED_TYPE,
    ("kb_chunks", "embedding_model"): None,
    ("word_embeddings", "embedding"): EXPECTED_TYPE,
    ("word_embeddings", "model"): None,
    ("words", "term"): None,
}

KB_UPSERT = """
INSERT INTO kb_chunks (id, content, source, topic, cefr, embedding, embedding_model)
VALUES (%s, %s, %s, %s, %s::"CefrLevel", %s, %s)
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  source = EXCLUDED.source,
  topic = EXCLUDED.topic,
  cefr = EXCLUDED.cefr,
  embedding = EXCLUDED.embedding,
  embedding_model = EXCLUDED.embedding_model
"""

WORD_UPSERT = """
INSERT INTO word_embeddings (word_id, embedding, model, updated_at)
VALUES (%s, %s, %s, now())
ON CONFLICT (word_id) DO UPDATE SET
  embedding = EXCLUDED.embedding,
  model = EXCLUDED.model,
  updated_at = now()
"""


class ConfigError(Exception):
    """Loi cau hinh/du lieu phat hien truoc khi ghi DB."""


# --- chuoi ket noi (ham thuan) ----------------------------------------------------------


def prepare_url(url: str) -> str:
    """Kiem tra URL va them sslmode=require neu thieu. Khong dua URL vao thong bao loi."""
    url = (url or "").strip()
    if not url:
        raise ConfigError(f"chưa đặt biến môi trường {ENV_VAR}")
    parts = urlsplit(url)
    if parts.scheme not in ("postgres", "postgresql"):
        raise ConfigError(f"{ENV_VAR} phải có dạng postgresql://user:pass@host:port/db")
    try:
        port = parts.port
    except ValueError:
        raise ConfigError(f"{ENV_VAR} có cổng không hợp lệ") from None
    if not parts.hostname:
        raise ConfigError(f"{ENV_VAR} thiếu host")
    if port == TRANSACTION_POOLER_PORT:
        raise ConfigError(
            f"cổng {TRANSACTION_POOLER_PORT} là transaction pooler, không hợp prepared statement; "
            "dùng kết nối trực tiếp hoặc session pooler (cổng 5432)"
        )
    query = parse_qsl(parts.query, keep_blank_values=True)
    if not any(k == "sslmode" for k, _ in query):
        query.append(("sslmode", "require"))
    return urlunsplit(parts._replace(query=urlencode(query)))


def mask_url(url: str) -> str:
    """Chi giu host:port/db, bo user, mat khau va tham so."""
    parts = urlsplit(url)
    try:
        port = parts.port
    except ValueError:
        port = None
    host = parts.hostname or "?"
    db = parts.path.lstrip("/") or "?"
    return f"{host}:{port}/{db}" if port else f"{host}/{db}"


def redact(text: str, url: str) -> str:
    """Xoa mat khau (va ca URL) khoi thong bao loi cua driver truoc khi in."""
    parts = urlsplit(url)
    for secret in (url, parts.password):
        if secret:
            text = text.replace(secret, "***")
    return text


# --- du lieu (ham thuan) ---------------------------------------------------------------------


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def batched(items: list, size: int = BATCH_SIZE):
    if size < 1:
        raise ValueError("size phải >= 1")
    for i in range(0, len(items), size):
        yield items[i : i + size]


def verify_manifest(manifest: dict, kb_jsonl: Path, kb_npz: Path, words_npz: Path) -> list[str]:
    """sha256 3 file khop manifest va model/revision/dim khop embedder.py."""
    errors = []
    for key, const in (("model", emb.MODEL_NAME), ("revision", emb.MODEL_REVISION), ("dim", emb.DIM)):
        if manifest.get(key) != const:
            errors.append(f"manifest {key}={manifest.get(key)!r} khác embedder.py ({const!r})")
    expected = {
        kb_jsonl: manifest.get("inputs", {}).get("kb", {}).get("sha256"),
        kb_npz: manifest.get("outputs", {}).get("kb", {}).get("sha256"),
        words_npz: manifest.get("outputs", {}).get("words", {}).get("sha256"),
    }
    for path, want in expected.items():
        if not path.exists():
            errors.append(f"không có file {path}")
        elif not want:
            errors.append(f"manifest không ghi sha256 cho {path.name}")
        elif sha256(path) != want:
            errors.append(f"sha256 của {path.name} lệch manifest: vector không khớp nội dung, chạy lại embed_kb.py")
    return errors


def load_chunks(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def check_npz(ids: list[str], vectors: np.ndarray, label: str) -> list[str]:
    errors = []
    if len(set(ids)) != len(ids):
        errors.append(f"{label}: có khoá trùng trong file .npz")
    if vectors.shape != (len(ids), emb.DIM):
        errors.append(f"{label}: vectors shape {vectors.shape}, cần ({len(ids)}, {emb.DIM})")
    else:
        try:
            emb.check_vectors(vectors)
        except ValueError as e:
            errors.append(f"{label}: {e}")
    return errors


def match_chunks(chunks: list[dict], npz_ids: list[str]) -> list[str]:
    file_ids = [str(c["id"]) for c in chunks]
    errors = []
    if set(file_ids) != set(npz_ids):
        only_jsonl = sorted(set(file_ids) - set(npz_ids))
        only_npz = sorted(set(npz_ids) - set(file_ids))
        errors.append(f"id jsonl và kb .npz khác nhau (chỉ jsonl: {only_jsonl[:5]}, chỉ npz: {only_npz[:5]})")
    return errors


def map_terms(terms: list[str], db_rows: list[tuple[str, str]]) -> tuple[list[tuple[str, int]], list[str]]:
    """Anh xa term trong .npz -> word_id trong DB.

    Tra (danh sach (word_id, chi so dong vector), danh sach term khong co trong DB),
    giu thu tu cua file.
    """
    by_term = {emb.normalize_term(term): wid for wid, term in db_rows}
    pairs, missing = [], []
    for i, term in enumerate(terms):
        wid = by_term.get(emb.normalize_term(term))
        if wid is None:
            missing.append(term)
        else:
            pairs.append((wid, i))
    return pairs, missing


def schema_errors(has_extension: bool, column_types: dict[tuple[str, str], str | None]) -> list[str]:
    """column_types: (bang, cot) -> format_type, hoac None neu khong co cot."""
    if not has_extension:
        return ["chưa có extension vector trong DB"]
    errors = []
    for (table, column), want in REQUIRED_COLUMNS.items():
        got = column_types.get((table, column))
        if got is None:
            errors.append(f"thiếu cột {table}.{column}")
        elif want is not None and got != want:
            errors.append(f"{table}.{column} là {got}, cần {want}")
    if errors:
        errors.append("→ chưa áp migration 384")
    return errors


def numpy_top_ids(q_vec: np.ndarray, vectors: np.ndarray, ids: list[str], k: int = TOP_K) -> list[str]:
    scores = vectors @ q_vec
    return [ids[i] for i in np.argsort(-scores, kind="stable")[:k]]


def load_first_questions(path: Path, n: int = CROSS_CHECK_QUESTIONS) -> list[str]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return [row["question"] for row, _ in zip(csv.DictReader(f), range(n))]


# --- phan cham DB -------------------------------------------------------------------------


def read_schema(conn) -> tuple[str | None, dict]:
    with conn.cursor() as cur:
        cur.execute("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
        row = cur.fetchone()
        version = row[0] if row else None
        types = {}
        for table, column in REQUIRED_COLUMNS:
            cur.execute(
                """SELECT format_type(atttypid, atttypmod) FROM pg_attribute
                   WHERE attrelid = to_regclass(%s) AND attname = %s AND NOT attisdropped""",
                (table, column),
            )
            r = cur.fetchone()
            types[(table, column)] = r[0] if r else None
    return version, types


def upsert(conn, chunks, kb_vecs_by_id, word_pairs, word_vectors, prune_ids):
    with conn.transaction(), conn.cursor() as cur:
        kb_rows = [
            (c["id"], c["content"], c["source"], c.get("topic"), c.get("cefr"), kb_vecs_by_id[c["id"]], emb.MODEL_NAME)
            for c in chunks
        ]
        for batch in batched(kb_rows):
            cur.executemany(KB_UPSERT, batch)
        word_rows = [(wid, word_vectors[i], emb.MODEL_NAME) for wid, i in word_pairs]
        for batch in batched(word_rows):
            cur.executemany(WORD_UPSERT, batch)
        if prune_ids:
            cur.execute("DELETE FROM kb_chunks WHERE id = ANY(%s)", (prune_ids,))


def final_counts(conn) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM kb_chunks")
        kb_total = cur.fetchone()[0]
        cur.execute(
            "SELECT count(*) FROM kb_chunks WHERE embedding IS NOT NULL AND embedding_model = %s",
            (emb.MODEL_NAME,),
        )
        kb_ok = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM word_embeddings")
        we_total = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM word_embeddings WHERE model = %s", (emb.MODEL_NAME,))
        we_ok = cur.fetchone()[0]
    return {"kb_chunks_total": kb_total, "kb_chunks_with_model": kb_ok,
            "word_embeddings_total": we_total, "word_embeddings_with_model": we_ok}


def cross_check(conn, questions, kb_ids, kb_vectors) -> list[dict]:
    q_vecs = emb.Embedder().encode_queries(questions)
    results = []
    # Tat index de so sanh voi tim kiem chinh xac (HNSW/IVFFlat la xap xi).
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("SET LOCAL enable_indexscan = off")
        cur.execute("SET LOCAL enable_bitmapscan = off")
        for question, qv in zip(questions, q_vecs):
            cur.execute(
                """SELECT id FROM kb_chunks WHERE embedding_model = %s AND embedding IS NOT NULL
                   ORDER BY embedding <=> %s::vector LIMIT %s""",
                (emb.MODEL_NAME, qv, TOP_K),
            )
            sql_ids = [r[0] for r in cur.fetchall()]
            np_ids = numpy_top_ids(qv, kb_vectors, kb_ids)
            results.append({"question": question, "sql_top3": sql_ids, "numpy_top3": np_ids,
                            "match": sql_ids == np_ids})
    return results


# --- chuong trinh chinh -----------------------------------------------------------------


def parse_args(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--env", choices=["staging", "production"], required=True)
    ap.add_argument("--confirm-production", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="kết nối + kiểm tra, không ghi DB, không ghi report")
    ap.add_argument("--prune", action="store_true", help="xoá kb_chunks có trong DB mà không có trong file")
    ap.add_argument("--kb-jsonl", type=Path, default=DEFAULT_KB_JSONL)
    ap.add_argument("--kb-npz", type=Path, default=DEFAULT_KB_NPZ)
    ap.add_argument("--words-npz", type=Path, default=DEFAULT_WORDS_NPZ)
    ap.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    ap.add_argument("--questions", type=Path, default=DEFAULT_QUESTIONS)
    ap.add_argument("--report", type=Path, default=None, help="mặc định docs/kb/load_report_<env>.json")
    return ap.parse_args(argv)


def fail(errors: list[str], title: str) -> int:
    print(f"DỪNG — {title}:")
    for e in errors:
        print(f"  {e}")
    return 1


def main(argv: list[str] | None = None, environ=os.environ) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args(argv)
    if args.env == "production" and not args.confirm_production:
        return fail(["--env production cần thêm --confirm-production"], "chưa xác nhận production")

    try:
        url = prepare_url(environ.get(ENV_VAR, ""))
    except ConfigError as e:
        return fail([str(e)], "chuỗi kết nối")
    target = mask_url(url)

    # 1) Kiem file truoc khi cham DB
    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return fail([f"không đọc được manifest {args.manifest}: {e}"], "manifest")
    errors = verify_manifest(manifest, args.kb_jsonl, args.kb_npz, args.words_npz)
    if errors:
        return fail(errors, "file đầu vào không khớp manifest")
    chunks = load_chunks(args.kb_jsonl)
    kb_npz, words_npz = np.load(args.kb_npz), np.load(args.words_npz)
    kb_ids = [str(x) for x in kb_npz["ids"]]
    kb_vectors = kb_npz["vectors"].astype(np.float32)
    terms = [str(x) for x in words_npz["terms"]]
    word_vectors = words_npz["vectors"].astype(np.float32)
    errors = (check_npz(kb_ids, kb_vectors, "kb") + check_npz(terms, word_vectors, "words")
              + match_chunks(chunks, kb_ids))
    if errors:
        return fail(errors, "file vector")
    kb_vecs_by_id = dict(zip(kb_ids, kb_vectors))

    # 2) Ket noi + kiem schema
    import psycopg
    from pgvector.psycopg import register_vector

    print(f"Môi trường {args.env} → {target}{' (dry-run)' if args.dry_run else ''}")
    try:
        conn = psycopg.connect(url, connect_timeout=15)
    except (psycopg.Error, UnicodeError, OSError) as e:
        # UnicodeError: host sai dang 'aws-....pooler' (nhan rong) -> bao gon thay vi traceback
        return fail([redact(f"{type(e).__name__}: {e}", url),
                     "kiểm tra lại host/mật khẩu trong KB_DATABASE_URL (Supabase → Connect → Session pooler)"],
                    "không kết nối được")

    with conn:
        pg_version, types = read_schema(conn)
        conn.rollback()
        errors = schema_errors(pg_version is not None, types)
        if errors:
            return fail(errors, "schema DB chưa đúng")
        register_vector(conn)

        with conn.cursor() as cur:
            cur.execute("SELECT id, term FROM words")
            db_words = cur.fetchall()
            cur.execute("SELECT id FROM kb_chunks")
            db_kb_ids = {r[0] for r in cur.fetchall()}
            cur.execute("SELECT word_id FROM word_embeddings")
            db_we_ids = {r[0] for r in cur.fetchall()}
        conn.rollback()

        word_pairs, missing = map_terms(terms, db_words)
        file_ids = [c["id"] for c in chunks]
        extra_ids = sorted(db_kb_ids - set(file_ids))
        planned = {
            "kb_chunks": {"insert": len(set(file_ids) - db_kb_ids), "update": len(set(file_ids) & db_kb_ids),
                          "delete": len(extra_ids) if args.prune else 0},
            "word_embeddings": {"insert": sum(wid not in db_we_ids for wid, _ in word_pairs),
                                "update": sum(wid in db_we_ids for wid, _ in word_pairs)},
        }
        print(f"pgvector {pg_version}; schema OK (vector({emb.DIM}))")
        print(f"kb_chunks: chèn {planned['kb_chunks']['insert']}, cập nhật {planned['kb_chunks']['update']}"
              + (f", xoá {planned['kb_chunks']['delete']}" if args.prune else ""))
        print(f"word_embeddings: chèn {planned['word_embeddings']['insert']}, "
              f"cập nhật {planned['word_embeddings']['update']} (khớp {len(word_pairs)}/{len(terms)} từ)")
        if missing:
            print(f"CẢNH BÁO: {len(missing)} từ không có trong bảng words, 10 từ đầu: {', '.join(missing[:MISSING_SHOWN])}")
        if extra_ids:
            action = "sẽ xoá (--prune)" if args.prune else "giữ nguyên (thêm --prune để xoá)"
            print(f"CẢNH BÁO: {len(extra_ids)} id có trong DB mà không có trong file, {action}: {extra_ids[:10]}")

        if args.dry_run:
            print("Dry-run: không ghi gì.")
            return 0

        # 3) Ghi trong MOT transaction
        upsert(conn, chunks, kb_vecs_by_id, word_pairs, word_vectors, extra_ids if args.prune else [])
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("ANALYZE kb_chunks")
            cur.execute("ANALYZE word_embeddings")
        conn.autocommit = False
        counts = final_counts(conn)
        conn.rollback()
        print(f"Sau khi ghi: {counts}")

        # 4) Kiem cheo SQL vs numpy
        checks = cross_check(conn, load_first_questions(args.questions), kb_ids, kb_vectors)
        for c in checks:
            mark = "✓" if c["match"] else "✗"
            print(f"  {mark} {c['question'][:60]}: SQL {c['sql_top3']} | numpy {c['numpy_top3']}")

    report = {
        "task": "WSEA-110",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "env": args.env,
        "target": target,
        "pgvector_version": pg_version,
        **emb.model_info(),
        "manifest_created_at": manifest.get("created_at"),
        "rows": planned,
        "final_counts": counts,
        "missing_words": {"count": len(missing), "first": missing[:50]},
        "extra_kb_ids": {"count": len(extra_ids), "ids": extra_ids, "pruned": bool(args.prune)},
        "cross_check": {"all_match": all(c["match"] for c in checks), "questions": checks},
    }
    report_path = args.report or ROOT / "docs" / "kb" / f"load_report_{args.env}.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Report: {report_path}")
    if not report["cross_check"]["all_match"]:
        print("LỖI: top-3 SQL và numpy lệch nhau.")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
