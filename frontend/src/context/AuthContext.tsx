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
  openAuthModal: () => void;
  closeAuthModal: () => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, full_name: string, organization?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const STORAGE_TOKEN_KEY = "son_ai_auth_token";
const STORAGE_USER_KEY = "son_ai_auth_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

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
  }

  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthModalOpen,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        login,
        signup,
        logout,
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

