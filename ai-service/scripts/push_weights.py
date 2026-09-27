import json, os, sys, torch
from huggingface_hub import HfApi

# Ten repo chua trong so, dat qua FSRS_WEIGHTS_REPO trong .env
DEFAULT_REPO = "Hieusss/wsea-fsrs-weights"

run_dir, version = sys.argv[1], sys.argv[2]
repo = os.environ.get("FSRS_WEIGHTS_REPO") or DEFAULT_REPO
api = HfApi(token=os.environ["HF_TOKEN"])

# 1. Tạo kho chứa trọng số (riêng tư)
api.create_repo(repo, private=True, exist_ok=True)

# 2. Tách 17 tham số ra file params.json
ckpt = torch.load(f"{run_dir}/best.pt", map_location="cpu", weights_only=False)
with open(f"{run_dir}/params.json", "w") as f:
    json.dump({"version": version, "w": ckpt["w"],
               "epoch": ckpt["epoch"], "val_log_loss": ckpt["val_loss"]}, f, indent=2)

# 3. Tải 5 file lên
api.upload_folder(folder_path=run_dir, repo_id=repo,
                  commit_message=f"{version}: {run_dir}",
                  allow_patterns=["best.pt", "params.json", "report.json",
                                  "config.json", "loss_curve.png"])

# 4. Gắn nhãn phiên bản
api.create_tag(repo, tag=version)
print(f"Xong: https://huggingface.co/{repo}/tree/{version}")