"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { AuthUser, UserRole } from "@/types/token";
import { loginUser, registerUser, fetchMe } from "@/lib/utils";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, role?: string) => Promise<void>;
  logout: () => void;
  hasRole: (role: UserRole) => boolean;
  /** Re-fetch the current user from /api/auth/me and update the cached user.
   * Useful after a username change so the UI reflects the new value. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  hasRole: () => false,
  refreshUser: async () => {},
});

const TOKEN_KEY = "simdia_token";
const COOKIE_NAME = "simdia_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) {
      setToken(saved);
      setCookie(saved);
      fetchMe(saved)
        .then((u) => setUser(u))
        .catch(() => {
          localStorage.removeItem(TOKEN_KEY);
          setCookie(null);
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const setCookie = (value: string | null) => {
    if (typeof document === "undefined") return;
    if (value) {
      document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=604800; SameSite=Lax`;
    } else {
      document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
    }
  };

  const login = useCallback(async (username: string, password: string) => {
    const res = await loginUser({ username, password });
    localStorage.setItem(TOKEN_KEY, res.token);
    setCookie(res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (username: string, password: string, role?: string) => {
    const res = await registerUser({ username, password, role });
    localStorage.setItem(TOKEN_KEY, res.token);
    setCookie(res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setCookie(null);
    setToken(null);
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (role: UserRole) => {
      if (!user) return false;
      const roles: UserRole[] = ["viewer", "operator", "admin"];
      const userIdx = roles.indexOf(user.role);
      const requiredIdx = roles.indexOf(role);
      return userIdx >= requiredIdx;
    },
    [user]
  );

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const u = await fetchMe(token);
      setUser(u);
    } catch {
      // ignore — caller can handle
    }
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        login,
        register,
        logout,
        hasRole,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
