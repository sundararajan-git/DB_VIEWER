import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useChange, type ChangeEvent } from "@/context/ChangeContext";
import { useConnection } from "@/context/ConnectionContext";
import { Icon, syntaxJson } from "@/components/Core";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChangeSummary {
  tables: number; rows: number; columns: number;
  inserts: number; updates: number; deletes: number;
}
const zeroSummary: ChangeSummary = { tables: 0, rows: 0, columns: 0, inserts: 0, updates: 0, deletes: 0 };

interface GraphNode {
  id: string;
  type: "root" | "table" | "row" | "column";
  label: string; sublabel?: string;
  x: number; y: number;
  color: string;
  isCollapsed?: boolean; canCollapse?: boolean; parentId?: string;
}
interface GraphLink { id: string; source: string; target: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function summarize(ev?: ChangeEvent | null): ChangeSummary {
  if (!ev) return zeroSummary;
  return ev.tables.reduce<ChangeSummary>((s, t) => {
    s.tables++;  s.rows += t.rowCount;
    t.rows.forEach((r) => {
      if (r.operation === "INSERT") s.inserts++;
      if (r.operation === "UPDATE") s.updates++;
      if (r.operation === "DELETE") s.deletes++;
      if (r.operation === "UPDATE") { s.columns += r.changedColumns.length; return; }
      const src = r.after || r.before || {};
      s.columns += Object.keys(src).filter((k) => k !== "__flash" && k !== r.primaryKey).length;
    });
    return s;
  }, { ...zeroSummary });
}

const opColor  = (op: string) => op === "INSERT" ? "var(--green)"            : op === "DELETE" ? "var(--red)"            : "var(--amber)";
const opBg     = (op: string) => op === "INSERT" ? "var(--green-soft)"       : op === "DELETE" ? "var(--red-soft)"       : "var(--amber-soft)";
const opBorder = (op: string) => op === "INSERT" ? "rgba(52,211,153,.25)"    : op === "DELETE" ? "rgba(251,90,106,.25)"  : "rgba(245,177,74,.25)";

// ─── GraphCanvas (interactive canvas with pan / zoom / node-drag / fullscreen) ──

function GraphCanvas({
  nodes, links, nodesMap, selectedRow, onNodeClick, eventId,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  nodesMap: Record<string, GraphNode>;
  selectedRow: { tableName: string; pkValue: any } | null;
  onNodeClick: (n: GraphNode) => void;
  eventId: string | null;
}) {
  const wrapRef  = useRef<HTMLDivElement>(null);
  const [pan,    setPan]    = useState({ x: 100, y: 60 });
  const [zoom,   setZoom]   = useState(0.9);
  const [over,   setOver]   = useState<Record<string, { x: number; y: number }>>({});
  const [panning, setPanning] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [spaceDown,  setSpaceDown]  = useState(false);   // space = temporary hand tool

  const panRef  = useRef({ on: false, sx: 0, sy: 0, spx: 0, spy: 0 });
  const dragRef = useRef<{ id: string | null; sx: number; sy: number; ox: number; oy: number; moved: boolean }>({ id: null, sx: 0, sy: 0, ox: 0, oy: 0, moved: false });

  // Reset node overrides when transaction changes
  useEffect(() => { setOver({}); }, [eventId]);

  // ── Wheel zoom (smooth, low sensitivity) ──────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Normalize deltaY across device types (wheel / trackpad / page-scroll)
      const raw = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      // Very small step per pixel — matches Excalidraw feel
      const step = Math.max(-0.08, Math.min(0.08, -raw * 0.0006));
      const factor = 1 + step;

      setZoom((z) => {
        const nz = Math.max(0.08, Math.min(4, z * factor));
        const ratio = nz / z;
        setPan((p) => ({ x: mx - (mx - p.x) * ratio, y: my - (my - p.y) * ratio }));
        return nz;
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === "Escape")   { setFullscreen(false); }
      if (e.key === " ")        { e.preventDefault(); setSpaceDown(true); }
      if (e.key === "f" || e.key === "F") fitToView();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z * 1.2, 4));
      if (e.key === "-")        setZoom((z) => Math.max(z / 1.2, 0.08));
    };
    const ku = (e: KeyboardEvent) => { if (e.key === " ") { e.preventDefault(); setSpaceDown(false); } };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, []); // eslint-disable-line

  // ── Fit to view ────────────────────────────────────────────────────────────
  const fitToView = useCallback(() => {
    const el = wrapRef.current;
    if (!el || nodes.length === 0) return;
    const { width: W, height: H } = el.getBoundingClientRect();
    const pad = 72;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    nodes.forEach((n) => {
      const p = over[n.id] || { x: n.x, y: n.y };
      const lw = n.type === "column" ? n.label.length * 7 + 16 : n.label.length * 8.5 + 24;
      x0 = Math.min(x0, p.x - 14);
      y0 = Math.min(y0, p.y - 22);
      x1 = Math.max(x1, p.x + lw);
      y1 = Math.max(y1, p.y + 22);
    });
    const cw = x1 - x0, ch = y1 - y0;
    if (cw <= 0 || ch <= 0) return;
    const nz = Math.min((W - pad * 2) / cw, (H - pad * 2) / ch, 2.2);
    setPan({ x: pad - x0 * nz, y: pad - y0 * nz });
    setZoom(Math.max(0.08, nz));
  }, [nodes, over]);

  useEffect(() => { const t = setTimeout(fitToView, 120); return () => clearTimeout(t); }, [nodes.length, eventId]); // eslint-disable-line

  const getPos = (id: string) => {
    const b = nodesMap[id];
    if (!b) return { x: 0, y: 0 };
    return over[id] || { x: b.x, y: b.y };
  };

  // ── Bezier path ────────────────────────────────────────────────────────────
  // Factor MUST be < 0.5 — at 0.5 both CPs share the same x (midpoint), which is
  // fine; above 0.5 CP1.x > CP2.x (crossed), producing the butterfly/loop artefact.
  const curve = (sId: string, tId: string) => {
    if (!nodesMap[sId] || !nodesMap[tId]) return "";
    const s = getPos(sId), t = getPos(tId);
    const dx = Math.max((t.x - s.x) * 0.4, 36);
    return `M ${s.x} ${s.y} C ${s.x + dx} ${s.y}, ${t.x - dx} ${t.y}, ${t.x} ${t.y}`;
  };

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  const onSvgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const tag = (e.target as Element).tagName;
    if (!["svg", "rect"].includes(tag) && !spaceDown) return;
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    panRef.current = { on: true, sx: e.clientX, sy: e.clientY, spx: pan.x, spy: pan.y };
    setPanning(true);
  };

  const onNodeDown = (e: React.MouseEvent, node: GraphNode) => {
    if (spaceDown) { onSvgDown(e as any); return; }
    e.stopPropagation();
    if (e.button !== 0) return;
    const p = getPos(node.id);
    dragRef.current = { id: node.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
  };

  const onMove = (e: React.MouseEvent) => {
    if (panRef.current.on) {
      setPan({ x: panRef.current.spx + (e.clientX - panRef.current.sx), y: panRef.current.spy + (e.clientY - panRef.current.sy) });
    }
    if (dragRef.current.id) {
      const dx = (e.clientX - dragRef.current.sx) / zoom;
      const dy = (e.clientY - dragRef.current.sy) / zoom;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragRef.current.moved = true;
      if (dragRef.current.moved) {
        setOver((p) => ({ ...p, [dragRef.current.id!]: { x: dragRef.current.ox + dx, y: dragRef.current.oy + dy } }));
      }
    }
  };

  const onUp = () => {
    if (panRef.current.on) { panRef.current.on = false; setPanning(false); }
    if (dragRef.current.id) {
      if (!dragRef.current.moved) {
        const n = nodesMap[dragRef.current.id];
        if (n) onNodeClick(n);
      }
      dragRef.current.id = null;
    }
  };

  // ── Stroke gradient for each link ─────────────────────────────────────────
  const linkStroke = (src: GraphNode | undefined, tgt: GraphNode | undefined) => {
    if (!src || !tgt) return "rgba(120,140,180,0.2)";
    if (src.type === "root" && tgt.type === "table") return "url(#gc-rt)";
    if (src.type === "table" && tgt.type === "row") {
      const op = tgt.sublabel || "";
      return op === "INSERT" ? "url(#gc-ti)" : op === "DELETE" ? "url(#gc-td)" : "url(#gc-tu)";
    }
    if (src.type === "row" && tgt.type === "column") {
      return src.sublabel === "INSERT" ? "url(#gc-ci)" : src.sublabel === "DELETE" ? "url(#gc-cd)" : "url(#gc-cu)";
    }
    return "rgba(120,140,180,0.2)";
  };

  // ── Dynamic dot-grid (follows pan & zoom) ─────────────────────────────────
  const dotPx = Math.max(16, 26 * zoom);
  const dotX  = ((pan.x % dotPx) + dotPx) % dotPx;
  const dotY  = ((pan.y % dotPx) + dotPx) % dotPx;

  const cursor = panning || spaceDown ? "grabbing" : "default";

  const wrapStyle: React.CSSProperties = fullscreen
    ? { position: "fixed", inset: 0, zIndex: 1000, background: "var(--bg)" }
    : { flex: 1, position: "relative", overflow: "hidden", background: "var(--bg)" };

  return (
    <div
      ref={wrapRef}
      style={{
        ...wrapStyle,
        backgroundImage: "radial-gradient(circle, rgba(90,120,175,0.2) 1.5px, transparent 1.5px)",
        backgroundSize: `${dotPx}px ${dotPx}px`,
        backgroundPosition: `${dotX}px ${dotY}px`,
        cursor,
      }}
    >
      <svg
        width="100%" height="100%"
        style={{ display: "block", userSelect: "none" }}
        onMouseDown={onSvgDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
      >
        <defs>
          {/* Glow filters */}
          <filter id="gc-hi" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="gc-lo" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* Link gradients */}
          <linearGradient id="gc-rt" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="var(--accent)" /><stop offset="100%" stopColor="#f472b6" /></linearGradient>
          <linearGradient id="gc-ti" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f472b6" /><stop offset="100%" stopColor="var(--green)" /></linearGradient>
          <linearGradient id="gc-tu" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f472b6" /><stop offset="100%" stopColor="var(--amber)" /></linearGradient>
          <linearGradient id="gc-td" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f472b6" /><stop offset="100%" stopColor="var(--red)" /></linearGradient>
          <linearGradient id="gc-ci" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="var(--green)" /><stop offset="100%" stopColor="rgba(52,211,153,.5)" /></linearGradient>
          <linearGradient id="gc-cu" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="var(--amber)" /><stop offset="100%" stopColor="rgba(52,211,153,.5)" /></linearGradient>
          <linearGradient id="gc-cd" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="var(--red)" /><stop offset="100%" stopColor="rgba(251,90,106,.4)" /></linearGradient>
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

          {/* ── Links ───────────────────────────────────────────────── */}
          {links.map((lk) => {
            const path = curve(lk.source, lk.target);
            if (!path) return null;
            const src = nodesMap[lk.source];
            const tgt = nodesMap[lk.target];
            const isSel = !!(selectedRow && (
              lk.source.startsWith(`row::${selectedRow.tableName}::${selectedRow.pkValue}`) ||
              lk.target.startsWith(`row::${selectedRow.tableName}::${selectedRow.pkValue}`)
            ));
            return (
              <path key={lk.id} d={path} fill="none"
                stroke={isSel ? "var(--accent)" : linkStroke(src, tgt)}
                strokeWidth={isSel ? 2.5 : 1.8}
                opacity={isSel ? 1 : 0.75}
                style={{ pointerEvents: "none" }}
              />
            );
          })}

          {/* ── Nodes ───────────────────────────────────────────────── */}
          {nodes.map((node) => {
            const pos   = getPos(node.id);
            const isSel = !!(selectedRow && node.id.startsWith(`row::${selectedRow.tableName}::${selectedRow.pkValue}`));
            const isHov = hovered === node.id;
            const r     = node.type === "root" ? 12 : node.type === "table" ? 9 : node.type === "row" ? 7 : 4.5;
            const isRow = node.type === "row";

            return (
              <g key={node.id}
                transform={`translate(${pos.x},${pos.y})`}
                style={{ cursor: spaceDown ? "grabbing" : "pointer" }}
                onMouseDown={(e) => onNodeDown(e, node)}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Selection / hover aura */}
                {(isSel || isHov) && (
                  <circle r={r + 8}
                    fill={isSel ? "rgba(34,211,238,0.07)" : "rgba(255,255,255,0.04)"}
                    stroke={isSel ? "rgba(34,211,238,0.22)" : "rgba(255,255,255,0.07)"}
                    strokeWidth={1}
                    style={{ pointerEvents: "none" }}
                  />
                )}

                {/* Node ring */}
                <circle r={r}
                  fill={node.isCollapsed ? node.color : "var(--surface)"}
                  stroke={node.color}
                  strokeWidth={isSel ? 2.5 : isHov ? 2.2 : 1.8}
                  filter={isSel ? "url(#gc-hi)" : isHov ? "url(#gc-lo)" : undefined}
                />

                {/* Collapse hint */}
                {node.canCollapse && node.isCollapsed && (
                  <text x={0} y={-r - 5} textAnchor="middle"
                    style={{ fontSize: "11px", fill: node.color, fontWeight: 700, userSelect: "none", pointerEvents: "none" }}>+</text>
                )}

                {/* Row layout: badge on top, label below */}
                {isRow ? (
                  <>
                    <rect x={r + 7} y={-11} width={(node.sublabel?.length || 0) * 6.5 + 12} height={14} rx={4}
                      fill={opBg(node.sublabel || "")} stroke={opBorder(node.sublabel || "")} strokeWidth={0.75}
                      style={{ pointerEvents: "none" }} />
                    <text x={r + 13} y={0}
                      style={{ fontSize: "8.5px", fill: opColor(node.sublabel || ""), fontWeight: 700, letterSpacing: ".07em", userSelect: "none", pointerEvents: "none" }}>
                      {node.sublabel}
                    </text>
                    <text x={r + 7} y={14}
                      style={{ fontSize: "11.5px", fill: isSel ? "var(--accent)" : isHov ? "var(--text)" : "var(--text-dim)", fontWeight: isSel ? 700 : 500, fontFamily: "monospace", userSelect: "none", pointerEvents: "none" }}>
                      {node.label}
                    </text>
                  </>
                ) : (
                  <>
                    <text x={r + 8} y={5}
                      style={{ fontSize: node.type === "root" ? "13px" : node.type === "column" ? "10.5px" : "12.5px", fill: isSel ? "var(--accent)" : isHov ? "var(--text)" : node.type === "column" ? "var(--text-dim)" : "var(--text)", fontWeight: node.type === "root" ? 700 : node.type === "table" ? 650 : 450, fontFamily: node.type === "column" ? "monospace" : "inherit", userSelect: "none", pointerEvents: "none" }}>
                      {node.label}
                    </text>
                    {node.sublabel && (
                      <text x={r + 8} y={18}
                        style={{ fontSize: "9px", fill: "var(--text-faint)", userSelect: "none", pointerEvents: "none" }}>
                        {node.sublabel}
                      </text>
                    )}
                  </>
                )}
                <title>{node.label}{node.sublabel ? ` · ${node.sublabel}` : ""}</title>
              </g>
            );
          })}
        </g>
      </svg>

      {/* ── Fullscreen header bar (only in fullscreen mode) ──────────── */}
      {fullscreen && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 44, padding: "0 16px", background: "rgba(12,14,18,.85)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, zIndex: 10 }}>
          <Icon n="layers" s={14} style={{ color: "var(--accent)" }} />
          <span style={{ fontWeight: 700, fontSize: "13px" }}>State Graph</span>
          <span style={{ fontSize: "11px", color: "var(--text-faint)", marginLeft: 4 }}>Fullscreen</span>
          <button className="btn sm ghost" style={{ marginLeft: "auto", height: 28, padding: "0 10px", color: "var(--text-dim)" }} onClick={() => setFullscreen(false)}>
            <Icon n="x" s={13} /> <span style={{ marginLeft: 4 }}>Exit  (Esc)</span>
          </button>
        </div>
      )}

      {/* ── Hint bar (bottom-left) ────────────────────────────────────── */}
      <div style={{ position: "absolute", bottom: 14, left: 14, fontSize: "10px", color: "var(--text-faint)", userSelect: "none", pointerEvents: "none", letterSpacing: ".02em", lineHeight: 1.7 }}>
        <div>Scroll to zoom · Drag canvas or <kbd style={{ padding: "0 4px", borderRadius: 3, border: "1px solid var(--border)", fontSize: "9px", background: "var(--surface-2)" }}>Space</kbd> + drag to pan</div>
        <div>Drag nodes to reposition · Click to collapse · <kbd style={{ padding: "0 4px", borderRadius: 3, border: "1px solid var(--border)", fontSize: "9px", background: "var(--surface-2)" }}>F</kbd> fit</div>
      </div>

      {/* ── Controls toolbar (bottom-right) ──────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 14, right: 14,
        display: "flex", alignItems: "center", gap: 3,
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "5px 7px",
        boxShadow: "0 6px 24px rgba(0,0,0,.35)",
      }}>
        {/* Zoom out */}
        <button
          title="Zoom out (−)"
          style={{ width: 28, height: 28, border: "none", borderRadius: 6, background: "transparent", color: "var(--text-dim)", cursor: "pointer", fontSize: "18px", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setZoom((z) => Math.max(z / 1.3, 0.08))}
        >−</button>

        {/* Zoom level (click to reset to 100%) */}
        <button
          title="Reset zoom to 100%"
          onClick={() => { const el = wrapRef.current; if (!el) return; const { width: W, height: H } = el.getBoundingClientRect(); setPan({ x: W / 2, y: H / 2 }); setZoom(1); }}
          style={{ minWidth: 44, height: 24, padding: "0 4px", border: "1px solid var(--border-soft)", borderRadius: 5, background: "var(--bg)", color: "var(--text-dim)", fontFamily: "monospace", fontSize: "10.5px", cursor: "pointer", textAlign: "center" }}
        >{Math.round(zoom * 100)}%</button>

        {/* Zoom in */}
        <button
          title="Zoom in (+)"
          style={{ width: 28, height: 28, border: "none", borderRadius: 6, background: "transparent", color: "var(--text-dim)", cursor: "pointer", fontSize: "18px", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setZoom((z) => Math.min(z * 1.3, 4))}
        >+</button>

        <div style={{ width: 1, height: 18, background: "var(--border-soft)", margin: "0 2px" }} />

        {/* Fit */}
        <button
          title="Fit all nodes in view (F)"
          className="btn sm ghost"
          style={{ height: 26, padding: "0 9px", fontSize: "10.5px" }}
          onClick={fitToView}
        >Fit</button>

        {/* Reset layout */}
        <button
          title="Reset node positions"
          className="btn sm ghost"
          style={{ height: 26, padding: "0 9px", fontSize: "10.5px" }}
          onClick={() => { setOver({}); setTimeout(fitToView, 30); }}
        >Reset</button>

        <div style={{ width: 1, height: 18, background: "var(--border-soft)", margin: "0 2px" }} />

        {/* Fullscreen toggle */}
        <button
          title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
          className="btn sm ghost"
          style={{ height: 26, width: 28, padding: 0, color: fullscreen ? "var(--accent)" : "var(--text-dim)", background: fullscreen ? "var(--accent-soft)" : "transparent", borderColor: fullscreen ? "var(--accent-line)" : "transparent" }}
          onClick={() => setFullscreen((v) => !v)}
        >
          {fullscreen ? (
            // compress icon
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>
          ) : (
            // expand icon
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ChangesDevTools() {
  const { changeEvents, autoCapture, setAutoCapture, rowHistory, clearEvents, addMockTransaction } = useChange();
  const { connections, activeConnectionId } = useConnection();
  const activeConn = useMemo(() => connections.find((c) => c.id === activeConnectionId), [connections, activeConnectionId]);

  const [selectedEventId,    setSelectedEventId]    = useState<string | null>(null);
  const [jumpedEventId,      setJumpedEventId]      = useState<string | null>(null);
  const [searchQuery,        setSearchQuery]        = useState("");
  const [activeTab,          setActiveTab]          = useState<"graph"|"diff"|"json">("graph");
  const [selectedRow,        setSelectedRow]        = useState<{ tableName: string; pkValue: any } | null>(null);
  const [selectedVersionNum, setSelectedVersionNum] = useState<number | null>(null);
  const [collapsedKeys,      setCollapsedKeys]      = useState<Set<string>>(new Set());
  const [showUnchangedDiff,  setShowUnchangedDiff]  = useState(false);
  const [drawerOpen,         setDrawerOpen]         = useState(true);
  const [selectedDiffTable,  setSelectedDiffTable]  = useState<string | null>(null);

  useEffect(() => {
    if (changeEvents.length > 0 && !selectedEventId && !jumpedEventId) setSelectedEventId(changeEvents[0].id);
  }, [changeEvents, selectedEventId, jumpedEventId]);

  // Reset diff sub-tab when active event changes
  useEffect(() => {
    setSelectedDiffTable(null);
  }, [changeEvents, selectedEventId, jumpedEventId]);

  const jumpedIndex = useMemo(() => jumpedEventId ? changeEvents.findIndex((e) => e.id === jumpedEventId) : -1, [changeEvents, jumpedEventId]);
  const activeEvent = useMemo(() => {
    const tid = jumpedEventId || selectedEventId;
    return tid ? changeEvents.find((e) => e.id === tid) || null : changeEvents[0] || null;
  }, [changeEvents, jumpedEventId, selectedEventId]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return changeEvents;
    return changeEvents.filter((e) =>
      e.id.toLowerCase().includes(q) || e.source.toLowerCase().includes(q) ||
      e.tables.some((t) => t.tableName.toLowerCase().includes(q) || t.rows.some((r) => String(r.pkValue).toLowerCase().includes(q) || r.changedColumns.some((c) => c.toLowerCase().includes(q))))
    );
  }, [changeEvents, searchQuery]);

  const totalStats  = useMemo(() => changeEvents.reduce((s, ev) => { const es = summarize(ev); s.tables += es.tables; s.rows += es.rows; s.columns += es.columns; s.inserts += es.inserts; s.updates += es.updates; s.deletes += es.deletes; return s; }, { ...zeroSummary }), [changeEvents]);
  const activeStats = useMemo(() => summarize(activeEvent), [activeEvent]);

  const handleSweep = () => { setJumpedEventId(null); setSelectedRow(null); setSelectedVersionNum(null); if (changeEvents.length > 0) setSelectedEventId(changeEvents[0].id); };
  const handleClear = () => { clearEvents(); setSelectedEventId(null); setJumpedEventId(null); setSelectedRow(null); setSelectedVersionNum(null); };
  const toggleCollapse = (key: string) => setCollapsedKeys((p) => { const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const fmtVal = (v: any) => { if (v === null || v === undefined) return "null"; if (typeof v === "object") return JSON.stringify(v); if (typeof v === "string") return `"${v}"`; return String(v); };

  // ── Graph data ─────────────────────────────────────────────────────────────
  const graphData = useMemo(() => {
    if (!activeEvent) return { nodes: [] as GraphNode[], links: [] as GraphLink[], nodesMap: {} as Record<string, GraphNode> };
    const nodesMap: Record<string, GraphNode> = {};
    const links: GraphLink[] = [];
    const dbName = activeConn?.database || "Database";

    nodesMap["root"] = { id: "root", type: "root", label: dbName, sublabel: activeConn?.type === "postgres" ? "PostgreSQL" : activeConn?.type ? "MSSQL" : "Offline", x: 60, y: 0, color: "var(--accent)" };

    activeEvent.tables.forEach((table) => {
      const tid = `table::${table.tableName}`;
      const isTC = collapsedKeys.has(tid);
      nodesMap[tid] = { id: tid, type: "table", label: table.tableName, sublabel: `${table.rowCount} rows`, x: 220, y: 0, color: "#f472b6", isCollapsed: isTC, canCollapse: true, parentId: "root" };
      links.push({ id: `L::root::${tid}`, source: "root", target: tid });
      if (isTC) return;

      table.rows.forEach((row) => {
        const rid = `row::${table.tableName}::${row.pkValue}`;
        const isRC = collapsedKeys.has(rid);
        nodesMap[rid] = { id: rid, type: "row", label: `id=${row.pkValue}`, sublabel: row.operation, x: 390, y: 0, color: opColor(row.operation), isCollapsed: isRC, canCollapse: true, parentId: tid };
        links.push({ id: `L::${tid}::${rid}`, source: tid, target: rid });
        if (isRC) return;

        const cols: { name: string; label: string }[] = [];
        if (row.operation === "UPDATE") row.changedColumns.forEach((c) => cols.push({ name: c, label: `${c}: ${fmtVal(row.before?.[c])} → ${fmtVal(row.after?.[c])}` }));
        else if (row.operation === "INSERT" && row.after) Object.keys(row.after).forEach((k) => { if (k !== "__flash" && k !== row.primaryKey) cols.push({ name: k, label: `${k}: ${fmtVal(row.after?.[k])}` }); });
        else if (row.operation === "DELETE" && row.before) Object.keys(row.before).forEach((k) => { if (k !== row.primaryKey) cols.push({ name: k, label: `${k}: ${fmtVal(row.before?.[k])}` }); });

        cols.forEach((col) => {
          const cid = `col::${table.tableName}::${row.pkValue}::${col.name}`;
          nodesMap[cid] = { id: cid, type: "column", label: col.label, x: 560, y: 0, color: opColor(row.operation), parentId: rid };
          links.push({ id: `L::${rid}::${cid}`, source: rid, target: cid });
        });
      });
    });

    // Lay out Y positions via leaf-indexing + recursive average
    const leafs: string[] = [];
    const findLeafs = (id: string) => {
      const ch = Object.values(nodesMap).filter((n) => n.parentId === id);
      if (ch.length === 0 || nodesMap[id]?.isCollapsed) leafs.push(id);
      else ch.forEach((c) => findLeafs(c.id));
    };
    findLeafs("root");

    const ROW_H = 60;
    leafs.forEach((id, i) => { nodesMap[id].y = i * ROW_H + 50; });

    const avgY = (id: string): number => {
      const n = nodesMap[id];
      if (!n) return 0;
      if (n.y !== 0) return n.y;
      const ch = Object.values(nodesMap).filter((c) => c.parentId === id);
      if (ch.length === 0) return 50;
      const ys = ch.map((c) => avgY(c.id));
      n.y = ys.reduce((a, b) => a + b, 0) / ys.length;
      return n.y;
    };
    avgY("root");

    return { nodes: Object.values(nodesMap), links, nodesMap };
  }, [activeEvent, collapsedKeys, activeConn]);

  const handleNodeClick = (node: GraphNode) => {
    if (node.type === "row") {
      const [, tableName, pkValue] = node.id.split("::");
      setSelectedRow({ tableName, pkValue });
      const vList = rowHistory[`${tableName}::${pkValue}`] || [];
      if (vList.length > 0) setSelectedVersionNum(vList[vList.length - 1].version);
    }
    if (node.canCollapse) toggleCollapse(node.id);
  };

  const selVersions    = selectedRow ? rowHistory[`${selectedRow.tableName}::${selectedRow.pkValue}`] || [] : [];
  const selVersionData = useMemo(() => !selectedRow || !selectedVersionNum ? null : selVersions.find((v) => v.version === selectedVersionNum) || null, [selectedRow, selectedVersionNum, selVersions]);
  const selVersionDiff = useMemo(() => {
    if (!selectedRow || !selectedVersionNum || selectedVersionNum <= 1) return null;
    const prev = selVersions.find((v) => v.version === selectedVersionNum - 1);
    const curr = selVersions.find((v) => v.version === selectedVersionNum);
    if (!curr) return null;
    const keys = Array.from(new Set([...Object.keys(prev?.data || {}), ...Object.keys(curr.data || {})])).filter((k) => k !== "__flash");
    const out: Record<string, { before: any; after: any; isChanged: boolean }> = {};
    keys.forEach((k) => { const b = prev?.data?.[k]; const a = curr.data?.[k]; out[k] = { before: b, after: a, isChanged: JSON.stringify(b) !== JSON.stringify(a) }; });
    return out;
  }, [selectedRow, selectedVersionNum, selVersions]);

  const renderDiffCell = (val: any, isChanged: boolean, type: "before"|"after") => {
    if (val === null || val === undefined) return <span style={{ color: "var(--text-faint)", fontSize: "11px" }}>NULL</span>;
    const d = typeof val === "object" ? JSON.stringify(val) : String(val);
    if (!isChanged) return <span style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--text-dim)" }}>{d}</span>;
    return <span style={{ padding: "1px 5px", borderRadius: 3, background: type === "before" ? "var(--red-soft)" : "var(--green-soft)", color: type === "before" ? "var(--red)" : "var(--green)", fontFamily: "monospace", fontSize: "11px", border: `1px solid ${type === "before" ? "rgba(251,90,106,.2)" : "rgba(52,211,153,.2)"}` }}>{d}</span>;
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--bg)" }}>

      {/* ══ MAIN PANEL ═══════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Header */}
        <div style={{ flex: "none", height: 48, padding: "0 14px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 10 }}>
          {activeEvent ? (
            <>
              <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "13px" }}>tx_{activeEvent.id}</span>
                <span style={{ fontSize: "8.5px", padding: "1px 5px", borderRadius: 3, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", color: activeEvent.source === "realtime" ? "var(--accent)" : "var(--amber)", background: activeEvent.source === "realtime" ? "var(--accent-soft)" : "var(--amber-soft)", border: `1px solid ${activeEvent.source === "realtime" ? "var(--accent-line)" : "rgba(245,177,74,.3)"}` }}>{activeEvent.source}</span>
                {jumpedEventId && <span style={{ fontSize: "9px", padding: "1px 6px", borderRadius: 3, background: "rgba(34,211,238,.1)", border: "1px solid var(--accent-line)", color: "var(--accent)", fontWeight: 700 }}>TIME TRAVEL</span>}
                <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>{new Date(activeEvent.capturedAt).toLocaleTimeString()}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flex: "none" }}>
                {([["Tables", activeStats.tables, "#f472b6"], ["Rows", activeStats.rows, "var(--text)"], ["Fields", activeStats.columns, "var(--text)"]] as const).map(([l, v, c]) => (
                  <div key={l} style={{ textAlign: "right" as const }}>
                    <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "13px", color: c, lineHeight: 1 }}>{v}</div>
                    <div style={{ fontSize: "8.5px", color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: ".07em" }}>{l}</div>
                  </div>
                ))}
                {jumpedEventId && <button className="btn sm ghost" style={{ height: 26, padding: "0 8px", color: "var(--accent)", borderColor: "var(--accent-line)", fontSize: "11px" }} onClick={() => setJumpedEventId(null)}>Go Live</button>}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, color: "var(--text-faint)", fontSize: "12px" }}>
              <Icon n="history" s={14} /><span>Select a transaction from the log</span>
            </div>
          )}
          <button className="btn icon sm ghost" title={drawerOpen ? "Close log" : "Open log"} onClick={() => setDrawerOpen((v) => !v)}
            style={{ width: 30, height: 30, flex: "none", marginLeft: 4, color: drawerOpen ? "var(--accent)" : "var(--text-dim)", background: drawerOpen ? "var(--accent-soft)" : "transparent", borderColor: drawerOpen ? "var(--accent-line)" : "var(--border)" }}>
            <Icon n="history" s={13} />
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ flex: "none", height: 38, borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", padding: "0 6px", gap: 2 }}>
          {([{ id: "graph", icon: "layers", label: "State Graph" }, { id: "diff", icon: "columns", label: "State Diff" }, { id: "json", icon: "code", label: "State JSON" }] as const).map((tab) => (
            <button key={tab.id} className={`mtab ${activeTab === tab.id ? "on" : ""}`} onClick={() => setActiveTab(tab.id)} style={{ background: "transparent", border: "none" }}>
              <Icon n={tab.icon} s={13} /><span>{tab.label}</span>
            </button>
          ))}
          {activeTab === "graph" && activeEvent && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 4, paddingRight: 6 }}>
              <button className="btn sm ghost" style={{ height: 24, padding: "0 8px", fontSize: "10.5px" }} onClick={() => setCollapsedKeys(new Set())}>Expand All</button>
              <button className="btn sm ghost" style={{ height: 24, padding: "0 8px", fontSize: "10.5px" }} onClick={() => { if (!activeEvent) return; const n = new Set<string>(); activeEvent.tables.forEach((t) => { n.add(`table::${t.tableName}`); t.rows.forEach((r) => n.add(`row::${t.tableName}::${r.pkValue}`)); }); setCollapsedKeys(n); }}>Collapse All</button>
            </div>
          )}
        </div>

        {/* Tab body */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!activeEvent ? (
            <div className="center" style={{ flex: 1 }}>
              <div className="ic"><Icon n="history" s={40} style={{ color: "var(--text-faint)" }} /></div>
              <h3>No transaction selected</h3>
              <p>Open the log and add a sample, or edit records in the Explorer.</p>
              <button className="btn primary sm" onClick={addMockTransaction}><Icon n="zap" s={13} /><span>Add Sample</span></button>
            </div>
          ) : (
            <>
              {activeTab === "graph" && (
                <GraphCanvas
                  nodes={graphData.nodes} links={graphData.links} nodesMap={graphData.nodesMap}
                  selectedRow={selectedRow} onNodeClick={handleNodeClick} eventId={activeEvent.id}
                />
              )}

              {activeTab === "diff" && (() => {
                const diffTable = activeEvent.tables.find((t) => t.tableName === (selectedDiffTable || activeEvent.tables[0]?.tableName)) || activeEvent.tables[0];
                return (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    {/* Per-table sub-tabs */}
                    <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 0, borderBottom: "1px solid var(--border)", background: "var(--surface)", padding: "0 10px", overflowX: "auto" }}>
                      {activeEvent.tables.map((t) => {
                        const isActive = (selectedDiffTable || activeEvent.tables[0]?.tableName) === t.tableName;
                        return (
                          <button
                            key={t.tableName}
                            onClick={() => setSelectedDiffTable(t.tableName)}
                            style={{
                              flex: "none", height: 36, padding: "0 14px", border: "none", borderBottom: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
                              background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                              color: isActive ? "var(--accent)" : "var(--text-dim)", fontWeight: isActive ? 700 : 400, fontSize: "12px",
                              transition: "color .1s, border-color .1s",
                            }}
                          >
                            <Icon n="table" s={11} style={{ opacity: isActive ? 1 : 0.5 }} />
                            <span style={{ fontFamily: "monospace" }}>{t.tableName}</span>
                            <span style={{
                              fontSize: "9px", padding: "0 5px", height: 16, lineHeight: "16px", borderRadius: 8,
                              background: isActive ? "var(--accent-soft)" : "var(--surface-3)",
                              border: `1px solid ${isActive ? "var(--accent-line)" : "var(--border)"}`,
                              color: isActive ? "var(--accent)" : "var(--text-faint)", fontFamily: "monospace",
                            }}>{t.rowCount}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active table rows — scrollable */}
                    <div className="scroll" style={{ flex: 1, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                      {diffTable?.rows.map((row, ri) => {
                        const isU = row.operation === "UPDATE"; const isI = row.operation === "INSERT"; const isDel = row.operation === "DELETE";
                        let colKeys: string[] = [];
                        if (isU) colKeys = showUnchangedDiff ? Array.from(new Set([...Object.keys(row.before || {}), ...Object.keys(row.after || {})])).filter((k) => k !== "__flash") : row.changedColumns;
                        else if (isI && row.after) colKeys = Object.keys(row.after).filter((k) => k !== "__flash");
                        else if (isDel && row.before) colKeys = Object.keys(row.before).filter((k) => k !== "__flash");
                        return (
                          <div key={ri} style={{ border: "1px solid var(--border-soft)", borderRadius: 7, overflow: "hidden", background: "var(--surface)" }}>
                            <div style={{ padding: "6px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--border-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: "9.5px", padding: "1px 6px", borderRadius: 3, fontWeight: 700, color: opColor(row.operation), background: opBg(row.operation), border: `1px solid ${opBorder(row.operation)}` }}>{row.operation}</span>
                                <span style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 600 }}>{row.primaryKey} = {row.pkValue}</span>
                              </div>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                {isU && <label style={{ fontSize: "10.5px", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}><input type="checkbox" checked={showUnchangedDiff} onChange={(e) => setShowUnchangedDiff(e.target.checked)} /> Show unchanged</label>}
                                <button className="btn sm ghost" style={{ padding: "1px 6px", height: 22, fontSize: "10.5px", gap: 3 }} onClick={() => { if (!diffTable) return; setSelectedRow({ tableName: diffTable.tableName, pkValue: row.pkValue }); const vList = rowHistory[`${diffTable.tableName}::${row.pkValue}`] || []; if (vList.length > 0) setSelectedVersionNum(vList[vList.length - 1].version); }}><Icon n="history" s={11} /> History</button>
                              </div>
                            </div>
                            <table className="grid" style={{ width: "100%", tableLayout: "fixed" }}>
                              <thead><tr><th style={{ width: "28%", padding: "5px 10px", fontSize: "9.5px" }}>COLUMN</th><th style={{ width: "36%", padding: "5px 10px", fontSize: "9.5px" }}>BEFORE</th><th style={{ width: "36%", padding: "5px 10px", fontSize: "9.5px" }}>AFTER</th></tr></thead>
                              <tbody>{colKeys.map((col) => { const bv = row.before?.[col]; const av = row.after?.[col]; const changed = isU ? row.changedColumns.includes(col) : true; return (<tr key={col} style={{ height: 28, opacity: !changed ? 0.5 : 1 }}><td style={{ padding: "0 10px", borderRight: "1px solid var(--border-soft)" }}><span style={{ fontFamily: "monospace", fontSize: "11.5px", fontWeight: changed ? 600 : 400 }}>{col}</span>{changed && isU && <span style={{ color: "var(--amber)", marginLeft: 4, fontSize: "9px" }}>●</span>}</td><td style={{ padding: "0 10px", borderRight: "1px solid var(--border-soft)" }}>{renderDiffCell(bv, changed && !isI, "before")}</td><td style={{ padding: "0 10px" }}>{renderDiffCell(av, changed && !isDel, "after")}</td></tr>); })}</tbody>
                            </table>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {activeTab === "json" && (
                <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <pre className="json" style={{ flex: 1, margin: 0, maxHeight: "none" }} dangerouslySetInnerHTML={{ __html: syntaxJson(activeEvent) }} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Version Navigator */}
        {selectedRow && (
          <div style={{ flex: "none", borderTop: "1px solid var(--border)", background: "var(--surface)", maxHeight: 250, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "7px 14px", borderBottom: "1px solid var(--border-soft)", display: "flex", alignItems: "center", justifyContent: "space-between", flex: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon n="history" s={13} style={{ color: "var(--accent)" }} />
                <span style={{ fontWeight: 700, fontSize: "11px", textTransform: "uppercase" as const, letterSpacing: ".07em" }}>Row Version History</span>
                <span style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--text-dim)" }}>{selectedRow.tableName} · pk={selectedRow.pkValue}</span>
              </div>
              <button className="btn icon sm ghost" onClick={() => setSelectedRow(null)} style={{ width: 22, height: 22 }}><Icon n="x" s={11} /></button>
            </div>
            {selVersions.length === 0 ? (
              <div style={{ padding: 16, color: "var(--text-faint)", fontSize: "12px", textAlign: "center" as const }}>No history for this record.</div>
            ) : (
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div className="version-strip-track" style={{ padding: "8px 14px 0", flex: "none" }}>
                  <div className="version-strip-line" />
                  {selVersions.map((v) => (<div key={v.version} className={`version-dot-wrapper ${selectedVersionNum === v.version ? "active" : ""}`} onClick={() => setSelectedVersionNum(v.version)}><div className="version-dot" /><div className="version-dot-label">v{v.version}</div></div>))}
                </div>
                {selVersionData && (
                  <div className="scroll" style={{ flex: 1, padding: "8px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                      <span style={{ fontSize: "9.5px", padding: "1px 6px", borderRadius: 3, fontWeight: 700, color: opColor(selVersionData.operation), background: opBg(selVersionData.operation), border: `1px solid ${opBorder(selVersionData.operation)}` }}>{selVersionData.operation}</span>
                      <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>{new Date(selVersionData.timestamp).toLocaleString()}</span>
                      {selectedVersionNum && selectedVersionNum > 1 && <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--amber)", fontWeight: 600 }}>v{selectedVersionNum - 1} → v{selectedVersionNum}</span>}
                    </div>
                    <table className="grid" style={{ width: "100%" }}>
                      <thead><tr><th style={{ padding: "4px 8px", fontSize: "9.5px", width: "30%" }}>COLUMN</th>{selectedVersionNum === 1 ? <th style={{ padding: "4px 8px", fontSize: "9.5px" }}>INITIAL STATE</th> : <><th style={{ padding: "4px 8px", fontSize: "9.5px" }}>v{(selectedVersionNum||0)-1}</th><th style={{ padding: "4px 8px", fontSize: "9.5px" }}>v{selectedVersionNum}</th></>}</tr></thead>
                      <tbody>
                        {selectedVersionNum === 1
                          ? Object.keys(selVersionData.data || {}).map((col) => <tr key={col} style={{ height: 24 }}><td style={{ padding: "0 8px", fontFamily: "monospace", fontSize: "11px" }}>{col}</td><td style={{ padding: "0 8px" }}>{renderDiffCell(selVersionData.data?.[col], false, "after")}</td></tr>)
                          : selVersionDiff && Object.keys(selVersionDiff).map((col) => { const d = selVersionDiff[col]; return <tr key={col} style={{ height: 24, opacity: d.isChanged ? 1 : 0.45 }}><td style={{ padding: "0 8px", fontFamily: "monospace", fontSize: "11px" }}>{col}{d.isChanged && <span style={{ color: "var(--amber)", marginLeft: 4, fontSize: "9px" }}>●</span>}</td><td style={{ padding: "0 8px" }}>{renderDiffCell(d.before, d.isChanged, "before")}</td><td style={{ padding: "0 8px" }}>{renderDiffCell(d.after, d.isChanged, "after")}</td></tr>; })
                        }
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ RIGHT DRAWER ═════════════════════════════════════════════════════ */}
      <div style={{ width: drawerOpen ? 290 : 0, flex: "none", borderLeft: drawerOpen ? "1px solid var(--border)" : "none", background: "var(--surface)", display: "flex", flexDirection: "column", overflow: "hidden", transition: "width .2s cubic-bezier(.4,0,.2,1)" }}>
        <div style={{ padding: "10px 12px 9px", borderBottom: "1px solid var(--border)", flex: "none", minWidth: 290 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Icon n="history" s={13} style={{ color: "var(--accent)" }} />
              <span style={{ fontWeight: 700, fontSize: "12.5px" }}>Transaction Log</span>
              <span style={{ fontSize: "9.5px", padding: "1px 5px", borderRadius: 3, background: "var(--surface-3)", border: "1px solid var(--border)", color: "var(--text-dim)", fontFamily: "monospace" }}>{filteredEvents.length}/{changeEvents.length}</span>
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              <button className="btn icon sm ghost" title="Add sample" onClick={addMockTransaction} style={{ width: 24, height: 24 }}><Icon n="zap" s={11} style={{ color: "var(--amber)" }} /></button>
              <button className="btn icon sm ghost" title="Reset" onClick={handleSweep} style={{ width: 24, height: 24 }}><Icon n="refresh" s={11} style={{ color: "var(--text-dim)" }} /></button>
              <button className="btn icon sm ghost" title="Clear all" onClick={handleClear} style={{ width: 24, height: 24 }}><Icon n="trash" s={11} style={{ color: "var(--red)" }} /></button>
            </div>
          </div>
          <div style={{ display: "flex", background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border-soft)", overflow: "hidden" }}>
            {([["Events", changeEvents.length, "var(--accent)"], ["Rows", totalStats.rows, "var(--text)"], ["Fields", totalStats.columns, "var(--text)"]] as const).map(([l, v, c], i) => (
              <div key={l} style={{ flex: 1, padding: "6px 8px", borderRight: i < 2 ? "1px solid var(--border-soft)" : "none", textAlign: "center" as const }}>
                <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "14px", color: c, lineHeight: 1 }}>{v}</div>
                <div style={{ fontSize: "8.5px", color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: ".07em", marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "7px 10px", borderBottom: "1px solid var(--border-soft)", flex: "none", display: "flex", flexDirection: "column", gap: 6, minWidth: 290 }}>
          <div style={{ position: "relative" }}>
            <Icon n="search" s={11} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)" }} />
            <input className="field" style={{ padding: "4px 8px 4px 26px", fontSize: "11px", height: 28 }} placeholder="Search transactions, tables…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span className={`dot live ${autoCapture ? "pulse" : ""}`} />
              <span style={{ fontSize: "10.5px", color: "var(--text-dim)" }}>{autoCapture ? "Capturing live" : "Capture off"}</span>
            </div>
            <button className="btn sm ghost" style={{ height: 20, padding: "0 7px", fontSize: "9.5px", color: autoCapture ? "var(--accent)" : "var(--text-faint)", background: autoCapture ? "var(--accent-soft)" : "transparent", borderColor: autoCapture ? "var(--accent-line)" : "var(--border)" }} onClick={() => setAutoCapture(!autoCapture)}>
              {autoCapture ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, padding: "7px", minWidth: 290 }}>
          {filteredEvents.length === 0 ? (
            <div style={{ padding: "28px 10px", textAlign: "center" as const, color: "var(--text-faint)", fontSize: "11.5px" }}>
              <Icon n="history" s={26} style={{ display: "block", margin: "0 auto 8px", opacity: .35 }} />
              <div>{changeEvents.length === 0 ? "No transactions yet." : "No matches."}</div>
              {changeEvents.length === 0 && <button className="btn sm primary" style={{ marginTop: 10 }} onClick={addMockTransaction}><Icon n="zap" s={11} /><span>Add Sample</span></button>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {filteredEvents.map((event, index) => {
                const isFuture = jumpedIndex !== -1 && index < jumpedIndex;
                const isJumped = jumpedEventId === event.id;
                const isActive = isJumped || (selectedEventId === event.id && !jumpedEventId);
                const stats = summarize(event);
                return (
                  <div key={event.id} onClick={() => { if (!isFuture) setSelectedEventId(event.id); }}
                    style={{ padding: "9px 10px", borderRadius: 7, border: `1px solid ${isActive ? "var(--accent-line)" : "var(--border-soft)"}`, background: isActive ? "var(--accent-soft)" : isFuture ? "transparent" : "var(--surface-2)", cursor: isFuture ? "not-allowed" : "pointer", opacity: isFuture ? 0.3 : 1, position: "relative", transition: "border-color .1s" }}>
                    <div style={{ position: "absolute", left: 0, top: 7, bottom: 7, width: 3, borderRadius: "0 3px 3px 0", background: event.source === "realtime" ? "var(--accent)" : "var(--amber)" }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "11px" }}>tx_{event.id}</span>
                      <span style={{ fontSize: "7.5px", padding: "1px 4px", borderRadius: 3, color: event.source === "realtime" ? "var(--accent)" : "var(--amber)", background: event.source === "realtime" ? "var(--accent-soft)" : "var(--amber-soft)", border: `1px solid ${event.source === "realtime" ? "var(--accent-line)" : "rgba(245,177,74,.3)"}`, textTransform: "uppercase" as const, fontWeight: 700 }}>{event.source}</span>
                      <span style={{ marginLeft: "auto", fontSize: "9px", color: "var(--text-faint)", fontFamily: "monospace" }}>{new Date(event.capturedAt).toLocaleTimeString()}</span>
                    </div>
                    <div style={{ display: "flex", gap: 3, marginBottom: 6, flexWrap: "wrap" as const }}>
                      {([["T", stats.tables, "#f472b6"], ["R", stats.rows, "var(--text-dim)"], ["F", stats.columns, "var(--text-dim)"]] as const).map(([l, v, c]) => <span key={l} style={{ fontSize: "9px", padding: "1px 4px", borderRadius: 3, background: "var(--bg)", border: "1px solid var(--border-soft)", color: c, fontFamily: "monospace" }}>{l} {v}</span>)}
                      {stats.inserts > 0 && <span style={{ fontSize: "9px", padding: "1px 4px", borderRadius: 3, background: "var(--green-soft)", border: "1px solid rgba(52,211,153,.2)", color: "var(--green)", fontFamily: "monospace" }}>+{stats.inserts}</span>}
                      {stats.updates > 0 && <span style={{ fontSize: "9px", padding: "1px 4px", borderRadius: 3, background: "var(--amber-soft)", border: "1px solid rgba(245,177,74,.2)", color: "var(--amber)", fontFamily: "monospace" }}>~{stats.updates}</span>}
                      {stats.deletes > 0 && <span style={{ fontSize: "9px", padding: "1px 4px", borderRadius: 3, background: "var(--red-soft)", border: "1px solid rgba(251,90,106,.2)", color: "var(--red)", fontFamily: "monospace" }}>−{stats.deletes}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5 }}>
                      <div style={{ display: "flex", gap: 3, flex: 1, minWidth: 0, flexWrap: "wrap" as const }}>
                        {event.tables.slice(0, 3).map((t) => <span key={t.tableName} style={{ fontSize: "9px", padding: "1px 4px", borderRadius: 3, background: "var(--surface-3)", border: "1px solid var(--border)", color: "var(--text-dim)", fontFamily: "monospace", whiteSpace: "nowrap" as const }}>{t.tableName}</span>)}
                        {event.tables.length > 3 && <span style={{ fontSize: "9px", color: "var(--text-faint)" }}>+{event.tables.length - 3}</span>}
                      </div>
                      <button className={`btn sm ${isJumped ? "primary" : "ghost"}`} style={{ padding: "1px 5px", height: 18, fontSize: "9px", gap: 3, flex: "none" }} disabled={isFuture} onClick={(e) => { e.stopPropagation(); setJumpedEventId(isJumped ? null : event.id); }}>
                        <Icon n="play" s={8} />{isJumped ? "Live" : "Jump"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
