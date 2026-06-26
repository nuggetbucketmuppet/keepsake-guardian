import type { AnalysisResult, FallbackGuide, DrillScenario, Workflow } from "./types";

async function callClaude<T>(kind: string, payload: unknown): Promise<T> {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, payload }),
  });
  const data = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error || "AI request failed. Please try again.");
  }
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
