import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";
export type AppFont = "geist" | "inter" | "jetbrains-mono" | "ibm-plex" | "ibm-plex-mono" | "verdana" | "system";

export const DEFAULT_ACCENT = "#22d3ee";

export const ACCENT_PRESETS = [
  { name: "Cyan",     hex: "#22d3ee" },
  { name: "Blue",     hex: "#60a5fa" },
  { name: "Purple",   hex: "#a78bfa" },
  { name: "Pink",     hex: "#f472b6" },
  { name: "Green",    hex: "#34d399" },
  { name: "Amber",    hex: "#fbbf24" },
  { name: "Orange",   hex: "#fb923c" },
  { name: "Red",      hex: "#f87171" },
] as const;

function applyAccentVars(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const root = document.documentElement;
  root.style.setProperty("--accent",      hex);
  root.style.setProperty("--accent-soft", `rgba(${r},${g},${b},0.12)`);
  root.style.setProperty("--accent-line", `rgba(${r},${g},${b},0.28)`);
}

const FONT_MAP: Record<AppFont, string> = {
  geist: "'Geist Variable', sans-serif",
  inter: "'Inter Variable', sans-serif",
  "jetbrains-mono": "'JetBrains Mono Variable', monospace",
  "ibm-plex": "'IBM Plex Sans', sans-serif",
  "ibm-plex-mono": "'IBM Plex Mono', monospace",
  verdana: "Verdana, sans-serif",
  system: "system-ui, -apple-system, sans-serif",
};

export const FONT_LABELS: Record<AppFont, string> = {
  geist: "Geist",
  inter: "Inter",
  "jetbrains-mono": "JetBrains Mono",
  "ibm-plex": "IBM Plex Sans",
  "ibm-plex-mono": "IBM Plex Mono",
  verdana: "Verdhana",
  system: "System Default",
};

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  font: AppFont;
  setFont: (font: AppFont) => void;
  accentColor: string;
  setAccentColor: (hex: string) => void;
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
  font: "geist",
  setFont: () => null,
  accentColor: DEFAULT_ACCENT,
  setAccentColor: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  fontStorageKey = "vite-ui-font",
  ...props
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  fontStorageKey?: string;
}) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );
  const [font, setFont] = useState<AppFont>(
    () => (localStorage.getItem(fontStorageKey) as AppFont) || "geist"
  );
  const [accentColor, setAccentColorState] = useState<string>(
    () => localStorage.getItem("vite-ui-accent") || DEFAULT_ACCENT
  );

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemTheme);
      root.setAttribute("data-theme", systemTheme);
      return;
    }
    root.classList.add(theme);
    root.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--font-app", FONT_MAP[font]);
    document.documentElement.style.fontFamily = FONT_MAP[font];
    document.body.style.fontFamily = FONT_MAP[font];
  }, [font]);

  useEffect(() => { applyAccentVars(accentColor); }, [accentColor]);

  return (
    <ThemeProviderContext.Provider
      {...props}
      value={{
        theme,
        setTheme: (t) => { localStorage.setItem(storageKey, t); setTheme(t); },
        font,
        setFont: (f) => { localStorage.setItem(fontStorageKey, f); setFont(f); },
        accentColor,
        setAccentColor: (hex: string) => { localStorage.setItem("vite-ui-accent", hex); setAccentColorState(hex); },
      }}
    >
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};
