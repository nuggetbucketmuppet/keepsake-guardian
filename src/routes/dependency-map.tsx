import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, ShieldAlert, FileWarning, UserX, BookOpen } from "lucide-react";
import { Card, PageHeader, Button } from "@/components/ui-kit";

export const Route = createFileRoute("/dependency-map")({
  head: () => ({ meta: [{ title: "Dependency Map — KeepSake" }] }),
  component: DependencyMap,
});

type NodeKind = "process" | "agent" | "human" | "data";
interface NodeData {
  label: string;
  kind: NodeKind;
  department?: string;
  highDependency?: boolean;
  restricted?: boolean;
  noFallback?: boolean;
  staleDays?: number;
  risk?: string;
}

const C = { process: "#6c63ff", agent: "#00e5be", human: "#f1f5f9", data: "#f59e0b" };

function ProcessNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div className={`rounded-lg border-2 bg-card px-4 py-2.5 text-center shadow-lg transition-shadow ${selected ? "ring-2 ring-primary" : ""}`} style={{ borderColor: C.process, minWidth: 150, boxShadow: `0 0 18px -6px ${C.process}` }}>
      <Handle type="target" position={Position.Top} style={{ background: C.process }} />
      <div className="text-xs font-semibold text-foreground">{data.label}</div>
      {data.department && <div className="mt-0.5 text-[10px] text-muted-foreground">{data.department}</div>}
      <Handle type="source" position={Position.Bottom} style={{ background: C.process }} />
    </div>
  );
}
function AgentNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 130, height: 110 }}>
      <Handle type="target" position={Position.Top} style={{ background: C.agent, zIndex: 2 }} />
      <div
        className={`flex h-full w-full items-center justify-center bg-card text-center ${selected ? "ring-2 ring-accent" : ""}`}
        style={{ clipPath: "polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)", border: `2px solid ${C.agent}`, boxShadow: `0 0 22px -4px ${C.agent}` }}
      >
        <span className="px-3 text-[11px] font-semibold text-accent">{data.label}</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: C.agent, zIndex: 2 }} />
    </div>
  );
}
function HumanNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div className={`flex items-center justify-center rounded-full border-2 bg-card text-center ${selected ? "ring-2 ring-foreground" : ""}`} style={{ width: 100, height: 100, borderColor: "#f1f5f9" }}>
      <Handle type="target" position={Position.Top} style={{ background: "#f1f5f9" }} />
      <span className="px-2 text-[10px] font-semibold text-foreground">{data.label}</span>
      <Handle type="source" position={Position.Bottom} style={{ background: "#f1f5f9" }} />
    </div>
  );
}
function DataNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div className={`relative ${selected ? "ring-2 ring-warning" : ""}`} style={{ width: 130 }}>
      <Handle type="target" position={Position.Top} style={{ background: C.data }} />
      <div className="bg-card text-center" style={{ border: `2px solid ${C.data}`, borderRadius: "50% / 18px", padding: "14px 10px", boxShadow: `0 0 18px -6px ${C.data}` }}>
        <span className="text-[11px] font-semibold text-warning">{data.label}</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: C.data }} />
    </div>
  );
}

const nodeTypes = { process: ProcessNode, agent: AgentNode, human: HumanNode, data: DataNode };

// ---- Seed graph ----
const N = (id: string, kind: NodeKind, label: string, x: number, y: number, extra: Partial<NodeData> = {}): Node<NodeData> => ({
  id, type: kind, position: { x, y }, data: { label, kind, ...extra },
});

