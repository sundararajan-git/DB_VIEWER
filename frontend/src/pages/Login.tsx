import { useState } from "react";
import { Database, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-background flex items-center justify-center p-8">
      <Card className="w-full max-w-sm shadow-2xl border-border/50 bg-background/60 backdrop-blur-xl">
        <CardHeader className="text-center space-y-3 pb-6">
          <div className="flex justify-center">
            <div className="p-3 bg-foreground text-background rounded-2xl shadow-lg">
              <Database className="size-7" />
            </div>
          </div>
          <CardTitle className="text-2xl font-black uppercase tracking-tighter">Ascadis</CardTitle>
          <CardDescription className="text-[10px] font-bold uppercase tracking-widest opacity-50">Admin Authentication Required</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-[11px] rounded-xl flex items-center gap-2 font-bold uppercase tracking-wider">
                <Lock className="size-3.5 shrink-0" />{error}
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest">Admin Password</Label>
              <div className="relative">
                <Input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password..."
                  className="pr-10 bg-muted/20 border-foreground/10 rounded-xl h-12 font-mono"
                  required
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-lg opacity-40 hover:opacity-100"
                  onClick={() => setShowPwd(v => !v)}
                >
                  {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
            </div>
            <Button
              type="submit"
              disabled={loading || !password}
              className="w-full h-12 rounded-xl font-black uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90 shadow-xl"
            >
              {loading ? "Authenticating..." : "Access System"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
