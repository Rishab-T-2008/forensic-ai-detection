"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

interface StepInfo {
  step: number;
  title: string;
  badge: string;
  description: string;
  keyAction: string;
}

const STEPS: StepInfo[] = [
  {
    step: 1,
    title: "Drag & Drop Image Ingest",
    badge: "01 / INGESTION",
    description:
      "Drop any JPG, PNG, or WebP file into the scanner reticle, or click '⚡ Test AI Art' or '📷 Test Camera Photo' for immediate pre-loaded demonstration.",
    keyAction: "Upload or select test sample",
  },
  {
    step: 2,
    title: "2D-FFT Radial Frequency Sweep",
    badge: "02 / SPECTRAL",
    description:
      "The engine calculates radial power spectral distribution and DCT tail energy to expose checkerboard upsampling artifacts and frequency grid spikes.",
    keyAction: "Exposes diffusion lattice patterns",
  },
  {
    step: 3,
    title: "Neural Feature & C2PA Verification",
    badge: "03 / ENSEMBLE",
    description:
      "ResNet-18 evaluates micro-texture continuity while metadata extractors sniff Coalition for Content Provenance (C2PA) manifests and camera EXIF tags.",
    keyAction: "Generates calibrated verdict & confidence",
  },
  {
    step: 4,
    title: "Interrogate with SON AI",
    badge: "04 / INTERROGATION",
    description:
      "Click the floating '✨ SON AI' icon in the bottom-right corner anytime to ask deep questions about lighting, reflections, or general forensics science.",
    keyAction: "Ask SON AI targeted questions",
  },
];

