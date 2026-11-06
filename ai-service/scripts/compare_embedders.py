"""So sanh mo hinh sinh vector cho kho tri thuc ngu phap (WSEA-110).

    $env:PYTHONIOENCODING="utf-8"; .\\.venv\\Scripts\\python.exe scripts\\compare_embedders.py

Doc kb/grammar_chunks.jsonl + kb/eval_questions.csv (qid,question,gold_ids,lang; gold_ids ngan bang |).
Kiem tra du lieu truoc; sai thi in loi va exit 1. Moi mo hinh: Recall@1/3/5, MRR@10 (tach theo lang),
so chieu, so tham so, revision, thoi gian ma hoa kho, do tre ma hoa 1 cau hoi. Ghi
docs/kb/embedder_comparison.json va in bang markdown.

Ham tinh chi so khong phu thuoc mo hinh, test o tests/test_compare_embedders.py.
"""

from __future__ import annotations

import argparse
import csv
import json
import platform
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KB_DIR = ROOT / "kb"

MODELS = [
    {"name": "intfloat/multilingual-e5-small", "query_prefix": "query: ", "passage_prefix": "passage: "},
    {"name": "intfloat/multilingual-e5-base", "query_prefix": "query: ", "passage_prefix": "passage: "},
    {"name": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", "query_prefix": "", "passage_prefix": ""},
]
KS = (1, 3, 5)
MRR_K = 10
WARMUP = 3
LATENCY_SAMPLES = 30
TOP_SHOWN = 3


# --- Doc va kiem du lieu ------------------------------------------------------


def load_chunks(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def load_questions(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r["qid"] = (r.get("qid") or "").strip()
        r["question"] = (r.get("question") or "").strip()
        r["lang"] = (r.get("lang") or "").strip()
        r["gold"] = [g.strip() for g in (r.get("gold_ids") or "").split("|") if g.strip()]
    return rows


def validate_questions(questions: list[dict], chunk_ids: set[str]) -> list[str]:
    """Tra danh sach loi; rong la hop le."""
    errors = []
    if not questions:
        errors.append("không có câu hỏi nào")
    seen: set[str] = set()
    for i, q in enumerate(questions, 2):  # dong 1 la header
        where = q["qid"] or f"dòng {i}"
        if not q["qid"]:
            errors.append(f"dòng {i}: thiếu qid")
        elif q["qid"] in seen:
            errors.append(f"{where}: trùng qid")
        seen.add(q["qid"])
        if not q["question"]:
            errors.append(f"{where}: câu hỏi rỗng")
        if not q["gold"]:
            errors.append(f"{where}: không có gold_ids")
        for g in q["gold"]:
            if g not in chunk_ids:
                errors.append(f"{where}: gold_id '{g}' không có trong grammar_chunks.jsonl")
    return errors


# --- Chi so truy hoi (thuan, de test) ------------------------------------------


def hit_at_k(ranked: list[str], gold: set[str], k: int) -> float:
    """1 neu co it nhat mot gold trong top-k, nguoc lai 0."""
    return 1.0 if any(doc in gold for doc in ranked[:k]) else 0.0


def reciprocal_rank(ranked: list[str], gold: set[str], k: int = MRR_K) -> float:
    """1/hang cua gold dau tien trong top-k (hang tinh tu 1); 0 neu khong co."""
    for i, doc in enumerate(ranked[:k], 1):
        if doc in gold:
            return 1.0 / i
    return 0.0


def first_gold_rank(ranked: list[str], gold: set[str]) -> int | None:
    for i, doc in enumerate(ranked, 1):
        if doc in gold:
            return i
    return None


def aggregate(results: list[dict], ks=KS, mrr_k: int = MRR_K) -> dict:
    """results: [{'ranked': [...], 'gold': [...], 'lang': ...}] -> chi so trung binh."""
    def summary(rows):
        n = len(rows)
        out = {"n": n}
        for k in ks:
            out[f"recall@{k}"] = sum(hit_at_k(r["ranked"], set(r["gold"]), k) for r in rows) / n if n else None
        out[f"mrr@{mrr_k}"] = sum(reciprocal_rank(r["ranked"], set(r["gold"]), mrr_k) for r in rows) / n if n else None
        return out

    by_lang = {}
    for lang in sorted({r["lang"] for r in results}):
        by_lang[lang] = summary([r for r in results if r["lang"] == lang])
    return {"overall": summary(results), "by_lang": by_lang}


def percentile(values: list[float], p: float) -> float:
    """Phan vi noi suy tuyen tinh (giong numpy mac dinh)."""
    xs = sorted(values)
    if not xs:
        raise ValueError("danh sách rỗng")
    pos = (len(xs) - 1) * p / 100
    lo = int(pos)
    hi = min(lo + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)


# --- Chay mo hinh ---------------------------------------------------------------


def model_revision(name: str) -> str | None:
    try:
        from huggingface_hub import HfApi
        return HfApi().model_info(name).sha
    except Exception as e:  # noqa: BLE001 - mat mang thi van chay, ghi None
        print(f"  ! không lấy được revision của {name}: {e}")
        return None


def evaluate_model(cfg: dict, chunks: list[dict], questions: list[dict]) -> dict:
    import torch
    from sentence_transformers import SentenceTransformer

    name = cfg["name"]
    print(f"\n== {name}")
    model = SentenceTransformer(name, device="cpu")
    model.eval()
    revision = model_revision(name)
    # sentence-transformers 6.x doi ten; giu ten cu de chay duoc ca ban 5.x
    dim = (getattr(model, "get_embedding_dimension", None) or model.get_sentence_embedding_dimension)()
    n_params = sum(p.numel() for p in model.parameters())
    max_len = model.max_seq_length

    passages = [cfg["passage_prefix"] + c["content"] for c in chunks]
    ids = [c["id"] for c in chunks]

    # Dem token bang tokenizer cua chinh mo hinh (gom token dac biet). Tat canh bao "longer than
    # maximum" cua transformers: day chinh la dieu ta dang do va tu bao ben duoi.
    from transformers.utils import logging as hf_logging
    old_level = hf_logging.get_verbosity()
    hf_logging.set_verbosity_error()
    tok = model.tokenizer
    token_counts = {cid: len(tok(p, add_special_tokens=True)["input_ids"]) for cid, p in zip(ids, passages)}
    hf_logging.set_verbosity(old_level)
    too_long = {cid: n for cid, n in token_counts.items() if n > max_len}
    if too_long:
        shown = ", ".join(list(too_long)[:5]) + (" ..." if len(too_long) > 5 else "")
        print(f"  ! CẢNH BÁO: {len(too_long)}/{len(ids)} đoạn vượt max_seq_length {max_len} "
              f"(token max {max(token_counts.values())}), phần thừa bị cắt khi mã hoá: {shown}")

    with torch.inference_mode():
        model.encode(passages[:2], normalize_embeddings=True)  # nap luoi tinh toan truoc khi do
        t0 = time.perf_counter()
        p_emb = model.encode(passages, normalize_embeddings=True, batch_size=32, convert_to_tensor=True)
        encode_s = time.perf_counter() - t0

        queries = [cfg["query_prefix"] + q["question"] for q in questions]
        q_emb = model.encode(queries, normalize_embeddings=True, batch_size=32, convert_to_tensor=True)

        # Do tre 1 cau hoi: batch 1, warm-up 3 lan, 30 mau (lap lai bo cau hoi neu it hon 30)
        for i in range(WARMUP):
            model.encode([queries[i % len(queries)]], normalize_embeddings=True, batch_size=1)
        lat_ms = []
        for i in range(LATENCY_SAMPLES):
            t = time.perf_counter()
            model.encode([queries[i % len(queries)]], normalize_embeddings=True, batch_size=1)
            lat_ms.append((time.perf_counter() - t) * 1000)

    scores = (q_emb @ p_emb.T).cpu()  # da chuan hoa -> tich vo huong = cosine
    results, misses = [], []
    for qi, q in enumerate(questions):
        order = scores[qi].argsort(descending=True).tolist()
        ranked = [ids[j] for j in order]
        results.append({"ranked": ranked[:MRR_K], "gold": q["gold"], "lang": q["lang"]})
        gold = set(q["gold"])
        if not hit_at_k(ranked, gold, 1):
            misses.append({
                "qid": q["qid"], "lang": q["lang"], "question": q["question"], "gold": q["gold"],
                "first_gold_rank": first_gold_rank(ranked, gold),
                "top3": [{"id": ids[j], "score": round(float(scores[qi, j]), 4)} for j in order[:TOP_SHOWN]],
            })

    metrics = aggregate(results)
    out = {
        "name": name,
        "revision": revision,
        "query_prefix": cfg["query_prefix"],
        "passage_prefix": cfg["passage_prefix"],
        "dim": dim,
        "params": n_params,
        "max_seq_length": max_len,
        "passage_tokens_max": max(token_counts.values()),
        "passages_over_max_seq_length": too_long,
        "encode_100_passages_s": round(encode_s, 3),
        "query_latency_ms": {
            "p50": round(percentile(lat_ms, 50), 2),
            "p95": round(percentile(lat_ms, 95), 2),
            "samples": len(lat_ms),
            "distinct_questions": min(len(queries), LATENCY_SAMPLES),
        },
        "metrics": metrics,
        "misses_at_1": misses,
    }
    del model
    return out


# --- Dau ra ----------------------------------------------------------------------


def fmt(x, digits=3):
    return "—" if x is None else f"{x:.{digits}f}"


def markdown_tables(models: list[dict]) -> str:
    lines = [
        "| Mô hình | Chiều | Tham số | R@1 | R@3 | R@5 | MRR@10 | Mã hoá 100 đoạn (s) | 1 câu hỏi p50 / p95 (ms) | Token max / giới hạn |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for m in models:
        o = m["metrics"]["overall"]
        lat = m["query_latency_ms"]
        lines.append(
            f"| {m['name'].split('/')[-1]} | {m['dim']} | {m['params'] / 1e6:.0f}M | {fmt(o['recall@1'])} | "
            f"{fmt(o['recall@3'])} | {fmt(o['recall@5'])} | {fmt(o['mrr@10'])} | {m['encode_100_passages_s']:.2f} | "
            f"{lat['p50']:.1f} / {lat['p95']:.1f} | {m['passage_tokens_max']} / {m['max_seq_length']} |"
        )
    langs = sorted({lang for m in models for lang in m["metrics"]["by_lang"]})
    lines += ["", "Theo ngôn ngữ câu hỏi (R@1 / R@3 / R@5 / MRR@10):", "",
              "| Mô hình | " + " | ".join(f"{lang} (n={models[0]['metrics']['by_lang'].get(lang, {}).get('n', 0)})" for lang in langs) + " |",
              "|---|" + "---|" * len(langs)]
    for m in models:
        cells = []
        for lang in langs:
            s = m["metrics"]["by_lang"].get(lang)
            cells.append("—" if not s else
                         f"{fmt(s['recall@1'], 2)} / {fmt(s['recall@3'], 2)} / {fmt(s['recall@5'], 2)} / {fmt(s['mrr@10'], 2)}")
        lines.append(f"| {m['name'].split('/')[-1]} | " + " | ".join(cells) + " |")
    return "\n".join(lines)


def environment() -> dict:
    import sentence_transformers
    import torch
    import transformers
    return {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "processor": platform.processor(),
        "torch": torch.__version__,
        "torch_threads": torch.get_num_threads(),
        "sentence_transformers": sentence_transformers.__version__,
        "transformers": transformers.__version__,
        "device": "cpu",
    }


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--chunks", type=Path, default=KB_DIR / "grammar_chunks.jsonl")
    ap.add_argument("--questions", type=Path, default=KB_DIR / "eval_questions.csv")
    ap.add_argument("--out", type=Path, default=ROOT / "docs" / "kb" / "embedder_comparison.json")
    ap.add_argument("--models", nargs="*", help="chỉ chạy các mô hình có tên chứa chuỗi này")
    args = ap.parse_args(argv)

    chunks = load_chunks(args.chunks)
    questions = load_questions(args.questions)
    errors = validate_questions(questions, {c["id"] for c in chunks})
    if errors:
        print(f"LỖI dữ liệu ({len(errors)}) trong {args.questions}:")
        for e in errors:
            print(f"  {e}")
        return 1
    by_lang = dict(sorted(Counter(q["lang"] for q in questions).items()))
    print(f"{len(chunks)} đoạn, {len(questions)} câu hỏi ({', '.join(f'{k}: {v}' for k, v in by_lang.items())})")
    if len(questions) < LATENCY_SAMPLES:
        print(f"  ! chỉ có {len(questions)} câu hỏi < {LATENCY_SAMPLES}: đo độ trễ sẽ lặp lại câu hỏi")

    cfgs = [m for m in MODELS if not args.models or any(s in m["name"] for s in args.models)]
    results = [evaluate_model(cfg, chunks, questions) for cfg in cfgs]

    report = {
        "task": "WSEA-110",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "chunks_file": str(args.chunks.relative_to(ROOT)) if args.chunks.is_relative_to(ROOT) else str(args.chunks),
        "questions_file": str(args.questions.relative_to(ROOT)) if args.questions.is_relative_to(ROOT) else str(args.questions),
        "n_chunks": len(chunks),
        "n_questions": len(questions),
        "questions_by_lang": by_lang,
        "scoring": "encode(normalize_embeddings=True); điểm = tích vô hướng; trúng@k nếu có ≥ 1 gold trong top-k",
        "latency_method": f"batch 1, CPU, warm-up {WARMUP} lần, {LATENCY_SAMPLES} mẫu",
        "environment": environment(),
        "models": results,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print("\n" + markdown_tables(results))
    print(f"\nĐã ghi {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
