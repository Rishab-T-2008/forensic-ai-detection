const DEFAULT_API_URL = "http://localhost:8000";

document.addEventListener("DOMContentLoaded", () => {
  const apiUrlInput = document.getElementById("apiUrl");
  const saveBtn = document.getElementById("saveBtn");
  const statusEl = document.getElementById("status");

  chrome.storage.sync.get({ apiUrl: DEFAULT_API_URL }, (items) => {
    apiUrlInput.value = items.apiUrl;
  });

  saveBtn.addEventListener("click", () => {
    const rawUrl = apiUrlInput.value.trim() || DEFAULT_API_URL;
    const cleanUrl = rawUrl.replace(/\/+$/, "");
    chrome.storage.sync.set({ apiUrl: cleanUrl }, () => {
      statusEl.textContent = "Settings saved.";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 2000);
    });
  });
});

