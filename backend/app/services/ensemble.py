from dataclasses import dataclass
from typing import Protocol

import numpy as np

from app.services.frequency_analysis import FrequencyAnalyzer, SpectralResult


class ScoreDetector(Protocol):
    def predict(self, image: np.ndarray) -> float: ...


@dataclass(frozen=True)
class EnsembleResult:
    verdict: str
    confidence: float
    signals: dict[str, float]
    ai_probability: float = 0.5
    spectral_indicators: dict | None = None


class EnsembleDetector:
    """Combine independent signals into a binary AI or real verdict.

    Scores represent AI likelihood. Uses dynamic confidence-weighted voting:
    a signal is amplified proportionally to how far its score is from 0.5
    (i.e. how certain that individual detector is). This prevents one uncertain
    detector from dragging down a very confident spectral or CNN signal.

    Decision threshold 0.52 (down from 0.65) catches borderline AI images
    that used to fall into the ambiguous zone.
    """

    def __init__(
        self,
        cnn_detector: ScoreDetector | None,
        spectral_detector: FrequencyAnalyzer,
        threshold: float = 0.52,
        disagreement_margin: float = 0.3,
        third_party_detector: ScoreDetector | None = None,
    ) -> None:
        if not 0.0 <= threshold <= 1.0 or not 0.0 <= disagreement_margin <= 1.0:
            raise ValueError("Threshold and disagreement margin must be between 0 and 1")
        self.cnn_detector = cnn_detector
        self.spectral_detector = spectral_detector
        self.threshold = threshold
        self.disagreement_margin = disagreement_margin
        self.third_party_detector = third_party_detector

    # Base weights per detector type
    _BASE_WEIGHTS: dict[str, float] = {
        "spectral":     0.40,   # upgraded to 8-signal engine
        "cnn":          0.45,   # ResNet-18 ONNX backbone
        "third_party":  0.15,   # Gemini vision
    }

    @staticmethod
    def _confidence_margin(score: float) -> float:
        """Return how far score is from neutral 0.5 (range 0..1)."""
        return float(abs(score - 0.5) * 2.0)

    def predict(self, image: np.ndarray) -> EnsembleResult:
        spectral: SpectralResult = self.spectral_detector.analyze(image)
        signals: dict[str, float] = {"spectral": spectral.score}

        raw_scores: dict[str, float] = {"spectral": spectral.score}

        if self.cnn_detector is not None:
            try:
                cnn_score = float(self.cnn_detector.predict(image))
                signals["cnn"] = cnn_score
                raw_scores["cnn"] = cnn_score
            except Exception:
                pass

        if self.third_party_detector is not None:
            try:
                tp_score = float(self.third_party_detector.predict(image))
                signals["third_party"] = tp_score
                raw_scores["third_party"] = tp_score
            except Exception:
                pass

        # Dynamic confidence-weighted vote
        # Each detector gets base_weight × confidence_margin(its_score)
        # so high-certainty detectors dominate uncertain ones.
        total_weight = 0.0
        weighted_sum = 0.0
        for name, score in raw_scores.items():
            base = self._BASE_WEIGHTS.get(name, 0.2)
            # Only scale when multiple signals exist (otherwise keep base weight)
            if len(raw_scores) > 1:
                margin = self._confidence_margin(score)
                # Clamp: at least 20% of base weight so no signal vanishes entirely
                effective_weight = base * max(margin, 0.20)
            else:
                effective_weight = base
            weighted_sum += score * effective_weight
            total_weight += effective_weight

        weighted = float(weighted_sum / max(total_weight, 1e-9))
        weighted = float(np.clip(weighted, 0.0, 1.0))

        confidence = float(np.clip(abs(weighted - 0.5) * 2.0, 0.0, 1.0))
        verdict = "likely_ai" if weighted >= self.threshold else "likely_real"

        return EnsembleResult(
            verdict=verdict,
            confidence=confidence,
            signals=signals,
            ai_probability=weighted,
            spectral_indicators=getattr(spectral, "indicators", {}),
        )
