import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  BookOpen, Sparkles, Check, Search, X,
  ShieldAlert, Download, Link2, ChevronDown, Trash2, ScrollText,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, Button, AiLoading, ErrorCard, EmptyState } from "@/components/ui-kit";
import { useGraph, connectedNodes, updateNode, NODE_LABELS } from "@/lib/graph";
import { useWorkflows, uid } from "@/lib/store";
import { suggestScenarios, generateNodeGuide } from "@/lib/claude";
import { putGuide, getAllGuides, deleteGuide } from "@/lib/idb";
import { buildGuidePrintHtml } from "@/lib/guide-print";
import type { NodeFallbackGuide, DependencyGraph, GraphNode } from "@/lib/types";

export const Route = createFileRoute("/fallback-guides")({
  validateSearch: (s: Record<string, unknown>): { node?: string; workflow?: string; create?: boolean } => ({
    node: typeof s.node === "string" ? s.node : undefined,
    workflow: typeof s.workflow === "string" ? s.workflow : undefined,
    create: s.create === true || s.create === "true",
  }),
  head: () => ({ meta: [{ title: "Fallback Guides — KeepSake" }] }),
  component: FallbackGuides,
});

const nodeWorkflowIds = (n: GraphNode): string[] => n.workflowIds ?? (n.workflowId ? [n.workflowId] : []);

