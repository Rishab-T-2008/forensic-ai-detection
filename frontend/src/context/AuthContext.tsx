"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  organization: string;
  tier: string;
  scans_remaining: number;
  created_at: string;
}

export interface AuditHistoryItem {
  id: string;
  name: string;
  verdict: string;
  ai_percentage: number;
  real_percentage: number;
  preview_url: string;
  timestamp: string;
  details?: unknown;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthModalOpen: boolean;
  isPlanModalOpen: boolean;
  isHistoryModalOpen: boolean;
  history: AuditHistoryItem[];
  openAuthModal: () => void;
  closeAuthModal: () => void;
  openPlanModal: () => void;
  closePlanModal: () => void;
  openHistoryModal: () => void;
  closeHistoryModal: () => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, full_name: string, organization?: string) => Promise<void>;
  loginWithOAuth: (provider: "google" | "apple" | "x", payload?: { email?: string; full_name?: string; provider_id?: string }) => Promise<void>;
  sendPhoneOtp: (phoneNumber: string) => Promise<{ status: string; message: string; demo_otp?: string }>;
  verifyPhoneOtp: (phoneNumber: string, otpCode: string, fullName?: string) => Promise<void>;
  updatePlan: (planId: "starter" | "pro" | "enterprise") => Promise<void>;
  addHistoryItem: (item: AuditHistoryItem) => Promise<void>;
  deleteHistoryItem: (itemId: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  logout: () => void;
  pendingReviewAction: (() => void) | null;
  setPendingReviewAction: (action: (() => void) | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const STORAGE_TOKEN_KEY = "son_ai_auth_token";
const STORAGE_USER_KEY = "son_ai_auth_user";
const STORAGE_HISTORY_KEY = "son_ai_auth_history";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [history, setHistory] = useState<AuditHistoryItem[]>([]);
  const [pendingReviewAction, setPendingReviewAction] = useState<(() => void) | null>(null);

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
      const savedUser = localStorage.getItem(STORAGE_USER_KEY);
      const savedHistory = localStorage.getItem(STORAGE_HISTORY_KEY);

      if (savedHistory) {
        setHistory(JSON.parse(savedHistory));
      }

      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        // Verify user and fetch latest history
        fetch(`${backendUrl}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${savedToken}` },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((freshUser) => {
            if (freshUser) {
              setUser(freshUser);
              localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(freshUser));
            }
          })
          .catch(() => {});

        fetch(`${backendUrl}/api/v1/auth/history`, {
          headers: { Authorization: `Bearer ${savedToken}` },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((freshHistory) => {
            if (Array.isArray(freshHistory)) {
              setHistory(freshHistory);
              localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(freshHistory));
            }
          })
          .catch(() => {});
      }
    } catch {
      // Ignore localStorage issues
    }
  }, []);

  function handleSuccessfulAuth(newToken: string, newUser: UserProfile) {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem(STORAGE_TOKEN_KEY, newToken);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newUser));
    setIsAuthModalOpen(false);
    setIsPlanModalOpen(true);

    // Fetch user history upon login
    fetch(`${backendUrl}/api/v1/auth/history`, {
      headers: { Authorization: `Bearer ${newToken}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((freshHistory) => {
        if (Array.isArray(freshHistory)) {
          setHistory(freshHistory);
          localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(freshHistory));
        }
      })
      .catch(() => {});
  }

  async function login(email: string, password: string) {
    const res = await fetch(`${backendUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.detail || "Invalid email or password");
    }
    const data = await res.json();
    handleSuccessfulAuth(data.token, data.user);
  }

  async function signup(email: string, password: string, full_name: string, organization?: string) {
    const res = await fetch(`${backendUrl}/api/v1/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        full_name,
        organization: organization || "Independent Forensic Lab",
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.detail || "Failed to create account");
    }
    const data = await res.json();
    handleSuccessfulAuth(data.token, data.user);
  }

  async function loginWithOAuth(provider: "google" | "apple" | "x", payload?: { email?: string; full_name?: string; provider_id?: string }) {
    const res = await fetch(`${backendUrl}/api/v1/auth/oauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        provider_id: payload?.provider_id,
        email: payload?.email,
        full_name: payload?.full_name,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.detail || `Failed to authenticate with ${provider.toUpperCase()}`);
    }
    const data = await res.json();
    handleSuccessfulAuth(data.token, data.user);
  }

  async function sendPhoneOtp(phoneNumber: string) {
    const res = await fetch(`${backendUrl}/api/v1/auth/phone/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number: phoneNumber }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.detail || "Failed to transmit SMS verification code");
    }
    return await res.json();
  }

  async function verifyPhoneOtp(phoneNumber: string, otpCode: string, fullName?: string) {
    const res = await fetch(`${backendUrl}/api/v1/auth/phone/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone_number: phoneNumber,
        otp_code: otpCode,
        full_name: fullName,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.detail || "Invalid or expired verification code");
    }
    const data = await res.json();
    handleSuccessfulAuth(data.token, data.user);
  }

  async function updatePlan(planId: "starter" | "pro" | "enterprise") {
    if (!token) return;
    try {
      const res = await fetch(`${backendUrl}/api/v1/auth/update-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan_id: planId }),
      });
      if (res.ok) {
        const updatedUser = await res.json();
        setUser(updatedUser);
        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(updatedUser));
      }
    } catch {
      if (user) {
        const localPlans = {
          starter: { tier: "Free Community Starter", scans: 25 },
          pro: { tier: "Pro Forensic Analyst", scans: 500 },
          enterprise: { tier: "Enterprise Lab Tier", scans: 5000 },
        };
        const p = localPlans[planId] || localPlans.pro;
        const updated = { ...user, tier: p.tier, scans_remaining: p.scans };
        setUser(updated);
        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(updated));
      }
    } finally {
      setIsPlanModalOpen(false);
      if (pendingReviewAction) {
        const action = pendingReviewAction;
        setPendingReviewAction(null);
        action();
      }
    }
  }

  // --- Specimen Audit History Actions ---
  async function addHistoryItem(item: AuditHistoryItem) {
    // 1. Update local state
    setHistory((prev) => {
      const filtered = prev.filter((p) => p.id !== item.id);
      const updated = [item, ...filtered].slice(0, 100);
      try {
        localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // 2. Sync with backend if signed in
    if (token) {
      try {
        const res = await fetch(`${backendUrl}/api/v1/auth/history`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(item),
        });
        if (res.ok) {
          const fresh = await res.json();
          setHistory(fresh);
          localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(fresh));
        }
      } catch {}
    }
  }

  async function deleteHistoryItem(itemId: string) {
    // 1. Update local state immediately for responsive UI
    setHistory((prev) => {
      const updated = prev.filter((p) => p.id !== itemId);
      try {
        localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // 2. Sync with backend
    if (token) {
      try {
        const res = await fetch(`${backendUrl}/api/v1/auth/history/${encodeURIComponent(itemId)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const fresh = await res.json();
          setHistory(fresh);
          localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(fresh));
        }
      } catch {}
    }
  }

  async function clearHistory() {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_HISTORY_KEY);
    } catch {}

    if (token) {
      try {
        await fetch(`${backendUrl}/api/v1/auth/history`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
  }

  function logout() {
    if (token) {
      fetch(`${backendUrl}/api/v1/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setToken(null);
    setUser(null);
    setHistory([]);
    setPendingReviewAction(null);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_HISTORY_KEY);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthModalOpen,
        isPlanModalOpen,
        isHistoryModalOpen,
        history,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        openPlanModal: () => setIsPlanModalOpen(true),
        closePlanModal: () => setIsPlanModalOpen(false),
        openHistoryModal: () => setIsHistoryModalOpen(true),
        closeHistoryModal: () => setIsHistoryModalOpen(false),
        login,
        signup,
        loginWithOAuth,
        sendPhoneOtp,
        verifyPhoneOtp,
        updatePlan,
        addHistoryItem,
        deleteHistoryItem,
        clearHistory,
        logout,
        pendingReviewAction,
        setPendingReviewAction,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
