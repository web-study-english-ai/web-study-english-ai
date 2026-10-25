"""Vong lap huan luyen mo hinh DSR (WSEA-41 buoc 4-5).

Trach nhiem cua lop Trainer:
  - chay epoch, tinh mat mat, cap nhat tham so
  - giu tham so trong mien hop le sau moi buoc
  - danh gia tren tap kiem dinh sau moi epoch
  - dung som khi khong cai thien, luu ban TOT NHAT chu khong phai ban cuoi
  - ghi nhat ky day du ra file de theo doi hoi tu va lam minh chung Jira
"""
from __future__ import annotations

import csv
import json
import time
from dataclasses import asdict
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from .config import TrainConfig, W_MAX, W_MIN
from .losses import TrainingError, batch_stats, bce_loss, check_finite
from .metrics import all_metrics


class Trainer:
    def __init__(self, model: nn.Module, cfg: TrainConfig):
        self.model = model.to(cfg.device)
        self.cfg = cfg
        self.opt = torch.optim.Adam(
            self.model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay
        )
        self.out_dir = Path(cfg.out_dir)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.ckpt_path = self.out_dir / "best.pt"
        self.history: list[dict] = []

        self.w_min = torch.tensor(W_MIN, dtype=torch.float32, device=cfg.device)
        self.w_max = torch.tensor(W_MAX, dtype=torch.float32, device=cfg.device)
        if self.model.w.numel() != self.w_min.numel():
            raise TrainingError(
                f"Mo hinh co {self.model.w.numel()} tham so nhung bang bien co "
                f"{self.w_min.numel()}. Kiem tra lai W_MIN/W_MAX trong config.py."
            )

    # ------------------------------------------------------------------
    @torch.no_grad()
    def _clamp_parameters(self) -> None:
        """Giu w trong mien hop le sau moi buoc cap nhat.

        Adam co the day tham so ra ngoai mien co nghia (vi du do ben ban dau am),
        tu do do ben thanh am -> ham mu bung -> NaN. Cat ve bien la cach re nhat
        de chan ca chuoi su co do.
        """
        self.model.w.data.clamp_(min=self.w_min, max=self.w_max)

    # ------------------------------------------------------------------
    def _train_epoch(self, loader: DataLoader, epoch: int) -> dict:
        self.model.train()
        total, n_seen, n_batch = 0.0, 0, 0
        grad_norm_sum = 0.0

        if hasattr(loader, "batch_sampler") and hasattr(loader.batch_sampler, "set_epoch"):
            loader.batch_sampler.set_epoch(epoch)

        for bi, (ratings, elapsed, mask) in enumerate(loader):
            ratings = ratings.to(self.cfg.device)
            elapsed = elapsed.to(self.cfg.device)
            mask = mask.to(self.cfg.device)

            self.opt.zero_grad(set_to_none=True)
            preds, labels = self.model(ratings, elapsed, mask)

            try:
                loss = bce_loss(preds, labels)
            except TrainingError as e:
                raise TrainingError(
                    f"Hong o epoch {epoch} lo {bi}. Thong ke lo: "
                    f"{batch_stats(preds.detach(), labels.detach())}. Goc: {e}"
                ) from e

            loss.backward()
            check_finite(self.model.w.grad, "w.grad")
            gn = torch.nn.utils.clip_grad_norm_(self.model.parameters(), self.cfg.grad_clip)
            grad_norm_sum += float(gn)
            self.opt.step()
            self._clamp_parameters()

            k = labels.numel()
            total += float(loss.detach()) * k
            n_seen += k
            n_batch += 1

        return {
            "train_loss": total / max(n_seen, 1),
            "train_reviews": n_seen,
            "grad_norm": grad_norm_sum / max(n_batch, 1),
        }

    # ------------------------------------------------------------------
    @torch.no_grad()
    def predict(self, loader: DataLoader) -> tuple[np.ndarray, np.ndarray]:
        """Chay mo hinh tren toan bo loader, tra ve (xac suat, nhan) dang numpy."""
        self.model.eval()
        ps, ys = [], []
        for ratings, elapsed, mask in loader:
            preds, labels = self.model(
                ratings.to(self.cfg.device), elapsed.to(self.cfg.device), mask.to(self.cfg.device)
            )
            ps.append(preds.detach().cpu().numpy())
            ys.append(labels.detach().cpu().numpy())
        return np.concatenate(ps), np.concatenate(ys)

    def evaluate(self, loader: DataLoader) -> dict:
        p, y = self.predict(loader)
        return all_metrics(p, y)

    # ------------------------------------------------------------------
    def fit(self, train_loader: DataLoader, val_loader: DataLoader) -> nn.Module:
        cfg = self.cfg
        cfg.save(self.out_dir / "config.json")

        best_val = float("inf")
        best_epoch = -1
        bad = 0
        t0 = time.time()

        print(f"\n{'ep':>3} {'train':>8} {'val':>8} {'auc':>7} {'rmse':>7} {'|g|':>7} {'giay':>6}")
        print("-" * 52)

        for ep in range(cfg.epochs):
            te = time.time()
            tr = self._train_epoch(train_loader, ep)
            va = self.evaluate(val_loader)
            dt = time.time() - te

            row = {
                "epoch": ep,
                **tr,
                "val_loss": va["log_loss"],
                "val_auc": va["auc"],
                "val_rmse_bins": va["rmse_bins"],
                "lr": self.opt.param_groups[0]["lr"],
                "seconds": round(dt, 2),
                "w": [round(float(x), 5) for x in self.model.w.detach().cpu()],
            }
            self.history.append(row)

            if ep % cfg.log_every == 0:
                print(
                    f"{ep:3d} {tr['train_loss']:8.4f} {va['log_loss']:8.4f} "
                    f"{va['auc']:7.4f} {va['rmse_bins']:7.4f} {tr['grad_norm']:7.3f} {dt:6.1f}"
                )

            # --- dung som theo tap kiem dinh ---
            if va["log_loss"] < best_val - cfg.min_delta:
                best_val, best_epoch, bad = va["log_loss"], ep, 0
                torch.save(
                    {
                        "state_dict": self.model.state_dict(),
                        "w": self.model.w.detach().cpu().tolist(),
                        "epoch": ep,
                        "val_loss": best_val,
                        "config": asdict(cfg),
                    },
                    self.ckpt_path,
                )
            else:
                bad += 1
                if bad >= cfg.patience:
                    print(f"Dung som o epoch {ep} (khong cai thien {bad} epoch lien tiep).")
                    break

            self._write_history()

        self._write_history()
        total_min = (time.time() - t0) / 60
        print(f"\nTot nhat: epoch {best_epoch}, val log-loss {best_val:.4f}. Tong {total_min:.1f} phut.")

        if best_epoch < 0:
            raise TrainingError("Khong epoch nao cai thien - kiem tra lr va du lieu.")

        ckpt = torch.load(self.ckpt_path, map_location=cfg.device, weights_only=False)
        self.model.load_state_dict(ckpt["state_dict"])
        return self.model

    # ------------------------------------------------------------------
    def _write_history(self) -> None:
        """Ghi nhat ky ra ca JSON va CSV. CSV de mo bang Excel, JSON de ve bieu do."""
        (self.out_dir / "history.json").write_text(
            json.dumps(self.history, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        if not self.history:
            return
        cols = [k for k in self.history[0] if k != "w"]
        with (self.out_dir / "history.csv").open("w", newline="", encoding="utf-8") as f:
            wr = csv.DictWriter(f, fieldnames=cols)
            wr.writeheader()
            for r in self.history:
                wr.writerow({k: r[k] for k in cols})

    def plot_curve(self) -> Path | None:
        """Ve duong cong mat mat - anh nay dinh kem vao comment Jira lam minh chung."""
        try:
            import matplotlib

            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
        except ImportError:
            print("Khong co matplotlib, bo qua buoc ve bieu do.")
            return None

        eps = [r["epoch"] for r in self.history]
        fig, ax = plt.subplots(figsize=(7, 4))
        ax.plot(eps, [r["train_loss"] for r in self.history], label="train")
        ax.plot(eps, [r["val_loss"] for r in self.history], label="val")
        best = min(self.history, key=lambda r: r["val_loss"])
        ax.axvline(best["epoch"], ls="--", lw=1, color="gray")
        ax.set_xlabel("epoch")
        ax.set_ylabel("log-loss")
        ax.set_title(f"{self.cfg.run_name} - val tot nhat {best['val_loss']:.4f} @ ep {best['epoch']}")
        ax.legend()
        fig.tight_layout()
        path = self.out_dir / "loss_curve.png"
        fig.savefig(path, dpi=140)
        plt.close(fig)
        return path