function FallbackGuides() {
  const { node: nodeParam, workflow: workflowParam, create } = Route.useSearch();
  const graph = useGraph();
  const [guides, setGuides] = useState<NodeFallbackGuide[]>([]);

  const refresh = () => getAllGuides().then((g) => setGuides(g.sort((a, b) => b.generatedDate.localeCompare(a.generatedDate))));
  useEffect(() => { refresh(); }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Fallback Guides"
        subtitle="Human-ready plans for when any node fails. Saved offline so they work when AI and cloud are down."
      />

      <Tabs.Root defaultValue={!create && (workflowParam || nodeParam) ? "saved" : "generate"}>
        <Tabs.List className="mb-6 inline-flex gap-1 rounded-md border border-border bg-card p-1">
          {[{ v: "generate", label: "Generate Guides" }, { v: "saved", label: `Saved (${guides.length})` }].map((t) => (
            <Tabs.Trigger key={t.v} value={t.v} className="rounded px-4 py-1.5 text-sm font-semibold text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t.label}</Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="generate">
          <MultiGenerator graph={graph} onGenerated={refresh} initialWorkflow={workflowParam} initialNode={nodeParam} />
        </Tabs.Content>

        <Tabs.Content value="saved">
          <SavedGuides guides={guides} graph={graph} initialWorkflow={workflowParam} onRefresh={refresh} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function MultiGenerator({ graph, onGenerated, initialWorkflow, initialNode }: { graph: DependencyGraph; onGenerated: () => void; initialWorkflow?: string; initialNode?: string }) {
  const workflows = useWorkflows();
  const [scope, setScope] = useState(initialWorkflow ?? "__all__");
  const [selected, setSelected] = useState<string[]>(initialNode ? [initialNode] : []);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const available = useMemo(
    () => graph.nodes.filter((n) => !n.archived && (scope === "__all__" || nodeWorkflowIds(n).includes(scope))),
    [graph.nodes, scope],
  );

  // Drop selections that fall outside the current scope.
  useEffect(() => {
    setSelected((cur) => cur.filter((id) => available.some((n) => n.id === id)));
  }, [available]);

  const toggle = (id: string) => setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  const allIds = available.map((n) => n.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));

  const generate = async () => {
    if (selected.length === 0) { toast.error("Select at least one node."); return; }
    setRunning(true); setError(null);
    try {
      const nodes = selected.map((id) => graph.nodes.find((n) => n.id === id)).filter(Boolean) as GraphNode[];

      if (nodes.length === 1) {
        const node = nodes[0];
        setProgress({ done: 0, total: 1, current: node.name });
        const conn = connectedNodes(graph, node.id);
        const connectedNames = [...conn.upstream, ...conn.downstream].map((n) => n.name);
        let scenarios: string[] = [];
        try { scenarios = await suggestScenarios(node.name, NODE_LABELS[node.type], connectedNames); } catch { /* fall back below */ }
        if (scenarios.length === 0) scenarios = [`What if ${node.name} goes offline?`];
        const result = await generateNodeGuide({ nodeName: node.name, nodeType: NODE_LABELS[node.type], connectedNodes: connectedNames, scenarios });
        const guide: NodeFallbackGuide = { ...result, id: uid(), nodeId: node.id, nodeName: node.name, version: 1, generatedDate: new Date().toISOString() };
        await putGuide(guide);
        updateNode(node.id, { hasGuide: true });
        setProgress(null);
        toast.success("Generated guide and saved offline.");
        onGenerated();
        return;
      }

      // Multiple nodes — draft a SINGLE guide covering a simultaneous failure of all of them.
      const names = nodes.map((n) => n.name);
      setProgress({ done: 0, total: 1, current: `${names.length} nodes failing together` });
      const connectedSet = new Set<string>();
      for (const n of nodes) {
        const conn = connectedNodes(graph, n.id);
        [...conn.upstream, ...conn.downstream].forEach((c) => connectedSet.add(c.name));
      }
      const connectedNames = [...connectedSet].filter((c) => !names.includes(c));
      const combinedName = names.join(" + ");
      const scenarios = [`What if ${names.join(", ")} all fail at the same time?`];
      const result = await generateNodeGuide({
        nodeName: combinedName,
        nodeType: `Combined failure of ${names.length} nodes (${names.join(", ")})`,
        connectedNodes: connectedNames,
        scenarios,
      });
      const guide: NodeFallbackGuide = { ...result, id: uid(), nodeId: nodes[0].id, nodeName: combinedName, version: 1, generatedDate: new Date().toISOString() };
      await putGuide(guide);
      nodes.forEach((n) => updateNode(n.id, { hasGuide: true }));
      setProgress(null);
      toast.success(`Generated 1 combined guide covering ${names.length} nodes, saved offline.`);
      onGenerated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate guides.");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  return (
    <Card hover={false} className="overflow-hidden p-5">
      <label className="mb-1 block text-sm font-semibold">Workflow scope</label>
      <select value={scope} onChange={(e) => setScope(e.target.value)} className="mb-4 w-full rounded-md border border-input bg-secondary/40 px-3 py-2 text-sm">
        <option value="__all__">All workflows</option>
        {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>

      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-semibold">Select nodes to prepare for ({selected.length})</label>
        {available.length > 0 && (
          <button onClick={() => setSelected(allSelected ? [] : allIds)} className="text-xs font-semibold text-accent hover:underline">
            {allSelected ? "Clear all" : "Select all"}
          </button>
        )}
      </div>

      {available.length === 0 ? (
        <p className="text-sm text-muted-foreground">No nodes in this scope. Upload a workflow first.</p>
      ) : (
        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {available.map((n) => {
            const on = selected.includes(n.id);
            return (
              <button key={n.id} onClick={() => toggle(n.id)} className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${on ? "border-primary bg-primary/10" : "border-border"}`}>
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-primary bg-primary" : "border-border"}`}>{on && <Check className="h-3 w-3 text-primary-foreground" />}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{n.name}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{NODE_LABELS[n.type]}</span>
                {n.hasGuide && <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">Has guide</span>}
              </button>
            );
          })}
        </div>
      )}

      {error && <div className="mt-3"><ErrorCard message={error} onRetry={generate} /></div>}

      <div className="mt-4">
        {running ? (
          <AiLoading message={progress ? `Drafting ${progress.current}…` : "Preparing…"} />
        ) : (
          <Button className="w-full" onClick={generate} disabled={selected.length === 0}>
            <Sparkles className="h-4 w-4" /> {selected.length > 1 ? `Generate 1 Combined Guide (${selected.length} nodes)` : "Generate Guide"}
          </Button>
        )}
      </div>
    </Card>
  );
}

function SavedGuides({ guides, graph, initialWorkflow, onRefresh }: { guides: NodeFallbackGuide[]; graph: DependencyGraph; initialWorkflow?: string; onRefresh: () => void }) {
  const workflows = useWorkflows();
  const [query, setQuery] = useState("");
  const [wfFilter, setWfFilter] = useState(initialWorkflow ?? "__all__");
  const [nodeFilter, setNodeFilter] = useState("__all__");

  // Nodes that actually have guides, for the node filter dropdown.
  const guideNodeIds = useMemo(() => new Set(guides.map((g) => g.nodeId).filter(Boolean) as string[]), [guides]);
  const guideNodes = graph.nodes.filter((n) => guideNodeIds.has(n.id));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guides.filter((g) => {
      if (nodeFilter !== "__all__" && g.nodeId !== nodeFilter) return false;
      if (wfFilter !== "__all__") {
        const node = graph.nodes.find((n) => n.id === g.nodeId);
        if (!node || !nodeWorkflowIds(node).includes(wfFilter)) return false;
      }
      if (!q) return true;
      return g.guide_title.toLowerCase().includes(q) || g.nodeName.toLowerCase().includes(q);
    });
  }, [guides, query, wfFilter, nodeFilter, graph.nodes]);

  const hasActiveFilter = query || wfFilter !== "__all__" || nodeFilter !== "__all__";

  if (guides.length === 0) {
    return <EmptyState icon={<BookOpen className="h-6 w-6" />} title="No guides yet" description="Select nodes in the Generate tab and create your first fallback guides." />;
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search guides…" className="w-full rounded-md border border-input bg-secondary/40 py-2 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        </div>
        <select value={wfFilter} onChange={(e) => setWfFilter(e.target.value)} className="shrink-0 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground">
          <option value="__all__">All workflows</option>
          {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)} className="shrink-0 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground">
          <option value="__all__">All nodes</option>
          {guideNodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        {hasActiveFilter && (
          <button onClick={() => { setQuery(""); setWfFilter("__all__"); setNodeFilter("__all__"); }} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Search className="h-6 w-6" />} title="No matching guides" description="Try a different search or filter." />
      ) : (
        <div className="space-y-4">
          {filtered.map((g) => <GuideCard key={g.id} guide={g} onDelete={async () => { await deleteGuide(g.id); onRefresh(); toast.success("Guide deleted."); }} />)}
        </div>
      )}
    </>
  );
}

function GuideCard({ guide, onDelete }: { guide: NodeFallbackGuide; onDelete: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const downloadPdf = () => {
    const w = window.open("", "_blank");
    if (!w) { toast.error("Allow pop-ups to download."); return; }
    w.document.write(buildGuidePrintHtml(guide));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };
  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/fallback/${guide.id}`);
    toast.success("Offline link copied — works with zero API calls.");
  };
  return (
    <Card hover={false} className="overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between p-4 text-left">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ring-1 ${guide.track === "policy" ? "bg-accent/15 text-accent ring-accent/40" : "bg-primary/15 text-primary ring-primary/40"}`}>
              {guide.track === "policy" ? <><ScrollText className="h-3 w-3" /> Policy Compliance</> : <><ShieldAlert className="h-3 w-3" /> Node Failure</>}
            </span>
          </div>
          <h3 className="truncate font-display text-base font-bold">{guide.guide_title}</h3>
          <p className="text-xs text-muted-foreground">{guide.nodeName}{guide.policyName ? ` · ${guide.policyName}` : ""} · v{guide.version} · {new Date(guide.generatedDate).toLocaleString()}</p>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-4">
          <p className="text-sm text-muted-foreground">{guide.scenario}</p>

          {/* Cybersecurity — distinct red left border */}
          <div className="rounded-md border border-danger/40 border-l-4 border-l-danger bg-danger/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-danger"><ShieldAlert className="h-4 w-4" /><span className="text-sm font-bold">Cybersecurity risks</span></div>
            <ul className="space-y-2">
              {guide.cybersecurity_risks.map((r, i) => (
                <li key={i} className="text-xs"><span className="font-semibold text-foreground">{r.risk}</span> — <span className="text-muted-foreground">{r.mitigation}</span></li>
              ))}
            </ul>
          </div>

          <Section title="First 15 minutes" items={guide.immediate_steps_15min} />
          <Section title="First hour" items={guide.steps_first_hour} />
          <Section title="First day" items={guide.steps_first_day} />

          <div>
            <h4 className="mb-1.5 text-sm font-bold">Who to contact</h4>
            <div className="space-y-1.5">
              {guide.contacts.map((c, i) => (
                <div key={i} className="rounded-md border border-border bg-secondary/30 p-2 text-xs">
                  <span className="font-semibold">{c.role}</span> — {c.action}<div className="mt-0.5 italic text-muted-foreground">"{c.script}"</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-1.5 text-sm font-bold">Common mistakes</h4>
            <ul className="space-y-1 text-xs">
              {guide.common_mistakes.map((m, i) => <li key={i}><span className="font-semibold text-warning">{m.mistake}</span> → <span className="text-muted-foreground">{m.prevention}</span></li>)}
            </ul>
          </div>

          <Section title="Recovery checklist" items={guide.recovery_checklist} checklist />

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button variant="outline" className="shrink-0" onClick={downloadPdf}><Download className="h-4 w-4" /> Download PDF</Button>
            <Button variant="outline" className="shrink-0" onClick={copyLink}><Link2 className="h-4 w-4" /> Share Offline Link</Button>
            <Button variant="outline" className="shrink-0" onClick={() => navigate({ to: "/fallback/$id", params: { id: guide.id } })}><BookOpen className="h-4 w-4" /> Open Offline</Button>
            <Button variant="ghost" className="shrink-0 text-danger" onClick={onDelete}><Trash2 className="h-4 w-4" /> Delete</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Section({ title, items, checklist }: { title: string; items: string[]; checklist?: boolean }) {
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-bold">{title}</h4>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {items.map((it, i) => <li key={i} className="flex gap-2">{checklist ? <span className="text-accent">☐</span> : <span className="text-primary">{i + 1}.</span>} {it}</li>)}
      </ul>
    </div>
  );
}
