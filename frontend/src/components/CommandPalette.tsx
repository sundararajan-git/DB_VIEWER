import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Icon } from "./Core";
import { useConnection } from "@/context/ConnectionContext";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/apiFetch";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  showFilters: boolean;
  setShowFilters: React.Dispatch<React.SetStateAction<boolean>>;
}

interface CommandItem {
  sec?: string;
  ic?: string;
  lbl?: string;
  meta?: string;
  danger?: boolean;
  run?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  showFilters,
  setShowFilters,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { connections, activeConnectionId, setActiveConnectionId } = useConnection();
  const { theme, setTheme } = useTheme();
  const { authRequired, logout } = useAuth();
  const [sel, setSel] = useState(0);
  const [tables, setTables] = useState<string[]>([]);

  const activeConnection = useMemo(() => {
    return connections.find((c) => c.id === activeConnectionId) || connections[0];
  }, [connections, activeConnectionId]);

  const isExplorer = location.pathname.startsWith("/explorer");
  const selectedTable = location.pathname.split("/")[2] || "";

  useEffect(() => {
    if (!activeConnectionId) {
      setTables([]);
      return;
    }
    apiFetch(`/api/tables?connectionId=${encodeURIComponent(activeConnectionId)}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(setTables)
      .catch(() => setTables([]));
  }, [activeConnectionId]);

  useEffect(() => {
    if (open) {
      setSel(0);
    }
  }, [open]);

  const dispatch = (event: string) => {
    window.dispatchEvent(new CustomEvent(event));
  };

  const items = useMemo(() => {
    const list: CommandItem[] = [];
    
    list.push({ sec: "Navigate" });
    list.push({ ic: "table", lbl: "Explorer", meta: "data browser", run: () => navigate("/explorer") });
    list.push({ ic: "code", lbl: "SQL Lab", meta: "run queries", run: () => navigate("/sql-lab") });
    list.push({ ic: "columns", lbl: "Schema Inspector", meta: "structure", run: () => navigate("/schema") });
    list.push({ ic: "settings", lbl: "Manage Connections", meta: "config", run: () => navigate("/config") });

    // Switch Connection
    list.push({ sec: "Switch Connection" });
    connections.forEach((c) => {
      const isActive = c.id === activeConnectionId;
      list.push({
        ic: isActive ? "check" : "database",
        lbl: `${c.database} (${c.type === "postgres" ? "PG" : "MS"})`,
        meta: isActive ? "active" : `@${c.server}`,
        run: () => {
          setActiveConnectionId(c.id);
        },
      });
    });

    if (activeConnection) {
      list.push({ sec: "Tables · " + activeConnection.database });
      tables.forEach((t) => {
        const isCurrentPageSchema = location.pathname.startsWith("/schema");
        list.push({
          ic: "hash",
          lbl: t,
          meta: t === selectedTable ? "current" : "table",
          run: () => navigate((isCurrentPageSchema ? "/schema/" : "/explorer/") + t),
        });
      });
    }

    if (isExplorer && selectedTable) {
      list.push({ sec: "Actions" });
      list.push({ ic: "plus", lbl: "New Row", meta: "⌘N", run: () => dispatch("explorer:add") });
      list.push({ ic: "filter", lbl: (showFilters ? "Hide" : "Show") + " filter row", run: () => setShowFilters((v) => !v) });
      list.push({ ic: "maximize", lbl: "Enter Zen Mode", meta: "Z", run: () => dispatch("explorer:zen:toggle") });
      list.push({ ic: "download", lbl: "Export CSV", run: () => dispatch("explorer:export:csv") });
      list.push({ ic: "download", lbl: "Export JSON", run: () => dispatch("explorer:export:json") });
      list.push({
        ic: "trash",
        lbl: "Truncate table…",
        danger: true,
        run: () => dispatch("explorer:truncate"),
      });
    }

    list.push({ sec: "Settings" });
    list.push({
      ic: theme === "dark" ? "sun" : "moon",
      lbl: "Switch to " + (theme === "dark" ? "light" : "dark") + " theme",
      run: () => setTheme(theme === "dark" ? "light" : "dark"),
    });
    list.push({ ic: "refresh", lbl: "Refresh data", run: () => window.location.reload() });

    if (authRequired) {
      list.push({ ic: "logout", lbl: "Sign out", danger: true, run: logout });
    }

    return list;
  }, [connections, activeConnectionId, activeConnection, tables, location.pathname, selectedTable, isExplorer, showFilters, theme, authRequired, navigate, logout, setActiveConnectionId, setShowFilters]);

  const selectable = useMemo(() => items.filter((i) => !i.sec), [items]);

  const exec = (it: CommandItem) => {
    it.run && it.run();
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, selectable.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(s - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const it = selectable[sel];
        if (it) exec(it);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, selectable, sel]);

  if (!open) return null;

  let si = -1;

  return (
    <div className="cmdwrap" onClick={onClose}>
      <div className="cmd" onClick={(e) => e.stopPropagation()}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
        }}>
          <div style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "var(--accent-soft)",
            border: "1px solid var(--accent-line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent)",
          }}>
            <Icon n="settings" s={15} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>Command & Settings</h3>
            <p style={{ margin: 0, fontSize: "11px", color: "var(--text-faint)" }}>
              {activeConnection ? `Connected to ${activeConnection.database}` : "No active connection"}
            </p>
          </div>
          <span className="kbd" style={{ fontSize: "10px", padding: "3px 6px" }}>esc</span>
        </div>
        <div className="cmd-list">
          {items.map((it, i) => {
            if (it.sec) return <div key={"s" + i} className="cmd-sec">{it.sec}</div>;
            si++;
            const cur = si;
            const isSel = cur === sel;
            return (
              <div
                key={i}
                className={"cmd-item" + (isSel ? " sel" : "")}
                onMouseEnter={() => setSel(cur)}
                onClick={() => exec(it)}
              >
                <span className="ci" style={it.danger ? { color: "var(--red)" } : undefined}>
                  <Icon n={it.ic || "hash"} s={16} />
                </span>
                <span className="lbl" style={it.danger ? { color: "var(--red)" } : undefined}>
                  {it.lbl}
                </span>
                {it.meta && <span className="meta mono">{it.meta}</span>}
                {isSel && <Icon n="arrowRight" s={14} style={{ color: "var(--accent)" }} />}
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            padding: "8px 16px",
            borderTop: "1px solid var(--border)",
            fontSize: "10.5px",
            color: "var(--text-faint)",
          }}
        >
          <span style={{ display: "flex", gap: "5px", alignItems: "center" }}>
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> navigate
          </span>
          <span style={{ display: "flex", gap: "5px", alignItems: "center" }}>
            <span className="kbd">↵</span> select
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ display: "flex", gap: "5px", alignItems: "center" }} className="mono">
            DB Viewer Suite
          </span>
        </div>
      </div>
    </div>
  );
};
