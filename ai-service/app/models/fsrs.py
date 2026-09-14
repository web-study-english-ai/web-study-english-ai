"""Mo hinh du bao kha nang quen theo kien truc ba dai luong D-S-R.
Phien ban FSRS 4.5, 17 tham so w0..w16. Nhom tu cai dat bang PyTorch.
"""
import torch
import torch.nn as nn

DECAY = -0.5
FACTOR = 19.0 / 81.0

DEFAULT_W = [0.4, 0.9, 2.3, 10.9, 4.93, 0.94, 0.86, 0.01,
             1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61]

S_MIN, S_MAX = 0.01, 36500.0
D_MIN, D_MAX = 1.0, 10.0


class FSRSModel(nn.Module):
    def __init__(self, w=None):
        super().__init__()
        w = w or DEFAULT_W
        self.w = nn.Parameter(torch.tensor(w, dtype=torch.float32))

    def retrievability(self, t, s):
        """Xac suat con nho sau t ngay voi do ben s."""
        return torch.pow(1 + FACTOR * t / s, DECAY)
    def init_stability(self, rating):
        """S0(G) = w[G-1]. rating la tensor long 1..4."""
        return self.w[rating - 1].clamp(S_MIN, S_MAX)

    def init_difficulty(self, rating):
        """D0(G) = w4 - w5*(G-3). Cong thuc tuyen tinh cua FSRS 4.5, D0(Good) = w4."""
        d = self.w[4] - self.w[5] * (rating.float() - 3)
        return d.clamp(D_MIN, D_MAX)

    def next_difficulty(self, d, rating):
        d_new = d - self.w[6] * (rating.float() - 3)
        # FSRS 4.5 keo ve D0(Good) = w4, khong phai D0(Easy) nhu FSRS 5
        d_new = self.w[7] * self.w[4] + (1 - self.w[7]) * d_new
        return d_new.clamp(D_MIN, D_MAX)

    def stability_on_success(self, s, d, r, rating):
        hard = torch.where(rating == 2, self.w[15], torch.ones_like(s))
        easy = torch.where(rating == 4, self.w[16], torch.ones_like(s))
        inc = (torch.exp(self.w[8]) * (11 - d)
               * torch.pow(s, -self.w[9])
               * (torch.exp(self.w[10] * (1 - r)) - 1)
               * hard * easy)
        return (s * (1 + inc)).clamp(S_MIN, S_MAX)

    def stability_on_lapse(self, s, d, r):
        s_new = (self.w[11]
                 * torch.pow(d, -self.w[12])
                 * (torch.pow(s + 1, self.w[13]) - 1)
                 * torch.exp(self.w[14] * (1 - r)))
        # do ben sau khi quen khong duoc lon hon truoc khi quen
        return torch.minimum(s_new, s).clamp(S_MIN, S_MAX)
    def forward(self, ratings, elapsed, mask):
        """
        ratings: (B, L) long 1..4
        elapsed: (B, L) float, so ngay troi qua
        mask:    (B, L) bool, True tai vi tri co du lieu that
        Tra ve: preds, labels tu luot thu 2 tro di
        """
        B, L = ratings.shape
        s = self.init_stability(ratings[:, 0])
        d = self.init_difficulty(ratings[:, 0])
        preds, labels = [], []

        for i in range(1, L):
            r = self.retrievability(elapsed[:, i], s)
            valid = mask[:, i]
            preds.append(r[valid])
            labels.append((ratings[:, i][valid] > 1).float())

            rating_i = ratings[:, i]
            s_succ = self.stability_on_success(s, d, r, rating_i)
            s_lapse = self.stability_on_lapse(s, d, r)
            s = torch.where(rating_i > 1, s_succ, s_lapse)
            d = self.next_difficulty(d, rating_i)

        return torch.cat(preds), torch.cat(labels)
    def next_interval(self, s, target_retention=0.9):
        """Bai toan nguoc: cho nguong xac suat, tim so ngay."""
        return s / FACTOR * (target_retention ** (1 / DECAY) - 1)