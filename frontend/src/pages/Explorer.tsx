import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Loader2, ServerCrash,
  Copy, Minimize, Check,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  ArrowUpDown, Trash2, Edit, Save, AlertTriangle,
  RefreshCw, X, Eye, Inbox, GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Textarea } from "@/components/ui/textarea";
import { useSocket } from "@/context/SocketContext";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/apiFetch";

export default function Explorer() {
  const { socket } = useSocket();
  const { toast } = useToast();
  const { tableName: urlTableName } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [tablesList, setTablesList] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [primaryKey, setPrimaryKey] = useState<string | null>(null);

  const searchQuery = searchParams.get("q") || "";

  // CRUD State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTruncateOpen, setIsTruncateOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [isOperationLoading, setIsOperationLoading] = useState(false);

  // Row Modal State (Preview / Edit / Delete tabs)
  const [isRowModalOpen, setIsRowModalOpen] = useState(false);
  const [rowModalTab, setRowModalTab] = useState<"preview" | "edit" | "delete">("preview");

  const [isZenMode, setIsZenMode] = useState(false);

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const pageRef = useRef(page);
  const pageSizeRef = useRef(pageSize);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { pageSizeRef.current = pageSize; }, [pageSize]);
  const [paginationInfo, setPaginationInfo] = useState<{
    totalRows: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
  } | null>(null);

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: "asc" | "desc" } | null>(null);

  // Column order (drag-and-drop reordering)
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const dragSourceIdx = useRef<number | null>(null);
  const [dragOverColIdx, setDragOverColIdx] = useState<number | null>(null);

  // Column types & filters
  const [columnTypes, setColumnTypes] = useState<Record<string, string>>({});
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);

  // Global Action Listeners
  useEffect(() => {
    const handleAdd = () => { setFormData({}); setIsCreateOpen(true); };
    const handleExportCsv = () => exportData("csv");
    const handleExportJson = () => exportData("json");
    const handleZenToggle = () => setIsZenMode(prev => !prev);
    const handleTruncateTrigger = () => setIsTruncateOpen(true);
    const handleFilterToggle = () => setShowFilters(prev => !prev);

    window.addEventListener('explorer:add', handleAdd);
    window.addEventListener('explorer:export:csv', handleExportCsv);
    window.addEventListener('explorer:export:json', handleExportJson);
    window.addEventListener('explorer:zen:toggle', handleZenToggle);
    window.addEventListener('explorer:truncate', handleTruncateTrigger);
    window.addEventListener('explorer:filter:toggle', handleFilterToggle);

    return () => {
      window.removeEventListener('explorer:add', handleAdd);
      window.removeEventListener('explorer:export:csv', handleExportCsv);
      window.removeEventListener('explorer:export:json', handleExportJson);
      window.removeEventListener('explorer:zen:toggle', handleZenToggle);
      window.removeEventListener('explorer:truncate', handleTruncateTrigger);
      window.removeEventListener('explorer:filter:toggle', handleFilterToggle);
    };
  }, [tablesList, rows, columns]); // Re-bind if data changes for export

  // Derived State
  const filteredRows = useMemo(() => {
    let result = [...rows];

    // Global search filtering
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(row =>
        Object.values(row).some(val => String(val).toLowerCase().includes(query))
      );
    }

    // Column-level filters
    Object.entries(columnFilters).forEach(([col, filterVal]) => {
      if (!filterVal.trim()) return;
      const fv = filterVal.toLowerCase();
      result = result.filter(row => String(row[col] ?? "").toLowerCase().includes(fv));
    });

    // Sorting
    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal === bVal) return 0;
        if (aVal === null) return 1;
        if (bVal === null) return -1;
        const comparison = aVal < bVal ? -1 : 1;
        return sortConfig.direction === "asc" ? comparison : -comparison;
      });
    }

    return result;
  }, [rows, searchQuery, sortConfig, columnFilters]);

  useEffect(() => {
    // Fetch tables via HTTP for initial load performance
    apiFetch("/api/tables")
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        setTablesList(data);
        if (data.length > 0 && !urlTableName) {
          navigate(`/explorer/${data[0]}`, { replace: true });
        }
      })
      .catch(err => setError("Failed to fetch tables: " + err.message));
  }, [urlTableName, navigate]);

  useEffect(() => {
    if (urlTableName) {
      apiFetch(`/api/primary-key/${urlTableName}`)
        .then(res => res.json())
        .then(data => setPrimaryKey(data.primaryKey))
        .catch(console.error);
    }
  }, [urlTableName]);

  useEffect(() => {
    if (urlTableName) {
      apiFetch(`/api/column-types/${urlTableName}`)
        .then(r => r.json())
        .then(data => setColumnTypes(data))
        .catch(console.error);
      setColumnFilters({});
    }
  }, [urlTableName]);

  useEffect(() => {
    if (!socket) return;

    const handleUpdate = (data: any) => {
      if (data.tableName === urlTableName) {
        const cols = data.columns || [];
        setColumns(cols);
        setRows(data.rows || []);
        setPaginationInfo(data.pagination);
        setLastRefreshed(new Date());
        setIsLoading(false);
        setError(null);

        // Set default sort config if not set
        if (!sortConfig && cols.length > 0) {
          const timestampCol = cols.find((c: string) => {
            const lc = c.toLowerCase();
            return lc.includes('created') || lc.includes('updated') || lc.includes('timestamp') || lc.includes('time') || lc.includes('date') || lc === 'dt';
          });
          const idCol = cols.find((c: string) => {
            const lc = c.toLowerCase();
            return lc === 'id' || lc === 'uid' || lc.endsWith('_id');
          });
          setSortConfig({ key: timestampCol || idCol || cols[0], direction: "desc" });
        }
      }
    };

    const handleCrudSuccess = (data: { action: string; tableName: string }) => {
      setIsOperationLoading(false);
      setIsCreateOpen(false);
      setIsRowModalOpen(false);
      setIsTruncateOpen(false);
      const msgs: Record<string, string> = {
        create: "Record created successfully",
        update: "Record updated successfully",
        delete: "Record deleted",
        truncate: "Table truncated",
      };
      toast(msgs[data?.action] || "Operation completed", data?.action === "delete" || data?.action === "truncate" ? "warning" : "success");
      // Force-refresh: re-subscribe so table always shows latest data immediately
      if (urlTableName) {
        socket.emit("subscribe", { tableName: urlTableName, page: pageRef.current, pageSize: pageSizeRef.current });
      }
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
      socket.off("table_update", handleUpdate);
      socket.off("crud_success", handleCrudSuccess);
      socket.off("error", handleError);
    };
  }, [socket, urlTableName, sortConfig]);

  useEffect(() => {
    if (socket && urlTableName) {
      socket.emit("subscribe", { tableName: urlTableName, page, pageSize });
      setIsLoading(true);
    }
  }, [socket, urlTableName, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [urlTableName]);

  useEffect(() => {
    setColumnOrder(columns);
  }, [columns]);

  useEffect(() => {
    if (isZenMode) {
      document.body.classList.add("zen-mode");
    } else {
      document.body.classList.remove("zen-mode");
    }
    return () => document.body.classList.remove("zen-mode");
  }, [isZenMode]);



  const handleColDragStart = (idx: number) => {
    dragSourceIdx.current = idx;
  };

  const handleColDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragSourceIdx.current !== idx) setDragOverColIdx(idx);
  };

  const handleColDrop = (idx: number) => {
    if (dragSourceIdx.current !== null && dragSourceIdx.current !== idx) {
      const newOrder = [...columnOrder];
      const [moved] = newOrder.splice(dragSourceIdx.current, 1);
      newOrder.splice(idx, 0, moved);
      setColumnOrder(newOrder);
    }
    dragSourceIdx.current = null;
    setDragOverColIdx(null);
  };

  const handleColDragEnd = () => {
    dragSourceIdx.current = null;
    setDragOverColIdx(null);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const exportData = (type: "csv" | "json") => {
    if (rows.length === 0) return;

    let content = "";
    let mimeType = "";
    let filename = `export_${urlTableName}_${new Date().toISOString()}`;

    if (type === "json") {
      content = JSON.stringify(rows, null, 2);
      mimeType = "application/json";
      filename += ".json";
    } else {
      const orderedCols = columnOrder.length ? columnOrder : columns;
      const header = orderedCols.join(",");
      const csvRows = rows.map(row =>
        orderedCols.map(c => {
          let val = row[c];
          if (val === null) return "NULL";
          if (typeof val === "object") return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(",")
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

  const formatCellValue = (val: any, prettify = false) => {
    if (val === null || val === undefined) return "NULL";
    if (typeof val === "object") {
      try {
        return JSON.stringify(val, null, prettify ? 2 : 0);
      } catch (e) {
        return String(val);
      }
    }
    
    // Check if string is actually JSON
    if (typeof val === "string" && (val.startsWith("{") || val.startsWith("["))) {
      try {
        const parsed = JSON.parse(val);
        return prettify ? JSON.stringify(parsed, null, 2) : val;
      } catch (e) {
        return val;
      }
    }
    
    return String(val);
  };

  const toggleSort = (key: string) => {
    setSortConfig(prev => {
      const isTimeCol = key.toLowerCase().match(/created|updated|time|date|dt|timestamp/);
      const isIdCol = key.toLowerCase().match(/id|uid/);
      const defaultDir = (isTimeCol || isIdCol) ? "desc" : "asc";

      if (prev?.key === key) {
        if (prev.direction === "desc") return { key, direction: "asc" };
        if (prev.direction === "asc" && defaultDir === "asc") return { key, direction: "desc" };
        return null;
      }
      return { key, direction: defaultDir };
    });
  };

  const handleDelete = () => {
    if (!socket || !activeRow || !primaryKey) return;
    setIsOperationLoading(true);
    socket.emit("delete_row", { 
      tableName: urlTableName, 
      primaryKey, 
      pkValue: activeRow[primaryKey] 
    });
  };

  const handleTruncate = () => {
    if (!socket || !urlTableName) return;
    setIsOperationLoading(true);
    socket.emit("truncate_table", { tableName: urlTableName });
  };

  const performUpdate = () => {
    if (!socket || !activeRow || !primaryKey) {
      toast("Cannot save: missing connection or row data", "error");
      return;
    }

    const updates: Record<string, any> = {};
    Object.entries(formData).forEach(([key, value]) => {
      if (key === primaryKey) return;
      const colType = (columnTypes[key] || "").toLowerCase();
      let castVal: any = value;
      if (value === "" || value === null || value === undefined) {
        castVal = null;
      } else if (colType === "boolean") {
        castVal = value === true || value === "true";
      } else if (/^(integer|bigint|smallint|int4|int8|int2)/.test(colType)) {
        const n = parseInt(String(value), 10);
        castVal = isNaN(n) ? null : n;
      } else if (/^(numeric|decimal|real|double precision|float4|float8)/.test(colType)) {
        const n = parseFloat(String(value));
        castVal = isNaN(n) ? null : n;
      } else if (colType === "json" || colType === "jsonb") {
        try { castVal = JSON.parse(String(value)); } catch { castVal = value; }
      } else {
        castVal = value;
      }
      updates[key] = castVal;
    });

    if (Object.keys(updates).length === 0) {
      toast("No fields to update", "warning");
      return;
    }

    setIsOperationLoading(true);
    socket.emit("update_row", {
      tableName: urlTableName,
      primaryKey,
      pkValue: activeRow[primaryKey],
      updates,
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    performUpdate();
  };

  const performCreate = () => {
    if (!socket || !urlTableName) return;
    setIsOperationLoading(true);
    socket.emit("create_row", { tableName: urlTableName, data: formData });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    performCreate();
  };

  const CellPreview = ({ val }: { val: any }) => {
    const isNull = val === null || val === undefined;
    const isJson = !isNull && (
      typeof val === "object" ||
      (typeof val === "string" && (val.startsWith("{") || val.startsWith("[")))
    );

    if (isNull) {
      return <span className="font-mono text-[11px] text-muted-foreground/25 select-none">—</span>;
    }
    if (isJson) {
      const chip = typeof val === "object"
        ? (Array.isArray(val) ? "[…]" : "{…}")
        : (val.startsWith("[") ? "[…]" : "{…}");
      return (
        <span className="font-mono text-[10px] text-muted-foreground/50 bg-muted/40 px-1.5 py-0.5 rounded border border-foreground/5">
          {chip}
        </span>
      );
    }
    const strVal = String(val);
    return (
      <span
        title={strVal.length > 60 ? strVal : undefined}
        className="font-mono text-[11px] tracking-tight text-foreground/80 truncate block max-w-60 selection:bg-primary/30"
      >
        {strVal}
      </span>
    );
  };

  const TableSkeleton = () => (
    <div className="space-y-4">
      <div className="flex gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 flex-1 rounded-xl bg-muted/20" />
        ))}
      </div>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: 6 }).map((_, j) => (
            <Skeleton key={j} className="h-12 flex-1 opacity-40 rounded-xl bg-muted/10" />
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-background min-h-0 overflow-hidden">
      {/* Main Table View Area - Full Screen Fill */}
      <div className="flex-1 flex flex-col min-h-0 bg-background relative overflow-hidden">
        {error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 opacity-50 space-y-4">
            <ServerCrash className="size-16 text-destructive stroke-1" />
            <p className="text-sm font-black uppercase tracking-[0.2em]">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()} className="rounded-full px-8 h-12 uppercase text-[10px] font-black tracking-widest gap-3">
              <RefreshCw className="size-4" />
              Reload
            </Button>
          </div>
        ) : isLoading ? (
          <div className="p-8">
            <TableSkeleton />
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-auto h-0">
              <Table>
                  <TableHeader className="bg-background/80 backdrop-blur-xl border-b shadow-sm sticky top-0 z-50">
                    <TableRow className="border-none hover:bg-transparent">
                      <TableHead className="px-6 py-5 w-14 text-[10px] font-black text-muted-foreground/30">
                        #
                      </TableHead>
                      {columnOrder.map((col, idx) => (
                        <TableHead
                          key={col}
                          draggable
                          onDragStart={() => handleColDragStart(idx)}
                          onDragOver={(e) => handleColDragOver(e, idx)}
                          onDrop={() => handleColDrop(idx)}
                          onDragEnd={handleColDragEnd}
                          onClick={() => toggleSort(col)}
                          className={cn(
                            "px-6 py-3 cursor-pointer group whitespace-nowrap select-none transition-colors",
                            dragOverColIdx === idx && "border-l-2 border-primary bg-primary/5"
                          )}
                        >
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <GripVertical className="size-3 shrink-0 opacity-0 group-hover:opacity-20 cursor-grab active:cursor-grabbing -ml-1" />
                              <span className="text-[10px] font-black uppercase tracking-[0.2em] group-hover:text-foreground transition-colors">
                                {col}
                              </span>
                              {sortConfig?.key === col ? (
                                sortConfig.direction === "asc"
                                  ? <ChevronUp className="size-3 text-primary shrink-0" />
                                  : <ChevronDown className="size-3 text-primary shrink-0" />
                              ) : (
                                <ArrowUpDown className="size-3 opacity-0 group-hover:opacity-30 transition-opacity shrink-0" />
                              )}
                              {primaryKey === col && (
                                <span className="text-[8px] font-mono text-primary/50 bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10 uppercase leading-none">PK</span>
                              )}
                            </div>
                            {columnTypes[col] && (
                              <span className="text-[8px] font-mono text-muted-foreground/30 uppercase">{columnTypes[col]}</span>
                            )}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                    {showFilters && (
                      <TableRow className="border-none hover:bg-transparent bg-muted/10">
                        <TableHead className="px-6 py-2 w-14">
                          <Button variant="ghost" size="sm" className="h-7 text-[9px] font-black uppercase tracking-widest opacity-50 hover:opacity-100" onClick={() => setColumnFilters({})}>Clear</Button>
                        </TableHead>
                        {columnOrder.map((col) => (
                          <TableHead key={col} className="px-3 py-2">
                            <Input
                              placeholder={`Filter ${col}...`}
                              value={columnFilters[col] || ""}
                              onChange={e => setColumnFilters(prev => ({ ...prev, [col]: e.target.value }))}
                              onClick={e => e.stopPropagation()}
                              className="h-7 text-[10px] font-mono bg-muted/20 border-foreground/10 rounded-lg px-2 w-full min-w-20"
                            />
                          </TableHead>
                        ))}
                      </TableRow>
                    )}
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow className="hover:bg-transparent border-none">
                        <TableCell colSpan={columns.length + 1} className="h-64 text-center border-none">
                          <div className="flex flex-col items-center gap-3 text-muted-foreground/30">
                            <Inbox className="size-10 stroke-1" />
                            <p className="text-sm font-black uppercase tracking-widest">No rows</p>
                            {(searchQuery || Object.values(columnFilters).some(v => v)) && (
                              <p className="text-xs font-normal normal-case tracking-normal opacity-70">Try clearing your filters</p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredRows.map((row, index) => (
                      <TableRow
                        key={index}
                        className="group border-b border-border hover:bg-muted/10 transition-colors duration-150 cursor-pointer"
                        onClick={() => {
                          setActiveRow(row);
                          setFormData(row);
                          setRowModalTab("preview");
                          setIsRowModalOpen(true);
                        }}
                      >
                        <TableCell className="px-6 py-4 w-14">
                          <span className="font-mono text-[10px] text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors tabular-nums">
                            {((page - 1) * pageSize + index + 1).toLocaleString()}
                          </span>
                        </TableCell>
                        {columnOrder.map((col) => (
                          <TableCell key={col} className="px-6 py-4">
                            <CellPreview val={row[col]} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
            </div>
          </div>
        )}
      </div>

      {/* Footer Status Bar - Compact & Simple */}
      <div className="h-10 border-t bg-muted/5 px-6 flex items-center justify-between shrink-0 z-40 relative zen-hide">
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-mono text-muted-foreground/50">
            {paginationInfo ? (
              <>Showing {((paginationInfo.currentPage - 1) * paginationInfo.pageSize + 1).toLocaleString()}–{Math.min(paginationInfo.currentPage * paginationInfo.pageSize, paginationInfo.totalRows).toLocaleString()} of {paginationInfo.totalRows.toLocaleString()} rows</>
            ) : "No data"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            className="size-7 rounded-lg opacity-40 hover:opacity-100 disabled:opacity-10"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>

          <div className="flex items-center gap-1 mx-2">
            {(() => {
              const total = paginationInfo?.totalPages ?? 0;
              if (total === 0) return null;
              const half = 2;
              let start = Math.max(1, page - half);
              let end = Math.min(total, start + 4);
              if (end - start < 4) start = Math.max(1, end - 4);
              return Array.from({ length: end - start + 1 }, (_, i) => start + i).map(p => (
                <Button
                  key={p}
                  variant={page === p ? "secondary" : "ghost"}
                  size="icon"
                  className="size-7 rounded-lg text-[9px] font-black"
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              ));
            })()}
          </div>

          <Button 
            variant="ghost" 
            size="icon" 
            className="size-7 rounded-lg opacity-40 hover:opacity-100 disabled:opacity-10"
            disabled={page >= (paginationInfo?.totalPages ?? 1)}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-4 opacity-30 text-[8px] font-black uppercase tracking-widest">
          Refreshed: {lastRefreshed.toLocaleTimeString()}
        </div>

        <div className="flex items-center gap-3 border-l pl-6 border-muted-foreground/10">
          <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/30">Density</span>
          <Select 
            value={String(pageSize)} 
            onValueChange={(val) => {
              setPageSize(Number(val));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-6 w-20 bg-transparent border-none text-[10px] font-black uppercase hover:bg-foreground/5 transition-all">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-foreground/10 bg-background/95 backdrop-blur-xl">
              <SelectItem value="50" className="text-[9px] font-black uppercase tracking-widest cursor-pointer px-4">50 Rows</SelectItem>
              <SelectItem value="100" className="text-[9px] font-black uppercase tracking-widest cursor-pointer px-4">100 Rows</SelectItem>
              <SelectItem value="200" className="text-[9px] font-black uppercase tracking-widest cursor-pointer px-4">200 Rows</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Floating Zen Mode Exit Button */}
      {isZenMode && (
        <motion.div 
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-200"
        >
          <Button 
            onClick={() => setIsZenMode(false)}
            className="h-12 px-8 rounded-full bg-foreground text-background font-black uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all gap-3"
          >
            <Minimize className="size-4" />
            Exit Zen Mode
          </Button>
        </motion.div>
      )}

      {/* CRUD Modals */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-4xl w-full max-h-[90vh] flex flex-col p-0 bg-background border-foreground/10 rounded-2xl overflow-hidden shadow-2xl" showCloseButton={false}>
          <div className="px-8 py-5 border-b bg-muted/5 flex items-center justify-between shrink-0">
            <DialogHeader className="p-0">
              <DialogTitle className="text-xl font-black uppercase tracking-tighter">New Row</DialogTitle>
              <DialogDescription className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-40">Insert a new record into {urlTableName}</DialogDescription>
            </DialogHeader>
            <Button variant="ghost" size="icon" onClick={() => setIsCreateOpen(false)} className="rounded-xl size-9 hover:bg-foreground/5">
              <X className="size-5" />
            </Button>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <form id="create-form" onSubmit={handleCreate} className="p-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              {columns.map((col) => (
                <div key={col} className="space-y-2.5 group">
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/60 group-focus-within:text-foreground transition-colors">{col}</Label>
                    {columnTypes[col] && (
                      <span className="text-[8px] font-mono text-muted-foreground/30 bg-muted/40 px-1.5 py-0.5 rounded border border-foreground/5 uppercase">{columnTypes[col]}</span>
                    )}
                    {primaryKey === col && (
                      <span className="text-[8px] font-mono text-primary/50 bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10 uppercase">PK</span>
                    )}
                  </div>
                  <Input
                    className="h-11 bg-muted/20 border-transparent focus:border-foreground/10 focus:bg-background rounded-xl px-4 font-mono text-sm transition-all"
                    placeholder={`Enter ${col.toLowerCase()}...`}
                    value={formData[col] || ""}
                    onChange={(e) => setFormData({ ...formData, [col]: e.target.value })}
                  />
                </div>
              ))}
            </form>
          </ScrollArea>

          <div className="px-8 py-5 border-t bg-muted/5 flex items-center justify-end gap-3 shrink-0">
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)} className="h-11 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] opacity-50 hover:opacity-100">Cancel</Button>
            <Button
              type="button"
              onClick={performCreate}
              disabled={isOperationLoading}
              className="h-11 px-8 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-black uppercase tracking-widest text-[10px] shadow-lg flex items-center gap-2.5 active:scale-95 transition-all"
            >
              {isOperationLoading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Row
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Row Modal — Preview / Edit / Delete tabs */}
      <Dialog open={isRowModalOpen} onOpenChange={setIsRowModalOpen}>
        <DialogContent className="w-screen h-screen max-w-none max-h-none flex flex-col p-0 bg-background border-0 rounded-none overflow-hidden" showCloseButton={false}>
          <DialogTitle className="sr-only">{urlTableName}</DialogTitle>
          <Tabs
            value={rowModalTab}
            onValueChange={(val) => setRowModalTab(val as "preview" | "edit" | "delete")}
            className="flex flex-col flex-1 min-h-0"
          >
            {/* Combined header + tabs row */}
            <div className="p-6 border-b bg-muted/5 flex items-center justify-between shrink-0">
              <TabsList variant="line" className="gap-6 h-auto p-0 bg-transparent w-auto rounded-none">
                <TabsTrigger value="preview" className="gap-2 py-4 rounded-none text-[11px] font-black uppercase tracking-widest border-b-2 border-transparent data-active:border-foreground data-active:text-foreground">
                  <Eye className="size-3.5" />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="edit" className="gap-2 py-4 rounded-none text-[11px] font-black uppercase tracking-widest border-b-2 border-transparent data-active:border-foreground data-active:text-foreground">
                  <Edit className="size-3.5" />
                  Edit
                </TabsTrigger>
                <TabsTrigger value="delete" className="gap-2 py-4 rounded-none text-[11px] font-black uppercase tracking-widest border-b-2 border-transparent data-active:border-destructive data-active:text-destructive">
                  <Trash2 className="size-3.5" />
                  Delete
                </TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-foreground/5 border border-foreground/10 px-3 py-1.5 rounded-lg text-foreground/70">
                  {urlTableName}
                </span>
                {primaryKey && activeRow && (
                  <span className="text-[9px] font-mono text-muted-foreground/40 bg-muted/30 border border-foreground/5 px-2.5 py-1.5 rounded-lg">
                    {primaryKey} = {activeRow[primaryKey]}
                  </span>
                )}
                <Button variant="ghost" size="icon" onClick={() => setIsRowModalOpen(false)} className="rounded-xl size-9 hover:bg-foreground/5 ml-1">
                  <X className="size-5" />
                </Button>
              </div>
            </div>

            {/* Preview Tab */}
            <TabsContent value="preview" className="flex-1 min-h-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-8 max-w-5xl mx-auto">
                  <div className="flex items-center justify-end mb-4">
                    <Button
                      onClick={() => copyToClipboard(formatCellValue(activeRow, true), 'row-preview')}
                      variant="outline"
                      className="h-9 px-4 rounded-lg font-black uppercase tracking-widest text-[10px] gap-2 border-foreground/10 hover:bg-muted transition-all"
                    >
                      {copiedId === 'row-preview' ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5 opacity-40" />}
                      Copy JSON
                    </Button>
                  </div>
                  <div className="bg-muted/20 rounded-xl p-6 border border-foreground/5">
                    <pre className="font-mono text-xs leading-relaxed selection:bg-primary/30 whitespace-pre-wrap break-all">
                      {activeRow ? formatCellValue(activeRow, true) : ""}
                    </pre>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Edit Tab */}
            <TabsContent value="edit" className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <ScrollArea className="flex-1 min-h-0">
                <form
                  id="edit-form"
                  onSubmit={handleUpdate}
                  className="p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6 max-w-7xl mx-auto w-full"
                >
                  {columns.map((col) => {
                    const colType = (columnTypes[col] || "").toLowerCase();
                    const isPK = primaryKey === col;
                    const isBool = colType === "boolean";
                    const isNumeric = /^(integer|bigint|smallint|int4|int8|int2|numeric|decimal|real|double precision|float4|float8)/.test(colType);
                    const isJson = colType === "json" || colType === "jsonb";
                    const isLongText = colType === "text" || (typeof formData[col] === "string" && (formData[col] as string).length > 80);
                    const rawVal = formData[col];
                    const displayVal = rawVal === null || rawVal === undefined ? "" : typeof rawVal === "object" ? JSON.stringify(rawVal, null, 2) : String(rawVal);
                    const isModified = JSON.stringify(formData[col]) !== JSON.stringify(activeRow?.[col]);
                    const isWide = isJson || isLongText;

                    return (
                      <div
                        key={col}
                        className={cn(
                          "space-y-2.5 group",
                          isPK && "opacity-50",
                          isWide && "sm:col-span-2 lg:col-span-2"
                        )}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Label className={cn(
                            "text-[10px] font-black uppercase tracking-[0.2em] transition-colors",
                            isModified && !isPK ? "text-amber-400" : "text-muted-foreground/50 group-focus-within:text-foreground"
                          )}>
                            {col}
                          </Label>
                          {columnTypes[col] && (
                            <span className="text-[8px] font-mono text-muted-foreground/30 bg-muted/40 px-1.5 py-0.5 rounded border border-foreground/5 uppercase">
                              {columnTypes[col]}
                            </span>
                          )}
                          {isPK && (
                            <span className="text-[8px] font-mono text-primary/60 bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10 uppercase">
                              PK · read-only
                            </span>
                          )}
                          {isModified && !isPK && (
                            <span className="text-[8px] font-mono text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20 uppercase">
                              modified
                            </span>
                          )}
                        </div>

                        {isPK ? (
                          <Input
                            readOnly
                            className="h-11 bg-transparent border-foreground/5 rounded-xl px-4 font-mono text-sm cursor-not-allowed select-none"
                            value={displayVal}
                          />
                        ) : isBool ? (
                          <Select
                            value={rawVal === null || rawVal === undefined ? "__null__" : String(rawVal)}
                            onValueChange={(v) => setFormData((prev: any) => ({ ...prev, [col]: v === "__null__" ? null : v === "true" }))}
                          >
                            <SelectTrigger className="h-11 bg-muted/20 border-transparent focus:border-foreground/10 rounded-xl font-mono text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-foreground/10 bg-background/95 backdrop-blur-xl">
                              <SelectItem value="true" className="font-mono text-sm cursor-pointer">true</SelectItem>
                              <SelectItem value="false" className="font-mono text-sm cursor-pointer">false</SelectItem>
                              <SelectItem value="__null__" className="font-mono text-sm text-muted-foreground cursor-pointer">NULL</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : isJson || isLongText ? (
                          <Textarea
                            className="min-h-28 bg-muted/20 border-transparent focus:border-foreground/10 focus:bg-background rounded-xl px-4 py-3 font-mono text-xs transition-all resize-y"
                            value={displayVal}
                            onChange={(e) => setFormData((prev: any) => ({ ...prev, [col]: e.target.value }))}
                            placeholder={rawVal === null ? "NULL — leave empty to set null" : undefined}
                          />
                        ) : (
                          <Input
                            type={isNumeric ? "number" : "text"}
                            className="h-11 bg-muted/20 border-transparent focus:border-foreground/10 focus:bg-background rounded-xl px-4 font-mono text-sm transition-all"
                            value={displayVal}
                            onChange={(e) => setFormData((prev: any) => ({ ...prev, [col]: e.target.value }))}
                            placeholder={rawVal === null ? "NULL" : undefined}
                          />
                        )}
                      </div>
                    );
                  })}
                </form>
              </ScrollArea>
              <div className="px-8 py-5 border-t bg-muted/5 flex items-center justify-between shrink-0">
                <span className="text-[10px] font-mono text-muted-foreground/30">
                  {Object.keys(formData).filter(k => k !== primaryKey && JSON.stringify(formData[k]) !== JSON.stringify(activeRow?.[k])).length} field(s) modified
                </span>
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => setIsRowModalOpen(false)}
                    className="h-11 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] opacity-50 hover:opacity-100"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={performUpdate}
                    disabled={isOperationLoading}
                    className="h-11 px-8 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-black uppercase tracking-widest text-[10px] shadow-lg flex items-center gap-2.5 active:scale-95 transition-all"
                  >
                    {isOperationLoading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Save Changes
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Delete Tab */}
            <TabsContent value="delete" className="flex-1 min-h-0 flex items-center justify-center p-8">
              <div className="flex flex-col items-center text-center gap-6 max-w-sm w-full">
                <div className="size-16 rounded-2xl bg-destructive/10 flex items-center justify-center border border-destructive/20">
                  <AlertTriangle className="size-8 text-destructive" />
                </div>
                <div className="space-y-2">
                  <p className="text-xl font-black uppercase tracking-tighter">Delete Row</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Permanently delete this record from <strong className="text-foreground">{urlTableName}</strong>? This cannot be undone.
                  </p>
                  {primaryKey && activeRow && (
                    <p className="text-[10px] font-mono text-muted-foreground/50 mt-1">{primaryKey} = {activeRow[primaryKey]}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 w-full">
                  <Button
                    variant="outline"
                    onClick={() => setIsRowModalOpen(false)}
                    className="flex-1 h-11 rounded-xl font-black uppercase tracking-widest text-[10px] border-foreground/10"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDelete}
                    disabled={isOperationLoading}
                    className="flex-1 h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    {isOperationLoading ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    Delete
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={isTruncateOpen} onOpenChange={setIsTruncateOpen}>
        <DialogContent className="max-w-none w-screen h-screen top-0 flex flex-col p-0 bg-background/40 backdrop-blur-3xl border-none rounded-none overflow-hidden shadow-2xl" showCloseButton={false}>
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center max-w-2xl mx-auto">
            <div className="size-24 rounded-full bg-destructive/10 flex items-center justify-center mb-8 border border-destructive/20 shadow-[0_0_50px_-10px_rgba(239,68,68,0.3)]">
              <AlertTriangle className="size-10 text-destructive animate-pulse" />
            </div>
            <DialogHeader className="p-0 text-center">
              <DialogTitle className="text-4xl font-black uppercase tracking-tighter mb-4">Truncate Table</DialogTitle>
              <DialogDescription className="text-sm font-bold uppercase tracking-[0.2em] opacity-60 leading-relaxed">
                CRITICAL: You are about to <span className="text-destructive font-black underline">TRUNCATE</span> all data from <span className="text-foreground border-b border-foreground/20">{urlTableName}</span>. This will permanently remove <span className="font-black text-foreground">{paginationInfo?.totalRows}</span> records.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-12 flex items-center gap-4 w-full">
              <Button 
                variant="ghost" 
                onClick={() => setIsTruncateOpen(false)} 
                className="flex-1 h-16 rounded-2xl font-black uppercase tracking-widest opacity-40 hover:opacity-100 hover:bg-foreground/5 transition-all"
              >
                Cancel
              </Button>
              <Button
                onClick={handleTruncate}
                disabled={isOperationLoading}
                className="flex-1 h-16 rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-black uppercase tracking-widest shadow-2xl shadow-destructive/20 flex items-center gap-3 active:scale-95 transition-all border border-destructive/50"
              >
                {isOperationLoading ? <Loader2 className="size-5 animate-spin" /> : <X className="size-5" />}
                Truncate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
