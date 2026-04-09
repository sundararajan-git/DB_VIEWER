import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Loader2, ServerCrash, 
  Copy, Maximize2, Minimize, Check,
  ChevronLeft, ChevronRight,
  ArrowUpDown, Trash2, Edit, Save, AlertTriangle,
  RefreshCw, X,
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Textarea } from "@/components/ui/textarea";
import { useSocket } from "@/context/SocketContext";

export default function Explorer() {
  const { socket } = useSocket();
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
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isTruncateOpen, setIsTruncateOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [isOperationLoading, setIsOperationLoading] = useState(false);

  // Preview State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{
    val: any;
    colName: string;
    rowIndex: number;
    cellId: string;
  } | null>(null);

  const [isZenMode, setIsZenMode] = useState(false);

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [paginationInfo, setPaginationInfo] = useState<{
    totalRows: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
  } | null>(null);

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: "asc" | "desc" } | null>(null);

  // Global Action Listeners
  useEffect(() => {
    const handleAdd = () => { setFormData({}); setIsCreateOpen(true); };
    const handleExportCsv = () => exportData("csv");
    const handleZenToggle = () => setIsZenMode(prev => !prev);
    const handleTruncateTrigger = () => setIsTruncateOpen(true);

    window.addEventListener('explorer:add', handleAdd);
    window.addEventListener('explorer:export:csv', handleExportCsv);
    window.addEventListener('explorer:zen:toggle', handleZenToggle);
    window.addEventListener('explorer:truncate', handleTruncateTrigger);

    return () => {
      window.removeEventListener('explorer:add', handleAdd);
      window.removeEventListener('explorer:export:csv', handleExportCsv);
      window.removeEventListener('explorer:zen:toggle', handleZenToggle);
      window.removeEventListener('explorer:truncate', handleTruncateTrigger);
    };
  }, [tablesList, rows, columns]); // Re-bind if data changes for export

  // Derived State
  const filteredRows = useMemo(() => {
    let result = [...rows];

    // Search Filtering
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(row => 
        Object.values(row).some(val => 
          String(val).toLowerCase().includes(query)
        )
      );
    }

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
  }, [rows, searchQuery, sortConfig]);

  useEffect(() => {
    // Fetch tables via HTTP for initial load performance
    fetch("/api/tables")
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
      fetch(`/api/primary-key/${urlTableName}`)
        .then(res => res.json())
        .then(data => setPrimaryKey(data.primaryKey))
        .catch(console.error);
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

    const handleCrudSuccess = () => {
      setIsOperationLoading(false);
      setIsCreateOpen(false);
      setIsEditOpen(false);
      setIsDeleteOpen(false);
      // Small toast or notification could go here
    };

    const handleError = (msg: string) => {
      setError(msg);
      setIsLoading(false);
      setIsOperationLoading(false);
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
    if (isZenMode) {
      document.body.classList.add("zen-mode");
    } else {
      document.body.classList.remove("zen-mode");
    }
    return () => document.body.classList.remove("zen-mode");
  }, [isZenMode]);



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
      const header = columns.join(",");
      const csvRows = rows.map(row => 
        columns.map(c => {
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

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !activeRow || !primaryKey) return;
    setIsOperationLoading(true);
    socket.emit("update_row", {
      tableName: urlTableName,
      primaryKey,
      pkValue: activeRow[primaryKey],
      updates: formData
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !urlTableName) return;
    setIsOperationLoading(true);
    socket.emit("create_row", {
      tableName: urlTableName,
      data: formData
    });
  };

  const CellPreview = ({ val }: { val: any }) => {
    return (
      <div className="group/cell relative max-w-full overflow-hidden">
        <span className={cn(
          "font-mono text-[11px] tracking-tight selection:bg-primary/30 line-clamp-2 break-all",
          val === null ? "text-muted-foreground/30 italic" : "text-foreground/80"
        )}>
          {formatCellValue(val)}
        </span>
      </div>
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
    <div className="flex-1 flex flex-col bg-background">
      {/* Main Table View Area - Full Screen Fill */}
      <div className="flex-1 flex flex-col min-h-0 bg-background relative">
        {error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 opacity-50 space-y-4">
            <ServerCrash className="size-16 text-destructive stroke-[1]" />
            <p className="text-sm font-black uppercase tracking-[0.2em]">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()} className="rounded-full px-8 h-12 uppercase text-[10px] font-black tracking-widest gap-3">
              <RefreshCw className="size-4" />
              Reconnect Cluster
            </Button>
          </div>
        ) : isLoading ? (
          <div className="p-8">
            <TableSkeleton />
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="flex-1">
              <ScrollArea className="w-full h-full">
                <Table>
                  <TableHeader className="bg-background/80 backdrop-blur-xl border-b shadow-sm sticky top-0 z-50">
                    <TableRow className="border-none hover:bg-transparent">
                      <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
                        Snapshot
                      </TableHead>
                      {columns.map((col) => (
                        <TableHead 
                          key={col} 
                          className="px-6 py-5 cursor-pointer group whitespace-nowrap"
                          onClick={() => toggleSort(col)}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] group-hover:text-foreground transition-colors">
                              {col}
                            </span>
                            <ArrowUpDown className={cn(
                              "size-3 transition-all opacity-0 group-hover:opacity-30",
                              sortConfig?.key === col && "opacity-100 text-primary"
                            )} />
                            {sortConfig?.key === col && (
                              <Badge variant="secondary" className="text-[7px] font-black px-1.5 py-0 rounded-md bg-primary/10 text-primary border-none uppercase tracking-tighter">
                                {sortConfig.direction}
                              </Badge>
                            )}
                            {primaryKey === col && !sortConfig?.key && (
                              <Badge variant="outline" className="text-[7px] py-0 px-1.5 opacity-30 border-primary/20 text-primary">PK</Badge>
                            )}
                          </div>
                        </TableHead>
                      ))}
                      <TableHead className="sticky right-0 z-40 bg-background border-l px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-center">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row, index) => (
                      <TableRow 
                        key={index} 
                        className="group border-b border-muted-foreground/5 hover:bg-muted/15 transition-colors duration-200"
                      >
                        <TableCell className="px-8 py-4">
                          <Badge variant="outline" className="font-mono text-[9px] opacity-20 group-hover:opacity-100 transition-opacity rounded-md border-foreground/10 px-2 py-0.5">
                            {String((paginationInfo?.totalRows ?? rows.length) - ((page - 1) * pageSize) - index).padStart(3, '0')}
                          </Badge>
                        </TableCell>
                        {columns.map((col) => (
                          <TableCell 
                            key={col} 
                            className="px-6 py-4 cursor-pointer"
                            onClick={() => {
                              setPreviewData({ val: row[col], colName: col, rowIndex: index, cellId: `${index}-${col}` });
                              setIsPreviewOpen(true);
                            }}
                          >
                            <CellPreview val={row[col]} />
                          </TableCell>
                        ))}
                        <TableCell className="sticky right-0 z-30 bg-background border-l px-4 py-4">
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="size-8 rounded-xl hover:bg-primary/10 hover:text-primary transition-all border border-transparent hover:border-primary/20"
                              onClick={() => {
                                setFormData(row);
                                setActiveRow(row);
                                setIsEditOpen(true);
                              }}
                            >
                              <Edit className="size-4" />
                            </Button>
                            
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="size-8 rounded-xl hover:bg-destructive/10 hover:text-destructive transition-all border border-transparent hover:border-destructive/20"
                              onClick={() => {
                                setActiveRow(row);
                                setIsDeleteOpen(true);
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>

                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="size-8 rounded-xl hover:bg-foreground/5 transition-all border border-transparent hover:border-foreground/10"
                              onClick={() => {
                                setPreviewData({ val: row, colName: 'Preview', rowIndex: index, cellId: `row-${index}` });
                                setIsPreviewOpen(true);
                              }}
                            >
                              <Maximize2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          </div>
        )}
      </div>

      {/* Footer Status Bar - Compact & Simple */}
      <div className="h-10 border-t bg-muted/5 px-6 flex items-center justify-between flex-shrink-0 z-40 relative zen-hide">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/30">Total</span>
              <span className="text-[10px] font-mono font-bold text-foreground/40">{paginationInfo?.totalRows ?? 0}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/30">Page</span>
              <span className="text-[10px] font-mono font-bold text-foreground/40">{paginationInfo?.currentPage ?? 1} / {paginationInfo?.totalPages ?? 1}</span>
            </div>
          </div>
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
            {Array.from({ length: Math.min(5, paginationInfo?.totalPages ?? 0) }).map((_, i) => {
              const p = i + 1;
              return (
                <Button
                  key={p}
                  variant={page === p ? "secondary" : "ghost"}
                  size="icon"
                  className="size-7 rounded-lg text-[9px] font-black"
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              );
            })}
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
            <SelectTrigger className="h-6 w-[80px] bg-transparent border-none text-[10px] font-black uppercase hover:bg-foreground/5 transition-all">
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
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200]"
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

      {/* CRUD Modals - Full Screen Immersive Experience */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-none w-screen h-screen top-0 flex flex-col p-0 bg-background border-none rounded-none overflow-hidden shadow-2xl" showCloseButton={false}>
          <div className="px-10 py-8 border-b bg-muted/5 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <DialogHeader className="p-0">
                <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Forge Entry</DialogTitle>
                <DialogDescription className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-40">Constructing new record for {urlTableName}</DialogDescription>
              </DialogHeader>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsCreateOpen(false)} className="rounded-full size-12 hover:bg-foreground/5">
              <X className="size-6" />
            </Button>
          </div>
          
          <ScrollArea className="flex-1 min-h-0 px-10">
            <form id="create-form" onSubmit={handleCreate} className="py-12 max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
              {columns.map((col) => (
                <div key={col} className="space-y-4 group">
                  <Label className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/60 group-focus-within:text-foreground transition-colors">{col}</Label>
                  <Input
                    className="h-14 bg-muted/20 border-transparent focus:border-foreground/10 focus:bg-background rounded-2xl px-6 font-mono text-sm transition-all shadow-sm"
                    placeholder={`Define ${col.toLowerCase()}...`}
                    value={formData[col] || ""}
                    onChange={(e) => setFormData({ ...formData, [col]: e.target.value })}
                  />
                </div>
              ))}
            </form>
            <div className="h-24" />
          </ScrollArea>

          <div className="px-10 py-8 border-t bg-muted/5 flex items-center justify-end gap-4">
             <Button variant="ghost" onClick={() => setIsCreateOpen(false)} className="h-14 px-8 rounded-2xl font-black uppercase tracking-widest opacity-40 hover:opacity-100">Cancel</Button>
             <Button 
                form="create-form" 
                disabled={isOperationLoading} 
                className="h-14 px-10 rounded-2xl bg-foreground text-background hover:bg-foreground/90 font-black uppercase tracking-widest shadow-xl flex items-center gap-3 active:scale-95 transition-all"
              >
                {isOperationLoading ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
                Persist Record
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-none w-screen h-screen top-0 flex flex-col p-0 bg-background border-none rounded-none overflow-hidden shadow-2xl" showCloseButton={false}>
          <div className="px-10 py-8 border-b bg-muted/5 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <DialogHeader className="p-0">
                <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Refine Record</DialogTitle>
                <DialogDescription className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-40">Modifying internal matrix for {urlTableName}</DialogDescription>
              </DialogHeader>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsEditOpen(false)} className="rounded-full size-12 hover:bg-foreground/5">
              <X className="size-6" />
            </Button>
          </div>
          
          <ScrollArea className="flex-1 min-h-0 px-10">
            <form id="edit-form" onSubmit={handleUpdate} className="py-12 max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
              {columns.map((col) => (
                <div key={col} className="space-y-4 group">
                  <Label className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/60 group-focus-within:text-foreground transition-colors">{col}</Label>
                  {typeof formData[col] === 'string' && formData[col].length > 100 ? (
                    <Textarea 
                      className="min-h-[150px] bg-muted/20 border-transparent focus:border-foreground/10 focus:bg-background rounded-2xl px-6 py-4 font-mono text-sm transition-all shadow-sm"
                      value={formData[col] || ""}
                      onChange={(e) => setFormData({ ...formData, [col]: e.target.value })}
                    />
                  ) : (
                    <Input
                      className="h-14 bg-muted/20 border-transparent focus:border-foreground/10 focus:bg-background rounded-2xl px-6 font-mono text-sm transition-all shadow-sm"
                      value={formData[col] === null ? "" : formData[col]}
                      onChange={(e) => setFormData({ ...formData, [col]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </form>
            <div className="h-24" />
          </ScrollArea>

          <div className="px-10 py-8 border-t bg-muted/5 flex items-center justify-end gap-4">
             <Button variant="ghost" onClick={() => setIsEditOpen(false)} className="h-14 px-8 rounded-2xl font-black uppercase tracking-widest opacity-40 hover:opacity-100">Cancel</Button>
             <Button 
                form="edit-form" 
                disabled={isOperationLoading} 
                className="h-14 px-10 rounded-2xl bg-foreground text-background hover:bg-foreground/90 font-black uppercase tracking-widest shadow-xl flex items-center gap-3 active:scale-95 transition-all"
              >
                {isOperationLoading ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
                Sync Changes
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-none w-screen h-screen top-0 flex flex-col p-0 bg-background/40 backdrop-blur-3xl border-none rounded-none overflow-hidden shadow-2xl" showCloseButton={false}>
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center max-w-2xl mx-auto">
            <div className="size-24 rounded-full bg-destructive/10 flex items-center justify-center mb-8 border border-destructive/20 shadow-[0_0_50px_-10px_rgba(239,68,68,0.3)]">
              <AlertTriangle className="size-10 text-destructive animate-pulse" />
            </div>
            <DialogHeader className="p-0 text-center">
              <DialogTitle className="text-4xl font-black uppercase tracking-tighter mb-4">Irreversible Action</DialogTitle>
              <DialogDescription className="text-sm font-bold uppercase tracking-[0.2em] opacity-60 leading-relaxed">
                You are about to purge this record from the cluster. This action will permanently delete all associated data from <span className="text-foreground border-b border-foreground/20">{urlTableName}</span>.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-12 flex items-center gap-4 w-full">
              <Button 
                variant="ghost" 
                onClick={() => setIsDeleteOpen(false)} 
                className="flex-1 h-16 rounded-2xl font-black uppercase tracking-widest opacity-40 hover:opacity-100 hover:bg-foreground/5 transition-all"
              >
                Abort Action
              </Button>
              <Button 
                onClick={handleDelete} 
                disabled={isOperationLoading}
                className="flex-1 h-16 rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-black uppercase tracking-widest shadow-2xl shadow-destructive/20 flex items-center gap-3 active:scale-95 transition-all border border-destructive/50"
              >
                {isOperationLoading ? <Loader2 className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
                Confirm Purge
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isTruncateOpen} onOpenChange={setIsTruncateOpen}>
        <DialogContent className="max-w-none w-screen h-screen top-0 flex flex-col p-0 bg-background/40 backdrop-blur-3xl border-none rounded-none overflow-hidden shadow-2xl" showCloseButton={false}>
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center max-w-2xl mx-auto">
            <div className="size-24 rounded-full bg-destructive/10 flex items-center justify-center mb-8 border border-destructive/20 shadow-[0_0_50px_-10px_rgba(239,68,68,0.3)]">
              <AlertTriangle className="size-10 text-destructive animate-pulse" />
            </div>
            <DialogHeader className="p-0 text-center">
              <DialogTitle className="text-4xl font-black uppercase tracking-tighter mb-4">Total Purge</DialogTitle>
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
                Abort Operation
              </Button>
              <Button 
                onClick={handleTruncate} 
                disabled={isOperationLoading}
                className="flex-1 h-16 rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-black uppercase tracking-widest shadow-2xl shadow-destructive/20 flex items-center gap-3 active:scale-95 transition-all border border-destructive/50"
              >
                {isOperationLoading ? <Loader2 className="size-5 animate-spin" /> : <X className="size-5" />}
                Purge Table
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="min-w-full h-full flex flex-col p-0 bg-background/95 backdrop-blur-3xl border-foreground/10 overflow-hidden shadow-2xl" showCloseButton={false}>
          <div className="px-8 py-6 border-b bg-muted/10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-xl bg-foreground/5 flex items-center justify-center border border-foreground/10">
                <Maximize2 className="size-5 opacity-40" />
              </div>
              <div className="flex flex-col">
                <DialogTitle className="text-lg font-black uppercase tracking-tighter">{previewData?.colName}</DialogTitle>
                <span className="text-[9px] font-bold uppercase tracking-widest opacity-30">Analytical View • Record Index {previewData?.rowIndex}</span>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsPreviewOpen(false)} className="rounded-full size-10 hover:bg-foreground/5">
              <X className="size-5" />
            </Button>
          </div>
          <ScrollArea className="flex-1 p-8">
            <div className="bg-muted/20 rounded-2xl p-8 border border-foreground/5 shadow-inner">
               <pre className="font-mono text-xs leading-relaxed overflow-x-auto selection:bg-primary/30 whitespace-pre-wrap break-all">
                {previewData ? formatCellValue(previewData.val, true) : ""}
              </pre>
            </div>
            <div className="mt-8 flex items-center gap-4">
              <Button 
                onClick={() => copyToClipboard(formatCellValue(previewData?.val, true), 'preview')}
                variant="outline"
                className="h-12 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] gap-3 border-foreground/5 hover:bg-muted transition-all"
              >
                {copiedId === 'preview' ? <Check className="size-4 text-success" /> : <Copy className="size-4 opacity-40" />}
                Copy Manifest
              </Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
