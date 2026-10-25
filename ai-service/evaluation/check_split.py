"""Buoc 0 WSEA-67: kiem tra tap chia va luu danh sach nguoi dung tung tap.

Chay tu thu muc ai-service:
    python -m evaluation.check_split

Lam 3 viec:
  1. Dung lai tap val DUNG nhu luc huan luyen mo hinh v1 va chung minh no khop
     report.json (cung so mau, cung ty le nho).
  2. Kiem tra khong co nguoi dung nao nam o hai tap (quy tac 1 trong CLAUDE.md).
  3. Luu danh sach nguoi dung tung tap ra training/splits/ de ai cung tai lap duoc.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from training.config import TrainConfig
from training.dataset import load_sequences, split_by_user

RUN_DIR = Path("runs/final_lr004")  # mo hinh v1 dang chay tren endpoint
TEST_PATH = "data/processed/sequences_test.parquet"
SPLIT_DIR = Path("training/splits")


def summarize(name: str, seqs: list[dict]) -> tuple[set[str], np.ndarray]:
    """In thong ke mot tap. Mot mau = mot luot on tu luot thu 2 cua moi the."""
    users = {str(s["user_id"]) for s in seqs}
    labels = np.concatenate([s["ratings"][1:] > 1 for s in seqs])
    print(
        f"{name:5s}: {len(users):4d} nguoi | {len(seqs):8,d} chuoi | "
        f"{len(labels):9,d} mau | ty le nho {labels.mean():.4f}"
    )
    return users, labels


def main() -> None:
    # Dung DUNG cau hinh da tao ra mo hinh v1, khong go tay tham so
    cfg = TrainConfig.load(RUN_DIR / "config.json")

    all_train = load_sequences(cfg.data_path, cfg.min_len, cfg.max_len)
    train, val = split_by_user(all_train, cfg.val_ratio, cfg.seed)
    test = load_sequences(TEST_PATH, cfg.min_len, cfg.max_len)

    tu, _ = summarize("train", train)
    vu, vy = summarize("val", val)
    eu, _ = summarize("test", test)

    # 1. Khong co nguoi dung nao o hai tap
    assert not (tu & vu), "Ro ri: nguoi dung o ca train va val"
    assert not (tu & eu), "Ro ri: nguoi dung o ca train va test"
    assert not (vu & eu), "Ro ri: nguoi dung o ca val va test"

    # 2. Tap val dung lai phai khop voi luc huan luyen
    rep = json.loads((RUN_DIR / "report.json").read_text(encoding="utf-8"))["val_metrics"]
    assert len(vy) == rep["n"], f"Val co {len(vy):,} mau, luc huan luyen {rep['n']:,}"
    assert abs(vy.mean() - rep["base_rate"]) < 1e-5, "Ty le nho val lech report.json"
    print("OK: tap val dung lai khop voi luc huan luyen")

    # 3. Luu danh sach de tai lap
    SPLIT_DIR.mkdir(parents=True, exist_ok=True)
    for name, users in [("train", tu), ("val", vu), ("test", eu)]:
        (SPLIT_DIR / f"{name}_users.txt").write_text("\n".join(sorted(users)) + "\n", encoding="utf-8")
    print(f"Da luu danh sach nguoi dung vao {SPLIT_DIR}/")


if __name__ == "__main__":
    main()