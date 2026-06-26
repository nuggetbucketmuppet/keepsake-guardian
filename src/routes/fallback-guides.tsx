import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import { toast } from "sonner";
import * as Tabs from "@radix-ui/react-tabs";
import {
  BookOpen,
  Sparkles,
  ChevronDown,
  Clock,
  Users,
  KeyRound,
  ListChecks,
  AlertTriangle,
  Download,
  Link2,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";
import { AiLoading, Button, Card, EmptyState, ErrorCard, PageHeader } from "@/components/ui-kit";
import { generateGuide } from "@/lib/claude";
import { saveGuide, uid, useGuides, useWorkflows } from "@/lib/store";
import type { FallbackGuide } from "@/lib/types";
import { differenceInDays } from "date-fns";

export const Route = createFileRoute("/fallback-guides")({
  head: () => ({ meta: [{ title: "Fallback Guides — KeepSake" }] }),
  component: FallbackGuides,
});

const inputCls =
  "w-full rounded-md border border-input bg-secondary/60 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none";

function FallbackGuides() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Human Fallback Guides"
        subtitle="Step-by-step instructions so your team can execute any workflow manually if AI goes offline."
      />
      <Tabs.Root defaultValue="generate">
        <Tabs.List className="mb-6 inline-flex gap-1 rounded-md border border-border bg-card p-1">
          {[{ v: "generate", label: "Generate New Guide" }, { v: "all", label: "All Guides" }].map((t) => (
            <Tabs.Trigger key={t.v} value={t.v} className="rounded px-4 py-1.5 text-sm font-semibold text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="generate"><GenerateTab /></Tabs.Content>
        <Tabs.Content value="all"><AllGuidesTab /></Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function GenerateTab() {
  const workflows = useWorkflows();
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [guide, setGuide] = useState<FallbackGuide | null>(null);
  const [errMsg, setErrMsg] = useState("");

  const run = async () => {
    const wf = workflows.find((w) => w.id === selected);
    if (!wf) {
      toast.error("Select a workflow first.");
      return;
    }
    setStatus("loading");
    try {
      const result = await generateGuide(wf);
      const full: FallbackGuide = {
        ...result,
        id: uid(),
        workflowId: wf.id,
        workflowName: wf.name,
        generatedDate: new Date().toISOString(),
      };
      saveGuide(full);
      setGuide(full);
      setStatus("done");
      toast.success("Fallback guide generated.");
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Generation failed.");
      setStatus("error");
    }
  };

  return (
    <div className="space-y-6">
      <Card hover={false} className="p-5">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Select a recorded workflow</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <select className={inputCls} value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Choose a workflow…</option>
            {workflows.map((w) => <option key={w.id} value={w.id}>{w.name} — {w.department}</option>)}
          </select>
          <Button variant="accent" onClick={run} disabled={status === "loading"} className="shrink-0">
            <Sparkles className="h-4 w-4" /> Generate Fallback Guide with AI
          </Button>
        </div>
      </Card>

      <AnimatePresence mode="wait">
        {status === "loading" && (
          <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AiLoading message="Translating AI logic into human steps..." />
          </motion.div>
        )}
        {status === "error" && (
          <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ErrorCard message={errMsg} onRetry={run} />
          </motion.div>
        )}
        {status === "done" && guide && (
          <motion.div key="d" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GuideDocument guide={guide} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function GuideDocument({ guide }: { guide: FallbackGuide }) {
  return (
    <Card hover={false} className="overflow-hidden">
      <div className="border-b border-border bg-secondary/30 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-accent">Human Fallback Guide</span>
            <h2 className="mt-1 font-display text-2xl font-bold">{guide.guide_title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Source: {guide.workflowName}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { window.print(); }}><Download className="h-4 w-4" /> Download PDF</Button>
            <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(window.location.href); toast.success("Link copied."); }}><Link2 className="h-4 w-4" /> Copy Link</Button>
            <Button variant="accent" onClick={() => toast.success("Guide marked as reviewed.")}><CheckCircle2 className="h-4 w-4" /> Mark Reviewed</Button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Meta icon={<Clock className="h-4 w-4" />} label="Manual time" value={guide.estimated_time_manual} />
          <Meta icon={<Users className="h-4 w-4" />} label="Personnel" value={guide.required_personnel.join(", ")} />
          <Meta icon={<KeyRound className="h-4 w-4" />} label="System access" value={guide.required_system_access.join(", ")} />
          <Meta icon={<ListChecks className="h-4 w-4" />} label="Steps" value={`${guide.steps.length} steps`} />
        </div>
      </div>

      <div className="p-6">
        {guide.pre_conditions.length > 0 && (
          <div className="mb-6 rounded-md border border-border bg-secondary/30 p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pre-conditions</h4>
            <ul className="space-y-1">
              {guide.pre_conditions.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{p}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-3">
          {guide.steps.map((step) => <StepCard key={step.step_number} step={step} />)}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-primary/30 bg-primary/10 p-4">
            <div className="flex items-center gap-2 text-primary"><ArrowUpRight className="h-4 w-4" /><span className="text-sm font-bold">Escalation Path</span></div>
            <p className="mt-1.5 text-sm text-muted-foreground">{guide.escalation_path}</p>
          </div>
          <div className="rounded-md border border-danger/30 bg-danger/10 p-4">
            <div className="flex items-center gap-2 text-danger"><AlertTriangle className="h-4 w-4" /><span className="text-sm font-bold">Risk if Skipped</span></div>
            <p className="mt-1.5 text-sm text-muted-foreground">{guide.estimated_risk_if_skipped}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span></div>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function StepCard({ step }: { step: FallbackGuide["steps"][number] }) {
  const [open, setOpen] = useState(step.step_number === 1);
  return (
    <div className="overflow-hidden rounded-md border border-border bg-secondary/30">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 font-mono text-sm font-bold text-primary ring-1 ring-primary/30">{step.step_number}</span>
        <span className="flex-1 font-display font-bold">{step.title}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{step.system_used}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-4 border-t border-border px-4 py-4">
              <p className="text-sm text-foreground/90">{step.detailed_instruction}</p>
              {step.decision_points.length > 0 && (
                <div>
                  <h5 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Decision flow</h5>
                  <div className="flex flex-wrap items-center gap-2">
                    {step.decision_points.map((d, i) => (
                      <span key={i} className="inline-flex items-center gap-2">
                        <span className="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs text-foreground">{d}</span>
                        {i < step.decision_points.length - 1 && <ChevronDown className="h-3 w-3 -rotate-90 text-muted-foreground" />}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {step.common_mistakes.length > 0 && (
                <div className="space-y-1.5">
                  {step.common_mistakes.map((m, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{m}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function reviewStatus(g: FallbackGuide): { label: string; cls: string } {
  const ref = g.lastReviewed ?? g.generatedDate;
  const days = differenceInDays(new Date(), new Date(ref));
  if (days <= 14) return { label: "Current", cls: "bg-success/15 text-success ring-success/40" };
  if (days <= 30) return { label: "Needs Review", cls: "bg-warning/15 text-warning ring-warning/40" };
  return { label: "Outdated", cls: "bg-danger/15 text-danger ring-danger/40" };
}

function AllGuidesTab() {
  const guides = useGuides();
  const [open, setOpen] = useState<FallbackGuide | null>(null);

  if (guides.length === 0) {
    return (
      <EmptyState icon={<BookOpen className="h-7 w-7" />} title="No fallback guides yet" description="Generate a guide from one of your recorded workflows to get started." />
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((g) => {
          const st = reviewStatus(g);
          return (
            <Card key={g.id} className="flex flex-col p-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <BookOpen className="h-5 w-5 text-accent" />
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ${st.cls}`}>{st.label}</span>
              </div>
              <h3 className="font-display font-bold leading-snug">{g.guide_title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">From: {g.workflowName}</p>
              <div className="mt-3 space-y-1 font-mono text-[11px] text-muted-foreground">
                <div>Generated: {format(new Date(g.generatedDate), "d MMM yyyy")}</div>
                <div>Reviewed: {g.lastReviewed ? format(new Date(g.lastReviewed), "d MMM yyyy") : "Never"}</div>
              </div>
              <Button variant="outline" className="mt-4" onClick={() => setOpen(g)}>View Guide</Button>
            </Card>
          );
        })}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)}>
            <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="my-4 w-full max-w-3xl">
              <GuideDocument guide={open} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
