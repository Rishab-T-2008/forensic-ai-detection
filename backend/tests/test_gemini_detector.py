import io

import numpy as np
import pytest
from PIL import Image

from app.api.deps import get_detector
from app.api.routes.detect import detect_image
from app.core.config import Settings
from app.services.gemini_detector import GeminiScoreDetector
from app.services.ensemble import EnsembleDetector


class _DummyResponse:
    status_code = 200

    def raise_for_status(self) -> None:
        return None

    def json(self):
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [{"text": "The AI likelihood score is 0.81"}]
                    }
                }
            ]
        }


def test_gemini_score_detector_parses_numeric_score(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_post(url, json, headers, timeout):
        assert url == "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"
        assert headers["x-goog-api-key"] == "test-key"
        return _DummyResponse()

    monkeypatch.setattr("app.services.gemini_detector.httpx.post", fake_post)

    detector = GeminiScoreDetector(api_key="test-key")
    score = detector.predict(np.zeros((64, 64, 3), dtype=np.uint8))

    assert score == pytest.approx(0.81)


def test_gemini_score_detector_prefers_labeled_score() -> None:
    assert GeminiScoreDetector._extract_score("0 = real, 1 = AI; score: 0.23") == pytest.approx(0.23)


def test_gemini_image_assistant_returns_concise_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    class _AnswerResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": "A blue sky is visible."}]}}]}

    def fake_post(url, json, headers, timeout):
        prompt = json["contents"][0]["parts"][0]["text"]
        assert "visible evidence" in prompt
        assert "Question: What is visible?" in prompt
        return _AnswerResponse()

    monkeypatch.setattr("app.services.gemini_detector.httpx.post", fake_post)

    answer = GeminiScoreDetector(api_key="test-key").answer(
        np.zeros((64, 64, 3), dtype=np.uint8), "What is visible?"
    )

    assert answer == "A blue sky is visible."
    assert "A blue sky is visible." in answer


def test_gemini_assistant_answers_general_questions_without_image(monkeypatch: pytest.MonkeyPatch) -> None:
    class _AnswerResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": "Diffusion models iteratively denoise random latents."}]}}]}

    def fake_post(url, json, headers, timeout):
        prompt = json["contents"][0]["parts"][0]["text"]
        assert "Question: How do diffusion models work?" in prompt
        return _AnswerResponse()

    monkeypatch.setattr("app.services.gemini_detector.httpx.post", fake_post)

    answer = GeminiScoreDetector(api_key="test-key").answer(None, "How do diffusion models work?")
    assert "Diffusion models iteratively denoise random latents." in answer


def test_ensemble_prioritizes_gemini_when_local_model_is_missing() -> None:
    """Verify that the ensemble correctly combines spectral + third-party signals.

    With the new dynamic confidence-weighted ensemble, both detectors must
    show elevated AI scores for the verdict to be likely_ai.  We use
    spectral=0.65, Gemini=0.9 which should yield a blended probability above
    the 0.52 threshold.
    """

    class _Spectral:
        def analyze(self, image):
            return type("Spectral", (), {"score": 0.65})()

    class _Gemini:
        def predict(self, image):
            return 0.9

    detector = EnsembleDetector(
        cnn_detector=None,
        spectral_detector=_Spectral(),
        third_party_detector=_Gemini(),
    )

    result = detector.predict(np.zeros((64, 64, 3), dtype=np.uint8))

    assert result.verdict == "likely_ai"
    assert result.ai_probability > 0.52


def test_get_detector_falls_back_to_gemini_without_local_model(monkeypatch: pytest.MonkeyPatch) -> None:
    class _DummySpectral:
        def analyze(self, image):
            class _Result:
                score = 0.35

            return _Result()

    class _DummyThirdParty:
        def __init__(self, api_key=None):
            self.api_key = api_key

        def predict(self, image):
            return 0.91

    def fake_get_settings():
        return Settings(model_path="missing.onnx", gemini_api_key="test-key", detector_threshold=0.65)

    monkeypatch.setattr("app.api.deps.get_settings", fake_get_settings)
    monkeypatch.setattr("app.api.deps.FrequencyAnalyzer", lambda: _DummySpectral())
    monkeypatch.setattr("app.api.deps.GeminiScoreDetector", _DummyThirdParty)

    from app import api as api_module

    api_module.deps.get_detector.cache_clear()
    detector = api_module.deps.get_detector()
    result = detector.predict(np.zeros((64, 64, 3), dtype=np.uint8))

    assert detector.third_party_detector is not None
    assert result.verdict in {"likely_ai", "likely_real"}


@pytest.mark.asyncio
async def test_detect_image_does_not_override_visual_result_from_filename() -> None:
    class _DummyDetector:
        def predict(self, image):
            class _Result:
                verdict = "likely_real"
                confidence = 0.2
                signals = {"cnn": 0.2, "spectral": 0.1}

            return _Result()

    image = io.BytesIO()
    Image.new("RGB", (64, 64), "white").save(image, format="PNG")
    image.seek(0)

    upload = pytest.importorskip("fastapi").UploadFile(
        filename="beach_photo.png",
        file=io.BytesIO(image.getvalue()),
    )

    result = await detect_image(
        upload=upload,
        settings=Settings(model_path="missing.onnx", detector_threshold=0.65),
        detector=_DummyDetector(),
    )

    # Neutral filename without EXIF → missing_exif_penalty lifts score slightly,
    # but no AI keyword so final verdict should still be real (ai_prob ≈ 0.14)
    assert result.verdict == "likely_real"


@pytest.mark.asyncio
async def test_detect_image_treats_ai_source_url_as_ai() -> None:
    class _DummyDetector:
        def predict(self, image):
            return type("Result", (), {"verdict": "likely_real", "confidence": 0.2, "signals": {"cnn": 0.2}})()

    image = io.BytesIO()
    Image.new("RGB", (64, 64), "white").save(image, format="PNG")
    image.seek(0)
    upload = pytest.importorskip("fastapi").UploadFile(filename="remote-image.png", file=io.BytesIO(image.getvalue()))

    result = await detect_image(
        upload=upload,
        source_url="https://example.com/ai-generated/portrait.png",
        settings=Settings(model_path="missing.onnx", detector_threshold=0.65),
        detector=_DummyDetector(),
    )

    assert result.verdict == "likely_ai"
    # Context hint boosts ai_prob to 0.82; confidence = |0.82-0.5|*2 ≈ 0.64
    assert result.confidence >= 0.60

