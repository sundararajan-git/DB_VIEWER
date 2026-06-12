import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@/components/Core";
import { useTheme } from "@/context/ThemeContext";
import { useConnection } from "@/context/ConnectionContext";

import { apiFetch } from "@/lib/apiFetch";

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { theme, setTheme } = useTheme();
  const { connections, activeConnectionId, setActiveConnectionId } = useConnection();
  const location = useLocation();
  const navigate = useNavigate();

  const [zen, setZen] = useState(false);
  const [tables, setTables] = useState<string[]>([]);
  const [tableSearch, setTableSearch] = useState("");
  
  // Multi-tab states (open tables per connection)
  const [openTabs, setOpenTabs] = useState<string[]>([]);

  // Sidebar collapsible state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar_collapsed") === "true");

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };

  useEffect(() => {
    const handleZenToggle = () => setZen((z) => !z);
    window.addEventListener("explorer:zen:toggle", handleZenToggle);
    return () => window.removeEventListener("explorer:zen:toggle", handleZenToggle);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        navigate("/settings");
      }
      if (e.key.toLowerCase() === "z" && !e.metaKey && !e.ctrlKey) {
        const tag = (document.activeElement && document.activeElement.tagName) || "";
        if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
          setZen((z) => !z);
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Fetch tables whenever the active connection changes
  useEffect(() => {
    if (!activeConnectionId) {
      setTables([]);
      return;
    }
    apiFetch(`/api/tables?connectionId=${encodeURIComponent(activeConnectionId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setTables(data);
        }
      })
      .catch(() => {});
  }, [activeConnectionId]);

  // Clear open tabs when switching database connections
  useEffect(() => {
    setOpenTabs([]);
  }, [activeConnectionId]);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const isConfig = location.pathname.startsWith("/config");
  const isSettingsActive = location.pathname.startsWith("/settings");

  const activeConn = useMemo(() => {
    return connections.find((c) => c.id === activeConnectionId);
  }, [connections, activeConnectionId]);

  // Extract page and active table from URL path
  const pathParts = useMemo(() => location.pathname.split("/").filter(Boolean), [location.pathname]);
  const curPage = pathParts[0] || "";
  const curTable = (curPage === "explorer" || curPage === "schema") ? pathParts[1] || "" : "";

  // Auto-open table in a tab when routed to
  useEffect(() => {
    if (curTable && !openTabs.includes(curTable)) {
      setOpenTabs((prev) => [...prev, curTable]);
    }
  }, [curTable, openTabs]);

  const filteredTables = useMemo(() => {
    return tables.filter((t) => t.toLowerCase().includes(tableSearch.toLowerCase()));
  }, [tables, tableSearch]);

  const handleTableClick = (t: string) => {
    if (curPage === "schema") {
      navigate(`/schema/${t}`);
    } else {
      navigate(`/explorer/${t}`);
    }
  };

  const handleTabClick = (t: string) => {
    navigate(`/${curPage}/${t}`);
  };

  const handleCloseTab = (t: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent tab switching
    const nextTabs = openTabs.filter((tab) => tab !== t);
    setOpenTabs(nextTabs);

    if (curTable === t) {
      if (nextTabs.length > 0) {
        const idx = openTabs.indexOf(t);
        const fallbackTab = nextTabs[Math.max(0, idx - 1)];
        navigate(`/${curPage}/${fallbackTab}`);
      } else {
        navigate(`/${curPage}`);
      }
    }
  };

  if (isConfig) {
    return (
      <div className="appframe">
        {children}
      </div>
    );
  }

  return (
    <div className="appframe" style={{ flexDirection: "row" }}>
      {/* Sidebar navigation list */}
      {!zen && (
        <aside
            style={{
              width: sidebarCollapsed ? 64 : 250,
              flex: "none",
              borderRight: "1px solid var(--border)",
              background: "var(--surface)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              transition: "width 0.15s ease",
            }}
          >
            {/* Sidebar Header Section */}
            {sidebarCollapsed ? (
              // Collapsed: Button at top
              <div
                style={{
                  padding: "10px 10px",
                  display: "flex",
                  flexDirection:"column",
                  justifyContent: "center",
                  alignItems:"center",
                  borderBottom: "1px solid var(--border)",
                }}
              >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--accent)",
                }}
              >
                <Icon n="databaseSolid" s={26} />
              </div>
                <button
                  className="btn sm ghost"
                  onClick={toggleSidebar}
                  title="Expand Sidebar"
                  style={{
                    justifyContent: "center",
                    width: "32px",
                    height: "32px",
                    padding: 0,
                    color: "var(--accent)",
                    background: "transparent",
                    borderColor: "transparent",
                    borderRadius: "6px",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Icon n="chevR" s={16} />
                </button>
              </div>
            ) : (
              // Expanded: Full header section
              <div
                style={{
                  padding: "12px 10px",
                  display: "flex",
                  flexDirection: "row",
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {/* Database Icon & Info - Horizontal Row Layout */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                  {/* Solid Database Icon */}
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      background: "transparent",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--accent)",
                      flex: "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Icon n="databaseSolid" s={30} />
                  </div>
                  
                  {/* DB Info */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start", flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "12px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        width: "100%",
                      }}
                    >
                      {activeConn ? activeConn.database : "No DB"}
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: "9px",
                        color: "var(--text-faint)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        width: "100%",
                      }}
                    >
                      {activeConn ? `@${activeConn.server}` : "Not connected"}
                    </div>
                  </div>
                </div>

                {/* Collapse Button */}
                <button
                  className="btn sm ghost"
                  onClick={toggleSidebar}
                  title="Collapse Sidebar"
                  style={{
                    justifyContent: "center",
                    width: "32px",
                    height: "32px",
                    padding: 0,
                    color: "var(--accent)",
                    background: "transparent",
                    borderColor: "transparent",
                    borderRadius: "6px",
                    flex: "none",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Icon n="chevL" s={16} />
                </button>
              </div>
            )}

            {connections.length > 1 && !sidebarCollapsed && (
              <div style={{ padding: "10px", borderBottom: "1px solid var(--border)" }}>
                <select
                  className="field"
                  style={{ padding: "4px 24px 4px 8px", fontSize: "11.5px", height: "28px" }}
                  value={activeConnectionId || ""}
                  onChange={(e) => {
                    setActiveConnectionId(e.target.value || null);
                  }}
                >
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.database} ({c.type === "postgres" ? "PG" : "MS"})
                    </option>
                  ))}
                </select>
              </div>
            )}

          {/* Sidebar views links */}
          <div style={{ padding: sidebarCollapsed ? "10px 4px" : "10px 10px 6px", display: "flex", flexDirection: "column", gap: 4 }}>
            <SidebarTab
              cur={location.pathname}
              page="/explorer"
              icon="table"
              label="Explorer"
              navigate={navigate}
              targetTable={curTable}
              collapsed={sidebarCollapsed}
            />
            <SidebarTab
              cur={location.pathname}
              page="/sql-lab"
              icon="code"
              label="SQL Lab"
              navigate={navigate}
              collapsed={sidebarCollapsed}
            />
            <SidebarTab
              cur={location.pathname}
              page="/schema"
              icon="columns"
              label="Schema Inspector"
              navigate={navigate}
              targetTable={curTable}
              collapsed={sidebarCollapsed}
            />
            <SidebarTab
              cur={location.pathname}
              page="/changes"
              icon="history"
              label="Change DevTools"
              navigate={navigate}
              collapsed={sidebarCollapsed}
            />
          </div>

          {!sidebarCollapsed && <div className="divider" />}

          {/* Tables header and filter input */}
          {!sidebarCollapsed && (
            <>
              <div style={{ padding: "12px 14px 6px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span className="label">Tables</span>
                  <span className="badge dim">{filteredTables.length}</span>
                </div>
                <div style={{ position: "relative" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-faint)",
                    }}
                  >
                    <Icon n="search" s={12} />
                  </span>
                  <input
                    className="field"
                    style={{ padding: "4px 8px 4px 26px", fontSize: "11.5px", height: "28px" }}
                    placeholder="Filter tables..."
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Scrollable tables selector list */}
              <div className="scroll" style={{ flex: 1, padding: "0 10px 12px" }}>
                {filteredTables.length === 0 ? (
                  <div style={{ padding: "16px 8px", color: "var(--text-faint)", fontSize: "11.5px", textAlign: "center" }}>
                    No tables found
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {filteredTables.map((t) => {
                      const isSelected = curTable === t;
                      return (
                        <div
                          key={t}
                          onClick={() => handleTableClick(t)}
                          style={{
                            padding: "6px 8px",
                            borderRadius: 5,
                            cursor: "pointer",
                            fontSize: "12px",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            background: isSelected ? "var(--accent-soft)" : "transparent",
                            color: isSelected ? "var(--accent)" : "var(--text-dim)",
                            fontWeight: isSelected ? 600 : 400,
                            border: "1px solid " + (isSelected ? "var(--accent-line)" : "transparent"),
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = "var(--hover)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <Icon n="table" s={13} style={{ color: isSelected ? "var(--accent)" : "var(--text-faint)" }} />
                          <span
                            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}
                            className="mono"
                          >
                            {t}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
          {sidebarCollapsed && <div style={{ flex: 1 }} />}

          {/* DB Icon at Bottom (when collapsed) */}
          {sidebarCollapsed && (
            <div
              style={{
                padding: "12px 0",
                display: "flex",
                justifyContent: "center",
                borderTop: "1px solid var(--border)",
              }}
            >
            </div>
          )}

          {/* Sidebar Footer tools */}
          {!sidebarCollapsed && <div className="divider" style={{ margin: "4px 0" }} />}
          <div
            style={{
              padding: sidebarCollapsed ? "12px 4px" : "12px 10px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              background: "transparent",
            }}
          >
            {sidebarCollapsed ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", width: "100%" }}>
                {/* Settings Tab */}
                <div style={{ display: "flex", justifyContent: "center", width: "100%", position: "relative" }}>
                  <button
                    className={"btn sm" + (isSettingsActive ? "" : " ghost")}
                    title="Settings"
                    onClick={() => navigate("/settings?tab=preferences")}
                    style={{
                      justifyContent: "center",
                      width: "40px",
                      height: "40px",
                      padding: 0,
                      background: isSettingsActive ? "var(--accent-soft)" : "transparent",
                      color: isSettingsActive ? "var(--accent)" : "var(--text-dim)",
                      borderColor: isSettingsActive ? "var(--accent-line)" : "transparent",
                      borderRadius: "8px",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSettingsActive) {
                        e.currentTarget.style.background = "var(--hover)";
                      } else {
                        e.currentTarget.style.background = "rgba(34, 211, 238, 0.18)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSettingsActive) {
                        e.currentTarget.style.background = "transparent";
                      } else {
                        e.currentTarget.style.background = "var(--accent-soft)";
                      }
                    }}
                  >
                    <Icon n="settings" s={16} />
                  </button>
                </div>

                {/* Theme Toggle Button */}
                <div style={{ display: "flex", justifyContent: "center", width: "100%", position: "relative" }}>
                  <button
                    className="btn sm ghost"
                    onClick={toggleTheme}
                    title="Toggle theme"
                    style={{
                      justifyContent: "center",
                      width: "40px",
                      height: "40px",
                      padding: 0,
                      color: "var(--text-dim)",
                      borderRadius: "8px",
                      borderColor: "transparent",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Icon n={theme === "dark" ? "sun" : "moon"} s={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                {/* Settings Tab */}
                <div style={{ display: "flex", justifyContent: "flex-start", width: "100%", position: "relative" }}>
                  <button
                    className={"btn sm" + (isSettingsActive ? "" : " ghost")}
                    onClick={() => navigate("/settings?tab=preferences")}
                    style={{
                      justifyContent: "flex-start",
                      width: "100%",
                      padding: "7px 10px",
                      background: isSettingsActive ? "var(--accent-soft)" : "transparent",
                      color: isSettingsActive ? "var(--accent)" : "var(--text-dim)",
                      borderColor: isSettingsActive ? "var(--accent-line)" : "transparent",
                      borderRadius: "6px",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSettingsActive) {
                        e.currentTarget.style.background = "var(--hover)";
                      } else {
                        e.currentTarget.style.background = "rgba(34, 211, 238, 0.18)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSettingsActive) {
                        e.currentTarget.style.background = "transparent";
                      } else {
                        e.currentTarget.style.background = "var(--accent-soft)";
                      }
                    }}
                  >
                    <Icon n="settings" s={14} />
                    <span>Settings</span>
                    <span className="kbd" style={{ marginLeft: "auto", fontSize: "9px" }}>
                      ⌘K
                    </span>
                  </button>
                </div>

                {/* Theme Toggle */}
                <button
                  className="btn sm ghost"
                  onClick={toggleTheme}
                  title="Toggle theme"
                  style={{
                    justifyContent: "center",
                    width: "100%",
                    height: "32px",
                    borderRadius: "6px",
                    color: "var(--text-dim)",
                    borderColor: "transparent",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Icon n={theme === "dark" ? "sun" : "moon"} s={14} />
                  <span style={{ fontSize: "11px", marginLeft: 4 }}>Theme</span>
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Main viewport */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
        {/* Tab Bar (only for explorer and schema pages) */}
        {!zen && (curPage === "explorer" || curPage === "schema") && openTabs.length > 0 && (
          <div
            className="hide-scrollbar"
            style={{
              height: 35,
              background: "var(--surface-2)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "stretch",
              overflowX: "auto",
              flex: "none",
            }}
          >
            {openTabs.map((tab) => {
              const isActive = curTable === tab;
              return (
                <div
                  key={tab}
                  onClick={() => handleTabClick(tab)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 14px",
                    cursor: "pointer",
                    fontSize: "12px",
                    background: isActive ? "var(--surface)" : "transparent",
                    color: isActive ? "var(--accent)" : "var(--text-dim)",
                    borderRight: "1px solid var(--border-soft)",
                    borderTop: "2px solid " + (isActive ? "var(--accent)" : "transparent"),
                    fontWeight: isActive ? 600 : 400,
                    transition: "background .12s, color .12s",
                    userSelect: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "var(--hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Icon n="table" s={13} style={{ color: isActive ? "var(--accent)" : "var(--text-faint)" }} />
                  <span className="mono">{tab}</span>
                  <button
                    onClick={(e) => handleCloseTab(tab, e)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-faint)",
                      cursor: "pointer",
                      padding: 2,
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--border-soft)";
                      e.currentTarget.style.color = "var(--text)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "none";
                      e.currentTarget.style.color = "var(--text-faint)";
                    }}
                  >
                    <Icon n="x" s={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {children}
      </div>


    </div>
  );
};

interface SidebarTabProps {
  cur: string;
  page: string;
  icon: string;
  label: string;
  navigate: (path: string) => void;
  targetTable?: string;
  collapsed?: boolean;
}

const SidebarTab: React.FC<SidebarTabProps> = ({ cur, page, icon, label, navigate, targetTable, collapsed }) => {
  const on = cur.startsWith(page);
  const path = targetTable ? `${page}/${targetTable}` : page;
  return (
    <div style={{ display: "flex", justifyContent: "center", width: "100%", position: "relative" }}>
      <button
        className={"btn sm" + (on ? "" : " ghost")}
        onClick={() => navigate(path)}
        title={collapsed ? label : undefined}
        style={{
          justifyContent: collapsed ? "center" : "flex-start",
          width: collapsed ? "40px" : "100%",
          height: collapsed ? "40px" : "auto",
          padding: collapsed ? "0" : "7px 10px",
          background: on ? "var(--accent-soft)" : "transparent",
          color: on ? "var(--accent)" : "var(--text-dim)",
          borderColor: on ? "var(--accent-line)" : "transparent",
          borderRadius: collapsed ? "8px" : "6px",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          if (!on) {
            e.currentTarget.style.background = "var(--hover)";
          } else {
            e.currentTarget.style.background = "rgba(34, 211, 238, 0.18)";
          }
        }}
        onMouseLeave={(e) => {
          if (!on) {
            e.currentTarget.style.background = "transparent";
          } else {
            e.currentTarget.style.background = "var(--accent-soft)";
          }
        }}
      >
        <Icon n={icon} s={collapsed ? 16 : 14} />
        {!collapsed && <span>{label}</span>}
      </button>
    </div>
  );
};
