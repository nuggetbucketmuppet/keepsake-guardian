import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { differenceInDays, format, formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  GitFork,
  ShieldAlert,
  Zap,
  ArrowRight,
  Radio,
} from "lucide-react";
import { PulseRing } from "@/components/PulseRing";
import { Card, PageHeader, StatCard } from "@/components/ui-kit";
import { DonutGauge } from "@/components/charts";
import { useWorkflows, useGuides, useDrills, useEvaluations } from "@/lib/store";
import { useGraph, downstreamCount, NODE_LABELS } from "@/lib/graph";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — KeepSake" },
      { name: "description", content: "Operational resilience overview for your organisation's AI workflows." },
    ],
  }),
  component: Dashboard,
});

const fade = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06 } }),
};

function Dashboard() {
  const workflows = useWorkflows();
  const guides = useGuides();
  const drills = useDrills();
  const evaluations = useEvaluations();
  const graph = useGraph();

  // Date-derived values depend on the current clock, which differs between the
  // server render and the client. Defer them until after mount so SSR and the
  // first client render match (avoids hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const avgResilience = workflows.length
    ? Math.round(workflows.reduce((s, w) => s + w.resilienceScore, 0) / workflows.length)
    : 0;
  const depRisk = workflows.length
    ? Math.round(workflows.reduce((s, w) => s + (100 - w.resilienceScore), 0) / workflows.length)
    : 0;
  const drillsPassedMonth = mounted
    ? drills.filter((d) => d.passed && differenceInDays(new Date(), new Date(d.dateRun)) <= 30).length
    : 0;
  const decayAlerts = mounted
    ? workflows.filter((w) => differenceInDays(new Date(), new Date(w.lastHumanTouch)) >= 30).length
    : 0;

  type Activity = { icon: typeof Activity; color: string; text: string; time: string };
  const activity: Activity[] = [
    ...workflows.slice(0, 4).map((w) => ({
      icon: Activity,
      color: "#2f9be0",
      text: `Workflow "${w.name}" recorded — resilience ${w.resilienceScore}%`,
      time: w.lastUpdated,
    })),
    ...guides.map((g) => ({
      icon: BookOpen,
      color: "#3ad17e",
      text: `Fallback guide generated for "${g.workflowName}"`,
      time: g.generatedDate,
    })),
    ...drills.map((d) => ({
      icon: Zap,
      color: d.passed ? "#22c55e" : "#f59e0b",
      text: `Drill "${d.name}" completed — grade ${d.grade} (${d.readinessScore}%)`,
      time: d.dateRun,
    })),
    ...(mounted
      ? workflows
          .filter((w) => differenceInDays(new Date(), new Date(w.lastHumanTouch)) >= 30)
          .slice(0, 3)
          .map((w) => ({
            icon: AlertTriangle,
            color: "#ef4444",
            text: `Knowledge decay alert: "${w.name}" untouched ${differenceInDays(new Date(), new Date(w.lastHumanTouch))} days`,
            time: w.lastUpdated,
          }))
      : []),
  ].sort((a, b) => +new Date(b.time) - +new Date(a.time));

  const quickActions = [
    { to: "/workflow-recorder", icon: Activity, title: "Upload a Workflow", desc: "Map tools, AI, and process code in one place.", glow: "primary" as const },
    { to: "/dependency-map", icon: GitFork, title: "Dependency Map", desc: "See single points of failure across your stack.", glow: "accent" as const },
    { to: "/failure-drills", icon: Zap, title: "Run a Failure Drill", desc: "Test your team's offline readiness.", glow: "primary" as const },
    { to: "/fallback-guides", icon: BookOpen, title: "Fallback Guides", desc: "Human-ready plans for when nodes fail.", glow: "accent" as const },
  ];

  // Readiness metrics.
  const guideCoverage = workflows.length
    ? Math.round((new Set(guides.map((g) => g.workflowId)).size / workflows.length) * 100)
    : 0;
  const lastDrillDate = drills.length
    ? drills.map((d) => +new Date(d.dateRun)).sort((a, b) => b - a)[0]
    : null;
  const daysSinceDrill = mounted && lastDrillDate != null
    ? differenceInDays(new Date(), new Date(lastDrillDate))
    : null;
  const policyScore = (() => {
    const latest = new Map<string, number>();
    [...evaluations]
      .sort((a, b) => a.evaluatedDate.localeCompare(b.evaluatedDate))
      .forEach((e) => latest.set(e.workflowId, e.compliance_score));
    const vals = [...latest.values()];
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  })();

  // Critical nodes ranked by number of downstream dependencies (single points of failure).
  const criticalNodes = graph.nodes
    .filter((n) => !n.archived)
    .map((n) => ({ node: n, deps: downstreamCount(graph, n.id) }))
    .filter((x) => x.deps > 0)
    .sort((a, b) => b.deps - a.deps)
    .slice(0, 3);
  const maxDeps = criticalNodes[0]?.deps ?? 1;
  const critColor = (i: number) => (i === 0 ? "var(--danger)" : i === 1 ? "#fbbf24" : "var(--accent)");


  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Operational Resilience Overview"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span suppressHydrationWarning>{mounted ? format(new Date(), "EEEE, d MMMM yyyy") : ""}</span>
            <span className="inline-flex items-center gap-1.5 text-accent">
              <Radio className="h-3.5 w-3.5" /> Synced 2 minutes ago
            </span>
          </span>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          <StatCard key="a" label="Workflows" value={workflows.length} icon={<ClipboardList className="h-5 w-5" />} />,
          <StatCard
            key="b"
            label="Dependency Risk"
            value={`${depRisk}%`}
            tone={depRisk > 70 ? "danger" : "default"}
            icon={<ShieldAlert className="h-5 w-5" />}
          />,
          <StatCard key="c" label="Drills Passed (30d)" value={drillsPassedMonth} tone="success" icon={<CheckCircle2 className="h-5 w-5" />} />,
          <StatCard
            key="d"
            label="Decay Alerts"
            value={decayAlerts}
            tone="warning"
            icon={<AlertTriangle className="h-5 w-5" />}
            badge={
              decayAlerts > 0 ? (
                <span className="mb-1 rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-warning ring-1 ring-warning/40">
                  Action
                </span>
              ) : undefined
            }
          />,
        ].map((el, i) => (
          <motion.div key={i} custom={i} initial="hidden" animate="show" variants={fade}>
            {el}
          </motion.div>
        ))}
      </div>

      {/* Hero pulse ring */}
      <Card hover={false} className="mt-6 overflow-hidden bg-grid">
        <div className="flex flex-col items-center px-6 py-10">
          <PulseRing score={avgResilience} />
          <p className="mt-6 max-w-md text-center text-sm text-muted-foreground">
            How well your organisation keeps running if its AI systems go offline now.
          </p>
        </div>
      </Card>

      {/* Readiness + critical nodes */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Readiness — inverted-triangle gauge arrangement */}
        <Card hover={false}>
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Readiness Signals
            </h2>
          </div>
          <div className="flex flex-col items-center gap-4 px-4 py-7">
            <div className="flex flex-wrap items-start justify-center gap-10">
              <DonutGauge value={guideCoverage} size={104} label="Guide Coverage" color="var(--accent)" />
              <DonutGauge value={policyScore} size={104} label="Policy Compliance" color="var(--primary)" />
            </div>
            <DonutGauge
              value={daysSinceDrill ?? 0}
              size={104}
              label="Days Since Last Drill"
              unit=""
              color={daysSinceDrill == null || daysSinceDrill <= 30 ? "var(--accent)" : "var(--danger)"}
            />
          </div>
        </Card>

        {/* Critical nodes ranked */}
        <Card hover={false}>
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Critical Nodes
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">Top 3 by downstream deps</span>
          </div>
          <div className="space-y-4 px-5 py-6">
            {criticalNodes.length === 0 ? (
              <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
                Map workflows to surface single points of failure.
              </div>
            ) : (
              criticalNodes.map((c, i) => (
                <Link key={c.node.id} to="/dependency-map" className="block">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                      <span className="truncate font-semibold">{c.node.name}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{NODE_LABELS[c.node.type]}</span>
                    </span>
                    <span className="shrink-0 font-bold" style={{ color: critColor(i) }}>{c.deps} deps</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-sm bg-secondary">
                    <motion.div
                      className="h-full rounded-sm"
                      style={{ backgroundColor: critColor(i) }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(c.deps / maxDeps) * 100}%` }}
                      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: i * 0.1 }}
                    />
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>




      {/* Quick actions */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {quickActions.map((a, i) => (
          <motion.div key={a.to} custom={i} initial="hidden" animate="show" variants={fade}>
            <Link to={a.to}>
              <Card glow={a.glow} className="group flex h-full items-center gap-4 p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
                  <a.icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.desc}</div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Recent activity */}
      <div className="mt-6">
        <h2 className="mb-3 font-display text-lg font-bold">Recent Activity</h2>
        <Card hover={false} className="p-2">
          <div className="max-h-96 space-y-1 overflow-y-auto p-2">
            {activity.map((a, i) => (
              <div key={i} className="flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-secondary/60">
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: `${a.color}22`, color: a.color }}
                >
                  <a.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{a.text}</p>
                  <p className="font-mono text-[11px] text-muted-foreground" suppressHydrationWarning>
                    {mounted ? formatDistanceToNow(new Date(a.time), { addSuffix: true }) : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
