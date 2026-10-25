import sys, pathlib
sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))
from app.models.fsrs import FSRSModel
from training.config import TrainConfig
from training.dataset import load_sequences, split_by_user, make_loader
from training.trainer import Trainer

cfg = TrainConfig(data_path="data/processed/sequences_train.parquet", out_dir="runs/default_w")
seqs = load_sequences(cfg.data_path, cfg.min_len, cfg.max_len)
_, val = split_by_user(seqs, cfg.val_ratio, cfg.seed)   # cùng cách tách với lúc huấn luyện
loader = make_loader(val, cfg.batch_size, shuffle=False, bucket=cfg.bucket_by_length)
print(Trainer(FSRSModel(), cfg).evaluate(loader))