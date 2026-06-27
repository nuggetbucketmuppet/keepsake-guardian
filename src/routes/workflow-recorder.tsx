import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  FileText, Code2, Workflow as WorkflowIcon, Upload, X, Plus, ChevronDown, Info, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, Button, AiLoading, ErrorCard } from "@/components/ui-kit";
import { parseIntake } from "@/lib/claude";
import { mergeIntoGraph, NODE_LABELS } from "@/lib/graph";
import { saveWorkflow, uid } from "@/lib/store";
import type {
  Department, Frequency, Classification, NodeType, Workflow,
} from "@/lib/types";

export const Route = createFileRoute("/workflow-recorder")({
  head: () => ({ meta: [{ title: "Upload a Workflow — KeepSake" }] }),
  component: WorkflowUpload,
});

type Mode = "text" | "code" | "workato";
const DEPARTMENTS: Department[] = ["Finance", "Procurement", "HR", "IT", "Customer Success", "Operations", "Legal", "Marketing", "Others"];
const FREQUENCIES: Frequency[] = ["Real-time", "Daily", "Weekly", "Monthly", "Ad-hoc"];
const CLASSIFICATIONS: Classification[] = ["Public", "Internal", "Confidential", "Restricted"];
const TAG_TYPES: NodeType[] = ["ai", "saas", "internal", "human", "external"];

interface Tag { name: string; type: NodeType }

