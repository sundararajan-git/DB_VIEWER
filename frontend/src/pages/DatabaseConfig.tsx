import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Database, Link as LinkIcon, Link2Off, Loader2, Save } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSocket } from "@/context/SocketContext";

export default function DatabaseConfig() {
  const navigate = useNavigate();
  const { isConnected } = useSocket();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    type: "mssql",
    port: "",
    server: "",
    database: "",
    user: "",
    password: "",
  });

  useEffect(() => {
    fetch("/api/config")
      .then(res => res.json())
      .then(data => {
        setFormData(prev => ({
          ...prev,
          type: data.type || "mssql",
          port: data.port || "",
          server: data.server || "",
          database: data.database || "",
          user: data.user || "",
        }));
        setFetching(false);
      })
      .catch(err => {
        console.error("Failed to load config", err);
        setFetching(false);
      });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
    setSuccess(null);
  };

  const handleSelectChange = (value: string | null) => {
    if (value) {
      setFormData(prev => ({ ...prev, type: value }));
      setError(null);
      setSuccess(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const result = await res.json();
      
      if (!res.ok) {
        throw new Error(result.error || "Failed to connect");
      }

      setSuccess(result.message);
      
      // Navigate to explorer after a short delay
      setTimeout(() => navigate("/explorer"), 1500);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/disconnect", { method: "POST" });
      const result = await res.json();
      
      if (!res.ok) throw new Error(result.error || "Failed to disconnect");

      setSuccess(result.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
      <Card className="w-full max-w-lg shadow-2xl border-border/50 bg-background/50 backdrop-blur-xl">
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
                <Link2Off className="w-4 h-4" />
                {error}
              </div>
            )}
            
            {success && (
              <div className="p-3 bg-success/10 border border-success/20 text-success text-sm rounded-lg flex items-center gap-2 font-medium">
                <Save className="w-4 h-4" />
                {success}
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Database Engine</Label>
                <Select value={formData.type} onValueChange={handleSelectChange}>
                  <SelectTrigger className="bg-background/50 h-10">
                    <SelectValue placeholder="Select Database Engine" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mssql">MS SQL Server</SelectItem>
                    <SelectItem value="postgres">PostgreSQL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="port">Port (Optional)</Label>
                <Input 
                  id="port"
                  name="port" 
                  placeholder={formData.type === 'postgres' ? '5432' : '1433'} 
                  value={formData.port}
                  onChange={handleChange}
                  className="bg-background/50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="server">Server Host / URL</Label>
              <Input 
                id="server"
                name="server" 
                placeholder="localhost" 
                value={formData.server}
                onChange={handleChange}
                required
                className="bg-background/50"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="database">Database Name</Label>
              <Input 
                id="database"
                name="database" 
                placeholder="e.g. AimBack" 
                value={formData.database}
                onChange={handleChange}
                required
                className="bg-background/50"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="user">Username</Label>
                <Input 
                  id="user"
                  name="user" 
                  placeholder="admin" 
                  value={formData.user}
                  onChange={handleChange}
                  required
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password"
                  name="password" 
                  type="password"
                  placeholder="••••••••" 
                  value={formData.password}
                  onChange={handleChange}
                  className="bg-background/50"
                />
              </div>
            </div>
          </form>
        </CardContent>
        
        <CardFooter className="flex justify-between items-center border-t border-border/10 pt-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mr-4">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success animate-pulse shadow-[0_0_8px_var(--success)]' : 'bg-destructive'}`} />
            {isConnected ? 'Currently Connected' : 'Currently Offline'}
          </div>
          
          <div className="flex gap-2 basis-3/5">
            {isConnected && (
              <Button 
                type="button" 
                variant="destructive"
                onClick={handleDisconnect}
                disabled={loading}
                className="flex-1 font-bold tracking-wide"
              >
                <Link2Off className="w-4 h-4 mr-2" />
                Disconnect
              </Button>
            )}
            <Button 
              type="submit" 
              form="db-config-form" 
              disabled={loading}
              className="flex-1 font-bold tracking-wide"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Connect & Save
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
