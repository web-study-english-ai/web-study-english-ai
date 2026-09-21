"""Gom du lieu dang long (moi dong = mot luot on) thanh dang chuoi (WSEA-41 buoc 4).

Dau vao: san pham cua dot 2 - train.parquet / test.parquet tu notebook
01_tien_xu_ly_fsrs.ipynb. Moi dong la MOT LUOT ON:
    user_id, card_id, i, rating, delta_t (hoac elapsed_days), y, ...

Dau ra: dung luoc do ma training.dataset.load_sequences doi. Moi dong la MOT THE:
    user_id, card_id, ratings: list[int], elapsed: list[float]

Chay:
    python scripts/build_sequences.py --in data/raw/train.parquet \
        --out data/processed/sequences_train.parquet

May yeu RAM thi lay mau bot nguoi dung:
    python scripts/build_sequences.py --in data/raw/train.parquet \
        --out data/processed/sequences_train.parquet --max-users 100
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

# Cot bat buoc phai co trong file dau vao.
REQUIRED = ["user_id", "card_id", "rating"]


def pick_elapsed_column(df: pd.DataFrame) -> str:
    """Chon cot so ngay troi qua.

    Uu tien delta_t (notebook da dat luot dau = 0 - dung giao uoc cua
    load_sequences). Chi dung elapsed_days khi khong co delta_t, va khi do
    phai tu ep luot dau ve 0 vi du lieu goc danh dau luot dau bang -1.
    """
    if "delta_t" in df.columns:
        return "delta_t"
    if "elapsed_days" in df.columns:
        return "elapsed_days"
    raise SystemExit(
        "Khong thay cot 'delta_t' lan 'elapsed_days'. "
        f"Cac cot dang co: {list(df.columns)}"
    )


def build(
    src: Path,
    dst: Path,
    min_len: int = 2,
    max_users: int | None = None,
    seed: int = 42,
) -> None:
    if not src.exists():
        raise SystemExit(f"Khong thay file dau vao: {src}")

    print(f"[1/5] Doc {src} ...")
    df = pd.read_parquet(src)
    print(f"      {len(df):,} dong | {df.user_id.nunique():,} nguoi dung")

    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise SystemExit(f"Thieu cot bat buoc: {missing}. Dang co: {list(df.columns)}")

    el_col = pick_elapsed_column(df)
    print(f"      Dung cot '{el_col}' lam so ngay troi qua")

    # --- lay mau nguoi dung (tuy chon) ---
    if max_users is not None:
        users = np.sort(df.user_id.unique())
        if len(users) > max_users:
            rng = np.random.default_rng(seed)
            keep = rng.choice(users, size=max_users, replace=False)
            df = df[df.user_id.isin(keep)]
            print(f"[2/5] Lay mau {max_users:,} nguoi dung -> {len(df):,} dong")
        else:
            print(f"[2/5] Chi co {len(users):,} nguoi dung, khong can lay mau")
    else:
        print("[2/5] Giu toan bo nguoi dung")

    # --- sap xep dung thu tu thoi gian trong tung the ---
    order_col = "i" if "i" in df.columns else ("review_th" if "review_th" in df.columns else None)
    sort_keys = ["user_id", "card_id"] + ([order_col] if order_col else [])
    print(f"[3/5] Sap xep theo {sort_keys} ...")
    df = df.sort_values(sort_keys, kind="stable")

    # --- lam sach truoc khi gom ---
    df = df[df.rating.between(1, 4)]
    elapsed = df[el_col].astype("float32")
    # Luot dau trong du lieu goc mang gia tri -1; load_sequences cam so am.
    if order_col is not None:
        elapsed = elapsed.where(df[order_col] > 1, 0.0)
    df = df.assign(_elapsed=elapsed.clip(lower=0.0))

    # --- gom thanh chuoi ---
    print("[4/5] Gom theo (user_id, card_id) ...")
    g = df.groupby(["user_id", "card_id"], sort=False)
    out = pd.DataFrame(
        {
            "ratings": g["rating"].apply(lambda s: s.astype("int64").to_numpy()),
            "elapsed": g["_elapsed"].apply(lambda s: s.to_numpy()),
        }
    ).reset_index()

    n_before = len(out)
    out = out[out.ratings.map(len) >= min_len].reset_index(drop=True)
    dropped = n_before - len(out)

    n_reviews = int(out.ratings.map(len).sum())
    print(
        f"      {len(out):,} chuoi | {out.user_id.nunique():,} nguoi dung | "
        f"{n_reviews:,} luot on | loai {dropped:,} chuoi ngan hon {min_len}"
    )

    dst.parent.mkdir(parents=True, exist_ok=True)
    print(f"[5/5] Ghi {dst} ...")
    out.to_parquet(dst, index=False)
    print(f"      Xong. Kich thuoc: {dst.stat().st_size / 1e6:.1f} MB")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--in", dest="src", required=True, help="parquet dang long tu dot 2")
    ap.add_argument("--out", dest="dst", required=True, help="parquet dang chuoi cho WSEA-41")
    ap.add_argument("--min-len", type=int, default=2, help="chuoi ngan hon se bi loai")
    ap.add_argument("--max-users", type=int, default=None, help="lay mau bot nguoi dung")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    build(Path(args.src), Path(args.dst), args.min_len, args.max_users, args.seed)


if __name__ == "__main__":
    main()
