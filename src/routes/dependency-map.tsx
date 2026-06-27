import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Box, Square, Plus, Pencil, BookOpen, CheckCircle2, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, Button } from "@/components/ui-kit";
import {
  useGraph, NODE_COLORS, NODE_LABELS, downstreamCount, connectedNodes,
  addNodeManual, updateNode,
} from "@/lib/graph";
import type { GraphNode, NodeType, RiskLevel, DependencyGraph, Department } from "@/lib/types";

export const Route = createFileRoute("/dependency-map")({
  head: () => ({ meta: [{ title: "Dependency Map — KeepSake" }] }),
  component: DependencyMapPage,
});

const TYPES: NodeType[] = ["ai", "saas", "internal", "human", "external", "unknown"];
const DEPARTMENTS = ["All", "Finance", "Procurement", "HR", "IT", "Customer Success", "Operations", "Legal", "Marketing", "Others"];

function DependencyMapPage() {
  const navigate = useNavigate();
  const graph = useGraph();
  const [is3d, setIs3d] = useState(true);
  const [typeFilter, setTypeFilter] = useState<NodeType[]>([]);
  const [dept, setDept] = useState("All");
  const [risk, setRisk] = useState<"All" | RiskLevel>("All");
  const [noGuideOnly, setNoGuideOnly] = useState(false);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const visibleNodes = useMemo(() => {
    return graph.nodes.filter((n) => {
      if (typeFilter.length && !typeFilter.includes(n.type)) return false;
      if (dept !== "All" && n.department !== dept) return false;
      if (risk !== "All" && n.riskLevel !== risk) return false;
      if (noGuideOnly && n.hasGuide) return false;
      if (criticalOnly && n.riskLevel !== "high") return false;
      return true;
    });
  }, [graph, typeFilter, dept, risk, noGuideOnly, criticalOnly]);

  const selConn = selected ? connectedNodes(graph, selected.id) : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Dependency Map"
        subtitle="Every tool your business depends on, AI or not. Larger nodes have more downstream dependencies — your single points of failure."
        right={
          <div className="inline-flex shrink-0 gap-1 rounded-md border border-border bg-card p-1">
            <button onClick={() => setIs3d(true)} className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold ${is3d ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><Box className="h-3.5 w-3.5" /> 3D</button>
            <button onClick={() => setIs3d(false)} className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold ${!is3d ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><Square className="h-3.5 w-3.5" /> 2D</button>
          </div>
        }
      />

      {/* Manager controls */}
      <Card hover={false} className="mb-4 overflow-hidden p-4">
        <div className="flex flex-wrap items-center gap-2">
          {TYPES.map((t) => {
            const on = typeFilter.includes(t);
            return (
              <button key={t} onClick={() => setTypeFilter(on ? typeFilter.filter((x) => x !== t) : [...typeFilter, t])}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${on ? "border-transparent text-background" : "border-border text-muted-foreground"}`}
                style={on ? { background: NODE_COLORS[t] } : undefined}>
                <span className="h-2 w-2 rounded-full" style={{ background: NODE_COLORS[t] }} /> {NODE_LABELS[t]}
              </button>
            );
          })}
          <span className="mx-1 h-5 w-px bg-border" />
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="shrink-0 rounded-md border border-input bg-secondary/60 px-2 py-1 text-xs">
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
          <select value={risk} onChange={(e) => setRisk(e.target.value as RiskLevel | "All")} className="shrink-0 rounded-md border border-input bg-secondary/60 px-2 py-1 text-xs">
            {["All", "high", "medium", "low"].map((r) => <option key={r} value={r}>{r === "All" ? "All risk" : `${r} risk`}</option>)}
          </select>
          <ChipToggle label="No fallback guide" active={noGuideOnly} onClick={() => setNoGuideOnly((v) => !v)} />
          <ChipToggle label="Critical paths only" active={criticalOnly} onClick={() => setCriticalOnly((v) => !v)} />
          <span className="mx-1 h-5 w-px bg-border" />
          <Button variant="outline" className="shrink-0 px-2.5 py-1 text-xs" onClick={() => setShowAdd(true)}><Plus className="h-3.5 w-3.5" /> Add Node</Button>
          <Button variant={editMode ? "accent" : "outline"} className="shrink-0 px-2.5 py-1 text-xs" onClick={() => setEditMode((v) => !v)}><Pencil className="h-3.5 w-3.5" /> Edit Mode{editMode ? " (on)" : ""}</Button>
        </div>
      </Card>

      <div className="relative">
        <Card hover={false} className="overflow-hidden p-0">
          <div className="relative h-[600px] w-full bg-[#0b0d13]">
            <ClientGraph graph={graph} visibleNodes={visibleNodes} is3d={is3d} editMode={editMode} onSelect={setSelected} />
            {/* Legend */}
            <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-border bg-card/90 p-3 text-xs backdrop-blur">
              <div className="mb-1.5 font-semibold uppercase tracking-wide text-muted-foreground">Node types</div>
              {TYPES.map((t) => (
                <div key={t} className="flex items-center gap-2 py-0.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: NODE_COLORS[t] }} /> {NODE_LABELS[t]}
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Drawer */}
        <AnimatePresence>
          {selected && selConn && (
            <motion.div initial={{ x: 360 }} animate={{ x: 0 }} exit={{ x: 360 }} transition={{ type: "spring", damping: 26, stiffness: 240 }}
              className="absolute right-0 top-0 z-20 h-full w-80 overflow-y-auto border-l border-border bg-card p-5 shadow-2xl">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: NODE_COLORS[selected.type] }}>{NODE_LABELS[selected.type]}</span>
                  <h3 className="font-display text-lg font-bold">{selected.name}</h3>
                </div>
                <button onClick={() => setSelected(null)} className="rounded-md p-1.5 hover:bg-secondary"><X className="h-4 w-4" /></button>
              </div>
              <Field label="Department" value={selected.department ?? "—"} />
              <Field label="Risk level" value={selected.riskLevel} />
              <Field label="Downstream dependencies" value={String(downstreamCount(graph, selected.id))} />
              <Field label="Fallback guide" value={selected.hasGuide ? "Exists" : "Not yet created"} />
              {selected.reviewedAt && <Field label="Last reviewed" value={new Date(selected.reviewedAt).toLocaleDateString()} />}

              <Connected title="Upstream" nodes={selConn.upstream} />
              <Connected title="Downstream" nodes={selConn.downstream} />

              <div className="mt-4 space-y-2">
                <Button variant="accent" className="w-full" onClick={() => navigate({ to: "/fallback-guides", search: { node: selected.id } as never })}>
                  <BookOpen className="h-4 w-4" /> Generate Fallback Guide
                </Button>
                <Button variant="outline" className="w-full" onClick={() => { updateNode(selected.id, { reviewedAt: new Date().toISOString() }); toast.success("Marked as reviewed."); setSelected({ ...selected, reviewedAt: new Date().toISOString() }); }}>
                  <CheckCircle2 className="h-4 w-4" /> Mark as Updated
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Risk summary */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard title="High-risk nodes" count={graph.nodes.filter((n) => n.riskLevel === "high").length} tone="danger" icon={<ShieldAlert className="h-5 w-5" />} />
        <SummaryCard title="Without a fallback guide" count={graph.nodes.filter((n) => !n.hasGuide).length} tone="warning" icon={<BookOpen className="h-5 w-5" />} />
        <SummaryCard title="Total mapped nodes" count={graph.nodes.length} tone="accent" icon={<Box className="h-5 w-5" />} />
      </div>

      {showAdd && <AddNodeModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

// ---- Client-only force graph ----
function ClientGraph({ graph, visibleNodes, is3d, editMode, onSelect }: {
  graph: DependencyGraph; visibleNodes: GraphNode[]; is3d: boolean; editMode: boolean; onSelect: (n: GraphNode) => void;
}) {
  const [mods, setMods] = useState<{ FG3D: any; FG2D: any } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  useEffect(() => {
    let active = true;
    Promise.all([import("react-force-graph-3d"), import("react-force-graph-2d")]).then(([a, b]) => {
      if (active) setMods({ FG3D: a.default, FG2D: b.default });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const ids = new Set(visibleNodes.map((n) => n.id));
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    return {
      nodes: visibleNodes.map((n) => ({
        id: n.id, name: n.name, type: n.type,
        color: NODE_COLORS[n.type],
        val: 2 + downstreamCount(graph, n.id) * 2,
        _node: n,
      })),
      links: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => {
        const src = nodeById.get(e.source);
        const color = src?.hasGuide ? "#22c55e" : src?.riskLevel === "high" ? "#ef4444" : "#f59e0b";
        return { source: e.source, target: e.target, color };
      }),
    };
  }, [graph, visibleNodes]);

  if (!mods) {
    return <div ref={ref} className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">Loading map…</div>;
  }
  const { FG3D, FG2D } = mods;
  const common = {
    graphData: data,
    width: dims.w,
    height: dims.h,
    backgroundColor: "#0b0d13",
    nodeLabel: "name",
    nodeColor: (n: any) => n.color,
    nodeVal: (n: any) => n.val,
    linkColor: (l: any) => l.color,
    linkWidth: 1.5,
    linkDirectionalParticles: 2,
    linkDirectionalParticleWidth: 2,
    onNodeClick: (n: any) => onSelect(n._node),
    enableNodeDrag: editMode,
  };

  return (
    <div ref={ref} className="h-full w-full">
      {is3d ? (
        <FG3D {...common} nodeOpacity={0.95} />
      ) : (
        <FG2D {...common}
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
            const r = Math.sqrt(node.val) * 1.8;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = node.color;
            ctx.fill();
            const fs = 11 / scale;
            ctx.font = `${fs}px Inter, sans-serif`;
            ctx.fillStyle = "#c7ccd9";
            ctx.textAlign = "center";
            ctx.fillText(node.name, node.x, node.y + r + fs + 1);
          }}
        />
      )}
    </div>
  );
}

function ChipToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${active ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>{label}</button>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return <div className="mb-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div><div className="text-sm capitalize">{value}</div></div>;
}
function Connected({ title, nodes }: { title: string; nodes: GraphNode[] }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title} ({nodes.length})</div>
      <div className="flex flex-wrap gap-1.5">
        {nodes.length === 0 ? <span className="text-xs text-muted-foreground">None</span> : nodes.map((n) => (
          <span key={n.id} className="rounded-md border border-border bg-secondary/60 px-2 py-0.5 text-xs">{n.name}</span>
        ))}
      </div>
    </div>
  );
}
function SummaryCard({ title, count, tone, icon }: { title: string; count: number; tone: "danger" | "warning" | "accent"; icon: React.ReactNode }) {
  const color = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-accent";
  return (
    <Card hover={false} className="overflow-hidden p-4">
      <div className={`flex items-center justify-between ${color}`}>
        <span className="flex items-center gap-2 text-sm font-bold">{icon}{title}</span>
        <span className="font-display text-2xl font-bold">{count}</span>
      </div>
    </Card>
  );
}

function AddNodeModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<NodeType>("saas");
  const [department, setDepartment] = useState<Department>("Operations");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("medium");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <Card hover={false} className="w-full max-w-md overflow-hidden p-5" >
        <div onClick={(e) => e.stopPropagation()}>
          <h3 className="mb-4 font-display text-lg font-bold">Add a node manually</h3>
          <div className="space-y-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Node name (e.g. Slack)" className="w-full rounded-md border border-input bg-secondary/40 px-3 py-2 text-sm" />
            <select value={type} onChange={(e) => setType(e.target.value as NodeType)} className="w-full rounded-md border border-input bg-secondary/40 px-3 py-2 text-sm">
              {TYPES.map((t) => <option key={t} value={t}>{NODE_LABELS[t]}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <select value={department} onChange={(e) => setDepartment(e.target.value as Department)} className="w-full rounded-md border border-input bg-secondary/40 px-3 py-2 text-sm">
                {DEPARTMENTS.filter((d) => d !== "All").map((d) => <option key={d}>{d}</option>)}
              </select>
              <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as RiskLevel)} className="w-full rounded-md border border-input bg-secondary/40 px-3 py-2 text-sm">
                {(["high", "medium", "low"] as RiskLevel[]).map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={() => { if (!name.trim()) { toast.error("Name required"); return; } addNodeManual({ name, type, department, riskLevel }); toast.success("Node added."); onClose(); }}>Add Node</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
