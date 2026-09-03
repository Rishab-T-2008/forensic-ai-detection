"use client";

import { useEffect, useRef, useState } from "react";
import { detectImage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  diagnoseError,
  optimizeImageIfLarge,
  type ForensicErrorInfo,
} from "@/lib/imageOptimizer";
import type { DetectionResponse } from "@/types/detection";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BUFFER_SIZE = 25 * 1024 * 1024;

export function UploadDropzone({
  onResult,
  onPreview,
  onFile,
  result,
}: {
  onResult: (result: DetectionResponse) => void;
  onPreview: (url: string) => void;
  onFile: (file: File) => void;
  result: DetectionResponse | null;
}) {
  const { user, openAuthModal, setPendingReviewAction } = useAuth();
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<ForensicErrorInfo | null>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    function handleGlobalPaste(e: ClipboardEvent) {
      if (!e.clipboardData) return;
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const pastedFile = items[i].getAsFile();
          if (pastedFile) {
            handleStageFile(pastedFile);
            break;
          }
        }
      }
    }
    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, [user]);

  const verdictText = result
    ? result.verdict === "likely_ai"
      ? "AI DETECTED"
      : "AI NOT DETECTED"
    : null;

  // Stage file for review and show preview
  function handleStageFile(file: File) {
    setErrorInfo(null);
    setStagedFile(file);
    setLastFile(file);

    const fileType = (file.type || "").toLowerCase();
    const fileName = (file.name || "").toLowerCase();
    const isValidImage =
      TYPES.some((t) => fileType.includes(t)) ||
      fileType.startsWith("image/") ||
      /\.(jpe?g|png|webp|jfif|bmp)$/i.test(fileName);

    if (!isValidImage) {
      setErrorInfo({
        type: "format",
        title: "Unsupported Image Format",
        message:
          "Please select a standard JPEG, PNG, or WebP photo. Other formats cannot be processed by the 2D-FFT spectral scanner.",
        technicalDetail: `Detected: ${file.name} (${file.type || "unknown mime"})`,
        recoveryAction: "reselect",
      });
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return nextPreviewUrl;
    });
    onPreview(nextPreviewUrl);
    onFile(file);
  }

  // Core inference execution
  async function executeReview(fileToScan: File) {
    setErrorInfo(null);
    let targetFile = fileToScan;
    setBusy(true);

    if (targetFile.size > MAX_BUFFER_SIZE) {
      try {
        setStatusMessage("Optimizing high-resolution specimen for transmission...");
        targetFile = await optimizeImageIfLarge(targetFile, 2048, 0.85);
      } catch {
        if (targetFile.size > MAX_BUFFER_SIZE) {
          setErrorInfo(diagnoseError("File size exceeds 25 MB", targetFile));
          setBusy(false);
          setStatusMessage(null);
          return;
        }
      }
    }

    try {
      setStatusMessage("Extracting Fourier spectra & running neural inference...");
      onFile(targetFile);
      const detectionResult = await detectImage(targetFile);
      onResult(detectionResult);
    } catch (cause) {
      setErrorInfo(diagnoseError(cause, targetFile));
    } finally {
      setBusy(false);
      setStatusMessage(null);
    }
  }

  // Triggered when clicking "Review & Verify Specimen"
  function handleReviewClick() {
    if (!stagedFile) return;

    if (!user) {
      // Defer scan until after signup + plan selection
      const fileToScan = stagedFile;
      setPendingReviewAction(() => () => {
        void executeReview(fileToScan);
      });
      openAuthModal();
      return;
    }

    void executeReview(stagedFile);
  }

  async function handleAutoCompressAndRetry() {
    if (!lastFile) return;
    setBusy(true);
    setStatusMessage("Compressing high-resolution image...");
    setErrorInfo(null);
    try {
      const compressed = await optimizeImageIfLarge(lastFile, 1600, 0.78);
      handleStageFile(compressed);
      if (user) {
        await executeReview(compressed);
      }
    } catch (err) {
      setErrorInfo(diagnoseError(err, lastFile));
      setBusy(false);
      setStatusMessage(null);
    }
  }

  async function loadSample(type: "real" | "midjourney" | "diffusion") {
    setBusy(true);
    setStatusMessage(`Loading ${type === "real" ? "DSLR Camera" : "Generative AI"} demo specimen...`);

    const filenameMap = {
      real: { path: "/samples/real_dslr_sample.jpg", name: "nikon_d850_dslr_specimen.jpg", mime: "image/jpeg" },
      midjourney: { path: "/samples/midjourney_v6_sample.png", name: "midjourney_v6_synthetic_art.png", mime: "image/png" },
      diffusion: { path: "/samples/diffusion_portrait_sample.png", name: "stable_diffusion_xl_portrait.png", mime: "image/png" },
    };

    const target = filenameMap[type];

    try {
      const resp = await fetch(target.path);
      if (resp.ok) {
        const blob = await resp.blob();
        const file = new File([blob], target.name, { type: target.mime });
        handleStageFile(file);
        setBusy(false);
        setStatusMessage(null);
        return;
      }
    } catch {
      // Fall back to programmatic canvas generator
    }

    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setBusy(false);
      return;
    }

    if (type === "real") {
      const grad = ctx.createLinearGradient(0, 0, 0, 400);
      grad.addColorStop(0, "#38bdf8");
      grad.addColorStop(0.5, "#bae6fd");
      grad.addColorStop(0.5, "#15803d");
      grad.addColorStop(1, "#166534");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 400, 400);

      const imgData = ctx.getImageData(0, 0, 400, 400);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 28;
        imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + noise));
        imgData.data[i + 1] = Math.min(255, Math.max(0, imgData.data[i + 1] + noise));
        imgData.data[i + 2] = Math.min(255, Math.max(0, imgData.data[i + 2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);

      canvas.toBlob((blob) => {
        if (blob) {
          const sampleFile = new File([blob], target.name, { type: target.mime });
          handleStageFile(sampleFile);
        }
        setBusy(false);
        setStatusMessage(null);
      }, "image/jpeg", 0.92);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 400, 400);
      grad.addColorStop(0, type === "midjourney" ? "#4c1d95" : "#1e1b4b");
      grad.addColorStop(0.5, type === "midjourney" ? "#db2777" : "#0284c7");
      grad.addColorStop(1, type === "midjourney" ? "#06b6d4" : "#ec4899");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 400, 400);

      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.beginPath();
      ctx.arc(200, 200, 90, 0, Math.PI * 2);
      ctx.fill();

      canvas.toBlob((blob) => {
        if (blob) {
          const sampleFile = new File([blob], target.name, { type: target.mime });
          handleStageFile(sampleFile);
        }
        setBusy(false);
        setStatusMessage(null);
      }, "image/png");
    }
  }

  function handleReset() {
    setStagedFile(null);
    setPreviewUrl(null);
    setErrorInfo(null);
  }

  return (
    <div
      className={`dropzone ${dragging ? "is-dragging" : ""} ${
        previewUrl ? "has-preview" : ""
      } ${busy ? "is-busy" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) handleStageFile(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleStageFile(file);
        }}
      />

      {busy && <div className="scanner-line" />}

      {verdictText && <div className="preview-badge">{verdictText}</div>}

      {previewUrl ? (
        <>
          <div className="preview-shell">
            <img
              src={previewUrl}
              alt="Uploaded preview"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          </div>

          {!result && stagedFile && (
            <div className="staged-review-bar">
              <div className="staged-file-meta">
                <span>📁 <span className="filename">{stagedFile.name}</span></span>
                <span>• {(stagedFile.size / 1024).toFixed(1)} KB</span>
                <span>• {stagedFile.type || "image/jpeg"}</span>
              </div>

              <div className="staged-actions-row">
                <button
                  type="button"
                  className="review-specimen-btn"
                  onClick={handleReviewClick}
                  disabled={busy}
                >
                  {busy ? "🔬 Analyzing Forensic Telemetry..." : "🔬 Review & Verify Specimen"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                >
                  Change Image
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="preview-meta">
              <strong>Active Inspection Target</strong>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  handleReset();
                  inputRef.current?.click();
                }}
                disabled={busy}
              >
                Analyze another image
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="drop-reticle tl" />
          <div className="drop-reticle tr" />
          <div className="drop-reticle bl" />
          <div className="drop-reticle br" />

          <div className="drop-icon">{busy ? "⟳" : "⊕"}</div>
          <h2>
            {busy
              ? statusMessage ?? "Scanning image forensics..."
              : "Drop an image to inspect"}
          </h2>
          <p>
            JPEG, PNG, or WebP · High-res auto-optimized with zero external storage
          </p>
          <div className="drop-actions" style={{ display: "flex", gap: "10px", justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="primary-button"
            >
              {busy ? "Analyzing signals..." : "Choose image file"}
            </button>
            <span style={{ fontSize: "12px", color: "var(--muted)", font: "12px ui-monospace, monospace", background: "rgba(0,0,0,0.04)", padding: "6px 12px", borderRadius: "20px", border: "1px solid var(--line)" }}>
              📋 or press <strong>Ctrl+V / ⌘V</strong> to paste screenshot
            </span>
          </div>

          <div className="sample-strip">
            <span>⚡ 1-Click Demo Specimen:</span>
            <button
              type="button"
              className="sample-pill"
              onClick={() => loadSample("real")}
              disabled={busy}
              title="Test with an authentic Nikon DSLR photograph"
            >
              📸 Nikon DSLR (Real)
            </button>
            <button
              type="button"
              className="sample-pill"
              onClick={() => loadSample("midjourney")}
              disabled={busy}
              title="Test with Midjourney v6 synthetic art"
            >
              🎨 Midjourney v6 (AI)
            </button>
            <button
              type="button"
              className="sample-pill"
              onClick={() => loadSample("diffusion")}
              disabled={busy}
              title="Test with Stable Diffusion XL synthetic portrait"
            >
              🤖 SDXL Portrait (AI)
            </button>
          </div>
        </>
      )}

      {/* User-Friendly Forensic Diagnostic Alert */}
      {errorInfo && (
        <div
          className={`forensic-error-card error-${errorInfo.type}`}
          role="alert"
        >
          <div className="error-card-header">
            <div className="error-title-row">
              <span className="error-icon">
                {errorInfo.type === "network"
                  ? "📶"
                  : errorInfo.type === "filesize"
                  ? "📦"
                  : "⚠️"}
              </span>
              <div>
                <span className="error-tag">
                  {errorInfo.type === "network"
                    ? "UNSTABLE INTERNET / NETWORK"
                    : errorInfo.type === "filesize"
                    ? "LARGE SPECIMEN FILE"
                    : "FORENSIC DIAGNOSTIC NOTICE"}
                </span>
                <h4 className="error-title">{errorInfo.title}</h4>
              </div>
            </div>
            <button
              type="button"
              className="error-close-btn"
              onClick={() => setErrorInfo(null)}
              title="Dismiss notification"
            >
              ✕
            </button>
          </div>

          <p className="error-message-text">{errorInfo.message}</p>

          {errorInfo.technicalDetail && (
            <p className="error-tech-note">
              <strong>Diagnostic Context:</strong> {errorInfo.technicalDetail}
            </p>
          )}

          <div className="error-actions-row">
            {errorInfo.recoveryAction === "retry" && lastFile && (
              <button
                type="button"
                className="error-action-btn retry"
                onClick={() => handleStageFile(lastFile)}
              >
                ⚡ Re-attempt Scan Now
              </button>
            )}
            {errorInfo.recoveryAction === "compress" && lastFile && (
              <button
                type="button"
                className="error-action-btn compress"
                onClick={handleAutoCompressAndRetry}
              >
                ✨ Auto-Compress & Analyze
              </button>
            )}
            <button
              type="button"
              className="error-action-btn reselect"
              onClick={() => inputRef.current?.click()}
            >
              📁 Choose Another Image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
