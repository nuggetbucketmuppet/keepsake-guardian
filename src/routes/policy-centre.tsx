import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Plus,
  Trash2,
  Search,
  Globe,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Card, PageHeader, Button, AiLoading, EmptyState } from "@/components/ui-kit";
import {
  usePolicies,
  savePolicy,
  deletePolicy,
  useEvaluations,
  saveEvaluation,
  useWorkflows,
  uid,
} from "@/lib/store";
import { scrapePolicies, summarisePolicy, evaluateCompliance } from "@/lib/claude";
import type { ComplianceStatus, Policy, ComplianceEvaluation } from "@/lib/types";

export const Route = createFileRoute("/policy-centre")({
  head: () => ({
    meta: [
      { title: "Policy Centre — KeepSake" },
      {
        name: "description",
        content:
          "Upload or scrape compliance policies and evaluate your AI workflows against them with AI-powered audits.",
      },
    ],
  }),
  component: PolicyCentre,
});

const STATUS_META: Record<ComplianceStatus, { color: string; bg: string; ring: string; icon: typeof CheckCircle2; label: string }> = {
  compliant: { color: "text-success", bg: "bg-success/15", ring: "ring-success/40", icon: CheckCircle2, label: "Compliant" },
  partial: { color: "text-warning", bg: "bg-warning/15", ring: "ring-warning/40", icon: AlertTriangle, label: "Partial" },
  "non-compliant": { color: "text-danger", bg: "bg-danger/15", ring: "ring-danger/40", icon: XCircle, label: "Non-compliant" },
};

