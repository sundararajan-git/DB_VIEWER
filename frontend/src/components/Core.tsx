import React from "react";

/* ---------- ICONS (lucide-style line glyphs from Design/core.jsx) ---------- */
export const PATHS: Record<string, string> = {
  search: "M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0|M21 21l-4.3-4.3",
  command: "M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3",
  database: "M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3|M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5|M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3",
  table: "M3 3h18v18H3z|M3 9h18|M3 15h18|M9 3v18|M15 3v18",
  code: "M16 18l6-6-6-6|M8 6l-6 6 6 6",
  terminal: "M4 17l6-6-6-6|M12 19h8",
  columns: "M3 3h18v18H3z|M12 3v18",
  plus: "M12 5v14|M5 12h14",
  x: "M18 6 6 18|M6 6l12 12",
  chevL: "M15 18l-6-6 6-6",
  chevR: "M9 18l6-6-6-6",
  chevD: "M6 9l6 6 6-6",
  arrowUp: "M12 19V5|M5 12l7-7 7 7",
  arrowDown: "M12 5v14|M19 12l-7 7-7-7",
  sort: "M8 4v16|M5 8l3-4 3 4|M16 20V4|M13 16l3 4 3-4",
  grip: "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
  key: "M15.5 7.5a4 4 0 1 1-5.4 5.4L4 19l2 2|M14 8l3 3",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5|M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5",
  unlink: "M17 7l3-3a4 4 0 0 0-6-6l0 0|M7 17l-3 3|M15 7l2 2|M9 15l-2-2|M5 3l16 18",
  wifi: "M5 13a10 10 0 0 1 14 0|M8.5 16.5a5 5 0 0 1 7 0|M12 20h.01|M2 8.8a15 15 0 0 1 20 0",
  wifiOff: "M2 8.8a15 15 0 0 1 4.2-2.9|M5 13a10 10 0 0 1 5.2-2.7|M8.5 16.5a5 5 0 0 1 5-1.2|M12 20h.01|M2 2l20 20",
  ext: "M15 3h6v6|M10 14 21 3|M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  trash: "M3 6h18|M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2|M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6|M10 11v6|M14 11v6",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z|M17 21v-8H7v8|M7 3v5h8",
  copy: "M9 9h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z|M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  warn: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z|M12 9v4|M12 17h.01",
  alert: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z|M12 8v4|M12 16h.01",
  crash: "M6 10V8a6 6 0 0 1 12 0v2|M4 10h16v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z|M9 15l2 2 4-4",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2|M5.5 5.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.5z",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z|M12 1v2|M12 21v2|M4.2 4.2l1.4 1.4|M18.4 18.4l1.4 1.4|M1 12h2|M21 12h2|M4.2 19.8l1.4-1.4|M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  check: "M20 6 9 17l-5-5",
  refresh: "M21 12a9 9 0 1 1-3-6.7L21 8|M21 3v5h-5",
  filter: "M22 3H2l8 9.5V19l4 2v-8.5L22 3z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M7 10l5 5 5-5|M12 15V3",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z|M12 6v6l4 2",
  zap: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  lock: "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z|M8 11V7a4 4 0 0 1 8 0v4",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z|M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7|M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  layers: "M12 2 2 7l10 5 10-5-10-5z|M2 17l10 5 10-5|M2 12l10 5 10-5",
  maximize: "M8 3H5a2 2 0 0 0-2 2v3|M21 8V5a2 2 0 0 0-2-2h-3|M3 16v3a2 2 0 0 0 2 2h3|M16 21h3a2 2 0 0 0 2-2v-3",
  minimize: "M8 3v3a2 2 0 0 1-2 2H3|M21 8h-3a2 2 0 0 1-2-2V3|M3 16h3a2 2 0 0 1 2 2v3|M16 21v-3a2 2 0 0 1 2-2h3",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9",
  type: "M4 7V4h16v3|M9 20h6|M12 4v16",
  arrowRight: "M5 12h14|M12 5l7 7-7 7",
  play: "M6 3l14 9-14 9V3z",
  hash: "M4 9h16|M4 15h16|M10 3 8 21|M16 3l-2 18",
  history: "M3 3v5h5|M3.05 13A9 9 0 1 0 6 5.3L3 8|M12 7v5l4 2",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z|M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8z",
};

