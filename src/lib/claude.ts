import type { IntakeResult, NodeFallbackGuide, AnalysisResult, FallbackGuide, DrillScenario, Workflow } from "./types";

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
