import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Box, Square, Plus, Pencil, BookOpen, CheckCircle2, ShieldAlert,
  Zap, User, ListOrdered,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, Button } from "@/components/ui-kit";
import {
  useGraph, NODE_COLORS, NODE_LABELS, downstreamCount, connectedNodes,
  addNodeManual, updateNode, nodeSize, connectedComponent,
} from "@/lib/graph";
import { useWorkflows } from "@/lib/store";
import type { GraphNode, GraphEdge, NodeType, RiskLevel, DependencyGraph, Department } from "@/lib/types";

export const Route = createFileRoute("/dependency-map")({
  validateSearch: (s: Record<string, unknown>): { focus?: string } => ({
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
  head: () => ({ meta: [{ title: "Dependency Map — Streamline" }] }),
  component: DependencyMapPage,
});

const TYPES: NodeType[] = ["ai", "platform", "human"];
const DEPARTMENTS = ["All", "Finance", "Procurement", "HR", "IT", "Customer Success", "Operations", "Legal", "Marketing", "Others"];

function DependencyMapPage() {
  const navigate = useNavigate();
  const graph = useGraph();
  const { focus } = Route.useSearch();
  const workflows = useWorkflows();
  const [is3d, setIs3d] = useState(true);
  const [typeFilter, setTypeFilter] = useState<NodeType[]>([]);
  const [dept, setDept] = useState("All");
  const [risk, setRisk] = useState<"All" | RiskLevel>("All");
  const [noGuideOnly, setNoGuideOnly] = useState(false);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [edgeView, setEdgeView] = useState<GraphEdge | null>(null);

  // Isolation: by workflow, or by the selected node's connected component
  const [workflowFilter, setWorkflowFilter] = useState("All");
  const [isolateSelected, setIsolateSelected] = useState(false);

  const isolatedIds = useMemo(() => {
    if (isolateSelected && selected) return connectedComponent(graph, selected.id);
    return null;
  }, [isolateSelected, selected, graph]);

  const visibleNodes = useMemo(() => {
    return graph.nodes.filter((n) => {
      if (n.archived) return false;
      if (typeFilter.length && !typeFilter.includes(n.type)) return false;
      if (dept !== "All" && n.department !== dept) return false;
      if (risk !== "All" && n.riskLevel !== risk) return false;
      if (noGuideOnly && n.hasGuide) return false;
      if (criticalOnly && n.riskLevel !== "high") return false;
      if (workflowFilter !== "All") {
        const ids = n.workflowIds ?? (n.workflowId ? [n.workflowId] : []);
        if (!ids.includes(workflowFilter)) return false;
      }
      if (isolatedIds && !isolatedIds.has(n.id)) return false;
      return true;
    });
  }, [graph, typeFilter, dept, risk, noGuideOnly, criticalOnly, workflowFilter, isolatedIds]);

  const selConn = selected ? connectedNodes(graph, selected.id) : null;

  // Focus a node when arriving from "Go to map" (?focus=<id>).
  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (focus && focusedRef.current !== focus) {
      const node = graph.nodes.find((n) => n.id === focus);
      if (node) { setSelected(node); focusedRef.current = focus; }
    }
  }, [focus, graph.nodes]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Dependency Map"
        subtitle="Every tool, service and person your business depends on. Larger nodes have more downstream dependencies — your single points of failure."
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
          {/* Isolate a single workflow */}
          <select value={workflowFilter} onChange={(e) => setWorkflowFilter(e.target.value)} className="shrink-0 rounded-md border border-input bg-secondary/60 px-2 py-1 text-xs">
            <option value="All">All workflows</option>
            {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <ChipToggle label="No fallback guide" active={noGuideOnly} onClick={() => setNoGuideOnly((v) => !v)} />
          <ChipToggle label="Critical paths only" active={criticalOnly} onClick={() => setCriticalOnly((v) => !v)} />
          {selected && (
            <ChipToggle label={isolateSelected ? "Isolating selection" : "Isolate selection"} active={isolateSelected} onClick={() => setIsolateSelected((v) => !v)} />
          )}
          <span className="mx-1 h-5 w-px bg-border" />
          <Button variant="outline" className="shrink-0 px-2.5 py-1 text-xs" onClick={() => setShowAdd(true)}><Plus className="h-3.5 w-3.5" /> Add Node</Button>
          <Button variant={editMode ? "accent" : "outline"} className="shrink-0 px-2.5 py-1 text-xs" onClick={() => setEditMode((v) => !v)}><Pencil className="h-3.5 w-3.5" /> Edit Mode{editMode ? " (on)" : ""}</Button>
        </div>
      </Card>

      <div className="relative">
        <Card hover={false} className="overflow-hidden p-0">
          <div className="relative h-[600px] w-full bg-[#0b0d13]">
            <ClientGraph graph={graph} visibleNodes={visibleNodes} is3d={is3d} editMode={editMode} onSelect={setSelected} onSelectEdge={setEdgeView} />
            {/* Legend */}
            <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-border bg-card/90 p-3 text-xs backdrop-blur">
              <div className="mb-1.5 font-semibold uppercase tracking-wide text-muted-foreground">Node types</div>
              {TYPES.map((t) => (
                <div key={t} className="flex items-center gap-2 py-0.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: NODE_COLORS[t] }} /> {NODE_LABELS[t]}
                </div>
              ))}
              <div className="mt-1.5 text-[10px] text-muted-foreground">Branch = steps · click a branch to see them</div>
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
                <button onClick={() => { setSelected(null); setIsolateSelected(false); }} className="rounded-md p-1.5 hover:bg-secondary"><X className="h-4 w-4" /></button>
              </div>
              <Field label="Department" value={selected.department ?? "—"} />
              <Field label="Risk level" value={selected.riskLevel} />
              <Field label="Downstream dependencies" value={String(downstreamCount(graph, selected.id))} />
              <Field label="Used in workflows" value={String((selected.workflowIds ?? (selected.workflowId ? [selected.workflowId] : [])).length || 0)} />
              <Field label="Fallback guide" value={selected.hasGuide ? "Exists" : "Not yet created"} />

              {/* Contact details for human/position nodes */}
              {selected.type === "human" && (
                <ContactEditor node={selected} onSaved={(patch) => setSelected({ ...selected, ...patch })} />
              )}

              <Connected title="Upstream" nodes={selConn.upstream} />
              <Connected title="Downstream" nodes={selConn.downstream} />

              <div className="mt-4 space-y-2">
                <Button variant="accent" className="w-full" onClick={() => navigate({ to: "/failure-drills", search: { nodes: selected.id } as never })}>
                  <Zap className="h-4 w-4" /> Send to Failure Drill
                </Button>
                <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/fallback-guides", search: { node: selected.id } as never })}>
                  <BookOpen className="h-4 w-4" /> Generate Fallback Guide
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => { updateNode(selected.id, { reviewedAt: new Date().toISOString() }); toast.success("Marked as reviewed."); setSelected({ ...selected, reviewedAt: new Date().toISOString() }); }}>
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
      {edgeView && <EdgeStepsModal edge={edgeView} graph={graph} onClose={() => setEdgeView(null)} />}
    </div>
  );
}

