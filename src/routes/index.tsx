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
import { DonutGauge, AreaTrend } from "@/components/charts";
import { useWorkflows, useGuides, useDrills } from "@/lib/store";

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
      color: "#00e5be",
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

  // Telemetry-style metrics for the gauges + trend panel.
  const guideCoverage = workflows.length
    ? Math.round((new Set(guides.map((g) => g.workflowName)).size / workflows.length) * 100)
    : 0;
  const drillReadiness = drills.length
    ? Math.round(drills.reduce((s, d) => s + d.readinessScore, 0) / drills.length)
    : 0;
  const resilienceTrend = [...workflows]
    .sort((a, b) => +new Date(a.lastUpdated) - +new Date(b.lastUpdated))
    .map((w, i) => ({ label: `WF${i + 1}`, value: w.resilienceScore }));


  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Operational Resilience Overview"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span suppressHydrationWarning>{mounted ? format(new Date(), "EEEE, d MMMM yyyy") : ""}</span>
            <span className="inline-flex items-center gap-1.5 text-accent">
              <Radio className="h-3.5 w-3.5" /> Last system sync: 2 minutes ago
            </span>
          </span>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          <StatCard key="a" label="Workflows Recorded" value={workflows.length} icon={<ClipboardList className="h-5 w-5" />} />,
          <StatCard
            key="b"
            label="AI Dependency Risk"
            value={`${depRisk}%`}
            tone={depRisk > 70 ? "danger" : "default"}
            icon={<ShieldAlert className="h-5 w-5" />}
          />,
          <StatCard key="c" label="Drills Passed (30d)" value={drillsPassedMonth} tone="success" icon={<CheckCircle2 className="h-5 w-5" />} />,
          <StatCard
            key="d"
            label="Decay Alerts Active"
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
            A live measure of how well your organisation could keep operating if its AI systems went offline right now.
          </p>
        </div>
      </Card>

      {/* Telemetry: live gauges + resilience trend */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card hover={false} className="lg:col-span-1">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Live Readiness
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-2 px-4 py-6">
            <DonutGauge value={avgResilience} size={96} label="Resilience" />
            <DonutGauge value={guideCoverage} size={96} label="Guide Cover" color="var(--accent)" />
            <DonutGauge value={drillReadiness} size={96} label="Drill Ready" color="var(--primary)" />
          </div>
        </Card>

        <Card hover={false} className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Resilience by Workflow
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">Score 0–100</span>
          </div>
          <div className="px-3 py-5">
            {resilienceTrend.length > 1 ? (
              <AreaTrend data={resilienceTrend} color="var(--accent)" unit="%" />
            ) : (
              <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                Record more workflows to see the resilience trend.
              </div>
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
