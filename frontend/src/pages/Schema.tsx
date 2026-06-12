import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Icon, Engine, TypeBadge } from "@/components/Core";
import { apiFetch } from "@/lib/apiFetch";
import { useConnection } from "@/context/ConnectionContext";

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
  foreignKey: { table: string; column: string } | null;
}

interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

interface SchemaInfo {
  columns: ColumnInfo[];
  indexes: IndexInfo[];
}

export default function Schema() {
  const { tableName } = useParams();
  const navigate = useNavigate();
  const { activeConnectionId, connections } = useConnection();
  
  const [tables, setTables] = useState<string[]>([]);
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeConnection = useMemo(() => {
    return connections.find((c) => c.id === activeConnectionId) || connections[0];
  }, [connections, activeConnectionId]);

  useEffect(() => {
    if (!activeConnectionId) return;
    apiFetch(`/api/tables?connectionId=${encodeURIComponent(activeConnectionId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setTables(data);
        if (data.length > 0 && !tableName) {
          navigate(`/schema/${data[0]}`, { replace: true });
        }
      })
      .catch((err) => setError(err.message));
  }, [activeConnectionId, tableName, navigate]);

  useEffect(() => {
    if (!tableName || !activeConnectionId) return;
    setIsLoading(true);
    setSchema(null);
    setError(null);
    apiFetch(`/api/schema/${tableName}?connectionId=${encodeURIComponent(activeConnectionId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        if (Array.isArray(data.indexes)) {
          data.indexes = data.indexes.map((idx: IndexInfo) => ({
            ...idx,
            columns: Array.isArray(idx.columns)
              ? idx.columns
              : typeof idx.columns === "string"
              ? (idx.columns as string)
                  .replace(/^\{|\}$/g, "")
                  .split(",")
                  .filter(Boolean)
              : [],
          }));
        }
        setSchema(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [tableName, activeConnectionId]);

  const setTable = (t: string) => {
    navigate(`/schema/${t}`);
  };

  if (!activeConnectionId) {
    return (
      <div className="center">
        <Icon n="database" s={42} className="ic" />
        <h3>No database connected</h3>
        <p>Please connect to a database in the connection manager.</p>
      </div>
    );
  }

  const curTable = tableName || (tables.length > 0 ? tables[0] : "");

  return (
    <div style={{ flex: 1, overflow: "auto" }} className="scroll">
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "22px 28px 40px", width: "100%" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 22 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "var(--accent-soft)",
              border: "1px solid var(--accent-line)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent)",
              flex: "none",
            }}
          >
            <Icon n="columns" s={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="label">Schema Inspector</div>
            <h1
              style={{
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-.02em",
                display: "flex",
                alignItems: "center",
                gap: 9,
              }}
            >
              <span className="mono">{curTable}</span>
              {activeConnection && <Engine type={activeConnection.type} />}
            </h1>
          </div>
          {tables.length > 0 && (
            <select
              className="field"
              style={{ width: "auto", minWidth: 170 }}
              value={curTable}
              onChange={(e) => setTable(e.target.value)}
            >
              {tables.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && <p className="text-destructive text-sm font-mono" style={{ marginBottom: 16 }}>{error}</p>}

        {isLoading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
            <Icon n="refresh" s={24} className="spin" style={{ color: "var(--text-faint)" }} />
          </div>
        )}

        {schema && !isLoading && (
          <>
            {/* stat strip */}
            <div
              style={{
                display: "flex",
                gap: 0,
                marginBottom: 24,
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                background: "var(--surface)",
              }}
            >
              {[
                ["Columns", schema.columns.length],
                ["Primary keys", schema.columns.filter((c) => c.isPrimaryKey).length],
                ["Foreign keys", schema.columns.filter((c) => c.foreignKey).length],
                ["Nullable", schema.columns.filter((c) => c.nullable).length],
                ["Indexes", schema.indexes.length],
              ].map(([l, v], i) => (
                <div
                  key={String(l)}
                  style={{
                    flex: 1,
                    padding: "13px 16px",
                    borderRight: i < 4 ? "1px solid var(--border-soft)" : "none",
                  }}
                >
                  <div className="mono" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.02em" }}>
                    {v}
                  </div>
                  <div className="label" style={{ marginTop: 2 }}>
                    {String(l)}
                  </div>
                </div>
              ))}
            </div>

            {/* columns table */}
            <div className="label" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}>
              <Icon n="table" s={13} />
              Columns
            </div>
            <div className="card" style={{ overflow: "hidden", marginBottom: 28 }}>
              <table className="grid" style={{ width: "100%", minWidth: 0 }}>
                <thead>
                  <tr>
                    {["Column", "Type", "Nullable", "Default", "References"].map((h, i) => (
                      <th key={h} style={{ width: i === 0 ? "26%" : i === 1 ? "18%" : i === 4 ? "22%" : "auto" }}>
                        <div className="th-inner" style={{ cursor: "default", minWidth: 0 }}>
                          <div className="th-row1">
                            <span className="th-name">{h}</span>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schema.columns.map((c) => (
                    <tr key={c.name} style={{ cursor: "default" }}>
                      <td>
                        <span className="cell" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {c.isPrimaryKey ? (
                            <Icon n="key" s={13} style={{ color: "var(--amber)" }} />
                          ) : c.foreignKey ? (
                            <Icon n="link" s={13} style={{ color: "var(--t-uuid)" }} />
                          ) : (
                            <span style={{ width: 13 }} />
                          )}
                          <span style={{ color: "var(--text)", fontWeight: c.isPrimaryKey ? 600 : 400 }}>{c.name}</span>
                          {c.isPrimaryKey && <span className="badge pk">PK</span>}
                        </span>
                      </td>
                      <td>
                        <span className="cell">
                          <TypeBadge t={c.type} />
                        </span>
                      </td>
                      <td>
                        <span className="cell">
                          {c.nullable ? (
                            <span style={{ color: "var(--text-dim)" }}>YES</span>
                          ) : (
                            <span style={{ color: "var(--red)" }}>NOT NULL</span>
                          )}
                        </span>
                      </td>
                      <td>
                        <span className="cell" style={{ color: c.default ? "var(--text-dim)" : "var(--text-faint)" }}>
                          {c.default || "—"}
                        </span>
                      </td>
                      <td>
                        <span className="cell">
                          {c.foreignKey ? (
                            <span style={{ color: "var(--t-uuid)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <Icon n="arrowRight" s={12} />
                              {c.foreignKey.table}.{c.foreignKey.column}
                            </span>
                          ) : (
                            <span className="null">—</span>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* indexes */}
            <div className="label" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}>
              <Icon n="layers" s={13} />
              Indexes
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {schema.indexes.length === 0 && (
                <div className="card" style={{ padding: 14, textAlign: "center", color: "var(--text-faint)" }}>
                  No indexes found
                </div>
              )}
              {schema.indexes.map((ix) => (
                <div key={ix.name} className="card" style={{ padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <Icon n="hash" s={14} style={{ color: "var(--text-faint)" }} />
                    <span
                      className="mono"
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ix.name}
                    </span>
                    {ix.isPrimary && <span className="badge pk">PRIMARY</span>}
                    {ix.isUnique && !ix.isPrimary && <span className="badge accent">UNIQUE</span>}
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {ix.columns.map((col) => (
                      <span key={col} className="badge dim mono" style={{ fontSize: "10.5px" }}>
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
