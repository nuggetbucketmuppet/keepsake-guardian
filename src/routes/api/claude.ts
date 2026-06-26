import { createFileRoute } from "@tanstack/react-router";

const SYSTEM_PROMPTS: Record<string, string> = {
  analysis:
    "You are an enterprise resilience analyst. Based on the workflow record provided, analyse it and return a structured JSON response with: 1. risk_flags: array of objects {flag_title, description, severity (low/medium/high/critical)} identifying risks such as over-reliance on AI, data classification concerns, skipped approvals, single points of failure. 2. resilience_score: integer 0-100 rating how resilient this workflow is if AI fails. 3. resilience_reasoning: 2-3 sentences explaining the score. 4. recommended_actions: array of strings with specific recommendations to improve resilience. Respond ONLY in valid JSON. No markdown, no preamble.",
  guide:
    "You are a technical writer specialising in enterprise business continuity documentation. Based on the workflow record provided, generate a complete human fallback guide that a non-technical employee could follow to execute this workflow manually if all AI tools were unavailable. The guide must include: 1. guide_title: string. 2. estimated_time_manual: string (e.g. \"45-60 minutes\"). 3. required_personnel: array of strings (roles needed). 4. required_system_access: array of strings (systems the human must be able to log into). 5. pre_conditions: array of strings (what must be true before starting). 6. steps: array of objects {step_number, title, detailed_instruction, system_used, decision_points (array of strings), common_mistakes (array of strings)}. 7. escalation_path: string describing who to contact if stuck. 8. estimated_risk_if_skipped: string describing business impact if this process is not done. Respond ONLY in valid JSON. No markdown, no preamble.",
  drill:
    "You are an enterprise business continuity specialist running an AI failure drill. Based on the provided agent, affected workflows, and outage duration, generate a realistic drill scenario. Return: 1. scenario_title: string. 2. scenario_briefing: string (2-3 paragraph dramatic but realistic briefing to read to the team, present tense, urgent tone). 3. critical_question: string (the main challenge question for the manager). 4. drill_tasks: array of objects {task_id, task_title, task_description, is_critical (boolean), requires_system_access (string), estimated_minutes (integer), hint (string)}. 5. scoring_criteria: array of objects {criterion, points_available, description}. 6. total_points_available: integer. Respond ONLY in valid JSON. No markdown, no preamble.",
  debrief:
    "You are an enterprise business continuity coach. Based on the completed drill results provided (scenario, tasks completed vs total, critical tasks status, score), write a concise debrief. Return JSON: {debrief: string} where debrief is 3-4 sentences covering what the team did well, what needs improvement, and one recommended training action. Respond ONLY in valid JSON. No markdown, no preamble.",
};

function extractJson(text: string): unknown {
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last >= 0) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

export const Route = createFileRoute("/api/claude")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { kind?: string; payload?: unknown };
          const kind = body.kind ?? "";
          const system = SYSTEM_PROMPTS[kind];
          if (!system) {
            return Response.json({ error: "Unknown request type." }, { status: 400 });
          }

          const userContent = JSON.stringify(body.payload ?? {});

          // Prefer the Lovable AI Gateway (managed key, always available).
          const lovableKey = process.env.LOVABLE_API_KEY;
          const anthropicKey = process.env.ANTHROPIC_API_KEY;

          let text = "";

          if (lovableKey) {
            const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${lovableKey}`,
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: userContent },
                ],
              }),
            });
            if (!res.ok) {
              const errText = await res.text();
              console.error("AI gateway error", res.status, errText);
              return Response.json(
                { error: `AI request failed (${res.status}). Please try again.` },
                { status: 502 },
              );
            }
            const data = (await res.json()) as {
              choices?: { message?: { content?: string } }[];
            };
            text = data.choices?.[0]?.message?.content ?? "";
          } else if (anthropicKey) {
            const res = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-api-key": anthropicKey,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: "claude-sonnet-4-6",
                max_tokens: 4096,
                system,
                messages: [{ role: "user", content: userContent }],
              }),
            });
            if (!res.ok) {
              const errText = await res.text();
              console.error("Anthropic error", res.status, errText);
              return Response.json(
                { error: `AI request failed (${res.status}). Please try again.` },
                { status: 502 },
              );
            }
            const data = (await res.json()) as { content?: { text?: string }[] };
            text = data.content?.[0]?.text ?? "";
          } else {
            return Response.json({ error: "AI service is not configured." }, { status: 500 });
          }

          let parsed: unknown;
          try {
            parsed = extractJson(text);
          } catch {
            return Response.json({ error: "AI returned an unexpected format. Please retry." }, { status: 502 });
          }
          return Response.json({ result: parsed });
        } catch (err) {
          console.error("claude handler error", err);
          return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
        }
      },
    },
  },
});