// ---- Client-only force graph ----
function ClientGraph({ graph, visibleNodes, is3d, editMode, onSelect, onSelectEdge }: {
  graph: DependencyGraph; visibleNodes: GraphNode[]; is3d: boolean; editMode: boolean;
  onSelect: (n: GraphNode) => void; onSelectEdge: (e: GraphEdge) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setDims({ w: el.clientWidth || 800, h: el.clientHeight || 600 });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const ids = new Set(visibleNodes.map((n) => n.id));
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const groups = new Map<NodeType, GraphNode[]>();
    visibleNodes.forEach((node) => {
      const list = groups.get(node.type) ?? [];
      list.push(node);
      groups.set(node.type, list);
    });

    const lanes: Record<NodeType, number> = { ai: 0.28, platform: 0.5, human: 0.72 };
    const positions = new Map<string, { x: number; y: number; z: number; r: number; node: GraphNode }>();
    TYPES.forEach((type) => {
      const nodes = groups.get(type) ?? [];
      const spacing = dims.w / (nodes.length + 1 || 2);
      nodes.forEach((node, index) => {
        const downstream = downstreamCount(graph, node.id);
        const x = spacing * (index + 1);
        const y = dims.h * lanes[type] + Math.sin(index * 1.7 + type.length) * 34;
        const z = Math.min(80, downstream * 9 + (type === "ai" ? 28 : type === "platform" ? 12 : 0));
        const r = Math.max(8, Math.min(24, Math.sqrt(nodeSize(graph, node)) * 2.2));
        positions.set(node.id, { x, y, z, r, node });
      });
    });

    return {
      nodes: Array.from(positions.values()),
      links: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => {
        const src = nodeById.get(e.source);
        const color = src?.hasGuide ? "#22c55e" : src?.riskLevel === "high" ? "#ef4444" : "#f59e0b";
        const steps = e.steps ?? (e.label ? [e.label] : []);
        return { source: e.source, target: e.target, color, edge: e, steps, stepCount: steps.length, from: positions.get(e.source), to: positions.get(e.target) };
      }),
    };
  }, [dims.h, dims.w, graph, visibleNodes]);

  const project = (p: { x: number; y: number; z: number }) => {
    if (!is3d) return { x: p.x, y: p.y };
    return { x: p.x + p.z * 0.45, y: p.y - p.z * 0.32 };
  };

  return (
    <div ref={ref} className="relative h-full w-full">
      <svg role="img" aria-label="Dependency graph" width="100%" height="100%" viewBox={`0 0 ${dims.w} ${dims.h}`} className="block h-full w-full">
        <defs>
          <filter id="nodeGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id="mapGrid" width="42" height="42" patternUnits="userSpaceOnUse">
            <path d="M 42 0 L 0 0 0 42" fill="none" stroke="rgba(58,209,126,0.08)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={dims.w} height={dims.h} fill="#0b0d13" />
        <rect width={dims.w} height={dims.h} fill="url(#mapGrid)" />

        {is3d && data.links.map((link) => {
          if (!link.from || !link.to) return null;
          const from = project(link.from);
          const to = project(link.to);
          return <line key={`${link.edge.id ?? `${link.edge.source}-${link.edge.target}`}-shadow`} x1={from.x - 18} y1={from.y + 18} x2={to.x - 18} y2={to.y + 18} stroke="rgba(0,0,0,0.45)" strokeWidth={3 + link.stepCount} />;
        })}

        {data.links.map((link) => {
          if (!link.from || !link.to) return null;
          const from = project(link.from);
          const to = project(link.to);
          return (
            <g key={link.edge.id ?? `${link.edge.source}-${link.edge.target}`} className="cursor-pointer" onClick={() => onSelectEdge(link.edge)}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={link.color} strokeOpacity={0.72} strokeWidth={1.6 + link.stepCount} />
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="transparent" strokeWidth={14} />
              {link.stepCount > 0 && <circle cx={(from.x + to.x) / 2} cy={(from.y + to.y) / 2} r={4 + Math.min(link.stepCount, 4)} fill={link.color} opacity={0.9} />}
              <title>{link.steps.length ? link.steps.map((s, i) => `${i + 1}. ${s}`).join(" → ") : "Dependency"}</title>
            </g>
          );
        })}

        {is3d && data.nodes.map((item) => {
          const p = project(item);
          return <line key={`${item.node.id}-stem`} x1={item.x} y1={item.y} x2={p.x} y2={p.y} stroke="rgba(199,204,217,0.18)" strokeWidth={1} strokeDasharray="3 5" />;
        })}

        {data.nodes.map((item) => {
          const p = project(item);
          const color = NODE_COLORS[item.node.type];
          return (
            <g key={item.node.id} className="cursor-pointer" onClick={() => onSelect(item.node)}>
              <circle cx={p.x} cy={p.y} r={item.r + 5} fill={color} opacity={0.1} filter="url(#nodeGlow)" />
              <circle cx={p.x} cy={p.y} r={item.r} fill={color} stroke="rgba(255,255,255,0.72)" strokeWidth={1.2} />
              <circle cx={p.x - item.r * 0.28} cy={p.y - item.r * 0.32} r={Math.max(2, item.r * 0.22)} fill="rgba(255,255,255,0.72)" />
              <text x={p.x} y={p.y + item.r + 16} textAnchor="middle" fill="#c7ccd9" fontSize="11" fontFamily="Barlow, sans-serif" fontWeight="600">
                {item.node.name.length > 22 ? `${item.node.name.slice(0, 21)}…` : item.node.name}
              </text>
              <title>{item.node.name}</title>
            </g>
          );
        })}

        {data.nodes.length === 0 && (
          <text x={dims.w / 2} y={dims.h / 2} textAnchor="middle" fill="#8b93a7" fontSize="14" fontFamily="Barlow, sans-serif">No nodes match the current filters.</text>
        )}
      </svg>
      {editMode && <div className="pointer-events-none absolute bottom-4 left-4 rounded border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground">Edit mode is on. Select a node to update details.</div>}
    </div>
  );
}

