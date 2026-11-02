"""Luat quyet dinh cua pipeline truy hoi trong dich vu AI (WSEA-127).

CHOT TRUOC KHI CHAY kiem offline — khong sua sau khi da thay ket qua.
Ly do tung hang so: docs/DECISIONS.md muc "2026-11-02 — WSEA-127".

Pipeline chay SAU khi backend gui ung vien (contexts/vocab/history, hop dong v0.3)
va TRUOC LLM. Luat ap theo thu tu, luat dau tien khop thi dung:
  1) contexts rong VA vocab rong VA word null                      -> NO_CONTEXT
  2) y dinh ngoai_pham_vi VA confidence >= tau (doc tu file trong so)
     VA word null VA khong co vocab match="exact" VA history rong  -> OUT_OF_SCOPE
  3) distance top-1 > MAX_TOP1_DISTANCE VA khong co vocab exact
     VA word null                                                  -> NO_CONTEXT
     (contexts rong thi khong co top-1 -> bo qua luat nay)
  4) con lai                                                       -> ANSWER
     (contexts + vocab rong nhung co word -> ANSWER voi danh sach rong, LLM dung word)
Sua 02/11 sau de7b528, truoc kiem offline: luat 1 va 3 them "VA word null" (DECISIONS muc d).
Buoc xep hang lai = identity (rerank TAT o WSEA-126).
"""

# --- Ten quyet dinh ---------------------------------------------------------------------------
ANSWER = "answer"
NO_CONTEXT = "no_context"
OUT_OF_SCOPE = "out_of_scope"

# --- Cat ung vien dua vao prompt --------------------------------------------------------------
K_PROMPT = 5  # so doan ngu phap vao prompt: top-5 theo distance e5 (WSEA-111 muc c, hit@5 0,839)
K_VOCAB = 3   # so tu vung vao prompt: exact truoc, roi vector theo distance

# --- Luoi an toan -----------------------------------------------------------------------------
# WSEA-111: distance top-1 cau duong max 0,199; cau am max 0,231. Chi chan cau rac ro rang.
MAX_TOP1_DISTANCE = 0.22  # chan khi distance top-1 > nguong (so sanh nghiem ngat)

# --- Luat dat cho kiem offline (B3) ------------------------------------------------------------
MAX_WRONG_BLOCK_POS = 1  # so cau duong toi da bi chan (quyet dinh != ANSWER) tren 31 cau
