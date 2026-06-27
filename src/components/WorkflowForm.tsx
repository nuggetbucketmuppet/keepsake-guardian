import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  FileText, Code2, Workflow as WorkflowIcon, Upload, X, Plus, ChevronDown, Info, Sparkles, Paperclip, Loader2, Search, Wand2, Check,
} from "lucide-react";
import { toast } from "sonner";
import { Card, Button, AiLoading, ErrorCard } from "@/components/ui-kit";
import { parseIntake, detectPlatforms, parseFile, examineWorkflow, autofillWorkflow } from "@/lib/claude";
import type { NodeMatchSuggestion } from "@/lib/claude";
import { mergeIntoGraph, NODE_LABELS, useGraph } from "@/lib/graph";
import { saveWorkflow, updateWorkflow, uid } from "@/lib/store";
import type { Department, Frequency, Classification, NodeType, Workflow } from "@/lib/types";

type Mode = "text" | "code" | "workato";
const DEPARTMENTS: Department[] = ["Finance", "Procurement", "HR", "IT", "Customer Success", "Operations", "Legal", "Marketing", "Others"];
const FREQUENCIES: Frequency[] = ["Real-time", "Daily", "Weekly", "Monthly", "Ad-hoc"];
const CLASSIFICATIONS: Classification[] = ["Public", "Internal", "Confidential", "Restricted"];
const TAG_TYPES: NodeType[] = ["ai", "platform", "human"];

interface Tag { name: string; type: NodeType }

