"""Chay tap test nhan dien anh DUNG 1 LAN (WSEA-153). So chinh thuc.

    .\\.venv\\Scripts\\python.exe scripts\\run_vision_test.py

Tieu chi: docs/eval/WSEA-153_tieu_chi.md (muc 3 chi so, muc 4b dieu chinh truoc khi chay).
- Anh: data/vision_test/ — PHAI khop sha256 trong reports/153_test_manifest.json (khong sua anh sau khi chot).
- tau = settings.vision_tau, PHAI bang LOCKED_TAU (0,40, khoa o a7d6a7c tren dev). Khong chinh lai.
- Da co reports/153_test.json -> TU CHOI chay lan hai.
- Cung duong chay voi endpoint: preprocess.load_image_file -> ZeroShotClassifier (CLIP + vector app/resources).
- Cham chat (chinh) va noi theo kb/vision_synonyms.csv; top-1, top-5, coverage, accuracy khi tra loi, p50/p95.
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts import spike_clip as sc  # noqa: E402
from scripts import tune_vision_tau as tv  # noqa: E402

TEST_DIR = ROOT / "data" / "vision_test"
MANIFEST = ROOT / "reports" / "153_test_manifest.json"
OUT = ROOT / "reports" / "153_test.json"
LOCKED_TAU = 0.40
TOP_K = 10


# --- Ham thuan -----------------------------------------------------------------------------------


def verify_manifest(manifest: dict, files: list[Path]) -> list[str]:
    want = {r["file"]: r["sha256"] for r in manifest["files"]}
    have = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    errs = [f"thiếu file {f}" for f in sorted(set(want) - set(have))]
    errs += [f"file lạ {f}" for f in sorted(set(have) - set(want))]
    errs += [f"sha256 lệch {f}" for f in sorted(set(want) & set(have)) if want[f] != have[f]]
    return errs


def metrics(rows: list[dict], tau: float) -> dict:
    n = len(rows)
    ans = [r for r in rows if r["top1_score"] >= tau]
    m = len(ans)

    def rate(xs, k):
        return {"hits": sum(r[k] for r in xs), "n": len(xs), "rate": round(sum(r[k] for r in xs) / len(xs), 4) if xs else None}
    return {"n": n, "tau": tau,
            "top1_strict": rate(rows, "top1_strict"), "top5_strict": rate(rows, "top5_strict"),
            "top1_relaxed": rate(rows, "top1_relaxed"), "top5_relaxed": rate(rows, "top5_relaxed"),
            "coverage": {"answered": m, "n": n, "rate": round(m / n, 4) if n else None},
            "acc_answered_strict": rate(ans, "top1_strict"), "acc_answered_relaxed": rate(ans, "top1_relaxed")}


def by_cefr(rows: list[dict], tau: float) -> dict:
    return {lv: metrics([r for r in rows if r["cefr"] == lv], tau) for lv in ("A1", "A2", "B1")}


# --- Chay that -----------------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if OUT.exists():
        raise SystemExit(f"DỪNG — {OUT.name} đã có: tập test chỉ chạy 1 lần")
    from app.config import settings
    if settings.vision_tau != LOCKED_TAU:
        raise SystemExit(f"DỪNG — VISION_TAU = {settings.vision_tau}, phải là τ đã khoá {LOCKED_TAU}")
    files = sc.list_images(TEST_DIR)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    errs = verify_manifest(manifest, files)
    if errs:
        raise SystemExit("DỪNG — ảnh test lệch manifest: " + "; ".join(errs))

    import csv
    from app.vision import classifier as vc
    from app.vision import preprocess as pp

    with (ROOT / "kb" / "vision_test_objects.csv").open(encoding="utf-8", newline="") as f:
        cefr = {r["word"]: r["cefr"] for r in csv.DictReader(f)}
    groups = tv.load_synonyms()
    words, vectors, _ = vc.load_label_vectors()
    clf = vc.ZeroShotClassifier(vc.HFClipBackend(num_threads=2), words, vectors)
    tau = settings.vision_tau
    rows, ms = [], []
    for p in files:
        truth = sc.true_label(p)
        t = time.perf_counter()
        top = clf.predict(pp.load_image_file(p), k=TOP_K)
        ms.append((time.perf_counter() - t) * 1000)
        pred = [x["word"] for x in top]
        rows.append({"file": p.name, "label": truth, "cefr": cefr.get(truth), "top1": pred[0],
                     "top1_score": round(top[0]["score"], 4), "low_confidence": top[0]["score"] < tau,
                     "top5": [{"word": x["word"], "score": round(x["score"], 4)} for x in top[:5]],
                     **tv.judge(truth, pred, groups)})
        print(f"{p.name:22s} [{truth}] {'OK ' if rows[-1]['top1_strict'] else ('~  ' if rows[-1]['top1_relaxed'] else 'sai')}"
              f" {pred[0]} {top[0]['score']:.3f}{' (low)' if rows[-1]['low_confidence'] else ''}", flush=True)
    rep = {"task": "WSEA-153", "part": "test", "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "official": True, "runs": 1, "tau": tau, "manifest_sha256": hashlib.sha256(MANIFEST.read_bytes()).hexdigest(),
           "missing": manifest.get("missing"), "metrics": metrics(rows, tau), "by_cefr": by_cefr(rows, tau),
           "latency_ms": sc.latency_stats(ms), "rows": rows}
    OUT.write_text(json.dumps(rep, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    m, lat = rep["metrics"], rep["latency_ms"]
    print(f"\nn={m['n']} · top-1 chặt {m['top1_strict']['hits']} · nới {m['top1_relaxed']['hits']} · top-5 chặt "
          f"{m['top5_strict']['hits']} · nới {m['top5_relaxed']['hits']} · coverage {m['coverage']['answered']} · "
          f"acc trả lời chặt {m['acc_answered_strict']['rate']} nới {m['acc_answered_relaxed']['rate']} · "
          f"p50 {lat.get('p50')} p95 {lat.get('p95')} ms")
    return 0


if __name__ == "__main__":
    sys.exit(main())
