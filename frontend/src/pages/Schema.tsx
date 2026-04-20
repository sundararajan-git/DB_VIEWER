import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, Key, Link2, Hash, Table as TableIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/apiFetch";

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

const TYPE_COLORS: Record<string, string> = {
  int: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  integer: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  bigint: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  smallint: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  numeric: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  decimal: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  float: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  double: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  real: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  varchar: "bg-green-500/10 text-green-400 border-green-500/20",
  "character varying": "bg-green-500/10 text-green-400 border-green-500/20",
  nvarchar: "bg-green-500/10 text-green-400 border-green-500/20",
  text: "bg-green-500/10 text-green-400 border-green-500/20",
  char: "bg-green-500/10 text-green-400 border-green-500/20",
  nchar: "bg-green-500/10 text-green-400 border-green-500/20",
  boolean: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  bool: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  bit: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  date: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  timestamp: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  datetime: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  datetime2: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  time: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  uuid: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  json: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  jsonb: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

function getTypeColor(type: string) {
  const base = type.toLowerCase().split("(")[0].trim();
  return TYPE_COLORS[base] || "bg-muted/40 text-muted-foreground border-muted-foreground/20";
}

export default function Schema() {
  const { tableName } = useParams();
  const navigate = useNavigate();
  const [tables, setTables] = useState<string[]>([]);
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/tables")
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setTables(data);
        if (data.length > 0 && !tableName) {
          navigate(`/schema/${data[0]}`, { replace: true });
        }
      })
      .catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    if (!tableName) return;
    setIsLoading(true);
    setSchema(null);
    setError(null);
    apiFetch(`/api/schema/${tableName}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setSchema(data);
        setIsLoading(false);
      })
      .catch(err => { setError(err.message); setIsLoading(false); });
  }, [tableName]);

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-4 overflow-auto">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <TableIcon className="size-4 text-muted-foreground" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Schema Inspector</span>
        </div>
        <Select value={tableName || ""} onValueChange={v => navigate(`/schema/${v}`)}>
          <SelectTrigger className="w-56 h-8 rounded-xl bg-muted/20 border-foreground/5 text-[10px] font-black uppercase tracking-widest">
            <SelectValue placeholder="Select table..." />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-foreground/10 bg-background/95 backdrop-blur-xl max-h-80">
            <ScrollArea className="h-64">
              <div className="p-2 space-y-1">
                {tables.map(t => (
                  <SelectItem key={t} value={t} className="rounded-lg h-8 uppercase text-[9px] font-black tracking-widest cursor-pointer px-3">{t}</SelectItem>
                ))}
              </div>
            </ScrollArea>
          </SelectContent>
        </Select>
        {schema && (
          <div className="flex items-center gap-3 ml-auto">
            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest px-3 py-1">{schema.columns?.length ?? 0} Columns</Badge>
            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest px-3 py-1">{schema.indexes?.length ?? 0} Indexes</Badge>
          </div>
        )}
      </div>

      {error && <p className="text-destructive text-sm font-mono">{error}</p>}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-8 animate-spin opacity-30" />
        </div>
      )}

      {schema && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Columns Table */}
          <Card className="xl:col-span-2 border-foreground/5 bg-card/40 backdrop-blur-xl rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b bg-muted/10 flex items-center gap-2">
              <Hash className="size-4 opacity-40" />
              <h3 className="text-[10px] font-black uppercase tracking-widest">Column Definitions</h3>
            </div>
            <ScrollArea className="h-[calc(100vh-260px)]">
              <Table>
                <TableHeader className="bg-muted/20 sticky top-0 z-10">
                  <TableRow>
                    {["Column", "Type", "Nullable", "Default", "Constraints"].map(h => (
                      <TableHead key={h} className="text-[9px] font-black uppercase tracking-widest h-10 px-4">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schema.columns.map(col => (
                    <TableRow key={col.name} className="border-b border-muted-foreground/5 hover:bg-muted/10">
                      <TableCell className="px-4 py-3">
                        <span className="font-mono text-[12px] font-bold">{col.name}</span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant="outline" className={cn("text-[9px] font-mono font-bold border uppercase px-2 py-0.5", getTypeColor(col.type))}>
                          {col.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className={cn("text-[10px] font-black uppercase", col.nullable ? "text-muted-foreground/50" : "text-foreground/70")}>
                          {col.nullable ? "YES" : "NO"}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className="font-mono text-[10px] text-muted-foreground/50">
                          {col.default ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {col.isPrimaryKey && (
                            <Badge variant="outline" className="text-[8px] font-black uppercase px-1.5 py-0 bg-primary/10 text-primary border-primary/30 gap-1">
                              <Key className="size-2.5" /> PK
                            </Badge>
                          )}
                          {col.foreignKey && (
                            <Badge variant="outline" className="text-[8px] font-black uppercase px-1.5 py-0 bg-blue-500/10 text-blue-400 border-blue-500/30 gap-1">
                              <Link2 className="size-2.5" /> FK → {col.foreignKey.table}.{col.foreignKey.column}
                            </Badge>
                          )}
                          {!col.isPrimaryKey && !col.foreignKey && (
                            <span className="text-[9px] text-muted-foreground/30">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </Card>

          {/* Indexes Panel */}
          <Card className="border-foreground/5 bg-card/40 backdrop-blur-xl rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b bg-muted/10 flex items-center gap-2">
              <Hash className="size-4 opacity-40" />
              <h3 className="text-[10px] font-black uppercase tracking-widest">Indexes</h3>
            </div>
            <ScrollArea className="h-[calc(100vh-260px)]">
              <div className="p-4 space-y-3">
                {schema.indexes.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest text-center py-8">No indexes found</p>
                )}
                {schema.indexes.map(idx => (
                  <div key={idx.name} className="p-4 rounded-xl border border-foreground/5 bg-muted/10 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-bold">{idx.name}</span>
                      {idx.isPrimary && <Badge variant="outline" className="text-[8px] font-black uppercase px-1.5 py-0 bg-primary/10 text-primary border-primary/30">PRIMARY</Badge>}
                      {idx.isUnique && !idx.isPrimary && <Badge variant="outline" className="text-[8px] font-black uppercase px-1.5 py-0 bg-success/10 text-success border-success/30">UNIQUE</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {idx.columns.map(c => (
                        <Badge key={c} variant="secondary" className="text-[8px] font-mono px-2 py-0">{c}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </div>
      )}
    </div>
  );
}