export function InteractiveDemoVideo() {
  const { user, openAuthModal } = useAuth();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Auto step progression when playing
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setCurrentStepIndex((prev) => (prev + 1) % STEPS.length);
    }, 4800);
    return () => clearInterval(timer);
  }, [isPlaying]);

  // Eye-catching Canvas Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let frame = 0;

    const render = () => {
      frame++;
      const width = canvas.width;
      const height = canvas.height;

      // Dark forensic CRT canvas background
      ctx.fillStyle = "#0c130f";
      ctx.fillRect(0, 0, width, height);

      // Subtle cybernetic grid
      ctx.strokeStyle = "rgba(28, 106, 74, 0.15)";
      ctx.lineWidth = 1;
      const gridSize = 24;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Step-specific dynamic animations
      if (currentStepIndex === 0) {
        // Step 1: Ingest & Target Finder
        const boxSize = 130;
        const cx = width / 2;
        const cy = height / 2;

        // Bounding reticle box
        ctx.strokeStyle = "#4ade80";
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - boxSize / 2, cy - boxSize / 2, boxSize, boxSize);

        // Corner brackets
        ctx.fillStyle = "#4ade80";
        const bl = 16;
        ctx.fillRect(cx - boxSize / 2 - 2, cy - boxSize / 2 - 2, bl, 4);
        ctx.fillRect(cx - boxSize / 2 - 2, cy - boxSize / 2 - 2, 4, bl);
        ctx.fillRect(cx + boxSize / 2 + 2 - bl, cy - boxSize / 2 - 2, bl, 4);
        ctx.fillRect(cx + boxSize / 2 - 2, cy - boxSize / 2 - 2, 4, bl);
        ctx.fillRect(cx - boxSize / 2 - 2, cy + boxSize / 2 - 2, bl, 4);
        ctx.fillRect(cx - boxSize / 2 - 2, cy + boxSize / 2 + 2 - bl, 4, bl);
        ctx.fillRect(cx + boxSize / 2 + 2 - bl, cy + boxSize / 2 - 2, bl, 4);
        ctx.fillRect(cx + boxSize / 2 - 2, cy + boxSize / 2 + 2 - bl, 4, bl);

        // Scanning laser bar
        const scanY = cy - boxSize / 2 + ((frame * 2.2) % boxSize);
        ctx.strokeStyle = "rgba(74, 222, 128, 0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - boxSize / 2, scanY);
        ctx.lineTo(cx + boxSize / 2, scanY);
        ctx.stroke();

        ctx.fillStyle = "rgba(74, 222, 128, 0.15)";
        ctx.fillRect(cx - boxSize / 2, cy - boxSize / 2, boxSize, scanY - (cy - boxSize / 2));

        // Center simulated icon
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("IMAGE_INGESTION", cx, cy - 8);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillText("SAMPLE_INPUT.PNG", cx, cy + 14);
      } else if (currentStepIndex === 1) {
        // Step 2: Spectral FFT Bloom
        const cx = width / 2;
        const cy = height / 2;

        // Concentric radial power rings
        for (let r = 20; r <= 90; r += 18) {
          const pulse = Math.sin(frame * 0.06 + r * 0.1) * 3;
          ctx.beginPath();
          ctx.arc(cx, cy, r + pulse, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(249, 115, 22, ${0.35 + (pulse / 6) * 0.2})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Crosshairs & frequency axes
        ctx.strokeStyle = "rgba(249, 115, 22, 0.6)";
        ctx.beginPath();
        ctx.moveTo(cx - 100, cy);
        ctx.lineTo(cx + 100, cy);
        ctx.moveTo(cx, cy - 100);
        ctx.lineTo(cx, cy + 100);
        ctx.stroke();

        // Pulsing artifact anomaly dots
        const angles = [0.8, 1.9, 3.7, 5.1];
        angles.forEach((ang) => {
          const dist = 55 + Math.sin(frame * 0.1) * 4;
          const px = cx + Math.cos(ang + frame * 0.02) * dist;
          const py = cy + Math.sin(ang + frame * 0.02) * dist;
          ctx.fillStyle = "#f97316";
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "rgba(249, 115, 22, 0.4)";
          ctx.beginPath();
          ctx.arc(px, py, 8 + (frame % 10), 0, Math.PI * 2);
          ctx.stroke();
        });

        ctx.fillStyle = "#f97316";
        ctx.font = "bold 12px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("2D-FFT RADIAL SPECTRUM", cx, cy + 110);
      } else if (currentStepIndex === 2) {
        // Step 3: ResNet & Verdict Gauge
        const cx = width / 2;
        const cy = height / 2 - 10;

        // Arc gauge
        ctx.beginPath();
        ctx.arc(cx, cy, 65, Math.PI * 0.8, Math.PI * 2.2);
        ctx.strokeStyle = "#273a2f";
        ctx.lineWidth = 10;
        ctx.stroke();

        // Active value
        const val = 0.85 + Math.sin(frame * 0.05) * 0.03;
        ctx.beginPath();
        ctx.arc(cx, cy, 65, Math.PI * 0.8, Math.PI * 0.8 + val * (Math.PI * 1.4));
        ctx.strokeStyle = "#bd5f28";
        ctx.lineWidth = 10;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 24px Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText("88%", cx, cy + 8);

        ctx.fillStyle = "#bd5f28";
        ctx.font = "bold 11px ui-monospace, monospace";
        ctx.fillText("LIKELY AI DETECTED", cx, cy + 32);

        // Micro provenance pills
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        ctx.fillRect(cx - 95, cy + 70, 90, 20);
        ctx.fillRect(cx + 5, cy + 70, 90, 20);

        ctx.fillStyle = "#6ee7b7";
        ctx.font = "9px ui-monospace, monospace";
        ctx.fillText("C2PA: ABSENT", cx - 50, cy + 83);
        ctx.fillText("RESNET: 0.91", cx + 50, cy + 83);
      } else {
        // Step 4: SON AI Interrogation
        const cx = width / 2;
        const cy = height / 2;

        // Pulsing glowing orb
        const pulse = Math.sin(frame * 0.08) * 8;
        const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 45 + pulse);
        grad.addColorStop(0, "#4ade80");
        grad.addColorStop(0.5, "rgba(28, 106, 74, 0.6)");
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, 55 + pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 16px ui-sans-serif, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("✨ SON AI", cx, cy + 5);

        // Chat bubble simulation
        const bx = cx - 110;
        const by = cy - 85;
        ctx.fillStyle = "rgba(23, 34, 28, 0.85)";
        ctx.strokeStyle = "#2d4538";
        ctx.lineWidth = 1;
        ctx.fillRect(bx, by, 220, 36);
        ctx.strokeRect(bx, by, 220, 36);

        ctx.fillStyle = "#6ee7b7";
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillText("Q: Inspect lighting anomalies?", cx, by + 16);
        ctx.fillStyle = "#f4f1ea";
        ctx.font = "9px ui-sans-serif, sans-serif";
        ctx.fillText("A: Unnatural specular highlights in iris", cx, by + 30);
      }

      // CRT Scanline Overlay
      ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
      for (let y = 0; y < height; y += 3) {
        ctx.fillRect(0, y, width, 1);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [currentStepIndex]);

  const activeStep = STEPS[currentStepIndex];

  return (
    <section
      className={`interactive-tour-wrapper ${isExpanded ? "is-expanded" : ""}`}
      aria-label="Interactive Website Demonstration"
    >
      <div className="tour-card">
        {/* Top Control Bar */}
        <div className="tour-top-bar">
          <div className="tour-title-block">
            <span className="live-rec-dot" />
            <span className="tour-heading">AI LAB DEMO / OPERATIONAL WALKTHROUGH</span>
          </div>

          <div className="tour-status-tags">
            {user ? (
              <span className="user-mode-pill signed">
                👤 {user.full_name} · {user.tier}
              </span>
            ) : (
              <span className="user-mode-pill unsigned">
                🌐 GUEST EXPLORER · INSTANT SCANS
              </span>
            )}

            <button
              type="button"
              className="expand-tour-btn"
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? "Minimize Demo" : "Expand Demo"}
            >
              {isExpanded ? "Collapse ↘" : "Expand ↗"}
            </button>
          </div>
        </div>

        {/* Main Demo Stage */}
        <div className="tour-stage-grid">
          {/* Left: Interactive Canvas Video Simulation */}
          <div className="tour-canvas-container">
            <canvas
              ref={canvasRef}
              width={420}
              height={260}
              className="tour-canvas"
            />
            <div className="canvas-badge-overlay">
              <span className="overlay-step">{activeStep.badge}</span>
              <button
                type="button"
                className="play-pause-btn"
                onClick={() => setIsPlaying(!isPlaying)}
                title={isPlaying ? "Pause Tour" : "Resume Tour"}
              >
                {isPlaying ? "⏸ Pause" : "▶ Play"}
              </button>
            </div>
          </div>

          {/* Right: Step-by-Step Guidance & Role Callout */}
          <div className="tour-content-panel">
            <div className="step-tabs">
              {STEPS.map((s, idx) => (
                <button
                  key={s.step}
                  type="button"
                  className={`step-tab-chip ${idx === currentStepIndex ? "active" : ""}`}
                  onClick={() => {
                    setCurrentStepIndex(idx);
                    setIsPlaying(false);
                  }}
                >
                  Step {s.step}
                </button>
              ))}
            </div>

            <div className="step-details-box">
              <h3>{activeStep.title}</h3>
              <p className="step-desc">{activeStep.description}</p>
              <div className="step-action-pill">
                <strong>System Action:</strong> {activeStep.keyAction}
              </div>
            </div>

            {/* Contextual Guidance Callout for Signed vs Unsigned */}
            <div className={`user-guidance-callout ${user ? "is-signed" : "is-unsigned"}`}>
              {user ? (
                <div>
                  <div className="guidance-title">Analyst Command Center Active</div>
                  <p>
                    You are signed in with <strong>{user.scans_remaining} scans</strong> remaining.
                    Drag any image into the workbench below to unlock deep-level EXIF provenance,
                    frequency residual metrics, and direct questioning with <strong>SON AI</strong>.
                  </p>
                </div>
              ) : (
                <div className="unsigned-banner">
                  <div>
                    <div className="guidance-title">Visitor Guest Mode</div>
                    <p>
                      You can test images right now below without signing in. To save your forensic reports
                      and track scan history, create a free analyst account.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="demo-signup-btn"
                    onClick={openAuthModal}
                  >
                    ✨ Create Free Account
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

