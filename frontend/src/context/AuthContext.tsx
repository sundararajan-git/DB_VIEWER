import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

interface AuthContextValue {
  token: string | null;
  authRequired: boolean;
  isAuthenticated: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  authRequired: false,
  isAuthenticated: true,
  login: async () => {},
  logout: async () => {},
});

const TOKEN_KEY = "db_viewer_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [authRequired, setAuthRequired] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    fetch("/api/auth/status", {
      headers: storedToken ? { "x-auth-token": storedToken } : {},
    })
      .then(r => r.json())
      .then(data => {
        setAuthRequired(data.authRequired);
        if (!data.authRequired) { setToken(null); }
        else if (!data.authenticated) { setToken(null); localStorage.removeItem(TOKEN_KEY); }
        else { setToken(storedToken); }
      })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, []);

  const login = useCallback(async (password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    if (data.token) {
      setToken(data.token);
      localStorage.setItem(TOKEN_KEY, data.token);
    }
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      await fetch("/api/auth/logout", { method: "POST", headers: { "x-auth-token": token } }).catch(() => {});
    }
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
  }, [token]);

  if (!checked) return null;

  const isAuthenticated = !authRequired || !!token;

  return (
    <AuthContext.Provider value={{ token, authRequired, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
