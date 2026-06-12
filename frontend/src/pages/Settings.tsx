import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon, Engine } from "@/components/Core";
import { useConnection } from "@/context/ConnectionContext";
import { useTheme, ACCENT_PRESETS, DEFAULT_ACCENT } from "@/context/ThemeContext";
import type { AppFont } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
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

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "connections";

  const { connections, activeConnectionId, setActiveConnectionId, refreshConnections } = useConnection();
  const { theme, setTheme, font, setFont, accentColor, setAccentColor } = useTheme();
  const { authRequired, logout } = useAuth();
  const { toast } = useToast();

  // Connection manager states
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
      toast(`Successfully connected to ${form.database}`, "success");
    } catch (err: any) {
      setAlert({ t: "err", m: err.message || "Connection failed" });
      toast(err.message || "Connection failed", "error");
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
      toast("Connection profile saved successfully", "success");
    } catch (e) {}
  };

  const deleteProfile = async (name: string) => {
    try {
      await apiFetch(`/api/connections/${encodeURIComponent(name)}`, { method: "DELETE" });
      setProfiles((ps) => ps.filter((x) => x.name !== name));
      toast("Profile deleted successfully", "info");
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
      toast("Disconnected successfully", "info");
    } catch (e) {}
  };

  // Preference manager states & handlers
  const handleClearHistory = () => {
    localStorage.removeItem("sqllab_history");
    toast("SQL Lab query history cleared successfully", "success");
  };

  const fontOptions: { id: AppFont; name: string }[] = [
    { id: "geist", name: "Geist" },
    { id: "inter", name: "Inter" },
    { id: "jetbrains-mono", name: "JetBrains Mono" },
    { id: "ibm-plex", name: "IBM Plex Sans" },
    { id: "ibm-plex-mono", name: "IBM Plex Mono" },
    { id: "verdana", name: "Verdhana" },
    { id: "system", name: "System Default" },
  ];

  const setActiveTab = (t: string) => {
    setSearchParams({ tab: t });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, height: "100%", minHeight: 0, overflow: "hidden" }}>
      
      {/* Tab Header Bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "10px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        flex: "none",
      }}>
        <span style={{ fontWeight: 700, fontSize: "14px", marginRight: 16, color: "var(--text)" }}>Settings</span>
        
        <button
          className={"btn sm " + (activeTab === "connections" ? "" : "ghost")}
          style={{
            padding: "5px 12px",
            background: activeTab === "connections" ? "var(--accent-soft)" : "transparent",
            color: activeTab === "connections" ? "var(--accent)" : "var(--text-dim)",
            borderColor: activeTab === "connections" ? "var(--accent-line)" : "transparent",
          }}
          onClick={() => setActiveTab("connections")}
        >
          <Icon n="database" s={13} />
          <span>Connections</span>
        </button>

        <button
          className={"btn sm " + (activeTab === "preferences" ? "" : "ghost")}
          style={{
            padding: "5px 12px",
            background: activeTab === "preferences" ? "var(--accent-soft)" : "transparent",
            color: activeTab === "preferences" ? "var(--accent)" : "var(--text-dim)",
            borderColor: activeTab === "preferences" ? "var(--accent-line)" : "transparent",
          }}
          onClick={() => setActiveTab("preferences")}
        >
          <Icon n="settings" s={13} />
          <span>Preferences</span>
        </button>
      </div>

      {/* Tab Body */}
      {activeTab === "connections" ? (
        <div className="scroll animate-fade-in" style={{ flex: 1, padding: "24px 32px" }}>
          <div style={{
            maxWidth: 1080,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: 28,
            alignItems: "start"
          }}>
            
            {/* Left Column: Active Connections & Saved Profiles */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              
              {/* Active Connections */}
              <div className="card" style={{ padding: 22 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>Active Connections</h3>
                  <span className="badge dim">{connections.length} live</span>
                </div>
                
                {connections.length === 0 ? (
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    padding: "24px 0",
                    color: "var(--text-faint)"
                  }}>
                    <Icon n="wifiOff" s={20} />
                    <span style={{ fontSize: "11px" }}>No active database connections</span>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {connections.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setActiveConnectionId(c.id)}
                        style={{
                          padding: 12,
                          borderRadius: 8,
                          border: "1px solid " + (activeConnectionId === c.id ? "var(--green)" : "var(--border)"),
                          background: activeConnectionId === c.id ? "var(--green-soft)" : "var(--surface)",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                          <span className="dot live pulse" />
                          <Engine type={c.type} />
                          <span style={{ fontWeight: 600, fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.database}
                          </span>
                        </div>
                        <div className="mono" style={{ fontSize: "10.5px", color: "var(--text-faint)", marginBottom: 8 }}>
                          {c.server}:{c.port || (c.type === "postgres" ? "5432" : "1433")} · {c.user}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="btn sm"
                            style={{ flex: 1, justifyContent: "center", height: 26, fontSize: "11px" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveConnectionId(c.id);
                              navigate("/explorer");
                            }}
                          >
                            <Icon n="ext" s={12} />
                            <span>Explorer</span>
                          </button>
                          <button
                            className="btn sm icon"
                            style={{ height: 26 }}
                            title="Disconnect"
                            onClick={(e) => {
                              e.stopPropagation();
                              disconnect(c.id);
                            }}
                          >
                            <Icon n="unlink" s={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Saved Profiles */}
              <div className="card" style={{ padding: 22 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>Saved Profiles</h3>
                
                {profiles.length === 0 ? (
                  <div style={{ padding: "16px 0", color: "var(--text-faint)", fontSize: "11px", textAlign: "center" }}>
                    No saved database profiles
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
                    {profiles.map((p, i) => (
                      <div
                        key={p.name + i}
                        className="prof"
                        onClick={() => loadProfile(p)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 9,
                          padding: "8px",
                          borderRadius: 6,
                          cursor: "pointer",
                          border: "1px solid transparent",
                          transition: "background .12s",
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
                          <Icon n="trash" s={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div style={{ display: "flex", gap: 6, padding: "12px 0 0", borderTop: "1px solid var(--border-soft)", marginTop: 12 }}>
                  <input
                    className="field"
                    style={{ padding: "4px 8px", fontSize: "11px", height: "26px" }}
                    placeholder="Save current configuration as…"
                    value={profName}
                    onChange={(e) => setProfName(e.target.value)}
                  />
                  <button className="btn sm" style={{ height: "26px" }} onClick={saveProfile} disabled={!profName.trim()}>
                    <Icon n="save" s={12} />
                    <span>Save</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Right Column: Connection Form */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div className="card" style={{ padding: 24 }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
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
                    <Icon n="plus" s={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>Add Database Connection</h3>
                    <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--text-faint)" }}>
                      Connect to an additional SQL Server or PostgreSQL database.
                    </p>
                  </div>
                </div>

                {alert && (
                  <div className={"alert " + (alert.t === "err" ? "err" : "ok")} style={{ marginBottom: 18 }}>
                    <Icon n={alert.t === "err" ? "alert" : "check"} s={14} />
                    <span>{alert.m}</span>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 12, marginBottom: 14 }}>
                  <Fld label="Database Engine">
                    <select className="field" style={{ padding: "4px 24px 4px 8px", fontSize: "12px", height: "30px" }} value={form.type} onChange={setVal("type")}>
                      <option value="mssql">MS SQL Server</option>
                      <option value="postgres">PostgreSQL</option>
                    </select>
                  </Fld>
                  <Fld label="Port" opt>
                    <input
                      className="field mono"
                      style={{ padding: "4px 8px", fontSize: "12px", height: "30px" }}
                      placeholder={form.type === "postgres" ? "5432" : "1433"}
                      value={form.port}
                      onChange={setVal("port")}
                    />
                  </Fld>
                </div>
                <Fld label="Server Host / URL" req>
                  <input className="field mono" style={{ padding: "4px 8px", fontSize: "12px", height: "30px" }} placeholder="localhost" value={form.server} onChange={setVal("server")} />
                </Fld>
                <div style={{ height: 12 }} />
                <Fld label="Database Name" req>
                  <input className="field mono" style={{ padding: "4px 8px", fontSize: "12px", height: "30px" }} placeholder="shop_prod" value={form.database} onChange={setVal("database")} />
                </Fld>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
                  <Fld label="Username" req>
                    <input className="field mono" style={{ padding: "4px 8px", fontSize: "12px", height: "30px" }} placeholder="app_rw" value={form.user} onChange={setVal("user")} />
                  </Fld>
                  <Fld label="Password">
                    <input
                      type="password"
                      className="field mono"
                      style={{ padding: "4px 8px", fontSize: "12px", height: "30px" }}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={setVal("password")}
                    />
                  </Fld>
                </div>

                <div className="divider" style={{ margin: "20px 0 16px" }} />
                
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span
                    style={{
                      fontSize: 11,
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
                      : "No active connections"}
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    {connections.length > 0 && (
                      <button className="btn sm ghost" style={{ height: "30px" }} onClick={() => navigate("/explorer")}>
                        <Icon n="ext" s={13} />
                        <span>Explorer</span>
                      </button>
                    )}
                    <button className="btn sm primary" style={{ height: "30px" }} onClick={connect} disabled={busy}>
                      {busy ? <Icon n="refresh" s={13} className="spin" /> : <Icon n="zap" s={13} />}
                      <span>Connect</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      ) : (
        <div className="scroll animate-fade-in" style={{ flex: 1, padding: "24px 32px" }}>
          <div style={{ maxWidth: 800, margin: "0 auto" }}>
            
            {/* Preferences Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: "var(--accent-soft)",
                border: "1px solid var(--accent-line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent)",
              }}>
                <Icon n="settings" s={20} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "var(--text)" }}>Application Preferences</h2>
                <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-faint)" }}>
                  Configure user settings and toggle layout appearance options.
                </p>
              </div>
            </div>

            {/* Section 2: Preferences */}
            <div className="card" style={{ padding: 24, marginBottom: 24 }}>
              <h3 style={{ margin: "0 0 4px", fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>Preferences & Appearance</h3>
              <p style={{ margin: "0 0 18px", fontSize: "12px", color: "var(--text-faint)" }}>
                Customize the look and feel of the DB Viewer Suite.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                
                {/* Color Theme Selector */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>Color Theme</span>
                    <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--text-faint)" }}>
                      Choose your preferred color mode.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6, background: "var(--surface-2)", padding: 4, borderRadius: 8, border: "1px solid var(--border)" }}>
                    {(["light", "dark", "system"] as const).map((t) => {
                      const isActive = theme === t;
                      return (
                        <button
                          key={t}
                          className={"btn sm " + (isActive ? "" : "ghost")}
                          style={{
                            padding: "4px 12px",
                            fontSize: "11px",
                            height: "26px",
                            background: isActive ? "var(--surface)" : "transparent",
                            borderColor: isActive ? "var(--border)" : "transparent",
                            textTransform: "capitalize",
                          }}
                          onClick={() => setTheme(t)}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ height: "1px", background: "var(--border-soft)" }} />

                {/* Accent Color */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>Accent Color</span>
                    <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--text-faint)" }}>
                      Choose the primary highlight color used across the interface.
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
                    {/* Preset swatches */}
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {ACCENT_PRESETS.map((p) => {
                        const isActive = accentColor.toLowerCase() === p.hex.toLowerCase();
                        return (
                          <button
                            key={p.hex}
                            title={p.name}
                            onClick={() => setAccentColor(p.hex)}
                            style={{
                              width: 28, height: 28, borderRadius: 7, border: "none", cursor: "pointer",
                              background: p.hex,
                              outline: isActive ? `3px solid ${p.hex}` : "3px solid transparent",
                              outlineOffset: 2,
                              boxShadow: isActive ? `0 0 0 1px var(--border)` : "none",
                              transform: isActive ? "scale(1.15)" : "scale(1)",
                              transition: "transform .15s, outline .15s",
                              position: "relative",
                            }}
                          >
                            {isActive && (
                              <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontSize: 12, fontWeight: 800 }}>✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {/* Custom hex input + native color picker */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>Custom</span>
                      <div style={{ position: "relative", width: 28, height: 28 }}>
                        <input
                          type="color"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: "none" }}
                        />
                        <div style={{
                          width: 28, height: 28, borderRadius: 7, border: "2px solid var(--border)",
                          background: accentColor, pointerEvents: "none",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        </div>
                      </div>
                      <code style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--text-dim)", letterSpacing: ".05em" }}>{accentColor}</code>
                      {accentColor.toLowerCase() !== DEFAULT_ACCENT.toLowerCase() && (
                        <button className="btn sm ghost" style={{ height: 22, padding: "0 7px", fontSize: "10px" }} onClick={() => setAccentColor(DEFAULT_ACCENT)}>
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ height: "1px", background: "var(--border-soft)" }} />

                {/* Font Selector */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>Application Font</span>
                    <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--text-faint)" }}>
                      Select the font family used throughout the interface.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6, background: "var(--surface-2)", padding: 4, borderRadius: 8, border: "1px solid var(--border)" }}>
                    {fontOptions.map((opt) => {
                      const isActive = font === opt.id;
                      return (
                        <button
                          key={opt.id}
                          className={"btn sm " + (isActive ? "" : "ghost")}
                          style={{
                            padding: "4px 10px",
                            fontSize: "11px",
                            height: "26px",
                            background: isActive ? "var(--surface)" : "transparent",
                            borderColor: isActive ? "var(--border)" : "transparent",
                          }}
                          onClick={() => setFont(opt.id)}
                        >
                          {opt.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>

            {/* Section 3: Tools */}
            <div className="card" style={{ padding: 24, marginBottom: 24 }}>
              <h3 style={{ margin: "0 0 4px", fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>Maintenance & Tools</h3>
              <p style={{ margin: "0 0 18px", fontSize: "12px", color: "var(--text-faint)" }}>
                Clear local connection caches and reset local storage.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                
                {/* Refresh cache */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>Refresh Schema Cache</span>
                    <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--text-faint)" }}>
                      Force reload connection metadata and schema mappings.
                    </p>
                  </div>
                  <button className="btn ghost" onClick={() => window.location.reload()} style={{ width: 140, justifyContent: "center" }}>
                    <Icon n="refresh" s={14} />
                    <span>Refresh Cache</span>
                  </button>
                </div>

                <div style={{ height: "1px", background: "var(--border-soft)" }} />

                {/* Clear Query History */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>Clear SQL Query History</span>
                    <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--text-faint)" }}>
                      Erase local record of recently run queries in the SQL Lab.
                    </p>
                  </div>
                  <button className="btn ghost" onClick={handleClearHistory} style={{ width: 140, justifyContent: "center" }}>
                    <Icon n="trash" s={14} />
                    <span>Clear SQL History</span>
                  </button>
                </div>

              </div>
            </div>

            {/* Section 4: Auth (if applicable) */}
            {authRequired && (
              <div className="card" style={{ padding: 24, borderColor: "var(--red-soft)" }}>
                <h3 style={{ margin: "0 0 4px", fontSize: "14px", fontWeight: 600, color: "var(--red)" }}>Danger Zone</h3>
                <p style={{ margin: "0 0 18px", fontSize: "12px", color: "var(--text-faint)" }}>
                  Sign out from the DB Viewer Suite session.
                </p>
                <button className="btn danger" onClick={logout}>
                  <Icon n="logout" s={14} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}

          </div>
        </div>
      )}

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
