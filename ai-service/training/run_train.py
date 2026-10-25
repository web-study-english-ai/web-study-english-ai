"""Diem vao chay huan luyen (WSEA-41).

Vi du chay thu bang du lieu gia, khong can du lieu that:
    python -m training.run_train --synthetic --epochs 3

Chay that:
    python -m training.run_train \
        --data data/processed/sequences.parquet \
        --out ai-service/training/runs/exp01 --epochs 50 --lr 0.04
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .config import TrainConfig, set_seed
from .dataset import load_sequences, make_loader, make_synthetic_sequences, split_by_user
from .metrics import calibration_table
from .trainer import Trainer


def build_model():
    """Nap lop mo hinh cua task truoc (WSEA-40).

    Giao uoc bat buoc: model.w la nn.Parameter 17 phan tu va
    model(ratings, elapsed, mask) -> (preds, labels) da loc theo mask.
    """
    from app.models.fsrs import FSRSModel  # noqa: WPS433

    return FSRSModel()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=None)
    ap.add_argument("--val", default=None)
    ap.add_argument("--synthetic", action="store_true", help="dung du lieu gia de chay thu")
    ap.add_argument("--epochs", type=int, default=50)
    ap.add_argument("--lr", type=float, default=4e-2)
    ap.add_argument("--batch-size", type=int, default=512)
    ap.add_argument("--patience", type=int, default=5)
    ap.add_argument("--max-len", type=int, default=64)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--out", default="runs/exp01")
    args = ap.parse_args()

    cfg = TrainConfig(
        data_path=args.data or "synthetic",
        val_path=args.val,
        epochs=args.epochs,
        lr=args.lr,
        batch_size=args.batch_size,
        patience=args.patience,
        max_len=args.max_len,
        seed=args.seed,
        device=args.device,
        out_dir=args.out,
        run_name=Path(args.out).name,
    )

    set_seed(cfg.seed)

    # --- du lieu ---
    if args.synthetic:
        seqs = make_synthetic_sequences(n_users=40, cards_per_user=20, seed=cfg.seed)
        train_seqs, val_seqs = split_by_user(seqs, cfg.val_ratio, cfg.seed)
    elif args.val:
        train_seqs = load_sequences(cfg.data_path, cfg.min_len, cfg.max_len)
        val_seqs = load_sequences(args.val, cfg.min_len, cfg.max_len)
        tu = {str(s["user_id"]) for s in train_seqs}
        vu = {str(s["user_id"]) for s in val_seqs}
        assert not (tu & vu), "Hai file du lieu co nguoi dung trung nhau - ro ri tap"
    else:
        seqs = load_sequences(cfg.data_path, cfg.min_len, cfg.max_len)
        train_seqs, val_seqs = split_by_user(seqs, cfg.val_ratio, cfg.seed)

    train_loader = make_loader(
        train_seqs, cfg.batch_size, shuffle=True, bucket=cfg.bucket_by_length, seed=cfg.seed
    )
    val_loader = make_loader(val_seqs, cfg.batch_size, shuffle=False, bucket=cfg.bucket_by_length)

    # --- huan luyen ---
    model = build_model()
    trainer = Trainer(model, cfg)
    trainer.fit(train_loader, val_loader)

    # --- ket qua cuoi ---
    final = trainer.evaluate(val_loader)
    p, y = trainer.predict(val_loader)
    report = {
        "run": cfg.run_name,
        "val_metrics": final,
        "calibration": calibration_table(p, y),
        "w": [float(x) for x in model.w.detach().cpu()],
        "best_checkpoint": str(trainer.ckpt_path),
    }
    out = Path(cfg.out_dir) / "report.json"
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    curve = trainer.plot_curve()

    print("\n=== Ket qua tren tap kiem dinh ===")
    for k, v in final.items():
        print(f"  {k:12s}: {v}")
    print(f"\nBao cao: {out}")
    if curve:
        print(f"Bieu do: {curve}")


if __name__ == "__main__":
    main()
