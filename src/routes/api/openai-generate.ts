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

          const fetchWithTimeout = async (url: string, init: RequestInit, ms = 25000) => {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), ms);
            try {
              return await fetch(url, { ...init, signal: ctrl.signal });
            } finally {
              clearTimeout(t);
            }
          };

          const callGateway = async (): Promise<string | null> => {
            if (!lovableKey) return null;
            try {
              const res = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                console.error("Gateway error", res.status, await res.text());
                return null;
              }
              const data = (await res.json()) as {
                choices?: { message?: { content?: string } }[];
              };
              return data.choices?.[0]?.message?.content ?? "";
            } catch (e) {
              console.error("Gateway exception", e);
              return null;
            }
          };

          let text: string | null = null;

          if (openaiKey) {
            try {
              const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
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
              if (res.ok) {
                const data = (await res.json()) as {
                  choices?: { message?: { content?: string } }[];
                };
                text = data.choices?.[0]?.message?.content ?? "";
              } else {
                console.error("OpenAI error", res.status, await res.text());
              }
            } catch (e) {
              console.error("OpenAI exception", e);
            }
          }

          // Fall back to the Lovable gateway if OpenAI failed or is unconfigured.
          if (text === null) {
            text = await callGateway();
          }

          if (text === null) {
            return Response.json(
              { error: "AI service is temporarily unavailable. Please try again." },
              { status: 200 },
            );
          }

          return Response.json({ text });
        } catch (err) {
          console.error("openai-generate error", err);
          return Response.json(
            { error: "Something went wrong. Please try again." },
            { status: 200 },
          );
        }
      },
    },
  },
});
