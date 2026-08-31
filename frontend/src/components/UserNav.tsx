"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export function UserNav() {
  const { user, openAuthModal, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (!user) {
    return (
      <div className="user-nav-actions">
        <button
          type="button"
          className="sign-in-btn"
          onClick={openAuthModal}
        >
          <span>Sign In / Create Account</span>
        </button>
      </div>
    );
  }

  return (
    <div className="user-profile-widget">
      <button
        type="button"
        className="user-badge-btn"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        aria-expanded={dropdownOpen}
      >
        <span className="user-avatar-icon">👤</span>
        <span className="user-name">{user.full_name}</span>
        <span className="user-badge-pill">{user.tier}</span>
        <span className="chevron">{dropdownOpen ? "▲" : "▼"}</span>
      </button>

      {dropdownOpen && (
        <div className="user-dropdown-menu">
          <div className="dropdown-user-info">
            <strong>{user.full_name}</strong>
            <span className="dropdown-email">{user.email}</span>
            <span className="dropdown-org">🏛️ {user.organization}</span>
          </div>

          <div className="dropdown-stat-row">
            <span>Analyst Quota</span>
            <strong>{user.scans_remaining} scans left</strong>
          </div>

          <div className="dropdown-actions">
            <button
              type="button"
              className="sign-out-btn"
              onClick={() => {
                logout();
                setDropdownOpen(false);
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

