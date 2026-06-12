import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, Engine } from "@/components/Core";
import { useTheme } from "@/context/ThemeContext";
import { useConnection, type ActiveConnection } from "@/context/ConnectionContext";
import { apiFetch } from "@/lib/apiFetch";

interface SavedProfile {
  name: string;
  type: string;
  server: string;
  port: string;
  database: string;
  user: string;
  password?: string;
}

export default function DatabaseConfig() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { connections, activeConnectionId, setActiveConnectionId, refreshConnections } = useConnection();

  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [form, setForm] = useState({
    type: "postgres",
    port: "",
    server: "",
    database: "",
    user: "",
    password: "",
  });
  const [alert, setAlert] = useState<{ t: "err" | "ok"; m: string } | null>(null);
  const [profName, setProfName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch("/api/connections")
      .then((r) => r.json())
      .then((data) => setProfiles(data))
      .catch(() => {});
  }, []);

  const setVal = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setAlert(null);
  };

  const connect = async () => {
    if (!form.server || !form.database || !form.user) {
      setAlert({ t: "err", m: "Server host, database name and username are required." });
      return;
    }
    setBusy(true);
    setAlert(null);
    try {
      const res = await apiFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection failed");
      await refreshConnections();
      if (data.connectionId) setActiveConnectionId(data.connectionId);
      setAlert({ t: "ok", m: `Connected to ${form.database} on ${form.server}.` });
    } catch (err: any) {
      setAlert({ t: "err", m: err.message || "Connection failed" });
    } finally {
      setBusy(false);
    }
  };

  const loadProfile = (p: SavedProfile) => {
    setForm({
      type: p.type,
      port: p.port || "",
      server: p.server,
      database: p.database,
      user: p.user,
      password: p.password || "",
    });
    setAlert(null);
  };

  const saveProfile = async () => {
    if (!profName.trim()) return;
    try {
      await apiFetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, name: profName.trim() }),
      });
      const conns = await apiFetch("/api/connections").then((r) => r.json());
      setProfiles(conns);
      setProfName("");
    } catch (e) {}
  };

  const deleteProfile = async (name: string) => {
    try {
      await apiFetch(`/api/connections/${encodeURIComponent(name)}`, { method: "DELETE" });
      setProfiles((ps) => ps.filter((x) => x.name !== name));
    } catch (e) {}
  };

  const disconnect = async (id: string) => {
    try {
      await apiFetch("/api/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: id }),
      });
      await refreshConnections();
    } catch (e) {}
  };

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <div style={{ display: "flex", flexDirection: "row", flex: 1, minHeight: 0, position: "relative", width: "100%", height: "100%" }}>
      {/* sidebar */}
      <aside
        style={{
          width: 288,
          flex: "none",
          borderRight: "1px solid var(--border)",
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 9,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "var(--accent-soft)",
              border: "1px solid var(--accent-line)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent)",
            }}
          >
            <Icon n="database" s={15} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: "12.5px" }}>DB Viewer Suite</div>
            <div className="label">Connection manager</div>
          </div>
          <button className="btn icon sm ghost" onClick={toggleTheme} title="Toggle theme">
            <Icon n={theme === "dark" ? "sun" : "moon"} s={15} />
          </button>
        </div>

        {/* active connections */}
        <div style={{ padding: "14px 14px 6px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
            <span className="label">Active connections</span>
            <span className="badge accent">{connections.length} live</span>
          </div>
          {connections.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                padding: "22px 0",
                color: "var(--text-faint)",
              }}
            >
              <Icon n="wifiOff" s={24} />
              <span style={{ fontSize: "11.5px" }}>No active connections</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {connections.map((c: ActiveConnection) => (
                <div
                  key={c.id}
                  onClick={() => setActiveConnectionId(c.id)}
                  style={{
                    padding: "9px 10px",
                    borderRadius: 7,
                    cursor: "pointer",
                    border: "1px solid " + (activeConnectionId === c.id ? "var(--green)" : "var(--border)"),
                    background: activeConnectionId === c.id ? "var(--green-soft)" : "var(--surface-2)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                    <span className="dot live pulse" />
                    <Engine type={c.type} />
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 12,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.database}
                    </span>
                  </div>
                  <div className="mono" style={{ fontSize: "10.5px", color: "var(--text-faint)", marginBottom: 7 }}>
                    {c.server}:{c.port || (c.type === "postgres" ? "5432" : "1433")} · {c.user}
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button
                      className="btn sm"
                      style={{ flex: 1, justifyContent: "center" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveConnectionId(c.id);
                        navigate("/explorer");
                      }}
                    >
                      <Icon n="ext" s={13} />
                      Explorer
                    </button>
                    <button
                      className="btn sm icon"
                      title="Disconnect"
                      onClick={(e) => {
                        e.stopPropagation();
                        disconnect(c.id);
                      }}
                    >
                      <Icon n="unlink" s={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="divider" style={{ margin: "12px 0" }} />

        {/* saved profiles */}
        <div style={{ padding: "0 14px", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <span className="label" style={{ marginBottom: 9, display: "block" }}>
            Saved profiles
          </span>
          <div
            className="scroll"
            style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5, marginRight: -6, paddingRight: 6 }}
          >
            {profiles.map((p, i) => (
              <div
                key={p.name + i}
                className="prof"
                onClick={() => loadProfile(p)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "8px 9px",
                  borderRadius: 6,
                  cursor: "pointer",
                  border: "1px solid transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--hover)";
                  const delpBtn = e.currentTarget.querySelector(".delp") as HTMLElement;
                  if (delpBtn) delpBtn.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  const delpBtn = e.currentTarget.querySelector(".delp") as HTMLElement;
                  if (delpBtn) delpBtn.style.opacity = "0";
                }}
              >
                <Engine type={p.type} />
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.name}
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--text-faint)" }}>
                    {p.server}/{p.database}
                  </div>
                </div>
                <button
                  className="delp"
                  style={{
                    opacity: 0,
                    background: "none",
                    border: "none",
                    color: "var(--text-faint)",
                    cursor: "pointer",
                    transition: "opacity .12s",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteProfile(p.name);
                  }}
                >
                  <Icon n="trash" s={14} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, padding: "10px 0 14px", borderTop: "1px solid var(--border-soft)", marginTop: 8 }}>
            <input
              className="field"
              style={{ padding: "6px 9px", fontSize: "11.5px" }}
              placeholder="Save current as…"
              value={profName}
              onChange={(e) => setProfName(e.target.value)}
            />
            <button className="btn sm" onClick={saveProfile} disabled={!profName.trim()}>
              <Icon n="save" s={13} />
              Save
            </button>
          </div>
        </div>
      </aside>

      {/* main form */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto" }}>
        <div style={{ margin: "auto", maxWidth: 680, width: "100%", padding: "40px 28px" }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 13, flex: 1 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 9,
                  background: "var(--accent-soft)",
                  border: "1px solid var(--accent-line)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--accent)",
                  flex: "none",
                }}
              >
                <Icon n="plus" s={20} />
              </div>
              <div style={{ flex: 1 }}>
                <h1 style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.02em" }}>Add Connection</h1>
                <p style={{ fontSize: "12.5px", color: "var(--text-dim)", marginTop: 2, whiteSpace: "nowrap" }}>
                  Connect to an additional database — run as many as you need at once.
                </p>
              </div>
            </div>
            {connections.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--green)", fontSize: 12, flexShrink: 0, whiteSpace: "nowrap" }}>
                <Icon n="wifi" s={15} />
                <span>
                  <b>{connections.length}</b> active
                </span>
                <span style={{ color: "var(--text-faint)" }} className="mono">
                  · {connections.map((c) => c.database).join(", ")}
                </span>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 22 }}>
            {alert && (
              <div className={"alert " + (alert.t === "err" ? "err" : "ok")} style={{ marginBottom: 18 }}>
                <Icon n={alert.t === "err" ? "alert" : "check"} s={15} />
                <span>{alert.m}</span>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 14, marginBottom: 14 }}>
              <Fld label="Database Engine">
                <select className="field" value={form.type} onChange={setVal("type")}>
                  <option value="mssql">MS SQL Server</option>
                  <option value="postgres">PostgreSQL</option>
                </select>
              </Fld>
              <Fld label="Port" opt>
                <input
                  className="field mono"
                  placeholder={form.type === "postgres" ? "5432" : "1433"}
                  value={form.port}
                  onChange={setVal("port")}
                />
              </Fld>
            </div>
            <Fld label="Server Host / URL" req>
              <input className="field mono" placeholder="localhost" value={form.server} onChange={setVal("server")} />
            </Fld>
            <div style={{ height: 14 }} />
            <Fld label="Database Name" req>
              <input className="field mono" placeholder="shop_prod" value={form.database} onChange={setVal("database")} />
            </Fld>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
              <Fld label="Username" req>
                <input className="field mono" placeholder="app_rw" value={form.user} onChange={setVal("user")} />
              </Fld>
              <Fld label="Password">
                <input
                  type="password"
                  className="field mono"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={setVal("password")}
                />
              </Fld>
            </div>

            <div className="divider" style={{ margin: "20px 0 16px" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                style={{
                  fontSize: 12,
                  color: connections.length ? "var(--green)" : "var(--text-faint)",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <span
                  className={"dot " + (connections.length ? "live pulse" : "")}
                  style={{ background: connections.length ? "var(--green)" : "var(--text-faint)" }}
                />
                {connections.length
                  ? `${connections.length} database${connections.length > 1 ? "s" : ""} connected`
                  : "No active database connections"}
              </span>
              <div style={{ display: "flex", gap: 9 }}>
                {connections.length > 0 && (
                  <button className="btn" onClick={() => navigate("/explorer")}>
                    <Icon n="ext" s={14} />
                    Open Explorer
                  </button>
                )}
                <button className="btn primary" onClick={connect} disabled={busy}>
                  {busy ? <Icon n="refresh" s={14} className="spin" /> : <Icon n="zap" s={14} />}
                  Connect
                </button>
              </div>
            </div>
          </div>
          <p style={{ fontSize: "11.5px", color: "var(--text-faint)", marginTop: 14, lineHeight: 1.6 }}>
            Tip — press <span className="kbd">⌘</span> <span className="kbd">K</span> (or <span className="kbd">Ctrl</span> <span className="kbd">K</span>) anywhere to jump between tables, run SQL, or switch connections without leaving the keyboard.
          </p>
        </div>
      </main>
    </div>
  );
}

interface FldProps {
  label: string;
  req?: boolean;
  opt?: boolean;
  children: React.ReactNode;
}

const Fld: React.FC<FldProps> = ({ label, req, opt, children }) => {
  return (
    <label style={{ display: "block" }}>
      <span className="label" style={{ display: "flex", gap: 6, marginBottom: 7, alignItems: "center" }}>
        {label}
        {req && <span style={{ color: "var(--accent)" }}>*</span>}
        {opt && (
          <span
            style={{
              color: "var(--text-faint)",
              fontWeight: 500,
              textTransform: "none",
              letterSpacing: 0,
              fontSize: 10,
            }}
          >
            optional
          </span>
        )}
      </span>
      {children}
    </label>
  );
};