function WorkflowUpload() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("text");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [showHint, setShowHint] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // shared lower fields
  const [name, setName] = useState("");
  const [department, setDepartment] = useState<Department>("Operations");
  const [frequency, setFrequency] = useState<Frequency>("Daily");
  const [classification, setClassification] = useState<Classification>("Internal");
  const [aiPowered, setAiPowered] = useState<"Yes" | "Partially" | "No">("Partially");
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagType, setTagType] = useState<NodeType>("saas");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workatoConnected =
    typeof window !== "undefined" && localStorage.getItem("keepsake.workato.connected") === "true";

  const addTag = () => {
    const v = tagInput.trim();
    if (!v) return;
    if (tags.some((t) => t.name.toLowerCase() === v.toLowerCase())) {
      setTagInput("");
      return;
    }
    setTags([...tags, { name: v, type: tagType }]);
    setTagInput("");
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setCode(String(reader.result ?? ""));
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
    };
    reader.readAsText(file);
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Give your workflow a name first.");
      return;
    }
    const content = mode === "code" ? code : description;
    if (!content.trim() && tags.length === 0) {
      toast.error("Describe the workflow or add at least one platform tag.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        name,
        department,
        frequency,
        classification,
        aiPowered,
        inputMode: mode,
        description: content,
        platforms: tags,
      };
      const intake = await parseIntake(payload);

      // ensure user-supplied tags are represented as nodes too
      const tagNodes = tags.map((t) => ({ name: t.name, type: t.type }));
      const allNodes = [...intake.nodes, ...tagNodes];

      const wfId = uid();
      mergeIntoGraph(allNodes, intake.edges, {
        department,
        workflowId: wfId,
        riskLevel: intake.resilience_score < 50 ? "high" : intake.resilience_score < 80 ? "medium" : "low",
      });

      const wf: Workflow = {
        id: wfId,
        name,
        department,
        aiTool: tags.filter((t) => t.type === "ai").map((t) => t.name).join(", ") || "—",
        frequency,
        classification,
        taskDescription: content,
        expectedOutput: "",
        systems: [],
        decisions: [],
        data: [],
        approvalsSkipped: false,
        resilienceScore: intake.resilience_score,
        analysis: {
          risk_flags: intake.risk_flags,
          resilience_score: intake.resilience_score,
          resilience_reasoning: intake.risk_summary,
          recommended_actions: [],
        },
        lastUpdated: new Date().toISOString(),
        lastEdited: new Date().toISOString(),
        lastHumanTouch: new Date().toISOString(),
        code: mode === "code" ? code : undefined,
      };
      saveWorkflow(wf);
      toast.success(`"${name}" mapped — ${intake.nodes.length} nodes added to the dependency map.`);
      navigate({ to: "/dependency-map" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to analyse workflow.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Upload a Workflow"
        subtitle="Map every tool your business depends on — AI or not. Each platform, service, and person becomes a node in your dependency map."
      />

      {/* Mode switcher */}
      <div className="mb-6 inline-flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        <PillButton active={mode === "text"} onClick={() => setMode("text")} icon={<FileText className="h-4 w-4" />}>Plain Text</PillButton>
        <PillButton active={mode === "code"} onClick={() => setMode("code")} icon={<Code2 className="h-4 w-4" />}>Code / Pseudocode</PillButton>
        {workatoConnected && (
          <PillButton active={mode === "workato"} onClick={() => setMode("workato")} icon={<WorkflowIcon className="h-4 w-4" />}>Import from Workato</PillButton>
        )}
      </div>

      <div className="space-y-5">
        {mode === "text" && (
          <Card hover={false} className="overflow-hidden p-5">
            <label className="mb-2 block text-sm font-semibold">Describe your workflow in plain language. Include every tool, system, person, or step involved — AI or not.</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="e.g. When a customer submits an order on Shopify, it triggers an email via Mailchimp, updates our inventory in Google Sheets, and a staff member manually checks stock every morning before dispatch."
              className="w-full rounded-md border border-input bg-secondary/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="mt-2 text-xs text-muted-foreground">You can also paste a description generated by Zo Computer or any AI assistant.</p>
            <button onClick={() => setShowHint((s) => !s)} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-accent">
              <Info className="h-3.5 w-3.5" /> What to include
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showHint ? "rotate-180" : ""}`} />
            </button>
            {showHint && (
              <ul className="mt-2 space-y-1 rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
                <li>· Platforms and tools used</li>
                <li>· Who triggers the workflow</li>
                <li>· What decisions are made</li>
                <li>· What data moves between systems</li>
                <li>· Which steps are manual vs automated</li>
                <li>· What happens if a step fails</li>
              </ul>
            )}
          </Card>
        )}

        {mode === "code" && (
          <Card hover={false} className="overflow-hidden p-5">
            <label className="mb-2 block text-sm font-semibold">Upload automation code or pseudocode — sensitive logic stays local and is never stored externally.</label>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
              className="mb-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/30 py-8 text-center transition-colors hover:border-primary"
            >
              <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm">Drag & drop or click to upload</p>
              <p className="text-xs text-muted-foreground">.py .js .ts .json .yaml .yml .txt .md</p>
              <input ref={fileRef} type="file" accept=".py,.js,.ts,.json,.yaml,.yml,.txt,.md" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              rows={8}
              placeholder="…or paste pseudocode here"
              className="w-full rounded-md border border-input bg-[#0d0f15] px-3 py-2 font-mono text-xs text-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </Card>
        )}

        {mode === "workato" && (
          <Card hover={false} className="overflow-hidden p-5 text-sm text-muted-foreground">
            Workato is connected — recipe import will appear here.
          </Card>
        )}

        {/* Shared lower fields */}
        <Card hover={false} className="overflow-hidden p-5">
          <h3 className="mb-4 font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Workflow details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Workflow Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className="inp" placeholder="e.g. Order-to-Dispatch" />
            </Field>
            <Field label="Department">
              <select value={department} onChange={(e) => setDepartment(e.target.value as Department)} className="inp">
                {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Frequency">
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className="inp">
                {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Data Classification">
              <select value={classification} onChange={(e) => setClassification(e.target.value as Classification)} className="inp">
                {CLASSIFICATIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Is any step AI-powered?</label>
            <div className="inline-flex gap-1 rounded-md border border-border bg-secondary/40 p-1">
              {(["Yes", "Partially", "No"] as const).map((v) => (
                <button key={v} onClick={() => setAiPowered(v)} className={`shrink-0 rounded px-3 py-1 text-xs font-semibold ${aiPowered === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{v}</button>
              ))}
            </div>
          </div>

          {/* Platform tags */}
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Platforms / Services involved — each becomes a node</label>
            <div className="flex flex-wrap gap-2">
              <select value={tagType} onChange={(e) => setTagType(e.target.value as NodeType)} className="inp w-auto shrink-0">
                {TAG_TYPES.map((t) => <option key={t} value={t}>{NODE_LABELS[t]}</option>)}
              </select>
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="e.g. Shopify"
                className="inp min-w-[140px] flex-1"
              />
              <Button variant="outline" className="shrink-0" onClick={addTag}><Plus className="h-4 w-4" /> Add</Button>
            </div>
            {tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-xs">
                    <span className="font-semibold">{t.name}</span>
                    <span className="text-[10px] text-muted-foreground">{NODE_LABELS[t.type]}</span>
                    <button onClick={() => setTags(tags.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

        {error && <ErrorCard message={error} onRetry={submit} />}
        {loading ? (
          <AiLoading message="Parsing your workflow and building the dependency map…" />
        ) : (
          <motion.div whileHover={{ scale: 1.01 }}>
            <Button className="w-full" onClick={submit}><Sparkles className="h-4 w-4" /> Map this workflow</Button>
          </motion.div>
        )}
      </div>

      <style>{`.inp{width:100%;border-radius:0.375rem;border:1px solid hsl(var(--input,222 13% 25%));background:rgba(30,33,42,0.4);padding:0.5rem 0.75rem;font-size:0.875rem;}.inp:focus-visible{outline:none;box-shadow:0 0 0 1px hsl(var(--ring,250 90% 66%));}`}</style>
    </div>
  );
}

function PillButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
      {icon}{children}
    </button>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
