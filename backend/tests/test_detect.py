import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api.deps import get_detector
from app.core.config import get_settings
from app.main import app


class TestDetector:
    def predict(self, image: np.ndarray):
        from app.services.ensemble import EnsembleResult

        return EnsembleResult("likely_real", 0.8, {"cnn": 0.2, "spectral": 0.3})


def image_bytes() -> bytes:
    image = Image.new("RGB", (64, 64), "white")
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


@pytest.fixture
def client():
    app.dependency_overrides[get_detector] = lambda: TestDetector()
    app.dependency_overrides[get_settings] = lambda: get_settings.__wrapped__()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_valid_image(client: TestClient) -> None:
    response = client.post("/api/v1/detect/image", files={"upload": ("image.png", image_bytes(), "image/png")})
    assert response.status_code == 200
    assert set(response.json()) == {
        "verdict",
        "confidence",
        "ai_percentage",
        "real_percentage",
        "signals",
        "disclaimer",
        "metadata",
        "entity_info",
    }


@pytest.mark.asyncio
async def test_oversized_file(client: TestClient) -> None:
    original = get_settings()
    app.dependency_overrides[get_settings] = lambda: original.model_copy(update={"max_upload_size": 10})
    response = client.post("/api/v1/detect/image", files={"upload": ("image.png", image_bytes(), "image/png")})
    assert response.status_code == 413


@pytest.mark.asyncio
async def test_wrong_mime(client: TestClient) -> None:
    response = client.post("/api/v1/detect/image", files={"upload": ("file.txt", b"plain text", "text/plain")})
    assert response.status_code == 415


@pytest.mark.asyncio
async def test_corrupt_bytes(client: TestClient) -> None:
    response = client.post("/api/v1/detect/image", files={"upload": ("image.png", b"not an image", "image/png")})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_empty_file(client: TestClient) -> None:
    response = client.post("/api/v1/detect/image", files={"upload": ("empty.png", b"", "image/png")})
    assert response.status_code == 400