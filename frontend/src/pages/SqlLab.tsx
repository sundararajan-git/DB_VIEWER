import { useState, useCallback, useEffect } from "react";
import { 
  Terminal, Cpu, Loader2, LayoutDashboard
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useSocket } from "@/context/SocketContext";

export default function SqlLab() {
  const { socket } = useSocket();
  const [rawQuery, setRawQuery] = useState("");
  const [queryResult, setQueryResult] = useState<{ rows: any[], columns: string[], executedAt: string } | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleQueryResult = (result: any) => {
      setQueryResult(result);
      setIsQuerying(false);
      setError(null);
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
  }, [socket]);

  const runSqlLab = useCallback(() => {
    if (!rawQuery.trim() || !socket) return;
    setIsQuerying(true);
    socket.emit("run_query", rawQuery);
  }, [rawQuery, socket]);

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        <div className="lg:col-span-1 flex flex-col gap-4">
          <Card className="flex-1 border-muted-foreground/10 bg-card/40 backdrop-blur-2xl rounded-3xl overflow-hidden flex flex-col">
            <div className="p-6 border-b bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="size-4 animate-pulse text-muted-foreground" />
                <h3 className="text-xs font-black uppercase tracking-widest">Compiler Interface</h3>
              </div>
              <Badge variant="outline" className="text-[9px] h-5 px-2 font-bold opacity-50 uppercase">Read-Only</Badge>
            </div>
            <div className="flex-1 p-6 flex flex-col">
              <textarea
                placeholder="SELECT TOP 100 * FROM your_table..."
                value={rawQuery}
                onChange={(e) => setRawQuery(e.target.value)}
                className="flex-1 w-full bg-muted/30 border-none rounded-2xl p-6 font-mono text-sm resize-none focus:ring-1 focus:ring-foreground/20 outline-none transition-all"
              />
              <Button 
                onClick={runSqlLab}
                disabled={isQuerying || !rawQuery.trim()}
                className="mt-6 w-full h-12 rounded-2xl font-black uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90 shadow-xl"
              >
                {isQuerying ? <Loader2 className="size-4 animate-spin mr-2" /> : <Cpu className="size-4 mr-2" />}
                Execute Script
              </Button>
            </div>
          </Card>
        </div>
        
        <div className="lg:col-span-2 min-h-0">
          <Card className="h-full border-muted-foreground/10 bg-card/60 backdrop-blur-2xl rounded-3xl overflow-hidden flex flex-col">
            <div className="p-6 border-b bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="size-4 text-muted-foreground" />
                <h3 className="text-xs font-black uppercase tracking-widest">Output Registry</h3>
              </div>
              {queryResult && (
                <div className="text-[10px] font-bold opacity-40 uppercase tracking-widest">
                  {queryResult.rows.length} Records Detected
                </div>
              )}
            </div>
            <div className="flex-1 overflow-hidden relative">
              {isQuerying ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm z-10">
                  <Cpu className="size-12 opacity-30 animate-spin" />
                  <span className="mt-6 text-[10px] font-black uppercase tracking-[0.3em] opacity-30 animate-pulse">Processing...</span>
                </div>
              ) : error ? (
                <div className="p-10 text-destructive font-mono text-sm uppercase px-12">
                   {error}
                </div>
              ) : queryResult ? (
                <ScrollArea className="h-full">
                  <Table>
                    <TableHeader className="bg-muted/40 sticky top-0 z-20 backdrop-blur-md">
                      <TableRow>
                        {queryResult.columns.map(c => (
                          <TableHead key={c} className="text-[10px] font-black uppercase tracking-widest border-r border-muted-foreground/5 h-12">{c}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queryResult.rows.map((row, i) => (
                        <TableRow key={i}>
                          {queryResult.columns.map(c => (
                            <TableCell key={c} className="font-mono text-[11px] border-r border-muted-foreground/5">{String(row[c])}</TableCell>
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
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
