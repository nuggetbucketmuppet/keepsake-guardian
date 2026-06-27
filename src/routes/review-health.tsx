import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { differenceInDays, format, subDays } from "date-fns";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Clock,
  AlertTriangle,
  CalendarCheck,
  Zap,
  PauseCircle,
  TrendingUp,
  AlertOctagon,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui-kit";
import { updateWorkflow, useWorkflows } from "@/lib/store";
import type { Workflow } from "@/lib/types";

export const Route = createFileRoute("/review-health")({
  head: () => ({ meta: [{ title: "Review Health — KeepSake" }] }),
  component: ReviewHealth,
});

type ReviewStatus = "Fresh" | "Aging" | "Warning" | "Critical";
function reviewOf(days: number): { status: ReviewStatus; color: string } {
  if (days >= 60) return { status: "Critical", color: "#ef4444" };
  if (days >= 30) return { status: "Warning", color: "#ef4444" };
  if (days >= 15) return { status: "Aging", color: "#f59e0b" };
  return { status: "Fresh", color: "#22c55e" };
}

function ReviewHealth() {
  const workflows = useWorkflows();
  const [statusFilter, setStatusFilter] = useState("All");
  const [deptFilter, setDeptFilter] = useState("All");
  const [agentFilter, setAgentFilter] = useState("All");
  const [pauseTarget, setPauseTarget] = useState<Workflow | null>(null);
  const [comment, setComment] = useState("");

  const enriched = useMemo(() =>
    workflows.map((w) => {
      const days = differenceInDays(new Date(), new Date(w.lastHumanTouch));
      return { ...w, days, ...reviewOf(days) };
    }).sort((a, b) => b.days - a.days), [workflows]);

  const criticalCount = enriched.filter((w) => w.status === "Critical" && !w.automationPaused).length;
  const depts = ["All", ...Array.from(new Set(workflows.map((w) => w.department)))];
  const agents = ["All", ...Array.from(new Set(workflows.map((w) => w.aiTool)))];

  const filtered = enriched.filter((w) => {
    if (statusFilter === "Warning" && !["Warning", "Critical"].includes(w.status)) return false;
    if (statusFilter === "Critical" && w.status !== "Critical") return false;
    if (deptFilter !== "All" && w.department !== deptFilter) return false;
    if (agentFilter !== "All" && w.aiTool !== agentFilter) return false;
    return true;
  });

  const atRisk = enriched.slice(0, 5);

  // Timeline: synthesise count of overdue reviews over past 90 days
  const timeline = useMemo(() => {
    const pts: { day: string; count: number }[] = [];
    for (let i = 90; i >= 0; i -= 6) {
      const date = subDays(new Date(), i);
      const count = workflows.filter((w) => {
        const d = differenceInDays(date, new Date(w.lastHumanTouch));
        return d >= 15;
      }).length;
      pts.push({ day: format(date, "d MMM"), count });
    }
    return pts;
  }, [workflows]);

  const confirmPause = () => {
    if (!pauseTarget) return;
    if (!comment.trim()) return toast.error("Manager sign-off comment is required.");
    updateWorkflow(pauseTarget.id, { automationPaused: true });
    toast.success(`Automation paused for "${pauseTarget.name}". Team notified.`);
    setPauseTarget(null);
    setComment("");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="Review Health" subtitle="Track when each workflow was last reviewed by a human and surface the ones that are overdue." />

      {criticalCount > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-3 rounded-lg border-2 border-danger bg-danger/10 p-4 text-danger animate-danger-pulse">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-bold">ACTION REQUIRED: {criticalCount} workflow{criticalCount > 1 ? "s" : ""} long overdue for human review. Automation paused pending review.</p>
        </motion.div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap gap-2">
            {["All", "Warning", "Critical"].map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${statusFilter === s ? "border-primary bg-primary/15 text-foreground" : "border-border bg-card text-muted-foreground"}`}>{s}</button>
            ))}
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm">
              {depts.map((d) => <option key={d}>{d}</option>)}
            </select>
            <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm">
              {agents.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={<Clock className="h-7 w-7" />} title="No matching workflows" description="Adjust the filters to see review health across your workflows." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((w) => {
                const pct = Math.min(100, Math.round((w.days / 60) * 100));
                return (
                  <Card key={w.id} className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display font-bold leading-snug">{w.name}</h3>
                        <p className="text-xs text-muted-foreground">{w.department} · {w.aiTool}</p>
                      </div>
                      <span className="rounded-md px-2 py-0.5 text-[11px] font-bold uppercase ring-1" style={{ color: w.color, backgroundColor: `${w.color}26`, boxShadow: `inset 0 0 0 1px ${w.color}66` }}>
                        {w.automationPaused ? "Paused" : w.status}
                      </span>
                    </div>
                    <div className="mt-4 flex items-end gap-2">
                      <span className="font-display text-4xl font-bold" style={{ color: w.color }}>{w.days}</span>
                      <span className="pb-1 text-xs text-muted-foreground">days since last review</span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">Last review: {format(new Date(w.lastHumanTouch), "d MMM yyyy")}</p>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, #22c55e, ${w.color})` }} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => { updateWorkflow(w.id, { lastHumanTouch: new Date().toISOString() }); toast.success("Review logged — clock reset."); }}><CalendarCheck className="h-4 w-4" /> Mark Reviewed</Button>
                      <Button variant="ghost" onClick={() => toast.message("Opening Failure Drills for this workflow…")}><Zap className="h-4 w-4" /> Drill</Button>
                      {!w.automationPaused && <Button variant="danger" onClick={() => setPauseTarget(w)}><PauseCircle className="h-4 w-4" /> Pause</Button>}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Timeline */}
          <Card hover={false} className="mt-6 p-5">
            <div className="mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-accent" /><h3 className="font-display font-bold">Overdue Reviews Timeline (90 days)</h3></div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3d" />
                <XAxis dataKey="day" stroke="#8b93a7" fontSize={11} interval={2} />
                <YAxis stroke="#8b93a7" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid #2a2f3d", borderRadius: 8, color: "#f1f5f9" }} />
                <Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} dot={false} name="Workflows overdue for review" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Top 5 At Risk strip */}
        <div>
          <Card hover={false} className="p-5">
            <div className="mb-4 flex items-center gap-2"><AlertOctagon className="h-4 w-4 text-danger" /><h3 className="font-display font-bold">Top 5 At Risk</h3></div>
            <div className="space-y-3">
              {atRisk.map((w, i) => (
                <div key={w.id} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary font-mono text-sm font-bold" style={{ color: w.color }}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{w.name}</p>
                    <p className="text-xs text-muted-foreground">{w.department}</p>
                  </div>
                  <span className="font-display font-bold" style={{ color: w.color }}>{w.days}d</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Pause modal */}
      <Dialog.Root open={!!pauseTarget} onOpenChange={(o) => { if (!o) { setPauseTarget(null); setComment(""); } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-2xl">
            <Dialog.Title className="font-display text-lg font-bold">Pause Automation</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              This will log a formal pause event with timestamp for <span className="font-semibold text-foreground">{pauseTarget?.name}</span>, require manager sign-off, and notify the relevant team.
            </Dialog.Description>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Manager sign-off comment</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-input bg-secondary/60 px-3 py-2 text-sm focus:border-primary focus:outline-none" placeholder="Reason for pausing automation…" />
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild><Button variant="outline">Cancel</Button></Dialog.Close>
              <Button variant="danger" onClick={confirmPause}><PauseCircle className="h-4 w-4" /> Confirm Pause</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
