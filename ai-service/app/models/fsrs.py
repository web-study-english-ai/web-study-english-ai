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

# Bien duoi / bien tren cho 17 tham so w0..w16.
# Nguon: quy uoc cua cong dong FSRS (fsrs-optimizer). Coi day la gia tri
# khoi diem hop ly, khong phai chan ly - truoc khi nop bao cao nen doi chieu
# lai voi repo goc va ghi ro phien ban da doi chieu.
#
# Dat o day chu khong o training/config.py vi day la thuoc tinh cua MO HINH,
# khong phai cua quy trinh huan luyen: Dockerfile chi COPY app/ nen code chay
# tren production khong nhin thay training/. training/config.py import nguoc lai.
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

N_PARAMS = len(DEFAULT_W)


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

    @torch.no_grad()
    def predict_step(
        self,
        stability: torch.Tensor,
        difficulty: torch.Tensor,
        elapsed_days: torch.Tensor,
        rating: torch.Tensor,
        is_new: torch.Tensor,
        max_interval: float = S_MAX,
        target_retention: float = 0.9,
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """Suy luan MOT luot on cho ca lo the. Dung cho endpoint /predict-retention.

        Khac forward(): forward() chay ca chuoi nhieu luot de huan luyen, con ham nay
        nhan trang thai hien tai cua the (S, D do backend luu) va tra trang thai sau
        luot on vua roi. Ca hai dung chung dung cac ham cong thuc ben tren, khong
        chep lai cong thuc lan hai - de endpoint khong bao gio lech voi ban huan luyen.

        Tham so:
            stability, difficulty : (B,) float. Voi the moi thi bi bo qua, truyen gi cung duoc.
            elapsed_days          : (B,) float, so ngay ke tu lan on truoc.
            rating                : (B,) long 1..4, diem nguoi hoc vua cham.
            is_new                : (B,) bool, True = the chua tung on.
            max_interval          : tran so ngay. La THAM SO chu khong doc tu app.config -
                                    module nay bi code huan luyen import, ma app.config
                                    doi INTERNAL_API_KEY ngay luc import.

        Tra ve (retrievability, new_stability, new_difficulty, interval_days).
        retrievability cua the moi la NaN: chua co lan on truoc nen dai luong nay
        khong ton tai. Router doi thanh null, khong bia so.
        """
        # The moi khong co S/D that. Thay bang gia tri giu cho HOP LE truoc khi tinh
        # de tranh chia cho 0 hoac luy thua so am -> NaN lan sang ca the cu trong lo.
        s = torch.where(is_new, torch.ones_like(stability), stability)
        d = torch.where(is_new, torch.full_like(difficulty, 5.0), difficulty)

        r = self.retrievability(elapsed_days, s)

        # Ca hai nhanh deu tinh cho toan lo roi moi chon bang where: giu vector hoa,
        # khong re nhanh bang Python (quy tac 11).
        s_succ = self.stability_on_success(s, d, r, rating)
        s_lapse = self.stability_on_lapse(s, d, r)
        s_review = torch.where(rating > 1, s_succ, s_lapse)
        d_review = self.next_difficulty(d, rating)

        new_stability = torch.where(is_new, self.init_stability(rating), s_review)
        new_difficulty = torch.where(is_new, self.init_difficulty(rating), d_review)

        retrievability = torch.where(is_new, torch.full_like(r, float("nan")), r)

        # round chu khong ceil: S'=1.1 ma tra 2 ngay thi luc den han R ~ 0.84,
        # da tut duoi nguong 0.9 truoc khi nguoi hoc kip on.
        interval = self.next_interval(new_stability, target_retention)
        interval_days = interval.round().clamp(1.0, float(max_interval))

        return retrievability, new_stability, new_difficulty, interval_days