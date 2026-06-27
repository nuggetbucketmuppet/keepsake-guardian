import type {
  IntakeResult,
  NodeFallbackGuide,
  AnalysisResult,
  FallbackGuide,
  DrillScenario,
  Workflow,
  Policy,
  ComplianceEvaluation,
} from "./types";

// ---- Claude proxy (intake parsing, risk analysis) ----
async function callClaude<T>(kind: string, payload: unknown): Promise<T> {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, payload }),
  });
  const data = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || data.error) throw new Error(data.error || "AI request failed. Please try again.");
  return data.result as T;
}

export function analyzeWorkflow(wf: Partial<Workflow>) {
  return callClaude<AnalysisResult>("analysis", wf);
}
export function generateGuide(wf: Workflow) {
  return callClaude<Omit<FallbackGuide, "id" | "workflowId" | "workflowName" | "generatedDate">>("guide", wf);
}
export function generateDrill(config: unknown) {
  return callClaude<DrillScenario>("drill", config);
}
export function generateDebrief(payload: unknown) {
  return callClaude<{ debrief: string }>("debrief", payload);
}
export function parseIntake(payload: unknown) {
  return callClaude<IntakeResult>("intake", payload);
}

// ---- File parsing (PDF / image / JSON / text) into workflow text ----
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

export async function parseFile(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  const res = await fetch("/api/parse-file", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataUrl, mime: file.type || "", filename: file.name }),
  });
  const data = (await res.json()) as { text?: string; error?: string };
  if (!res.ok || data.error) throw new Error(data.error || "Could not parse file.");
  return data.text ?? "";
}

// ---- OpenAI proxy (guide generation, scenarios) ----
function extractJson<T>(text: string): T {
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last >= 0) t = t.slice(first, last + 1);
  return JSON.parse(t) as T;
}

export async function callOpenAI(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch("/api/openai-generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ systemPrompt, userMessage }),
  });
  const data = (await res.json()) as { text?: string; error?: string };
  if (!res.ok || data.error) throw new Error(data.error || "AI request failed. Please try again.");
  return data.text ?? "";
}

const GUIDE_SYSTEM = `You are a business continuity specialist and cybersecurity expert. Generate a comprehensive human fallback guide for the scenario provided. The guide must:
1. Assume the worst — "what can go wrong, will go wrong." Write for a staff member with no technical background who has never done this manually before.
2. Include a cybersecurity section for every guide: what data risks emerge when this service fails (e.g. staff resorting to personal email, shadow IT, insecure workarounds), and specific steps to mitigate those risks during the outage.
3. Provide step-by-step manual instructions to keep the workflow running without the failed node.
4. List what to do in the first 15 minutes, first hour, and first day of the failure.
5. List who to contact, in what order, and what to say.
6. List common mistakes staff make during this type of failure and how to avoid them.
7. End with a post-incident checklist for when the service comes back online.

Return the guide as structured JSON with fields: guide_title, scenario, cybersecurity_risks (array of {risk, mitigation}), immediate_steps_15min (array), steps_first_hour (array), steps_first_day (array), contacts (array of {role, action, script}), common_mistakes (array of {mistake, prevention}), recovery_checklist (array). No markdown, no preamble.`;

export async function generateNodeGuide(input: {
  nodeName: string;
  nodeType: string;
  connectedNodes: string[];
  scenarios: string[];
}): Promise<Omit<NodeFallbackGuide, "id" | "nodeId" | "version" | "generatedDate">> {
  const userMessage = `Failed node: "${input.nodeName}" (type: ${input.nodeType}).
Connected nodes (upstream/downstream): ${input.connectedNodes.join(", ") || "none recorded"}.
Failure scenarios to cover:\n${input.scenarios.map((s) => `- ${s}`).join("\n")}`;
  const text = await callOpenAI(GUIDE_SYSTEM, userMessage);
  return extractJson(text);
}

const SCENARIO_SYSTEM = `You are a business continuity analyst. Given a node (a tool, service, or human step) and its connected nodes, suggest 4-6 concrete, realistic failure scenarios a manager might want to prepare for. Return ONLY valid JSON: {scenarios: string[]} where each item is a short question like "What if Shopify goes offline?". No markdown, no preamble.`;

export async function suggestScenarios(nodeName: string, nodeType: string, connected: string[]): Promise<string[]> {
  const userMessage = `Node: "${nodeName}" (type: ${nodeType}). Connected: ${connected.join(", ") || "none"}.`;
  const text = await callOpenAI(SCENARIO_SYSTEM, userMessage);
  const parsed = extractJson<{ scenarios?: string[] }>(text);
  return parsed.scenarios ?? [];
}

// ---- Exa policy scraping ----
export interface ScrapedPolicy {
  title: string;
  url: string;
  text: string;
}
export async function scrapePolicies(query: string, numResults = 5): Promise<ScrapedPolicy[]> {
  const res = await fetch("/api/exa-scrape", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, numResults }),
  });
  const data = (await res.json()) as { results?: ScrapedPolicy[]; error?: string };
  if (!res.ok || data.error) throw new Error(data.error || "Policy search failed. Please try again.");
  return data.results ?? [];
}

