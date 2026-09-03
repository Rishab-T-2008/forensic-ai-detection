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

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthModalOpen: boolean;
  isPlanModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  openPlanModal: () => void;
  closePlanModal: () => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, full_name: string, organization?: string) => Promise<void>;
  updatePlan: (planId: "starter" | "pro" | "enterprise") => Promise<void>;
  logout: () => void;
  pendingReviewAction: (() => void) | null;
  setPendingReviewAction: (action: (() => void) | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const STORAGE_TOKEN_KEY = "son_ai_auth_token";
const STORAGE_USER_KEY = "son_ai_auth_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [pendingReviewAction, setPendingReviewAction] = useState<(() => void) | null>(null);

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
      const savedUser = localStorage.getItem(STORAGE_USER_KEY);
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        // Verify with backend silently
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
      }
    } catch {
      // Ignore localStorage issues
    }
  }, []);

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
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem(STORAGE_TOKEN_KEY, data.token);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(data.user));
    setIsAuthModalOpen(false);

    // If there is a pending review, open the plan choosing screen
    if (pendingReviewAction) {
      setIsPlanModalOpen(true);
    }
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
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem(STORAGE_TOKEN_KEY, data.token);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(data.user));
    setIsAuthModalOpen(false);

    // Prompt user with plan selection right after signup
    setIsPlanModalOpen(true);
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
      // Execute the pending review action if waiting
      if (pendingReviewAction) {
        const action = pendingReviewAction;
        setPendingReviewAction(null);
        action();
      }
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
    setPendingReviewAction(null);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthModalOpen,
        isPlanModalOpen,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        openPlanModal: () => setIsPlanModalOpen(true),
        closePlanModal: () => setIsPlanModalOpen(false),
        login,
        signup,
        updatePlan,
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

