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
phai kem header `x-api-key` va chi duoc goi tu backend NestJS.

Hop dong voi backend: `docs/API_CONTRACT.md` (phien ban 0.2). Sua file do TRUOC khi sua code.

## Cau truc thu muc

```text
ai-service/
├── app/
│   ├── main.py            # khoi tao FastAPI, nap router, lifespan load model
│   ├── config.py          # doc env: INTERNAL_API_KEY, FSRS_WEIGHTS_*...
│   ├── deps.py            # dependency kiem tra API key noi bo
│   ├── routers/
│   │   ├── health.py      # /health              (hoan thanh)
│   │   ├── retention.py   # /predict-retention   (hoan thanh)
│   │   ├── vision.py      # /recognize/image     (stub)
│   │   └── rag.py         # /assistant/ask       (stub)
│   └── models/
│       ├── fsrs.py        # mo hinh DSR 17 tham so + predict_step
│       ├── weights.py     # nap trong so tu HF Hub luc khoi dong
│       └── schemas.py     # pydantic schema request/response
├── notebooks/             # notebook thu nghiem, tach khoi app
├── requirements.txt
├── Dockerfile
└── README.md
```

## Danh sach endpoint

| Phuong thuc | Duong dan | Trang thai | Mo ta |
| --- | --- | --- | --- |
| GET | `/health` | Hoan thanh | Kiem tra dich vu con song + da nap model chua. 503 khi degraded |
| POST | `/predict-retention` | Hoan thanh | Lo <= 500 the -> R, S moi, D moi, khoang on |
| POST | `/recognize/image` | Stub (501) | Nhan dien tu vung qua hinh anh |
| POST | `/assistant/ask` | Stub (501) | Tro ly hoi dap tieng Anh |

## Bien moi truong

| Bien | Mac dinh | Mo ta |
| --- | --- | --- |
| `INTERNAL_API_KEY` | *(bat buoc)* | Khoa API noi bo, toi thieu 32 ky tu. Khong co mac dinh - thieu thi dich vu khong khoi dong |
| `ENVIRONMENT` | `development` | Ten moi truong dang chay |
| `APP_VERSION` | `0.1.0` | Phien ban dich vu |
| `FSRS_WEIGHTS_SOURCE` | `hub` | `hub` = tai tu HF Hub · `default` = 17 tham so CHUA huan luyen, chi de test |
| `FSRS_WEIGHTS_REPO` | `Hieusss/wsea-fsrs-weights` | Kho chua trong so (private) |
| `FSRS_WEIGHTS_FILE` | `params.json` | Ten file trong so |
| `FSRS_WEIGHTS_REVISION` | `v1` | Tag phien ban trong so |
| `FSRS_MAX_INTERVAL` | `36500` | Tran so ngay cua khoang on |
| `HF_TOKEN` | *(bat buoc khi source=hub)* | Token Hugging Face, repo trong so la private |

Nap trong so that bai thi dich vu VAN khoi dong nhung o trang thai degraded:
`/health` tra 503 va `/predict-retention` tra 503 de backend dung fallback TypeScript.

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

curl -X POST http://localhost:7860/predict-retention \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cards":[{"card_id":"c1","stability":12.5,"difficulty":5.2,"elapsed_days":3,"rating":3}]}'
```

The moi (chua tung on) gui `stability` va `difficulty` bang `null`; dich vu tu khoi
tao theo cong thuc FSRS va tra `retrievability: null`.

## Chay test

```bash
pytest -q
pytest --cov=app --cov-report=term-missing
```

Tai lieu API tu dong: <http://localhost:7860/docs>

## Chay bang Docker

```bash
cd ai-service
docker build -t wsea-ai-service .
docker run --rm -p 7860:7860 --env-file .env wsea-ai-service
```

## Notebooks

Thu muc `notebooks/` chua cac notebook thu nghiem va tien xu ly du lieu, tach
hoan toan khoi ma nguon dich vu. Notebook chay tren Kaggle nen phu thuoc cua
chung khong nam trong `requirements.txt`.
