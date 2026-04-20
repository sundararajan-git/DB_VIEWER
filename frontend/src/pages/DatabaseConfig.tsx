import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Database, Link as LinkIcon, Link2Off, Loader2, Save, Bookmark, Trash2, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSocket } from "@/context/SocketContext";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/apiFetch";

interface SavedConnection {
  name: string;
  type: string;
  server: string;
  port: string;
  database: string;
  user: string;
  password: string;
}

export default function DatabaseConfig() {
  const navigate = useNavigate();
  const { isConnected } = useSocket();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [formData, setFormData] = useState({
    type: "mssql",
    port: "",
    server: "",
    database: "",
    user: "",
    password: "",
  });

  useEffect(() => {
    Promise.all([
      apiFetch("/api/config").then(r => r.json()),
      apiFetch("/api/connections").then(r => r.json()),
    ]).then(([config, conns]) => {
      setFormData(prev => ({
        ...prev,
        type: config.type || "mssql",
        port: config.port || "",
        server: config.server || "",
        database: config.database || "",
        user: config.user || "",
      }));
      setSavedConnections(conns);
      setFetching(false);
    }).catch(() => setFetching(false));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
    setSuccess(null);
  };

  const handleSelectChange = (value: string) => {
    setFormData(prev => ({ ...prev, type: value }));
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to connect");
      setSuccess(result.message);
      setTimeout(() => navigate("/explorer"), 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/disconnect", { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to disconnect");
      setSuccess(result.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileName.trim()) return;
    setSavingProfile(true);
    try {
      await apiFetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, name: profileName.trim() }),
      });
      const conns = await apiFetch("/api/connections").then(r => r.json());
      setSavedConnections(conns);
      setProfileName("");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteProfile = async (name: string) => {
    await apiFetch(`/api/connections/${encodeURIComponent(name)}`, { method: "DELETE" });
    setSavedConnections(prev => prev.filter(c => c.name !== name));
  };

  const loadProfile = (conn: SavedConnection) => {
    setFormData({ type: conn.type, port: conn.port, server: conn.server, database: conn.database, user: conn.user, password: conn.password || "" });
    setError(null);
    setSuccess(null);
  };

  if (fetching) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-muted/10 h-full">
      <div className="w-full max-w-4xl flex gap-6">
        {/* Saved Connections Panel */}
        <Card className="w-64 shrink-0 shadow-xl border-border/50 bg-background/50 backdrop-blur-xl flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
              <Bookmark className="size-4 opacity-60" /> Saved Profiles
            </CardTitle>
            <CardDescription className="text-[10px]">{savedConnections.length} connection{savedConnections.length !== 1 ? "s" : ""} saved</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-2">
            <ScrollArea className="h-56">
              <div className="space-y-1 p-1">
                {savedConnections.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/40 uppercase tracking-widest text-center py-6">No saved profiles</p>
                )}
                {savedConnections.map(conn => (
                  <div
                    key={conn.name}
                    className="flex items-center gap-2 p-2.5 rounded-xl border border-transparent hover:border-foreground/5 hover:bg-muted/20 cursor-pointer group"
                    onClick={() => loadProfile(conn)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold truncate">{conn.name}</p>
                      <p className="text-[9px] text-muted-foreground/50 truncate font-mono">{conn.server}/{conn.database}</p>
                    </div>
                    <Badge variant="outline" className={cn("text-[7px] font-black uppercase shrink-0 px-1.5 py-0", conn.type === 'postgres' ? 'text-blue-400 border-blue-500/30' : 'text-orange-400 border-orange-500/30')}>
                      {conn.type === 'postgres' ? 'PG' : 'MS'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5 rounded-md opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={e => { e.stopPropagation(); handleDeleteProfile(conn.name); }}
                    >
                      <Trash2 className="size-3 text-destructive" />
                    </Button>
                    <ChevronRight className="size-3 opacity-20 shrink-0" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
          <div className="p-3 border-t">
            <div className="flex gap-2">
              <Input
                placeholder="Profile name..."
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                className="h-8 text-[10px] bg-muted/20 border-foreground/10 rounded-lg"
                onKeyDown={e => e.key === "Enter" && handleSaveProfile()}
              />
              <Button
                size="icon"
                className="size-8 rounded-lg shrink-0"
                disabled={!profileName.trim() || savingProfile}
                onClick={handleSaveProfile}
                title="Save current form as profile"
              >
                {savingProfile ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
              </Button>
            </div>
          </div>
        </Card>

        {/* Main Config Form */}
        <Card className="flex-1 shadow-2xl border-border/50 bg-background/50 backdrop-blur-xl">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary/10 rounded-xl">
                <Database className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl font-black">Database Connection</CardTitle>
                <CardDescription>Configure your database connection</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form id="db-config-form" onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg flex items-center gap-2 font-medium">
                  <Link2Off className="w-4 h-4" />{error}
                </div>
              )}
              {success && (
                <div className="p-3 bg-success/10 border border-success/20 text-success text-sm rounded-lg flex items-center gap-2 font-medium">
                  <Save className="w-4 h-4" />{success}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Database Engine</Label>
                  <Select value={formData.type} onValueChange={handleSelectChange}>
                    <SelectTrigger className="bg-background/50 h-10">
                      <SelectValue placeholder="Select Engine" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mssql">MS SQL Server</SelectItem>
                      <SelectItem value="postgres">PostgreSQL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Port (Optional)</Label>
                  <Input name="port" placeholder={formData.type === "postgres" ? "5432" : "1433"} value={formData.port} onChange={handleChange} className="bg-background/50" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Server Host / URL</Label>
                <Input name="server" placeholder="localhost" value={formData.server} onChange={handleChange} required className="bg-background/50" />
              </div>
              <div className="space-y-2">
                <Label>Database Name</Label>
                <Input name="database" placeholder="e.g. mydb" value={formData.database} onChange={handleChange} required className="bg-background/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input name="user" placeholder="admin" value={formData.user} onChange={handleChange} required className="bg-background/50" />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input name="password" type="password" placeholder="••••••••" value={formData.password} onChange={handleChange} className="bg-background/50" />
                </div>
              </div>
            </form>
          </CardContent>

          <CardFooter className="flex justify-between items-center border-t border-border/10 pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mr-4">
              <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-success animate-pulse shadow-[0_0_8px_var(--success)]" : "bg-destructive"}`} />
              {isConnected ? "Currently Connected" : "Currently Offline"}
            </div>
            <div className="flex gap-2 basis-3/5">
              {isConnected && (
                <Button type="button" variant="destructive" onClick={handleDisconnect} disabled={loading} className="flex-1 font-bold tracking-wide">
                  <Link2Off className="w-4 h-4 mr-2" />Disconnect
                </Button>
              )}
              <Button type="submit" form="db-config-form" disabled={loading} className="flex-1 font-bold tracking-wide">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting...</> : <><LinkIcon className="w-4 h-4 mr-2" />Connect & Save</>}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
