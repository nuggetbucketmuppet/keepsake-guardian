import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import Confetti from "react-confetti";
import { toast } from "sonner";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Zap,
  Sparkles,
  Lightbulb,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Trophy,
  Upload,
  FileDown,
  RotateCcw,
} from "lucide-react";
import {
  AiLoading,
  Button,
  Card,
  EmptyState,
  ErrorCard,
  PageHeader,
  ScoreGauge,
} from "@/components/ui-kit";
import { generateDrill, generateDebrief } from "@/lib/claude";
import { saveDrill, uid, useDrills, useWorkflows } from "@/lib/store";
import { useGraph, NODE_LABELS, NODE_COLORS } from "@/lib/graph";
import type { DrillRecord, DrillScenario } from "@/lib/types";

export const Route = createFileRoute("/failure-drills")({
  head: () => ({ meta: [{ title: "Failure Drills — KeepSake" }] }),
  validateSearch: (search: Record<string, unknown>): { nodes?: string } => ({
    nodes: typeof search.nodes === "string" ? search.nodes : undefined,
  }),
  component: FailureDrills,
});

const inputCls =
  "w-full rounded-md border border-input bg-secondary/60 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none";

function gradeFor(pct: number): string {
  if (pct >= 90) return "A";
  if (pct >= 75) return "B";
  if (pct >= 60) return "C";
  return "F";
}

