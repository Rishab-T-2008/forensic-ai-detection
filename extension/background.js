const DEFAULT_API_URL = "http://localhost:8000";

async function getApiUrl() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ apiUrl: DEFAULT_API_URL }, (items) => {
      resolve(items.apiUrl || DEFAULT_API_URL);
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ai-real-forensics",
    title: "Run AI / REAL forensics",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "ai-real-forensics" || !info.srcUrl || !tab?.id) return;
  const baseUrl = await getApiUrl();
  const endpoint = `${baseUrl}/api/v1/detect/image`;

  try {
    const response = await fetch(info.srcUrl);
    if (!response.ok) throw new Error("Could not fetch remote image from webpage");
    const blob = await response.blob();
    const body = new FormData();
    body.append("upload", blob, "browser-image.jpg");
    body.append("source_url", info.srcUrl);

    const apiResponse = await fetch(endpoint, { method: "POST", body });
    if (!apiResponse.ok) {
      const err = await apiResponse.json().catch(() => null);
      throw new Error(err?.detail || `API error (${apiResponse.status})`);
    }
    const result = await apiResponse.json();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: showResult, args: [result] });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Could not reach the AI / REAL service.";
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: showResult, args: [{ error: errorMsg }] });
  }
});

function showResult(result) {
  document.querySelector("#ai-real-extension-result")?.remove();
  const card = document.createElement("aside");
  card.id = "ai-real-extension-result";

  if (result.error) {
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="font-weight:700; color:#ef5350;">ANALYSIS FAILED</span>
        <button style="background:none; border:none; color:#bbb; font-size:16px; cursor:pointer;" onclick="this.closest('#ai-real-extension-result').remove()">×</button>
      </div>
      <p style="margin:0; font-size:12px; color:#ddd; font-family:system-ui,sans-serif;">${result.error}</p>
    `;
  } else {
    const isAi = result.verdict === "likely_ai";
    const statusColor = isAi ? "#f87171" : "#4ade80";
    const verdictTitle = isAi ? "AI DETECTED" : "AI NOT DETECTED";
    const conf = Math.round(result.confidence * 100);
    const aiPct = result.ai_percentage ?? 50;
    const realPct = result.real_percentage ?? (100 - aiPct);

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:700; color:${statusColor}; letter-spacing:0.5px;">${verdictTitle}</span>
        <button style="background:none; border:none; color:#bbb; font-size:16px; cursor:pointer;" onclick="this.closest('#ai-real-extension-result').remove()">×</button>
      </div>
      <div style="font-size:12px; font-family:system-ui,sans-serif; color:#cbd5e1; margin-bottom:8px;">
        Evidence confidence: <strong>${conf}%</strong> (AI: ${aiPct}% / Real: ${realPct}%)
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #2d3e34; padding-top:6px; font-size:11px; font-family:system-ui,sans-serif;">
        <span style="color:#94a3b8;">AI / REAL Forensics</span>
        <a href="http://localhost:3000" target="_blank" rel="noopener noreferrer" style="color:#60a5fa; text-decoration:none; font-weight:600;">Open Workbench →</a>
      </div>
    `;
  }

  Object.assign(card.style, {
    position: "fixed",
    zIndex: "2147483647",
    right: "24px",
    bottom: "24px",
    width: "280px",
    padding: "16px",
    borderRadius: "8px",
    background: "#17221c",
    color: "#fff",
    font: "14px Georgia, serif",
    boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
    border: "1px solid #26382e",
  });

  document.body.append(card);
  setTimeout(() => card.remove(), 12000);
}
