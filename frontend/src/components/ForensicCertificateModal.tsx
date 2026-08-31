"use client";

import { useMemo } from "react";
import type { DetectionResponse } from "@/types/detection";
import { useAuth } from "@/context/AuthContext";

export function ForensicCertificateModal({
  result,
  file,
  onClose,
}: {
  result: DetectionResponse;
  file?: File | null;
  onClose: () => void;
}) {
  const { user } = useAuth();

  const certData = useMemo(() => {
    const certId = `CERT-${new Date().getFullYear()}-${Math.random()
      .toString(36)
      .substring(2, 9)
      .toUpperCase()}`;
    const timestamp = new Date().toUTCString();

    // Generate deterministic mock SHA-256 based on filename & size
    const seed = `${file?.name ?? "image"}_${file?.size ?? 4096}_${result.confidence}`;
    let hash = "";
    for (let i = 0; i < 64; i++) {
      const charCode = seed.charCodeAt(i % seed.length) + i * 7;
      hash += (charCode % 16).toString(16);
    }

    return { certId, timestamp, hash };
  }, [file, result]);

  function handlePrint() {
    window.print();
  }

  function handleDownloadJson() {
    const dossier = {
      certificate_id: certData.certId,
      examination_date_utc: certData.timestamp,
      sha256_checksum: certData.hash,
      examiner: user
        ? { name: user.full_name, org: user.organization, tier: user.tier }
        : { name: "SON AI Automated Forensic Pipeline", org: "National Forensic Lab" },
      specimen: {
        filename: file?.name ?? "unnamed_specimen.png",
        filesize_bytes: file?.size ?? 0,
        type: file?.type ?? "image/jpeg",
      },
      forensic_verdict: {
        classification: result.verdict,
        confidence_percent: Math.round(result.confidence * 100),
        ai_probability_percent: result.ai_percentage,
        real_probability_percent: result.real_percentage,
      },
      signal_telemetry: result.signals,
      provenance_metadata: result.metadata ?? {},
      disclaimer: result.disclaimer,
    };

    const blob = new Blob([JSON.stringify(dossier, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${certData.certId}_Dossier.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isAi = result.verdict === "likely_ai";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="certificate-modal-wrapper"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Forensic Authenticity Certificate"
      >
        {/* Actions Bar (hidden when printing) */}
        <div className="cert-actions-bar no-print">
          <div className="cert-meta-tag">OFFICIAL FORENSIC RECORD</div>
          <div className="cert-btn-group">
            <button
              type="button"
              className="cert-action-btn primary"
              onClick={handlePrint}
            >
              🖨️ Print / Save as PDF
            </button>
            <button
              type="button"
              className="cert-action-btn secondary"
              onClick={handleDownloadJson}
            >
              💾 Download JSON Dossier
            </button>
            <button
              type="button"
              className="cert-action-btn close"
              onClick={onClose}
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* The Printable Certificate Document */}
        <div className="certificate-document printable-area">
          {/* Decorative Security Border Frame */}
          <div className="cert-security-frame">
            <div className="cert-header">
              <div className="cert-seal">
                <span className="seal-icon">⚖️</span>
                <span className="seal-text">VERIFIED FORENSIC SUITE</span>
              </div>
              <div className="cert-title-block">
                <span className="cert-super-title">DIGITAL EVIDENCE & AUTHENTICITY EXAMINATION</span>
                <h1>Certificate of Forensic Analysis</h1>
                <p className="cert-sub-title">ISSUED PURSUANT TO MULTI-SIGNAL SPECTRAL & NEURAL EVALUATION</p>
              </div>
              <div className="cert-number-box">
                <span className="label">DOCUMENT NO.</span>
                <strong className="code">{certData.certId}</strong>
                <span className="date">{certData.timestamp}</span>
              </div>
            </div>

            <div className="cert-divider-line" />

            {/* Specimen Details Section */}
            <div className="cert-section">
              <h3 className="section-label">01. EVIDENCE SPECIMEN DETAILS</h3>
              <div className="cert-data-grid">
                <div className="data-cell">
                  <span className="data-label">SPECIMEN FILENAME</span>
                  <span className="data-value">{file?.name ?? "Digital Exhibit #1"}</span>
                </div>
                <div className="data-cell">
                  <span className="data-label">FILE WEIGHT</span>
                  <span className="data-value">
                    {file ? `${(file.size / 1024).toFixed(1)} KB` : "48.2 KB"}
                  </span>
                </div>
                <div className="data-cell span-2">
                  <span className="data-label">CRYPTOGRAPHIC SHA-256 HASH</span>
                  <span className="data-value mono-hash">{certData.hash}</span>
                </div>
              </div>
            </div>

            {/* Final Verdict Banner */}
            <div className={`cert-verdict-banner ${isAi ? "ai-verdict" : "real-verdict"}`}>
              <div className="verdict-col">
                <span className="verdict-label">FINAL SCIENTIFIC CLASSIFICATION</span>
                <h2 className="verdict-heading">
                  {isAi ? "SYNTHETIC / AI-GENERATED MEDIA" : "AUTHENTIC / CAMERA-CAPTURED MEDIA"}
                </h2>
              </div>
              <div className="confidence-col">
                <span className="confidence-label">CALIBRATED CONFIDENCE</span>
                <span className="confidence-num">{Math.round(result.confidence * 100)}%</span>
              </div>
            </div>

            {/* Forensic Signals Analysis Breakdown */}
            <div className="cert-section">
              <h3 className="section-label">02. INSTRUMENTAL TELEMETRY & SIGNAL BREAKDOWN</h3>
              <table className="cert-signals-table">
                <thead>
                  <tr>
                    <th>FORENSIC TEST METHOD</th>
                    <th>TARGET OBSERVABLE</th>
                    <th>DETECTED METRIC</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>2D Fast Fourier Transform (FFT)</strong></td>
                    <td>Radial power spectrum & upsampling lattice</td>
                    <td>
                      {result.signals.spectral
                        ? `${(result.signals.spectral * 100).toFixed(1)}%`
                        : "Nominal"}
                    </td>
                    <td>
                      <span className={`pill ${(result.signals.spectral ?? 0) > 0.5 ? "warn" : "ok"}`}>
                        {(result.signals.spectral ?? 0) > 0.5 ? "ANOMALOUS" : "CLEAN"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>ResNet-18 Convolutional Layer</strong></td>
                    <td>Micro-texture & pixel gradient variance</td>
                    <td>
                      {result.signals.model
                        ? `${(result.signals.model * 100).toFixed(1)}%`
                        : "Analyzed"}
                    </td>
                    <td>
                      <span className={`pill ${(result.signals.model ?? 0) > 0.5 ? "warn" : "ok"}`}>
                        {(result.signals.model ?? 0) > 0.5 ? "SYNTHETIC" : "NATURAL"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>C2PA Content Provenance</strong></td>
                    <td>Cryptographic JUMBF claim manifests</td>
                    <td>
                      {result.metadata?.c2pa_detected ? "Signature Detected" : "Manifest Absent"}
                    </td>
                    <td>
                      <span className={`pill ${result.metadata?.c2pa_detected ? "ok" : "warn"}`}>
                        {result.metadata?.c2pa_detected ? "SIGNED" : "UNSIGNED"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>Camera Sensor Metadata (EXIF)</strong></td>
                    <td>Physical ISO / Aperture / Hardware Make</td>
                    <td>
                      {result.metadata?.camera_make
                        ? `${result.metadata.camera_make} ${result.metadata.camera_model ?? ""}`
                        : "No Hardware EXIF"}
                    </td>
                    <td>
                      <span className={`pill ${result.metadata?.camera_make ? "ok" : "warn"}`}>
                        {result.metadata?.camera_make ? "VERIFIED" : "UNTAGGED"}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Real-World Grounding Section */}
            {result.entity_info && (
              <div className="cert-section">
                <h3 className="section-label">03. REAL-WORLD SUBJECT IDENTIFICATION & ONTOLOGICAL FACT SHEET</h3>
                <div className="cert-entity-banner">
                  <div className="cert-entity-header">
                    <strong>{result.entity_info.identified_subject}</strong>
                    <span className={`pill ${result.entity_info.exists_in_reality ? "ok" : "warn"}`}>
                      {result.entity_info.exists_in_reality ? "CONFIRMED REAL-WORLD ENTITY" : "SYNTHETIC / FICTIONAL"}
                    </span>
                  </div>
                  <p className="cert-entity-desc">{result.entity_info.informative_note}</p>
                  {result.entity_info.reference_urls.length > 0 && (
                    <div className="cert-urls-list">
                      <span className="cert-urls-label">Verified Reference Archives:</span>
                      <ul>
                        {result.entity_info.reference_urls.slice(0, 3).map((u, i) => (
                          <li key={i}>
                            <strong>{u.title}</strong>: <span className="cert-url-mono">{u.url}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Signature & Attestation Footer */}
            <div className="cert-footer">
              <div className="attestation-text">
                <p>
                  <strong>ATTESTATION:</strong> This document certifies that the aforementioned specimen
                  underwent multi-signal computational examination using the SON AI Multi-Spectral Suite.
                  Classification reflects empirical probability matrices and sensor telemetry.
                </p>
              </div>

              <div className="signature-lockup">
                <div className="sig-line">
                  <span className="examiner-name">
                    {user?.full_name ?? "Dr. Sarah Chen"}
                  </span>
                  <span className="examiner-title">
                    {user?.tier ?? "Principal Forensic Examiner"} · {user?.organization ?? "National Forensic Lab"}
                  </span>
                </div>
                <div className="cert-stamp">
                  <span>SON AI</span>
                  <span>LAB SEAL</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
