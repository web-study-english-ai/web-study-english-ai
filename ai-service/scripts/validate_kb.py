"""Kiem kho tri thuc ngu phap kb/grammar_chunks.jsonl theo kb/outline.csv (WSEA-100).

    python scripts/validate_kb.py            # dang viet theo lo: thieu id chi la thong tin
    python scripts/validate_kb.py --final    # truoc khi nap: thieu id va chua duyet la loi

Exit code 1 neu co loi. Ghi kb/report.json va kb/preview.md (cung thu muc voi file jsonl,
doi bang --out-dir). Quy uoc noi dung xem kb/README.md.

Do token can transformers, do giong can scikit-learn; thieu thu vien nao thi bo qua phan do.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import statistics
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

KB_DIR = Path(__file__).resolve().parent.parent / "kb"

FIELDS = ["id", "topic", "facet", "title", "cefr", "source", "source_url", "content", "reviewed_by"]
OUTLINE_FIELDS = ["topic", "facet", "title", "cefr", "source_url"]
FACETS = ["form", "usage", "signals", "contrast", "mistakes"]
CEFRS = ["A1", "A2", "B1", "B2"]  # khop enum CefrLevel ben backend

ID_RE = re.compile(r"^gram_\d{3}$")
MIN_WORDS, MAX_WORDS = 120, 250
SOURCE_PREFIX = "WSEA biên soạn · tham chiếu:"
FORMULA_PREFIX = "Công thức:"
EXAMPLE_HEADER = "Ví dụ:"
# "- <cau tieng Anh> (<ban dich>)"; ban dich nam trong cap ngoac cuoi dong
EXAMPLE_RE = re.compile(r"^-\s+(?P<en>.*[A-Za-z].*?)\s+\((?P<vi>[^()]*\S[^()]*)\)$")
MIN_EXAMPLES = 2
# Cum tro nguoc ve doan khac; khong cam "ở trên" tran vi "ở trên bàn" la cau dich hop le
BANNED_PHRASES = ["như đã nói", "đã nêu ở trên", "nói ở trên", "ở phần trên", "đoạn trước", "phần trước"]

TOKENIZER_NAME = "intfloat/multilingual-e5-small"
TOKEN_ERROR, TOKEN_WARN = 512, 480
TOP_SIMILAR = 10


def nfc(s: str) -> str:
    # Go tieng Viet co the ra NFD; so sanh tren NFC de khong bao loi oan
    return unicodedata.normalize("NFC", s)


def word_count(content: str) -> int:
    return len(content.split())


def count_examples(content: str) -> int:
    """So dong vi du dung dinh dang nam sau dong 'Ví dụ:'."""
    lines = [nfc(line).strip() for line in content.splitlines()]
    try:
        start = lines.index(EXAMPLE_HEADER)
    except ValueError:
        return 0
    return sum(1 for line in lines[start + 1:] if EXAMPLE_RE.match(line))


def normalize_for_dup(content: str) -> str:
    return " ".join(nfc(content).lower().split())


@dataclass
class Result:
    errors: list[dict] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)
    chunks: list[dict] = field(default_factory=list)  # cac dong doc duoc thanh object
    missing_ids: list[str] = field(default_factory=list)
    token_counts: dict[str, int] = field(default_factory=dict)
    tokens_measured: bool = False
    similar_pairs: list[dict] = field(default_factory=list)
    similarity_measured: bool = False

    def error(self, where: str, msg: str) -> None:
        self.errors.append({"where": where, "message": msg})

    def warn(self, where: str, msg: str) -> None:
        self.warnings.append({"where": where, "message": msg})


# --- Doc file ----------------------------------------------------------------


def load_outline(path: Path) -> dict[str, dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        return {row["id"]: row for row in csv.DictReader(f)}


def load_chunks(path: Path, res: Result) -> None:
    text = path.read_text(encoding="utf-8-sig")
    for lineno, line in enumerate(text.splitlines(), 1):
        where = f"dòng {lineno}"
        if not line.strip():
            res.warn(where, "dòng trống")
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError as e:
            res.error(where, f"JSON hỏng: {e.msg} (cột {e.colno})")
            continue
        if not isinstance(obj, dict):
            res.error(where, "không phải JSON object")
            continue
        obj["_line"] = lineno
        res.chunks.append(obj)


# --- Kiem tung doan ----------------------------------------------------------


def _where(chunk: dict) -> str:
    cid = chunk.get("id")
    return cid if isinstance(cid, str) and cid else f"dòng {chunk['_line']}"


def check_chunk(chunk: dict, outline: dict[str, dict], final: bool, res: Result) -> None:
    where = _where(chunk)
    keys = set(chunk) - {"_line"}
    missing = [k for k in FIELDS if k not in keys]
    extra = sorted(keys - set(FIELDS))
    if missing:
        res.error(where, f"thiếu trường: {', '.join(missing)}")
    if extra:
        res.error(where, f"thừa trường: {', '.join(extra)}")

    # Kieu du lieu: moi truong la chuoi, rieng reviewed_by duoc null
    ok = {}
    for k in FIELDS:
        if k not in chunk:
            continue
        v = chunk[k]
        if k == "reviewed_by" and v is None:
            ok[k] = None
        elif isinstance(v, str):
            ok[k] = nfc(v)
        else:
            res.error(where, f"trường {k} phải là chuỗi" + (" hoặc null" if k == "reviewed_by" else ""))

    cid = ok.get("id")
    if cid is not None:
        if not ID_RE.match(cid):
            res.error(where, f"id '{cid}' không khớp gram_\\d{{3}}")
        elif cid not in outline:
            res.error(where, f"id '{cid}' không có trong outline.csv")
        else:
            row = outline[cid]
            for k in OUTLINE_FIELDS:
                if k in ok and ok[k] != nfc(row[k]):
                    res.error(where, f"{k} khác outline: '{ok[k]}' ≠ '{row[k]}'")

    if "facet" in ok and ok["facet"] not in FACETS:
        res.error(where, f"facet '{ok['facet']}' không hợp lệ (cho phép: {', '.join(FACETS)})")
    if "cefr" in ok and ok["cefr"] not in CEFRS:
        res.error(where, f"cefr '{ok['cefr']}' không hợp lệ (cho phép: {', '.join(CEFRS)})")

    if "source" in ok and not ok["source"].startswith(SOURCE_PREFIX):
        res.error(where, f"source phải bắt đầu bằng '{SOURCE_PREFIX}'")
    if "source_url" in ok and not ok["source_url"].startswith("https://"):
        res.error(where, "source_url phải là https")

    # null hoac chuoi rong; thieu truong / sai kieu da bao o tren
    if "reviewed_by" in ok and not (ok["reviewed_by"] or "").strip():
        (res.error if final else res.warn)(where, "chưa có người duyệt (reviewed_by)")

    content = ok.get("content")
    if content is None:
        return
    lines = content.splitlines()
    first = lines[0].strip() if lines else ""
    if "title" in ok and first != ok["title"].strip():
        res.error(where, f"dòng 1 của content khác title: '{first}'")
    n = word_count(content)
    if not MIN_WORDS <= n <= MAX_WORDS:
        res.error(where, f"{n} từ, ngoài khoảng {MIN_WORDS}–{MAX_WORDS}")
    if ok.get("facet") == "form" and not any(line.strip().startswith(FORMULA_PREFIX) for line in lines):
        res.error(where, f"facet form nhưng thiếu dòng '{FORMULA_PREFIX}'")
    n_ex = count_examples(content)
    if n_ex < MIN_EXAMPLES:
        res.error(where, f"chỉ có {n_ex} dòng ví dụ đúng định dạng sau '{EXAMPLE_HEADER}' (cần ≥ {MIN_EXAMPLES})")
    low = content.lower()
    for phrase in BANNED_PHRASES:
        if phrase in low:
            res.error(where, f"có cụm '{phrase}' (đoạn phải tự đứng được)")


def check_collection(outline: dict[str, dict], final: bool, res: Result) -> None:
    seen_id: dict[str, str] = {}
    seen_pair: dict[tuple, str] = {}
    seen_text: dict[str, str] = {}
    for c in res.chunks:
        where = _where(c)
        cid = c.get("id")
        if isinstance(cid, str):
            if cid in seen_id:
                res.error(where, f"trùng id với {seen_id[cid]}")
            else:
                seen_id[cid] = f"dòng {c['_line']}"
        topic, facet = c.get("topic"), c.get("facet")
        if isinstance(topic, str) and isinstance(facet, str):
            if (topic, facet) in seen_pair:
                res.error(where, f"trùng (topic, facet) = ({topic}, {facet}) với {seen_pair[(topic, facet)]}")
            else:
                seen_pair[(topic, facet)] = where
        content = c.get("content")
        if isinstance(content, str):
            key = normalize_for_dup(content)
            if key in seen_text:
                res.error(where, f"nội dung trùng hệt {seen_text[key]}")
            else:
                seen_text[key] = where

    res.missing_ids = [i for i in outline if i not in seen_id]
    if res.missing_ids and final:
        res.error("kho", f"{len(res.missing_ids)} id trong outline chưa viết: {', '.join(res.missing_ids)}")


# --- Do token va do giong ----------------------------------------------------


def load_tokenizer():
    """Tra tokenizer hoac None (thieu transformers, khong tai duoc mo hinh)."""
    try:
        from transformers import AutoTokenizer
    except ImportError:
        return None
    try:
        return AutoTokenizer.from_pretrained(TOKENIZER_NAME)
    except Exception:  # noqa: BLE001 - mat mang, het han muc... deu chi la bo qua
        return None


def measure_tokens(tokenizer, res: Result) -> None:
    res.tokens_measured = True
    for c in res.chunks:
        if not isinstance(c.get("content"), str):
            continue
        n = len(tokenizer("passage: " + c["content"])["input_ids"])
        where = _where(c)
        res.token_counts[where] = n
        if n > TOKEN_ERROR:
            res.error(where, f"{n} token > {TOKEN_ERROR} (bị cắt khi sinh vector)")
        elif n > TOKEN_WARN:
            res.warn(where, f"{n} token > {TOKEN_WARN}, sát giới hạn {TOKEN_ERROR}")


def measure_similarity(res: Result, top: int = TOP_SIMILAR) -> None:
    items = [(_where(c), c["content"]) for c in res.chunks if isinstance(c.get("content"), str)]
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
    except ImportError:
        return
    res.similarity_measured = True
    if len(items) < 2:
        return
    mat = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5)).fit_transform([t for _, t in items])
    sim = cosine_similarity(mat)
    pairs = [
        (float(sim[i, j]), items[i][0], items[j][0])
        for i in range(len(items)) for j in range(i + 1, len(items))
    ]
    pairs.sort(key=lambda p: p[0], reverse=True)
    res.similar_pairs = [{"a": a, "b": b, "score": round(s, 4)} for s, a, b in pairs[:top]]


# --- Dau ra ------------------------------------------------------------------


def build_report(res: Result, final: bool) -> dict:
    words = [word_count(c["content"]) for c in res.chunks if isinstance(c.get("content"), str)]

    def count(k: str, allowed: list[str]) -> dict[str, int]:
        return {v: sum(1 for c in res.chunks if c.get(k) == v) for v in allowed}

    return {
        "mode": "final" if final else "draft",
        "chunks": len(res.chunks),
        "missing_ids": res.missing_ids,
        "by_cefr": count("cefr", CEFRS),
        "by_facet": count("facet", FACETS),
        "words": {
            "min": min(words) if words else None,
            "mean": round(statistics.mean(words), 1) if words else None,
            "max": max(words) if words else None,
        },
        "tokens": {
            "measured": res.tokens_measured,
            "tokenizer": TOKENIZER_NAME,
            "max": max(res.token_counts.values()) if res.token_counts else None,
        },
        "errors": res.errors,
        "warnings": res.warnings,
        "similarity": {"measured": res.similarity_measured, "top_pairs": res.similar_pairs},
    }


def build_preview(res: Result, outline: dict[str, dict]) -> str:
    order = {cid: i for i, cid in enumerate(outline)}
    chunks = sorted(res.chunks, key=lambda c: (order.get(c.get("id"), len(order)), c["_line"]))
    groups: dict[str, list[dict]] = {}
    for c in chunks:
        groups.setdefault(str(c.get("topic") or "(không có topic)"), []).append(c)

    out = ["# Xem trước kho tri thức ngữ pháp", "",
           f"{len(res.chunks)} đoạn · {len(res.missing_ids)} id chưa viết · "
           f"{len(res.errors)} lỗi · {len(res.warnings)} cảnh báo", ""]
    for topic, items in groups.items():
        out += [f"## {topic}", ""]
        for c in items:
            url = c.get("source_url") or ""
            link = f"[link]({url})" if url else "(không có link)"
            reviewer = c.get("reviewed_by") or "chưa duyệt"
            out += [
                f"### {c.get('id', '?')} · {c.get('title', '')}",
                "",
                f"{c.get('cefr', '?')} · {c.get('facet', '?')} · {c.get('source', '')} · {link} · {reviewer}",
                "",
            ]
            content = c.get("content") if isinstance(c.get("content"), str) else ""
            # Hai dau cach cuoi dong = xuong dong trong Markdown, giu nguyen bo cuc content
            out += [line + "  " if line.strip() else "" for line in content.splitlines()]
            out += ["", "- [ ] Đã duyệt", ""]
    return "\n".join(out)


def print_summary(res: Result, report: dict, tokens_skipped: bool) -> None:
    print(f"{len(res.chunks)} đoạn, {len(res.missing_ids)} id chưa viết")
    print("CEFR:  " + " · ".join(f"{k} {v}" for k, v in report["by_cefr"].items()))
    print("Facet: " + " · ".join(f"{k} {v}" for k, v in report["by_facet"].items()))
    w = report["words"]
    if w["min"] is not None:
        print(f"Số từ: min {w['min']} · trung bình {w['mean']} · max {w['max']}")
    if tokens_skipped:
        print("bỏ qua đo token")
    elif report["tokens"]["measured"]:
        tmax = report["tokens"]["max"]
        print(f"Token max: {tmax if tmax is not None else '— (chưa có đoạn)'} ({TOKENIZER_NAME})")
    if not res.similarity_measured:
        print("bỏ qua đo độ giống (chưa cài scikit-learn)")
    elif res.similar_pairs:
        print(f"\n{len(res.similar_pairs)} cặp giống nhất (chỉ để duyệt, không tính lỗi):")
        for p in res.similar_pairs:
            print(f"  {p['score']:.3f}  {p['a']} ~ {p['b']}")
    if res.warnings:
        print(f"\nCẢNH BÁO ({len(res.warnings)}):")
        for x in res.warnings:
            print(f"  {x['where']}: {x['message']}")
    if res.errors:
        print(f"\nLỖI ({len(res.errors)}):")
        for x in res.errors:
            print(f"  {x['where']}: {x['message']}")
    print(f"\nKẾT QUẢ: {'CÓ LỖI' if res.errors else 'ĐẠT'}")


# --- Chuong trinh chinh ------------------------------------------------------


def validate(chunks_path: Path, outline_path: Path, final: bool = False, tokenizer=None,
             tokens_required: bool = False) -> Result:
    """tokens_required: --final ma khong --no-tokens -> thieu tokenizer la loi."""
    res = Result()
    if tokens_required and tokenizer is None:
        res.error("kho", f"không đo được token: không nạp được tokenizer {TOKENIZER_NAME} "
                         "(cài transformers, kiểm tra mạng) hoặc chạy với --no-tokens")
    outline = load_outline(outline_path)
    if not chunks_path.exists():
        res.error("kho", f"không tìm thấy {chunks_path}")
        res.missing_ids = list(outline)
        return res
    load_chunks(chunks_path, res)
    for c in res.chunks:
        check_chunk(c, outline, final, res)
    check_collection(outline, final, res)
    if tokenizer is not None:
        measure_tokens(tokenizer, res)
    measure_similarity(res)
    return res


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--chunks", type=Path, default=KB_DIR / "grammar_chunks.jsonl")
    p.add_argument("--outline", type=Path, default=KB_DIR / "outline.csv")
    p.add_argument("--out-dir", type=Path, default=None, help="nơi ghi report.json, preview.md")
    p.add_argument("--final", action="store_true", help="thiếu id và chưa duyệt tính là lỗi")
    p.add_argument("--no-tokens", action="store_true", help="không đo token")
    args = p.parse_args(argv)

    tokenizer = None if args.no_tokens else load_tokenizer()
    tokens_required = args.final and not args.no_tokens
    res = validate(args.chunks, args.outline, args.final, tokenizer, tokens_required=tokens_required)
    outline = load_outline(args.outline)
    report = build_report(res, args.final)

    out_dir = args.out_dir or args.chunks.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out_dir / "preview.md").write_text(build_preview(res, outline), encoding="utf-8")

    # --final thieu tokenizer da thanh loi, khong in them dong "bo qua"
    print_summary(res, report, tokens_skipped=tokenizer is None and not tokens_required)
    print(f"Đã ghi {out_dir / 'report.json'} và {out_dir / 'preview.md'}")
    return 1 if res.errors else 0


if __name__ == "__main__":
    sys.exit(main())