export function WorkflowForm({
  existing,
  onSaved,
  submitLabel,
}: {
  existing?: Workflow;
  onSaved?: (wf: Workflow) => void;
  submitLabel?: string;
}) {
  const isEdit = !!existing;
  const [mode, setMode] = useState<Mode>(existing?.code ? "code" : "text");
  const [description, setDescription] = useState(existing && !existing.code ? existing.taskDescription : "");
  const [code, setCode] = useState(existing?.code ?? "");
  const [showHint, setShowHint] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(existing?.name ?? "");
  const [department, setDepartment] = useState<Department>(existing?.department ?? "Operations");
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? "Daily");
  const [classification, setClassification] = useState<Classification>(existing?.classification ?? "Internal");
  const [aiPowered, setAiPowered] = useState<"Yes" | "Partially" | "No">("Partially");
  const [tags, setTags] = useState<Tag[]>(
    existing?.aiTool && existing.aiTool !== "—"
      ? existing.aiTool.split(", ").filter(Boolean).map((n) => ({ name: n, type: "ai" as NodeType }))
      : [],
  );
  const [tagInput, setTagInput] = useState("");
  const [tagType, setTagType] = useState<NodeType>("platform");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsingFile, setParsingFile] = useState(false);

  const graph = useGraph();
  const [detecting, setDetecting] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  // Examine / autofill
  const [examining, setExamining] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const [nodeMatches, setNodeMatches] = useState<NodeMatchSuggestion[]>([]);
  // per-match decision: "yes" reuses existing node, "no" creates a new node (with optional rename)
  const [matchDecision, setMatchDecision] = useState<Record<number, "yes" | "no">>({});
  const [matchNewName, setMatchNewName] = useState<Record<number, string>>({});

  const addTagSilently = (name: string, type: NodeType) => {
    setTags((prev) => prev.some((t) => t.name.toLowerCase() === name.toLowerCase()) ? prev : [...prev, { name, type }]);
  };

  const runExamine = async () => {
    const content = mode === "code" ? code : description;
    if (!content.trim()) {
      toast.error("Add a description or code first so we can examine it.");
      return;
    }
    setExamining(true);
    try {
      const existingNodeNames = graph.nodes.map((n) => n.name);
      const res = await examineWorkflow({ description: content, existingNodeNames });
      setQuestions(res.questions);
      setAnswers({});
      setNodeMatches(res.nodeMatches);
      setMatchDecision({});
      setMatchNewName({});
      toast.success(`Examined — ${res.questions.length} question(s), ${res.nodeMatches.length} possible shared node(s).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Examine failed.");
    } finally {
      setExamining(false);
    }
  };

  const decideMatch = (i: number, decision: "yes" | "no", m: NodeMatchSuggestion) => {
    setMatchDecision((d) => ({ ...d, [i]: decision }));
    if (decision === "yes") addTagSilently(m.existingNodeName, m.type);
  };

  const runAutofill = async () => {
    const content = mode === "code" ? code : description;
    if (!content.trim()) {
      toast.error("Add a description or code first so we can autofill the details.");
      return;
    }
    setAutofilling(true);
    try {
      const res = await autofillWorkflow(content);
      if (res.name && !name) setName(res.name);
      if (DEPARTMENTS.includes(res.department as Department)) setDepartment(res.department as Department);
      if (FREQUENCIES.includes(res.frequency as Frequency)) setFrequency(res.frequency as Frequency);
      if (CLASSIFICATIONS.includes(res.classification as Classification)) setClassification(res.classification as Classification);
      if (["Yes", "Partially", "No"].includes(res.aiPowered)) setAiPowered(res.aiPowered);
      for (const p of res.platforms) addTagSilently(p.name, p.type);
      toast.success("Workflow details autofilled — review before saving.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Autofill failed.");
    } finally {
      setAutofilling(false);
    }
  };

  const runDetection = async () => {
    const content = mode === "code" ? code : description;
    if (!content.trim()) {
      toast.error("Add a description or code first so we can detect platforms.");
      return;
    }
    setDetecting(true);
    try {
      const existingNodeNames = graph.nodes.map((n) => n.name);
      const res = await detectPlatforms({ description: content, existingNodeNames });
      setTags((prev) => {
        const next = [...prev];
        for (const p of res.platforms) {
          if (!next.some((t) => t.name.toLowerCase() === p.name.toLowerCase())) {
            next.push({ name: p.name, type: p.type });
          }
        }
        return next;
      });
      setQuestions(res.questions);
      setAnswers({});
      toast.success(`Detected ${res.platforms.length} node(s). Answer the questions below to refine.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Detection failed.");
    } finally {
      setDetecting(false);
    }
  };


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

  const onCodeFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setCode(String(reader.result ?? ""));
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
    };
    reader.readAsText(file);
  };

  // Parse PDF / image / JSON / text files via AI and append extracted text.
  const onAttach = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setParsingFile(true);
    try {
      for (const file of Array.from(files)) {
        toast.message(`Parsing ${file.name}…`);
        const text = await parseFile(file);
        if (text.trim()) {
          if (mode === "code") {
            setCode((c) => (c ? `${c}\n\n# from ${file.name}\n${text}` : text));
          } else {
            setDescription((d) => (d ? `${d}\n\n--- from ${file.name} ---\n${text}` : text));
          }
          if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
          toast.success(`${file.name} parsed and added.`);
        } else {
          toast.error(`No content extracted from ${file.name}.`);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file.");
    } finally {
      setParsingFile(false);
      if (attachRef.current) attachRef.current.value = "";
    }
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Give your workflow a name first.");
      return;
    }
    const baseContent = mode === "code" ? code : description;
    const clarifications = questions
      .map((q, i) => (answers[i]?.trim() ? `Q: ${q}\nA: ${answers[i].trim()}` : null))
      .filter(Boolean)
      .join("\n");
    // Shared-node confirmations from the Examine step.
    const matchNotes = nodeMatches
      .map((m, i) => {
        const d = matchDecision[i];
        if (d === "yes") return `"${m.detectedName}" is the same as existing node "${m.existingNodeName}".`;
        if (d === "no") {
          const nn = matchNewName[i]?.trim();
          return `"${m.detectedName}" is a NEW node${nn ? ` named "${nn}"` : ""}, distinct from "${m.existingNodeName}".`;
        }
        return null;
      })
      .filter(Boolean)
      .join("\n");
    // Add explicitly-named new nodes as tags so they enter the graph.
    nodeMatches.forEach((m, i) => {
      if (matchDecision[i] === "no") {
        const nn = matchNewName[i]?.trim();
        if (nn && !tags.some((t) => t.name.toLowerCase() === nn.toLowerCase())) tags.push({ name: nn, type: m.type });
      }
    });
    let content = clarifications ? `${baseContent}\n\nCLARIFICATIONS:\n${clarifications}` : baseContent;
    if (matchNotes) content = `${content}\n\nSHARED NODE NOTES:\n${matchNotes}`;
    if (!content.trim() && tags.length === 0) {
      toast.error("Describe the workflow or add at least one platform tag.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        name, department, frequency, classification, aiPowered,
        inputMode: mode, description: content, platforms: tags,
      };
      const intake = await parseIntake(payload);

      const tagNodes = tags.map((t) => ({ name: t.name, type: t.type }));
      const allNodes = [...intake.nodes, ...tagNodes];

      const wfId = existing?.id ?? uid();
      mergeIntoGraph(allNodes, intake.edges, {
        department,
        workflowId: wfId,
        riskLevel: intake.resilience_score < 50 ? "high" : intake.resilience_score < 80 ? "medium" : "low",
      });

      const wf: Workflow = {
        ...(existing ?? {}),
        id: wfId,
        name,
        department,
        aiTool: tags.filter((t) => t.type === "ai").map((t) => t.name).join(", ") || "—",
        frequency,
        classification,
        taskDescription: content,
        expectedOutput: existing?.expectedOutput ?? "",
        systems: existing?.systems ?? [],
        decisions: existing?.decisions ?? [],
        data: existing?.data ?? [],
        approvalsSkipped: existing?.approvalsSkipped ?? false,
        resilienceScore: intake.resilience_score,
        analysis: {
          risk_flags: intake.risk_flags,
          resilience_score: intake.resilience_score,
          resilience_reasoning: intake.risk_summary,
          recommended_actions: [],
        },
        lastUpdated: new Date().toISOString(),
        lastEdited: new Date().toISOString(),
        lastHumanTouch: existing?.lastHumanTouch ?? new Date().toISOString(),
        code: mode === "code" ? code : existing?.code,
      };
      if (isEdit) updateWorkflow(wfId, wf);
      else saveWorkflow(wf);
      toast.success(
        isEdit
          ? `"${name}" updated.`
          : `"${name}" mapped — ${intake.nodes.length} nodes added to the dependency map.`,
      );
      onSaved?.(wf);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to analyse workflow.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Mode switcher */}
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        <PillButton active={mode === "text"} onClick={() => setMode("text")} icon={<FileText className="h-4 w-4" />}>Plain Text</PillButton>
        <PillButton active={mode === "code"} onClick={() => setMode("code")} icon={<Code2 className="h-4 w-4" />}>Code / Pseudocode</PillButton>
        {workatoConnected && (
          <PillButton active={mode === "workato"} onClick={() => setMode("workato")} icon={<WorkflowIcon className="h-4 w-4" />}>Import from Workato</PillButton>
        )}
      </div>

      {/* Attach files for AI parsing */}
      <Card hover={false} className="overflow-hidden p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
              <Paperclip className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold">Attach files for AI to parse</h3>
              <p className="text-xs text-muted-foreground">PDF, JPG/PNG, JSON, CSV or text — extracted into your workflow description.</p>
            </div>
          </div>
          <Button variant="outline" className="shrink-0" onClick={() => attachRef.current?.click()} disabled={parsingFile}>
            {parsingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {parsingFile ? "Parsing…" : "Upload files"}
          </Button>
          <input
            ref={attachRef}
            type="file"
            multiple
            accept=".pdf,.json,.csv,.txt,.md,.yaml,.yml,image/*"
            className="hidden"
            onChange={(e) => onAttach(e.target.files)}
          />
        </div>
      </Card>

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
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onCodeFile(f); }}
            className="mb-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/30 py-8 text-center transition-colors hover:border-primary"
          >
            <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm">Drag & drop or click to upload</p>
            <p className="text-xs text-muted-foreground">.py .js .ts .json .yaml .yml .txt .md</p>
            <input ref={fileRef} type="file" accept=".py,.js,.ts,.json,.yaml,.yml,.txt,.md" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onCodeFile(f); }} />
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
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label className="block text-xs font-semibold text-muted-foreground">Platforms / Services involved — each becomes a node</label>
            <Button variant="outline" className="!py-1 !px-2.5 text-xs" onClick={runDetection} disabled={detecting}>
              <Sparkles className="h-3.5 w-3.5" /> {detecting ? "Detecting…" : "Auto-detect platforms"}
            </Button>
          </div>
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

        {questions.length > 0 && (
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Info className="h-4 w-4 text-primary" /> Clarifying questions — answers refine your map
            </div>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={i}>
                  <label className="mb-1 block text-xs text-muted-foreground">{q}</label>
                  <input
                    value={answers[i] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                    placeholder="Your answer (optional)"
                    className="inp"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {error && <ErrorCard message={error} onRetry={submit} />}
      {loading ? (
        <AiLoading message="Parsing your workflow and building the dependency map…" />
      ) : (
        <motion.div whileHover={{ scale: 1.01 }}>
          <Button className="w-full" onClick={submit}>
            <Sparkles className="h-4 w-4" /> {submitLabel ?? (isEdit ? "Save changes" : "Map this workflow")}
          </Button>
        </motion.div>
      )}

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
