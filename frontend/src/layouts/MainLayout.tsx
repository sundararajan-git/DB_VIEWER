import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  RefreshCw, LayoutDashboard, Terminal, Sun, Moon,
  Table as TableIcon, Plus, Download,
  Maximize, Trash2, DatabaseZap, BookOpen, Type, Filter,
  LogOut,
} from "lucide-react";
import { useTheme, FONT_LABELS, type AppFont } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import {
  CommandDialog, Command, CommandInput, CommandList,
  CommandEmpty, CommandGroup, CommandItem, CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/apiFetch";

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { theme, setTheme, font, setFont } = useTheme();
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
      .catch(err => console.error("MainLayout: Failed to fetch tables", err));

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

  const dispatch = (event: string) => {
    window.dispatchEvent(new CustomEvent(event));
    setCmdOpen(false);
  };

  return (
    <div className="h-screen bg-background text-foreground font-sans selection:bg-foreground/5 flex flex-col antialiased overflow-hidden">
      {/* Command Palette — houses all navigation, table switching, actions, and settings */}
      <CommandDialog open={cmdOpen} onOpenChange={setCmdOpen}>
        <Command className="rounded-none border-none shadow-none bg-transparent">
          <CommandInput
            placeholder="Search tables, navigate, or run actions..."
            value={searchQuery}
            onValueChange={(val) => setSearchParams({ q: val }, { replace: true })}
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            {/* Navigation */}
            <CommandGroup heading="Navigate">
              <CommandItem onSelect={() => { navigate("/explorer"); setCmdOpen(false); }}>
                <LayoutDashboard className="mr-2 h-4 w-4 opacity-50" />
                <span>Explorer</span>
              </CommandItem>
              <CommandItem onSelect={() => { navigate("/sql-lab"); setCmdOpen(false); }}>
                <Terminal className="mr-2 h-4 w-4 opacity-50" />
                <span>SQL Lab</span>
                <CommandShortcut>⌘S</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => { navigate("/schema"); setCmdOpen(false); }}>
                <BookOpen className="mr-2 h-4 w-4 opacity-50" />
                <span>Schema</span>
              </CommandItem>
            </CommandGroup>

            {/* Tables */}
            <CommandSeparator />
            <CommandGroup heading="Tables">
              {tables.map(table => (
                <CommandItem key={table} onSelect={() => { navigate(`/explorer/${table}`); setCmdOpen(false); }}>
                  <TableIcon className="mr-2 h-4 w-4 opacity-40" />
                  <span>{table}</span>
                  {table === selectedTable && <CommandShortcut>current</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>

            {/* Explorer actions — only shown when on an explorer table */}
            {isExplorer && selectedTable && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Actions">
                  <CommandItem onSelect={() => dispatch("explorer:add")}>
                    <Plus className="mr-2 h-4 w-4 opacity-50" />
                    <span>New Row</span>
                    <CommandShortcut>⌘N</CommandShortcut>
                  </CommandItem>
                  <CommandItem onSelect={() => dispatch("explorer:filter:toggle")}>
                    <Filter className="mr-2 h-4 w-4 opacity-50" />
                    <span>Toggle Column Filters</span>
                  </CommandItem>
                  <CommandItem onSelect={() => dispatch("explorer:export:csv")}>
                    <Download className="mr-2 h-4 w-4 opacity-50" />
                    <span>Export CSV</span>
                  </CommandItem>
                  <CommandItem onSelect={() => dispatch("explorer:export:json")}>
                    <Download className="mr-2 h-4 w-4 opacity-50" />
                    <span>Export JSON</span>
                  </CommandItem>
                  <CommandItem onSelect={() => dispatch("explorer:zen:toggle")}>
                    <Maximize className="mr-2 h-4 w-4 opacity-50" />
                    <span>Zen Mode</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => dispatch("explorer:truncate")}
                    className="text-destructive data-[selected=true]:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span>Truncate Table</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            {/* Settings */}
            <CommandSeparator />
            <CommandGroup heading="Settings">
              <CommandItem onSelect={() => { navigate("/config"); setCmdOpen(false); }}>
                <DatabaseZap className="mr-2 h-4 w-4 opacity-50 text-primary" />
                <span>Connect Database</span>
              </CommandItem>
              <CommandItem onSelect={() => { setTheme(theme === "dark" ? "light" : "dark"); setCmdOpen(false); }}>
                {theme === "dark"
                  ? <Sun className="mr-2 h-4 w-4 opacity-50 text-warning" />
                  : <Moon className="mr-2 h-4 w-4 opacity-50" />}
                <span>{theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}</span>
              </CommandItem>
              <CommandItem onSelect={() => { forceRefresh(); setCmdOpen(false); }}>
                <RefreshCw className={cn("mr-2 h-4 w-4 opacity-50", isSpinning && "animate-spin")} />
                <span>Force Refresh</span>
              </CommandItem>
              {(Object.keys(FONT_LABELS) as AppFont[]).map((f) => (
                <CommandItem key={f} onSelect={() => { setFont(f); setCmdOpen(false); }}>
                  <Type className="mr-2 h-4 w-4 opacity-40" />
                  <span style={{ fontFamily: f === "geist" ? "'Geist Variable', sans-serif" : f === "inter" ? "'Inter Variable', sans-serif" : f === "jetbrains-mono" ? "'JetBrains Mono Variable', monospace" : f === "ibm-plex" ? "'IBM Plex Sans', sans-serif" : "system-ui" }}>
                    {FONT_LABELS[f]}
                  </span>
                  {font === f && <CommandShortcut>active</CommandShortcut>}
                </CommandItem>
              ))}
              {authRequired && (
                <CommandItem
                  onSelect={() => { logout(); setCmdOpen(false); }}
                  className="text-destructive data-[selected=true]:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign Out</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>

      <main className="flex-1 w-full overflow-hidden min-h-0 flex flex-col">
        {children}
      </main>
    </div>
  );
};
