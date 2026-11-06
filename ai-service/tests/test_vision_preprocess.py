"""Test app/vision/preprocess.py (WSEA-152). Anh sinh trong bo nho bang Pillow."""

import io

import pytest
from PIL import Image

from app.vision import preprocess as pp


def encode(img: Image.Image, fmt="JPEG", **kw) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format=fmt, **kw)
    return buf.getvalue()


def test_jpeg_rgb_ok():
    img = pp.load_image(encode(Image.new("RGB", (40, 20), (255, 0, 0))))
    assert img.mode == "RGB" and img.size == (40, 20)


def test_exif_orientation_applied():
    exif = Image.Exif()
    exif[0x0112] = 6  # Orientation = xoay 90 do
    data = encode(Image.new("RGB", (40, 20), (0, 255, 0)), exif=exif)
    img = pp.load_image(data)
    assert img.size == (20, 40)  # da xoay theo EXIF


@pytest.mark.parametrize("mode", ["RGBA", "L", "P", "LA"])
def test_png_any_mode_to_rgb(mode):
    img = pp.load_image(encode(Image.new(mode, (8, 8)), fmt="PNG"))
    assert img.mode == "RGB"


def test_webp_ok():
    assert pp.load_image(encode(Image.new("RGB", (8, 8)), fmt="WEBP")).mode == "RGB"


def test_empty():
    with pytest.raises(pp.ImageError) as ei:
        pp.load_image(b"")
    assert ei.value.code == pp.EMPTY


def test_too_large_rejected_before_decode():
    with pytest.raises(pp.ImageError) as ei:
        pp.load_image(b"\xff" * (pp.MAX_BYTES + 1))
    assert ei.value.code == pp.TOO_LARGE and "10 MB" in ei.value.message


@pytest.mark.parametrize("data", [b"day khong phai anh", b"%PDF-1.4 ...", b"\x00" * 100])
def test_not_image(data):
    with pytest.raises(pp.ImageError) as ei:
        pp.load_image(data)
    assert ei.value.code == pp.NOT_IMAGE


def test_truncated_jpeg_is_not_image():
    data = encode(Image.new("RGB", (200, 200), (1, 2, 3)))
    with pytest.raises(pp.ImageError) as ei:
        pp.load_image(data[: len(data) // 3])
    assert ei.value.code == pp.NOT_IMAGE


def test_unsupported_format():
    with pytest.raises(pp.ImageError) as ei:
        pp.load_image(encode(Image.new("RGB", (8, 8)), fmt="TIFF"))
    assert ei.value.code == pp.UNSUPPORTED


def test_too_many_pixels(monkeypatch):
    monkeypatch.setattr(pp, "MAX_PIXELS", 100)
    with pytest.raises(pp.ImageError) as ei:
        pp.load_image(encode(Image.new("RGB", (20, 20)), fmt="PNG"))
    assert ei.value.code == pp.TOO_MANY_PIXELS


def test_load_image_file(tmp_path, monkeypatch):
    p = tmp_path / "banana_01.jpg"
    p.write_bytes(encode(Image.new("RGB", (8, 8))))
    assert pp.load_image_file(p).size == (8, 8)
    monkeypatch.setattr(pp, "MAX_BYTES", 10)
    with pytest.raises(pp.ImageError) as ei:
        pp.load_image_file(p)
    assert ei.value.code == pp.TOO_LARGE


def test_image_error_is_value_error():
    assert issubclass(pp.ImageError, ValueError)
