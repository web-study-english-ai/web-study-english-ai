"""Dung bo du lieu phan loai y dinh tu cac file viet tay (WSEA-112).

    .\\.venv\\Scripts\\python.exe scripts\\build_intent_dataset.py
    .\\.venv\\Scripts\\python.exe scripts\\build_intent_dataset.py --allow-missing-test --no-embed
    .\\.venv\\Scripts\\python.exe scripts\\build_intent_dataset.py --blind-sample 100 --seed 112
    .\\.venv\\Scripts\\python.exe scripts\\build_intent_dataset.py --kappa kb\\intent\\review\\blind_phuc.csv

Dau vao: kb/intent/raw/train_<author>.txt va test_<author>.txt (UTF-8). Moi dong:
    nhan | cau hoi
    nhan | cau hoi | note: ly do
Dong trong va dong bat dau bang # bi bo qua, tru "# @lang <ma>" (ap cho cac dong sau,
bat buoc truoc dong du lieu dau tien cua file). Quy tac nhan: kb/intent/LABELING.md.

Dau ra (kb/intent/): intent_train.csv, intent_test.csv, label_map.json, stats.json.
Lenh phu --blind-sample / --kappa chi doc intent_train.csv da dung, khong dung lai.
Ma thoat: 0 ok · 1 du lieu sai (in file:dong).
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services import embedder as emb  # noqa: E402

# Thu tu co dinh -> label_map 0..4 (LABELING.md muc 1). Doi thu tu la doi y nghia mo hinh.
LABELS = ("nghia_tu", "cach_dung", "ngu_phap", "phan_biet", "ngoai_pham_vi")
LANGS = ("vi", "vi_nodau", "mixed", "en")
SPLITS = {"train": "it", "test": "ie"}
COLUMNS = ("id", "text", "label", "lang", "author", "note")
MAX_LEN = 300
NEAR_DUP = 0.92
SEED = 112

INTENT_DIR = ROOT / "kb" / "intent"
DEFAULT_EVAL_QUESTIONS = ROOT / "kb" / "eval_questions.csv"
DEFAULT_EVAL_NEGATIVES = ROOT / "kb" / "eval_negatives.csv"

FILE_RE = re.compile(r"^(train|test)_([a-z0-9]+)\.txt$")
LANG_RE = re.compile(r"^#\s*@lang\s+(\S+)\s*$")
NOTE_PREFIX = "note:"


class DataError(Exception):
    """Gom nhieu loi du lieu (moi loi da kem file:dong)."""

    def __init__(self, errors: list[str]):
        super().__init__("\n".join(errors))
        self.errors = errors


# --- Doc va kiem (ham thuan) ----------------------------------------------------------------


def normalize(text: str) -> str:
    """Khoa so trung: NFC, bo khoang trang thua, chu thuong."""
    return " ".join(unicodedata.normalize("NFC", text).split()).lower()


def parse_file(path: Path, display: str | None = None) -> list[dict]:
    """Doc mot file raw -> danh sach dong du lieu. Sai thi nem DataError (gom het loi cua file)."""
    m = FILE_RE.match(path.name)
    if not m:
        raise DataError([f"{path.name}: tên file phải dạng train_<tác giả>.txt hoặc test_<tác giả>.txt (chữ thường)"])
    split, author = m.groups()
    where = display or path.name
    rows, errors, lang = [], [], None
    # utf-8-sig: bo BOM neu ai do luu bang Notepad; rstrip("\r") chiu ca file CRLF.
    for no, raw in enumerate(path.read_text(encoding="utf-8-sig").split("\n"), 1):
        line = raw.rstrip("\r").strip()
        if not line:
            continue
        if line.startswith("#"):
            lm = LANG_RE.match(line)
            if lm:
                lang = lm.group(1)
                if lang not in LANGS:
                    errors.append(f"{where}:{no}: @lang '{lang}' phải thuộc {', '.join(LANGS)}")
                    lang = None
            continue
        parts = [p.strip() for p in line.split("|")]
        note = ""
        if len(parts) == 3 and parts[2].lower().startswith(NOTE_PREFIX):
            note = parts[2][len(NOTE_PREFIX):].strip()
            parts = parts[:2]
        if len(parts) != 2:
            errors.append(f"{where}:{no}: cần dạng 'nhãn | câu' hoặc 'nhãn | câu | note: ...'")
            continue
        label, text = parts
        if lang is None:
            errors.append(f"{where}:{no}: chưa có '# @lang <mã>' hợp lệ phía trên dòng dữ liệu")
        if label not in LABELS:
            errors.append(f"{where}:{no}: nhãn '{label}' không thuộc {', '.join(LABELS)}")
        if not text:
            errors.append(f"{where}:{no}: câu rỗng")
        elif len(text) > MAX_LEN:
            errors.append(f"{where}:{no}: câu dài {len(text)} ký tự > {MAX_LEN}")
        rows.append({"split": split, "author": author, "label": label, "lang": lang, "text": text,
                     "note": note, "src": f"{where}:{no}"})
    if errors:
        raise DataError(errors)
    return rows


def load_raw(raw_dir: Path) -> list[dict]:
    """Doc moi train_*.txt / test_*.txt theo thu tu ten file. Gom loi cua tat ca file."""
    rows, errors = [], []
    for path in sorted(raw_dir.glob("*.txt")):
        if not path.name.startswith(("train_", "test_")):
            continue
        try:
            rows += parse_file(path)
        except DataError as e:
            errors += e.errors
    if errors:
        raise DataError(errors)
    return rows


def assign_ids(rows: list[dict]) -> None:
    """id theo thu tu file (da sap ten) roi thu tu dong; train it_0001…, test ie_0001…"""
    counters = Counter()
    for r in rows:
        counters[r["split"]] += 1
        r["id"] = f"{SPLITS[r['split']]}_{counters[r['split']]:04d}"


def exact_duplicates(rows: list[dict]) -> list[str]:
    """Trung chinh xac (sau chuan hoa) trong cung tap hoac giua train va test."""
    first: dict[str, dict] = {}
    errors = []
    for r in rows:
        key = normalize(r["text"])
        if key in first:
            errors.append(f"{r['src']}: trùng với {first[key]['src']} ({first[key]['split']}): {r['text']!r}")
        else:
            first[key] = r
    return errors


def load_exclusions(sources: list[tuple[Path, str]]) -> tuple[dict[str, str], list[str]]:
    """Doc cac cot cau hoi can tranh -> (khoa chuan hoa -> nguon, loi)."""
    keys, errors = {}, []
    for path, column in sources:
        try:
            with path.open(encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                if column not in (reader.fieldnames or []):
                    errors.append(f"{path.name}: không có cột '{column}'")
                    continue
                for no, row in enumerate(reader, 2):
                    text = (row.get(column) or "").strip()
                    if text:
                        keys.setdefault(normalize(text), f"{path.name}:{no}")
        except OSError as e:
            errors.append(f"không đọc được {path}: {e}")
    return keys, errors


def leak_errors(rows: list[dict], excluded: dict[str, str]) -> list[str]:
    return [f"{r['src']}: trùng câu đánh giá {excluded[normalize(r['text'])]} — không được dùng: {r['text']!r}"
            for r in rows if normalize(r["text"]) in excluded]


def near_duplicates(train: list[dict], test: list[dict], embedder, threshold: float) -> list[dict]:
    """Cap test–train cosine >= nguong -> danh sach cau TRAIN bi loai (kem cau test gan nhat)."""
    if not train or not test:
        return []
    import numpy as np

    vecs = embedder.encode_queries([r["text"] for r in train + test])
    tr, te = vecs[: len(train)], vecs[len(train):]
    sims = tr @ te.T  # da chuan hoa L2 -> tich vo huong = cosine
    removed = []
    for i, r in enumerate(train):
        j = int(np.argmax(sims[i]))
        cos = float(sims[i, j])
        if cos >= threshold:
            removed.append({"id": r["id"], "text": r["text"], "src": r["src"], "cosine": round(cos, 4),
                            "test_id": test[j]["id"], "test_text": test[j]["text"]})
    return removed


def counts(rows: list[dict]) -> dict:
    by_label = Counter(r["label"] for r in rows)
    by_lang, by_author = defaultdict(Counter), defaultdict(Counter)
    for r in rows:
        by_lang[r["label"]][r["lang"]] += 1
        by_author[r["label"]][r["author"]] += 1
    return {
        "n": len(rows),
        "by_label": {lb: by_label.get(lb, 0) for lb in LABELS},
        "by_label_lang": {lb: {lg: by_lang[lb].get(lg, 0) for lg in LANGS} for lb in LABELS},
        "by_label_author": {lb: dict(sorted(by_author[lb].items())) for lb in LABELS},
        "by_lang": dict(sorted(Counter(r["lang"] for r in rows).items())),
        "by_author": dict(sorted(Counter(r["author"] for r in rows).items())),
        "with_note": sum(bool(r["note"]) for r in rows),
    }


# --- Ghi file -------------------------------------------------------------------------------


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_csv(path: Path, rows: list[dict], columns=COLUMNS) -> None:
    """UTF-8 khong BOM, LF, module csv (tu dong bao ngoac khi cau co dau phay)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(columns)
        for r in rows:
            w.writerow([r[c] for c in columns])


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else path.as_posix()


