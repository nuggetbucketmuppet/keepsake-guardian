import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  ShieldAlert, BookOpen, Download, Link2, RefreshCw, ChevronDown, Sparkles, Plus, Check, Trash2, ScrollText,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, Button, AiLoading, ErrorCard, EmptyState } from "@/components/ui-kit";
import { useGraph, connectedNodes, updateNode, NODE_LABELS } from "@/lib/graph";
import { suggestScenarios, generateNodeGuide } from "@/lib/claude";
import { putGuide, getAllGuides, deleteGuide } from "@/lib/idb";
import { uid } from "@/lib/store";
import { buildGuidePrintHtml } from "@/lib/guide-print";
import type { NodeFallbackGuide, GraphNode } from "@/lib/types";

export const Route = createFileRoute("/fallback-guides")({
  validateSearch: (s: Record<string, unknown>): { node?: string } => ({ node: typeof s.node === "string" ? s.node : undefined }),
  head: () => ({ meta: [{ title: "Fallback Guides — KeepSake" }] }),
  component: FallbackGuides,
});

function FallbackGuides() {
  const { node: nodeParam } = Route.useSearch();
  const graph = useGraph();
  const [guides, setGuides] = useState<NodeFallbackGuide[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(nodeParam ?? "");

  const refresh = () => getAllGuides().then((g) => setGuides(g.sort((a, b) => b.generatedDate.localeCompare(a.generatedDate))));
  useEffect(() => { refresh(); }, []);
  useEffect(() => { if (nodeParam) setSelectedNodeId(nodeParam); }, [nodeParam]);

  const node = graph.nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Fallback Guides"
        subtitle="When any node fails, have a human-ready plan. Guides are saved offline so they work even when AI and cloud services are down."
      />

      <Tabs.Root defaultValue="generate">
        <Tabs.List className="mb-6 inline-flex gap-1 rounded-md border border-border bg-card p-1">
          {[{ v: "generate", label: "Generate a Guide" }, { v: "saved", label: `Saved Guides (${guides.length})` }].map((t) => (
            <Tabs.Trigger key={t.v} value={t.v} className="rounded px-4 py-1.5 text-sm font-semibold text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t.label}</Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="generate">
          <Card hover={false} className="mb-6 overflow-hidden p-5">
            <label className="mb-2 block text-sm font-semibold">Generate a Node Failure Guide</label>
            <select value={selectedNodeId} onChange={(e) => setSelectedNodeId(e.target.value)} className="mb-2 w-full rounded-md border border-input bg-secondary/40 px-3 py-2 text-sm">
              <option value="">Select a node to prepare for…</option>
              {graph.nodes.map((n) => <option key={n.id} value={n.id}>{n.name} ({NODE_LABELS[n.type]})</option>)}
            </select>
            {node ? <Generator key={node.id} node={node} graph={graph} onGenerated={refresh} /> : (
              <p className="mt-3 text-sm text-muted-foreground">Pick any platform, service, AI, or staff node above to build a human fallback plan for when it goes offline.</p>
            )}
          </Card>
        </Tabs.Content>

        <Tabs.Content value="saved">
          {guides.length === 0 ? (
            <EmptyState icon={<BookOpen className="h-6 w-6" />} title="No guides yet" description="Select a node in the Generate tab and create your first fallback guide." />
          ) : (
            <div className="space-y-4">
              {guides.map((g) => <GuideCard key={g.id} guide={g} onDelete={async () => { await deleteGuide(g.id); refresh(); toast.success("Guide deleted."); }} />)}
            </div>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}


function Generator({ node, graph, onGenerated }: { node: GraphNode; graph: ReturnType<typeof useGraph>; onGenerated: () => void }) {
  const conn = connectedNodes(graph, node.id);
  const connectedNames = [...conn.upstream, ...conn.downstream].map((n) => n.name);
  const [scenarios, setScenarios] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [loadingScn, setLoadingScn] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadScenarios = async () => {
    setLoadingScn(true);
    setError(null);
    try {
      const s = await suggestScenarios(node.name, NODE_LABELS[node.type], connectedNames);
      setScenarios(s);
      setSelected(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to suggest scenarios.");
    } finally {
      setLoadingScn(false);
    }
  };
  useEffect(() => { loadScenarios(); /* eslint-disable-next-line */ }, []);

  const toggle = (s: string) => setSelected((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);
  const addCustom = () => { const v = custom.trim(); if (!v) return; setScenarios((s) => [...s, v]); setSelected((s) => [...s, v]); setCustom(""); };

  const generate = async () => {
    if (selected.length === 0) { toast.error("Select at least one scenario."); return; }
    setGenerating(true);
    setError(null);
    try {
      const result = await generateNodeGuide({
        nodeName: node.name, nodeType: NODE_LABELS[node.type], connectedNodes: connectedNames, scenarios: selected,
      });
      const guide: NodeFallbackGuide = { ...result, id: uid(), nodeId: node.id, nodeName: node.name, version: 1, generatedDate: new Date().toISOString() };
      await putGuide(guide);
      updateNode(node.id, { hasGuide: true });
      toast.success("Guide generated and saved offline.");
      onGenerated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate guide.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-border bg-secondary/20 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">Suggested scenarios for "{node.name}"</h4>
        <Button variant="ghost" className="shrink-0 px-2 py-1 text-xs" onClick={loadScenarios}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
      </div>
      {loadingScn ? (
        <p className="text-xs text-muted-foreground">Suggesting failure scenarios…</p>
      ) : (
        <div className="space-y-1.5">
          {scenarios.map((s) => (
            <button key={s} onClick={() => toggle(s)} className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors ${selected.includes(s) ? "border-primary bg-primary/10" : "border-border"}`}>
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected.includes(s) ? "border-primary bg-primary" : "border-border"}`}>{selected.includes(s) && <Check className="h-3 w-3 text-primary-foreground" />}</span>
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} placeholder="Add a custom scenario…" className="min-w-0 flex-1 rounded-md border border-input bg-secondary/40 px-3 py-2 text-xs" />
        <Button variant="outline" className="shrink-0" onClick={addCustom}><Plus className="h-4 w-4" /></Button>
      </div>
      {error && <div className="mt-3"><ErrorCard message={error} onRetry={generate} /></div>}
      <div className="mt-3">
        {generating ? <AiLoading message="Drafting your fallback guide with GPT-4o…" /> : (
          <Button className="w-full" onClick={generate}><Sparkles className="h-4 w-4" /> Generate Guide ({selected.length} scenario{selected.length === 1 ? "" : "s"})</Button>
        )}
      </div>
    </div>
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
