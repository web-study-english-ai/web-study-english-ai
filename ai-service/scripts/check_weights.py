import json, os, sys, torch
from huggingface_hub import HfApi, hf_hub_download

REPO = os.environ.get("FSRS_WEIGHTS_REPO") or "Hieusss/wsea-fsrs-weights"
tok = os.environ.get("HF_TOKEN") or sys.exit("Chưa đặt HF_TOKEN")
api = HfApi(token=tok)

main_sha = api.model_info(REPO).sha
print(f"main -> {main_sha[:7]}\n\nLịch sử upload:")
for c in api.list_repo_commits(REPO):
    print(f"  {c.commit_id[:7]}  {c.title}")

tags = api.list_repo_refs(REPO).tags
if not tags:
    sys.exit("\nChưa có tag nào")

for t in tags:
    same = "trùng main" if t.target_commit == main_sha else "KHÁC main -> kiểm tra lại"
    print(f"\nTag {t.name} -> {t.target_commit[:7]} ({same})")

    p = json.load(open(hf_hub_download(REPO, "params.json", revision=t.name, token=tok),
                       encoding="utf-8"))
    print(f"  params.json: version={p.get('version')}  epoch={p.get('epoch')}  "
          f"val_log_loss={p.get('val_log_loss')}  số tham số={len(p['w'])}")

    try:
        ck = torch.load(hf_hub_download(REPO, "best.pt", revision=t.name, token=tok),
                        map_location="cpu", weights_only=True)
        khop = torch.allclose(torch.as_tensor(ck["w"], dtype=torch.float32),
                              torch.tensor(p["w"], dtype=torch.float32))
        print(f"  best.pt: nạp được với weights_only=True, w khớp params.json: {khop}")
    except Exception as e:
        print(f"  best.pt: KHÔNG nạp được với weights_only=True ({type(e).__name__})")