"""Cau hinh chung cho pytest.

Dat bien moi truong TRUOC khi bat ky module nao cua app duoc import: app.config
doc env ngay luc import va cache bang lru_cache, nen dat muon se khong an.

FSRS_WEIGHTS_SOURCE=default de test khong phu thuoc mang va HF_TOKEN.
"""

import os

TEST_API_KEY = "test-key-chi-dung-trong-pytest-0123456789abcdef"

os.environ["INTERNAL_API_KEY"] = TEST_API_KEY
os.environ["FSRS_WEIGHTS_SOURCE"] = "default"
os.environ["ENVIRONMENT"] = "test"
