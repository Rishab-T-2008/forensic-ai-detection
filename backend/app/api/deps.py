from functools import lru_cache

from fastapi import HTTPException

from app.core.config import Settings, get_settings
from app.services.ensemble import EnsembleDetector
from app.services.frequency_analysis import FrequencyAnalyzer
from app.services.gemini_detector import GeminiScoreDetector
from app.services.model_inference import ONNXDetector


@lru_cache
def get_detector() -> EnsembleDetector:
    settings: Settings = get_settings()
    try:
        api_key = settings.gemini_api_key or settings.third_party_api_key
        try:
            third_party_detector = (
                GeminiScoreDetector(
                    api_key=api_key,
                    model=getattr(settings, "gemini_model", None),
                    endpoint=settings.third_party_api_url,
                )
                if api_key
                else None
            )
        except TypeError:
            third_party_detector = GeminiScoreDetector(api_key=api_key) if api_key else None

        cnn_detector = None
        if settings.model_path:
            try:
                cnn_detector = ONNXDetector(settings.model_path)
            except FileNotFoundError:
                if third_party_detector is None:
                    raise
                cnn_detector = None

        if cnn_detector is None and third_party_detector is None:
            raise HTTPException(
                status_code=503,
                detail=(
                    "No detector model was found and no Gemini/third-party API key is configured. "
                    f"Set GEMINI_API_KEY or THIRD_PARTY_API_KEY and/or export the ONNX model to {settings.model_path}."
                ),
            )

        return EnsembleDetector(
            cnn_detector=cnn_detector,
            spectral_detector=FrequencyAnalyzer(),
            threshold=settings.detector_threshold,
            third_party_detector=third_party_detector,
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc