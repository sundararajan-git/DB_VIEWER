import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";
export type AppFont = "geist" | "inter" | "jetbrains-mono" | "ibm-plex" | "system";

const FONT_MAP: Record<AppFont, string> = {
  geist: "'Geist Variable', sans-serif",
  inter: "'Inter Variable', sans-serif",
  "jetbrains-mono": "'JetBrains Mono Variable', monospace",
  "ibm-plex": "'IBM Plex Sans', sans-serif",
  system: "system-ui, -apple-system, sans-serif",
};

export const FONT_LABELS: Record<AppFont, string> = {
  geist: "Geist",
  inter: "Inter",
  "jetbrains-mono": "JetBrains Mono",
  "ibm-plex": "IBM Plex Sans",
  system: "System Default",
};

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  font: AppFont;
  setFont: (font: AppFont) => void;
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
  font: "geist",
  setFont: () => null,
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

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemTheme);
      return;
    }
    root.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--font-app", FONT_MAP[font]);
    document.documentElement.style.fontFamily = FONT_MAP[font];
    document.body.style.fontFamily = FONT_MAP[font];
  }, [font]);

  return (
    <ThemeProviderContext.Provider
      {...props}
      value={{
        theme,
        setTheme: (t) => { localStorage.setItem(storageKey, t); setTheme(t); },
        font,
        setFont: (f) => { localStorage.setItem(fontStorageKey, f); setFont(f); },
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
