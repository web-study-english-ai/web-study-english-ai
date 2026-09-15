"""Dataset va collate cho chuoi luot on tap."""
import torch
from torch.utils.data import Dataset


class ReviewDataset(Dataset):
    def __init__(self, sequences):
        self.seqs = sequences   # ket qua build_sequences o notebook tien xu ly

    def __len__(self):
        return len(self.seqs)

    def __getitem__(self, i):
        s = self.seqs[i]
        return torch.tensor(s["ratings"]), torch.tensor(s["elapsed"])


def collate(batch):
    """Dem cac chuoi ve cung do dai, kem mask."""
    L = max(len(r) for r, _ in batch)
    B = len(batch)
    ratings = torch.ones(B, L, dtype=torch.long)    # dem bang 1
    elapsed = torch.zeros(B, L)
    mask = torch.zeros(B, L, dtype=torch.bool)
    for i, (r, e) in enumerate(batch):
        n = len(r)
        ratings[i, :n] = r
        elapsed[i, :n] = e
        mask[i, :n] = True
    return ratings, elapsed, mask