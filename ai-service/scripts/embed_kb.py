"""Sinh vector cho kho tri thuc ngu phap va 7.000 tu vung (WSEA-110 buoc 3).

Moi cach ma hoa (mo hinh, revision, tien to, chuan hoa) lay tu app/services/embedder.py.

Dau ra (data/ da bi gitignore, khong commit):
  data/embeddings/kb_e5-small.npz     ids, vectors   (100 x 384, float32)
  data/embeddings/words_e5-small.npz  terms, vectors (7000 x 384, float32)
Minh chung (commit):
  docs/kb/embedding_manifest.json

Sau khi ghi file, script in kiem tra nhanh tra nguoc Viet->Anh tren 10 cau, so hai
template van ban tu vung (chi in, khong ghi file; bo qua bang --skip-check).

Chay:
  $env:PYTHONIOENCODING="utf-8"; .\\.venv\\Scripts\\python.exe scripts\\embed_kb.py
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services import embedder as emb  # noqa: E402

DEFAULT_KB = ROOT / "kb" / "grammar_chunks.jsonl"
DEFAULT_VOCAB = ROOT.parent / "backend" / "prisma" / "data" / "vocab_7000.csv"
DEFAULT_OUT_DIR = ROOT / "data" / "embeddings"
DEFAULT_MANIFEST = ROOT / "docs" / "kb" / "embedding_manifest.json"

EXPECTED_CHUNKS = 100
EXPECTED_WORDS = 7000
KB_FILE = "kb_e5-small.npz"
WORDS_FILE = "words_e5-small.npz"

KB_TEMPLATE = "{content}"
WORD_TEMPLATE_T1 = "{word} ({pos}): {meaning_vi}"
WORD_TEMPLATE_T2 = WORD_TEMPLATE_T1 + " — {example_en}"

# (cau hoi, tu dung) cho kiem tra tra nguoc Viet->Anh
REVERSE_CHECK = [
    ("biết ơn tiếng Anh là gì", "grateful"),
    ("từ nào nghĩa là môi trường", "environment"),
    ("cải thiện nói thế nào", "improve"),
    ("người hàng xóm tiếng Anh", "neighbor"),
    ("trung thực dịch sang tiếng Anh", "honest"),
    ("tức giận là từ gì", "angry"),
    ("cuộc hành trình", "journey"),
    ("nhà bếp tiếng anh", "kitchen"),
    ("mượn tiền thì dùng từ gì", "borrow"),
    ("giá rẻ tiếng Anh", "cheap"),
]


# --- doc va kiem du lieu ---------------------------------------------------------------


def load_kb(path: Path) -> tuple[list[dict], list[str]]:
    rows, errors, seen = [], [], set()
    with path.open(encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as e:
                errors.append(f"dòng {n}: JSON hỏng ({e})")
                continue
            cid = str(row.get("id") or "").strip()
            if not cid:
                errors.append(f"dòng {n}: thiếu id")
            elif cid in seen:
                errors.append(f"dòng {n}: trùng id {cid}")
            seen.add(cid)
            if not str(row.get("content") or "").strip():
                errors.append(f"dòng {n} ({cid}): content rỗng")
            rows.append(row)
    if len(rows) != EXPECTED_CHUNKS:
        errors.append(f"có {len(rows)} đoạn, cần đúng {EXPECTED_CHUNKS}")
    return rows, errors


def load_vocab(path: Path) -> tuple[list[dict], list[str]]:
    errors, seen = [], {}
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        missing = {"word", "pos", "meaning_vi", "example_en"} - set(reader.fieldnames or [])
        if missing:
            return [], [f"thiếu cột: {', '.join(sorted(missing))}"]
        rows = list(reader)
    for n, row in enumerate(rows, 2):  # dong 1 la header
        word = (row.get("word") or "").strip()
        for col in ("word", "pos", "meaning_vi"):
            if not (row.get(col) or "").strip():
                errors.append(f"dòng {n} ({word or '?'}): {col} rỗng")
        if word:
            if word in seen:
                errors.append(f"dòng {n}: trùng term '{word}' (đã có ở dòng {seen[word]})")
            else:
                seen[word] = n
    if len(rows) != EXPECTED_WORDS:
        errors.append(f"có {len(rows)} từ, cần đúng {EXPECTED_WORDS}")
    return rows, errors


def word_text_t2(row: dict) -> str:
    base = emb.word_text(row["word"].strip(), row["pos"].strip(), row["meaning_vi"].strip())
    example = (row.get("example_en") or "").strip()
    return f"{base} — {example}" if example else base


# --- tien ich ------------------------------------------------------------------------


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT.parent).as_posix()
    except ValueError:
        return str(path)


def versions() -> dict:
    out = {"python": platform.python_version(), "platform": platform.platform()}
    for mod in ("torch", "sentence_transformers", "transformers", "numpy"):
        try:
            out[mod] = __import__(mod).__version__
        except Exception:  # noqa: BLE001
            out[mod] = None
    return out


def timed(fn, *args):
    t0 = time.perf_counter()
    result = fn(*args)
    return result, time.perf_counter() - t0


def top_terms(q_vec: np.ndarray, vectors: np.ndarray, terms: list[str], k: int = 3):
    scores = vectors @ q_vec
    idx = np.argsort(-scores)[:k]
    return [(terms[i], float(scores[i])) for i in idx]


def reverse_check(embedder: emb.Embedder, vocab: list[dict], t1_vectors: np.ndarray) -> None:
    terms = [r["word"].strip() for r in vocab]
    known = set(terms)
    print("\n== Kiểm tra tra ngược Việt→Anh (chỉ in, không ghi file) ==")
    absent = [g for _, g in REVERSE_CHECK if g not in known]
    if absent:
        print(f"CẢNH BÁO: từ đích không có trong vocab: {', '.join(absent)}")

    t2_vectors, t2_secs = timed(embedder.encode_passages, [word_text_t2(r) for r in vocab])
    print(f"(mã hoá {len(vocab)} từ theo T2 mất {t2_secs:.1f} s)")
    q_vecs = embedder.encode_queries([q for q, _ in REVERSE_CHECK])

    score = {"T1": [0, 0], "T2": [0, 0]}
    for (question, gold), qv in zip(REVERSE_CHECK, q_vecs):
        print(f"\n{question}  →  {gold}")
        for name, vecs in (("T1", t1_vectors), ("T2", t2_vectors)):
            top = top_terms(qv, vecs, terms)
            ids = [t for t, _ in top]
            score[name][0] += ids[0] == gold
            score[name][1] += gold in ids
            mark = "✓" if ids[0] == gold else ("~" if gold in ids else "✗")
            shown = ", ".join(f"{t} {s:.3f}" for t, s in top)
            print(f"  {name} {mark} {shown}")

    n = len(REVERSE_CHECK)
    print("\nTemplate | top-1 | top-3")
    for name in ("T1", "T2"):
        print(f"{name}       | {score[name][0]}/{n}  | {score[name][1]}/{n}")


# --- chuong trinh chinh --------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kb", type=Path, default=DEFAULT_KB)
    ap.add_argument("--vocab", type=Path, default=DEFAULT_VOCAB)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    ap.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    ap.add_argument("--skip-check", action="store_true", help="bỏ kiểm tra tra ngược 10 câu")
    args = ap.parse_args(argv)

    chunks, kb_errors = load_kb(args.kb)
    vocab, vocab_errors = load_vocab(args.vocab)
    if kb_errors or vocab_errors:
        for label, path, errs in (("kb", args.kb, kb_errors), ("vocab", args.vocab, vocab_errors)):
            if errs:
                print(f"LỖI dữ liệu {label} ({len(errs)}) trong {path}:")
                for e in errs[:30]:
                    print(f"  {e}")
        return 1

    embedder = emb.Embedder()
    _, load_secs = timed(lambda: embedder.model)

    ids = [str(c["id"]).strip() for c in chunks]
    kb_vectors, kb_secs = timed(embedder.encode_passages, [c["content"] for c in chunks])

    terms = [r["word"].strip() for r in vocab]
    word_texts = [emb.word_text(r["word"].strip(), r["pos"].strip(), r["meaning_vi"].strip()) for r in vocab]
    word_vectors, word_secs = timed(embedder.encode_passages, word_texts)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    kb_out, words_out = args.out_dir / KB_FILE, args.out_dir / WORDS_FILE
    np.savez(kb_out, ids=np.array(ids), vectors=kb_vectors)
    np.savez(words_out, terms=np.array(terms), vectors=word_vectors)

    manifest = {
        "task": "WSEA-110",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        **emb.model_info(),
        "normalize": "L2 (normalize_embeddings=True), điểm = tích vô hướng",
        "dtype": "float32",
        "inputs": {
            "kb": {"path": rel(args.kb), "rows": len(chunks), "sha256": sha256(args.kb)},
            "vocab": {"path": rel(args.vocab), "rows": len(vocab), "sha256": sha256(args.vocab)},
        },
        "templates": {
            "kb": emb.PASSAGE_PREFIX + KB_TEMPLATE,
            "word": emb.PASSAGE_PREFIX + WORD_TEMPLATE_T1,
            "query": emb.QUERY_PREFIX + "{question}",
        },
        "outputs": {
            "kb": {"file": KB_FILE, "keys": ["ids", "vectors"], "shape": list(kb_vectors.shape),
                   "sha256": sha256(kb_out)},
            "words": {"file": WORDS_FILE, "keys": ["terms", "vectors"], "shape": list(word_vectors.shape),
                      "sha256": sha256(words_out)},
        },
        "timing_seconds": {
            "model_load": round(load_secs, 2),
            "encode_kb": round(kb_secs, 2),
            "encode_words": round(word_secs, 2),
        },
        "environment": versions(),
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Mô hình {emb.MODEL_NAME}@{emb.MODEL_REVISION[:12]} (nạp {load_secs:.1f} s)")
    print(f"Đoạn tri thức: {kb_vectors.shape[0]} vector x {kb_vectors.shape[1]} chiều, {kb_secs:.1f} s -> {rel(kb_out)}")
    print(f"Từ vựng:       {word_vectors.shape[0]} vector x {word_vectors.shape[1]} chiều, {word_secs:.1f} s -> {rel(words_out)}")
    print(f"Manifest: {rel(args.manifest)}")

    if not args.skip_check:
        reverse_check(embedder, vocab, word_vectors)
    return 0


if __name__ == "__main__":
    sys.exit(main())
