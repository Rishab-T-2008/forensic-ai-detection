"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, login, signup } = useAuth();
  const [tab, setTab] = useState<"login" | "signup">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthModalOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      if (tab === "login") {
        await login(email, password);
      } else {
        if (!fullName.trim()) throw new Error("Full name is required");
        await signup(email, password, fullName, organization);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  function handleDemoLogin() {
    setEmail("analyst@forensics.org");
    setPassword("password123");
    setTab("login");
  }

  return (
    <div className="modal-backdrop" onClick={closeAuthModal}>
      <div
        className="auth-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Account Access"
      >
        <button
          type="button"
          className="modal-close-btn"
          onClick={closeAuthModal}
          aria-label="Close modal"
        >
          ✕
        </button>

        <div className="auth-header">
          <div className="brand-badge">SON AI / LAB AUTH</div>
          <h2>{tab === "login" ? "Forensic Analyst Sign In" : "Register Analyst Account"}</h2>
          <p className="auth-sub">
            {tab === "login"
              ? "Access cryptographic audit logs, high-resolution spectral exports, and saved investigations."
              : "Create your verified credentials to access 500 scans, priority compute, and full provenance reports."}
          </p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab-btn ${tab === "login" ? "is-active" : ""}`}
            onClick={() => {
              setTab("login");
              setError(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${tab === "signup" ? "is-active" : ""}`}
            onClick={() => {
              setTab("signup");
              setError(null);
            }}
          >
            Create Account
          </button>
        </div>

        {error && <div className="auth-error-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {tab === "signup" && (
            <>
              <div className="form-group">
                <label htmlFor="fullname-input">Full Name / Examiner Title</label>
                <input
                  id="fullname-input"
                  type="text"
                  placeholder="e.g. Dr. Alex Mercer"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="org-input">Institution / Laboratory</label>
                <input
                  id="org-input"
                  type="text"
                  placeholder="e.g. Digital Media Forensics Group"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="email-input">Official Email Address</label>
            <input
              id="email-input"
              type="email"
              placeholder="analyst@forensics.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password-input">Security Passphrase</label>
            <input
              id="password-input"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <div className="auth-form-actions">
            <button type="submit" className="auth-submit-btn" disabled={busy}>
              {busy
                ? "Verifying Credentials..."
                : tab === "login"
                ? "Authorize & Sign In"
                : "Create Analyst Account"}
            </button>

            {tab === "login" && (
              <button
                type="button"
                className="demo-autofill-btn"
                onClick={handleDemoLogin}
              >
                ⚡ Auto-fill Demo Account (analyst@forensics.org)
              </button>
            )}
          </div>
        </form>

        <div className="auth-footer">
          {tab === "login" ? (
            <p>
              New to the lab?{" "}
              <button
                type="button"
                className="text-link-btn"
                onClick={() => {
                  setTab("signup");
                  setError(null);
                }}
              >
                Create an account
              </button>
            </p>
          ) : (
            <p>
              Already registered?{" "}
              <button
                type="button"
                className="text-link-btn"
                onClick={() => {
                  setTab("login");
                  setError(null);
                }}
              >
                Sign in to existing account
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

