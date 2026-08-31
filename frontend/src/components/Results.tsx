"use client";

import { useState } from "react";
import type { DetectionResponse } from "@/types/detection";
import { ForensicCertificateModal } from "@/components/ForensicCertificateModal";

function getVerdictExplanation(result: DetectionResponse) {
  const signalEntries = Object.entries(result.signals || {});
  const strongestSignal = signalEntries.sort((a, b) => b[1] - a[1])[0];
  const strongestSignalName = ["filename_hint", "context_hint"].includes(strongestSignal?.[0] ?? "")
    ? "supporting evidence"
    : strongestSignal?.[0] ?? "visual evidence";
  const strongestSignalPct = Math.round((strongestSignal?.[1] ?? 0) * 100);

  if (result.verdict === "likely_ai") {
    return `This image looks AI-generated because the strongest signal is ${strongestSignalName} at ${strongestSignalPct}%, and the combined model cues lean toward synthetic content.`;
  }

  return `This image appears authentic because the strongest signal is ${strongestSignalName} at ${strongestSignalPct}%, and the overall evidence points away from synthetic generation.`;
}

export function Results({
  result,
  file,
}: {
  result: DetectionResponse;
  file?: File | null;
}) {
  const [showCertModal, setShowCertModal] = useState(false);
  const percent = Math.max(result.ai_percentage ?? 0, result.real_percentage ?? 0);
  const explanation = getVerdictExplanation(result);

  return (
    <>
      <section className={`results results-${result.verdict}`} aria-live="polite">
        <div className="result-heading">
          <div>
            <p className="eyebrow">Assessment</p>
            <h2>{result.verdict.replace("_", " ")}</h2>
          </div>
          <strong>{percent}%</strong>
        </div>

        <div className="verdict-split">
          <span>AI {result.ai_percentage ?? 0}%</span>
          <span>REAL {result.real_percentage ?? 0}%</span>
        </div>

        <div
          className="meter"
          role="meter"
          aria-label="Detection confidence"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${percent}%` }} />
        </div>

        <div className="signals">
          {Object.entries(result.signals || {})
            .filter(([name]) => !["filename_hint", "context_hint"].includes(name))
            .map(([name, score]) => (
              <span key={name}>
                {name}: {Math.round((score ?? 0) * 100)}%
              </span>
            ))}
        </div>

        <p className="explanation">{explanation}</p>

        {/* Competition Highlight: Export Certificate Button */}
        <div className="results-actions-bar">
          <button
            type="button"
            className="export-cert-btn"
            onClick={() => setShowCertModal(true)}
          >
            📜 Export Forensic Certificate (PDF / JSON)
          </button>
        </div>

        <p className="disclaimer">{result.disclaimer}</p>
      </section>

      {showCertModal && (
        <ForensicCertificateModal
          result={result}
          file={file}
          onClose={() => setShowCertModal(false)}
        />
      )}
    </>
  );
}