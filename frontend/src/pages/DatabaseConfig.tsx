import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Database, Link as LinkIcon, Link2Off, Loader2, Save, Bookmark,
  Trash2, AlertCircle, CheckCircle2, Globe, User, ArrowRight,
} from "lucide-react";
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

interface ActiveConnection {
  type: string;
  server: string;
  port: string;
  database: string;
  user: string;
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
  const [activeConnection, setActiveConnection] = useState<ActiveConnection | null>(null);

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
      if (config.server && config.database) {
        setActiveConnection({
          type: config.type || "mssql",
          server: config.server,
          port: config.port || "",
          database: config.database,
          user: config.user || "",
        });
      }
      setSavedConnections(conns);
      setFetching(false);
    }).catch(() => setFetching(false));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
    setSuccess(null);
  };

  const handleSelectChange = (value: string | null) => {
    if (!value) return;
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
      setActiveConnection({
        type: formData.type,
        server: formData.server,
        port: formData.port,
        database: formData.database,
        user: formData.user,
      });
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
      setActiveConnection(null);
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

  const engineLabel = (type: string) => type === "postgres" ? "PostgreSQL" : "MS SQL Server";
  const engineBadgeClass = (type: string) =>
    type === "postgres"
      ? "text-blue-400 border-blue-500/40 bg-blue-500/10"
      : "text-orange-400 border-orange-500/40 bg-orange-500/10";

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

        {/* Sidebar */}
        <div className="w-64 shrink-0 flex flex-col gap-4">

          {/* Active Connection Info */}
          <Card className={cn(
            "shadow-xl border backdrop-blur-xl transition-all duration-500",
            isConnected && activeConnection
              ? "border-green-500/30 bg-green-500/5 shadow-green-500/5"
              : "border-border/50 bg-background/50"
          )}>
            <CardHeader className="pb-3 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Active Connection
                </CardTitle>
                <div className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border",
                  isConnected
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400"
                )}>
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    isConnected ? "bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.8)]" : "bg-red-400"
                  )} />
                  {isConnected ? "Live" : "Offline"}
                </div>
              </div>
            </CardHeader>

            <CardContent className="px-4 pb-4 pt-0">
              {isConnected && activeConnection ? (
                <div className="space-y-3">
                  <Badge className={cn("text-[9px] font-black uppercase px-2 py-0.5 border rounded-md", engineBadgeClass(activeConnection.type))}>
                    {engineLabel(activeConnection.type)}
                  </Badge>

                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-2 group">
                      <Globe className="size-3 text-muted-foreground/50 shrink-0" />
                      <span className="text-[10px] font-mono text-foreground/70 truncate">
                        {activeConnection.server}{activeConnection.port ? `:${activeConnection.port}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Database className="size-3 text-primary/60 shrink-0" />
                      <span className="text-[11px] font-mono font-bold text-foreground truncate">{activeConnection.database}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="size-3 text-muted-foreground/50 shrink-0" />
                      <span className="text-[10px] font-mono text-foreground/60 truncate">{activeConnection.user}</span>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-[10px] font-bold border-green-500/30 text-green-400 hover:bg-green-500/10 hover:text-green-300 mt-1"
                    onClick={() => navigate("/explorer")}
                  >
                    Open Explorer <ArrowRight className="size-3 ml-1" />
                  </Button>
                </div>
              ) : (
                <div className="py-3 text-center">
                  <div className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-2">
                    <Database className="size-4 text-muted-foreground/30" />
                  </div>
                  <p className="text-[10px] text-muted-foreground/40 uppercase tracking-widest">No database active</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Saved Profiles */}
          <Card className="shadow-xl border-border/50 bg-background/50 backdrop-blur-xl flex-1 flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <Bookmark className="size-4 opacity-60" /> Saved Profiles
              </CardTitle>
              <CardDescription className="text-[10px]">
                {savedConnections.length} connection{savedConnections.length !== 1 ? "s" : ""} saved
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-2">
              <ScrollArea className="h-36">
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
                      <Badge
                        variant="outline"
                        className={cn("text-[7px] font-black uppercase shrink-0 px-1.5 py-0",
                          conn.type === "postgres" ? "text-blue-400 border-blue-500/30" : "text-orange-400 border-orange-500/30"
                        )}
                      >
                        {conn.type === "postgres" ? "PG" : "MS"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-5 rounded-md opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={e => { e.stopPropagation(); handleDeleteProfile(conn.name); }}
                      >
                        <Trash2 className="size-3 text-destructive" />
                      </Button>
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
        </div>

        {/* Main Config Form */}
        <Card className="flex-1 shadow-2xl border-border/50 bg-background/50 backdrop-blur-xl flex flex-col">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 rounded-xl">
                  <Database className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-black">Database Connection</CardTitle>
                  <CardDescription>Configure your database connection</CardDescription>
                </div>
              </div>
              {isConnected && activeConnection && (
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest">Connected to</p>
                  <p className="text-sm font-bold font-mono text-foreground">{activeConnection.database}</p>
                  <p className="text-[10px] text-muted-foreground/60 font-mono">{activeConnection.server}</p>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="flex-1">
            <form id="db-config-form" onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />{error}
                </div>
              )}
              {success && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-lg flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />{success}
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
                  <Input
                    name="port"
                    placeholder={formData.type === "postgres" ? "5432" : "1433"}
                    value={formData.port}
                    onChange={handleChange}
                    className="bg-background/50"
                  />
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

          <CardFooter className="flex justify-between items-center border-t border-border/10 pt-6 gap-4">
            <p className="text-[11px] text-muted-foreground/50 shrink-0">
              {isConnected && activeConnection
                ? `Connected to ${activeConnection.database} on ${activeConnection.server}`
                : "No active database connection"}
            </p>
            <div className="flex gap-2">
              {isConnected && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDisconnect}
                  disabled={loading}
                  className="font-bold tracking-wide"
                >
                  <Link2Off className="w-4 h-4 mr-2" />Disconnect
                </Button>
              )}
              <Button
                type="submit"
                form="db-config-form"
                disabled={loading}
                className="font-bold tracking-wide"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting...</>
                  : <><LinkIcon className="w-4 h-4 mr-2" />Connect & Save</>
                }
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
