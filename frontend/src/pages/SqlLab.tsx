import React, { useState, useEffect, useRef, useMemo } from "react";
import { Icon, fmtCell } from "@/components/Core";
import { useSocket } from "@/context/SocketContext";
import { useConnection } from "@/context/ConnectionContext";

const HISTORY_KEY = "sqllab_history";
const MAX_HISTORY = 50;

interface HistoryEntry {
  sql: string;
  ms: number;
  rows: number;
  at: number;
}

const SNIPPETS = [
  { l: "SELECT *", t: "SELECT *\nFROM " },
  { l: "WHERE", t: "\nWHERE " },
  { l: "JOIN", t: "\nJOIN  ON " },
  { l: "GROUP BY", t: "\nGROUP BY " },
  { l: "ORDER BY", t: "\nORDER BY " },
  { l: "LIMIT", t: "\nLIMIT 100" },
];

export default function SqlLab() {
  const { socket } = useSocket();
  const { connections, activeConnectionId, setActiveConnectionId } = useConnection();

  const [sql, setSql] = useState("SELECT id, email, role, login_count, created_at\nFROM users\nWHERE is_active = true\nORDER BY login_count DESC\nLIMIT 50;");
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<{ cols: string[]; rows: any[]; ms: number } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch {
      return [];
    }
  });

  const startTimeRef = useRef<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeConnection = useMemo(() => {
    return connections.find((c) => c.id === activeConnectionId) || connections[0];
  }, [connections, activeConnectionId]);

  useEffect(() => {
    if (!socket) return;

    const handleQueryResult = (data: any) => {
      const duration = Date.now() - startTimeRef.current;
      const columns = data.columns || [];
      const rows = data.rows || [];
      
      setResult({
        cols: columns,
        rows,
        ms: duration,
      });
      setState("done");

      const entry: HistoryEntry = {
        sql: sql.trim(),
        ms: duration,
        rows: rows.length,
        at: Date.now(),
      };
      
      setHistory((prev) => {
        const updated = [entry, ...prev].slice(0, MAX_HISTORY);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        return updated;
      });
    };

    const handleError = (msg: string) => {
      setState("error");
      setResult({
        cols: [],
        rows: [],
        ms: 0,
      });
      // Store error message inside result as a workaround or set custom error state
      setErrorMsg(msg);
    };

    socket.on("query_result", handleQueryResult);
    socket.on("error", handleError);

    return () => {
      socket.off("query_result", handleQueryResult);
      socket.off("error", handleError);
    };
  }, [socket, sql]);

  const [errorMsg, setErrorMsg] = useState("");

  const run = () => {
    if (!sql.trim() || !socket) return;
    setState("running");
    setResult(null);
    setErrorMsg("");
    startTimeRef.current = Date.now();
    socket.emit("run_query", { query: sql, connectionId: activeConnectionId });
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      run();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const s = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const v = sql.slice(0, s) + "  " + sql.slice(end);
      setSql(v);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = s + 2;
        }
      });
    }
  };

  const insert = (t: string) => {
    const el = textareaRef.current;
    if (!el) {
      setSql((prev) => prev + t);
      return;
    }
    const s = el.selectionStart;
    const end = el.selectionEnd;
    setSql(sql.slice(0, s) + t + sql.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = s + t.length;
    });
  };

  const exportCsv = () => {
    if (!result || result.rows.length === 0) return;
    const header = result.cols.join(",");
    const csvRows = result.rows.map((row) =>
      result.cols
        .map((c) => {
          const v = row[c];
          if (v === null || v === undefined) return "NULL";
          return `"${String(v).replace(/"/g, '""')}"`;
        })
        .join(",")
    );
    const blob = new Blob([[header, ...csvRows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sql_result_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  const lines = sql.split("\n").length;

  return (
    <div
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "minmax(360px, 2fr) 3fr",
        gap: 14,
        padding: 14,
        overflow: "hidden",
        position: "relative",
        minHeight: 0,
      }}
    >
      {/* editor */}
      <div className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "11px 13px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Icon n="code" s={15} style={{ color: "var(--accent)" }} />
          <span style={{ fontWeight: 700, fontSize: "12.5px" }}>SQL Editor</span>
          {connections.length > 1 && (
            <select
              className="field"
              style={{ width: "auto", padding: "4px 26px 4px 9px", fontSize: "11.5px" }}
              value={activeConnectionId || ""}
              onChange={(e) => setActiveConnectionId(e.target.value)}
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.database}
                </option>
              ))}
            </select>
          )}
          <div style={{ flex: 1 }} />
          <span className="kbd">⌘</span>
          <span className="kbd">↵</span>
          <button
            className={"btn icon sm" + (showHistory ? "" : " ghost")}
            title="Query history"
            onClick={() => setShowHistory((s) => !s)}
            style={
              showHistory
                ? {
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    borderColor: "var(--accent-line)",
                  }
                : undefined
            }
          >
            <Icon n="history" s={14} />
          </button>
        </div>

        {/* snippets */}
        <div
          style={{
            display: "flex",
            gap: 5,
            padding: "8px 13px",
            borderBottom: "1px solid var(--border-soft)",
            flexWrap: "wrap",
          }}
        >
          {SNIPPETS.map((s) => (
            <button
              key={s.l}
              className="btn sm"
              style={{ padding: "3px 8px", fontSize: "10.5px" }}
              onClick={() => insert(s.t)}
            >
              {s.l}
            </button>
          ))}
        </div>

        {showHistory ? (
          <div className="scroll" style={{ flex: 1, padding: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px 8px" }}>
              <span className="label">Recent queries</span>
              {history.length > 0 && (
                <button
                  className="btn sm ghost text-destructive"
                  style={{ color: "var(--red)", fontSize: "10px", padding: "2px 6px" }}
                  onClick={clearHistory}
                >
                  Clear All
                </button>
              )}
            </div>
            {history.map((h, i) => (
              <div
                key={i}
                onClick={() => {
                  setSql(h.sql);
                  setShowHistory(false);
                }}
                style={{
                  padding: "9px 10px",
                  borderRadius: 7,
                  cursor: "pointer",
                  marginBottom: 5,
                  border: "1px solid var(--border-soft)",
                  background: "var(--surface-2)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent-line)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-soft)")}
              >
                <div
                  className="mono"
                  style={{
                    fontSize: "11.5px",
                    color: "var(--text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginBottom: 5,
                  }}
                >
                  {h.sql}
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: "10.5px", color: "var(--text-faint)" }} className="mono">
                  <span>
                    <Icon n="clock" s={10} style={{ verticalAlign: -1 }} /> {h.ms}ms
                  </span>
                  <span>{h.rows} rows</span>
                  <span style={{ marginLeft: "auto" }}>{ago2(h.at)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ flex: 1, position: "relative", display: "flex", overflow: "hidden" }}>
            <div
              className="mono"
              aria-hidden
              style={{
                padding: "14px 0 14px 14px",
                textAlign: "right",
                color: "var(--text-faint)",
                fontSize: "12.5px",
                lineHeight: 1.65,
                userSelect: "none",
                minWidth: 34,
              }}
            >
              {Array.from({ length: Math.max(lines, 12) }).map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="mono"
              spellCheck={false}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={onKey}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text)",
                fontSize: "12.5px",
                lineHeight: 1.65,
                padding: "14px",
                resize: "none",
                letterSpacing: 0,
              }}
            />
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "7px 13px",
            borderTop: "1px solid var(--border)",
            fontSize: "10.5px",
            color: "var(--text-faint)",
          }}
          className="mono"
        >
          <span>{lines} lines</span>
          <span>·</span>
          <span>SQL</span>
          <div style={{ flex: 1 }} />
          <button className="btn sm ghost" style={{ padding: "3px 7px", fontSize: "10.5px" }} onClick={() => setSql("")}>
            <Icon n="x" s={12} />
            Clear
          </button>
        </div>
        <div style={{ padding: 10, borderTop: "1px solid var(--border-soft)" }}>
          <button
            className={"btn" + (sql.trim() ? " primary" : "")}
            style={{ width: "100%", justifyContent: "center", padding: "10px" }}
            onClick={run}
            disabled={state === "running"}
          >
            {state === "running" ? (
              <>
                <Icon n="refresh" s={15} className="spin" />
                Executing…
              </>
            ) : (
              <>
                <Icon n="play" s={14} />
                Execute query <span className="kbd" style={{ marginLeft: 2 }}>⌘↵</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* results */}
      <div className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "11px 13px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Icon n="terminal" s={15} style={{ color: "var(--accent)" }} />
          <span style={{ fontWeight: 700, fontSize: "12.5px" }}>Results</span>
          {state === "done" && result && (
            <>
              <span className="badge dim">{result.rows.length} rows</span>
              <span className="badge dim">{result.cols.length} cols</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--green)" }}>
                {result.ms}ms
              </span>
            </>
          )}
          <div style={{ flex: 1 }} />
          {state === "done" && result && (
            <>
              <button className="btn sm" onClick={exportCsv}>
                <Icon n="download" s={13} />
                Export CSV
              </button>
              <button
                className="btn icon sm ghost"
                onClick={() => {
                  setState("idle");
                  setResult(null);
                }}
              >
                <Icon n="x" s={14} />
              </button>
            </>
          )}
        </div>

        <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
          {state === "idle" && (
            <div className="center">
              <Icon n="terminal" s={42} className="ic" />
              <h3>Ready for execution</h3>
              <p>
                Write a query and press <span className="kbd">⌘</span> <span className="kbd">↵</span> to run it against{" "}
                <b className="mono" style={{ color: "var(--text)" }}>
                  {activeConnection?.database || "database"}
                </b>
                .
              </p>
            </div>
          )}
          {state === "running" && (
            <div className="center">
              <div style={{ position: "relative", width: 46, height: 46 }}>
                <svg className="spin" width="46" height="46" viewBox="0 0 46 46" style={{ color: "var(--accent)" }}>
                  <circle cx="23" cy="23" r="19" fill="none" stroke="var(--border)" strokeWidth="3" />
                  <circle
                    cx="23"
                    cy="23"
                    r="19"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray="40 200"
                    strokeLinecap="round"
                  />
                </svg>
                <Icon n="database" s={18} style={{ position: "absolute", inset: 0, margin: "auto", color: "var(--accent)" }} />
              </div>
              <h3>Executing query</h3>
              <p className="mono" style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>
                on {activeConnection?.database}
              </p>
            </div>
          )}
          {state === "error" && (
            <div style={{ padding: 16 }}>
              <div className="alert err" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13 }}>
                  <Icon n="alert" s={16} />
                  Query Error
                </div>
                <pre className="mono" style={{ fontSize: "11.5px", whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0 }}>
                  {errorMsg}
                </pre>
              </div>
            </div>
          )}
          {state === "done" && result && <ResultTable result={result} />}
        </div>

        {state === "done" && result && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 13px",
              borderTop: "1px solid var(--border)",
              fontSize: 11,
              color: "var(--text-dim)",
            }}
          >
            <Icon n="check" s={13} style={{ color: "var(--green)" }} />
            <span>Query completed</span>
            <div style={{ flex: 1 }} />
            <span className="mono" style={{ color: "var(--text-faint)" }}>
              {new Date().toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface ResultTableProps {
  result: { cols: string[]; rows: any[] };
}

const ResultTable: React.FC<ResultTableProps> = ({ result }) => {
  return (
    <table className="grid">
      <thead>
        <tr>
          <th className="rownum">S.NO</th>
          {result.cols.map((c) => (
            <th key={c}>
              <div className="th-inner" style={{ cursor: "default", minWidth: 100 }}>
                <div className="th-row1">
                  <span className="th-name">{c}</span>
                </div>
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((r, i) => (
          <tr key={i} style={{ cursor: "default" }}>
            <td className="rownum">{i + 1}</td>
            {result.cols.map((c) => {
              const f = fmtCell(r[c]);
              return (
                <td key={c}>
                  <span className="cell">
                    {f.kind === "null" ? (
                      <span className="null">NULL</span>
                    ) : f.kind === "json" ? (
                      <span className="jsonchip">{f.label}</span>
                    ) : f.kind === "bool" ? (
                      <span className="boolcell">
                        <span className="bd" style={{ background: r[c] ? "var(--green)" : "var(--text-faint)" }} />
                        {String(r[c])}
                      </span>
                    ) : (
                      f.label
                    )}
                  </span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

function ago2(t: number): string {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  return Math.floor(m / 60) + "h ago";
}
