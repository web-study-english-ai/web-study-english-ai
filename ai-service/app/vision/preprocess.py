"""Mo anh nguoi hoc gui len: kiem dung luong, giai ma bang Pillow, xoay theo EXIF, doi sang RGB (WSEA-152).

Moi loi -> ImageError(code, message) voi code co dinh (router/script loc theo code, khong theo cau chu):
  empty, too_large, not_image, unsupported_format, too_many_pixels.
"""

from __future__ import annotations

import io
import warnings
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_BYTES = 10 * 1024 * 1024  # 10 MB
# Anh dien thoai thuong <= 50 MP; chan "bom giai nen" (anh nho tren dia, cuc lon khi giai ma).
MAX_PIXELS = 60_000_000
# MPO = JPEG nhieu khung cua mot so camera/dien thoai. HEIC khong ho tro (Pillow can plugin rieng).
ALLOWED_FORMATS = ("JPEG", "MPO", "PNG", "WEBP", "BMP", "GIF")

EMPTY = "empty"
TOO_LARGE = "too_large"
NOT_IMAGE = "not_image"
UNSUPPORTED = "unsupported_format"
TOO_MANY_PIXELS = "too_many_pixels"


class ImageError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def load_image(data: bytes) -> Image.Image:
    """bytes anh -> PIL.Image RGB da xoay theo EXIF. Sai -> ImageError."""
    if not data:
        raise ImageError(EMPTY, "File rỗng")
    if len(data) > MAX_BYTES:
        raise ImageError(TOO_LARGE, f"Ảnh {len(data) / 1024 / 1024:.1f} MB vượt giới hạn {MAX_BYTES // 1024 // 1024} MB")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            img = Image.open(io.BytesIO(data))
            fmt = img.format
            if fmt not in ALLOWED_FORMATS:
                raise ImageError(UNSUPPORTED, f"Định dạng {fmt} không hỗ trợ (nhận {', '.join(ALLOWED_FORMATS)})")
            w, h = img.size
            if w * h > MAX_PIXELS:
                raise ImageError(TOO_MANY_PIXELS, f"Ảnh {w}×{h} quá nhiều điểm ảnh (tối đa {MAX_PIXELS:,})")
            img.load()  # giai ma that: file hong/cut cut se loi o day
            img = ImageOps.exif_transpose(img)
            return img.convert("RGB")
    except ImageError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ImageError(TOO_MANY_PIXELS, "Ảnh quá nhiều điểm ảnh") from exc
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise ImageError(NOT_IMAGE, "File không phải ảnh hoặc ảnh bị hỏng") from exc


def load_image_file(path: Path | str) -> Image.Image:
    """Nhu load_image, doc tu file; kiem dung luong TRUOC khi doc vao RAM."""
    p = Path(path)
    size = p.stat().st_size
    if size > MAX_BYTES:
        raise ImageError(TOO_LARGE, f"Ảnh {size / 1024 / 1024:.1f} MB vượt giới hạn {MAX_BYTES // 1024 // 1024} MB")
    return load_image(p.read_bytes())
