"""Sinh tap nhan CLIP zero-shot tu tu vung backend (WSEA-152).

    .\\.venv\\Scripts\\python.exe scripts\\build_vision_labels.py

Luat loc va LY DO: docs/vision/WSEA-152_tap_nhan_va_tieu_chi.md (chot 2026-11-04, TRUOC khi chay mo hinh).
Nguon: backend/prisma/data/vocab_7000.csv (backend so huu, CHI DOC). Duy Anh sua file do -> phai chay lai
script nay; manifest ghi commit git + sha256 cua file nguon de phat hien lech.
Dau ra: kb/vision_labels.csv + kb/vision_labels_manifest.json.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]          # ai-service/
REPO = ROOT.parent                                    # goc repo
SOURCE_REL = "backend/prisma/data/vocab_7000.csv"
DEFAULT_SOURCE = REPO / SOURCE_REL
DEFAULT_OUT = ROOT / "kb" / "vision_labels.csv"
DEFAULT_MANIFEST = ROOT / "kb" / "vision_labels_manifest.json"
RULE_VERSION = "v1-2026-11-04"
OUT_COLUMNS = ("word", "cefr", "pos", "meaning_vi", "topic_code", "rank")

CEFR_MAX = ("A1", "A2", "B1")
# Buoc 3: chu de vat the
TOPICS = ("NC", "TN", "AU", "DL", "GI", "KH", "SK", "HT", "NG")
# Buoc 3: vat the le o chu de khac (chup duoc, mot nghia ro)
EXTRA = ("phone", "telephone", "letter", "newspaper", "magazine", "radio", "tv", "stamp", "diary", "postcard",
         "mailbox", "parcel", "coin", "cash", "gun", "sword", "flag", "gift", "clock", "calendar", "bridge",
         "fountain", "globe", "arrow", "coffin", "crown")

# Buoc 4: danh tu chi NGUOI — regex tren nghia_vi + danh sach tay
PERSON_RE = re.compile(r"^(người(?! máy)|vận động viên|ca sĩ|diễn viên|nhạc sĩ|nhạc công|cầu thủ|bác sĩ|y tá|"
                       r"học sinh|sinh viên|giáo viên|thầy|nhà thơ|nhà sử|nhà khoa|nhà toán|nhà thiên|nhà hóa|"
                       r"nhà môi|nữ |nam |phi hành gia|cô gái|cậu bé|thiếu niên|thủ môn|trọng tài|khán giả|"
                       r"ảo thuật gia|tiểu thuyết gia|nhà soạn|họa sĩ|thợ|đầu bếp)")
PERSON_WORDS = (
    "actor", "actress", "astronaut", "astronomer", "athlete", "backpacker", "baby", "beginner", "boy",
    "celebrity", "champion", "chemist", "climber", "clown", "comedian", "composer", "creator", "dancer",
    "defender", "dentist", "diver", "dj", "doctor", "dr", "dragon", "entertainer", "environmentalist", "examiner",
    "fan", "fighter", "footballer", "freshman", "girl", "goalkeeper", "golfer", "guitarist", "headteacher",
    "historian", "instructor", "landlord", "learner", "magician", "mathematician", "monster", "musician",
    "novelist", "nurse", "painter", "performer", "photographer", "poet", "psychologist", "referee", "runner",
    "scholar", "schoolchild", "schoolmate", "schoolteacher", "singer", "smoker", "sophomore", "spectator",
    "superstar", "surgeon", "survivor", "swimmer", "teacher", "teammate", "teen", "teenager", "traveler", "vet")

# Buoc 5: khong chup duoc thanh MOT vat (bo phan trong, chat khi, tu chung chung, khai niem)
NOT_VISUAL = (
    "accessory", "alcohol", "animal", "award", "body", "brain", "compound", "creature", "crossing", "debris",
    "destination", "device", "dioxide", "dirt", "dust", "equipment", "farmland", "field", "file", "filling",
    "food", "foundation", "fuel", "furniture", "garment", "gas", "grocery", "ground", "heart", "image",
    "ingredient", "instrument", "junk", "kit", "lane", "light", "liver", "lung", "machine", "material", "menu",
    "mineral", "nectar", "object", "organ", "organism", "package", "photocopy", "picture", "plant", "poison",
    "reception", "refreshments", "route", "seawater", "server", "skeleton", "slot", "starter", "steam",
    "stomach", "takeaway", "tool", "track", "trail", "turning", "vehicle", "vein", "wetland", "wound",
    "wrapping")

# Buoc 6: da nghia ro (hai vat khac nhau) hoac la CHAT LIEU (khong phai mot vat)
POLYSEMY = (
    "bar", "bark", "bat", "bay", "board", "brass", "bronze", "bug", "bulb", "bush", "cab", "calf", "camp", "can",
    "cap", "card", "chain", "cloth", "coal", "cooler", "cotton", "cream", "crisp", "crow", "dial", "disc",
    "drill", "dump", "fan", "float", "frame", "fry", "glass", "gold", "hatch", "horn", "ink", "iron", "ivory",
    "jade", "jelly", "jet", "jumper", "key", "label", "leather", "lodge", "log", "marble", "monitor", "mount",
    "nail", "net", "oil", "palm", "pepper", "pipe", "platform", "plug", "pool", "pot", "powder", "pump", "rail",
    "ring", "robin", "rock", "rubber", "saw", "seal", "sheet", "shell", "silk", "slice", "star", "starter",
    "steel", "stick", "stone", "straw", "suit", "switch", "tablet", "tank", "tap", "tape", "terminal", "tie",
    "tile", "tin", "toast", "trap", "tube", "turkey", "vessel", "ward", "wax", "wood", "wool", "wrap")

# Buoc (a): noi chon / canh lon — chup canh chu khong chup mot vat (cong trinh, phong, co so, canh thien nhien)
PLACES_BUILT = (
    "airport", "apartment", "avenue", "bakery", "balcony", "basement", "bathroom", "bedroom", "bookshop",
    "bridge", "building", "cabin", "cafeteria", "campsite", "campus", "canteen", "castle", "cinema", "classroom",
    "clinic", "college", "crossroads", "dam", "disco", "drugstore", "entrance", "farm", "gallery", "garage",
    "garden", "greenhouse", "gym", "hall", "harbor", "highway", "hospital", "hostel", "hotel", "house", "hut",
    "kitchen", "lab", "laboratory", "library", "motorway", "museum", "palace", "pharmacy", "railroad",
    "railway", "resort", "restaurant", "road", "roadside", "room", "roundabout", "runway", "school", "shelter",
    "sidewalk", "stadium", "station", "studio", "theater", "tower", "university", "zoo")
PLACES_NATURE = (
    "beach", "cave", "cliff", "desert", "forest", "island", "jungle", "mountain", "mountaintop", "ocean", "pond",
    "rainforest", "reef", "river", "sea", "shore", "valley", "volcano", "waterfall")
PLACES = PLACES_BUILT + PLACES_NATURE

STEPS = ("chu_de", "nguoi", "khong_chup_duoc", "da_nghia_hoac_chat_lieu", "tu_ghep", "noi_chon")


# --- Ham thuan -----------------------------------------------------------------------------------


def load_vocab(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def drop_reason(r: dict) -> str | None:
    """Ly do loai mot tu da qua buoc 1-2 (theo dung thu tu buoc 3 -> 7 -> a); None = giu."""
    w = r["word"].strip()
    if not (r["topic_code"] in TOPICS or w in EXTRA):
        return "chu_de"
    if PERSON_RE.match(r["meaning_vi"].strip().lower()) or w in PERSON_WORDS:
        return "nguoi"
    if w in NOT_VISUAL:
        return "khong_chup_duoc"
    if w in POLYSEMY:
        return "da_nghia_hoac_chat_lieu"
    if not re.fullmatch(r"[a-z]+", w):
        return "tu_ghep"
    if w in PLACES:
        return "noi_chon"
    return None


def build_labels(rows: list[dict]) -> tuple[list[dict], dict]:
    """-> (nhan da sap theo rank tang, thong ke tung buoc). Khong cat theo rank."""
    concrete = [r for r in rows if r["is_concrete_noun"].strip().upper() == "TRUE"]
    base = [r for r in concrete if r["cefr"].strip() in CEFR_MAX]
    dropped: dict[str, list[str]] = {k: [] for k in STEPS}
    kept = []
    for r in base:
        why = drop_reason(r)
        if why:
            dropped[why].append(r["word"].strip())
        else:
            kept.append(r)
    kept.sort(key=lambda r: int(r["rank"]))
    labels = [{k: r[k].strip() for k in OUT_COLUMNS} for r in kept]
    words = [x["word"] for x in labels]
    if len(set(words)) != len(words):
        raise ValueError("tập nhãn có từ trùng")
    stats = {"total": len(rows), "concrete_noun": len(concrete), "cefr_le_b1": len(base),
             "dropped": {k: len(v) for k, v in dropped.items()}, "kept": len(labels),
             "cefr": dict(sorted(Counter(x["cefr"] for x in labels).items())),
             "topic": dict(Counter(x["topic_code"] for x in labels).most_common()),
             "dropped_words": {k: sorted(v) for k, v in dropped.items()}}
    return labels, stats


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, check=False).stdout.strip()


def source_info(path: Path) -> dict:
    """Duong dan + commit git gan nhat sua file nguon + blob o HEAD + sha256 + co sua chua commit khong."""
    rel = path.resolve().relative_to(REPO.resolve()).as_posix()
    return {"path": rel, "last_commit": git("log", "-1", "--format=%H", "--", rel),
            "blob_at_head": git("rev-parse", f"HEAD:{rel}"), "sha256": sha256(path),
            "dirty": bool(git("status", "--porcelain", "--", rel))}


def write_labels(path: Path, labels: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        w = csv.DictWriter(f, fieldnames=OUT_COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(labels)


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = ap.parse_args(argv)

    labels, stats = build_labels(load_vocab(args.source))
    write_labels(args.out, labels)
    manifest = {"task": "WSEA-152", "rule_version": RULE_VERSION,
                "rule_doc": "docs/vision/WSEA-152_tap_nhan_va_tieu_chi.md",
                "source": source_info(args.source),
                "output": {"path": args.out.resolve().relative_to(REPO.resolve()).as_posix(),
                           "sha256": sha256(args.out), "n_labels": len(labels)},
                "stats": {k: v for k, v in stats.items() if k != "dropped_words"}}
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
                             newline="\n")
    print(f"{stats['total']} từ → danh từ cụ thể {stats['concrete_noun']} → CEFR ≤ B1 {stats['cefr_le_b1']}")
    for k, v in stats["dropped"].items():
        print(f"  loại {k}: {v}")
    print(f"giữ {stats['kept']} nhãn · CEFR {stats['cefr']} · chủ đề {stats['topic']}")
    if manifest["source"]["dirty"]:
        print("CẢNH BÁO: file nguồn có thay đổi chưa commit")
    return 0


if __name__ == "__main__":
    sys.exit(main())
