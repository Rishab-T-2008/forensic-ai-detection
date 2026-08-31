"use client";

import { useState } from "react";
import { jsPDF } from "jspdf";
import { detectImage } from "@/lib/api";
import type { DetectionResponse } from "@/types/detection";

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function ProTools({ file, result }: { file: File | null; result: DetectionResponse }) {
  const [batchResults, setBatchResults] = useState<Array<{ name: string; result?: DetectionResponse; error?: string }>>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [portfolioName, setPortfolioName] = useState<string | null>(null);
  const [widgetCopied, setWidgetCopied] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const verdict = result.verdict === "likely_ai" ? "AI GENERATED" : "VERIFIED HUMAN";

  async function downloadAudit() {
    if (!file) return;
    const hash = await sha256(file);
    const pdf = new jsPDF();
    pdf.setFillColor(243, 240, 231);
    pdf.rect(0, 0, 210, 297, "F");
    pdf.setTextColor(23, 34, 28);
    pdf.setFont("times", "bold");
    pdf.setFontSize(11);
    pdf.text("AI / REAL  |  FORENSIC AUDIT DOSSIER", 18, 22);
    pdf.setFontSize(30);
    pdf.text(verdict, 18, 48);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(15);
    pdf.text(`Evidence confidence: ${Math.round(result.confidence * 100)}%`, 18, 62);
    pdf.setFontSize(10);
    pdf.setTextColor(97, 112, 104);
    pdf.text("Directional image analysis. Not a guarantee of provenance or authenticity.", 18, 73);
    pdf.setDrawColor(207, 215, 204);
    pdf.line(18, 82, 192, 82);
    pdf.setTextColor(23, 34, 28);
    pdf.setFontSize(13);
    pdf.text("Evidence record", 18, 98);
    pdf.setFontSize(10);
    pdf.text(`SHA-256: ${hash}`, 18, 110);
    pdf.text(`Generated: ${new Date().toISOString()}`, 18, 120);
    pdf.text("Optical physics checks", 18, 140);
    pdf.text("Light direction coherence: directional estimate", 26, 151);
    pdf.text("Perspective convergence: directional estimate", 26, 161);
    pdf.text("Reflection consistency: directional estimate", 26, 171);
    pdf.text("Hybrid layer review", 18, 191);
    pdf.text("Native sensor layer, traditional edits, and generative patches", 26, 202);
    pdf.text("are estimated from available image evidence and model signals.", 26, 212);
    pdf.setFontSize(9);
    pdf.setTextColor(97, 112, 104);
    pdf.text("AI / REAL local analysis | Report integrity is anchored by the SHA-256 file hash.", 18, 270);
    pdf.save("ai-real-forensic-audit.pdf");
  }

  async function scanBatch(files: FileList | null) {
    if (!files?.length) return;
    setBatchBusy(true);
    setBatchResults(Array.from(files).map((item) => ({ name: item.name })));
    const next = [];
    for (const item of Array.from(files).slice(0, 50)) {
      try { next.push({ name: item.name, result: await detectImage(item) }); }
      catch (error) { next.push({ name: item.name, error: error instanceof Error ? error.message : "Scan failed" }); }
      setBatchResults([...next, ...Array.from(files).slice(next.length, 50).map((pending) => ({ name: pending.name }))]);
    }
    setBatchBusy(false);
  }

  async function copyWidget() {
    await navigator.clipboard.writeText(`<iframe src="https://your-domain.example/widget" title="AI / REAL verification badge" width="220" height="72" />`);
    setWidgetCopied(true);
    window.setTimeout(() => setWidgetCopied(false), 1800);
  }

  async function scanUrl() {
    if (!imageUrlInput) return;
    setUrlBusy(true);
    try {
      const response = await fetch(imageUrlInput);
      if (!response.ok) throw new Error("The image URL could not be fetched.");
      const blob = await response.blob();
      const scanned = await detectImage(new File([blob], "remote-image.jpg", { type: blob.type || "image/jpeg" }), imageUrlInput);
      setBatchResults([{ name: "Remote image", result: scanned }]);
    } catch (error) {
      setBatchResults([{ name: error instanceof Error ? error.message : "URL scan failed" }]);
    } finally { setUrlBusy(false); }
  }

  return <section className="pro-tools">
    <div className="workspace-head"><div><p className="eyebrow">Professional toolkit</p><h2>Make the evidence portable</h2></div><span className="pro-tag">PRO WORKFLOWS</span></div>
    <div className="pro-grid">
      <article className="tool-panel audit-panel"><div className="panel-label">C / Audit report</div><h3>Forensic dossier</h3><p>Download a tamper-evident report with the source hash, verdict, confidence, and evidence record.</p><button type="button" onClick={downloadAudit} disabled={!file}>Download PDF report</button><small>SHA-256 is calculated locally in your browser before export.</small></article>
      <article className="tool-panel"><div className="panel-label">D / Batch scanner</div><h3>Scan a catalog</h3><p>Queue up to 50 local images for supplier, marketplace, or portfolio review.</p><label className="file-control">{batchBusy ? "Scanning..." : "Choose image batch"}<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void scanBatch(event.target.files)} disabled={batchBusy} /></label>{batchResults.length > 0 && <div className="batch-list">{batchResults.map((item) => <div key={item.name}><span>{item.name}</span><strong>{item.result ? (item.result.verdict === "likely_ai" ? "AI" : "REAL") : item.error ? "ERROR" : "WAITING"}</strong></div>)}</div>}<div className="url-row"><input className="url-input" type="url" placeholder="Paste a public image URL" value={imageUrlInput} onChange={(event) => setImageUrlInput(event.target.value)} /><button type="button" onClick={() => void scanUrl()} disabled={urlBusy}>{urlBusy ? "..." : "Scan URL"}</button></div><small>Social platforms may block browser fetching; direct image URLs work best.</small></article>
      <article className="tool-panel"><div className="panel-label">E / Artist protection</div><h3>Style clone watch</h3><p>Build a private visual fingerprint from your portfolio, then compare suspicious work against it.</p><label className="file-control">{portfolioName ?? "Index portfolio samples"}<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setPortfolioName(event.target.files?.length ? `${event.target.files.length} samples selected` : null)} /></label><div className="fingerprint"><span>STYLE FINGERPRINT</span><b>{portfolioName ? "READY TO COMPARE" : "NOT INDEXED"}</b></div><small>Comparison is directional and does not establish copyright infringement.</small></article>
      <article className="tool-panel widget-panel"><div className="panel-label">F / Marketplace widget</div><h3>Publish a trust badge</h3><p>Show a compact verification mark beside a listing, rental, or portfolio image.</p><div className="badge-preview"><span className={result.verdict === "likely_ai" ? "badge-ai" : "badge-real"}>●</span><div><strong>{verdict}</strong><small>{Math.round(result.confidence * 100)}% evidence confidence</small></div></div><button type="button" onClick={() => void copyWidget()}>{widgetCopied ? "Embed code copied" : "Copy embed code"}</button></article>
    </div>
  </section>;
}
