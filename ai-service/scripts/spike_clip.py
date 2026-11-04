"""Spike CLIP zero-shot tren anh mau, CHI chay local (WSEA-152 buoc 4). Chay DUNG 1 lan.

    .\\.venv\\Scripts\\python.exe scripts\\spike_clip.py

Tieu chi va so do: docs/vision/WSEA-152_tap_nhan_va_tieu_chi.md muc 3 (chot truoc khi chay).
- Nhan dung cua anh = phan ten file truoc dau "_" dau tien (banana_01.jpg -> banana). Nhan khong thuoc
  kb/vision_labels.csv: bao rieng, KHONG tinh vao top-k.
- Mo hinh: app/vision/classifier.HFClipBackend (ghim revision), torch 2 luong (Space 2 vCPU).
- Vector nhan: tinh 1 lan, luu data/vision/ (bi .gitignore), nap lai qua load_label_vectors (co kiem).
- Do tre / anh: tu luc mo file toi top-5; BO lan dau (lam nong). RAM: RSS truoc nap -> sau khi du doan het.
Dau ra: reports/152_spike.json + top-5 tung anh in ra man hinh.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import platform
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts import compare_embedders as ce  # noqa: E402

DEFAULT_SAMPLES = ROOT / "data" / "vision_samples"
DEFAULT_LABELS = ROOT / "kb" / "vision_labels.csv"
DEFAULT_LABELS_MANIFEST = ROOT / "kb" / "vision_labels_manifest.json"
DEFAULT_VEC_DIR = ROOT / "data" / "vision"
DEFAULT_OUT = ROOT / "reports" / "152_spike.json"
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif")
NUM_THREADS = 2
MIB = 1024 * 1024


# --- Ham thuan -----------------------------------------------------------------------------------


def true_label(path: Path) -> str:
    """banana_01.jpg -> banana (chu thuong, phan truoc '_' dau tien; khong co '_' thi ca ten)."""
    return path.stem.split("_", 1)[0].strip().lower()


def list_images(folder: Path) -> list[Path]:
    return sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXT)


def load_label_words(path: Path) -> list[str]:
    with path.open(encoding="utf-8", newline="") as f:
        return [r["word"] for r in csv.DictReader(f)]


def judge(label: str, top: list[dict], label_set: set[str]) -> dict:
    words = [t["word"] for t in top]
    in_set = label in label_set
    rank = words.index(label) + 1 if label in words else None
    return {"in_label_set": in_set, "rank": rank,
            "top1": in_set and rank == 1, "top5": in_set and rank is not None and rank <= 5}


def prediction_row(label: str, top: list[dict], label_set: set[str], latency_ms: float) -> dict:
    """Ket qua mot anh. Danh sach du doan o 'predictions' (KHONG trung khoa bool 'top5' cua judge)."""
    return {"predictions": [{"word": x["word"], "score": round(x["score"], 4)} for x in top],
            "latency_ms": round(latency_ms, 1), **judge(label, top, label_set)}


def accuracy(rows: list[dict]) -> dict:
    scored = [r for r in rows if r.get("in_label_set") and not r.get("error")]
    n = len(scored)
    return {"n_scored": n, "n_not_in_label_set": sum(not r.get("in_label_set") for r in rows),
            "n_error": sum(bool(r.get("error")) for r in rows),
            "top1": round(sum(r["top1"] for r in scored) / n, 4) if n else None,
            "top5": round(sum(r["top5"] for r in scored) / n, 4) if n else None,
            "top1_hits": sum(r["top1"] for r in scored), "top5_hits": sum(r["top5"] for r in scored)}


def latency_stats(ms: list[float]) -> dict:
    """Bo lan dau (lam nong). Can >= 2 anh."""
    rest = ms[1:]
    if not rest:
        return {"n": 0, "first_ms": round(ms[0], 1) if ms else None}
    return {"n": len(rest), "first_ms": round(ms[0], 1), "p50": round(ce.percentile(rest, 50), 1),
            "p95": round(ce.percentile(rest, 95), 1), "max": round(max(rest), 1), "mean": round(sum(rest) / len(rest), 1)}


def dir_size(paths: list[Path]) -> int:
    return sum(p.stat().st_size for p in paths if p.is_file())


# --- Chay that -----------------------------------------------------------------------------------


def rss_mib() -> float:
    import psutil
    return psutil.Process().memory_info().rss / MIB


def model_files_size(model: str, revision: str) -> dict:
    """Byte tren dia cua snapshot mo hinh trong cache HF (doc kich thuoc file that, theo symlink)."""
    from huggingface_hub import snapshot_download
    snap = Path(snapshot_download(model, revision=revision, local_files_only=True))
    files = [p for p in snap.rglob("*") if p.is_file()]
    sizes = {p.relative_to(snap).as_posix(): p.resolve().stat().st_size for p in files}
    return {"snapshot": snap.as_posix(), "files": sizes, "total_bytes": sum(sizes.values())}


def git_head() -> str:
    return subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()


def run(args) -> dict:
    from app.vision import classifier as vc
    from app.vision import preprocess as pp

    images = list_images(args.samples)
    if not images:
        raise SystemExit(f"Không có ảnh trong {args.samples}")
    words = load_label_words(args.labels)
    labels_manifest = json.loads(args.labels_manifest.read_text(encoding="utf-8"))
    label_set = set(words)

    import torch
    torch.set_num_threads(NUM_THREADS)
    rss0 = rss_mib()
    t = time.perf_counter()
    backend = vc.HFClipBackend(num_threads=NUM_THREADS)
    load_s = time.perf_counter() - t
    rss_loaded = rss_mib()

    t = time.perf_counter()
    vectors = vc.build_label_vectors(backend, words)
    vec_s = time.perf_counter() - t
    npy, man = args.vec_dir / "vision_label_vectors.npy", args.vec_dir / "vision_label_vectors.json"
    vc.save_label_vectors(vectors, words, rule_version=labels_manifest["rule_version"],
                          labels_source_sha256=labels_manifest["output"]["sha256"], npy_path=npy,
                          manifest_path=man, logit_scale=backend.logit_scale)
    words2, vectors2, _ = vc.load_label_vectors(npy, man)  # nap lai qua duong kiem tra
    clf = vc.ZeroShotClassifier(backend, words2, vectors2)

    rows, ms = [], []
    for p in images:
        label = true_label(p)
        row = {"file": p.name, "bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
               "label": label}
        t = time.perf_counter()
        try:
            top = clf.predict(pp.load_image_file(p))
            ms.append((time.perf_counter() - t) * 1000)
            row.update(prediction_row(label, top, label_set, ms[-1]))
        except pp.ImageError as exc:
            row.update(error=exc.code, message=exc.message, **judge(label, [], label_set))
        rows.append(row)
        mark = "—" if not row["in_label_set"] else ("TOP1" if row["top1"] else ("top5" if row["top5"] else "sai"))
        tops = ", ".join(f"{x['word']} {x['score']:.3f}" for x in row.get("predictions", [])) or row.get("error")
        print(f"{p.name:24s} [{label}] {mark:5s} | {tops}", flush=True)
    rss_end = rss_mib()

    return {
        "task": "WSEA-152", "step": "spike", "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "code_commit": git_head(),
        "model": vc.MODEL_NAME, "revision": vc.MODEL_REVISION, "templates": list(vc.TEMPLATES),
        "logit_scale": round(backend.logit_scale, 4),
        "labels": {"n": len(words), "rule_version": labels_manifest["rule_version"],
                   "sha256": labels_manifest["output"]["sha256"]},
        "env": {"python": platform.python_version(), "torch": torch.__version__,
                "transformers": __import__("transformers").__version__, "threads": NUM_THREADS,
                "cpu": platform.processor(), "machine": "laptop (local)"},
        "n_images": len(images), "accuracy": accuracy(rows), "latency_ms_per_image": latency_stats(ms),
        "ram_mib": {"before_load": round(rss0, 1), "after_load": round(rss_loaded, 1),
                    "after_predict": round(rss_end, 1), "delta": round(rss_end - rss0, 1)},
        "timing_s": {"model_load": round(load_s, 2), "label_vectors": round(vec_s, 2)},
        "disk_bytes": {"model": model_files_size(vc.MODEL_NAME, vc.MODEL_REVISION),
                       "label_vectors_npy": npy.stat().st_size},
        "rows": rows,
    }


def summary_text(rep: dict) -> str:
    a, lat, ram = rep["accuracy"], rep["latency_ms_per_image"], rep["ram_mib"]
    return "\n".join([
        f"{rep['n_images']} ảnh · {rep['labels']['n']} nhãn · {rep['model']} @ {rep['revision'][:8]}",
        f"top-1 {a['top1_hits']}/{a['n_scored']} · top-5 {a['top5_hits']}/{a['n_scored']} "
        f"(không thuộc tập nhãn: {a['n_not_in_label_set']}, lỗi: {a['n_error']})",
        f"độ trễ/ảnh (bỏ lần đầu {lat.get('first_ms')} ms): p50 {lat.get('p50')} · p95 {lat.get('p95')} · "
        f"max {lat.get('max')} ms (n={lat['n']}, {rep['env']['threads']} luồng)",
        f"RAM: {ram['before_load']} → {ram['after_load']} (nạp) → {ram['after_predict']} MiB, tăng {ram['delta']} MiB",
        f"nạp mô hình {rep['timing_s']['model_load']} s · vector nhãn {rep['timing_s']['label_vectors']} s · "
        f"mô hình trên đĩa {rep['disk_bytes']['model']['total_bytes'] / MIB:.1f} MiB · "
        f".npy nhãn {rep['disk_bytes']['label_vectors_npy'] / 1024:.0f} KiB",
    ])


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--samples", type=Path, default=DEFAULT_SAMPLES)
    ap.add_argument("--labels", type=Path, default=DEFAULT_LABELS)
    ap.add_argument("--labels-manifest", type=Path, default=DEFAULT_LABELS_MANIFEST)
    ap.add_argument("--vec-dir", type=Path, default=DEFAULT_VEC_DIR)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args(argv)
    rep = run(args)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(rep, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("\n" + summary_text(rep))
    print(f"\nĐã ghi {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