function FailureDrills() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="Failure Drill Simulator" subtitle="Test whether your team can keep operations running when any tool, service, AI, or staff member goes offline." />
      <Tabs.Root defaultValue="run">
        <Tabs.List className="mb-6 inline-flex gap-1 rounded-md border border-border bg-card p-1">
          {[{ v: "run", label: "Run a Drill" }, { v: "history", label: "Drill History" }].map((t) => (
            <Tabs.Trigger key={t.v} value={t.v} className="rounded px-4 py-1.5 text-sm font-semibold text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t.label}</Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="run"><RunDrill /></Tabs.Content>
        <Tabs.Content value="history"><DrillHistory /></Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

type Phase = "config" | "loading" | "error" | "active" | "results";

function RunDrill() {
  const workflows = useWorkflows();
  const graph = useGraph();
  const search = Route.useSearch();

  // Candidates are ALL nodes — platforms, services, AI, and human staff.
  const [downNodeIds, setDownNodeIds] = useState<string[]>([]);
  const [affected, setAffected] = useState<string[]>([]);
  const [duration, setDuration] = useState("1 day");
  const [mode, setMode] = useState("Guided");
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [team, setTeam] = useState("");

  const [phase, setPhase] = useState<Phase>("config");
  const [scenario, setScenario] = useState<DrillScenario | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [completed, setCompleted] = useState<string[]>([]);
  const [hints, setHints] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<DrillRecord | null>(null);
  const [debrief, setDebrief] = useState("");
  const [debriefLoading, setDebriefLoading] = useState(false);

  // Preselect nodes sent from the Dependency Map ("Send to Failure Drill")
  useEffect(() => {
    if (search.nodes) {
      const ids = search.nodes.split(",").filter(Boolean);
      if (ids.length) setDownNodeIds(ids);
    }
  }, [search.nodes]);

  const downNodes = useMemo(() => graph.nodes.filter((n) => downNodeIds.includes(n.id)), [graph, downNodeIds]);
  const downNames = downNodes.map((n) => n.name).join(", ");

  // timer
  useEffect(() => {
    if (phase !== "active") return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const generate = async () => {
    if (downNodeIds.length === 0) return toast.error("Select at least one node to take down.");
    if (!team.trim()) return toast.error("Enter a target team to assess.");
    setPhase("loading");
    try {
      const sc = await generateDrill({ agent: downNames, downedNodes: downNodes.map((n) => ({ name: n.name, type: n.type })), affectedWorkflows: affected, outageDuration: duration, mode, team });
      setScenario(sc);
      setCompleted([]);
      setEvidence({});
      setHints([]);
      setElapsed(0);
      setPhase("active");
      toast.success("Drill scenario generated.");
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Failed to generate scenario.");
      setPhase("error");
    }
  };


  const score = useMemo(() => {
    if (!scenario) return 0;
    const done = scenario.drill_tasks.filter((t) => completed.includes(t.task_id));
    const pts = scenario.drill_tasks.length ? Math.round((done.length / scenario.drill_tasks.length) * scenario.total_points_available) : 0;
    return pts;
  }, [scenario, completed]);

  const finish = async () => {
    if (!scenario) return;
    const pct = scenario.total_points_available ? Math.round((score / scenario.total_points_available) * 100) : 0;
    const criticalDone = scenario.drill_tasks.filter((t) => t.is_critical).every((t) => completed.includes(t.task_id));
    const passed = criticalDone && pct >= 60;
    const rec: DrillRecord = {
      id: uid(), name: scenario.scenario_title, dateRun: new Date().toISOString(),
      agent: downNames, team, outageDuration: duration, mode, readinessScore: pct, grade: gradeFor(pct),
      passed, scenario, completedTasks: completed,
    };
    setResult(rec);
    setPhase("results");
    setDebriefLoading(true);
    try {
      const { debrief: db } = await generateDebrief({ scenario, completedTasks: completed, readinessScore: pct, team });
      setDebrief(db);
      rec.debrief = db;
    } catch {
      setDebrief("Debrief unavailable. Review completed tasks and address any incomplete critical items before the next drill.");
    } finally {
      setDebriefLoading(false);
      saveDrill(rec);
    }
  };

  const reset = () => { setPhase("config"); setScenario(null); setResult(null); setDebrief(""); };

  if (phase === "loading") return <AiLoading message="Constructing failure scenario..." />;
  if (phase === "error") return <ErrorCard message={errMsg} onRetry={generate} />;

  if (phase === "active" && scenario) {
    return (
      <ActiveDrill scenario={scenario} mode={mode} completed={completed} hints={hints} evidence={evidence} elapsed={elapsed} score={score}
        onComplete={(id) => setCompleted((c) => c.includes(id) ? c : [...c, id])}
        onHint={(id) => setHints((h) => h.includes(id) ? h : [...h, id])}
        onEvidence={(id, name) => setEvidence((e) => ({ ...e, [id]: name }))}
        onFinish={finish} />
    );
  }

  if (phase === "results" && result) {
    return <Results result={result} debrief={debrief} debriefLoading={debriefLoading} onReset={reset} />;
  }

  return (
    <Card hover={false} className="space-y-5 p-6">
      <h3 className="font-display text-lg font-bold">Step 1 — Configure the drill</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI Agent to simulate offline</label>
          <select className={inputCls} value={agent} onChange={(e) => { setAgent(e.target.value); setAffected([]); }}>
            <option value="">Select an agent…</option>
            {agents.map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outage duration</label>
          <select className={inputCls} value={duration} onChange={(e) => setDuration(e.target.value)}>
            {["4 hours", "1 day", "3 days", "1 week"].map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Affected workflows</label>
        {relatedWorkflows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{agent ? "No workflows linked to this agent." : "Select an agent to see affected workflows."}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {relatedWorkflows.map((w) => (
              <label key={w.id} className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
                <input type="checkbox" checked={affected.includes(w.name)} onChange={(e) => setAffected((a) => e.target.checked ? [...a, w.name] : a.filter((x) => x !== w.name))} />
                {w.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Drill mode</label>
          <div className="flex gap-2">
            {["Guided", "Unguided"].map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${mode === m ? "border-primary bg-primary/15 text-foreground" : "border-border bg-secondary/40 text-muted-foreground"}`}>{m}</button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{mode === "Guided" ? "Hints available per task." : "No hints — true readiness assessment."}</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target team to assess</label>
          <input className={inputCls} value={team} onChange={(e) => setTeam(e.target.value)} placeholder="e.g. Finance Operations" />
        </div>
      </div>

      <Button variant="accent" onClick={generate}><Sparkles className="h-4 w-4" /> Generate Drill Scenario</Button>
    </Card>
  );
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function ActiveDrill({ scenario, mode, completed, hints, evidence, elapsed, score, onComplete, onHint, onEvidence, onFinish }: {
  scenario: DrillScenario; mode: string; completed: string[]; hints: string[]; evidence: Record<string, string>; elapsed: number; score: number;
  onComplete: (id: string) => void; onHint: (id: string) => void; onEvidence: (id: string, name: string) => void; onFinish: () => void;
}) {
  const allDone = scenario.drill_tasks.every((t) => completed.includes(t.task_id));
  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border-2 border-danger bg-danger/10 p-5"
        style={{ animation: "pulse-border 2s ease-in-out infinite" }}>
        <div className="flex items-center gap-2 text-danger"><AlertTriangle className="h-5 w-5" /><span className="font-display text-sm font-bold uppercase tracking-wide">Active Drill — {scenario.scenario_title}</span></div>
        <p className="mt-3 whitespace-pre-line text-sm text-foreground/90">{scenario.scenario_briefing}</p>
      </motion.div>

      <div className="sticky top-2 z-10 flex flex-col gap-3 rounded-lg border border-border bg-card/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="font-display text-lg font-bold leading-snug">{scenario.critical_question}</p>
        <div className="flex shrink-0 items-center gap-4">
          <div className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground"><Clock className="h-4 w-4" />{fmtTime(elapsed)}</div>
          <div className="rounded-md bg-accent/15 px-3 py-1.5 font-display text-lg font-bold text-accent">{score} pts</div>
        </div>
      </div>

      <div className="space-y-3">
        {scenario.drill_tasks.map((task) => {
          const done = completed.includes(task.task_id);
          return (
            <Card key={task.task_id} hover={false} className={`p-4 ${done ? "border-success/40" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-display font-bold">{task.task_title}</h4>
                    {task.is_critical && <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-danger ring-1 ring-danger/40">Critical</span>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{task.task_description}</p>
                  <div className="mt-2 flex flex-wrap gap-3 font-mono text-[11px] text-muted-foreground">
                    <span>{task.requires_system_access}</span>
                    <span>~{task.estimated_minutes} min</span>
                  </div>
                  {mode === "Guided" && hints.includes(task.task_id) && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />{task.hint}
                    </motion.div>
                  )}
                  {evidence[task.task_id] && (
                    <div className="mt-2 flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-1.5 text-xs text-success">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Evidence: {evidence[task.task_id]}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <Button variant={done ? "outline" : "accent"} onClick={() => onComplete(task.task_id)} disabled={done}>
                    <CheckCircle2 className="h-4 w-4" /> {done ? "Done" : "Mark Complete"}
                  </Button>
                  <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <Upload className="h-4 w-4" /> {evidence[task.task_id] ? "Replace" : "Evidence"}
                    <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onEvidence(task.task_id, f.name); }} />
                  </label>
                  {mode === "Guided" && !hints.includes(task.task_id) && <Button variant="ghost" onClick={() => onHint(task.task_id)}><Lightbulb className="h-4 w-4" /> Hint</Button>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Button variant="primary" className="w-full" onClick={onFinish}>
        <Trophy className="h-4 w-4" /> {allDone ? "Complete Drill & View Results" : "End Drill Early & Score"}
      </Button>
    </div>
  );
}

function Results({ result, debrief, debriefLoading, onReset }: { result: DrillRecord; debrief: string; debriefLoading: boolean; onReset: () => void }) {
  const [showConfetti, setShowConfetti] = useState(result.passed);
  useEffect(() => {
    if (result.passed) { const t = setTimeout(() => setShowConfetti(false), 3000); return () => clearTimeout(t); }
  }, [result.passed]);

  const sc = result.scenario;
  return (
    <div className="space-y-5">
      {showConfetti && <Confetti recycle={false} numberOfPieces={280} />}
      <Card hover={false} className="flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:text-left">
        <ScoreGauge score={result.readinessScore} size={150} />
        <div>
          <div className="flex items-center gap-3">
            <span className="font-display text-5xl font-bold" style={{ color: result.passed ? "#22c55e" : "#ef4444" }}>{result.grade}</span>
            <span className={`rounded-md px-3 py-1 text-sm font-bold uppercase ring-1 ${result.passed ? "bg-success/15 text-success ring-success/40" : "bg-danger/15 text-danger ring-danger/40"}`}>{result.passed ? "Passed" : "Failed"}</span>
          </div>
          <h3 className="mt-2 font-display text-xl font-bold">{result.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{result.team} · {result.agent} offline for {result.outageDuration}</p>
          <p className="mt-1 text-xs text-muted-foreground">Pass requires all critical tasks complete and ≥60% readiness.</p>
        </div>
      </Card>

      <Card hover={false} className="p-5">
        <h4 className="mb-3 font-display font-bold">Scoring Breakdown</h4>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase text-muted-foreground"><th className="py-2">Criterion</th><th className="py-2 text-right">Points</th></tr></thead>
          <tbody>
            {sc.scoring_criteria.map((c, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-2"><div className="font-medium">{c.criterion}</div><div className="text-xs text-muted-foreground">{c.description}</div></td>
                <td className="py-2 text-right font-mono">{Math.round(c.points_available * result.readinessScore / 100)}/{c.points_available}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card hover={false} className="p-5">
        <h4 className="mb-3 font-display font-bold">AI Debrief</h4>
        {debriefLoading ? <p className="font-mono text-sm text-accent">Analysing team performance…</p> : <p className="whitespace-pre-line text-sm text-foreground/90">{debrief}</p>}
      </Card>

      <div className="flex gap-3">
        <Button variant="accent" onClick={() => toast.success("Drill report exported.")}><FileDown className="h-4 w-4" /> Export Drill Report</Button>
        <Button variant="outline" onClick={onReset}><RotateCcw className="h-4 w-4" /> Run Another Drill</Button>
      </div>
    </div>
  );
}

function DrillHistory() {
  const drills = useDrills();
  if (drills.length === 0) {
    return <EmptyState icon={<Zap className="h-7 w-7" />} title="No drills run yet" description="Run your first AI failure drill to assess team readiness." />;
  }
  return (
    <Card hover={false} className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
          <th className="p-3">Drill</th><th className="p-3">Date</th><th className="p-3">Agent</th><th className="p-3">Team</th><th className="p-3">Score</th><th className="p-3">Grade</th><th className="p-3"></th>
        </tr></thead>
        <tbody>
          {drills.map((d) => (
            <tr key={d.id} className="border-b border-border/50">
              <td className="p-3 font-medium">{d.name}</td>
              <td className="p-3 text-muted-foreground">{format(new Date(d.dateRun), "d MMM yyyy")}</td>
              <td className="p-3 text-muted-foreground">{d.agent}</td>
              <td className="p-3 text-muted-foreground">{d.team}</td>
              <td className="p-3 font-mono">{d.readinessScore}%</td>
              <td className="p-3"><span className={`rounded px-2 py-0.5 text-xs font-bold ${d.passed ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>{d.grade}</span></td>
              <td className="p-3"><Button variant="ghost" onClick={() => toast.message(d.debrief || "No debrief available.")}>View Report</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
