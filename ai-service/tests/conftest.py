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
os.environ["EMBEDDER_ENABLED"] = "false"
os.environ["VISION_ENABLED"] = "false"  # khong tai CLIP that trong test
# .env co the chua LLM_API_KEY that: de bang khoa gia + host .invalid -> test khong bao gio goi Groq.
TEST_LLM_KEY = "gsk_test_khoa_gia_chi_dung_trong_pytest_0123456789"
os.environ["LLM_API_KEY"] = TEST_LLM_KEY
os.environ["LLM_BASE_URL"] = "http://llm.invalid/openai/v1"
os.environ["LLM_MODEL"] = "openai/gpt-oss-120b"
os.environ["LLM_FALLBACK_MODEL"] = "openai/gpt-oss-20b"
