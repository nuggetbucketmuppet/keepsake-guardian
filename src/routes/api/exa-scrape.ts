import { createFileRoute } from "@tanstack/react-router";

// Server proxy to Exa. Body: { query: string, numResults?: number }.
// Returns { results: [{ title, url, text }] }. The EXA_API_KEY never touches
// the browser — it is read here, server-side only.
export const Route = createFileRoute("/api/exa-scrape")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            query?: string;
            numResults?: number;
          };
          const query = (body.query ?? "").trim();
          if (!query) {
            return Response.json({ error: "Missing search query." }, { status: 400 });
          }

          const exaKey = process.env.EXA_API_KEY;
          if (!exaKey) {
            return Response.json({ error: "Policy scraping is not configured." }, { status: 500 });
          }

          const res = await fetch("https://api.exa.ai/search", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": exaKey,
            },
            body: JSON.stringify({
              query,
              numResults: Math.min(body.numResults ?? 5, 10),
              type: "auto",
              contents: { text: { maxCharacters: 6000 } },
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            console.error("Exa error", res.status, errText);
            return Response.json(
              { error: `Policy search failed (${res.status}). Please try again.` },
              { status: 502 },
            );
          }

          const data = (await res.json()) as {
            results?: { title?: string; url?: string; text?: string }[];
          };
          const results = (data.results ?? []).map((r) => ({
            title: r.title ?? "Untitled",
            url: r.url ?? "",
            text: r.text ?? "",
          }));

          return Response.json({ results });
        } catch (err) {
          console.error("exa-scrape error", err);
          return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
        }
      },
    },
  },
});
