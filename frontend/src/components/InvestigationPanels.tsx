"use client";

import { useEffect, useState } from "react";
import { detectImage } from "@/lib/api";
import type { DetectionResponse } from "@/types/detection";

type RobustnessResult = { label: string; score?: number; verdict?: string; error?: string };

function verdictLabel(result: DetectionResponse) {
  return result.verdict === "likely_ai" ? "AI DETECTED" : "AI NOT DETECTED";
}

export function InvestigationPanels({ file, result }: { file: File; result: DetectionResponse }) {
  const [activeTab, setActiveTab] = useState("robustness");
  const [robustness, setRobustness] = useState<RobustnessResult[]>([]);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState("");
  const [imageInfo, setImageInfo] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      setImageInfo({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function runRobustness() {
    setRunning(true);
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.src = url;
    await new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve(); });
    const tests = [
      { label: "Original", width: image.naturalWidth, quality: 1 },
      { label: "Resized", width: Math.max(32, Math.round(image.naturalWidth * 0.6)), quality: 0.92 },
      { label: "Recompressed", width: image.naturalWidth, quality: 0.55 },
    ];
    const next: RobustnessResult[] = [];
    for (const test of tests) {
      try {
        const canvas = document.createElement("canvas");
        const ratio = image.naturalHeight / image.naturalWidth;
        canvas.width = test.width;
        canvas.height = Math.max(32, Math.round(test.width * ratio));
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", test.quality));
        if (!blob) throw new Error("Could not create test image");
        const checked = await detectImage(new File([blob], `${test.label.toLowerCase()}.jpg`, { type: "image/jpeg" }));
        next.push({ label: test.label, score: checked.confidence, verdict: verdictLabel(checked) });
      } catch (error) {
        next.push({ label: test.label, error: error instanceof Error ? error.message : "Test failed" });
      }
    }
    URL.revokeObjectURL(url);
    setRobustness(next);
    setRunning(false);
  }

  const verdicts = robustness.filter((item) => item.verdict).map((item) => item.verdict);
  const stable = verdicts.length > 1 && new Set(verdicts).size === 1;
  const hashReady = typeof crypto !== "undefined" && Boolean(crypto.subtle);

  return <section className="investigation-deck">
    <div className="deck-tabs" role="tablist" aria-label="Investigation views">
      <button className={activeTab === "robustness" ? "active" : ""} onClick={() => setActiveTab("robustness")} role="tab" aria-selected={activeTab === "robustness"}>Robustness lab</button>
      <button className={activeTab === "provenance" ? "active" : ""} onClick={() => setActiveTab("provenance")} role="tab" aria-selected={activeTab === "provenance"}>Provenance blind spots</button>
      <button className={activeTab === "review" ? "active" : ""} onClick={() => setActiveTab("review")} role="tab" aria-selected={activeTab === "review"}>Review handoff</button>
    </div>
    {activeTab === "robustness" && <article className="deck-slide"><div className="panel-label">01 / Counterfactual testing</div><h3>Does the verdict survive ordinary sharing?</h3><p className="panel-note">Rechecks resized and recompressed copies. A stable result is more useful than a confident result that changes after a screenshot.</p><button type="button" onClick={() => void runRobustness()} disabled={running}>{running ? "Running stability checks..." : "Run stability checks"}</button>{robustness.length > 0 && <div className="robustness-table">{robustness.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.error ?? `${item.verdict} · ${Math.round((item.score ?? 0) * 100)}%`}</strong></div>)}</div>}<p className="deck-foot">{robustness.length ? stable ? "Stable across the tested transformations." : "The verdict changes under transformation; review the image manually." : "This test is one of the strongest practical safeguards against brittle image detectors."}</p></article>}
    {activeTab === "provenance" && <article className="deck-slide">
      <div className="panel-label">02 / Evidence availability</div>
      <h3>What can this file actually prove?</h3>
      <p className="panel-note">This panel displays measurable file facts, EXIF data, and C2PA or generator chunk markers found directly in the file bytes.</p>
      <div className="fact-grid">
        <div><span>File format</span><strong>{file.type || "Unknown"}</strong></div>
        <div><span>Dimensions</span><strong>{imageInfo ? `${imageInfo.width} x ${imageInfo.height}` : "Reading..."}</strong></div>
        <div><span>File size</span><strong>{(file.size / 1024 / 1024).toFixed(2)} MB</strong></div>
        <div><span>Integrity hash</span><strong>{hashReady ? "Available in audit report" : "Unavailable"}</strong></div>
        {result.metadata?.camera_make && <div><span>Camera make</span><strong>{result.metadata.camera_make}</strong></div>}
        {result.metadata?.camera_model && <div><span>Camera model</span><strong>{result.metadata.camera_model}</strong></div>}
        {result.metadata?.software && <div><span>Software</span><strong>{result.metadata.software}</strong></div>}
        <div><span>C2PA provenance</span><strong style={{ color: result.metadata?.c2pa_detected ? "#4ade80" : "#94a3b8" }}>{result.metadata?.c2pa_detected ? "Detected (JUMBF/C2PA)" : "None"}</strong></div>
      </div>
      {result.metadata?.ai_metadata && Object.keys(result.metadata.ai_metadata).length > 0 ? (
        <div className="blind-spot" style={{ background: "rgba(239, 68, 68, 0.1)", borderColor: "#ef4444" }}>
          <strong style={{ color: "#ef4444" }}>AI generation metadata discovered:</strong>
          <span>{Object.entries(result.metadata.ai_metadata).map(([k, v]) => `${k}: ${v}`).join(" | ")}</span>
        </div>
      ) : (
        <div className="blind-spot">
          <strong>Metadata note:</strong>
          <span>No embedded generation parameters, prompts, or custom PNG chunks were found.</span>
        </div>
      )}
    </article>}
    {activeTab === "review" && <article className="deck-slide"><div className="panel-label">03 / Human-in-the-loop</div><h3>Leave a defensible review note</h3><p className="panel-note">Record why a journalist, investigator, or moderator accepted or challenged this result. The note stays in this browser session.</p><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add observations, source context, or follow-up questions..." rows={4} /><div className="review-footer"><span>{note.length}/500 characters</span><strong>{verdictLabel(result)}</strong></div><p className="deck-foot">A detector should support a reviewer, not replace one. Keep the original file alongside this note.</p></article>}
  </section>;
}
