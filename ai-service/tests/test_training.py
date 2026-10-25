"""Kiem thu vong huan luyen (WSEA-41).
"""
from __future__ import annotations

import numpy as np
import pytest
import torch
import torch.nn as nn

from training.config import TrainConfig, set_seed
from training.dataset import (
    PAD_RATING,
    ReviewSequenceDataset,
    collate_sequences,
    make_loader,
    make_synthetic_sequences,
    split_by_user,
)
from training.losses import TrainingError, bce_loss
from training.metrics import auc, log_loss, rmse_bins
from training.trainer import Trainer


class DummyModel(nn.Module):
    """Mo hinh gia dung giao uoc voi FSRSModel: w 17 tham so, forward tra (preds, labels)."""

    def __init__(self):
        super().__init__()
        self.w = nn.Parameter(torch.full((17,), 0.5))

    def forward(self, ratings, elapsed, mask):
        preds, labels = [], []
        s = self.w[0].expand(ratings.shape[0])
        for i in range(1, ratings.shape[1]):
            r = torch.sigmoid(self.w[4] - elapsed[:, i] / (s + 1e-3))
            valid = mask[:, i]
            preds.append(r[valid])
            labels.append((ratings[:, i][valid] > 1).float())
            s = s + self.w[8]
        return torch.cat(preds), torch.cat(labels)


# ---------------------------------------------------------------- dataset
def test_collate_pads_and_masks():
    batch = [
        (torch.tensor([3, 3, 2]), torch.tensor([0.0, 3.0, 8.0])),
        (torch.tensor([1, 4]), torch.tensor([0.0, 1.0])),
    ]
    ratings, elapsed, mask = collate_sequences(batch)
    assert ratings.shape == (2, 3) and elapsed.shape == (2, 3) and mask.shape == (2, 3)
    assert mask[1].tolist() == [True, True, False]
    assert ratings[1, 2].item() == PAD_RATING
    assert elapsed[1, 2].item() == 0.0


def test_dataset_returns_tensors():
    ds = ReviewSequenceDataset(make_synthetic_sequences(n_users=2, cards_per_user=2))
    r, e = ds[0]
    assert r.dtype == torch.long and e.dtype == torch.float32 and len(r) == len(e)


def test_split_by_user_has_no_leak():
    seqs = make_synthetic_sequences(n_users=20, cards_per_user=3, seed=1)
    train, val = split_by_user(seqs, val_ratio=0.25, seed=42)
    tu = {s["user_id"] for s in train}
    vu = {s["user_id"] for s in val}
    assert not (tu & vu)
    assert len(train) + len(val) == len(seqs)


def test_split_is_reproducible():
    seqs = make_synthetic_sequences(n_users=30, cards_per_user=2, seed=3)
    a, _ = split_by_user(seqs, 0.2, seed=7)
    b, _ = split_by_user(seqs, 0.2, seed=7)
    assert [s["card_id"] for s in a] == [s["card_id"] for s in b]


def test_bucket_loader_covers_all_sequences():
    seqs = make_synthetic_sequences(n_users=10, cards_per_user=7, seed=2)
    loader = make_loader(seqs, batch_size=8, shuffle=True, bucket=True)
    total = sum(int(mask[:, 0].shape[0]) for _, _, mask in loader)
    assert total == len(seqs)


# ---------------------------------------------------------------- loss
def test_bce_matches_manual_value():
    p = torch.tensor([0.9, 0.1])
    y = torch.tensor([1.0, 0.0])
    expected = -np.mean([np.log(0.9), np.log(0.9)])
    assert abs(float(bce_loss(p, y)) - expected) < 1e-6


def test_bce_survives_extreme_probabilities():
    """p bang 0 hoac 1 phai bi clamp, khong duoc ra vo cung."""
    p = torch.tensor([0.0, 1.0])
    y = torch.tensor([1.0, 0.0])
    loss = bce_loss(p, y)
    assert torch.isfinite(loss)


def test_bce_rejects_nan_input():
    with pytest.raises(TrainingError):
        bce_loss(torch.tensor([float("nan"), 0.5]), torch.tensor([1.0, 0.0]))


def test_bce_rejects_empty_batch():
    with pytest.raises(TrainingError):
        bce_loss(torch.empty(0), torch.empty(0))


def test_gradient_flows_through_loss():
    m = DummyModel()
    ratings = torch.tensor([[3, 3, 2]])
    elapsed = torch.tensor([[0.0, 3.0, 8.0]])
    mask = torch.ones(1, 3, dtype=torch.bool)
    loss = bce_loss(*m(ratings, elapsed, mask))
    loss.backward()
    assert m.w.grad is not None and torch.isfinite(m.w.grad).all()


