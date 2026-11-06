"""WSEA-112 — độ nhất quán nhãn: nhãn TÁC GIẢ tập test (Tâm, Duy Anh tự gán) so với nhãn chốt theo LABELING.md.

Nhãn tác giả = nhãn chốt, trừ dòng có note "tác giả gán <nhãn>". Bình không gán nhãn -> không tính.
Chạy: python kb/intent/review/author_agreement.py  (từ thư mục ai-service)
"""
import csv
import json
import re
from pathlib import Path

from sklearn.metrics import cohen_kappa_score, confusion_matrix

ROOT = Path(__file__).resolve().parents[1]
LABELS = ["nghia_tu", "cach_dung", "ngu_phap", "phan_biet", "ngoai_pham_vi"]
RATED_AUTHORS = {"tam", "duyanh"}

rows = list(csv.DictReader((ROOT / "intent_test.csv").open(encoding="utf-8", newline="")))
gold, author, diffs = [], [], []
for r in rows:
    if r["author"] not in RATED_AUTHORS:
        continue
    m = re.search(r"tác giả gán (\w+)", r["note"] or "")
    a = m.group(1) if m else r["label"]
    gold.append(r["label"])
    author.append(a)
    if a != r["label"]:
        diffs.append({"id": r["id"], "text": r["text"], "author": r["author"], "author_label": a, "final_label": r["label"]})

result = {
    "what": "Nhãn tác giả (Tâm, Duy Anh tự gán khi viết câu test) so với nhãn chốt theo LABELING.md",
    "n": len(gold),
    "agree": sum(g == a for g, a in zip(gold, author)),
    "accuracy": round(sum(g == a for g, a in zip(gold, author)) / len(gold), 4),
    "cohen_kappa": round(float(cohen_kappa_score(gold, author, labels=LABELS)), 4),
    "labels": LABELS,
    "confusion_matrix_rows_final_cols_author": confusion_matrix(gold, author, labels=LABELS).tolist(),
    "disagreements": diffs,
    "note": "Tâm ghi 'ngoai_pahm_vi' (lỗi gõ) được tính là ngoai_pham_vi. Bình không gán nhãn nên không tính.",
}
out = ROOT / "review" / "author_agreement.json"
out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
print(f"n={result['n']} khớp={result['agree']} ({result['accuracy']:.1%}) kappa={result['cohen_kappa']}")
for d in diffs:
    print(f"  {d['id']} [{d['author']}] tác giả={d['author_label']} -> chốt={d['final_label']}: {d['text']}")
