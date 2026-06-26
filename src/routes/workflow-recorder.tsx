import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Activity,
  Plus,
  Trash2,
  Save,
  Search,
  X,
  Info,
  FileText,
  BookOpen,
  Eye,
  CheckCircle2,
} from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AiLoading,
  Button,
  Card,
  ErrorCard,
  EmptyState,
  PageHeader,
  ScoreBadge,
  ScoreGauge,
  SeverityBadge,
} from "@/components/ui-kit";
import { analyzeWorkflow } from "@/lib/claude";
import { deleteWorkflow, saveWorkflow, uid, useWorkflows } from "@/lib/store";
import type {
  AnalysisResult,
  Classification,
  DataUsed,
  DecisionNode,
  Department,
  Frequency,
  Severity,
  SystemTouched,
  Workflow,
} from "@/lib/types";

export const Route = createFileRoute("/workflow-recorder")({
  head: () => ({ meta: [{ title: "Workflow Recorder — KeepSake" }] }),
  component: WorkflowRecorder,
});

const inputCls =
  "w-full rounded-md border border-input bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground";

const departments: Department[] = ["Finance", "Procurement", "HR", "IT", "Customer Success", "Operations", "Legal", "Others"];
const frequencies: Frequency[] = ["Daily", "Weekly", "Monthly", "Ad-hoc"];
const classifications: Classification[] = ["Public", "Internal", "Confidential", "Restricted"];
const classHelp: Record<Classification, string> = {
  Public: "Shareable externally with no restriction.",
  Internal: "For employees only; low sensitivity.",
  Confidential: "Sensitive business data; restricted distribution.",
  Restricted: "Highly sensitive / regulated data; tightly controlled.",
};

function SectionCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card hover={false} className="p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 font-mono text-xs font-bold text-primary ring-1 ring-primary/30">
          {n}
        </span>
        <h3 className="font-display text-base font-bold">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

