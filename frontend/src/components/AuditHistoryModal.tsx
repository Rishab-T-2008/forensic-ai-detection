"use client";

import { useState } from "react";
import { useAuth, type AuditHistoryItem } from "@/context/AuthContext";

export function AuditHistoryModal({
  onSelectAudit,
}: {
  onSelectAudit?: (item: AuditHistoryItem) => void;
}) {
  const { isHistoryModalOpen, closeHistoryModal, history, deleteHistoryItem, clearHistory, user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterVerdict, setFilterVerdict] = useState<"all" | "ai" | "real">("all");
  const [confirmClear, setConfirmClear] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!isHistoryModalOpen) return null;

  const filteredHistory = history.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const isAi = item.verdict === "likely_ai" || (item.ai_percentage && item.ai_percentage >= 50);
    if (filterVerdict === "ai") return matchesSearch && isAi;
    if (filterVerdict === "real") return matchesSearch && !isAi;
    return matchesSearch;
  });

  async function handleDeleteSingle(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await deleteHistoryItem(id);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClearAll() {
    await clearHistory();
    setConfirmClear(false);
  }

  function handleExportJson() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(history, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `forensic_audit_history_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  function handleExportCsv() {
    const header = "ID,Specimen Name,Verdict,AI Percentage,Real Percentage,Timestamp\n";
    const rows = history
      .map(
        (h) =>
          `"${h.id}","${h.name.replace(/"/g, '""')}","${h.verdict}",${h.ai_percentage}%,${h.real_percentage}%,"${h.timestamp}"`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `forensic_audit_history_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <div className="modal-backdrop" onClick={closeHistoryModal}>
      <div
        className="history-modal-wrapper"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Specimen Audit & Review History"
      >
        <button
          type="button"
          className="modal-close-btn"
          onClick={closeHistoryModal}
          aria-label="Close modal"
        >
          ✕
        </button>

        <div className="history-modal-header">
          <div className="plan-badge">AUDIT LOG REPOSITORY</div>
          <h2>Specimen Review & Forensic History</h2>
          <p className="history-modal-sub">
            All specimens reviewed by <strong>{user?.full_name || "Examiner"}</strong> are securely cataloged below.
            You can reload past investigations or permanently delete records at any time.
          </p>
        </div>

        {/* Toolbar: Search, Filter, and Export */}
        <div className="history-toolbar">
          <div className="history-search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by specimen filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery("")}
              >
                ✕
              </button>
            )}
          </div>

          <div className="history-filter-group">
            <button
              type="button"
              className={`filter-pill ${filterVerdict === "all" ? "is-active" : ""}`}
              onClick={() => setFilterVerdict("all")}
            >
              All ({history.length})
            </button>
            <button
              type="button"
              className={`filter-pill ${filterVerdict === "ai" ? "is-active" : ""}`}
              onClick={() => setFilterVerdict("ai")}
            >
              🤖 AI Detected
            </button>
            <button
              type="button"
              className={`filter-pill ${filterVerdict === "real" ? "is-active" : ""}`}
              onClick={() => setFilterVerdict("real")}
            >
              📸 Real Camera
            </button>
          </div>

          <div className="history-export-group">
            <button
              type="button"
              className="export-btn"
              onClick={handleExportJson}
              disabled={history.length === 0}
              title="Download full JSON forensic dossier"
            >
              📥 Export JSON
            </button>
            <button
              type="button"
              className="export-btn"
              onClick={handleExportCsv}
              disabled={history.length === 0}
              title="Download CSV spreadsheet"
            >
              📊 Export CSV
            </button>
          </div>
        </div>

        {/* History Records List */}
        <div className="history-records-container">
          {filteredHistory.length === 0 ? (
            <div className="history-empty-state">
              <span className="empty-icon">📂</span>
              <h3>No Forensic Review Records Found</h3>
              <p>
                {searchQuery || filterVerdict !== "all"
                  ? "No audit records matched your search filters."
                  : "When you upload and analyze image specimens, your review history will appear here."}
              </p>
            </div>
          ) : (
            <div className="history-cards-grid">
              {filteredHistory.map((item) => {
                const isAi = item.verdict === "likely_ai" || (item.ai_percentage && item.ai_percentage >= 50);
                return (
                  <div
                    key={item.id}
                    className={`history-card ${isAi ? "is-ai" : "is-real"}`}
                    onClick={() => {
                      if (onSelectAudit) {
                        onSelectAudit(item);
                        closeHistoryModal();
                      }
                    }}
                    title="Click to reload this investigation into the workbench"
                  >
                    <div className="history-card-thumb">
                      {item.preview_url ? (
                        <img src={item.preview_url} alt={item.name} />
                      ) : (
                        <div className="thumb-placeholder">🔬</div>
                      )}
                    </div>

                    <div className="history-card-body">
                      <div className="history-card-top">
                        <span className="history-timestamp">{item.timestamp}</span>
                        <span className={`verdict-tag ${isAi ? "ai" : "real"}`}>
                          {isAi ? `AI DETECTED (${item.ai_percentage}%)` : `AUTHENTIC (${item.real_percentage}%)`}
                        </span>
                      </div>

                      <h4 className="history-filename" title={item.name}>
                        {item.name}
                      </h4>

                      <div className="history-meta-row">
                        <span className="reload-hint">⚡ Click to reload telemetry</span>
                        <button
                          type="button"
                          className="delete-item-btn"
                          onClick={(e) => handleDeleteSingle(e, item.id)}
                          disabled={deletingId === item.id}
                          title="Delete this record"
                        >
                          {deletingId === item.id ? "Deleting..." : "🗑️ Delete"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="history-modal-footer">
          <div className="history-stats">
            <span>Total Logged Audits: <strong>{history.length}</strong></span>
            <span>• Filtered: <strong>{filteredHistory.length}</strong></span>
          </div>

          <div className="history-footer-actions">
            {!confirmClear ? (
              <button
                type="button"
                className="clear-all-history-btn"
                onClick={() => setConfirmClear(true)}
                disabled={history.length === 0}
              >
                🗑️ Clear All History
              </button>
            ) : (
              <div className="confirm-clear-box">
                <span>Permanently wipe all {history.length} records?</span>
                <button
                  type="button"
                  className="confirm-yes-btn"
                  onClick={handleClearAll}
                >
                  Yes, Wipe All
                </button>
                <button
                  type="button"
                  className="confirm-cancel-btn"
                  onClick={() => setConfirmClear(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
