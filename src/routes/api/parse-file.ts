import { createFileRoute } from "@tanstack/react-router";

// Parse an uploaded file (PDF, image, JSON, text) into plain text the workflow
// intake can use. Body: { dataUrl, mime, filename }. Returns { text }.
// Text/JSON are decoded directly; PDFs and images are sent to the Lovable AI
// Gateway (multimodal) for extraction.
export const Route = createFileRoute("/api/parse-file")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            dataUrl?: string;
            mime?: string;
            filename?: string;
          };
          const dataUrl = body.dataUrl ?? "";
          const mime = (body.mime ?? "").toLowerCase();
          const filename = body.filename ?? "file";
          if (!dataUrl) {
            return Response.json({ error: "No file provided." }, { status: 400 });
          }

          const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;

          // Plain text / JSON: decode directly, no AI needed.
          if (mime.startsWith("text/") || mime.includes("json") || mime.includes("yaml") || mime.includes("csv")) {
            try {
              const decoded = Buffer.from(base64, "base64").toString("utf-8");
              return Response.json({ text: decoded.slice(0, 20000) });
            } catch {
              return Response.json({ error: "Could not read the text file." }, { status: 200 });
            }
          }

          const lovableKey = process.env.LOVABLE_API_KEY;
          const openaiKey = process.env.OPENAI_API_KEY;

          const instruction =
            "Extract every workflow-relevant detail from this document/image as plain text: tools, platforms, services, AI systems, people/roles, the steps they perform, decisions made, and data that moves between systems. Be thorough and faithful — do not summarise away specifics. Return plain text only.";

          // Build a multimodal content block.
          const isImage = mime.startsWith("image/");
          const content = isImage
            ? [
                { type: "text", text: instruction },
                { type: "image_url", image_url: { url: dataUrl } },
              ]
            : [
                { type: "text", text: instruction },
                { type: "file", file: { filename, file_data: dataUrl } },
              ];

          const fetchWithTimeout = async (url: string, init: RequestInit, ms = 45000) => {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), ms);
            try {
              return await fetch(url, { ...init, signal: ctrl.signal });
            } finally {
              clearTimeout(t);
            }
          };

          if (lovableKey) {
            try {
              const res = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  authorization: `Bearer ${lovableKey}`,
                },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash",
                  messages: [{ role: "user", content }],
                }),
              });
              if (res.ok) {
                const data = (await res.json()) as {
                  choices?: { message?: { content?: string } }[];
                };
                return Response.json({ text: data.choices?.[0]?.message?.content ?? "" });
              }
              console.error("parse-file gateway error", res.status, await res.text());
            } catch (e) {
              console.error("parse-file gateway exception", e);
            }
          }

          // Fallback to OpenAI for images (vision). PDFs need the gateway.
          if (openaiKey && isImage) {
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
                  messages: [{ role: "user", content }],
                }),
              });
              if (res.ok) {
                const data = (await res.json()) as {
                  choices?: { message?: { content?: string } }[];
                };
                return Response.json({ text: data.choices?.[0]?.message?.content ?? "" });
              }
              console.error("parse-file openai error", res.status, await res.text());
            } catch (e) {
              console.error("parse-file openai exception", e);
            }
          }

          return Response.json(
            { error: "Could not parse this file type. Try a text, JSON, PDF, or image file." },
            { status: 200 },
          );
        } catch (err) {
          console.error("parse-file error", err);
          return Response.json({ error: "Something went wrong parsing the file." }, { status: 200 });
        }
      },
    },
  },
});
