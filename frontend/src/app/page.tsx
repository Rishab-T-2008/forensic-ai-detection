"use client";

import { useState } from "react";
import { AuthProvider, useAuth, type AuditHistoryItem } from "@/context/AuthContext";
import { AuthModal } from "@/components/AuthModal";
import { PlanSelectionModal } from "@/components/PlanSelectionModal";
import { AuditHistoryModal } from "@/components/AuditHistoryModal";
import { UserNav } from "@/components/UserNav";
import { InteractiveDemoVideo } from "@/components/InteractiveDemoVideo";
import { SideBySideComparator } from "@/components/SideBySideComparator";
import { AnimeSceneFinder } from "@/components/AnimeSceneFinder";
import { EntityVerificationCard } from "@/components/EntityVerificationCard";
import { Results } from "@/components/Results";
import { UploadDropzone } from "@/components/UploadDropzone";
import { ForensicsWorkspace } from "@/components/ForensicsWorkspace";
import { ProTools } from "@/components/ProTools";
import { InvestigationPanels } from "@/components/InvestigationPanels";
import { ImageAssistant } from "@/components/ImageAssistant";
import { CreativeUtilitySuite } from "@/components/CreativeUtilitySuite";
import type { DetectionResponse } from "@/types/detection";

function ForensicWorkbench() {
  const { history, addHistoryItem, deleteHistoryItem, openHistoryModal } = useAuth();
  const [workbenchMode, setWorkbenchMode] = useState<"single" | "comparator" | "anime">("single");
  const [result, setResult] = useState<DetectionResponse | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  function handleResult(newResult: DetectionResponse) {
    setResult(newResult);
    if (previewUrl) {
      const item: AuditHistoryItem = {
        id: String(Date.now()),
        name: file?.name || "Specimen",
        verdict: newResult.verdict,
        ai_percentage: newResult.ai_percentage,
        real_percentage: newResult.real_percentage,
        preview_url: previewUrl,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        details: newResult,
      };
      void addHistoryItem(item);
    }
  }

  function loadRecentScan(item: AuditHistoryItem) {
    if (item.details) {
      setResult(item.details as DetectionResponse);
    }
    if (item.preview_url) {
      setPreviewUrl(item.preview_url);
    }
  }

  return (
    <main>
      <div className="shell">
        <header>
          <div className="brand-lockup">
            <span className="brand">AI / REAL</span>
            <span className="brand-sub">FORENSIC SUITE</span>
          </div>

          <div className="header-right-group">
            <div className="status-pill">
              <span className="pulse-dot" />
              <span>ENGINE ACTIVE · 384px SPECTRAL SCAN</span>
            </div>
            <UserNav />
          </div>
        </header>

        <section className="intro">
          <div>
            <p className="eyebrow">Visual Authenticity Workbench</p>
            <h1>Look closer.</h1>
          </div>
          <p className="intro-copy">
            A multi-signal investigation engine. Evaluates convolutional neural network layers,
            two-dimensional Fourier spectrum artifacts, and cryptographic provenance manifests.
          </p>
        </section>

        {/* Security & Anti-Misuse Trust Strip */}
        <div className="security-shield-strip">
          <div className="shield-item">
            <span className="shield-icon">🛡️</span>
            <span><strong>Hardened WAF:</strong> Rate-Limited & Bot-Throttled</span>
          </div>
          <div className="shield-item">
            <span className="shield-icon">🔒</span>
            <span><strong>Zero-Log Isolation:</strong> Ephemeral Memory Analysis</span>
          </div>
          <div className="shield-item">
            <span className="shield-icon">⚡</span>
            <span><strong>Zero-Bill Protection:</strong> Daily Quota Capped & SHA-256 Cached</span>
          </div>
        </div>

        {/* Mode Navigation Switch: Single vs Dual Comparator vs Anime/Movie Scene Finder */}
        <div className="workbench-mode-switch">
          <button
            type="button"
            className={`mode-btn ${workbenchMode === "single" ? "is-active" : ""}`}
            onClick={() => setWorkbenchMode("single")}
          >
            🔬 Single Specimen Workbench
          </button>
          <button
            type="button"
            className={`mode-btn ${workbenchMode === "comparator" ? "is-active" : ""}`}
            onClick={() => setWorkbenchMode("comparator")}
          >
            ⚖️ Dual Specimen Comparator (Side-by-Side)
          </button>
          <button
            type="button"
            className={`mode-btn ${workbenchMode === "anime" ? "is-active" : ""}`}
            onClick={() => setWorkbenchMode("anime")}
          >
            🎬 Anime, Movie & Series Finder
          </button>
        </div>

        {/* Eye-catching AI Demo Video / Operational Guide for Signed & Unsigned Users */}
        <InteractiveDemoVideo />

        {/* Render Active Independent Mode */}
        {workbenchMode === "anime" ? (
          <AnimeSceneFinder />
        ) : workbenchMode === "comparator" ? (
          <SideBySideComparator />
        ) : (
          <>
            {/* Feature 5: Recent Scans Audit Log Strip with Interactive Management */}
            {history.length > 0 && (
              <div className="recent-scans-strip">
                <div className="recent-scans-head">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>🕒 SPECIMEN AUDIT LOG ({history.length})</span>
                    <button
                      type="button"
                      className="manage-history-btn"
                      onClick={openHistoryModal}
                      title="Open full audit history manager"
                    >
                      🗂️ View & Manage All
                    </button>
                  </div>
                </div>
                <div className="recent-scans-list">
                  {history.slice(0, 10).map((item) => {
                    const isAi = item.verdict === "likely_ai" || (item.ai_percentage && item.ai_percentage >= 50);
                    return (
                      <div key={item.id} className="recent-scan-chip-wrapper">
                        <button
                          type="button"
                          className="recent-scan-chip"
                          onClick={() => loadRecentScan(item)}
                          title={`Click to reload audit for ${item.name}`}
                        >
                          {item.preview_url ? (
                            <img src={item.preview_url} alt={item.name} className="scan-chip-thumb" />
                          ) : (
                            <span className="scan-chip-icon">🔬</span>
                          )}
                          <span style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {item.name}
                          </span>
                          <span className={`scan-chip-verdict ${isAi ? "ai" : "real"}`}>
                            {isAi ? `AI ${item.ai_percentage}%` : `Real ${item.real_percentage}%`}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="chip-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteHistoryItem(item.id);
                          }}
                          title="Delete this record"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <UploadDropzone
              onResult={handleResult}
              onPreview={setPreviewUrl}
              onFile={setFile}
              result={result}
            />

            {!result ? (
              <section className="instrument-overview">
                <div className="overview-header">
                  <span className="eyebrow">Multimodal Inspection Pipeline</span>
                  <h2>Laboratory Instrumentation</h2>
                </div>
                <div className="instrument-grid">
                  <article className="instrument-card">
                    <div className="card-top">
                      <span className="instrument-id">01 / SPECTRAL</span>
                      <span className="instrument-tag">FFT + DCT</span>
                    </div>
                    <h3>Frequency Energy Distribution</h3>
                    <p>
                      Calculates high-to-low radial power spectral density and DCT tail energy to expose
                      checkerboard upsampling and periodic synthetic artifacts.
                    </p>
                  </article>

                  <article className="instrument-card">
                    <div className="card-top">
                      <span className="instrument-id">02 / PROVENANCE</span>
                      <span className="instrument-tag">C2PA + EXIF</span>
                    </div>
                    <h3>Cryptographic & Metadata Manifests</h3>
                    <p>
                      Sniffs for Coalition for Content Provenance and Authenticity (C2PA) JUMBF boxes, camera
                      hardware sensor tags, and generative workflow chunks.
                    </p>
                  </article>

                  <article className="instrument-card">
                    <div className="card-top">
                      <span className="instrument-id">03 / CONVOLUTION</span>
                      <span className="instrument-tag">RESNET-18</span>
                    </div>
                    <h3>Spatial Feature Inference</h3>
                    <p>
                      High-capacity neural feature extractor evaluating micro-texture consistency,
                      skin pore continuity, and unnatural chromatic gradients.
                    </p>
                  </article>

                  <article className="instrument-card">
                    <div className="card-top">
                      <span className="instrument-id">04 / ASSISTANT</span>
                      <span className="instrument-tag">SON AI</span>
                    </div>
                    <h3>Human-in-the-Loop Interrogation</h3>
                    <p>
                      Ask targeted forensic questions about localized lighting, eye reflections, or
                      geometry directly to SON AI.
                    </p>
                  </article>
                </div>
              </section>
            ) : (
              <>
                <Results result={result} file={file} />
                <EntityVerificationCard entityInfo={result.entity_info} />
                {previewUrl && <ForensicsWorkspace imageUrl={previewUrl} result={result} />}
                {previewUrl && <CreativeUtilitySuite imageUrl={previewUrl} file={file} result={result} />}
                <ProTools file={file} result={result} />
                {file && <InvestigationPanels file={file} result={result} />}
              </>
            )}
          </>
        )}

        <ImageAssistant file={file} result={result} />
        <AuthModal />
        <PlanSelectionModal />
        <AuditHistoryModal onSelectAudit={loadRecentScan} />
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <ForensicWorkbench />
    </AuthProvider>
  );
}
