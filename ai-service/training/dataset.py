"""Dataset chuoi on tap + collate + chia tap theo nguoi dung (WSEA-41 buoc 1-2).

Dau vao ky vong (san pham cua dot 2 - tien xu ly du lieu): mot file parquet
hoac jsonl, moi dong la MOT THE cua MOT NGUOI DUNG:

    user_id : str | int
    card_id : str | int
    ratings : list[int]    do dai n, gia tri 1..4
    elapsed : list[float]  do dai n, so ngay cach lan on truoc (phan tu dau = 0)

Quy uoc quan trong: phan tu thu 0 cua chuoi la lan hoc dau tien - dung de khoi
tao trang thai, KHONG tinh mat mat. Mat mat chi tinh tu phan tu thu 1 tro di.
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path
from typing import Any, Iterator, Sequence

import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader, Sampler

PAD_RATING = 1  # gia tri dem; bi mask che nen khong anh huong mat mat


# ----------------------------------------------------------------------------
# Doc du lieu
# ----------------------------------------------------------------------------
def load_sequences(
    path: str | Path,
    min_len: int = 2,
    max_len: int = 64,
) -> list[dict[str, Any]]:
    """Doc file chuoi, loc chuoi qua ngan, cat chuoi qua dai."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(
            f"Khong thay file du lieu: {path}. "
            "Chay buoc tien xu ly cua dot 2 truoc, hoac tro --data toi file dung."
        )

    if path.suffix in {".parquet", ".pq"}:
        import pandas as pd

        df = pd.read_parquet(path)
        rows = df.to_dict("records")
    elif path.suffix in {".jsonl", ".json"}:
        rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    else:
        raise ValueError(f"Dinh dang khong ho tro: {path.suffix} (dung .parquet hoac .jsonl)")

    seqs: list[dict[str, Any]] = []
    dropped_short = 0
    for r in rows:
        ratings = np.asarray(r["ratings"], dtype=np.int64)[:max_len]
        elapsed = np.asarray(r["elapsed"], dtype=np.float32)[:max_len]
        if len(ratings) != len(elapsed):
            raise ValueError(f"ratings va elapsed lech do dai o card {r.get('card_id')}")
        if len(ratings) < min_len:
            dropped_short += 1
            continue
        if ratings.min() < 1 or ratings.max() > 4:
            raise ValueError(f"rating ngoai mien 1..4 o card {r.get('card_id')}")
        if (elapsed < 0).any():
            raise ValueError(f"elapsed am o card {r.get('card_id')}")
        seqs.append(
            {
                "user_id": r["user_id"],
                "card_id": r["card_id"],
                "ratings": ratings,
                "elapsed": elapsed,
            }
        )

    n_users = len({s["user_id"] for s in seqs})
    n_reviews = sum(len(s["ratings"]) for s in seqs)
    print(
        f"[data] {path.name}: {len(seqs):,} chuoi | {n_users:,} nguoi dung | "
        f"{n_reviews:,} luot on | loai {dropped_short:,} chuoi ngan hon {min_len}"
    )
    return seqs


def split_by_user(
    seqs: Sequence[dict[str, Any]],
    val_ratio: float = 0.15,
    seed: int = 42,
) -> tuple[list[dict], list[dict]]:
    """Chia tap THEO NGUOI DUNG. Khong bao gio chia ngau nhien theo dong.

    Ly do: mot nguoi dung co thoi quen on rat rieng. Neu the cua cung mot nguoi
    nam ca o train va val, mo hinh hoc duoc thoi quen do va diem val dep gia.
    """
    users = sorted({str(s["user_id"]) for s in seqs})
    rng = random.Random(seed)
    rng.shuffle(users)
    n_val = max(1, int(len(users) * val_ratio))
    val_users = set(users[:n_val])

    train = [s for s in seqs if str(s["user_id"]) not in val_users]
    val = [s for s in seqs if str(s["user_id"]) in val_users]

    # Assert chong ro ri - mot dong nay tiet kiem ca buoi go loi
    tu = {str(s["user_id"]) for s in train}
    vu = {str(s["user_id"]) for s in val}
    assert not (tu & vu), f"Ro ri nguoi dung giua train va val: {list(tu & vu)[:5]}"
    assert len(train) > 0 and len(val) > 0, "Mot trong hai tap rong sau khi chia"

    print(f"[split] train {len(train):,} chuoi / {len(tu):,} nguoi | val {len(val):,} chuoi / {len(vu):,} nguoi")
    return train, val


