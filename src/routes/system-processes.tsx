import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Code2, Plus, Trash2, Copy, Cpu } from "lucide-react";
import { toast } from "sonner";
import { Card, PageHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/system-processes")({
  head: () => ({
    meta: [
      { title: "System Processes — KeepSake" },
      {
        name: "description",
        content:
          "Document the underlying code and pseudocode behind your organisation's automated system processes.",
      },
    ],
  }),
  component: SystemProcesses,
});

type Process = {
  id: string;
  name: string;
  language: string;
  code: string;
};

const SEED: Process[] = [
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
    name: "Knowledge Decay Monitor",
    language: "pseudocode",
    code: `EVERY 24 HOURS:
    FOR each workflow IN activeWorkflows:
        daysSinceTouch = today - workflow.lastHumanTouch
        IF daysSinceTouch >= 60:
            status = "CRITICAL"
        ELSE IF daysSinceTouch >= 30:
            status = "WARNING"
        ELSE IF daysSinceTouch >= 15:
            status = "AGING"
        ELSE:
            status = "HEALTHY"
        IF status != workflow.lastStatus:
            notifyManager(workflow.owner, status)
            workflow.lastStatus = status`,
  },
  {
    id: "p3",
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

function SystemProcesses() {
  const [processes, setProcesses] = useState<Process[]>(SEED);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("pseudocode");
  const [code, setCode] = useState("");

  function addProcess() {
    if (!name.trim() || !code.trim()) {
      toast.error("Add a process name and some code first.");
      return;
    }
    setProcesses((prev) => [
      { id: crypto.randomUUID(), name: name.trim(), language, code },
      ...prev,
    ]);
    setName("");
    setCode("");
    toast.success("System process added.");
  }

  function removeProcess(id: string) {
    setProcesses((prev) => prev.filter((p) => p.id !== id));
    toast.success("Process removed.");
  }

  function copyCode(c: string) {
    navigator.clipboard.writeText(c);
    toast.success("Code copied to clipboard.");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="System Processes"
        subtitle="Document the code and pseudocode behind each automated process so a human can rebuild or audit it when the AI is offline."
      />

      {/* Add form */}
      <Card hover={false} className="mb-8 p-5">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
          <Plus className="h-5 w-5 text-primary" /> Add a Process
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Process name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Refund Approval Agent"
              className="w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="pseudocode">Pseudocode</option>
              <option value="python">Python</option>
              <option value="typescript">TypeScript</option>
              <option value="sql">SQL</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Code / pseudocode
          </label>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={8}
            placeholder={"PROCESS exampleProcess(input):\n    FOR each item IN input:\n        ..."}
            className="w-full rounded-md border border-border bg-[#0F1117] px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={addProcess}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Add Process
          </button>
        </div>
      </Card>

      {/* List */}
      <div className="space-y-5">
        {processes.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card hover={false} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent ring-1 ring-accent/30">
                    <Cpu className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="font-display font-bold leading-none">{p.name}</div>
                    <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      {p.language}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    aria-label="Copy code"
                    onClick={() => copyCode(p.code)}
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="Delete process"
                    onClick={() => removeProcess(p.id)}
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <pre className="overflow-x-auto bg-[#0F1117] px-5 py-4 font-mono text-[13px] leading-relaxed text-foreground/90">
                <code>{p.code}</code>
              </pre>
            </Card>
          </motion.div>
        ))}
        {processes.length === 0 && (
          <Card hover={false} className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Code2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No system processes documented yet. Add one above.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
