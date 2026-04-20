import { useState, useCallback, useEffect, useRef } from "react";
import { Terminal, Cpu, Loader2, LayoutDashboard, History, Trash2, Clock, Download, X } from "lucide-react";
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

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0 p-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* Left: Editor + History */}
        <div className="lg:col-span-1 flex flex-col gap-4 min-h-0">
          <Card className="flex-1 border-muted-foreground/10 bg-card/40 backdrop-blur-2xl rounded-3xl overflow-hidden flex flex-col">
            <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="size-4 animate-pulse text-muted-foreground" />
                <h3 className="text-xs font-black uppercase tracking-widest">Compiler Interface</h3>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[9px] h-5 px-2 font-bold opacity-50 uppercase">Ctrl+↵ Run</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-lg"
                  onClick={() => setShowHistory(v => !v)}
                  title="Query History"
                >
                  <History className={cn("size-3.5", showHistory && "text-primary")} />
                </Button>
              </div>
            </div>

            {showHistory ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-4 py-2 border-b flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Last {history.length} Queries</span>
                  {history.length > 0 && (
                    <Button variant="ghost" size="icon" className="size-6 rounded-lg" onClick={clearHistory}>
                      <Trash2 className="size-3 text-destructive/60" />
                    </Button>
                  )}
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-1.5">
                    {history.length === 0 && (
                      <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest text-center py-8">No history yet</p>
                    )}
                    {history.map((entry, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl border border-foreground/5 bg-muted/10 cursor-pointer hover:bg-muted/20 transition-colors"
                        onClick={() => { setRawQuery(entry.query); setShowHistory(false); }}
                      >
                        <p className="font-mono text-[10px] line-clamp-2 text-foreground/70">{entry.query}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[8px] text-muted-foreground/40 flex items-center gap-1">
                            <Clock className="size-2.5" />{entry.durationMs}ms
                          </span>
                          <span className="text-[8px] text-muted-foreground/40">{entry.rowCount} rows</span>
                          <span className="text-[8px] text-muted-foreground/30 ml-auto">{new Date(entry.executedAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="flex-1 p-4 flex flex-col min-h-0">
                <textarea
                  placeholder="SELECT TOP 100 * FROM your_table...&#10;&#10;Ctrl+Enter to execute"
                  value={rawQuery}
                  onChange={(e) => setRawQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 w-full bg-muted/30 border-none rounded-2xl p-4 font-mono text-sm resize-none focus:ring-1 focus:ring-foreground/20 outline-none transition-all min-h-[200px]"
                />
                <Button
                  onClick={runSqlLab}
                  disabled={isQuerying || !rawQuery.trim()}
                  className="mt-4 w-full h-11 rounded-2xl font-black uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90 shadow-xl"
                >
                  {isQuerying ? <Loader2 className="size-4 animate-spin mr-2" /> : <Cpu className="size-4 mr-2" />}
                  Execute Script
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-2 min-h-0">
          <Card className="h-full border-muted-foreground/10 bg-card/60 backdrop-blur-2xl rounded-3xl overflow-hidden flex flex-col">
            <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="size-4 text-muted-foreground" />
                <h3 className="text-xs font-black uppercase tracking-widest">Output Registry</h3>
              </div>
              <div className="flex items-center gap-3">
                {lastDuration !== null && queryResult && (
                  <span className="text-[9px] font-mono opacity-40 flex items-center gap-1">
                    <Clock className="size-3" />{lastDuration}ms
                  </span>
                )}
                {queryResult && (
                  <span className="text-[10px] font-bold opacity-40 uppercase tracking-widest">
                    {queryResult.rows.length} Records
                  </span>
                )}
                {queryResult && queryResult.rows.length > 0 && (
                  <Button variant="ghost" size="icon" className="size-7 rounded-lg opacity-60 hover:opacity-100" onClick={exportCsv} title="Export CSV">
                    <Download className="size-3.5" />
                  </Button>
                )}
                {(queryResult || error) && (
                  <Button variant="ghost" size="icon" className="size-7 rounded-lg opacity-60 hover:opacity-100" onClick={() => { setQueryResult(null); setError(null); setLastDuration(null); }}>
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-hidden relative">
              {isQuerying ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm z-10">
                  <Cpu className="size-12 opacity-30 animate-spin" />
                  <span className="mt-6 text-[10px] font-black uppercase tracking-[0.3em] opacity-30 animate-pulse">Processing...</span>
                </div>
              ) : error ? (
                <div className="p-8 text-destructive font-mono text-sm uppercase">{error}</div>
              ) : queryResult ? (
                <ScrollArea className="h-full">
                  <Table>
                    <TableHeader className="bg-muted/40 sticky top-0 z-20 backdrop-blur-md">
                      <TableRow>
                        {queryResult.columns.map(c => (
                          <TableHead key={c} className="text-[10px] font-black uppercase tracking-widest border-r border-muted-foreground/5 h-10 whitespace-nowrap">{c}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queryResult.rows.map((row, i) => (
                        <TableRow key={i} className="hover:bg-muted/10">
                          {queryResult.columns.map(c => (
                            <TableCell key={c} className="font-mono text-[11px] border-r border-muted-foreground/5 max-w-xs truncate">{String(row[c] ?? "NULL")}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 px-12 text-center">
                  <Terminal className="size-12 mb-4 opacity-10" />
                  <p className="text-[10px] font-black uppercase tracking-[.2em]">Ready for execution</p>
                  <p className="text-[9px] mt-2 opacity-50">Press Ctrl+Enter or click Execute</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
