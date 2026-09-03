"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export function PlanSelectionModal() {
  const { isPlanModalOpen, closePlanModal, updatePlan, user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<"starter" | "pro" | "enterprise">("pro");
  const [busy, setBusy] = useState(false);

  if (!isPlanModalOpen) return null;

  async function handleConfirmPlan() {
    setBusy(true);
    try {
      await updatePlan(selectedPlan);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={closePlanModal}>
      <div
        className="plan-modal-wrapper"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Choose Your Forensic Plan"
      >
        <button
          type="button"
          className="modal-close-btn"
          onClick={closePlanModal}
          aria-label="Close modal"
        >
          ✕
        </button>

        <div className="plan-modal-header">
          <div className="plan-badge">MEMBERSHIP SELECTION</div>
          <h2>Select Your Forensic Investigation Tier</h2>
          <p className="plan-modal-sub">
            Welcome to the National Forensic Visual Suite, <strong>{user?.full_name || "Analyst"}</strong>!
            Select the computational tier that matches your investigation volume to unlock immediate scan telemetry.
          </p>
        </div>

        <div className="pricing-cards-grid">
          {/* Plan 1: Free Community */}
          <div
            className={`pricing-card ${selectedPlan === "starter" ? "is-selected" : ""}`}
            onClick={() => setSelectedPlan("starter")}
          >
            <div className="plan-tier-tag">COMMUNITY</div>
            <h3>Free Starter</h3>
            <div className="plan-price-row">
              <span className="price">$0</span>
              <span className="period">/ forever</span>
            </div>
            <p className="plan-desc">Essential visual forensics for students, researchers, and occasional verification.</p>
            <ul className="plan-features">
              <li>✓ <strong>25 Free Scans</strong> included</li>
              <li>✓ 2D-FFT Radial Power Spectrum</li>
              <li>✓ AI vs Real Binary Verdict Gauge</li>
              <li>✓ Standard Resolution (384px)</li>
              <li>✓ Privacy Metadata Stripper</li>
            </ul>
            <button
              type="button"
              className={`plan-select-btn ${selectedPlan === "starter" ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPlan("starter");
              }}
            >
              {selectedPlan === "starter" ? "● Selected" : "Select Starter"}
            </button>
          </div>

          {/* Plan 2: Pro Analyst (Featured) */}
          <div
            className={`pricing-card is-featured ${selectedPlan === "pro" ? "is-selected" : ""}`}
            onClick={() => setSelectedPlan("pro")}
          >
            <div className="featured-ribbon">RECOMMENDED</div>
            <div className="plan-tier-tag pro">PROFESSIONAL</div>
            <h3>Pro Analyst</h3>
            <div className="plan-price-row">
              <span className="price">$19</span>
              <span className="period">/ month</span>
            </div>
            <p className="plan-desc">For digital forensic investigators, journalists, and media verification teams.</p>
            <ul className="plan-features">
              <li>✓ <strong>500 High-Resolution Scans</strong></li>
              <li>✓ ResNet-18 Deep Convolutional Heatmaps</li>
              <li>✓ C2PA Cryptographic Provenance Manifests</li>
              <li>✓ Printable Signed Authenticity PDF Certificates</li>
              <li>✓ Full JSON Forensic Dossier Export</li>
              <li>✓ Priority Neural Model Queue</li>
            </ul>
            <button
              type="button"
              className={`plan-select-btn pro ${selectedPlan === "pro" ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPlan("pro");
              }}
            >
              {selectedPlan === "pro" ? "● Selected" : "Select Pro Analyst"}
            </button>
          </div>

          {/* Plan 3: Enterprise Lab */}
          <div
            className={`pricing-card ${selectedPlan === "enterprise" ? "is-selected" : ""}`}
            onClick={() => setSelectedPlan("enterprise")}
          >
            <div className="plan-tier-tag enterprise">ENTERPRISE</div>
            <h3>Enterprise Lab</h3>
            <div className="plan-price-row">
              <span className="price">$49</span>
              <span className="period">/ month</span>
            </div>
            <p className="plan-desc">Full institutional power for law enforcement, forensics labs, and security firms.</p>
            <ul className="plan-features">
              <li>✓ <strong>5,000 Scans / Month</strong></li>
              <li>✓ Automated Batch Folder & API Access</li>
              <li>✓ Raw Spectral Telemetry (.CSV & Numpy)</li>
              <li>✓ Multi-Examiner Seat Collaboration</li>
              <li>✓ Dedicated 24/7 Neural Cluster</li>
              <li>✓ Custom Forensic Report Branding</li>
            </ul>
            <button
              type="button"
              className={`plan-select-btn ${selectedPlan === "enterprise" ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPlan("enterprise");
              }}
            >
              {selectedPlan === "enterprise" ? "● Selected" : "Select Enterprise"}
            </button>
          </div>
        </div>

        <div className="plan-modal-footer">
          <div className="guarantee-note">
            🛡️ 100% Free Trial on all tiers • Instant activation • Cancel or switch anytime
          </div>
          <button
            type="button"
            className="plan-confirm-action-btn"
            onClick={handleConfirmPlan}
            disabled={busy}
          >
            {busy
              ? "Activating Forensic Credentials..."
              : `Confirm & Unlock Specimen Analysis (${selectedPlan.toUpperCase()}) →`}
          </button>
        </div>
      </div>
    </div>
  );
}
