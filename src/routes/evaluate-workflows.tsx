import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Gauge, Sparkles, ShieldAlert, TrendingUp, AlertTriangle, Lightbulb, Search, ExternalLink, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, Button, AiLoading, ErrorCard, EmptyState } from "@/components/ui-kit";
import { useGraph, graphSummary, updateNode } from "@/lib/graph";
import { useWorkflows, updateWorkflow } from "@/lib/store";
import { optimiseMap, evaluateDependencyMap, suggestAlternatives } from "@/lib/claude";
import type { OptimisationResult, MapEvaluationResult, RiskNode, AlternativeSuggestion } from "@/lib/claude";

export const Route = createFileRoute("/evaluate-workflows")({
  head: () => ({ meta: [{ title: "Evaluate Workflows — KeepSake" }] }),
  component: EvaluateWorkflows,
});

const PARAMS = ["Cost", "Efficiency", "Reduce human agents", "Resilience"] as const;

function EvaluateWorkflows() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Evaluate Workflows"
        subtitle="Optimise your dependency map for cost, efficiency, or resilience — and surface the most at-risk single points of failure."
      />
      <Tabs.Root defaultValue="optimise">
        <Tabs.List className="mb-6 inline-flex gap-1 rounded-md border border-border bg-card p-1">
          {[{ v: "optimise", label: "Optimise" }, { v: "evaluation", label: "Evaluation" }].map((t) => (
            <Tabs.Trigger key={t.v} value={t.v} className="rounded px-4 py-1.5 text-sm font-semibold text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t.label}</Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="optimise"><OptimiseTab /></Tabs.Content>
        <Tabs.Content value="evaluation"><EvaluationTab /></Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function OptimiseTab() {
  const graph = useGraph();
  const workflows = useWorkflows();
  const [scope, setScope] = useState("__all__");
  const [params, setParams] = useState<string[]>(["Cost", "Efficiency"]);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimisationResult | null>(null);

  const toggle = (p: string) => setParams((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);

  const run = async () => {
    const chosen = [...params];
    if (custom.trim()) chosen.push(custom.trim());
    if (chosen.length === 0) { setError("Pick at least one optimisation parameter."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      let onlyIds: Set<string> | undefined;
      let scopeLabel = "Entire dependency map";
      if (scope !== "__all__") {
        scopeLabel = workflows.find((w) => w.id === scope)?.name ?? "Workflow";
        onlyIds = new Set(graph.nodes.filter((n) => (n.workflowIds ?? (n.workflowId ? [n.workflowId] : [])).includes(scope)).map((n) => n.id));
      }
      const res = await optimiseMap({
        scope: scopeLabel,
        parameters: params,
        custom: custom.trim() || undefined,
        graphSummary: graphSummary(graph, onlyIds),
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Optimisation failed.");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <Card hover={false} className="overflow-hidden p-5">
        <label className="mb-1 block text-sm font-semibold">Scope</label>
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="mb-4 w-full rounded-md border border-input bg-secondary/40 px-3 py-2 text-sm">
          <option value="__all__">Entire dependency map</option>
          {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>

        <label className="mb-2 block text-sm font-semibold">Optimisation parameters</label>
        <div className="mb-3 flex flex-wrap gap-2">
          {PARAMS.map((p) => (
            <button key={p} onClick={() => toggle(p)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${params.includes(p) ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>{p}</button>
          ))}
        </div>
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Custom goal (e.g. reduce vendor lock-in)" className="mb-4 w-full rounded-md border border-input bg-secondary/40 px-3 py-2 text-sm" />

        {loading ? <AiLoading message="Analysing your dependency map for optimisations…" /> : (
          <Button className="w-full" onClick={run}><Sparkles className="h-4 w-4" /> Optimise</Button>
        )}
        {error && <div className="mt-3"><ErrorCard message={error} onRetry={run} /></div>}
      </Card>

      {result && (
        <Card hover={false} className="overflow-hidden p-5">
          <p className="mb-4 text-sm text-muted-foreground">{result.summary}</p>
          <div className="space-y-3">
            {result.recommendations.map((r, i) => (
              <div key={i} className="rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-bold"><TrendingUp className="h-4 w-4 text-accent" />{r.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${r.impact === "high" ? "bg-danger/20 text-danger" : r.impact === "medium" ? "bg-amber-400/20 text-amber-400" : "bg-secondary text-muted-foreground"}`}>{r.impact} impact</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{r.rationale}</p>
                {r.affected_nodes?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.affected_nodes.map((n, j) => <span key={j} className="rounded bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{n}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function EvaluationTab() {
  const graph = useGraph();
  const workflows = useWorkflows();
  const [riskOnly, setRiskOnly] = useState(true);
  const [showScores, setShowScores] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MapEvaluationResult | null>(null);
  const [applied, setApplied] = useState(false);

  const hasNodes = useMemo(() => graph.nodes.some((n) => !n.archived), [graph]);

  const run = async () => {
    setLoading(true); setError(null); setResult(null); setApplied(false);
    try {
      const res = await evaluateDependencyMap(graphSummary(graph));
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed.");
    } finally { setLoading(false); }
  };

  // Persist the generated resilience scores across the platform.
  const applyScores = () => {
    if (!result) return;
    let nodeHits = 0;
    for (const rn of result.at_risk_nodes) {
      const match = graph.nodes.find((g) => g.name.toLowerCase() === rn.node_name.toLowerCase());
      if (match) { updateNode(match.id, { resilienceScore: rn.resilience_score }); nodeHits++; }
    }
    // Update each workflow's resilience score from the average of its (scored) nodes, else the overall.
    for (const wf of workflows) {
      const wfNodes = graph.nodes.filter((g) => (g.workflowIds ?? (g.workflowId ? [g.workflowId] : [])).includes(wf.id));
      const scored = wfNodes
        .map((g) => result.at_risk_nodes.find((rn) => rn.node_name.toLowerCase() === g.name.toLowerCase())?.resilience_score)
        .filter((s): s is number => typeof s === "number");
      const score = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : result.overall_resilience_score;
      updateWorkflow(wf.id, { resilienceScore: score });
    }
    setApplied(true);
    toast.success(`Resilience scores applied across the platform (${nodeHits} node${nodeHits === 1 ? "" : "s"} + ${workflows.length} workflow${workflows.length === 1 ? "" : "s"}).`);
  };

  const nodes = result ? (riskOnly ? result.at_risk_nodes.filter((n) => n.risk_level !== "low") : result.at_risk_nodes) : [];

  return (
    <div className="space-y-5">
      <Card hover={false} className="overflow-hidden p-5">
        <p className="mb-4 text-sm text-muted-foreground">Evaluate the entire dependency map to identify highly-depended-on, at-risk nodes — the single points of failure where an outage would cripple operations.</p>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={riskOnly} onChange={(e) => setRiskOnly(e.target.checked)} className="h-4 w-4 accent-[#6C63FF]" />
          Only show highly dependent / at-risk nodes
        </label>
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showScores} onChange={(e) => setShowScores(e.target.checked)} className="h-4 w-4 accent-[#6C63FF]" />
          Include resilience scores for nodes &amp; workflows in the report
        </label>
        {!hasNodes ? (
          <EmptyState icon={<Gauge className="h-6 w-6" />} title="No nodes to evaluate" description="Upload a workflow first to build your dependency map." />
        ) : loading ? <AiLoading message="Evaluating dependency risk across your map…" /> : (
          <Button className="w-full" onClick={run}><ShieldAlert className="h-4 w-4" /> Evaluate Dependency Map</Button>
        )}
        {error && <div className="mt-3"><ErrorCard message={error} onRetry={run} /></div>}
      </Card>

      {result && (
        <Card hover={false} className="overflow-hidden p-5">
          {showScores && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-extrabold ring-2" style={{ color: scoreHue(result.overall_resilience_score), borderColor: "transparent", boxShadow: `inset 0 0 0 3px ${scoreHue(result.overall_resilience_score)}55` }}>{result.overall_resilience_score}</span>
                <div>
                  <p className="text-sm font-bold">Overall map resilience</p>
                  <p className="text-xs text-muted-foreground">How well the business copes across all dependencies.</p>
                </div>
              </div>
              <Button variant={applied ? "outline" : "primary"} onClick={applyScores} disabled={applied}>
                {applied ? <><CheckCircle2 className="h-4 w-4" /> Applied site-wide</> : <><Sparkles className="h-4 w-4" /> Apply scores across platform</>}
              </Button>
            </div>
          )}
          <p className="mb-4 text-sm text-muted-foreground">{result.summary}</p>
          <div className="space-y-3">
            {nodes.map((n, i) => <RiskNodeCard key={i} n={n} showScore={showScores} />)}
            {nodes.length === 0 && <p className="text-sm text-muted-foreground">No nodes match the current filter.</p>}
          </div>
        </Card>
      )}
    </div>
  );
}

function scoreHue(s: number): string {
  return s >= 70 ? "#00E5BE" : s >= 45 ? "#fbbf24" : "#ef4444";
}

function RiskNodeCard({ n, showScore }: { n: RiskNode; showScore: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sug, setSug] = useState<AlternativeSuggestion | null>(null);

  const suggest = async () => {
    setLoading(true); setError(null);
    try {
      const res = await suggestAlternatives({ nodeName: n.node_name, nodeType: n.type, reason: n.reason });
      setSug(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suggestion failed.");
    } finally { setLoading(false); }
  };

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className={`h-4 w-4 ${n.risk_level === "high" ? "text-danger" : n.risk_level === "medium" ? "text-amber-400" : "text-muted-foreground"}`} />{n.node_name}</span>
        <span className="text-sm font-bold text-foreground">{n.dependency_score}<span className="text-xs text-muted-foreground">/100</span></span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{n.type} · {n.risk_level} risk</span>
        {showScore && <span className="rounded-full px-2 py-0.5 font-bold" style={{ color: scoreHue(n.resilience_score), backgroundColor: `${scoreHue(n.resilience_score)}22` }}>Resilience {n.resilience_score}/100</span>}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{n.reason}</p>
      <p className="mt-2 text-sm"><span className="font-semibold text-accent">Recommendation: </span><span className="text-muted-foreground">{n.recommendation}</span></p>

      <div className="mt-3">
        {loading ? <AiLoading message="Finding alternatives and resilience moves…" /> : (
          <Button variant="outline" className="!py-1.5 text-xs" onClick={suggest}>
            <Lightbulb className="h-3.5 w-3.5" /> {sug ? "Refresh suggestions" : "Suggestions"}
          </Button>
        )}
        {error && <div className="mt-2"><ErrorCard message={error} onRetry={suggest} /></div>}
      </div>

      {sug && (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-card p-3">
          {sug.resilience_suggestions.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-accent"><Sparkles className="h-3.5 w-3.5" /> Resilience suggestions</p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                {sug.resilience_suggestions.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {sug.key_criteria.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground">What to look for in an alternative</p>
              <div className="flex flex-wrap gap-1">
                {sug.key_criteria.map((c, i) => <span key={i} className="rounded bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{c}</span>)}
              </div>
            </div>
          )}
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-foreground"><Search className="h-3.5 w-3.5" /> Alternatives found on the web</p>
            {sug.alternatives.length === 0 ? (
              <p className="text-xs text-muted-foreground">No web results — try again later.</p>
            ) : (
              <div className="space-y-1.5">
                {sug.alternatives.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-start gap-1.5 rounded-md border border-border bg-secondary/30 p-2 text-xs hover:border-primary">
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
                    <span><span className="font-semibold text-foreground">{a.title || a.url}</span>{a.text ? <span className="text-muted-foreground"> — {a.text.slice(0, 120)}…</span> : null}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

