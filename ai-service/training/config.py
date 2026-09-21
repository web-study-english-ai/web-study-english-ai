"""Cau hinh huan luyen mo hinh DSR (WSEA-41).

Moi sieu tham so nam o mot cho duy nhat de bao cao tai lap duoc.
Khi chay thi nghiem, KHONG sua truc tiep so trong ma nguon - truyen qua CLI
hoac tao ban sao TrainConfig, roi ghi lai config vao ket qua.
"""
from __future__ import annotations

import json
import random
from dataclasses import dataclass, asdict, field
from pathlib import Path

import numpy as np
import torch

# Bien duoi / bien tren cho 17 tham so w0..w16.
# Nguon: quy uoc cua cong dong FSRS (fsrs-optimizer). Coi day la gia tri
# khoi diem hop ly, khong phai chan ly - truoc khi nop bao cao nen doi chieu
# lai voi repo goc va ghi ro phien ban da doi chieu.
W_MIN = [
    0.001, 0.001, 0.001, 0.001,   # w0..w3  do ben ban dau theo 4 muc danh gia
    1.0,   0.001, 0.001, 0.001,   # w4..w7  do kho ban dau + cap nhat do kho
    0.0,   0.0,   0.001,          # w8..w10 cap nhat do ben khi nho duoc
    0.001, 0.001, 0.001, 0.0,     # w11..w14 cap nhat do ben khi quen
    0.0,   1.0,                   # w15, w16 he so phat Kho / thuong De
]
W_MAX = [
    100.0, 100.0, 100.0, 100.0,
    10.0,  4.0,   4.0,   0.75,
    4.5,   0.8,   3.5,
    5.0,   0.25,  0.9,   4.0,
    1.0,   6.0,
]


@dataclass
class TrainConfig:
    # --- du lieu ---
    data_path: str = "data/processed/sequences_train.parquet"
    val_path: str | None = None       # None -> tu tach tu data_path THEO NGUOI DUNG
    val_ratio: float = 0.15
    min_len: int = 2
    max_len: int = 64

    # --- toi uu ---
    epochs: int = 50
    lr: float = 4e-2
    batch_size: int = 512
    weight_decay: float = 0.0
    grad_clip: float = 1.0

    # --- dung som ---
    patience: int = 5
    min_delta: float = 1e-4

    # --- ky thuat ---
    seed: int = 42
    device: str = "cpu"               # mo hinh 17 tham so, CPU du nhanh
    num_workers: int = 0
    bucket_by_length: bool = True     # gom chuoi dai gan nhau -> bot padding
    out_dir: str = "ai-service/training/runs/exp01"
    run_name: str = "exp01"
    log_every: int = 1

    extra: dict = field(default_factory=dict)

    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=2, ensure_ascii=False), encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path) -> "TrainConfig":
        return cls(**json.loads(Path(path).read_text(encoding="utf-8")))


def set_seed(seed: int) -> None:
    """Co dinh moi nguon ngau nhien. Goi TRUOC khi tao model va DataLoader."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.use_deterministic_algorithms(False)  # bat True se cham, khong can o day
