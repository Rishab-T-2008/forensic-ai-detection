import io
from PIL import Image, PngImagePlugin
from app.services.metadata_extractor import extract_metadata


def test_extract_metadata_detects_png_generation_info() -> None:
    img = Image.new("RGB", (64, 64), "white")
    png_info = PngImagePlugin.PngInfo()
    png_info.add_text("parameters", "A beautiful futuristic city\nSteps: 25, Sampler: DPM++ 2M, Seed: 12345")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG", pnginfo=png_info)
    bytes_data = buffer.getvalue()

    metadata = extract_metadata(bytes_data)
    assert "parameters" in metadata.ai_metadata
    assert "futuristic city" in metadata.ai_metadata["parameters"]


def test_extract_metadata_detects_c2pa_marker() -> None:
    # Synthetic byte stream containing c2pa marker
    sample = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20 + b"c2pa" + b"\x00" * 50
    metadata = extract_metadata(sample)
    assert metadata.c2pa_detected is True
