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
# Dinh nghia that nam trong app/models/fsrs.py - chung la thuoc tinh cua mo hinh,
# khong phai cua quy trinh huan luyen. Docker chi COPY app/ nen ma chay tren
# production khong nhin thay thu muc training/; de o day thi service se ImportError.
# Re-export de cac duong import cu (trainer.py, tests/) khong phai sua.
from app.models.fsrs import W_MAX, W_MIN  # noqa: F401


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
