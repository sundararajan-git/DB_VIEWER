import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Database, RefreshCw, Command as CommandIcon,
  LayoutDashboard, Terminal, Sun, Moon,
  Table as TableIcon, Search, Settings, Plus, Download,
  Maximize, Trash2, DatabaseZap, BookOpen, Type
} from "lucide-react";
import { useTheme, FONT_LABELS, type AppFont } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { 
  CommandDialog, Command, CommandInput, CommandList, 
  CommandEmpty, CommandGroup, CommandItem, CommandShortcut, 
  CommandSeparator 
} from "@/components/ui/command";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogTrigger
} from "@/components/ui/dialog";
import { Filter } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSocket } from "@/context/SocketContext";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/apiFetch";
import { LogOut } from "lucide-react";

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { theme, setTheme, font, setFont } = useTheme();
  const { isConnected } = useSocket();
  const { authRequired, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSpinning, setIsSpinning] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [tables, setTables] = useState<string[]>([]);
  
  const isExplorer = location.pathname.startsWith("/explorer");
  const selectedTable = location.pathname.split("/")[2] || "";
  const searchQuery = searchParams.get("q") || "";

  useEffect(() => {
    apiFetch("/api/tables")
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(setTables)
      .catch(err => {
        console.error("MainLayout: Failed to fetch tables", err);
      });

    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCmdOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const forceRefresh = () => {
    setIsSpinning(true);
    window.location.reload();
  };

  const navItems = [
    { name: "Explorer", path: "/explorer", icon: LayoutDashboard },
    { name: "SQL Lab", path: "/sql-lab", icon: Terminal },
    { name: "Schema", path: "/schema", icon: BookOpen },
  ];

  return (
    <div className="h-screen bg-background text-foreground font-sans selection:bg-foreground/5 flex flex-col antialiased overflow-hidden">
      {/* Command Palette */}
      <CommandDialog open={cmdOpen} onOpenChange={setCmdOpen}>
        <Command className="rounded-none border-none shadow-none bg-transparent">
          <CommandInput 
            placeholder="Type a command or search tables..." 
            value={searchQuery}
            onValueChange={(val) => setSearchParams({ q: val }, { replace: true })}
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Modes">
              <CommandItem onSelect={() => { navigate("/explorer"); setCmdOpen(false); }}>
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>Table Explorer</span>
              </CommandItem>
              <CommandItem onSelect={() => { navigate("/sql-lab"); setCmdOpen(false); }}>
                <Terminal className="mr-2 h-4 w-4" />
                <span>SQL Lab</span>
                <CommandShortcut>⌘S</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Tables">
              {tables.map(table => (
                <CommandItem key={table} onSelect={() => { navigate(`/explorer/${table}`); setCmdOpen(false); }}>
                  <TableIcon className="mr-2 h-4 w-4" />
                  <span>{table}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>

      {/* THE SINGLE ULTIMATE HEADER - Unified High-Density Bar */}
      <header className="border-b bg-background/60 backdrop-blur-2xl px-6 py-2.5 flex items-center justify-between z-[40] shadow-[0_1px_20px_-10px_rgba(0,0,0,0.1)] transition-all">
        {/* Left: Branding & Nav */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3">
            <motion.div 
              whileHover={{ scale: 1.05, rotate: 5 }}
              className="bg-foreground text-background p-1.5 rounded-lg shadow-sm cursor-pointer"
              onClick={() => navigate("/")}
            >
              <Database className="w-4 h-4" />
            </motion.div>
            <div className="flex flex-col">
              <h1 className="text-[12px] font-black tracking-tighter uppercase leading-none">Ascadis</h1>
              <span className="text-[8px] font-bold text-muted-foreground/40 uppercase tracking-widest mt-0.5">Systems</span>
            </div>
          </div>

          <div className="h-4 w-px bg-border/40 mx-1" />

          <nav className="flex items-center gap-1 bg-muted/20 p-1 rounded-lg border border-foreground/5">
            {navItems.map((item) => (
              <Button
                key={item.path}
                variant={location.pathname.startsWith(item.path) ? "secondary" : "ghost"}
                size="sm"
                onClick={() => navigate(item.path)}
                className="h-7 px-3 rounded-md text-[9px] font-black uppercase tracking-wider gap-2 transition-all"
              >
                <item.icon className="size-3.5" />
                <span className="hidden lg:inline">{item.name}</span>
              </Button>
            ))}
          </nav>
        </div>

        {/* Center: Contextual Controls (Dynamic) */}
        <div className="flex-1 flex justify-center max-w-2xl px-4">
          {isExplorer && (
            <div className="flex items-center gap-2 w-full bg-muted/20 rounded-xl border border-foreground/5 p-1 shadow-inner">
              <Select 
                value={selectedTable} 
                onValueChange={(val) => navigate(`/explorer/${val}`)}
              >
                <SelectTrigger className="w-72 h-7 rounded-lg bg-background border-none hover:bg-muted/30 transition-all font-bold uppercase text-[9px] tracking-widest px-3 shadow-sm">
                  <SelectValue placeholder="Table" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-foreground/10 bg-background/95 backdrop-blur-xl max-h-96">
                  <ScrollArea className="h-72">
                    <div className="p-2 space-y-1">
                      {tables.map(table => (
                        <SelectItem 
                          key={table} 
                          value={table}
                          className="rounded-lg h-8 uppercase text-[9px] font-black tracking-widest  cursor-pointer px-3"
                        >
                          {table}
                        </SelectItem>
                      ))}
                    </div>
                  </ScrollArea>
                </SelectContent>
              </Select>

              <div className="w-px h-3 bg-border/20 mx-0.5" />

              <Button
                variant="ghost"
                className="flex-1 h-7 justify-start px-3 text-muted-foreground/40 hover:text-foreground/60 transition-all font-medium text-[11px] uppercase tracking-wider"
                onClick={() => setCmdOpen(true)}
              >
                <Search className="size-3 mr-2 opacity-30" />
                Global Search...
                <span className="ml-auto opacity-20 text-[8px] font-black">⌘K</span>
              </Button>
            </div>
          )}
        </div>

        {/* Right: Consolidated Settings */}
        <div className="flex items-center gap-1.5">
          <div className={cn("size-2 rounded-full mr-2", isConnected ? "bg-success shadow-[0_0_8px_var(--success)] animate-pulse" : "bg-destructive")} title={isConnected ? "Operational" : "Offline"} />
          
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-9 rounded-xl border-foreground/5 bg-background shadow-sm hover:bg-muted transition-all active:scale-90"
              >
                <Settings className="size-4 opacity-60" />
              </Button>
            </DialogTrigger>
            <DialogContent className="w-80 p-0 rounded-2xl border-foreground/10 shadow-2xl bg-background/95 backdrop-blur-xl overflow-hidden" showCloseButton={false}>
              <div className="p-2 max-h-[80vh] overflow-y-auto grid gap-1">
                <div className="px-3 py-2 text-[9px] font-black uppercase tracking-widest opacity-30">Global Interface</div>
                
                <Button 
                  onClick={() => setCmdOpen(true)}
                  variant="ghost" 
                  className="w-full justify-start h-10 rounded-xl gap-3 text-[10px] font-bold uppercase tracking-wider"
                >
                  <CommandIcon className="size-4 opacity-50" />
                  System Commands
                  <span className="ml-auto opacity-20 text-[8px]">⌘K</span>
                </Button>

                <Button 
                  onClick={() => navigate("/config")}
                  variant="ghost" 
                  className="w-full justify-start h-10 rounded-xl gap-3 text-[10px] font-bold uppercase tracking-wider"
                >
                  <DatabaseZap className="size-4 text-primary" />
                  Link Database
                </Button>

                <Button 
                   onClick={forceRefresh}
                  variant="ghost" 
                  className="w-full justify-start h-10 rounded-xl gap-3 text-[10px] font-bold uppercase tracking-wider"
                >
                  <RefreshCw className={cn("size-4 opacity-50", isSpinning && "animate-spin")} />
                  Force Refresh
                </Button>

                <Button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  variant="ghost"
                  className="w-full justify-start h-10 rounded-xl gap-3 text-[10px] font-bold uppercase tracking-wider"
                >
                  {theme === "dark" ? <Sun className="size-4 text-warning" /> : <Moon className="size-4 text-primary" />}
                  Theme: {theme === "dark" ? "Light" : "Dark"}
                </Button>

                <div className="px-1">
                  <div className="px-2 pb-1 text-[9px] font-black uppercase tracking-widest opacity-30 flex items-center gap-1.5"><Type className="size-3" />Font Family</div>
                  <div className="grid grid-cols-1 gap-0.5">
                    {(Object.keys(FONT_LABELS) as AppFont[]).map((f) => (
                      <Button
                        key={f}
                        variant={font === f ? "secondary" : "ghost"}
                        className="w-full justify-start h-8 rounded-lg text-[10px] font-semibold tracking-wide px-3"
                        onClick={() => setFont(f)}
                      >
                        <span style={{ fontFamily: f === "geist" ? "'Geist Variable', sans-serif" : f === "inter" ? "'Inter', sans-serif" : f === "jetbrains-mono" ? "'JetBrains Mono', monospace" : f === "ibm-plex" ? "'IBM Plex Sans', sans-serif" : "system-ui" }}>
                          {FONT_LABELS[f]}
                        </span>
                        {font === f && <span className="ml-auto text-primary text-[8px]">✓</span>}
                      </Button>
                    ))}
                  </div>
                </div>

                {isExplorer && (
                  <>
                    <div className="h-px bg-border/50 my-1 mx-2" />
                    <div className="px-3 py-2 text-[9px] font-black uppercase tracking-widest opacity-30">Explorer Operations</div>
                    
                    <Button 
                      onClick={() => window.dispatchEvent(new CustomEvent('explorer:add'))}
                      variant="ghost" 
                      className="w-full justify-start h-10 rounded-xl gap-3 text-[10px] font-bold uppercase tracking-wider"
                    >
                      <Plus className="size-4 text-success" />
                      Add New Record
                    </Button>

                    <Button
                      onClick={() => window.dispatchEvent(new CustomEvent('explorer:export:csv'))}
                      variant="ghost"
                      className="w-full justify-start h-10 rounded-xl gap-3 text-[10px] font-bold uppercase tracking-wider"
                    >
                      <Download className="size-4 opacity-50" />
                      Export to CSV
                    </Button>

                    <Button
                      onClick={() => window.dispatchEvent(new CustomEvent('explorer:export:json'))}
                      variant="ghost"
                      className="w-full justify-start h-10 rounded-xl gap-3 text-[10px] font-bold uppercase tracking-wider"
                    >
                      <Download className="size-4 opacity-50" />
                      Export to JSON
                    </Button>

                    <Button
                      onClick={() => window.dispatchEvent(new CustomEvent('explorer:filter:toggle'))}
                      variant="ghost"
                      className="w-full justify-start h-10 rounded-xl gap-3 text-[10px] font-bold uppercase tracking-wider"
                    >
                      <Filter className="size-4 opacity-50" />
                      Toggle Column Filters
                    </Button>

                    <Button 
                      onClick={() => window.dispatchEvent(new CustomEvent('explorer:zen:toggle'))}
                      variant="ghost" 
                      className="w-full justify-start h-10 rounded-xl gap-3 text-[10px] font-bold uppercase tracking-wider"
                    >
                      <Maximize className="size-4 opacity-50" />
                      Toggle Zen Mode
                    </Button>

                    <Button 
                      onClick={() => window.dispatchEvent(new CustomEvent('explorer:truncate'))}
                      variant="ghost" 
                      className="w-full justify-start h-10 rounded-xl gap-3 text-[10px] font-bold uppercase tracking-wider text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4" />
                      Purge All Data
                    </Button>
                  </>
                )}

                {authRequired && (
                  <>
                    <div className="h-px bg-border/50 my-1 mx-2" />
                    <Button
                      onClick={logout}
                      variant="ghost"
                      className="w-full justify-start h-10 rounded-xl gap-3 text-[10px] font-bold uppercase tracking-wider text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <LogOut className="size-4" />
                      Sign Out
                    </Button>
                  </>
                )}

                <div className="h-px bg-border/50 my-1 mx-2" />
                <div className="px-3 py-2 text-[9px] font-black uppercase tracking-widest opacity-30">Quick Access</div>

                <div className="flex gap-1 px-1">
                  <Button 
                    variant="secondary" 
                    className="flex-1 h-9 rounded-lg text-[9px] font-black uppercase tracking-tight"
                    onClick={() => navigate("/explorer")}
                  >Explorer</Button>
                  <Button 
                    variant="secondary" 
                    className="flex-1 h-9 rounded-lg text-[9px] font-black uppercase tracking-tight"
                    onClick={() => navigate("/sql-lab")}
                  >SQL Lab</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="flex-1 w-full overflow-hidden min-h-0 flex flex-col">
        {children}
      </main>
    </div>
  );
};