# ----------------------------------------------------------------------------
# Dataset + collate
# ----------------------------------------------------------------------------
class ReviewSequenceDataset(Dataset):
    """Moi phan tu la mot chuoi on tap cua mot the."""

    def __init__(self, sequences: Sequence[dict[str, Any]]):
        self.seqs = list(sequences)

    def __len__(self) -> int:
        return len(self.seqs)

    def __getitem__(self, i: int):
        s = self.seqs[i]
        return (
            torch.as_tensor(s["ratings"], dtype=torch.long),
            torch.as_tensor(s["elapsed"], dtype=torch.float32),
        )

    def lengths(self) -> list[int]:
        return [len(s["ratings"]) for s in self.seqs]


def collate_sequences(batch):
    """Dem cac chuoi ve cung do dai trong mot lo, kem mask.

    Tra ve:
        ratings (B, L) long, elapsed (B, L) float, mask (B, L) bool
    mask[i, j] = True nghia la vi tri do la du lieu that, khong phai phan dem.
    """
    L = max(len(r) for r, _ in batch)
    B = len(batch)
    ratings = torch.full((B, L), PAD_RATING, dtype=torch.long)
    elapsed = torch.zeros(B, L, dtype=torch.float32)
    mask = torch.zeros(B, L, dtype=torch.bool)
    for i, (r, e) in enumerate(batch):
        n = len(r)
        ratings[i, :n] = r
        elapsed[i, :n] = e
        mask[i, :n] = True
    return ratings, elapsed, mask


class LengthBucketSampler(Sampler[list[int]]):
    """Gom cac chuoi co do dai gan nhau vao cung mot lo.

    Vi sao can: chuoi dai tu 2 toi 64 luot. Tron ngau nhien thi mot lo 512 chuoi
    ngan gap mot chuoi 64 luot se bi dem len 64 - lang phi 90% phep tinh.
    Gom theo do dai giam dang ke thoi gian moi epoch ma khong doi ket qua.
    """

    def __init__(self, lengths: Sequence[int], batch_size: int, shuffle: bool = True, seed: int = 42):
        self.lengths = list(lengths)
        self.batch_size = batch_size
        self.shuffle = shuffle
        self.seed = seed
        self.epoch = 0

    def set_epoch(self, epoch: int) -> None:
        self.epoch = epoch

    def __len__(self) -> int:
        return math.ceil(len(self.lengths) / self.batch_size)

    def __iter__(self) -> Iterator[list[int]]:
        rng = random.Random(self.seed + self.epoch)
        idx = list(range(len(self.lengths)))
        if self.shuffle:
            rng.shuffle(idx)
        # Sap xep trong tung khoi lon de van con tinh ngau nhien
        chunk = self.batch_size * 50
        batches: list[list[int]] = []
        for i in range(0, len(idx), chunk):
            block = sorted(idx[i : i + chunk], key=lambda k: self.lengths[k])
            for j in range(0, len(block), self.batch_size):
                batches.append(block[j : j + self.batch_size])
        if self.shuffle:
            rng.shuffle(batches)
        return iter(batches)


def make_loader(
    sequences: Sequence[dict[str, Any]],
    batch_size: int,
    shuffle: bool = True,
    bucket: bool = True,
    num_workers: int = 0,
    seed: int = 42,
) -> DataLoader:
    ds = ReviewSequenceDataset(sequences)
    if bucket:
        sampler = LengthBucketSampler(ds.lengths(), batch_size, shuffle=shuffle, seed=seed)
        return DataLoader(
            ds, batch_sampler=sampler, collate_fn=collate_sequences, num_workers=num_workers
        )
    return DataLoader(
        ds,
        batch_size=batch_size,
        shuffle=shuffle,
        collate_fn=collate_sequences,
        num_workers=num_workers,
    )


# ----------------------------------------------------------------------------
# Du lieu gia - dung cho kiem thu va chay thu vong lap khi chua co du lieu that
# ----------------------------------------------------------------------------
def make_synthetic_sequences(n_users: int = 20, cards_per_user: int = 10, seed: int = 0) -> list[dict]:
    """Sinh chuoi gia de chay thu vong huan luyen truoc khi co du lieu that.

    KHONG dung de bao cao so lieu - chi de kiem tra ma chay khong loi.
    """
    rng = np.random.default_rng(seed)
    out = []
    for u in range(n_users):
        for c in range(cards_per_user):
            n = int(rng.integers(2, 20))
            ratings = rng.integers(1, 5, size=n).astype(np.int64)
            elapsed = np.concatenate([[0.0], rng.exponential(5.0, size=n - 1)]).astype(np.float32)
            out.append(
                {"user_id": f"u{u}", "card_id": f"u{u}_c{c}", "ratings": ratings, "elapsed": elapsed}
            )
    return out
