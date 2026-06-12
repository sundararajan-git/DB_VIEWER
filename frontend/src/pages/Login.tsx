import React, { useState } from "react";
import { Icon } from "@/components/Core";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError("Password is required to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(password);
    } catch (err: any) {
      setError(err.message || "Invalid password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="authpage">
      <form className="card fade-in" onSubmit={handleSubmit} style={{ width: 360, padding: 28, boxShadow: "var(--shadow)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: "var(--accent-soft)",
              border: "1px solid var(--accent-line)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent)",
            }}
          >
            <Icon n="database" s={18} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-.02em" }}>DB Viewer Suite</div>
            <div className="label">Authentication required</div>
          </div>
        </div>

        <label className="label" style={{ display: "block", marginBottom: 7 }}>
          Admin password
        </label>
        <div style={{ position: "relative" }}>
          <span
            style={{
              position: "absolute",
              left: 11,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-faint)",
            }}
          >
            <Icon n="lock" s={15} />
          </span>
          <input
            autoFocus
            type="password"
            className="field mono"
            style={{ paddingLeft: 34 }}
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
          />
        </div>

        {error && (
          <div className="alert err" style={{ marginTop: 12 }}>
            <Icon n="alert" s={15} />
            <span>{error}</span>
          </div>
        )}

        <button
          className="btn primary"
          type="submit"
          disabled={busy}
          style={{ width: "100%", justifyContent: "center", marginTop: 18, padding: "10px" }}
        >
          {busy ? (
            <>
              <Icon n="refresh" s={15} className="spin" />
              Signing in…
            </>
          ) : (
            <>
              Sign In
              <Icon n="arrowRight" s={15} />
            </>
          )}
        </button>

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 11, color: "var(--text-faint)" }}>
          Password-only access · no username
        </div>
      </form>
    </div>
  );
}
