# Image cho Hugging Face Spaces (SDK: docker), lang nghe cong 7860
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

WORKDIR /app

# HF Spaces chay container bang user khong phai root (uid 1000).
# Tao som de cac buoc sau chown/USER duoc.
RUN useradd -m -u 1000 appuser

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Cache mo hinh nam ngoai /app. Chi chown thu muc rong luc tao, KHONG chown -R
# sau khi tai: chown -R nhan doi dung luong lop image (moi file bi ghi lai).
# Tai bang appuser nen file da dung chu ngay tu dau.
ENV HF_HOME=/opt/hf-cache
RUN mkdir -p /opt/hf-cache && chown appuser:appuser /opt/hf-cache /app

# Chi copy 3 file can de lay MODEL_NAME/MODEL_REVISION: sua code khac khong lam
# mat cache lop tai mo hinh (~470 MB). Hang so lay tu embedder.py - mot nguon su
# that, khong chep revision vao Dockerfile.
COPY --chown=appuser:appuser app/__init__.py ./app/__init__.py
COPY --chown=appuser:appuser app/services/__init__.py ./app/services/__init__.py
COPY --chown=appuser:appuser app/services/embedder.py ./app/services/embedder.py

USER appuser
RUN python -c "from huggingface_hub import snapshot_download; \
from app.services.embedder import MODEL_NAME, MODEL_REVISION; \
snapshot_download(MODEL_NAME, revision=MODEL_REVISION, \
allow_patterns=['*.json', 'model.safetensors', 'sentencepiece.bpe.model', 'README.md'])"

# Mo hinh da nuong vao image -> embedder chi doc cache, khong goi Hub.
# KHONG dat HF_HUB_OFFLINE: load_fsrs van tai params.json tu Hub luc khoi dong.
ENV EMBEDDER_LOCAL_FILES_ONLY=true

COPY --chown=appuser:appuser app ./app

EXPOSE 7860

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