function ContactEditor({ node, onSaved }: { node: GraphNode; onSaved: (patch: Partial<GraphNode>) => void }) {
  const [name, setName] = useState(node.contactName ?? "");
  const [email, setEmail] = useState(node.contactEmail ?? "");
  const [phone, setPhone] = useState(node.contactPhone ?? "");
  return (
    <div className="mb-4 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <User className="h-3.5 w-3.5" /> Contact details (optional)
      </div>
      <div className="space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full rounded-md border border-input bg-secondary/40 px-2.5 py-1.5 text-xs" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full rounded-md border border-input bg-secondary/40 px-2.5 py-1.5 text-xs" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="w-full rounded-md border border-input bg-secondary/40 px-2.5 py-1.5 text-xs" />
        <Button variant="outline" className="w-full px-2 py-1 text-xs" onClick={() => {
          const patch = { contactName: name, contactEmail: email, contactPhone: phone };
          updateNode(node.id, patch); onSaved(patch); toast.success("Contact details saved.");
        }}>Save contact</Button>
      </div>
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

function EdgeStepsModal({ edge, graph, onClose }: { edge: GraphEdge; graph: DependencyGraph; onClose: () => void }) {
  const src = graph.nodes.find((n) => n.id === edge.source);
  const tgt = graph.nodes.find((n) => n.id === edge.target);
  const steps = edge.steps ?? (edge.label ? [edge.label] : []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <Card hover={false} className="w-full max-w-md overflow-hidden p-5">
        <div onClick={(e) => e.stopPropagation()}>
          <div className="mb-3 flex items-start justify-between">
            <div className="flex items-center gap-1.5 font-display text-base font-bold"><ListOrdered className="h-4 w-4 text-accent" /> Steps on this branch</div>
            <button onClick={onClose} className="rounded-md p-1.5 hover:bg-secondary"><X className="h-4 w-4" /></button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{src?.name ?? "?"} → {tgt?.name ?? "?"}</p>
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No steps recorded for this branch.</p>
          ) : (
            <ol className="space-y-2">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
                  <span className="font-display font-bold text-accent">{i + 1}</span> {s}
                </li>
              ))}
            </ol>
          )}
        </div>
      </Card>
    </div>
  );
}

function AddNodeModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<NodeType>("platform");
  const [department, setDepartment] = useState<Department>("Operations");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("medium");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <Card hover={false} className="w-full max-w-md overflow-hidden p-5" >
        <div onClick={(e) => e.stopPropagation()}>
          <h3 className="mb-4 font-display text-lg font-bold">Add a node manually</h3>
          <div className="space-y-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Node name (e.g. Slack or Finance Manager)" className="w-full rounded-md border border-input bg-secondary/40 px-3 py-2 text-sm" />
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
