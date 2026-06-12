import React, { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Icon, TypeBadge, typeCat, fmtCell, syntaxJson } from "@/components/Core";
import { useSocket } from "@/context/SocketContext";
import { useToast } from "@/context/ToastContext";
import { useConnection } from "@/context/ConnectionContext";
import { apiFetch } from "@/lib/apiFetch";
import { useChange } from "@/context/ChangeContext";
import type { ChangeEvent, TableChange, RowChange } from "@/context/ChangeContext";

interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
  foreignKey: { table: string; column: string } | null;
}

export default function Explorer() {
  const { socket } = useSocket();
  const { toast } = useToast();
  const { activeConnectionId } = useConnection();
  const { tableName } = useParams();
  const navigate = useNavigate();

  const {
    recordTableSnapshot,
    isTimelineOpen,
    setIsTimelineOpen,
    changeEvents,
    autoCapture,
    setAutoCapture,
    addMockTransaction,
    selectedRowNode,
    setSelectedRowNode,
    clearEvents
  } = useChange();

  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [schema, setSchema] = useState<{ columns: ColumnSchema[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [primaryKey, setPrimaryKey] = useState<string | null>(null);

  // Pagination & Sorting & Filters
  const [page, setPage] = useState(1);
  const [density, setDensity] = useState(50); // density maps to page size
  const [sort, setSort] = useState<{ col: string | null; dir: "asc" | "desc" | null }>({ col: null, dir: null });
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);

  // CRUD Modals
  const [openRow, setOpenRow] = useState<any | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTruncateOpen, setIsTruncateOpen] = useState(false);
  const [isOperationLoading, setIsOperationLoading] = useState(false);

  // Actions Dropdown
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Limit Dropdown
  const [isLimitOpen, setIsLimitOpen] = useState(false);
  const limitRef = useRef<HTMLDivElement>(null);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsActionsOpen(false);
      }
      if (limitRef.current && !limitRef.current.contains(event.target as Node)) {
        setIsLimitOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Escape key to close dropdowns
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsActionsOpen(false);
        setIsLimitOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Column order (drag reorder)
  const [order, setOrder] = useState<string[]>([]);
  const dragCol = useRef<string | null>(null);
  const subscribeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);



  // Handle global events (from CommandPalette or global triggers)
  useEffect(() => {
    const handleAdd = () => {
      setIsCreateOpen(true);
    };
    const handleTruncate = () => {
      setIsTruncateOpen(true);
    };
    const handleFilters = () => {
      setShowFilters((v) => !v);
    };
    const handleZen = () => {
      setIsZenMode((v) => !v);
    };
    const handleExportCsv = () => exportData("csv");
    const handleExportJson = () => exportData("json");

    window.addEventListener("explorer:add", handleAdd);
    window.addEventListener("explorer:truncate", handleTruncate);
    window.addEventListener("explorer:filter:toggle", handleFilters);
    window.addEventListener("explorer:zen:toggle", handleZen);
    window.addEventListener("explorer:export:csv", handleExportCsv);
    window.addEventListener("explorer:export:json", handleExportJson);

    return () => {
      window.removeEventListener("explorer:add", handleAdd);
      window.removeEventListener("explorer:truncate", handleTruncate);
      window.removeEventListener("explorer:filter:toggle", handleFilters);
      window.removeEventListener("explorer:zen:toggle", handleZen);
      window.removeEventListener("explorer:export:csv", handleExportCsv);
      window.removeEventListener("explorer:export:json", handleExportJson);
    };
  }, [rows, columns, order, tableName]);

  // Set Zen mode body class
  useEffect(() => {
    if (isZenMode) {
      document.body.classList.add("zen-mode");
    } else {
      document.body.classList.remove("zen-mode");
    }
    return () => document.body.classList.remove("zen-mode");
  }, [isZenMode]);

  // Fetch tables list
  useEffect(() => {
    if (!activeConnectionId) return;
    apiFetch(`/api/tables?connectionId=${encodeURIComponent(activeConnectionId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.length > 0 && !tableName) {
          navigate(`/explorer/${data[0]}`, { replace: true });
        }
      })
      .catch((err) => setError("Failed to fetch tables: " + err.message));
  }, [tableName, navigate, activeConnectionId]);

  // Reset page and config when switching tables/connection
  useEffect(() => {
    setPage(1);
    setRows([]);
    setColumns([]);
    setSort({ col: null, dir: null });
    setFilters({});
  }, [tableName, activeConnectionId]);

  // Fetch primary key and full schema
  useEffect(() => {
    if (tableName && activeConnectionId) {
      apiFetch(`/api/primary-key/${tableName}?connectionId=${encodeURIComponent(activeConnectionId)}`)
        .then((res) => res.json())
        .then((data) => setPrimaryKey(data.primaryKey))
        .catch(console.error);

      apiFetch(`/api/schema/${tableName}?connectionId=${encodeURIComponent(activeConnectionId)}`)
        .then((res) => res.json())
        .then((data) => setSchema(data))
        .catch(console.error);
    }
  }, [tableName, activeConnectionId]);

  // Keep columns ordered
  useEffect(() => {
    setOrder(columns);
  }, [columns]);

  // Pagination totals and pages info
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Subscribe and listen to changes via websocket
  useEffect(() => {
    if (!socket || !tableName || !activeConnectionId) return;

    if (subscribeTimer.current) clearTimeout(subscribeTimer.current);
    subscribeTimer.current = setTimeout(() => {
      socket.emit("subscribe", { tableName, page, pageSize: density, connectionId: activeConnectionId });
      setIsLoading(true);
    }, 80);

    const handleUpdate = (data: any) => {
      if (data.tableName === tableName && data.connectionId === activeConnectionId) {
        setColumns(data.columns || []);
        
        // Match live updates flash state
        setRows((prev) => {
          const current = data.rows || [];
          return current.map((row: any) => {
            const match = prev.find((p) => p[primaryKey || "id"] === row[primaryKey || "id"]);
            if (match && JSON.stringify(match) !== JSON.stringify(row)) {
              return { ...row, __flash: Date.now() };
            }
            return row;
          });
        });
        
        if (data.pagination) {
          setTotalRows(data.pagination.totalRows);
          setTotalPages(data.pagination.totalPages);
        }
        recordTableSnapshot(tableName, data.rows || [], primaryKey);
        setLastRefresh(Date.now());
        setIsLoading(false);
        setError(null);
      }
    };

    const handleCrudSuccess = (data: { action: string; tableName: string }) => {
      setIsOperationLoading(false);
      setIsCreateOpen(false);
      setOpenRow(null);
      setIsTruncateOpen(false);
      toast(`Record ${data.action}d successfully`, "success");
      socket.emit("subscribe", { tableName, page, pageSize: density, connectionId: activeConnectionId });
    };

    const handleError = (msg: string) => {
      setError(msg);
      setIsLoading(false);
      setIsOperationLoading(false);
      toast(msg, "error");
    };

    socket.on("table_update", handleUpdate);
    socket.on("crud_success", handleCrudSuccess);
    socket.on("error", handleError);

    return () => {
      if (subscribeTimer.current) clearTimeout(subscribeTimer.current);
      socket.off("table_update", handleUpdate);
      socket.off("crud_success", handleCrudSuccess);
      socket.off("error", handleError);
    };
  }, [socket, tableName, page, density, activeConnectionId, primaryKey]);

  // Client side sorting & filtering overlay on top of sockets
  const processedRows = useMemo(() => {
    let result = [...rows];
    
    // Filtering
    const activeFilters = Object.entries(filters).filter(([, v]) => v.trim());
    if (activeFilters.length > 0) {
      result = result.filter((row) =>
        activeFilters.every(([k, v]) => String(row[k] ?? "").toLowerCase().includes(v.toLowerCase()))
      );
    }

    // Sorting
    if (sort.col && sort.dir) {
      result.sort((a, b) => {
        let x = a[sort.col!];
        let y = b[sort.col!];
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        if (typeof x === "object") x = JSON.stringify(x);
        if (typeof y === "object") y = JSON.stringify(y);
        
        if (typeof x === "number" && typeof y === "number") {
          return sort.dir === "asc" ? x - y : y - x;
        }
        return sort.dir === "asc"
          ? String(x).localeCompare(String(y))
          : String(y).localeCompare(String(x));
      });
    }

    return result;
  }, [rows, filters, sort]);

  const from = processedRows.length > 0 ? (page - 1) * density + 1 : 0;
  const to = Math.min(page * density, totalRows);

  const clickSort = (name: string) => {
    setSort((s) =>
      s.col !== name ? { col: name, dir: "asc" } : s.dir === "asc" ? { col: name, dir: "desc" } : { col: null, dir: null }
    );
  };

  const onDrop = (target: string) => {
    const src = dragCol.current;
    if (!src || src === target) return;
    setOrder((o) => {
      const a = [...o];
      const si = a.indexOf(src);
      const ti = a.indexOf(target);
      a.splice(si, 1);
      a.splice(ti, 0, src);
      return a;
    });
    dragCol.current = null;
  };

  const saveRow = (updated: any) => {
    if (!socket || !primaryKey || !activeConnectionId) return;
    setIsOperationLoading(true);
    const { __flash, ...updates } = updated;
    socket.emit("update_row", {
      tableName,
      primaryKey,
      pkValue: updated[primaryKey],
      updates,
      connectionId: activeConnectionId,
    });
  };

  const deleteRow = (row: any) => {
    if (!socket || !primaryKey || !activeConnectionId) return;
    setIsOperationLoading(true);
    socket.emit("delete_row", {
      tableName,
      primaryKey,
      pkValue: row[primaryKey],
      connectionId: activeConnectionId,
    });
  };

  const performTruncate = () => {
    if (!socket || !activeConnectionId) return;
    setIsOperationLoading(true);
    socket.emit("truncate_table", { tableName, connectionId: activeConnectionId });
  };

  const performCreate = (data: any) => {
    if (!socket || !activeConnectionId) return;
    setIsOperationLoading(true);
    socket.emit("create_row", { tableName, data, connectionId: activeConnectionId });
  };

  const exportData = (type: "csv" | "json") => {
    if (processedRows.length === 0) return;
    let content = "";
    let mimeType = "";
    let filename = `export_${tableName}_${Date.now()}`;

    if (type === "json") {
      const cleanRows = processedRows.map(({ __flash, ...r }) => r);
      content = JSON.stringify(cleanRows, null, 2);
      mimeType = "application/json";
      filename += ".json";
    } else {
      const colsToExport = order.length ? order : columns;
      const header = colsToExport.join(",");
      const csvRows = processedRows.map((row) =>
        colsToExport
          .map((c) => {
            const v = row[c];
            if (v === null || v === undefined) return "NULL";
            if (typeof v === "object") return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
            return `"${String(v).replace(/"/g, '""')}"`;
          })
          .join(",")
      );
      content = [header, ...csvRows].join("\n");
      mimeType = "text/csv";
      filename += ".csv";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const cols = useMemo(() => {
    if (!schema) return order.map((n) => ({ name: n, type: "text", nullable: true, pk: false, fk: null }));
    return order
      .map((n) => {
        const c = schema.columns.find((x) => x.name === n);
        return c
          ? {
              name: c.name,
              type: c.type,
              nullable: c.nullable,
              pk: c.isPrimaryKey,
              fk: c.foreignKey ? `${c.foreignKey.table}.${c.foreignKey.column}` : null,
            }
          : { name: n, type: "text", nullable: true, pk: false, fk: null };
      })
      .filter(Boolean);
  }, [order, schema]);

  if (!tableName) {
    return (
      <div className="center">
        <Icon n="database" s={42} className="ic" />
        <h3>Select a Table</h3>
        <p>Choose a table from the sidebar or using the command search palette to start browsing database schema records.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, height: "100%", minHeight: 0 }}>
      {error ? (
        <div className="center">
          <Icon n="crash" s={46} className="ic" />
          <h3>Could not load <span className="mono">{tableName}</span></h3>
          <p>{error}</p>
          <button className="btn" onClick={() => window.location.reload()}>
            <Icon n="refresh" s={14} />
            Reload
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>
          {!isLoading && processedRows.length === 0 && !error && (
            <div className="center" style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none", marginTop: 36 }}>
              <Icon n="inbox" s={48} className="ic" />
              <h3>No rows</h3>
              <p>No rows match the current table filters or queries.</p>
            </div>
          )}
          <div className="tablewrap">
            <table className="grid">
            <thead>
              <tr>
                <th className="rownum">S.NO</th>
                {cols.map((c) => {
                  const on = sort.col === c.name;
                  return (
                    <th
                      key={c.name}
                      draggable
                      onDragStart={() => (dragCol.current = c.name)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(c.name)}
                    >
                      <div className="th-inner" onClick={() => clickSort(c.name)}>
                        <div className="th-row1">
                          <span className="th-grip">
                            <Icon n="grip" s={13} />
                          </span>
                          <span className="th-name">{c.name}</span>
                          {c.pk && (
                            <span className="badge pk">
                              <Icon n="key" s={9} />
                              PK
                            </span>
                          )}
                          {c.fk && (
                            <span className="badge fk">
                              <Icon n="link" s={9} />
                              FK
                            </span>
                          )}
                          <span className={"th-sort" + (on ? " on" : "")}>
                            <Icon n={on ? (sort.dir === "asc" ? "arrowUp" : "arrowDown") : "sort"} s={on ? 13 : 12} />
                          </span>
                        </div>
                        <div className="th-type">
                          <span style={{ color: `var(--t-${typeCat(c.type)})` }}>{c.type}</span>
                          {!c.nullable && <span style={{ color: "var(--text-faint)" }}>· not null</span>}
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
              {showFilters && !isZenMode && (
                <tr className="filterrow">
                  <td className="rownum">
                    <button className="pgbtn" title="Clear filters" onClick={() => setFilters({})} style={{ minWidth: 0, padding: 2 }}>
                      <Icon n="x" s={12} />
                    </button>
                  </td>
                  {cols.map((c) => (
                    <td key={c.name}>
                      <input
                        className="field"
                        placeholder="filter…"
                        value={filters[c.name] || ""}
                        onChange={(e) => {
                          setFilters((f) => ({ ...f, [c.name]: e.target.value }));
                        }}
                      />
                    </td>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 14 }).map((_, i) => (
                  <tr key={i}>
                    <td className="rownum">{i + 1}</td>
                    {cols.map((c) => (
                      <td key={c.name}>
                        <span className="cell">
                          <span className="skel" style={{ display: "block", width: `${40 + ((i * 7 + c.name.length * 5) % 50)}%` }} />
                        </span>
                      </td>
                    ))}
                  </tr>
                ))
              ) : processedRows.length === 0 ? (
                <tr><td colSpan={cols.length + 1} style={{ height: 0, border: "none", padding: 0 }} /></tr>
              ) : (
                processedRows.map((row, i) => (
                  <tr key={row[primaryKey || "id"] || i} onClick={() => setOpenRow(row)}>
                    <td className="rownum">{from + i}</td>
                    {cols.map((c) => (
                      <Cell key={c.name} v={row[c.name]} flash={row.__flash} />
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    )}

      {/* status bar */}
      {!isZenMode && !error && (
        <div className="statusbar">
          <div className="grp">
            <Icon n="table" s={13} style={{ color: "var(--text-faint)" }} />
            <span>
              Showing <b className="mono" style={{ color: "var(--text)" }}>{from}–{to}</b> of{" "}
              <b className="mono" style={{ color: "var(--text)" }}>{totalRows.toLocaleString()}</b> rows
            </span>
            {Object.values(filters).some(Boolean) && (
              <span className="badge accent" style={{ marginLeft: 4 }}>
                filtered
              </span>
            )}
          </div>
          <div className="spacer" />
          <Pager page={page} pageCount={totalPages} setPage={setPage} />
          <div className="spacer" />
          <div className="grp mono" style={{ color: "var(--text-faint)" }}>
            <span className="dot live pulse" />
            live · refreshed {ago(lastRefresh)}
          </div>
          {/* Rows-per-page popup — styled like Table Actions */}
          <div className="actions-dropdown-container" ref={limitRef} style={{ display: "flex", alignItems: "center" }}>
            <button
              className={"btn sm " + (isLimitOpen ? "active" : "")}
              onClick={() => setIsLimitOpen((v) => !v)}
              style={{
                padding: "3px 8px", fontSize: "11px", height: "24px",
                display: "flex", alignItems: "center", gap: 5,
                background: "var(--surface-2)", borderColor: "var(--border)",
              }}
            >
              <Icon n="list" s={11} />
              <span>{density} rows</span>
              <Icon n="chevD" s={10} style={{ opacity: 0.6 }} />
            </button>

            {isLimitOpen && (
              <div className="actions-dropdown-menu" style={{ bottom: "calc(100% + 6px)", top: "auto", right: 0, minWidth: 160 }}>
                <div className="actions-dropdown-section">Rows per page</div>
                {[25, 50, 100, 200, 500].map((d) => (
                  <button
                    key={d}
                    className={`actions-dropdown-item${density === d ? " active" : ""}`}
                    onClick={() => { setDensity(d); setPage(1); setIsLimitOpen(false); }}
                  >
                    <Icon n="list" s={12} style={{ opacity: 0.5 }} />
                    <span>{d} rows</span>
                    {density === d && <Icon n="check" s={11} style={{ marginLeft: "auto", color: "var(--accent)" }} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Table Actions Dropdown inside statusbar */}
          <div className="actions-dropdown-container" ref={dropdownRef} style={{ display: "flex", alignItems: "center" }}>
            <button
              className={"btn sm " + (isActionsOpen ? "active" : "")}
              onClick={() => setIsActionsOpen(!isActionsOpen)}
              style={{
                padding: "3px 8px",
                fontSize: "11px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: "var(--surface-2)",
                borderColor: "var(--border)",
              }}
            >
              <Icon n="settings" s={11} />
              <span>Table Actions</span>
              {Object.values(filters).some(v => v && v.trim()) && (
                <span className="dot live" style={{ width: 6, height: 6, background: "var(--accent)" }} />
              )}
              <Icon n="chevD" s={10} style={{ opacity: 0.6 }} />
            </button>

            {isActionsOpen && (
              <div className="actions-dropdown-menu" style={{ bottom: "calc(100% + 6px)", top: "auto", right: 0 }}>
                <div className="actions-dropdown-section">Data Operations</div>
                <button
                  className="actions-dropdown-item"
                  onClick={() => {
                    setIsActionsOpen(false);
                    setIsCreateOpen(true);
                  }}
                >
                  <Icon n="plus" s={12} />
                  <span>New Row</span>
                </button>
                <button
                  className={"actions-dropdown-item " + (showFilters ? "active" : "")}
                  onClick={() => {
                    setIsActionsOpen(false);
                    setShowFilters((f) => !f);
                  }}
                >
                  <Icon n="filter" s={12} />
                  <span>{showFilters ? "Hide Filter Row" : "Filter Columns"}</span>
                  {Object.values(filters).some(v => v && v.trim()) && (
                    <span style={{ marginLeft: "auto", fontSize: 9 }} className="badge accent">active</span>
                  )}
                </button>

                <div className="actions-dropdown-divider" />
                
                <div className="actions-dropdown-section">View Options</div>
                <button
                  className={"actions-dropdown-item " + (isZenMode ? "active" : "")}
                  onClick={() => {
                    setIsActionsOpen(false);
                    setIsZenMode((z) => !z);
                  }}
                >
                  <Icon n={isZenMode ? "minimize" : "maximize"} s={12} />
                  <span>Zen Mode</span>
                  <span className="kbd" style={{ marginLeft: "auto", fontSize: 9, padding: "1px 3px" }}>Z</span>
                </button>

                <div className="actions-dropdown-divider" />

                <div className="actions-dropdown-section">Export Data</div>
                <button
                  className="actions-dropdown-item"
                  onClick={() => {
                    setIsActionsOpen(false);
                    exportData("csv");
                  }}
                >
                  <Icon n="download" s={12} />
                  <span>Export as CSV</span>
                </button>
                <button
                  className="actions-dropdown-item"
                  onClick={() => {
                    setIsActionsOpen(false);
                    exportData("json");
                  }}
                >
                  <Icon n="download" s={12} />
                  <span>Export as JSON</span>
                </button>

                <div className="actions-dropdown-divider" />

                <div className="actions-dropdown-section">Danger Zone</div>
                <button
                  className="actions-dropdown-item danger"
                  onClick={() => {
                    setIsActionsOpen(false);
                    setIsTruncateOpen(true);
                  }}
                >
                  <Icon n="trash" s={12} />
                  <span>Truncate Table</span>
                </button>
              </div>
            )}
          </div>

          {/* Changes Timeline Trigger Button */}
          <button
            className={"btn sm ghost"}
            onClick={() => setIsTimelineOpen(true)}
            style={{
              padding: "3px 8px",
              fontSize: "11px",
              height: "24px",
              display: "flex",
              alignItems: "center",
              gap: 5,
              color: "var(--text-dim)",
              background: "var(--surface-2)",
              borderColor: "var(--border)",
              marginLeft: 4,
            }}
          >
            <Icon n="history" s={11} />
            <span>Changes</span>
            {changeEvents.length > 0 && (
              <span className="badge accent" style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, lineHeight: 1 }}>
                {changeEvents.length}
              </span>
            )}
          </button>
        </div>
      )}

      {isZenMode && (
        <div className="zen-exit">
          <button className="btn" onClick={() => setIsZenMode(false)} style={{ boxShadow: "var(--shadow)" }}>
            <Icon n="minimize" s={14} />
            Exit Zen Mode <span className="kbd">Z</span>
          </button>
        </div>
      )}

      {openRow && schema && (
        <RowModal
          row={openRow}
          schema={schema}
          pkCol={primaryKey || "id"}
          onClose={() => setOpenRow(null)}
          onSave={saveRow}
          onDelete={deleteRow}
          busy={isOperationLoading}
          tableName={tableName || ""}
        />
      )}

      {isTruncateOpen && (
        <TruncateModal
          table={tableName}
          count={totalRows}
          onClose={() => setIsTruncateOpen(false)}
          onConfirm={performTruncate}
          busy={isOperationLoading}
        />
      )}

      {isCreateOpen && schema && (
        <CreateModal
          table={tableName}
          schema={schema}
          onClose={() => setIsCreateOpen(false)}
          onConfirm={performCreate}
          busy={isOperationLoading}
        />
      )}

      {/* Changes Drawer */}
      {isTimelineOpen && (
        <>
          <div className="timeline-backdrop" onClick={() => setIsTimelineOpen(false)} />
          <div className="timeline-drawer">
            <div className="timeline-drawer-header">
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon n="history" s={14} style={{ color: "var(--accent)" }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>Change Timeline</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  className="btn sm"
                  onClick={addMockTransaction}
                  title="Simulate a database change event"
                  style={{ fontSize: 10.5, padding: "3px 6px", height: 22 }}
                >
                  <Icon n="zap" s={9} />
                  <span>Simulate</span>
                </button>
                <button
                  className={"btn sm " + (autoCapture ? "primary" : "ghost")}
                  onClick={() => setAutoCapture(!autoCapture)}
                  style={{ fontSize: 10.5, padding: "3px 6px", height: 22 }}
                >
                  {autoCapture ? "Auto ON" : "Auto OFF"}
                </button>
                <button
                  className="btn icon sm ghost"
                  onClick={() => setIsTimelineOpen(false)}
                  style={{ width: 22, height: 22 }}
                >
                  <Icon n="x" s={13} />
                </button>
              </div>
            </div>
            <div className="timeline-drawer-body">
              {changeEvents.length === 0 ? (
                <div className="center" style={{ marginTop: 80 }}>
                  <Icon n="history" s={36} style={{ color: "var(--text-faint)" }} />
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>No changes captured</h4>
                  <p style={{ fontSize: 11.5, textAlign: "center", maxWidth: 260, color: "var(--text-dim)" }}>
                    Changes are automatically diffed client-side when tables refresh. Try clicking <b>Simulate</b> to test the explorer!
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {changeEvents.map((evt) => (
                    <TimelineEventRow key={evt.id} event={evt} />
                  ))}
                  <button
                    className="btn sm danger"
                    onClick={clearEvents}
                    style={{ alignSelf: "center", marginTop: 8, fontSize: 11 }}
                  >
                    <Icon n="trash" s={11} /> Clear Log
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Row Diff Modal */}
      {selectedRowNode && (
        <RowDiffModal onClose={() => setSelectedRowNode(null)} />
      )}
    </div>
  );
}

// Cell component to handle flash updates
const Cell: React.FC<{ v: any; flash?: number }> = ({ v, flash }) => {
  const f = fmtCell(v);
  const [flashOn, setFlashOn] = useState(false);

  useEffect(() => {
    if (flash) {
      setFlashOn(true);
      const t = setTimeout(() => setFlashOn(false), 900);
      return () => clearTimeout(t);
    }
  }, [flash]);

  let inner: React.ReactNode;
  if (f.kind === "null") inner = <span className="null">—</span>;
  else if (f.kind === "json") inner = <span className="jsonchip">{f.label}</span>;
  else if (f.kind === "bool") {
    inner = (
      <span className="boolcell">
        <span className="bd" style={{ background: v ? "var(--green)" : "var(--text-faint)" }} />
        {String(v)}
      </span>
    );
  } else inner = f.label;

  return (
    <td style={flashOn ? { background: "var(--accent-soft)", transition: "background .3s" } : undefined}>
      <span className="cell">{inner}</span>
    </td>
  );
};

// Pager component
interface PagerProps {
  page: number;
  pageCount: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}

const Pager: React.FC<PagerProps> = ({ page, pageCount, setPage }) => {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState("");
  const popRef                = useRef<HTMLDivElement>(null);
  const inputRef              = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus input when popup opens
  useEffect(() => {
    if (open) { setInput(""); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  const jump = (n: number) => { const clamped = Math.max(1, Math.min(pageCount, n)); setPage(clamped); setOpen(false); };
  const handleInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { const n = parseInt(input, 10); if (!isNaN(n)) jump(n); }
    if (e.key === "Escape") setOpen(false);
  };

  // Pages to show in list: window of 7 around current, always include 1 and last
  const buildPages = () => {
    if (pageCount <= 9) return Array.from({ length: pageCount }, (_, i) => i + 1);
    const around = new Set<number>([1, pageCount]);
    for (let i = Math.max(1, page - 3); i <= Math.min(pageCount, page + 3); i++) around.add(i);
    return Array.from(around).sort((a, b) => a - b);
  };
  const pages = buildPages();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {/* Prev */}
      <button
        className="pgbtn"
        disabled={page <= 1}
        onClick={() => setPage((p) => p - 1)}
      >
        <Icon n="chevL" s={14} />
      </button>

      {/* Page popup trigger */}
      <div className="actions-dropdown-container" ref={popRef} style={{ position: "relative" }}>
        <button
          className={"btn sm " + (open ? "active" : "")}
          onClick={() => setOpen((v) => !v)}
          style={{
            padding: "3px 10px", fontSize: "11px", height: "24px",
            display: "flex", alignItems: "center", gap: 5,
            background: open ? "var(--accent-soft)" : "var(--surface-2)",
            borderColor: open ? "var(--accent-line)" : "var(--border)",
            color: open ? "var(--accent)" : "var(--text)",
            fontFamily: "monospace", fontWeight: 700, minWidth: 36,
          }}
        >
          {page}
          <Icon n="chevD" s={10} style={{ opacity: 0.5 }} />
        </button>

        {open && (
          <div
            className="actions-dropdown-menu"
            style={{ bottom: "calc(100% + 6px)", top: "auto", left: "50%", right: "auto", transform: "translateX(-50%)", minWidth: 180 }}
          >
            <div className="actions-dropdown-section">Page {page} of {pageCount}</div>

            {/* Jump-to input */}
            <div style={{ padding: "6px 10px 4px" }}>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <input
                  ref={inputRef}
                  className="field"
                  style={{ flex: 1, height: 26, padding: "0 7px", fontSize: "11px", fontFamily: "monospace" }}
                  placeholder={`1 – ${pageCount}`}
                  value={input}
                  onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={handleInputKey}
                />
                <button
                  className="btn sm primary"
                  style={{ height: 26, padding: "0 8px", fontSize: "11px" }}
                  onClick={() => { const n = parseInt(input, 10); if (!isNaN(n)) jump(n); }}
                >Go</button>
              </div>
            </div>

            {/* Page list */}
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {pages.map((n, i) => {
                const prev = pages[i - 1];
                const showEllipsis = prev !== undefined && n - prev > 1;
                return (
                  <React.Fragment key={n}>
                    {showEllipsis && (
                      <div style={{ padding: "2px 12px", fontSize: "10px", color: "var(--text-faint)", userSelect: "none" }}>…</div>
                    )}
                    <button
                      className={`actions-dropdown-item${n === page ? " active" : ""}`}
                      onClick={() => jump(n)}
                    >
                      <span style={{ fontFamily: "monospace", minWidth: 24 }}>Page {n}</span>
                      {n === page && <Icon n="check" s={11} style={{ marginLeft: "auto", color: "var(--accent)" }} />}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Next */}
      <button
        className="pgbtn"
        disabled={page >= pageCount}
        onClick={() => setPage((p) => p + 1)}
      >
        <Icon n="chevR" s={14} />
      </button>
    </div>
  );
};

// Row modal component
interface RowModalProps {
  row: any;
  schema: { columns: ColumnSchema[] };
  pkCol: string;
  onClose: () => void;
  onSave: (updated: any) => void;
  onDelete: (row: any) => void;
  busy: boolean;
  tableName: string;
}

const RowModal: React.FC<RowModalProps> = ({ row, schema, pkCol, onClose, onSave, onDelete, busy, tableName }) => {
  const [tab, setTab] = useState<"preview" | "edit" | "delete" | "history">("preview");
  const [draft, setDraft] = useState(() => ({ ...row }));
  const [copied, setCopied] = useState(false);

  const clean = useMemo(() => {
    const { __flash, ...r } = row;
    return r;
  }, [row]);

  const modified = useMemo(() => {
    return schema.columns.filter(
      (c) => JSON.stringify(draft[c.name]) !== JSON.stringify(row[c.name])
    );
  }, [schema.columns, draft, row]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const setVal = (name: string, val: any) => {
    setDraft((d: any) => ({ ...d, [name]: val }));
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="rowmodal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon n="table" s={16} style={{ color: "var(--accent)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Row detail</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>
              {pkCol} = {String(row[pkCol])}
            </div>
          </div>
          <button className="btn icon sm ghost" onClick={onClose}>
            <Icon n="x" s={16} />
          </button>
        </div>
        <div className="modal-tabs">
          <div className={"mtab" + (tab === "preview" ? " on" : "")} onClick={() => setTab("preview")}>
            <Icon n="eye" s={14} /> Preview
          </div>
          <div className={"mtab" + (tab === "edit" ? " on" : "")} onClick={() => setTab("edit")}>
            <Icon n="edit" s={14} /> Edit {modified.length > 0 && <span className="ct">{modified.length}</span>}
          </div>
          <div className={"mtab" + (tab === "history" ? " on" : "")} onClick={() => setTab("history")}>
            <Icon n="history" s={14} /> History
          </div>
          <div className={"mtab" + (tab === "delete" ? " on" : "")} onClick={() => setTab("delete")}>
            <Icon n="trash" s={14} /> Delete
          </div>
        </div>

        {tab === "preview" && (
          <>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column" }}>
              <pre className="json" style={{ flex: 1, margin: 0, maxHeight: "none" }} dangerouslySetInnerHTML={{ __html: syntaxJson(clean) }} />
            </div>
            <div className="modal-foot">
              <span className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>
                {schema.columns.length} columns
              </span>
              <div style={{ flex: 1 }} />
              <button
                className="btn"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(clean, null, 2));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1400);
                }}
              >
                <Icon n={copied ? "check" : "copy"} s={14} />
                {copied ? "Copied" : "Copy JSON"}
              </button>
            </div>
          </>
        )}

        {tab === "edit" && (
          <>
            <div className="modal-body" style={{ padding: 0 }}>
              <div className="editgrid">
                {schema.columns.map((c) => {
                  const isMod = modified.some((m) => m.name === c.name);
                  return (
                    <div key={c.name} className={"efield" + (isMod ? " mod" : "")}>
                      <div className="top">
                        <span className="cn">{c.name}</span>
                        <TypeBadge t={c.type} />
                        {c.isPrimaryKey && (
                          <span className="badge pk">
                            <Icon n="key" s={9} />
                            PK
                          </span>
                        )}
                        <button
                          className="btn icon sm ghost copy-btn"
                          title="Copy value"
                          onClick={() => navigator.clipboard.writeText(String(draft[c.name] ?? ""))}
                        >
                          <Icon n="copy" s={11} />
                        </button>
                      </div>
                      <EditInput col={c} value={draft[c.name]} pk={c.isPrimaryKey} onChange={(v) => setVal(c.name, v)} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-foot">
              <span style={{ fontSize: 12, color: modified.length ? "var(--amber)" : "var(--text-faint)" }}>
                {modified.length ? `${modified.length} field${modified.length > 1 ? "s" : ""} modified` : "No changes"}
              </span>
              <div style={{ flex: 1 }} />
              <button className="btn" onClick={() => setDraft({ ...row })} disabled={!modified.length || busy}>
                Reset
              </button>
              <button className="btn primary" onClick={() => onSave(draft)} disabled={!modified.length || busy}>
                {busy ? <Icon n="refresh" s={14} className="spin" /> : <Icon n="save" s={14} />}
                Save Changes
              </button>
            </div>
          </>
        )}

        {tab === "history" && (
          <RowModalHistoryTab tableName={tableName || ""} pkValue={row[pkCol]} />
        )}

        {tab === "delete" && (
          <div className="modal-body">
            <div className="dangerwrap">
              <div className="warnicon">
                <Icon n="warn" s={28} />
              </div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700 }}>Delete this row?</h3>
                <p style={{ fontSize: "12.5px", color: "var(--text-dim)", marginTop: 6, maxWidth: 380 }}>
                  This permanently removes the row where <span className="mono" style={{ color: "var(--text)" }}>{pkCol}={String(row[pkCol])}</span> from the database. This action cannot be undone.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button className="btn" onClick={onClose} disabled={busy}>
                  Cancel
                </button>
                <button className="btn danger solid" onClick={() => onDelete(row)} disabled={busy}>
                  {busy ? <Icon n="refresh" s={14} className="spin" /> : <Icon n="trash" s={14} />}
                  Delete row
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Edit Input component
interface EditInputProps {
  col: ColumnSchema;
  value: any;
  pk: boolean;
  onChange: (v: any) => void;
}

const EditInput: React.FC<EditInputProps> = ({ col, value, pk, onChange }) => {
  const cat = typeCat(col.type);
  if (pk) return <input className="field mono ro" readOnly value={String(value ?? "")} />;
  if (cat === "bool") {
    return (
      <select
        className="field"
        value={value === null || value === undefined ? "null" : String(value)}
        onChange={(e) => onChange(e.target.value === "null" ? null : e.target.value === "true")}
      >
        <option value="true">true</option>
        <option value="false">false</option>
        <option value="null">NULL</option>
      </select>
    );
  }
  if (cat === "json" || (typeof value === "object" && value !== null)) {
    return (
      <textarea
        className="field mono"
        rows={4}
        style={{ resize: "vertical", lineHeight: 1.5 }}
        value={typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "")}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            onChange(e.target.value);
          }
        }}
      />
    );
  }
  if (cat === "int") {
    return (
      <input
        type="number"
        className="field mono"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    );
  }
  return (
    <input
      className="field mono"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
    />
  );
};

// Truncate Modal component
interface TruncateModalProps {
  table: string;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}

const TruncateModal: React.FC<TruncateModalProps> = ({ table, count, onClose, onConfirm, busy }) => {
  const [confirmText, setConfirm] = useState("");
  return (
    <div className="overlay" onClick={onClose}>
      <div className="rowmodal" style={{ width: "min(460px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="dangerwrap" style={{ padding: "34px 28px" }}>
          <div className="warnicon pulse2">
            <Icon n="warn" s={30} />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 700 }}>
            Truncate <span className="mono">{table}</span>
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-dim)", maxWidth: 360 }}>
            You are about to permanently delete all
            <b style={{ color: "var(--red)" }} className="mono">
              {" "}
              {count.toLocaleString()}{" "}
            </b>
            rows. The table structure is kept, but every row is gone. This cannot be undone.
          </p>
          <input
            className="field mono"
            placeholder={`type "${table}" to confirm`}
            value={confirmText}
            onChange={(e) => setConfirm(e.target.value)}
            style={{ maxWidth: 300 }}
            disabled={busy}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn danger solid" disabled={confirmText !== table || busy} onClick={onConfirm}>
              {busy ? <Icon n="refresh" s={14} className="spin" /> : <Icon n="trash" s={14} />}
              Truncate table
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Create Modal component
interface CreateModalProps {
  table: string;
  schema: { columns: ColumnSchema[] };
  onClose: () => void;
  onConfirm: (data: any) => void;
  busy: boolean;
}

const CreateModal: React.FC<CreateModalProps> = ({ table, schema, onClose, onConfirm, busy }) => {
  const [draft, setDraft] = useState<Record<string, any>>({});

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const setVal = (name: string, val: any) => {
    setDraft((d: any) => ({ ...d, [name]: val }));
  };

  const submit = () => {
    // Cast data variables correctly
    const finalData: Record<string, any> = {};
    schema.columns.forEach((c) => {
      const v = draft[c.name];
      if (v === "" || v === undefined || v === null) {
        return; // skip or let database use default
      }
      const cat = typeCat(c.type);
      if (cat === "int") {
        finalData[c.name] = Number(v);
      } else if (cat === "bool") {
        finalData[c.name] = v === true || v === "true";
      } else {
        finalData[c.name] = v;
      }
    });
    onConfirm(finalData);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="rowmodal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon n="plus" s={16} style={{ color: "var(--accent)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>New Row</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>
              Insert record into {table}
            </div>
          </div>
          <button className="btn icon sm ghost" onClick={onClose}>
            <Icon n="x" s={16} />
          </button>
        </div>
        <div className="modal-body" style={{ maxHeight: "65vh" }}>
          <div className="editgrid">
            {schema.columns.map((c) => {
              return (
                <div key={c.name} className="efield">
                  <div className="top">
                    <span className="cn">{c.name}</span>
                    <TypeBadge t={c.type} />
                    {c.isPrimaryKey && (
                      <span className="badge pk">
                        <Icon n="key" s={9} />
                        PK
                      </span>
                    )}
                  </div>
                  <EditInput col={c} value={draft[c.name]} pk={false} onChange={(v) => setVal(c.name, v)} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-foot">
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? <Icon n="refresh" s={14} className="spin" /> : <Icon n="save" s={14} />}
            Create Row
          </button>
        </div>
      </div>
    </div>
  );
};

// ago helper function
function ago(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 2) return "just now";
  if (s < 60) return s + "s ago";
  return Math.floor(s / 60) + "m ago";
}

// ============================================================ TRANSACTION TIMELINE COMPONENTS
const TimelineEventRow: React.FC<{ event: ChangeEvent }> = ({ event }) => {
  const [expanded, setExpanded] = useState(false);
  const timeStr = new Date(event.capturedAt).toLocaleTimeString();
  const dateStr = new Date(event.capturedAt).toLocaleDateString();

  const totalTables = event.tables.length;
  const totalRows = event.tables.reduce((sum, t) => sum + t.rowCount, 0);

  return (
    <div className="card" style={{ border: "1px solid var(--border)", background: "var(--surface-2)", padding: 10 }}>
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text)" }}>Transaction</span>
            <span className="mono" style={{ fontSize: 10, color: "var(--text-faint)" }}>#{event.id}</span>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 2 }} title={dateStr + " " + event.capturedAt}>
            {timeStr} · {totalTables} table{totalTables > 1 ? "s" : ""} · {totalRows} row{totalRows > 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="badge dim" style={{ fontSize: 9, textTransform: "uppercase" }}>
            {event.source}
          </span>
          <Icon n={expanded ? "chevD" : "chevR"} s={13} style={{ color: "var(--text-faint)" }} />
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, borderTop: "1px solid var(--border-soft)", paddingTop: 8 }}>
          <TransactionTree tables={event.tables} />
        </div>
      )}
    </div>
  );
};

const TransactionTree: React.FC<{ tables: TableChange[] }> = ({ tables }) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {tables.map((tc) => (
        <div key={tc.tableName} className="tree-node-branch">
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
            <Icon n="table" s={11} style={{ color: "var(--text-faint)" }} />
            <span className="mono" style={{ fontWeight: 600, fontSize: 11.5, color: "var(--text)" }}>{tc.tableName}</span>
            <span className="badge dim" style={{ fontSize: 9, padding: "0 4px" }}>
              {tc.rowCount} row{tc.rowCount > 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {tc.rows.map((rowChange, index) => (
              <RowNodeLeaf key={index} tableName={tc.tableName} row={rowChange} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const RowNodeLeaf: React.FC<{ tableName: string; row: RowChange }> = ({ tableName, row }) => {
  const { setSelectedRowNode } = useChange();

  const getBadgeClass = (op: string) => {
    if (op === "INSERT") return { label: "INS", color: "var(--green)", bg: "var(--green-soft)" };
    if (op === "DELETE") return { label: "DEL", color: "var(--red)", bg: "var(--red-soft)" };
    return { label: "UPD", color: "var(--amber)", bg: "var(--amber-soft)" };
  };

  const badge = getBadgeClass(row.operation);

  return (
    <div
      className="tree-node-leaf"
      onClick={() => setSelectedRowNode({ ...row, tableName })}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 0",
        cursor: "pointer",
        userSelect: "none"
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "inherit"; }}
    >
      <span
        style={{
          fontSize: 8.5,
          fontWeight: 700,
          color: badge.color,
          background: badge.bg,
          padding: "1px 3.5px",
          borderRadius: 3,
          lineHeight: 1
        }}
      >
        {badge.label}
      </span>
      <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
        {row.primaryKey}={String(row.pkValue)}
      </span>
      <Icon n="arrowRight" s={10} style={{ opacity: 0.4, marginLeft: "auto" }} />
    </div>
  );
};

// ============================================================ ROW DIFF MODAL
const RowDiffModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { selectedRowNode, rowHistory } = useChange();
  const [showChangedOnly, setShowChangedOnly] = useState(false);
  const [activeVersionIndex, setActiveVersionIndex] = useState<number>(-1);
  const [copied, setCopied] = useState(false);

  if (!selectedRowNode) return null;

  const key = `${selectedRowNode.tableName}::${selectedRowNode.pkValue}`;
  const history = rowHistory[key] || [];

  useEffect(() => {
    if (history.length > 0 && activeVersionIndex === -1) {
      setActiveVersionIndex(history.length - 1);
    }
  }, [history, activeVersionIndex]);

  const activeVersion = history[activeVersionIndex] || null;
  const prevVersion = activeVersionIndex > 0 ? history[activeVersionIndex - 1] : null;

  const beforeData = prevVersion ? prevVersion.data : null;
  const afterData = activeVersion ? activeVersion.data : null;

  const operation = activeVersion ? activeVersion.operation : selectedRowNode.operation;

  const allColumns = Array.from(new Set([
    ...Object.keys(beforeData || {}),
    ...Object.keys(afterData || {})
  ])).filter(c => c !== "__flash");

  const activeChangedColumns = allColumns.filter(c => {
    const bVal = beforeData ? beforeData[c] : undefined;
    const aVal = afterData ? afterData[c] : undefined;
    return JSON.stringify(bVal) !== JSON.stringify(aVal);
  });

  const renderVal = (v: any) => {
    if (v === null || v === undefined) return <span className="null">—</span>;
    if (typeof v === "object") return <span className="jsonchip">{JSON.stringify(v)}</span>;
    return String(v);
  };

  const copyAsJson = () => {
    const exportData = {
      tableName: selectedRowNode.tableName,
      primaryKey: selectedRowNode.primaryKey,
      pkValue: selectedRowNode.pkValue,
      version: activeVersion?.version || 1,
      operation,
      before: beforeData,
      after: afterData
    };
    navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="rowmodal" style={{ width: "min(780px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon n="history" s={16} style={{ color: "var(--accent)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
              Row Diff & History
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>
              {selectedRowNode.tableName} · {selectedRowNode.primaryKey} = {String(selectedRowNode.pkValue)}
            </div>
          </div>
          <button className="btn icon sm ghost" onClick={onClose}>
            <Icon n="x" s={16} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: "none" }}>
          {/* Version Navigator Strip */}
          <div className="version-strip-container">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="label">Version History Navigator</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: "auto" }}>
                {history.length > 0 ? `Version v${activeVersionIndex + 1} of v${history.length}` : "No history recorded"}
              </span>
            </div>
            {history.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--text-faint)", fontStyle: "italic", padding: "6px 0" }}>
                No past versions captured for this row yet.
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                <button
                  className="pgbtn"
                  disabled={activeVersionIndex <= 0}
                  onClick={() => setActiveVersionIndex(v => v - 1)}
                  style={{ padding: 4 }}
                >
                  <Icon n="chevL" s={13} />
                </button>

                <div className="version-strip-track" style={{ flex: 1 }}>
                  <div className="version-strip-line" />
                  {history.map((ver, idx) => {
                    const isSelected = activeVersionIndex === idx;
                    return (
                      <div
                        key={idx}
                        className={"version-dot-wrapper " + (isSelected ? "active" : "")}
                        onClick={() => setActiveVersionIndex(idx)}
                        title={`Version v${ver.version} (${ver.operation}) - ${new Date(ver.timestamp).toLocaleTimeString()}`}
                      >
                        <div className="version-dot" />
                        <span className="version-dot-label">v{ver.version}</span>
                      </div>
                    );
                  })}
                </div>

                <button
                  className="pgbtn"
                  disabled={activeVersionIndex >= history.length - 1}
                  onClick={() => setActiveVersionIndex(v => v + 1)}
                  style={{ padding: 4 }}
                >
                  <Icon n="chevR" s={13} />
                </button>
              </div>
            )}
          </div>

          {/* Diff Grid */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text)" }}>
                Operation: <span style={{
                  color: operation === "INSERT" ? "var(--green)" : operation === "DELETE" ? "var(--red)" : "var(--amber)",
                  fontWeight: 700
                }}>{operation}</span>
              </span>
              <button
                className={"btn sm " + (showChangedOnly ? "active" : "ghost")}
                onClick={() => setShowChangedOnly(!showChangedOnly)}
                style={{ fontSize: 11, padding: "2px 6px", height: 22 }}
              >
                <Icon n="filter" s={10} />
                <span>Changed Columns Only</span>
              </button>
            </div>

            <table className="grid" style={{ width: "100%", tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th style={{ width: "25%", padding: "6px 8px", fontSize: 11 }}>Column</th>
                  <th style={{ width: "37.5%", padding: "6px 8px", fontSize: 11 }}>Before</th>
                  <th style={{ width: "37.5%", padding: "6px 8px", fontSize: 11 }}>After</th>
                </tr>
              </thead>
              <tbody>
                {allColumns
                  .filter(col => !showChangedOnly || activeChangedColumns.includes(col))
                  .map(col => {
                    const isChanged = activeChangedColumns.includes(col);
                    return (
                      <tr key={col} className={isChanged ? "diff-row-changed" : "diff-row-unchanged"}>
                        <td style={{ padding: "6px 8px 6px 10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text)", fontWeight: 500 }} className="mono">{col}</td>
                        <td style={{ padding: "6px 8px" }} className="mono">
                          <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{renderVal(beforeData?.[col])}</span>
                            {beforeData?.[col] != null && (
                              <button className="btn icon sm ghost copy-cell-btn" title="Copy" onClick={() => navigator.clipboard.writeText(String(beforeData?.[col] ?? ""))}><Icon n="copy" s={10} /></button>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "6px 8px" }} className="mono">
                          <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{renderVal(afterData?.[col])}</span>
                            {isChanged && <span className="diff-cell-indicator" style={{ flexShrink: 0 }}>✦</span>}
                            {afterData?.[col] != null && (
                              <button className="btn icon sm ghost copy-cell-btn" title="Copy" onClick={() => navigator.clipboard.writeText(String(afterData?.[col] ?? ""))}><Icon n="copy" s={10} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={copyAsJson}>
            <Icon n={copied ? "check" : "copy"} s={13} />
            {copied ? "Copied" : "Copy Diff JSON"}
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================ ROW MODAL HISTORY TAB
const RowModalHistoryTab: React.FC<{ tableName: string; pkValue: any }> = ({ tableName, pkValue }) => {
  const { rowHistory } = useChange();
  const [showChangedOnly, setShowChangedOnly] = useState(false);
  const [activeVersionIndex, setActiveVersionIndex] = useState<number>(-1);

  const key = `${tableName}::${pkValue}`;
  const history = rowHistory[key] || [];

  useEffect(() => {
    if (history.length > 0 && activeVersionIndex === -1) {
      setActiveVersionIndex(history.length - 1);
    }
  }, [history, activeVersionIndex]);

  const activeVersion = history[activeVersionIndex] || null;
  const prevVersion = activeVersionIndex > 0 ? history[activeVersionIndex - 1] : null;
  const beforeData = prevVersion ? prevVersion.data : null;
  const afterData = activeVersion ? activeVersion.data : null;
  const operation = activeVersion ? activeVersion.operation : "UPDATE";

  const allColumns = Array.from(new Set([
    ...Object.keys(beforeData || {}),
    ...Object.keys(afterData || {})
  ])).filter(c => c !== "__flash");

  const activeChangedColumns = allColumns.filter(c => {
    const bVal = beforeData ? beforeData[c] : undefined;
    const aVal = afterData ? afterData[c] : undefined;
    return JSON.stringify(bVal) !== JSON.stringify(aVal);
  });

  const renderVal = (v: any) => {
    if (v === null || v === undefined) return <span className="null">—</span>;
    if (typeof v === "object") return <span className="jsonchip">{JSON.stringify(v)}</span>;
    return String(v);
  };

  return (
    <>
      <div className="modal-body" style={{ maxHeight: "none" }}>
        <div className="version-strip-container" style={{ marginTop: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="label">Row Version History</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: "auto" }}>
              {history.length > 0 ? `Version v${activeVersionIndex + 1} of v${history.length}` : "No history recorded"}
            </span>
          </div>
          {history.length === 0 ? (
            <div style={{ fontSize: 11.5, color: "var(--text-faint)", fontStyle: "italic", padding: "6px 0" }}>
              No changes detected for this record yet. Edit fields to create versions.
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <button
                className="pgbtn"
                disabled={activeVersionIndex <= 0}
                onClick={() => setActiveVersionIndex(v => v - 1)}
              >
                <Icon n="chevL" s={13} />
              </button>
              <div className="version-strip-track" style={{ flex: 1 }}>
                <div className="version-strip-line" />
                {history.map((ver, idx) => {
                  const isSelected = activeVersionIndex === idx;
                  return (
                    <div
                      key={idx}
                      className={"version-dot-wrapper " + (isSelected ? "active" : "")}
                      onClick={() => setActiveVersionIndex(idx)}
                    >
                      <div className="version-dot" />
                      <span className="version-dot-label">v{ver.version}</span>
                    </div>
                  );
                })}
              </div>
              <button
                className="pgbtn"
                disabled={activeVersionIndex >= history.length - 1}
                onClick={() => setActiveVersionIndex(v => v + 1)}
              >
                <Icon n="chevR" s={13} />
              </button>
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text)" }}>
                Operation: <span style={{
                  color: operation === "INSERT" ? "var(--green)" : operation === "DELETE" ? "var(--red)" : "var(--amber)",
                  fontWeight: 700
                }}>{operation}</span>
              </span>
              <button
                className={"btn sm " + (showChangedOnly ? "active" : "ghost")}
                onClick={() => setShowChangedOnly(!showChangedOnly)}
                style={{ fontSize: 11, padding: "2px 6px", height: 22 }}
              >
                <Icon n="filter" s={10} />
                <span>Changed Columns Only</span>
              </button>
            </div>
            <table className="grid" style={{ width: "100%", tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th style={{ width: "25%", padding: "6px 8px", fontSize: 11 }}>Column</th>
                  <th style={{ width: "37.5%", padding: "6px 8px", fontSize: 11 }}>Before</th>
                  <th style={{ width: "37.5%", padding: "6px 8px", fontSize: 11 }}>After</th>
                </tr>
              </thead>
              <tbody>
                {allColumns
                  .filter(col => !showChangedOnly || activeChangedColumns.includes(col))
                  .map(col => {
                    const isChanged = activeChangedColumns.includes(col);
                    return (
                      <tr key={col} className={isChanged ? "diff-row-changed" : "diff-row-unchanged"}>
                        <td style={{ padding: "6px 8px 6px 10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text)", fontWeight: 500 }} className="mono">{col}</td>
                        <td style={{ padding: "6px 8px" }} className="mono">
                          <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{renderVal(beforeData?.[col])}</span>
                            {beforeData?.[col] != null && (
                              <button className="btn icon sm ghost copy-cell-btn" title="Copy" onClick={() => navigator.clipboard.writeText(String(beforeData?.[col] ?? ""))}><Icon n="copy" s={10} /></button>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "6px 8px" }} className="mono">
                          <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{renderVal(afterData?.[col])}</span>
                            {isChanged && <span className="diff-cell-indicator" style={{ flexShrink: 0 }}>✦</span>}
                            {afterData?.[col] != null && (
                              <button className="btn icon sm ghost copy-cell-btn" title="Copy" onClick={() => navigator.clipboard.writeText(String(afterData?.[col] ?? ""))}><Icon n="copy" s={10} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};