function StatusBadge({ status }: { status: ComplianceStatus }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ${m.bg} ${m.color} ${m.ring}`}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

function PolicyCentre() {
  const policies = usePolicies();
  const evaluations = useEvaluations();
  const workflows = useWorkflows();

  const [tab, setTab] = useState<"policies" | "evaluate">("policies");

  // Add-policy state
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [policyVersion, setPolicyVersion] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);

  // Scrape state
  const [query, setQuery] = useState("");
  const [scraping, setScraping] = useState(false);
  const [results, setResults] = useState<{ title: string; url: string; text: string }[]>([]);

  // Evaluate state
  const [policyId, setPolicyId] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [evalProgress, setEvalProgress] = useState<string | null>(null);
  const [detail, setDetail] = useState<(typeof evaluations)[number] | null>(null);

  function onPolicyFile(file: File) {
    setFileName(file.name);
    if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
    const reader = new FileReader();
    reader.onload = () => setContent(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function handleAddPolicy() {
    if (!name.trim() || !content.trim()) {
      toast.error("Add a policy name and content (or upload a file) first.");
      return;
    }
    setSaving(true);
    try {
      let summary = "";
      try {
        summary = await summarisePolicy(content);
      } catch {
        /* summary is best-effort */
      }
      savePolicy({
        id: uid(),
        name: name.trim(),
        category: category.trim() || "General",
        source: "upload",
        content: content.trim(),
        summary,
        addedDate: new Date().toISOString(),
        fileName: fileName || undefined,
        policyVersion: policyVersion.trim() || undefined,
        effectiveDate: effectiveDate || undefined,
        validUntil: validUntil || undefined,
      });
      setName("");
      setCategory("");
      setContent("");
      setPolicyVersion("");
      setEffectiveDate("");
      setValidUntil("");
      setFileName("");
      toast.success("Policy added.");
    } finally {
      setSaving(false);
    }
  }

  async function handleScrape() {
    if (!query.trim()) {
      toast.error("Enter what policy to search for.");
      return;
    }
    setScraping(true);
    setResults([]);
    try {
      const res = await scrapePolicies(query.trim());
      setResults(res);
      if (res.length === 0) toast.info("No results found. Try a different search.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setScraping(false);
    }
  }

  function importScraped(r: { title: string; url: string; text: string }) {
    savePolicy({
      id: uid(),
      name: r.title,
      category: "Scraped",
      source: "scrape",
      url: r.url,
      content: r.text,
      addedDate: new Date().toISOString(),
    });
    toast.success("Policy imported.");
  }

  async function evaluateOne(policy: Policy, workflow: (typeof workflows)[number]) {
    const result = await evaluateCompliance(policy, workflow);
    saveEvaluation({
      id: uid(),
      workflowId: workflow.id,
      workflowName: workflow.name,
      policyId: policy.id,
      policyName: policy.name,
      evaluatedDate: new Date().toISOString(),
      ...result,
    });
  }

  async function handleEvaluate() {
    const policy = policies.find((p) => p.id === policyId);
    const workflow = workflows.find((w) => w.id === workflowId);
    if (!policy || !workflow) {
      toast.error("Pick a policy and a workflow.");
      return;
    }
    setEvaluating(true);
    try {
      await evaluateOne(policy, workflow);
      toast.success("Evaluation complete.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Evaluation failed.");
    } finally {
      setEvaluating(false);
    }
  }

  async function handleEvaluateAll() {
    const policy = policies.find((p) => p.id === policyId);
    if (!policy) {
      toast.error("Pick a policy to evaluate every workflow against.");
      return;
    }
    if (workflows.length === 0) {
      toast.error("No workflows to evaluate.");
      return;
    }
    setEvaluating(true);
    let ok = 0;
    try {
      for (let i = 0; i < workflows.length; i++) {
        setEvalProgress(`Evaluating ${i + 1} of ${workflows.length}: ${workflows[i].name}`);
        try {
          await evaluateOne(policy, workflows[i]);
          ok++;
        } catch {
          /* skip failures, continue */
        }
      }
      toast.success(`Evaluated ${ok} of ${workflows.length} workflows.`);
    } finally {
      setEvaluating(false);
      setEvalProgress(null);
    }
  }

  function exportEvaluations() {
    const blob = new Blob([JSON.stringify(evaluations, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "keepsake-compliance-evaluations.json";
    a.click();
    URL.revokeObjectURL(url);
  }


  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Policy Centre"
        subtitle="Upload or scrape compliance policies, then evaluate any workflow against them with an AI audit."
      />

      {/* Tabs */}
      <div className="mb-6 inline-flex rounded-lg border border-border bg-card p-1">
        {(["policies", "evaluate"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "policies" ? "Policies" : "Evaluate Compliance"}
          </button>
        ))}
      </div>

      {tab === "policies" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Add + scrape */}
          <div className="space-y-6">
            <Card hover={false} className="p-5">
              <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
                <Plus className="h-5 w-5 text-primary" /> Add a Policy
              </h2>
              <div className="space-y-3">
                {/* Direct file upload */}
                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onPolicyFile(f); }}
                  className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/30 py-6 text-center transition-colors hover:border-primary"
                >
                  <FileText className="mb-1.5 h-5 w-5 text-muted-foreground" />
                  <span className="text-sm">{fileName || "Drag & drop or click to upload a policy file"}</span>
                  <span className="text-xs text-muted-foreground">.txt .md .json .csv</span>
                  <input type="file" accept=".txt,.md,.json,.csv,text/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPolicyFile(f); }} />
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Policy name (e.g. GDPR Data Handling)"
                  className="w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Category (e.g. Data Privacy)"
                  className="w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Version</label>
                    <input value={policyVersion} onChange={(e) => setPolicyVersion(e.target.value)} placeholder="e.g. v2.1" className="w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Effective date</label>
                    <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Valid until</label>
                    <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={6}
                  placeholder="…or paste the policy text here"
                  className="w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex justify-end">
                  <Button onClick={handleAddPolicy} disabled={saving}>
                    {saving ? "Saving…" : "Add Policy"}
                  </Button>
                </div>
              </div>
            </Card>


            <Card hover={false} className="p-5">
              <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
                <Globe className="h-5 w-5 text-accent" /> Scrape from the Web
              </h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Find published policies and standards online via Exa, then import them.
              </p>
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScrape()}
                  placeholder="e.g. NIST AI risk management framework"
                  className="w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
                <Button variant="accent" onClick={handleScrape} disabled={scraping}>
                  <Search className="h-4 w-4" /> {scraping ? "…" : "Search"}
                </Button>
              </div>
              {scraping && <p className="mt-4 text-sm text-accent">Searching the web…</p>}
              {results.length > 0 && (
                <div className="mt-4 space-y-3">
                  {results.map((r) => (
                    <div key={r.url} className="rounded-md border border-border bg-secondary/40 p-3">
                      <div className="font-semibold text-sm">{r.title}</div>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-xs text-accent hover:underline"
                      >
                        {r.url}
                      </a>
                      <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{r.text}</p>
                      <div className="mt-2 flex justify-end">
                        <Button variant="outline" className="!px-3 !py-1 text-xs" onClick={() => importScraped(r)}>
                          <Plus className="h-3.5 w-3.5" /> Import
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Policy list */}
          <div className="space-y-4">
            <h2 className="font-display text-lg font-bold">Your Policies ({policies.length})</h2>
            {policies.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="h-7 w-7" />}
                title="No policies yet"
                description="Add a policy or scrape one from the web to start evaluating compliance."
              />
            ) : (
              policies.map((p, i) => <PolicyRow key={p.id} policy={p} index={i} />)
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <Card hover={false} className="p-5">
            <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
              <Sparkles className="h-5 w-5 text-primary" /> Run a Compliance Check
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Policy</label>
                <select
                  value={policyId}
                  onChange={(e) => setPolicyId(e.target.value)}
                  className="w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select a policy…</option>
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Workflow</label>
                <select
                  value={workflowId}
                  onChange={(e) => setWorkflowId(e.target.value)}
                  className="w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select a workflow…</option>
                  {workflows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={handleEvaluateAll} disabled={evaluating}>
                <Sparkles className="h-4 w-4" /> Evaluate All Workflows
              </Button>
              <Button onClick={handleEvaluate} disabled={evaluating}>
                <Sparkles className="h-4 w-4" /> {evaluating ? "Evaluating…" : "Evaluate"}
              </Button>
            </div>
          </Card>

          {evaluating && <AiLoading message={evalProgress ?? "Auditing workflow against policy…"} />}

          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Evaluations ({evaluations.length})</h2>
            {evaluations.length > 0 && (
              <Button variant="outline" className="!px-3 !py-1.5 text-xs" onClick={exportEvaluations}>
                <Download className="h-3.5 w-3.5" /> Export JSON
              </Button>
            )}
          </div>

          {evaluations.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-7 w-7" />}
              title="No evaluations yet"
              description="Pick a policy and a workflow above to run your first AI compliance audit."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {evaluations.map((e, i) => (
                <motion.button
                  key={e.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => setDetail(e)}
                  className="text-left"
                >
                  <Card hover className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-display font-bold">{e.workflowName}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          vs {e.policyName} · {format(new Date(e.evaluatedDate), "d MMM yyyy")}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-display text-xl font-bold">{e.compliance_score}</span>
                        <StatusBadge status={e.overall_status} />
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{e.summary}</p>
                    <p className="mt-2 text-[11px] font-semibold text-accent">View details →</p>
                  </Card>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      )}

      {detail && <EvaluationModal evaluation={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function EvaluationModal({ evaluation: e, onClose }: { evaluation: ComplianceEvaluation; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(ev) => ev.stopPropagation()} className="max-h-[85vh] w-full max-w-2xl overflow-y-auto">
        <Card hover={false} className="p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="font-display text-xl font-bold">{e.workflowName}</div>
              <div className="text-xs text-muted-foreground">
                vs {e.policyName} · {format(new Date(e.evaluatedDate), "d MMM yyyy")}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-display text-3xl font-bold">{e.compliance_score}</span>
              <StatusBadge status={e.overall_status} />
              <button onClick={onClose} className="rounded-md p-1.5 hover:bg-secondary"><XCircle className="h-5 w-5" /></button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{e.summary}</p>
          {e.findings.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Findings</div>
              {e.findings.map((f, idx) => (
                <div key={idx} className="rounded-md border border-border bg-secondary/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{f.requirement}</span>
                    <StatusBadge status={f.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
                </div>
              ))}
            </div>
          )}
          {e.recommendations.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommendations</div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
                {e.recommendations.map((r, idx) => <li key={idx}>{r}</li>)}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}


function PolicyRow({ policy, index }: { policy: Policy; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
      <Card hover={false} className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold">{policy.name}</span>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {policy.category}
              </span>
            </div>
            {policy.summary && <p className="mt-1.5 text-sm text-muted-foreground">{policy.summary}</p>}
            {policy.url && (
              <a href={policy.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-accent hover:underline">
                {policy.url}
              </a>
            )}
          </div>
          <button
            aria-label="Delete policy"
            onClick={() => {
              deletePolicy(policy.id);
              toast.success("Policy removed.");
            }}
            className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </Card>
    </motion.div>
  );
}