// ---- OpenAI compliance evaluation ----
const COMPLIANCE_SYSTEM = `You are an enterprise compliance auditor. You are given a company policy and a workflow. Evaluate how well the workflow complies with the policy. Be specific and reference the policy's actual requirements. Return ONLY valid JSON: {overall_status: one of 'compliant'|'partial'|'non-compliant', compliance_score: integer 0-100, summary: string (2-3 sentences), findings: [{requirement: string, status: 'compliant'|'partial'|'non-compliant', detail: string}], recommendations: string[]}. No markdown, no preamble.`;

export async function evaluateCompliance(
  policy: Policy,
  workflow: Workflow,
): Promise<Omit<ComplianceEvaluation, "id" | "workflowId" | "workflowName" | "policyId" | "policyName" | "evaluatedDate">> {
  const userMessage = `POLICY: "${policy.name}" (category: ${policy.category})
---
${policy.content.slice(0, 8000)}
---
WORKFLOW: "${workflow.name}" (department: ${workflow.department}, classification: ${workflow.classification})
Task: ${workflow.taskDescription}
AI tool: ${workflow.aiTool}
Systems touched: ${workflow.systems.map((s) => `${s.systemName} (${s.action}, ${s.dataType})`).join("; ") || "none recorded"}
Data used: ${workflow.data.map((d) => `${d.source} (${d.type})`).join("; ") || "none recorded"}
Approvals skipped: ${workflow.approvalsSkipped ? `yes — ${workflow.skippedWhich ?? ""} (${workflow.skippedReason ?? ""})` : "no"}
Code/pseudocode: ${workflow.code ? workflow.code.slice(0, 2000) : "none provided"}`;
  const text = await callOpenAI(COMPLIANCE_SYSTEM, userMessage);
  return extractJson(text);
}

// ---- OpenAI policy summary ----
const POLICY_SUMMARY_SYSTEM = `You are a compliance analyst. Summarise the supplied policy document into a concise 2-3 sentence plain-English overview of what it requires. Return ONLY valid JSON: {summary: string}. No markdown, no preamble.`;
export async function summarisePolicy(content: string): Promise<string> {
  const text = await callOpenAI(POLICY_SUMMARY_SYSTEM, content.slice(0, 8000));
  const parsed = extractJson<{ summary?: string }>(text);
  return parsed.summary ?? "";
}

// ---- Platform detection + clarifying questions (OpenAI) ----
export interface DetectedPlatform { name: string; type: "ai" | "platform" | "human"; reason?: string }
export interface DetectionResult {
  platforms: DetectedPlatform[];
  questions: string[];
}
const DETECT_SYSTEM = `You are a business operations analyst. Read the workflow description (plain text, code, or pseudocode) and identify every distinct tool, service, app, AI system, and human role/position it depends on.
For each, classify it as exactly one of: "ai" (an AI/LLM/ML system), "platform" (any software, SaaS, service, app, database, or API), or "human" (a staff role or position that performs a manual step).
Also produce 3-6 short clarifying questions a manager should answer before finalising the map. Questions should probe ambiguity, e.g. "Which platform is used for the payment step?", "Is the CRM here the same Salesforce instance used in your Finance workflow?", "Who performs the manual approval — which position?".
Return ONLY valid JSON: {platforms: [{name: string, type: "ai"|"platform"|"human", reason: string}], questions: string[]}. No markdown, no preamble.`;

export async function detectPlatforms(input: {
  description: string;
  existingNodeNames?: string[];
}): Promise<DetectionResult> {
  const userMessage = `WORKFLOW INPUT:\n${input.description.slice(0, 8000)}\n\nEXISTING NODES ALREADY IN THE MAP (use these exact names if the workflow reuses them, and ask if a detected item is the same as one of these): ${input.existingNodeNames?.join(", ") || "none"}`;
  const text = await callOpenAI(DETECT_SYSTEM, userMessage);
  const parsed = extractJson<Partial<DetectionResult>>(text);
  return { platforms: parsed.platforms ?? [], questions: parsed.questions ?? [] };
}

// ---- Examine workflow: clarifying questions + reuse of existing nodes ----
export interface NodeMatchSuggestion {
  detectedName: string;
  type: "ai" | "platform" | "human";
  existingNodeName: string; // the existing node this might be the same as
  question: string; // e.g. "Is this SQL database the same one that stores cost of materials?"
}
export interface ExamineResult {
  questions: string[];
  nodeMatches: NodeMatchSuggestion[];
}
const EXAMINE_SYSTEM = `You are a business operations analyst helping a manager map a workflow.
Read the workflow input (plain text, code, or pseudocode). Do two things:
1. Produce 3-6 short, specific clarifying questions whose answers would make the dependency map more accurate. Probe ambiguity, e.g. "Which platform handles the payment step?", "Who performs the manual approval — which position?".
2. Look at the list of EXISTING NODES already in other workflows. If something in this workflow is likely the SAME tool/service/person as an existing node, propose a yes/no confirmation. Phrase as a natural question, e.g. "Is this SQL database the same one that stores cost of materials?".
Return ONLY valid JSON: {questions: string[], nodeMatches: [{detectedName: string, type: "ai"|"platform"|"human", existingNodeName: string, question: string}]}. No markdown, no preamble.`;