# --- Lenh chinh: dung bo du lieu ------------------------------------------------------------


def build(args, embedder_factory) -> dict:
    rows = load_raw(args.raw_dir)
    train = [r for r in rows if r["split"] == "train"]
    test = [r for r in rows if r["split"] == "test"]
    if not train:
        raise DataError([f"không có dòng dữ liệu train nào trong {args.raw_dir}"])
    if not test and not args.allow_missing_test:
        raise DataError(["chưa có câu test nào (test_*.txt) — thêm --allow-missing-test để chỉ dựng train"])

    assign_ids(rows)
    excluded, errors = load_exclusions([(args.eval_questions, "question"), (args.eval_negatives, "question")]
                                       + [(Path(p), c) for p, c in args.exclude])
    errors += exact_duplicates(rows) + leak_errors(rows, excluded)
    if errors:
        raise DataError(errors)

    use_embed = bool(test) and not args.no_embed
    removed = near_duplicates(train, test, embedder_factory(), args.near_dup) if use_embed else []
    removed_ids = {r["id"] for r in removed}
    train = [r for r in train if r["id"] not in removed_ids]

    out = args.out_dir
    write_csv(out / "intent_train.csv", train)
    outputs = {"intent_train.csv": sha256(out / "intent_train.csv")}
    if test:
        write_csv(out / "intent_test.csv", test)
        outputs["intent_test.csv"] = sha256(out / "intent_test.csv")
    elif (out / "intent_test.csv").exists():
        print(f"CẢNH BÁO: không có câu test nhưng {rel(out / 'intent_test.csv')} cũ vẫn còn — không dùng file này.")
    write_json(out / "label_map.json", {lb: i for i, lb in enumerate(LABELS)})

    old = {}
    if (out / "stats.json").exists():
        try:
            old = json.loads((out / "stats.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            old = {}
    stats = {
        "task": "WSEA-112",
        "labels": list(LABELS),
        "langs": list(LANGS),
        "seed": args.seed,
        "embedder": {**emb.model_info(), "used": use_embed},
        "near_dup": {
            "threshold": args.near_dup,
            "enabled": use_embed,
            "reason": None if use_embed else ("--no-embed" if args.no_embed else "chưa có tập test"),
            "removed_from_train": removed,
        },
        "inputs": {rel(p): {"sha256": sha256(p), "rows": sum(r["src"].startswith(p.name + ":") for r in rows)}
                   for p in sorted(args.raw_dir.glob("*.txt")) if FILE_RE.match(p.name)},
        "excluded_sources": [rel(args.eval_questions), rel(args.eval_negatives)] + [p for p, _ in args.exclude],
        "train": counts(train),
        "test": counts(test) if test else None,
        "outputs": outputs,
    }
    # Giu ket qua kiem nhat quan cu chi khi tap train khong doi.
    agreement = old.get("agreement")
    if agreement and agreement.get("train_sha256") == outputs["intent_train.csv"]:
        stats["agreement"] = agreement
    write_json(out / "stats.json", stats)
    return stats


# --- Lenh phu -------------------------------------------------------------------------------


def blind_sample(train_rows: list[dict], n: int, seed: int) -> list[dict]:
    """Mau ngau nhien co dinh theo seed, thu tu xao, chi id + text (khong nhan)."""
    picked = random.Random(seed).sample(train_rows, min(n, len(train_rows)))
    return [{"id": r["id"], "text": r["text"]} for r in picked]


def agreement(train_rows: list[dict], rater_rows: list[dict]) -> dict:
    """So nhan nguoi gan mu voi nhan train -> kappa, ma tran nham lan, cau lech."""
    from sklearn.metrics import cohen_kappa_score, confusion_matrix

    by_id = {r["id"]: r for r in train_rows}
    errors = []
    for i, r in enumerate(rater_rows, 2):
        rid, lb = (r.get("id") or "").strip(), (r.get("label") or "").strip()
        if rid not in by_id:
            errors.append(f"dòng {i}: id '{rid}' không có trong intent_train.csv")
        if lb not in LABELS:
            errors.append(f"dòng {i}: nhãn '{lb}' không thuộc {', '.join(LABELS)}")
    if not rater_rows:
        errors.append("file nhãn mù rỗng")
    if errors:
        raise DataError(errors)

    pairs = [(by_id[r["id"].strip()], r["label"].strip()) for r in rater_rows]
    gold = [t["label"] for t, _ in pairs]
    rater = [lb for _, lb in pairs]
    kappa = cohen_kappa_score(gold, rater, labels=list(LABELS))
    matrix = confusion_matrix(gold, rater, labels=list(LABELS)).tolist()
    return {
        "n": len(pairs),
        "kappa": round(float(kappa), 4),
        "accuracy": round(sum(a == b for a, b in zip(gold, rater)) / len(pairs), 4),
        "confusion_matrix": {"rows": "nhãn train", "cols": "nhãn người gán mù", "labels": list(LABELS),
                             "values": matrix},
        "disagreements": [{"id": t["id"], "text": t["text"], "train": t["label"], "rater": lb}
                          for t, lb in pairs if t["label"] != lb],
    }


def print_matrix(ag: dict) -> None:
    labels = ag["confusion_matrix"]["labels"]
    w = max(len(lb) for lb in labels)
    corner = "train \\ mù"  # tach ra bien: f-string co dau \ chi hop le tu Python 3.12
    print(f"{corner:<{w}} | " + " | ".join(f"{lb[:9]:>9}" for lb in labels))
    for lb, row in zip(labels, ag["confusion_matrix"]["values"]):
        print(f"{lb:<{w}} | " + " | ".join(f"{v:>9}" for v in row))


# --- Dau ra man hinh ------------------------------------------------------------------------


def print_summary(stats: dict) -> None:
    for split in ("train", "test"):
        c = stats[split]
        if c is None:
            print(f"\n{split}: (chưa có)")
            continue
        print(f"\n{split}: {c['n']} câu · tác giả {c['by_author']} · có note {c['with_note']}")
        print(f"| nhãn | n | " + " | ".join(LANGS) + " |")
        print("|---|---|" + "---|" * len(LANGS))
        for lb in LABELS:
            cells = " | ".join(str(c["by_label_lang"][lb][lg]) for lg in LANGS)
            print(f"| {lb} | {c['by_label'][lb]} | {cells} |")
    nd = stats["near_dup"]
    print(f"\nGần trùng (cosine ≥ {nd['threshold']}): "
          + (f"loại {len(nd['removed_from_train'])} câu train" if nd["enabled"] else f"bỏ qua ({nd['reason']})"))
    for r in nd["removed_from_train"]:
        print(f"  {r['id']} ({r['cosine']}) ~ {r['test_id']}: {r['text']}")


def parse_args(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw-dir", type=Path, default=INTENT_DIR / "raw")
    ap.add_argument("--out-dir", type=Path, default=INTENT_DIR)
    ap.add_argument("--eval-questions", type=Path, default=DEFAULT_EVAL_QUESTIONS)
    ap.add_argument("--eval-negatives", type=Path, default=DEFAULT_EVAL_NEGATIVES)
    ap.add_argument("--exclude", nargs=2, action="append", default=[], metavar=("CSV", "COT"),
                    help="thêm một cột câu hỏi cần tránh (dùng nhiều lần)")
    ap.add_argument("--near-dup", type=float, default=NEAR_DUP, help="ngưỡng cosine test–train")
    ap.add_argument("--no-embed", action="store_true", help="bỏ bước lọc gần trùng (không nạp mô hình)")
    ap.add_argument("--allow-missing-test", action="store_true", help="chỉ dựng train khi chưa có test_*.txt")
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--blind-sample", type=int, metavar="N", help="ghi review/blind_sample.csv (id,text) rồi thoát")
    ap.add_argument("--kappa", type=Path, metavar="CSV", help="so nhãn gán mù (id,label) với train rồi thoát")
    return ap.parse_args(argv)


def default_embedder():
    return emb.Embedder(local_files_only=True)


def fail(errors: list[str], title: str) -> int:
    print(f"LỖI — {title} ({len(errors)}):")
    for e in errors:
        print(f"  {e}")
    return 1


def main(argv: list[str] | None = None, embedder_factory=default_embedder) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args(argv)
    train_csv = args.out_dir / "intent_train.csv"

    if args.blind_sample is not None or args.kappa is not None:
        if not train_csv.exists():
            return fail([f"chưa có {rel(train_csv)} — chạy dựng bộ dữ liệu trước"], "lệnh phụ")
        train_rows = read_csv(train_csv)
        if args.blind_sample is not None:
            sample = blind_sample(train_rows, args.blind_sample, args.seed)
            path = args.out_dir / "review" / "blind_sample.csv"
            write_csv(path, sample, columns=("id", "text"))
            print(f"Đã ghi {rel(path)}: {len(sample)} câu, seed {args.seed}, không kèm nhãn.")
        if args.kappa is not None:
            try:
                ag = agreement(train_rows, read_csv(args.kappa))
            except DataError as e:
                return fail(e.errors, f"file nhãn mù {args.kappa}")
            except OSError as e:
                return fail([str(e)], "file nhãn mù")
            ag = {"rater_file": rel(args.kappa.resolve()), "train_sha256": sha256(train_csv), **ag}
            print(f"Cohen's kappa = {ag['kappa']} · khớp {ag['accuracy']:.1%} trên {ag['n']} câu")
            print_matrix(ag)
            for d in ag["disagreements"]:
                print(f"  {d['id']}: train={d['train']} · mù={d['rater']} · {d['text']}")
            stats_path = args.out_dir / "stats.json"
            stats = json.loads(stats_path.read_text(encoding="utf-8")) if stats_path.exists() else {}
            stats["agreement"] = ag
            write_json(stats_path, stats)
            print(f"Đã ghi mục 'agreement' vào {rel(stats_path)}")
        return 0

    try:
        stats = build(args, embedder_factory)
    except DataError as e:
        return fail(e.errors, "dữ liệu ý định")
    print_summary(stats)
    print(f"\nĐã ghi {rel(args.out_dir)}/: " + ", ".join(stats["outputs"]) + ", label_map.json, stats.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
