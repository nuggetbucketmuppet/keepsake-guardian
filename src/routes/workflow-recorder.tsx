import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Code2, Upload, Plus, ChevronDown, Trash2, Copy, Cpu,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, Button } from "@/components/ui-kit";
import { WorkflowForm } from "@/components/WorkflowForm";
import { uid } from "@/lib/store";

export const Route = createFileRoute("/workflow-recorder")({
  head: () => ({ meta: [{ title: "Upload a Workflow — KeepSake" }] }),
  component: WorkflowUpload,
});

function WorkflowUpload() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Upload a Workflow"
        subtitle="Map every tool your business depends on — AI or not. Each platform, service, and person becomes a node in your dependency map."
      />
      <WorkflowForm onSaved={() => navigate({ to: "/dependency-map" })} />
      <SystemProcessLibrary />
      <style>{`.inp{width:100%;border-radius:0.375rem;border:1px solid hsl(var(--input,222 13% 25%));background:rgba(30,33,42,0.4);padding:0.5rem 0.75rem;font-size:0.875rem;}.inp:focus-visible{outline:none;box-shadow:0 0 0 1px hsl(var(--ring,250 90% 66%));}`}</style>
    </div>
  );
}



// ============= System Process Library =============
type Process = { id: string; name: string; language: string; code: string };

const PROCESS_STORE_KEY = "keepsake.systemProcesses";

const SEED_PROCESSES: Process[] = [
  {
    id: "p1",
    name: "Invoice Reconciliation Agent",
    language: "pseudocode",
    code: `PROCESS reconcileInvoices(batch):
    FOR each invoice IN batch:
        record = lookupPurchaseOrder(invoice.poNumber)
        IF record IS NULL:
            flagForHumanReview(invoice, reason = "Missing PO")
            CONTINUE
        IF abs(invoice.total - record.total) > TOLERANCE:
            flagForHumanReview(invoice, reason = "Amount mismatch")
        ELSE:
            markAsApproved(invoice)
            logAction("approved", invoice.id)
    RETURN summary(batch)`,
  },
  {
    id: "p2",
    name: "Failure Drill Trigger",
    language: "pseudocode",
    code: `FUNCTION runFailureDrill(agent, affectedWorkflows):
        disable(agent)
        tasks = generateHumanFallbackTasks(affectedWorkflows)
        startTimer()
        WHILE tasks NOT all complete AND timer < limit:
            awaitTeamInput(tasks)
        score = evaluateReadiness(tasks, timer)
        re-enable(agent)
        RETURN debrief(score, tasks)`,
  },
];

function SystemProcessLibrary() {
  const [processes, setProcesses] = useState<Process[]>(SEED_PROCESSES);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("pseudocode");
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROCESS_STORE_KEY);
      if (raw) setProcesses(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const persist = (next: Process[]) => {
    setProcesses(next);
    try { localStorage.setItem(PROCESS_STORE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setCode(String(reader.result ?? ""));
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
    };
    reader.readAsText(file);
  };

  const addProcess = () => {
    if (!name.trim() || !code.trim()) {
      toast.error("Add a process name and some code first.");
      return;
    }
    persist([{ id: uid(), name: name.trim(), language, code }, ...processes]);
    setName("");
    setCode("");
    toast.success("System process added.");
  };

  const removeProcess = (id: string) => {
    persist(processes.filter((p) => p.id !== id));
    toast.success("Process removed.");
  };

  const copyCode = (c: string) => {
    navigator.clipboard.writeText(c);
    toast.success("Code copied to clipboard.");
  };

  return (
    <Card hover={false} className="mt-8 overflow-hidden p-5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent ring-1 ring-accent/30">
            <Cpu className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-sm font-bold">System Process Code & Pseudocode</h3>
            <p className="text-xs text-muted-foreground">Document the logic behind each automated process so a human can rebuild or audit it.</p>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-5 space-y-5">
          <div className="rounded-lg border border-border bg-secondary/20 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Process name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Refund Approval Agent" className="inp" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Language</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="inp">
                  <option value="pseudocode">Pseudocode</option>
                  <option value="python">Python</option>
                  <option value="typescript">TypeScript</option>
                  <option value="sql">SQL</option>
                </select>
              </div>
            </div>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
              className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/30 py-6 text-center transition-colors hover:border-primary"
            >
              <Upload className="mb-1.5 h-5 w-5 text-muted-foreground" />
              <p className="text-sm">Drag & drop or click to upload a file</p>
              <p className="text-xs text-muted-foreground">.py .js .ts .json .yaml .yml .txt .md</p>
              <input ref={fileRef} type="file" accept=".py,.js,.ts,.json,.yaml,.yml,.txt,.md" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            </div>
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Code / pseudocode</label>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={8}
                placeholder={"PROCESS exampleProcess(input):\n    FOR each item IN input:\n        ..."}
                className="w-full rounded-md border border-input bg-[#0d0f15] px-3 py-2 font-mono text-xs text-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={addProcess}><Plus className="h-4 w-4" /> Add Process</Button>
            </div>
          </div>

          <div className="space-y-4">
            {processes.map((p) => (
              <Card key={p.id} hover={false} className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent ring-1 ring-accent/30">
                      <Cpu className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <div className="font-display text-sm font-bold leading-none">{p.name}</div>
                      <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{p.language}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button aria-label="Copy code" onClick={() => copyCode(p.code)} className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                      <Copy className="h-4 w-4" />
                    </button>
                    <button aria-label="Delete process" onClick={() => removeProcess(p.id)} className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-danger">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <pre className="overflow-x-auto bg-[#0F1117] px-4 py-3 font-mono text-xs leading-relaxed text-foreground/90"><code>{p.code}</code></pre>
              </Card>
            ))}
            {processes.length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-secondary/20 px-6 py-10 text-center">
                <Code2 className="h-7 w-7 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No system processes documented yet. Add one above.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