export async function examineWorkflow(input: {
  description: string;
  existingNodeNames?: string[];
}): Promise<ExamineResult> {
  const userMessage = `WORKFLOW INPUT:\n${input.description.slice(0, 8000)}\n\nEXISTING NODES IN OTHER WORKFLOWS: ${input.existingNodeNames?.join(", ") || "none"}`;
  const text = await callOpenAI(EXAMINE_SYSTEM, userMessage);
  const parsed = extractJson<Partial<ExamineResult>>(text);
  return { questions: parsed.questions ?? [], nodeMatches: parsed.nodeMatches ?? [] };
}

// ---- Autofill workflow details from the description ----
export interface AutofillResult {
  name: string;
  department: string;
  frequency: string;
  classification: string;
  aiPowered: "Yes" | "Partially" | "No";
  platforms: { name: string; type: "ai" | "platform" | "human" }[];
}
const AUTOFILL_SYSTEM = `You are a business operations analyst. From the workflow input, infer sensible metadata to pre-fill a form.
- department: one of Finance, Procurement, HR, IT, Customer Success, Operations, Legal, Marketing, Others.
- frequency: one of Real-time, Daily, Weekly, Monthly, Ad-hoc.
- classification: one of Public, Internal, Confidential, Restricted.
- aiPowered: "Yes", "Partially", or "No".
- name: a short descriptive workflow name.
- platforms: every distinct tool/service/AI/human role, each typed "ai", "platform", or "human".
Return ONLY valid JSON: {name, department, frequency, classification, aiPowered, platforms: [{name, type}]}. No markdown, no preamble.`;

export async function autofillWorkflow(description: string): Promise<AutofillResult> {
  const text = await callOpenAI(AUTOFILL_SYSTEM, description.slice(0, 8000));
  const parsed = extractJson<Partial<AutofillResult>>(text);
  return {
    name: parsed.name ?? "",
    department: parsed.department ?? "Operations",
    frequency: parsed.frequency ?? "Daily",
    classification: parsed.classification ?? "Internal",
    aiPowered: parsed.aiPowered ?? "Partially",
    platforms: parsed.platforms ?? [],
  };
}

// ---- Optimise the dependency map (or a single workflow) ----
export interface OptimisationItem {
  title: string;
  rationale: string;
  impact: "high" | "medium" | "low";
  affected_nodes: string[];
}
export interface OptimisationResult {
  summary: string;
  recommendations: OptimisationItem[];
}
const OPTIMISE_SYSTEM = `You are an enterprise operations strategist. Given a dependency graph (nodes and edges) and optimisation goals, suggest concrete improvements.
Optimise for the chosen parameters (e.g. cost, efficiency, reducing reliance on human agents, plus any custom goal).
For each recommendation give a short title, a rationale, an impact ("high"|"medium"|"low"), and the affected node names.
Return ONLY valid JSON: {summary: string, recommendations: [{title, rationale, impact, affected_nodes: string[]}]}. No markdown, no preamble.`;

export async function optimiseMap(input: {
  scope: string; // "Entire dependency map" or a workflow name
  parameters: string[];
  custom?: string;
  graphSummary: string;
}): Promise<OptimisationResult> {
  const userMessage = `SCOPE: ${input.scope}
OPTIMISATION PARAMETERS: ${input.parameters.join(", ")}${input.custom ? ` (custom goal: ${input.custom})` : ""}
DEPENDENCY GRAPH:
${input.graphSummary}`;
  const text = await callOpenAI(OPTIMISE_SYSTEM, userMessage);
  const parsed = extractJson<Partial<OptimisationResult>>(text);
  return { summary: parsed.summary ?? "", recommendations: parsed.recommendations ?? [] };
}

// ---- Evaluate the dependency map: at-risk / highly-dependent nodes ----
export interface RiskNode {
  node_name: string;
  type: string;
  dependency_score: number; // 0-100
  risk_level: "high" | "medium" | "low";
  reason: string;
  recommendation: string;
}
export interface MapEvaluationResult {
  summary: string;
  at_risk_nodes: RiskNode[];
}
const MAP_EVAL_SYSTEM = `You are a business resilience analyst. Given a dependency graph (nodes and edges), identify the most highly-depended-on and at-risk nodes — single points of failure where an outage would cripple operations.
For each, give a dependency_score (0-100), a risk_level ("high"|"medium"|"low"), why it's risky, and a recommendation.
Order by dependency_score descending.
Return ONLY valid JSON: {summary: string, at_risk_nodes: [{node_name, type, dependency_score, risk_level, reason, recommendation}]}. No markdown, no preamble.`;

export async function evaluateDependencyMap(graphSummary: string): Promise<MapEvaluationResult> {
  const text = await callOpenAI(MAP_EVAL_SYSTEM, graphSummary);
  const parsed = extractJson<Partial<MapEvaluationResult>>(text);
  return { summary: parsed.summary ?? "", at_risk_nodes: parsed.at_risk_nodes ?? [] };
}

