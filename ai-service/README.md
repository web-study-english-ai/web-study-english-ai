---
title: Web Study English AI Service
emoji: 📚
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# AI Service

Dich vu AI cua nen tang **Web Study English AI**, viet bang Python + FastAPI,
trien khai tren Hugging Face Spaces (SDK Docker).

Dich vu nay khong mo cong khai cho trinh duyet: moi request (tru `/health`) deu
phai kem header `X-Internal-Api-Key` va chi duoc goi tu backend NestJS.

## Cau truc thu muc

```text
ai-service/
├── app/
│   ├── main.py            # khoi tao FastAPI, nap router, lifespan load model
│   ├── config.py          # doc env: INTERNAL_API_KEY, model paths...
│   ├── deps.py            # dependency kiem tra API key noi bo
│   ├── routers/
│   │   ├── health.py      # /health              (dot nay chi can cai nay chay)
│   │   ├── forgetting.py  # /predict/forgetting  (stub)
│   │   ├── vision.py      # /recognize/image     (stub)
│   │   └── rag.py         # /assistant/ask       (stub)
│   └── models/            # pydantic schema + noi load model ML sau nay
├── notebooks/             # notebook thu nghiem, tach khoi app
├── requirements.txt
├── Dockerfile
└── README.md
```

## Danh sach endpoint

| Phuong thuc | Duong dan | Trang thai | Mo ta |
| --- | --- | --- | --- |
| GET | `/health` | Hoan thanh | Kiem tra dich vu con song |
| POST | `/predict/forgetting` | Stub (501) | Du doan xac suat quen tu |
| POST | `/recognize/image` | Stub (501) | Nhan dien tu vung qua hinh anh |
| POST | `/assistant/ask` | Stub (501) | Tro ly hoi dap tieng Anh |

## Bien moi truong

| Bien | Mac dinh | Mo ta |
| --- | --- | --- |
| `INTERNAL_API_KEY` | `dev-internal-key` | Khoa API noi bo giua backend va ai-service |
| `ENVIRONMENT` | `development` | Ten moi truong dang chay |
| `APP_VERSION` | `0.1.0` | Phien ban dich vu |

Tren Hugging Face Spaces, khai bao cac bien nay tai
**Settings > Variables and secrets**.

## Chay cuc bo

```bash
cd ai-service
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 7860
```

Kiem tra:

```bash
curl http://localhost:7860/health
```

Tai lieu API tu dong: <http://localhost:7860/docs>

## Chay bang Docker

```bash
cd ai-service
docker build -t wsea-ai-service .
docker run --rm -p 7860:7860 -e INTERNAL_API_KEY=dev-internal-key wsea-ai-service
```

## Notebooks

Thu muc `notebooks/` chua cac notebook thu nghiem va tien xu ly du lieu, tach
hoan toan khoi ma nguon dich vu. Notebook chay tren Kaggle nen phu thuoc cua
chung khong nam trong `requirements.txt`.
