import numpy as np
import pytest

from app.services.frequency_analysis import FrequencyAnalyzer, MalformedImageError


def test_frequency_analyzer_detects_natural_photo_spectral_decay() -> None:
    analyzer = FrequencyAnalyzer(size=128)
    
    # Simulate natural 1/f^2 image power law
    y, x = np.ogrid[:128, :128]
    r = np.sqrt((x - 64) ** 2 + (y - 64) ** 2) + 1.0
    natural_power = 1.0 / (r ** 2.0)
    natural_img = np.fft.ifft2(np.fft.ifftshift(np.sqrt(natural_power) * np.exp(1j * np.random.uniform(0, 2*np.pi, (128, 128))))).real
    natural_img = ((natural_img - natural_img.min()) / (natural_img.max() - natural_img.min()) * 255).astype(np.uint8)
    natural_img = np.stack([natural_img]*3, axis=-1)

    result = analyzer.analyze(natural_img)
    assert 0.0 <= result.score <= 1.0
    assert "radial_decay_slope" in result.indicators
    assert "azimuthal_anisotropy" in result.indicators
    assert "natural_slope_delta" in result.indicators
    assert len(result.indicators["radial_profile"]) == 15


def test_frequency_analyzer_flags_artificial_grid_spikes() -> None:
    analyzer = FrequencyAnalyzer(size=128)
    
    # Synthetic grid pattern with periodic spikes (diffusion upsampler lattice)
    synthetic_img = np.zeros((128, 128, 3), dtype=np.uint8)
    synthetic_img[::8, :] = 255
    synthetic_img[:, ::8] = 255

    result = analyzer.analyze(synthetic_img)
    assert result.indicators["azimuthal_anisotropy"] > 0.15
    assert result.score > 0.35


def test_frequency_analyzer_rejects_invalid_dimensions() -> None:
    analyzer = FrequencyAnalyzer(size=128)
    with pytest.raises(MalformedImageError):
        analyzer.analyze(np.zeros((16, 16, 3), dtype=np.uint8))

