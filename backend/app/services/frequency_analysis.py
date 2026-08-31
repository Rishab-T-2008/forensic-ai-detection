from dataclasses import dataclass

import cv2
import numpy as np


class MalformedImageError(ValueError):
    """Raised when image bytes cannot be decoded into a usable image."""


@dataclass(frozen=True)
class SpectralResult:
    score: float
    indicators: dict[str, float | list[float]]


class FrequencyAnalyzer:
    """High-accuracy multi-factor frequency analysis for AI vs real discrimination.

    Evaluates 8 independent forensic signals:
    1.  Radial power spectrum decay slope (1/f^alpha, natural alpha ≈ 2.0) — 48 radial bins
    2.  Azimuthal anisotropy (directional spikes from transposed convolution grids)
    3.  High-to-low radial frequency power ratio
    4.  2D Discrete Cosine Transform (DCT) high-frequency tail energy
    5.  Noise residual analysis — Laplacian-of-Gaussian per-channel variance
    6.  Local Binary Pattern (LBP) texture entropy — repeating textures expose AI
    7.  Edge coherence — Canny edge map contour continuity
    8.  Colour histogram smoothness — AI generators over-smooth per-channel histograms
    """

    def __init__(self, size: int = 384) -> None:
        if size < 32:
            raise ValueError("Frequency analysis size must be at least 32 pixels")
        self.size = size

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _lbp_entropy(gray: np.ndarray, tile_size: int = 32) -> float:
        """Compute Local Binary Pattern histogram entropy across image tiles.

        Real images have diverse micro-texture -> high entropy.
        AI images have repeating latent textures -> low entropy.
        """
        try:
            h, w = gray.shape
            hist_accum = np.zeros(256, dtype=np.float64)
            count = 0
            offsets = [(-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1)]
            for y in range(0, h - tile_size + 1, tile_size):
                for x in range(0, w - tile_size + 1, tile_size):
                    tile = gray[y : y + tile_size, x : x + tile_size].astype(np.uint8)
                    lbp = np.zeros_like(tile, dtype=np.uint8)
                    for shift, (dy, dx) in enumerate(offsets):
                        neighbor = np.roll(np.roll(tile, dy, axis=0), dx, axis=1)
                        lbp += ((tile >= neighbor).astype(np.uint8)) << shift
                    hist = cv2.calcHist([lbp], [0], None, [256], [0, 256]).ravel()
                    hist_accum += hist
                    count += 1
            if count == 0 or hist_accum.sum() == 0:
                return 6.0
            prob = hist_accum / hist_accum.sum()
            prob = prob[prob > 0]
            return float(-np.sum(prob * np.log2(prob)))
        except Exception:
            return 6.0

    @staticmethod
    def _noise_residual_variance(bgr: np.ndarray) -> float:
        """Per-channel Laplacian residual variance.

        Real camera images contain Poisson shot noise -> high per-channel variance.
        Diffusion model images are aggressively denoised -> very low variance.
        """
        try:
            kernel = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float32)
            variances = []
            for c in range(min(bgr.shape[2], 3)):
                channel = bgr[:, :, c].astype(np.float32)
                residual = cv2.filter2D(channel, -1, kernel)
                variances.append(float(np.var(residual)))
            return float(np.mean(variances)) if variances else 50.0
        except Exception:
            return 50.0

    @staticmethod
    def _edge_coherence(gray: np.ndarray) -> float:
        """Canny edge map contour coherence score.

        Real photos have long, smooth, physics-consistent edge chains.
        AI images have broken, short, semantically inconsistent edges.
        Returns ratio of large contours (area > 50) to all contours (higher = more real).
        """
        try:
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            edges = cv2.Canny(blurred, 30, 100)
            contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                return 0.5
            areas = [cv2.contourArea(c) for c in contours]
            large = sum(1 for a in areas if a > 50)
            return float(large / max(len(contours), 1))
        except Exception:
            return 0.5

    @staticmethod
    def _colour_histogram_smoothness(bgr: np.ndarray) -> float:
        """Measure per-channel histogram smoothness.

        Real camera images have sharp WB peaks and natural histogram shapes.
        Diffusion models over-smooth histograms -> high smoothness score.
        Returns a score in [0, 1] where 1 = maximally smooth (AI).
        """
        try:
            smoothness_scores = []
            for c in range(min(bgr.shape[2], 3)):
                hist = cv2.calcHist([bgr], [c], None, [64], [0, 256]).ravel()
                hist_f = hist.astype(np.float32)
                total = float(hist_f.sum())
                if total == 0:
                    continue
                hist_f /= total
                roughness = float(np.mean(np.abs(np.diff(hist_f))))
                smoothness_scores.append(roughness)
            if not smoothness_scores:
                return 0.5
            mean_roughness = float(np.mean(smoothness_scores))
            # Empirical calibration: roughness < 0.003 => AI, > 0.012 => real
            return float(np.clip(1.0 - (mean_roughness - 0.003) / 0.009, 0.0, 1.0))
        except Exception:
            return 0.5

    # ------------------------------------------------------------------
    # Main analysis
    # ------------------------------------------------------------------

    def analyze(self, image: np.ndarray) -> SpectralResult:
        if not isinstance(image, np.ndarray) or image.size == 0 or image.ndim not in (2, 3):
            raise MalformedImageError("Expected a non-empty grayscale or BGR image array")
        if image.shape[0] < 32 or image.shape[1] < 32:
            raise MalformedImageError("Image must be at least 32x32 pixels")

        is_color = image.ndim == 3
        grayscale = image if not is_color else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        bgr_resized = (
            cv2.resize(image, (self.size, self.size), interpolation=cv2.INTER_AREA)
            if is_color
            else np.stack([cv2.resize(grayscale, (self.size, self.size), interpolation=cv2.INTER_AREA)] * 3, axis=-1)
        )
        gray_resized = cv2.resize(grayscale, (self.size, self.size), interpolation=cv2.INTER_AREA)
        normalized = gray_resized.astype(np.float32) / 255.0
        centered = normalized - normalized.mean()

        # 2D Fast Fourier Transform
        fft = np.fft.fftshift(np.fft.fft2(centered))
        power = np.abs(fft) ** 2
        log_power = np.log1p(power)

        center = self.size // 2
        y, x = np.ogrid[: self.size, : self.size]
        dy = y - center
        dx = x - center
        radius = np.sqrt(dx**2 + dy**2)

        # Signal 1: High vs Low Frequency Energy Ratio
        high_mask = radius > (self.size * 0.35)
        low_mask = (radius <= (self.size * 0.15)) & (radius > 1)
        high = float(log_power[high_mask].mean()) if np.any(high_mask) else 0.0
        low = float(log_power[low_mask].mean()) if np.any(low_mask) else 1e-6
        ratio = float(high / max(low, 1e-6))

        # Signal 2: Radial Power Decay Slope (48 bands)
        # Natural optical photos: P(f) ~ 1/f^alpha where alpha ~= 1.8-2.2
        # Diffusion generators deviate from this law — fitted_alpha outlier = AI
        r_bins = np.linspace(4, center - 2, 50)  # 49 intervals -> 48 usable rings
        radial_powers: list[float] = []
        valid_radii: list[float] = []
        for i in range(len(r_bins) - 1):
            r_min, r_max = r_bins[i], r_bins[i + 1]
            ring_mask = (radius >= r_min) & (radius < r_max)
            if np.any(ring_mask):
                ring_mean = float(power[ring_mask].mean())
                if ring_mean > 0:
                    radial_powers.append(np.log(ring_mean))
                    valid_radii.append(np.log(0.5 * (r_min + r_max)))

        if len(valid_radii) >= 6:
            poly = np.polyfit(valid_radii, radial_powers, 1)
            fitted_alpha = float(-poly[0])
            # Degree-2 polynomial curvature: AI shows non-linear spectral plateau
            poly2 = np.polyfit(valid_radii, radial_powers, 2)
            curvature = float(abs(poly2[0]))
        else:
            fitted_alpha = 2.0
            curvature = 0.0

        slope_deviation = float(abs(fitted_alpha - 2.0))

        # Signal 3: Azimuthal Anisotropy
        # Transposed-conv upsampling creates periodic lattice harmonics at 0/45/90/135 degrees
        angles = np.arctan2(dy, dx) % np.pi
        mid_high_mask = (radius >= (self.size * 0.2)) & (radius <= (self.size * 0.45))
        num_sectors = 16
        sector_powers: list[float] = []
        if np.any(mid_high_mask):
            sector_edges = np.linspace(0, np.pi, num_sectors + 1)
            for s in range(num_sectors):
                s_mask = mid_high_mask & (angles >= sector_edges[s]) & (angles < sector_edges[s + 1])
                sector_powers.append(float(log_power[s_mask].mean()) if np.any(s_mask) else 0.0)

        if sector_powers and np.mean(sector_powers) > 0:
            sector_arr = np.array(sector_powers)
            azimuthal_anisotropy = float(np.std(sector_arr) / max(np.mean(sector_arr), 1e-6))
        else:
            azimuthal_anisotropy = 0.0

        # Signal 4: DCT Tail Energy
        dct = cv2.dct(normalized)
        dct_tail = float(np.mean(np.abs(dct[32:, 32:])))

        # Signal 5: Noise Residual Variance (new)
        # High variance -> real (Poisson shot noise); Low -> AI (aggressively denoised)
        noise_var = self._noise_residual_variance(bgr_resized)
        noise_signal = float(np.clip(1.0 - (noise_var - 5.0) / 120.0, 0.0, 1.0))

        # Signal 6: LBP Texture Entropy (new)
        # Real images: entropy ~6.5-7.5 bits; AI images: ~4.5-6.0 bits
        lbp_entropy = self._lbp_entropy(gray_resized)
        lbp_signal = float(np.clip(1.0 - (lbp_entropy - 4.5) / 2.5, 0.0, 1.0))

        # Signal 7: Edge Coherence (new)
        # Low coherence = broken edges = more likely AI
        edge_coh = self._edge_coherence(gray_resized)
        edge_signal = float(1.0 - np.clip(edge_coh, 0.0, 1.0))

        # Signal 8: Colour Histogram Smoothness (new)
        # High smoothness = over-smoothed diffusion output = AI
        colour_smooth = self._colour_histogram_smoothness(bgr_resized)

        # Radial profile curve for frontend SVG visualisation
        curve_samples: list[float] = []
        curve_radii = np.linspace(4, center - 2, 16)
        for i in range(len(curve_radii) - 1):
            rm = (radius >= curve_radii[i]) & (radius < curve_radii[i + 1])
            val = float(log_power[rm].mean()) if np.any(rm) else 0.0
            curve_samples.append(round(val, 3))

        # Composite calibrated score — each sub-signal clamped to [0,1] (1 = AI)
        ratio_signal  = float(np.clip((ratio - 0.35) / 1.1, 0.0, 1.0))
        slope_signal  = float(np.clip((slope_deviation - 0.25) / 0.9, 0.0, 1.0))
        aniso_signal  = float(np.clip((azimuthal_anisotropy - 0.07) / 0.22, 0.0, 1.0))
        dct_signal    = float(np.clip((dct_tail - 0.004) / 0.035, 0.0, 1.0))
        curve_signal  = float(np.clip(curvature / 0.5, 0.0, 1.0))

        composite_score = float(
            np.clip(
                0.20 * ratio_signal      # FFT energy imbalance
                + 0.18 * slope_signal    # 1/f^alpha law deviation
                + 0.16 * aniso_signal    # Directional convolution grid harmonics
                + 0.08 * dct_signal      # DCT high-frequency tail energy
                + 0.08 * curve_signal    # Non-linear spectral curvature
                + 0.12 * noise_signal    # Denoising residual flatness (new)
                + 0.10 * lbp_signal      # Texture repetition entropy (new)
                + 0.04 * colour_smooth   # Histogram over-smoothing (new)
                + 0.04 * edge_signal,    # Broken edge contours (new)
                0.0,
                1.0,
            )
        )

        indicators: dict[str, float | list[float]] = {
            "fft_high_low_ratio":   round(ratio, 4),
            "dct_tail_energy":      round(dct_tail, 6),
            "radial_decay_slope":   round(fitted_alpha, 3),
            "spectral_curvature":   round(curvature, 4),
            "natural_slope_delta":  round(slope_deviation, 3),
            "azimuthal_anisotropy": round(azimuthal_anisotropy, 4),
            "noise_variance":       round(noise_var, 4),
            "lbp_texture_entropy":  round(lbp_entropy, 4),
            "edge_coherence":       round(edge_coh, 4),
            "colour_smoothness":    round(colour_smooth, 4),
            "radial_profile":       curve_samples,
        }

        return SpectralResult(score=composite_score, indicators=indicators)