# ---------------------------------------------------------------- metrics
def test_metrics_on_known_values():
    p = np.array([0.9, 0.8, 0.2, 0.1])
    y = np.array([1.0, 1.0, 0.0, 0.0])
    assert auc(p, y) == 1.0
    assert log_loss(p, y) < 0.25
    assert 0.0 <= rmse_bins(p, y) <= 1.0


def test_auc_of_random_is_near_half():
    rng = np.random.default_rng(0)
    p = rng.random(20000)
    y = rng.integers(0, 2, 20000).astype(float)
    assert abs(auc(p, y) - 0.5) < 0.02


# ---------------------------------------------------------------- trainer
def _tiny_cfg(tmp_path, **kw) -> TrainConfig:
    base = dict(epochs=3, batch_size=16, patience=2, lr=1e-2, out_dir=str(tmp_path), run_name="test")
    base.update(kw)
    return TrainConfig(**base)


def test_trainer_runs_and_writes_logs(tmp_path):
    set_seed(0)
    seqs = make_synthetic_sequences(n_users=12, cards_per_user=5, seed=0)
    tr, va = split_by_user(seqs, 0.25, 0)
    t = Trainer(DummyModel(), _tiny_cfg(tmp_path))
    t.fit(make_loader(tr, 16), make_loader(va, 16, shuffle=False))

    assert (tmp_path / "history.json").exists()
    assert (tmp_path / "history.csv").exists()
    assert (tmp_path / "config.json").exists()
    assert (tmp_path / "best.pt").exists()
    assert len(t.history) >= 1
    assert all(np.isfinite(r["train_loss"]) for r in t.history)


def test_parameters_stay_in_bounds(tmp_path):
    """Sau khi huan luyen, moi tham so phai nam trong mien hop le."""
    from training.config import W_MAX, W_MIN

    set_seed(0)
    seqs = make_synthetic_sequences(n_users=8, cards_per_user=4, seed=0)
    tr, va = split_by_user(seqs, 0.25, 0)
    t = Trainer(DummyModel(), _tiny_cfg(tmp_path, lr=0.5))  # lr lon co y de day tham so ra bien
    t.fit(make_loader(tr, 16), make_loader(va, 16, shuffle=False))

    w = t.model.w.detach().numpy()
    assert (w >= np.array(W_MIN) - 1e-6).all()
    assert (w <= np.array(W_MAX) + 1e-6).all()


def test_early_stopping_triggers(tmp_path):
    """Mo hinh dong bang (khong hoc) phai kich hoat dung som som hon so epoch toi da."""
    set_seed(0)
    seqs = make_synthetic_sequences(n_users=8, cards_per_user=4, seed=0)
    tr, va = split_by_user(seqs, 0.25, 0)
    m = DummyModel()
    cfg = _tiny_cfg(tmp_path, epochs=20, patience=2, lr=0.0)
    t = Trainer(m, cfg)
    t.fit(make_loader(tr, 16), make_loader(va, 16, shuffle=False))
    assert len(t.history) < 20


def test_best_checkpoint_is_restored(tmp_path):
    set_seed(0)
    seqs = make_synthetic_sequences(n_users=10, cards_per_user=4, seed=0)
    tr, va = split_by_user(seqs, 0.25, 0)
    t = Trainer(DummyModel(), _tiny_cfg(tmp_path, epochs=6, patience=2))
    t.fit(make_loader(tr, 16), make_loader(va, 16, shuffle=False))
    ckpt = torch.load(tmp_path / "best.pt", map_location="cpu", weights_only=False)
    best_epoch = min(t.history, key=lambda r: r["val_loss"])["epoch"]
    assert ckpt["epoch"] == best_epoch
    assert torch.allclose(t.model.w.detach(), torch.tensor(ckpt["w"]), atol=1e-6)


def test_training_is_reproducible_with_same_seed(tmp_path):
    def run(tag):
        set_seed(123)
        seqs = make_synthetic_sequences(n_users=10, cards_per_user=4, seed=0)
        tr, va = split_by_user(seqs, 0.25, 0)
        t = Trainer(DummyModel(), _tiny_cfg(tmp_path / tag, epochs=3))
        t.fit(make_loader(tr, 16, seed=123), make_loader(va, 16, shuffle=False))
        return [r["val_loss"] for r in t.history]

    assert np.allclose(run("a"), run("b"), atol=1e-8)