const seedNodes: Node<NodeData>[] = [
  N("a1", "agent", "Procurement Bot", 120, 280),
  N("a2", "agent", "GPT-4o Classifier", 420, 60),
  N("a3", "agent", "CS Onboarding Bot", 760, 280),
  N("a4", "agent", "Forecast Engine", 1080, 60),
  N("p1", "process", "Invoice Approval", 380, 280, { department: "Finance", highDependency: true, noFallback: false, restricted: true, staleDays: 42, risk: "AI auto-approves invoices under $1k with no human review for 42 days." }),
  N("p2", "process", "Vendor Approval", 80, 460, { department: "Procurement", highDependency: true, noFallback: true, restricted: true, staleDays: 67, risk: "Sole AI handler for restricted vendor data; legal review skipped." }),
  N("p3", "process", "Customer Onboarding", 720, 460, { department: "Customer Success", highDependency: false, noFallback: false, staleDays: 8 }),
  N("p4", "process", "Payroll Anomaly Check", 420, 460, { department: "HR", highDependency: false, noFallback: true, restricted: true, staleDays: 19 }),
  N("p5", "process", "Support Triage", 980, 460, { department: "Customer Success", highDependency: false, noFallback: false, staleDays: 4 }),
  N("p6", "process", "Contract Review", 1180, 280, { department: "Legal", highDependency: false, noFallback: true, staleDays: 31 }),
  N("p7", "process", "Access Provisioning", 240, 60, { department: "IT", highDependency: true, noFallback: true, restricted: true, staleDays: 73, risk: "Auto-grants access for standard roles without manager confirmation." }),
  N("p8", "process", "Demand Forecasting", 1080, 280, { department: "Operations", highDependency: false, noFallback: true, staleDays: 12 }),
  N("h1", "human", "Finance Manager", 380, 680),
  N("h2", "human", "CS Team", 820, 680),
  N("h3", "human", "IT Admin", 120, 680),
  N("d1", "data", "NetSuite ERP", 580, 280),
  N("d2", "data", "Vendor Master", 80, 100),
  N("d3", "data", "Customer DB", 760, 100),
  N("d4", "data", "Payroll Ledger", 600, 460),
  N("d5", "data", "Identity Directory", 40, 280),
];

const E = (s: string, t: string, color: string, label?: string): Edge => ({
  id: `${s}-${t}`, source: s, target: t, animated: true, label,
  style: { stroke: color, strokeWidth: 2 },
  labelStyle: { fill: "#8b93a7", fontSize: 10 },
  labelBgStyle: { fill: "#1a1d27" },
  markerEnd: { type: MarkerType.ArrowClosed, color },
});
const TEAL = "#00e5be", AMBER = "#f59e0b", RED = "#ef4444";

const seedEdges: Edge[] = [
  E("a1", "p2", RED), E("d2", "a1", TEAL), E("a2", "p1", RED), E("d1", "a2", TEAL),
  E("p1", "h1", AMBER), E("a3", "p3", TEAL), E("d3", "a3", TEAL), E("p3", "h2", AMBER),
  E("a2", "p4", AMBER), E("d4", "a2", TEAL), E("a3", "p5", TEAL), E("a4", "p8", AMBER),
  E("d1", "a4", TEAL), E("a2", "p6", RED), E("a1", "p7", RED), E("d5", "a1", TEAL),
  E("p7", "h3", RED), E("p2", "h1", RED),
];