interface IconProps {
  n: string;
  s?: number;
  sw?: number;
  style?: React.CSSProperties;
  className?: string;
  fill?: boolean;
}

export const Icon: React.FC<IconProps> = ({ n, s = 16, sw = 2, style, className, fill = false }) => {
  if (n === "databaseSolid") {
    return (
      <svg
        width={s}
        height={s}
        viewBox="0 0 24 24"
        fill="none"
        style={style}
        className={className}
        aria-hidden="true"
      >
        <ellipse cx="12" cy="5.7" rx="8.4" ry="3.7" fill="currentColor" />
        <path
          d="M3.6 7.2v5.2c0 2.05 3.76 3.7 8.4 3.7s8.4-1.65 8.4-3.7V7.2c-1.52 1.42-4.64 2.2-8.4 2.2s-6.88-.78-8.4-2.2z"
          fill="currentColor"
          opacity="0.82"
        />
        <path
          d="M3.6 13.5v4.8c0 2.05 3.76 3.7 8.4 3.7s8.4-1.65 8.4-3.7v-4.8c-1.52 1.42-4.64 2.2-8.4 2.2s-6.88-.78-8.4-2.2z"
          fill="currentColor"
          opacity="0.64"
        />
      </svg>
    );
  }

  const d = PATHS[n];
  if (!d) return null;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth={fill ? 0 : sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
    >
      {d.split("|").map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
};

/* ---------- small primitives ---------- */
export const Engine: React.FC<{ type: string }> = ({ type }) => {
  return <span className={"eng " + (type === "postgres" ? "pg" : "ms")}>{type === "postgres" ? "PG" : "MS"}</span>;
};

export const TypeBadge: React.FC<{ t: string }> = ({ t }) => {
  const cat = typeCat(t);
  return (
    <span
      className="badge"
      style={{
        color: `var(--t-${cat})`,
        background: `var(--t-${cat}-bg)`,
        borderColor: `var(--t-${cat})` + "33",
      }}
    >
      {t}
    </span>
  );
};

/* ---------- type helpers ---------- */
export function typeCat(t: string): string {
  t = (t || "").toLowerCase();
  if (/int|serial|numeric|decimal|float|real|money|bigint|smallint|int4|int8|int2/.test(t)) return "int";
  if (/bool|bit/.test(t)) return "bool";
  if (/uuid|guid/.test(t)) return "uuid";
  if (/json/.test(t)) return "json";
  if (/date|time|stamp/.test(t)) return "date";
  return "str";
}

/* ---------- cell value formatting helpers ---------- */
export function isJsonVal(v: any): boolean {
  return v !== null && typeof v === "object";
}

export function fmtCell(v: any): { kind: "null" | "json" | "bool" | "text"; label?: string; v?: boolean } {
  if (v === null || v === undefined) return { kind: "null" };
  if (Array.isArray(v)) return { kind: "json", label: `[ ${v.length} ]` };
  if (typeof v === "object") return { kind: "json", label: "{ … }" };
  if (typeof v === "boolean") return { kind: "bool", v };
  return { kind: "text", label: String(v) };
}

export function syntaxJson(obj: any): string {
  const json = JSON.stringify(obj, null, 2);
  return json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(
      /("(\\.|[^"\\])*")(\s*:)?/g,
      (m, _s, _g, colon) =>
        colon ? `<span class="jk">${m.slice(0, -colon.length)}</span>${colon}` : `<span class="jv-s">${m}</span>`
    )
    .replace(/\b(-?\d+\.?\d*)\b/g, '<span class="jv-n">$1</span>')
    .replace(/\b(true|false)\b/g, '<span class="jv-b">$1</span>')
    .replace(/\bnull\b/g, '<span class="jv-null">null</span>');
}
