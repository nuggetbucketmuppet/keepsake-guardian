import { createFileRoute } from "@tanstack/react-router";

// Proxy to OpenAI GPT-4o. Body: { systemPrompt, userMessage }. Returns { text }.
// Falls back to the Lovable AI Gateway if OPENAI_API_KEY is unavailable so the
// app keeps working end-to-end.
export const Route = createFileRoute("/api/openai-generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            systemPrompt?: string;
            userMessage?: string;
          };
          const systemPrompt = body.systemPrompt ?? "";
          const userMessage = body.userMessage ?? "";
          if (!userMessage) {
            return Response.json({ error: "Missing user message." }, { status: 400 });
          }

          const openaiKey = process.env.OPENAI_API_KEY;
          const lovableKey = process.env.LOVABLE_API_KEY;

          let text = "";

          if (openaiKey) {
            const res = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${openaiKey}`,
              },
              body: JSON.stringify({
                model: "gpt-4o",
                max_tokens: 2000,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: userMessage },
                ],
              }),
            });
            if (!res.ok) {
              const errText = await res.text();
              console.error("OpenAI error", res.status, errText);
              return Response.json(
                { error: `AI request failed (${res.status}). Please try again.` },
                { status: 502 },
              );
            }
            const data = (await res.json()) as {
              choices?: { message?: { content?: string } }[];
            };
            text = data.choices?.[0]?.message?.content ?? "";
          } else if (lovableKey) {
            const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${lovableKey}`,
              },
              body: JSON.stringify({
                model: "openai/gpt-5-mini",
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: userMessage },
                ],
              }),
            });
            if (!res.ok) {
              const errText = await res.text();
              console.error("Gateway error", res.status, errText);
              return Response.json(
                { error: `AI request failed (${res.status}). Please try again.` },
                { status: 502 },
              );
            }
            const data = (await res.json()) as {
              choices?: { message?: { content?: string } }[];
            };
            text = data.choices?.[0]?.message?.content ?? "";
          } else {
            return Response.json({ error: "AI service is not configured." }, { status: 500 });
          }

          return Response.json({ text });
        } catch (err) {
          console.error("openai-generate error", err);
          return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
        }
      },
    },
  },
});