function DependencyMap() {
  const [dept, setDept] = useState("All");
  const [highOnly, setHighOnly] = useState(false);
  const [restrictedOnly, setRestrictedOnly] = useState(false);
  const [selected, setSelected] = useState<Node<NodeData> | null>(null);

  const departments = ["All", "Finance", "Procurement", "HR", "IT", "Customer Success", "Operations", "Legal"];

  const visibleNodes = useMemo(() => {
    return seedNodes.map((n) => {
      let dim = false;
      if (n.data.kind === "process") {
        if (dept !== "All" && n.data.department !== dept) dim = true;
        if (highOnly && !n.data.highDependency) dim = true;
        if (restrictedOnly && !n.data.restricted) dim = true;
      }
      return { ...n, style: { ...n.style, opacity: dim ? 0.18 : 1 } };
    });
  }, [dept, highOnly, restrictedOnly]);

  const onNodeClick = useCallback((_: unknown, node: Node<NodeData>) => setSelected(node), []);

  const fullAi = seedNodes.filter((n) => n.data.kind === "process" && n.data.highDependency);
  const restrictedAi = seedNodes.filter((n) => n.data.kind === "process" && n.data.restricted);
  const noGuide = seedNodes.filter((n) => n.data.kind === "process" && n.data.noFallback);
  const stale = seedNodes.filter((n) => n.data.kind === "process" && (n.data.staleDays ?? 0) >= 30);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="AI Dependency Map" subtitle="Visualise which processes depend on AI and where your organisation is most exposed." />

      <div className="relative">
        <Card hover={false} className="overflow-hidden p-0" >
          <div className="h-[600px] w-full bg-grid">
            <ReactFlow
              nodes={visibleNodes}
              edges={seedEdges}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              fitView
              minZoom={0.2}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#2a2f3d" gap={24} />
              <Controls className="!border-border !bg-card [&>button]:!border-border [&>button]:!bg-secondary [&>button]:!fill-foreground" />
              <MiniMap pannable zoomable nodeColor={(n) => C[(n.data as NodeData).kind]} maskColor="rgba(15,17,23,0.7)" style={{ background: "#14161f", border: "1px solid #2a2f3d" }} />
            </ReactFlow>
          </div>
        </Card>

        {/* Filter overlay */}
        <Card hover={false} className="absolute right-4 top-4 z-10 w-60 p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filters</h4>
          <label className="mb-1 block text-[11px] text-muted-foreground">Department</label>
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="mb-3 w-full rounded-md border border-input bg-secondary/60 px-2 py-1.5 text-sm">
            {departments.map((d) => <option key={d}>{d}</option>)}
          </select>
          <Toggle label="High-dependency only" checked={highOnly} onChange={setHighOnly} />
          <Toggle label="Restricted data only" checked={restrictedOnly} onChange={setRestrictedOnly} />
          <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-[11px] text-muted-foreground">
            <Legend color={TEAL} text="AI autonomous" />
            <Legend color={AMBER} text="Human oversight" />
            <Legend color={RED} text="AI sole handler" />
          </div>
        </Card>

        {/* Drawer */}
        <AnimatePresence>
          {selected && (
            <motion.div initial={{ x: 360 }} animate={{ x: 0 }} exit={{ x: 360 }} transition={{ type: "spring", damping: 26, stiffness: 240 }} className="absolute right-0 top-0 z-20 h-full w-80 border-l border-border bg-card p-5 shadow-2xl">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C[selected.data.kind] }}>{selected.data.kind} node</span>
                  <h3 className="font-display text-lg font-bold">{selected.data.label}</h3>
                </div>
                <button onClick={() => setSelected(null)} className="rounded-md p-1.5 hover:bg-secondary"><X className="h-4 w-4" /></button>
              </div>
              {selected.data.department && <Field label="Department" value={selected.data.department} />}
              {selected.data.staleDays !== undefined && <Field label="Days since human touch" value={`${selected.data.staleDays} days`} />}
              <div className="mb-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Connected nodes</div>
                <div className="flex flex-wrap gap-1.5">
                  {seedEdges.filter((e) => e.source === selected.id || e.target === selected.id).map((e) => {
                    const otherId = e.source === selected.id ? e.target : e.source;
                    const other = seedNodes.find((n) => n.id === otherId);
                    return <span key={e.id} className="rounded-md border border-border bg-secondary/60 px-2 py-0.5 text-xs">{other?.data.label}</span>;
                  })}
                </div>
              </div>
              <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 p-3">
                <div className="flex items-center gap-1.5 text-danger"><AlertTriangle className="h-3.5 w-3.5" /><span className="text-xs font-bold">Risk assessment</span></div>
                <p className="mt-1 text-xs text-muted-foreground">{selected.data.risk ?? (selected.data.highDependency ? "High AI dependency with limited human oversight." : "Moderate exposure; monitor for drift.")}</p>
              </div>
              {selected.data.kind === "process" && (
                <Button variant="accent" className="w-full"><BookOpen className="h-4 w-4" /> Generate Fallback Guide</Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Risk summary cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RiskCard icon={<ShieldAlert className="h-5 w-5" />} tone="danger" title="100% AI dependency" nodes={fullAi} />
        <RiskCard icon={<FileWarning className="h-5 w-5" />} tone="danger" title="Restricted data via AI" nodes={restrictedAi} />
        <RiskCard icon={<BookOpen className="h-5 w-5" />} tone="warning" title="No fallback guide" nodes={noGuide} />
        <RiskCard icon={<UserX className="h-5 w-5" />} tone="warning" title="No human touch 30+ days" nodes={stale} />
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mb-2 flex cursor-pointer items-center justify-between">
      <span className="text-xs">{label}</span>
      <button type="button" onClick={() => onChange(!checked)} className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-primary" : "bg-secondary"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}
function Legend({ color, text }: { color: string; text: string }) {
  return <div className="flex items-center gap-2"><span className="h-0.5 w-5" style={{ background: color }} />{text}</div>;
}
function Field({ label, value }: { label: string; value: string }) {
  return <div className="mb-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div><div className="text-sm">{value}</div></div>;
}
function RiskCard({ icon, tone, title, nodes }: { icon: React.ReactNode; tone: "danger" | "warning"; title: string; nodes: Node<NodeData>[] }) {
  const color = tone === "danger" ? "text-danger" : "text-warning";
  const border = tone === "danger" ? "border-danger/40" : "border-warning/40";
  return (
    <Card hover={false} className={`p-4 ${border}`}>
      <div className={`flex items-center justify-between ${color}`}>
        <span className="flex items-center gap-2 text-sm font-bold">{icon}{title}</span>
        <span className="font-display text-2xl font-bold">{nodes.length}</span>
      </div>
      <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        {nodes.slice(0, 4).map((n) => <li key={n.id}>· {n.data.label}</li>)}
      </ul>
    </Card>
  );
}
