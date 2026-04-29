import { useState, useCallback, useEffect, useRef } from "react";
import {
  Terminal, Loader2, LayoutDashboard, History, Trash2,
  Download, X, Play, Database, Zap, AlertCircle,
  FileText, Hash, Timer, ChevronRight, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useSocket } from "@/context/SocketContext";
import { cn } from "@/lib/utils";

const HISTORY_KEY = "sqllab_history";
const MAX_HISTORY = 50;

interface HistoryEntry {
  query: string;
  executedAt: string;
  rowCount: number;
  durationMs: number;
}

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}

function saveHistory(h: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, MAX_HISTORY)));
}

const SQL_SNIPPETS = [
  { label: "SELECT *", template: "SELECT * FROM " },
  { label: "WHERE", template: " WHERE " },
  { label: "JOIN", template: " INNER JOIN  ON " },
  { label: "GROUP BY", template: " GROUP BY " },
  { label: "ORDER BY", template: " ORDER BY  DESC" },
];

export default function SqlLab() {
  const { socket } = useSocket();
  const [rawQuery, setRawQuery] = useState("");
  const [queryResult, setQueryResult] = useState<{ rows: any[]; columns: string[]; executedAt: string } | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [lastDuration, setLastDuration] = useState<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!socket) return;

    const handleQueryResult = (result: any) => {
      const duration = Date.now() - startTimeRef.current;
      setQueryResult(result);
      setIsQuerying(false);
      setError(null);
      setLastDuration(duration);

      const entry: HistoryEntry = {
        query: rawQuery.trim(),
        executedAt: new Date().toISOString(),
        rowCount: result.rows.length,
        durationMs: duration,
      };
      const updated = [entry, ...loadHistory()];
      saveHistory(updated);
      setHistory(updated.slice(0, MAX_HISTORY));
    };

    const handleError = (msg: string) => {
      setError(msg);
      setIsQuerying(false);
    };

    socket.on("query_result", handleQueryResult);
    socket.on("error", handleError);

    return () => {
      socket.off("query_result", handleQueryResult);
      socket.off("error", handleError);
    };
  }, [socket, rawQuery]);

  const runSqlLab = useCallback(() => {
    if (!rawQuery.trim() || !socket) return;
    setIsQuerying(true);
    setError(null);
    startTimeRef.current = Date.now();
    socket.emit("run_query", rawQuery);
  }, [rawQuery, socket]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runSqlLab();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const newVal = rawQuery.substring(0, start) + "  " + rawQuery.substring(end);
      setRawQuery(newVal);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  const exportCsv = () => {
    if (!queryResult || queryResult.rows.length === 0) return;
    const header = queryResult.columns.join(",");
    const rows = queryResult.rows.map(row =>
      queryResult.columns.map(c => {
        const v = row[c];
        if (v === null) return "NULL";
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `sql_result_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const clearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  const insertSnippet = (template: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setRawQuery(prev => prev + template);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newVal = rawQuery.substring(0, start) + template + rawQuery.substring(end);
    setRawQuery(newVal);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + template.length;
    }, 0);
  };

  const lineCount = rawQuery ? rawQuery.split("\n").length : 1;

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1 min-h-0">

        {/* ─── Left: Editor ─── */}
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <Card className="flex-1 border border-border/50 bg-card/40 backdrop-blur-2xl rounded-2xl overflow-hidden flex flex-col shadow-lg">

            {/* Editor header */}
            <div className="px-4 py-3 border-b border-border/40 bg-gradient-to-r from-muted/40 to-transparent flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="size-6 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Terminal className="size-3.5 text-primary" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-foreground/75">SQL Editor</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px] h-5 px-2 font-semibold opacity-35 uppercase tracking-wide border-foreground/10">
                  Ctrl+↵
                </Badge>
                <button
                  className={cn(
                    "size-7 rounded-lg flex items-center justify-center transition-colors hover:bg-muted/60",
                    showHistory ? "bg-primary/15 text-primary" : "text-muted-foreground/50"
                  )}
                  onClick={() => setShowHistory(v => !v)}
                  title="Query History"
                >
                  <History className="size-3.5" />
                </button>
              </div>
            </div>

            {showHistory ? (
              /* ── History panel ── */
              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-4 py-2 border-b border-border/30 flex items-center justify-between bg-muted/5 shrink-0">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
                    {history.length} saved queries
                  </span>
                  {history.length > 0 && (
                    <button
                      className="size-6 rounded-md flex items-center justify-center hover:bg-destructive/10 transition-colors"
                      onClick={clearHistory}
                      title="Clear history"
                    >
                      <Trash2 className="size-3 text-destructive/60" />
                    </button>
                  )}
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2.5 space-y-1.5">
                    {history.length === 0 && (
                      <div className="flex flex-col items-center py-12">
                        <FileText className="size-8 opacity-10 mb-3" />
                        <p className="text-[9px] text-muted-foreground/25 uppercase tracking-widest">No history yet</p>
                      </div>
                    )}
                    {history.map((entry, i) => (
                      <div
                        key={i}
                        className="group p-3 rounded-xl border border-foreground/5 bg-muted/10 cursor-pointer hover:bg-primary/5 hover:border-primary/15 transition-all"
                        onClick={() => { setRawQuery(entry.query); setShowHistory(false); }}
                      >
                        <p className="font-mono text-[10px] line-clamp-2 text-foreground/65 group-hover:text-foreground/85 transition-colors leading-relaxed">
                          {entry.query}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[8px] text-muted-foreground/40 flex items-center gap-1">
                            <Timer className="size-2.5" />{entry.durationMs}ms
                          </span>
                          <span className="text-[8px] text-muted-foreground/40 flex items-center gap-1">
                            <Hash className="size-2.5" />{entry.rowCount} rows
                          </span>
                          <span className="text-[8px] text-muted-foreground/25 ml-auto">
                            {new Date(entry.executedAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              /* ── Editor panel ── */
              <div className="flex-1 flex flex-col min-h-0">

                {/* Snippet toolbar */}
                <div className="px-3 py-2 border-b border-border/20 flex items-center gap-1.5 bg-muted/5 flex-wrap shrink-0">
                  {SQL_SNIPPETS.map(s => (
                    <button
                      key={s.label}
                      onClick={() => insertSnippet(s.template)}
                      className="text-[9px] font-mono font-bold px-2 py-1 rounded-md bg-muted/30 hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/20 transition-all tracking-wide text-muted-foreground/50"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Code editor area */}
                <div className="flex-1 relative min-h-0 bg-black/[0.06] dark:bg-black/25">
                  <textarea
                    ref={textareaRef}
                    placeholder={"SELECT *\nFROM your_table\nWHERE condition = 'value'\nLIMIT 100;"}
                    value={rawQuery}
                    onChange={(e) => setRawQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    className="absolute inset-0 w-full h-full bg-transparent border-none p-4 font-mono text-[13px] leading-[1.7] resize-none outline-none text-foreground/90 placeholder:text-muted-foreground/20 selection:bg-primary/20"
                  />
                </div>

                {/* Status bar */}
                <div className="px-4 py-1.5 border-t border-border/15 bg-muted/10 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-mono text-muted-foreground/30">
                      {lineCount} {lineCount === 1 ? "line" : "lines"}
                    </span>
                    <span className="text-[9px] font-mono text-muted-foreground/20 hidden sm:block">SQL</span>
                  </div>
                  {rawQuery && (
                    <button
                      onClick={() => setRawQuery("")}
                      className="text-[9px] text-muted-foreground/25 hover:text-muted-foreground/60 transition-colors"
                    >
                      clear
                    </button>
                  )}
                </div>

                {/* Execute button */}
                <div className="p-3 border-t border-border/20 shrink-0">
                  <Button
                    onClick={runSqlLab}
                    disabled={isQuerying || !rawQuery.trim()}
                    className={cn(
                      "w-full h-10 rounded-xl font-bold uppercase tracking-[0.1em] text-[11px] transition-all gap-2",
                      !isQuerying && rawQuery.trim()
                        ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                        : ""
                    )}
                  >
                    {isQuerying
                      ? <><Loader2 className="size-3.5 animate-spin" />Executing...</>
                      : <><Play className="size-3.5 fill-current" />Run Query</>
                    }
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ─── Right: Results ─── */}
        <div className="lg:col-span-3 min-h-0 flex flex-col">
          <Card className="flex-1 border border-border/50 bg-card/40 backdrop-blur-2xl rounded-2xl overflow-hidden flex flex-col shadow-lg">

            {/* Results header */}
            <div className="px-4 py-3 border-b border-border/40 bg-gradient-to-r from-muted/40 to-transparent flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="size-6 rounded-lg bg-muted/50 flex items-center justify-center">
                  <LayoutDashboard className="size-3.5 text-muted-foreground/70" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-foreground/75">Results</span>
                {queryResult && (
                  <div className="flex items-center gap-1.5 ml-0.5">
                    <Badge className="text-[9px] h-5 px-1.5 bg-success/15 text-success border-success/25 font-bold">
                      {queryResult.rows.length} rows
                    </Badge>
                    <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-semibold opacity-45 border-foreground/10">
                      {queryResult.columns.length} cols
                    </Badge>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {lastDuration !== null && queryResult && (
                  <span className="text-[9px] font-mono text-muted-foreground/40 flex items-center gap-1">
                    <Zap className="size-3 text-warning/50" />{lastDuration}ms
                  </span>
                )}
                {queryResult && queryResult.rows.length > 0 && (
                  <button
                    onClick={exportCsv}
                    className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground/45 hover:text-foreground/75 transition-all px-2 py-1 rounded-lg hover:bg-muted/40 border border-transparent hover:border-border/30"
                    title="Export CSV"
                  >
                    <Download className="size-3" />
                    Export
                  </button>
                )}
                {(queryResult || error) && (
                  <button
                    className="size-6 rounded-lg flex items-center justify-center hover:bg-muted/50 transition-colors text-muted-foreground/35 hover:text-foreground/60"
                    onClick={() => { setQueryResult(null); setError(null); setLastDuration(null); }}
                    title="Clear results"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Results body */}
            <div className="flex-1 overflow-hidden relative">
              {isQuerying ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
                  <div className="relative">
                    <div className="size-14 rounded-full border-2 border-primary/15 border-t-primary animate-spin" />
                    <Database className="absolute inset-0 m-auto size-5 text-primary/40" />
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground/45 animate-pulse">
                      Executing query
                    </p>
                    <p className="text-[9px] text-muted-foreground/25 mt-1.5">Awaiting database response…</p>
                  </div>
                </div>
              ) : error ? (
                <div className="p-6">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/8 border border-destructive/20">
                    <AlertCircle className="size-4 text-destructive/70 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-destructive/70 mb-2">Query Error</p>
                      <p className="font-mono text-[12px] text-destructive/60 leading-relaxed whitespace-pre-wrap">{error}</p>
                    </div>
                  </div>
                </div>
              ) : queryResult ? (
                <ScrollArea className="h-full">
                  <Table>
                    <TableHeader className="sticky top-0 z-20">
                      <TableRow className="border-border/20 bg-muted/40 backdrop-blur-md hover:bg-muted/40">
                        <TableHead className="text-[9px] font-bold text-muted-foreground/35 w-10 text-center border-r border-border/20 h-9 uppercase tracking-widest">
                          #
                        </TableHead>
                        {queryResult.columns.map(c => (
                          <TableHead
                            key={c}
                            className="text-[10px] font-bold uppercase tracking-widest border-r border-border/15 last:border-r-0 h-9 whitespace-nowrap text-foreground/55"
                          >
                            {c}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queryResult.rows.map((row, i) => (
                        <TableRow
                          key={i}
                          className={cn(
                            "border-border/10 hover:bg-primary/5 transition-colors",
                            i % 2 === 0 ? "bg-transparent" : "bg-muted/[0.03]"
                          )}
                        >
                          <TableCell className="text-[9px] font-mono text-muted-foreground/25 text-center border-r border-border/10 w-10 select-none">
                            {i + 1}
                          </TableCell>
                          {queryResult.columns.map(c => (
                            <TableCell
                              key={c}
                              className={cn(
                                "font-mono text-[11px] border-r border-border/10 last:border-r-0 max-w-[220px] truncate",
                                row[c] === null
                                  ? "text-muted-foreground/25 italic"
                                  : "text-foreground/80"
                              )}
                              title={row[c] === null ? "NULL" : String(row[c])}
                            >
                              {row[c] === null ? "NULL" : String(row[c])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                /* Empty state */
                <div className="h-full flex flex-col items-center justify-center gap-5 text-center px-8">
                  <div className="relative">
                    <div className="size-16 rounded-2xl bg-muted/20 border border-border/20 flex items-center justify-center">
                      <Terminal className="size-7 text-muted-foreground/20" />
                    </div>
                    <div className="absolute -bottom-1.5 -right-1.5 size-6 rounded-lg bg-card border border-border/30 flex items-center justify-center shadow-sm">
                      <ChevronRight className="size-3 text-muted-foreground/30" />
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/35">
                      Ready for execution
                    </p>
                    <p className="text-[10px] text-muted-foreground/22 mt-2 leading-relaxed">
                      Write a query in the editor<br />
                      and press <span className="font-mono text-muted-foreground/40">Ctrl+Enter</span> or click Run
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Results footer */}
            {queryResult && (
              <div className="px-4 py-2 border-t border-border/15 bg-muted/10 flex items-center gap-4 shrink-0">
                <span className="text-[9px] font-mono text-muted-foreground/30 flex items-center gap-1.5">
                  <CheckCircle2 className="size-3 text-success/50" />
                  Query completed
                </span>
                {queryResult.executedAt && (
                  <span className="text-[9px] text-muted-foreground/20">
                    {new Date(queryResult.executedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
            )}
          </Card>
        </div>

      </div>
    </div>
  );
}