function WorkflowRecorder() {
  const [tab, setTab] = useState("record");
  const [editing, setEditing] = useState<Workflow | null>(null);

  const startEdit = (wf: Workflow) => {
    setEditing(wf);
    setTab("record");
  };
  const onSaved = () => {
    setEditing(null);
    setTab("list");
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Record an AI Workflow"
        subtitle="Document what your AI agents are doing so your team can take over when needed."
      />
      <Tabs.Root value={tab} onValueChange={(v) => { setTab(v); if (v === "record") return; setEditing(null); }}>
        <Tabs.List className="mb-6 inline-flex gap-1 rounded-md border border-border bg-card p-1">
          {[
            { v: "record", label: editing ? "Edit Workflow" : "Record New Workflow" },
            { v: "list", label: "Recorded Workflows" },
          ].map((t) => (
            <Tabs.Trigger
              key={t.v}
              value={t.v}
              className="rounded px-4 py-1.5 text-sm font-semibold text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="record">
          <RecordForm key={editing?.id ?? "new"} initial={editing} onSaved={onSaved} />
        </Tabs.Content>
        <Tabs.Content value="list">
          <RecordedTable onEdit={startEdit} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function RecordForm({ initial, onSaved }: { initial?: Workflow | null; onSaved?: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [department, setDepartment] = useState<Department>(initial?.department ?? "Finance");
  const [aiTool, setAiTool] = useState(initial?.aiTool ?? "");
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? "Monthly");
  const [classification, setClassification] = useState<Classification>(initial?.classification ?? "Internal");
  const [taskDescription, setTaskDescription] = useState(initial?.taskDescription ?? "");
  const [expectedOutput, setExpectedOutput] = useState(initial?.expectedOutput ?? "");
  const [systems, setSystems] = useState<SystemTouched[]>(
    initial?.systems?.length ? initial.systems : [{ systemName: "NetSuite ERP", action: "Write", dataType: "Invoice records" }],
  );
  const [decisions, setDecisions] = useState<DecisionNode[]>(
    initial?.decisions?.length ? initial.decisions : [{ decisionPoint: "", options: "", chosen: "", reason: "" }],
  );
  const [data, setData] = useState<DataUsed[]>(
    initial?.data?.length ? initial.data : [{ source: "", type: "Operational", volume: "" }],
  );
  const [code, setCode] = useState(initial?.code ?? "");
  const [codeLanguage, setCodeLanguage] = useState(initial?.codeLanguage ?? "pseudocode");
  const [approvalsSkipped, setApprovalsSkipped] = useState(initial?.approvalsSkipped ?? false);
  const [skippedWhich, setSkippedWhich] = useState(initial?.skippedWhich ?? "");
  const [skippedReason, setSkippedReason] = useState(initial?.skippedReason ?? "");
  const [skippedRisk, setSkippedRisk] = useState<Severity>(initial?.skippedRisk ?? "medium");

  const isEditing = !!initial;

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<AnalysisResult | null>(initial?.analysis ?? null);
  const [errMsg, setErrMsg] = useState("");

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Workflow name is required.";
    if (!aiTool.trim()) e.aiTool = "AI agent / tool is required.";
    if (!taskDescription.trim()) e.taskDescription = "Task description is required.";
    if (!expectedOutput.trim()) e.expectedOutput = "Expected output is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildWorkflow = (analysis?: AnalysisResult): Workflow => {
    const now = new Date().toISOString();
    return {
      id: initial?.id ?? uid(),
      name,
      department,
      aiTool,
      frequency,
      classification,
      taskDescription,
      expectedOutput,
      systems: systems.filter((s) => s.systemName.trim()),
      decisions: decisions.filter((d) => d.decisionPoint.trim()),
      data: data.filter((d) => d.source.trim()),
      code: code.trim() || undefined,
      codeLanguage: code.trim() ? codeLanguage : undefined,
      approvalsSkipped,
      skippedWhich,
      skippedReason,
      skippedRisk,
      resilienceScore: analysis?.resilience_score ?? initial?.resilienceScore ?? 50,
      analysis,
      hasGuide: initial?.hasGuide,
      lastUpdated: now,
      lastEdited: isEditing ? now : undefined,
      lastHumanTouch: now,
    };
  };

  const submit = async () => {
    if (!validate()) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setStatus("loading");
    setResult(null);
    try {
      const analysis = await analyzeWorkflow(buildWorkflow());
      const wf = buildWorkflow(analysis);
      saveWorkflow(wf);
      setResult(analysis);
      setStatus("done");
      toast.success(isEditing ? "Workflow updated and re-analysed." : "Workflow saved and analysed.");
      onSaved?.();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Analysis failed.");
      setStatus("error");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <SectionCard n={1} title="Workflow Identity">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Workflow Name</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Monthly Vendor Invoice Processing" />
              {errors.name && <p className="mt-1 text-xs text-danger">{errors.name}</p>}
            </div>
            <div>
              <label className={labelCls}>Department</label>
              <select className={inputCls} value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
                {departments.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>AI Agent / Tool Used</label>
              <input className={inputCls} value={aiTool} onChange={(e) => setAiTool(e.target.value)} placeholder="Zapier + GPT-4o" />
              {errors.aiTool && <p className="mt-1 text-xs text-danger">{errors.aiTool}</p>}
            </div>
            <div>
              <label className={labelCls}>Workflow Frequency</label>
              <select className={inputCls} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
                {frequencies.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className={`${labelCls} flex items-center gap-1`}>
                Classification Level
                <span className="group relative inline-flex">
                  <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-52 -translate-x-1/2 rounded-md border border-border bg-popover p-2 text-[11px] font-normal normal-case text-foreground shadow-lg group-hover:block">
                    {classHelp[classification]}
                  </span>
                </span>
              </label>
              <select className={inputCls} value={classification} onChange={(e) => setClassification(e.target.value as Classification)}>
                {classifications.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </SectionCard>

        <SectionCard n={2} title="What Task Was Done">
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Task Description</label>
              <textarea className={`${inputCls} min-h-28`} value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder="Describe what the AI agent did, step by step..." />
              {errors.taskDescription && <p className="mt-1 text-xs text-danger">{errors.taskDescription}</p>}
            </div>
            <div>
              <label className={labelCls}>Expected Output</label>
              <input className={inputCls} value={expectedOutput} onChange={(e) => setExpectedOutput(e.target.value)} placeholder="Approved invoices list sent to finance team" />
              {errors.expectedOutput && <p className="mt-1 text-xs text-danger">{errors.expectedOutput}</p>}
            </div>
          </div>
        </SectionCard>

        <SectionCard n={3} title="Systems Touched">
          <DynamicRows
            rows={systems}
            onChange={setSystems}
            addLabel="Add System"
            empty={{ systemName: "", action: "Read", dataType: "" } as SystemTouched}
            render={(row, update) => (
              <>
                <input className={inputCls} placeholder="System name" value={row.systemName} onChange={(e) => update({ systemName: e.target.value })} />
                <select className={inputCls} value={row.action} onChange={(e) => update({ action: e.target.value as SystemTouched["action"] })}>
                  {["Read", "Write", "Approve", "Notify", "Delete"].map((a) => <option key={a}>{a}</option>)}
                </select>
                <input className={inputCls} placeholder="Data type accessed" value={row.dataType} onChange={(e) => update({ dataType: e.target.value })} />
              </>
            )}
            cols="grid-cols-1 sm:grid-cols-[1fr_120px_1fr_auto]"
          />
        </SectionCard>

        <SectionCard n={4} title="Decisions Made">
          <DynamicRows
            rows={decisions}
            onChange={setDecisions}
            addLabel="Add Decision Point"
            empty={{ decisionPoint: "", options: "", chosen: "", reason: "" } as DecisionNode}
            render={(row, update) => (
              <>
                <input className={inputCls} placeholder="Decision point" value={row.decisionPoint} onChange={(e) => update({ decisionPoint: e.target.value })} />
                <input className={inputCls} placeholder="Options available" value={row.options} onChange={(e) => update({ options: e.target.value })} />
                <input className={inputCls} placeholder="Option chosen" value={row.chosen} onChange={(e) => update({ chosen: e.target.value })} />
                <input className={inputCls} placeholder="Logic / reason" value={row.reason} onChange={(e) => update({ reason: e.target.value })} />
              </>
            )}
            cols="grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]"
          />
        </SectionCard>

        <SectionCard n={5} title="Add System Processes">
          <CodeCard code={code} setCode={setCode} language={codeLanguage} setLanguage={setCodeLanguage} />
        </SectionCard>

        <SectionCard n={6} title="Data Used">

          <DynamicRows
            rows={data}
            onChange={setData}
            addLabel="Add Data Source"
            empty={{ source: "", type: "Operational", volume: "" } as DataUsed}
            render={(row, update) => (
              <>
                <input className={inputCls} placeholder="Data source" value={row.source} onChange={(e) => update({ source: e.target.value })} />
                <select className={inputCls} value={row.type} onChange={(e) => update({ type: e.target.value as DataUsed["type"] })}>
                  {["PII", "Financial", "Operational", "Public"].map((t) => <option key={t}>{t}</option>)}
                </select>
                <input className={inputCls} placeholder="Volume / frequency" value={row.volume} onChange={(e) => update({ volume: e.target.value })} />
              </>
            )}
            cols="grid-cols-1 sm:grid-cols-[1fr_140px_1fr_auto]"
          />
        </SectionCard>

        <SectionCard n={7} title="Approvals and Overrides">
          <div className="space-y-4">
            <label className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-4 py-3">
              <span className="text-sm font-medium">Were any approvals skipped?</span>
              <button
                type="button"
                onClick={() => setApprovalsSkipped((v) => !v)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${approvalsSkipped ? "bg-danger" : "bg-secondary"}`}
                aria-pressed={approvalsSkipped}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${approvalsSkipped ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </label>
            <AnimatePresence>
              {approvalsSkipped && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="grid gap-4 overflow-hidden sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Which approvals were skipped?</label>
                    <input className={inputCls} value={skippedWhich} onChange={(e) => setSkippedWhich(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Reason skipped</label>
                    <input className={inputCls} value={skippedReason} onChange={(e) => setSkippedReason(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Risk level of skipping</label>
                    <select className={inputCls} value={skippedRisk} onChange={(e) => setSkippedRisk(e.target.value as Severity)}>
                      {(["low", "medium", "high", "critical"] as Severity[]).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </SectionCard>

        <div className="flex justify-end">
          <Button onClick={submit} disabled={status === "loading"}>
            <Save className="h-4 w-4" /> Save Workflow Record
          </Button>
        </div>
      </div>

      {/* Result panel */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <AnimatePresence mode="wait">
          {status === "idle" && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card hover={false} className="flex flex-col items-center justify-center px-5 py-12 text-center">
                <FileText className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Save the workflow to run an AI resilience analysis.</p>
              </Card>
            </motion.div>
          )}
          {status === "loading" && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AiLoading message="Analysing resilience risks..." />
            </motion.div>
          )}
          {status === "error" && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ErrorCard message={errMsg} onRetry={submit} />
            </motion.div>
          )}
          {status === "done" && result && (
            <motion.div key="done" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              <AnalysisPanel result={result} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AnalysisPanel({ result }: { result: AnalysisResult }) {
  return (
    <Card hover={false} className="p-5">
      <h3 className="mb-3 font-display text-base font-bold">Resilience Analysis</h3>
      <div className="flex items-center gap-4">
        <ScoreGauge score={result.resilience_score} size={96} />
        <p className="flex-1 text-xs text-muted-foreground">{result.resilience_reasoning}</p>
      </div>

      <div className="mt-5">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risk Flags</h4>
        <div className="space-y-2">
          {result.risk_flags.map((f, i) => (
            <div key={i} className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{f.flag_title}</span>
                <SeverityBadge severity={f.severity} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommended Actions</h4>
        <ul className="space-y-2">
          {result.recommended_actions.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span className="text-muted-foreground">{a}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function DynamicRows<T>({
  rows,
  onChange,
  render,
  empty,
  addLabel,
  cols,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  render: (row: T, update: (patch: Partial<T>) => void) => React.ReactNode;
  empty: T;
  addLabel: string;
  cols: string;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className={`grid items-center gap-2 ${cols}`}>
          {render(row, (patch) => {
            const next = [...rows];
            next[i] = { ...row, ...patch };
            onChange(next);
          })}
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-danger/15 hover:text-danger"
            aria-label="Remove row"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button variant="outline" type="button" onClick={() => onChange([...rows, { ...empty }])}>
        <Plus className="h-4 w-4" /> {addLabel}
      </Button>
    </div>
  );
}

function RecordedTable({ onEdit }: { onEdit: (wf: Workflow) => void }) {
  const workflows = useWorkflows();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("All");
  const [view, setView] = useState<Workflow | null>(null);

  const filtered = useMemo(
    () =>
      workflows.filter(
        (w) =>
          (dept === "All" || w.department === dept) &&
          (w.name.toLowerCase().includes(q.toLowerCase()) || w.aiTool.toLowerCase().includes(q.toLowerCase())),
      ),
    [workflows, q, dept],
  );

  if (workflows.length === 0) {
    return (
      <EmptyState
        icon={<Activity className="h-7 w-7" />}
        title="No workflows recorded yet"
        description="Record your first AI workflow to start measuring resilience."
        action={<Button variant="outline" onClick={() => location.reload()}>Refresh</Button>}
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input className={`${inputCls} pl-9`} placeholder="Search workflows or tools..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={`${inputCls} sm:w-48`} value={dept} onChange={(e) => setDept(e.target.value)}>
          <option>All</option>
          {departments.map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>

      <Card hover={false} className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Workflow</th>
              <th className="px-4 py-3 font-semibold">Department</th>
              <th className="px-4 py-3 font-semibold">AI Tool</th>
              <th className="px-4 py-3 font-semibold">Class</th>
              <th className="px-4 py-3 font-semibold">Resilience</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => (
              <tr key={w.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/40">
                <td className="px-4 py-3 font-medium">{w.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{w.department}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{w.aiTool}</td>
                <td className="px-4 py-3 text-muted-foreground">{w.classification}</td>
                <td className="px-4 py-3"><ScoreBadge score={w.resilienceScore} /></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatDistanceToNow(new Date(w.lastUpdated), { addSuffix: true })}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setView(w)} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="View"><Eye className="h-4 w-4" /></button>
                    <button onClick={() => navigate({ to: "/fallback-guides" })} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/15 hover:text-accent" aria-label="Generate guide"><BookOpen className="h-4 w-4" /></button>
                    <button onClick={() => { deleteWorkflow(w.id); toast.success("Workflow deleted."); }} className="rounded-md p-1.5 text-muted-foreground hover:bg-danger/15 hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <AnimatePresence>
        {view && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setView(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-6">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="font-display text-xl font-bold">{view.name}</h3>
                  <p className="text-sm text-muted-foreground">{view.department} · {view.aiTool}</p>
                </div>
                <button onClick={() => setView(null)} className="rounded-md p-1.5 hover:bg-secondary"><X className="h-5 w-5" /></button>
              </div>
              <div className="space-y-4 text-sm">
                <div><span className="text-xs uppercase text-muted-foreground">Task</span><p className="mt-1">{view.taskDescription}</p></div>
                <div><span className="text-xs uppercase text-muted-foreground">Expected output</span><p className="mt-1">{view.expectedOutput}</p></div>
                {view.analysis && <AnalysisPanel result={view.analysis} />}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
