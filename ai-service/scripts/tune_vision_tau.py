"""Chinh nguong tin cay tau cho /recognize/image CHI tren tap dev (WSEA-153).

    .\\.venv\\Scripts\\python.exe scripts\\tune_vision_tau.py

Tieu chi: docs/eval/WSEA-153_tieu_chi.md muc 4 (chot truoc khi chay).
- Tap dev = data/vision_samples/ (10 anh spike) + data/vision_dev/ (neu co). Tu choi moi thu muc nam trong
  data/vision_test/ (tap test chi chay 1 lan, o script khac, sau khi tau da chot).
- Dung DUNG duong chay that: preprocess.load_image_file -> ZeroShotClassifier (CLIP ghim revision + vector
  nhan app/resources). Nhan dung = ten file truoc "_"; nhan ngoai 449 nhan bao rieng, khong tinh.
- In bang tau <-> coverage, accuracy khi tra loi (chat va noi theo kb/vision_synonyms.csv) va tau theo luat:
  tau lon nhat trong luoi co coverage >= 0,70; khong co -> 0,05. KHONG tu ghi config.
Dau ra: reports/153_tau_dev.json.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts import compare_embedders as ce  # noqa: E402
from scripts import spike_clip as sc  # noqa: E402

DEV_DIRS = (ROOT / "data" / "vision_samples", ROOT / "data" / "vision_dev")
TEST_DIR = ROOT / "data" / "vision_test"
SYNONYMS = ROOT / "kb" / "vision_synonyms.csv"
LABELS = ROOT / "kb" / "vision_labels.csv"
DEFAULT_OUT = ROOT / "reports" / "153_tau_dev.json"
GRID = tuple(round(0.05 * i, 2) for i in range(1, 13))  # 0,05 -> 0,60
MIN_COVERAGE = 0.70
FALLBACK_TAU = 0.05
TOP_K = 10


# --- Ham thuan -----------------------------------------------------------------------------------


def load_synonyms(path: Path = SYNONYMS) -> dict[str, str]:
    """word -> ten nhom."""
    with path.open(encoding="utf-8", newline="") as f:
        return {r["word"]: r["group"] for r in csv.DictReader(f)}


def same(pred: str, truth: str, groups: dict[str, str], relaxed: bool) -> bool:
    if pred == truth:
        return True
    return relaxed and pred in groups and groups.get(truth) == groups[pred]


def judge(truth: str, words: list[str], groups: dict[str, str]) -> dict:
    """top-1/top-5 chat va noi cho mot anh (words = du doan sap giam dan)."""
    return {"top1_strict": bool(words) and same(words[0], truth, groups, False),
            "top1_relaxed": bool(words) and same(words[0], truth, groups, True),
            "top5_strict": any(same(w, truth, groups, False) for w in words[:5]),
            "top5_relaxed": any(same(w, truth, groups, True) for w in words[:5])}


def tau_table(rows: list[dict], grid=GRID) -> list[dict]:
    """rows: anh co nhan thuoc tap (co top1_score, top1_strict, top1_relaxed)."""
    n = len(rows)
    out = []
    for tau in grid:
        ans = [r for r in rows if r["top1_score"] >= tau]
        m = len(ans)
        out.append({"tau": tau, "answered": m, "n": n, "coverage": round(m / n, 4) if n else None,
                    "acc_strict": round(sum(r["top1_strict"] for r in ans) / m, 4) if m else None,
                    "acc_relaxed": round(sum(r["top1_relaxed"] for r in ans) / m, 4) if m else None})
    return out


def choose_tau(table: list[dict], min_coverage: float = MIN_COVERAGE, fallback: float = FALLBACK_TAU) -> float:
    ok = [t["tau"] for t in table if t["coverage"] is not None and t["coverage"] >= min_coverage]
    return max(ok) if ok else fallback


def ngoai_nhan_name(path: Path) -> str:
    """Ten vat ngoai nhan = ten file bo hau to so: computer_mouse_09.jpg -> computer_mouse (khong cat o '_' dau)."""
    stem = path.stem
    head, _, tail = stem.rpartition("_")
    return head if head and tail.isdigit() else stem


def ngoai_nhan_rows(preds: list[tuple[Path, list[dict]]], tau: float) -> list[dict]:
    """Anh vat ngoai 449 nhan: chi ghi top-1 va low_confidence theo tau da chon. KHONG dung de chon tau."""
    return [{"file": p.name, "object": ngoai_nhan_name(p), "top1": top[0]["word"],
             "top1_score": round(top[0]["score"], 4), "low_confidence": top[0]["score"] < tau} for p, top in preds]


def check_not_test(dirs: list[Path], test_dir: Path = TEST_DIR) -> None:
    t = test_dir.resolve()
    for d in dirs:
        r = d.resolve()
        if r == t or t in r.parents:
            raise SystemExit(f"DỪNG — {d} thuộc tập test; tau chỉ chỉnh trên dev")


def summary(rows: list[dict], table: list[dict], tau: float, n_out: int) -> str:
    n = len(rows)
    def frac(k):
        return f"{sum(r[k] for r in rows)}/{n}"
    lines = [f"Dev: {n} ảnh tính được (+{n_out} ảnh nhãn ngoài tập, không tính)",
             f"top-1 chặt {frac('top1_strict')} · nới {frac('top1_relaxed')} · "
             f"top-5 chặt {frac('top5_strict')} · nới {frac('top5_relaxed')}", "",
             "| τ | trả lời | coverage | acc chặt | acc nới |", "|---|---|---|---|---|"]
    for t in table:
        f = lambda x: "—" if x is None else f"{x:.3f}"  # noqa: E731
        lines.append(f"| {t['tau']:.2f} | {t['answered']}/{t['n']} | {f(t['coverage'])} | {f(t['acc_strict'])} | "
                     f"{f(t['acc_relaxed'])} |")
    lines += ["", f"τ theo luật (lớn nhất có coverage ≥ {MIN_COVERAGE:.2f}): {tau:.2f}"]
    return "\n".join(lines)


# --- Chay that -----------------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dev", type=Path, nargs="*", default=list(DEV_DIRS))
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--ngoai-nhan", type=Path, default=None,
                    help="thư mục ảnh vật ngoài 449 nhãn: chỉ ghi top-1 + low_confidence, không dùng chọn τ")
    args = ap.parse_args(argv)
    args.dev = [d.resolve() for d in args.dev]  # duong dan tuong doi -> tuyet doi (relative_to ROOT khi ghi)
    args.ngoai_nhan = args.ngoai_nhan.resolve() if args.ngoai_nhan else None
    args.out = args.out.resolve()
    check_not_test(args.dev + ([args.ngoai_nhan] if args.ngoai_nhan else []))
    images = [p for d in args.dev if d.exists() for p in sc.list_images(d)]
    if not images:
        raise SystemExit("Không có ảnh dev")

    from app.vision import classifier as vc
    from app.vision import preprocess as pp

    groups = load_synonyms()
    label_set = set(sc.load_label_words(LABELS))
    words, vectors, _ = vc.load_label_vectors()
    clf = vc.ZeroShotClassifier(vc.HFClipBackend(num_threads=2), words, vectors)

    rows, out_of_set, ms = [], [], []
    for p in images:
        truth = sc.true_label(p)
        t = time.perf_counter()
        top = clf.predict(pp.load_image_file(p), k=TOP_K)
        ms.append((time.perf_counter() - t) * 1000)
        pred = [x["word"] for x in top]
        row = {"file": p.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
               "label": truth, "top1": pred[0], "top1_score": round(top[0]["score"], 4),
               "top5": pred[:5], **judge(truth, pred, groups)}
        (rows if truth in label_set else out_of_set).append(row)
    table = tau_table(rows)
    tau = choose_tau(table)  # CHI tu anh dev co nhan thuoc tap
    extra = []
    if args.ngoai_nhan:
        imgs = sc.list_images(args.ngoai_nhan)
        extra = ngoai_nhan_rows([(p, clf.predict(pp.load_image_file(p), k=TOP_K)) for p in imgs], tau)
    rep = {"task": "WSEA-153", "part": "tau_dev", "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "dev_dirs": [d.relative_to(ROOT).as_posix() for d in args.dev if d.exists()],
           "rule": {"grid": list(GRID), "min_coverage": MIN_COVERAGE, "fallback": FALLBACK_TAU},
           "n_scored": len(rows), "n_out_of_label_set": len(out_of_set), "table": table, "tau_by_rule": tau,
           "latency_ms": sc.latency_stats(ms), "rows": rows, "out_of_label_set": out_of_set,
           "ngoai_nhan": None if not args.ngoai_nhan else {
               "dir": args.ngoai_nhan.relative_to(ROOT).as_posix(), "tau": tau, "used_for_tau": False,
               "n": len(extra), "low_confidence": sum(r["low_confidence"] for r in extra), "rows": extra}}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(rep, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(summary(rows, table, tau, len(out_of_set)))
    lat = rep["latency_ms"]
    print(f"độ trễ/ảnh (bỏ lần đầu): p50 {lat.get('p50')} · p95 {lat.get('p95')} ms (n={lat['n']})")
    if extra:
        print(f"\nẢnh ngoài 449 nhãn (không dùng chọn τ), τ = {tau:.2f}: low_confidence "
              f"{sum(r['low_confidence'] for r in extra)}/{len(extra)}")
        for r in extra:
            print(f"- {r['file']}: top-1 {r['top1']} {r['top1_score']:.3f} · low_confidence={r['low_confidence']}")
    print(f"Đã ghi {args.out.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
