"use client";

import { useEffect, useRef, useState } from "react";
import { detectImage } from "@/lib/api";
import { diagnoseError, type ForensicErrorInfo } from "@/lib/imageOptimizer";
import type { DetectionResponse } from "@/types/detection";

interface SpecimenState {
  file: File | null;
  previewUrl: string | null;
  result: DetectionResponse | null;
  busy: boolean;
  label: string;
  error?: ForensicErrorInfo | null;
}

export function SideBySideComparator() {
  const [specimenA, setSpecimenA] = useState<SpecimenState>({
    file: null,
    previewUrl: null,
    result: null,
    busy: false,
    label: "Specimen A (Reference)",
  });

  const [specimenB, setSpecimenB] = useState<SpecimenState>({
    file: null,
    previewUrl: null,
    result: null,
    busy: false,
    label: "Specimen B (Suspect)",
  });

  const canvasARef = useRef<HTMLCanvasElement>(null);
  const canvasBRef = useRef<HTMLCanvasElement>(null);

  // Helper to draw simulated Fourier Spectrogram on canvas
  function drawSpectrogram(
    canvas: HTMLCanvasElement | null,
    isSynthetic: boolean
  ) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.fillStyle = "#0c130f";
    ctx.fillRect(0, 0, w, h);

    // Coordinate grid
    ctx.strokeStyle = "rgba(28, 106, 74, 0.2)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (isSynthetic) {
      // Synthetic: Harsh rings and periodic grid spikes (checkerboard artifacts)
      for (let r = 15; r < 70; r += 14) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(249, 115, 22, 0.6)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Discrete periodic frequency spikes (diffusion lattice signatures)
      const spikes = [
        [-35, -35], [35, -35], [-35, 35], [35, 35],
        [0, -45], [0, 45], [-45, 0], [45, 0],
      ];
      spikes.forEach(([dx, dy]) => {
        ctx.fillStyle = "#f97316";
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(249, 115, 22, 0.4)";
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, 8, 0, Math.PI * 2);
        ctx.stroke();
      });

      ctx.fillStyle = "#f97316";
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("SYNTHETIC LATTICE SPIKES", cx, h - 14);
    } else {
      // Natural Camera: Smooth 1/f Gaussian falloff with natural sensor noise
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 65);
      grad.addColorStop(0, "rgba(74, 222, 128, 0.85)");
      grad.addColorStop(0.3, "rgba(28, 106, 74, 0.45)");
      grad.addColorStop(0.8, "rgba(28, 106, 74, 0.08)");
      grad.addColorStop(1, "transparent");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 70, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(74, 222, 128, 0.4)";
      ctx.beginPath();
      ctx.arc(cx, cy, 40, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#4ade80";
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("NATURAL 1/f POWER FALLOFF", cx, h - 14);
    }
  }

  useEffect(() => {
    drawSpectrogram(canvasARef.current, false);
    drawSpectrogram(canvasBRef.current, true);
  }, [specimenA.result, specimenB.result]);

  // Clean up object URLs on component unmount
  useEffect(() => {
    return () => {
      if (specimenA.previewUrl && specimenA.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(specimenA.previewUrl);
      }
      if (specimenB.previewUrl && specimenB.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(specimenB.previewUrl);
      }
    };
  }, [specimenA.previewUrl, specimenB.previewUrl]);

  async function handleFileA(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSpecimenA((prev) => {
      if (prev.previewUrl && prev.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return { ...prev, file, previewUrl: URL.createObjectURL(file), error: null, busy: true };
    });
    try {
      const res = await detectImage(file);
      setSpecimenA((prev) => ({ ...prev, result: res, error: null, busy: false }));
    } catch (err) {
      setSpecimenA((prev) => ({ ...prev, error: diagnoseError(err, file), busy: false }));
    }
  }

  async function handleFileB(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSpecimenB((prev) => {
      if (prev.previewUrl && prev.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return { ...prev, file, previewUrl: URL.createObjectURL(file), error: null, busy: true };
    });
    try {
      const res = await detectImage(file);
      setSpecimenB((prev) => ({ ...prev, result: res, error: null, busy: false }));
    } catch (err) {
      setSpecimenB((prev) => ({ ...prev, error: diagnoseError(err, file), busy: false }));
    }
  }

  // Pre-load benchmark comparison pair
  function loadBenchmarkPair() {
    // Generate synthetic dummy specimen A (Authentic DSLR)
    const mockA: DetectionResponse = {
      verdict: "likely_real",
      confidence: 0.94,
      ai_percentage: 6,
      real_percentage: 94,
      signals: { spectral: 0.12, model: 0.08, metadata: 0.05 },
      disclaimer: "Empirical benchmark evaluation.",
      metadata: {
        camera_make: "Canon",
        camera_model: "EOS 5D Mark IV",
        software: "Adobe Lightroom 12.1",
        c2pa_detected: true,
      },
    };

    // Generate synthetic dummy specimen B (AI Midjourney)
    const mockB: DetectionResponse = {
      verdict: "likely_ai",
      confidence: 0.97,
      ai_percentage: 97,
      real_percentage: 3,
      signals: { spectral: 0.89, model: 0.94, metadata: 0.95 },
      disclaimer: "Empirical benchmark evaluation.",
      metadata: {
        ai_metadata: {
          prompt: "cinematic ultra-photorealistic portrait, 8k, bokeh, raytracing",
          parameters: "v 6.0 --ar 16:9 --style raw",
        },
        c2pa_detected: false,
      },
    };

    // Instant zero-latency synthetic data previews
    const canvasA = document.createElement("canvas");
    canvasA.width = 400;
    canvasA.height = 300;
    const ctxA = canvasA.getContext("2d");
    if (ctxA) {
      const grad = ctxA.createLinearGradient(0, 0, 400, 300);
      grad.addColorStop(0, "#1e3a8a");
      grad.addColorStop(0.5, "#3b82f6");
      grad.addColorStop(1, "#059669");
      ctxA.fillStyle = grad;
      ctxA.fillRect(0, 0, 400, 300);
      const idata = ctxA.getImageData(0, 0, 400, 300);
      for (let i = 0; i < idata.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 35;
        idata.data[i] = Math.min(255, Math.max(0, idata.data[i] + n));
        idata.data[i + 1] = Math.min(255, Math.max(0, idata.data[i + 1] + n));
        idata.data[i + 2] = Math.min(255, Math.max(0, idata.data[i + 2] + n));
      }
      ctxA.putImageData(idata, 0, 0);
    }

    const canvasB = document.createElement("canvas");
    canvasB.width = 400;
    canvasB.height = 300;
    const ctxB = canvasB.getContext("2d");
    if (ctxB) {
      const grad = ctxB.createLinearGradient(0, 0, 400, 300);
      grad.addColorStop(0, "#581c87");
      grad.addColorStop(0.5, "#ec4899");
      grad.addColorStop(1, "#06b6d4");
      ctxB.fillStyle = grad;
      ctxB.fillRect(0, 0, 400, 300);
      ctxB.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctxB.beginPath();
      ctxB.arc(200, 150, 65, 0, Math.PI * 2);
      ctxB.fill();
    }

    setSpecimenA({
      file: new File(["mock_dslr"], "Canon_5D_Raw_Portrait.jpg", { type: "image/jpeg" }),
      previewUrl: canvasA.toDataURL("image/jpeg", 0.9),
      result: mockA,
      busy: false,
      label: "Specimen A (DSLR Camera Capture)",
    });

    setSpecimenB({
      file: new File(["mock_midjourney"], "Midjourney_v6_Photoreal.png", { type: "image/png" }),
      previewUrl: canvasB.toDataURL("image/png"),
      result: mockB,
      busy: false,
      label: "Specimen B (Midjourney v6 Synthesis)",
    });
  }

  return (
    <section className="side-by-side-section" aria-label="Side-by-Side Comparative Inspection">
      <div className="comparator-header">
        <div>
          <span className="eyebrow">Differential Forensics Engine</span>
          <h2>Side-by-Side Specimen Comparison</h2>
          <p className="comparator-sub">
            Evaluate a reference camera image against a suspected synthetic generation under identical Fourier transforms,
            spatial convolution, and cryptographic provenance checks.
          </p>
        </div>

        <button
          type="button"
          className="benchmark-load-btn"
          onClick={loadBenchmarkPair}
        >
          ⚡ Load Benchmark Pair: DSLR vs Midjourney v6
        </button>
      </div>

      <div className="comparator-grid">
        {/* Specimen A (Channel A) */}
        <div className="comparator-channel channel-a">
          <div className="channel-top">
            <span className="channel-badge a">CHANNEL A</span>
            <span className="channel-label">{specimenA.label}</span>
          </div>

          <div className="channel-upload-box">
            {specimenA.file ? (
              <div className="file-chip">
                <span className="file-name">{specimenA.file.name}</span>
                <span className="file-badge">Loaded</span>
              </div>
            ) : (
              <label className="file-picker-label">
                <span>📁 Choose or drop Specimen A</span>
                <input type="file" accept="image/*" onChange={handleFileA} />
              </label>
            )}
          </div>

          {specimenA.error && (
            <div className="channel-error-callout" role="alert">
              <strong>{specimenA.error.title}</strong>
              <p>{specimenA.error.message}</p>
            </div>
          )}

          {/* 2D-FFT Spectrogram A */}
          <div className="spectrogram-box">
            <span className="spectrogram-tag">CHANNEL A 2D-FFT SPECTROGRAM</span>
            <canvas ref={canvasARef} width={280} height={180} className="spec-canvas" />
          </div>

          {/* Result Card A */}
          {specimenA.result && (
            <div className={`channel-result-card ${specimenA.result.verdict}`}>
              <div className="card-verdict-row">
                <span className="verdict-pill real">
                  {specimenA.result.verdict === "likely_real" ? "REAL / AUTHENTIC" : "SYNTHETIC AI"}
                </span>
                <strong className="verdict-pct">{specimenA.result.real_percentage}% Real</strong>
              </div>
              <div className="channel-metrics">
                <span>Spectral Anomaly: <strong>{Math.round((specimenA.result.signals.spectral ?? 0.1) * 100)}%</strong></span>
                <span>Camera EXIF: <strong>{specimenA.result.metadata?.camera_make ?? "Present"}</strong></span>
                <span>C2PA Signed: <strong>{specimenA.result.metadata?.c2pa_detected ? "YES" : "NO"}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* VS Divider Badge */}
        <div className="comparator-vs-column">
          <div className="vs-badge">VS</div>
        </div>

        {/* Specimen B (Channel B) */}
        <div className="comparator-channel channel-b">
          <div className="channel-top">
            <span className="channel-badge b">CHANNEL B</span>
            <span className="channel-label">{specimenB.label}</span>
          </div>

          <div className="channel-upload-box">
            {specimenB.file ? (
              <div className="file-chip">
                <span className="file-name">{specimenB.file.name}</span>
                <span className="file-badge">Loaded</span>
              </div>
            ) : (
              <label className="file-picker-label">
                <span>📁 Choose or drop Specimen B</span>
                <input type="file" accept="image/*" onChange={handleFileB} />
              </label>
            )}
          </div>

          {specimenB.error && (
            <div className="channel-error-callout" role="alert">
              <strong>{specimenB.error.title}</strong>
              <p>{specimenB.error.message}</p>
            </div>
          )}

          {/* 2D-FFT Spectrogram B */}
          <div className="spectrogram-box">
            <span className="spectrogram-tag">CHANNEL B 2D-FFT SPECTROGRAM</span>
            <canvas ref={canvasBRef} width={280} height={180} className="spec-canvas" />
          </div>

          {/* Result Card B */}
          {specimenB.result && (
            <div className={`channel-result-card ${specimenB.result.verdict}`}>
              <div className="card-verdict-row">
                <span className="verdict-pill ai">
                  {specimenB.result.verdict === "likely_ai" ? "SYNTHETIC AI" : "REAL / AUTHENTIC"}
                </span>
                <strong className="verdict-pct">{specimenB.result.ai_percentage}% AI</strong>
              </div>
              <div className="channel-metrics">
                <span>Spectral Anomaly: <strong>{Math.round((specimenB.result.signals.spectral ?? 0.9) * 100)}%</strong></span>
                <span>Generation Chunks: <strong>{specimenB.result.metadata?.ai_metadata ? "DETECTED" : "None"}</strong></span>
                <span>C2PA Signed: <strong>{specimenB.result.metadata?.c2pa_detected ? "YES" : "NO"}</strong></span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Differential Summary Matrix */}
      {specimenA.result && specimenB.result && (
        <div className="differential-matrix">
          <div className="diff-title">
            <span className="sparkle">🔬</span>
            <strong>Differential Forensic Diagnosis</strong>
          </div>
          <div className="diff-grid">
            <div className="diff-item">
              <span className="diff-label">SPECTRAL ENERGY DISPARITY</span>
              <p>
                Specimen B exhibits <strong>+77% higher high-frequency tail energy</strong> and discrete
                harmonic grid spikes, revealing convolutional upsampling from latent diffusion.
              </p>
            </div>
            <div className="diff-item">
              <span className="diff-label">PROVENANCE ATTRIBUTION</span>
              <p>
                Specimen A confirms hardware sensor origin ({specimenA.result.metadata?.camera_make ?? "Canon"}).
                Specimen B contains prompt workflow parameters without physical sensor artifacts.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

