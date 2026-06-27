import type { NodeFallbackGuide } from "./types";

// Builds a self-contained printable HTML document for a fallback guide.
// Used to "Download as PDF" via the browser print dialog (zero deps).
export function buildGuidePrintHtml(g: NodeFallbackGuide): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const list = (items: string[]) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(g.guide_title)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#111;max-width:760px;margin:32px auto;padding:0 24px;line-height:1.5}
  h1{font-size:24px;margin-bottom:4px}h2{font-size:16px;margin-top:24px;border-bottom:1px solid #ddd;padding-bottom:4px}
  .meta{color:#666;font-size:12px;margin-bottom:16px}
  .cyber{border:1px solid #ef4444;border-left:5px solid #ef4444;background:#fef2f2;padding:12px 16px;border-radius:6px;margin:16px 0}
  .cyber h2{color:#b91c1c;border:none;margin-top:0}
  li{margin:4px 0}.script{font-style:italic;color:#555}
</style></head><body>
  <h1>${esc(g.guide_title)}</h1>
  <div class="meta">Node: ${esc(g.nodeName)} · Version ${g.version} · Generated ${new Date(g.generatedDate).toLocaleString()}</div>
  <p>${esc(g.scenario)}</p>
  <div class="cyber"><h2>Cybersecurity Risks</h2><ul>${g.cybersecurity_risks.map((r) => `<li><b>${esc(r.risk)}</b> — ${esc(r.mitigation)}</li>`).join("")}</ul></div>
  <h2>First 15 Minutes</h2>${list(g.immediate_steps_15min)}
  <h2>First Hour</h2>${list(g.steps_first_hour)}
  <h2>First Day</h2>${list(g.steps_first_day)}
  <h2>Who to Contact</h2><ul>${g.contacts.map((c) => `<li><b>${esc(c.role)}</b> — ${esc(c.action)}<br><span class="script">"${esc(c.script)}"</span></li>`).join("")}</ul>
  <h2>Common Mistakes</h2><ul>${g.common_mistakes.map((m) => `<li><b>${esc(m.mistake)}</b> → ${esc(m.prevention)}</li>`).join("")}</ul>
  <h2>Recovery Checklist</h2><ul>${g.recovery_checklist.map((i) => `<li>☐ ${esc(i)}</li>`).join("")}</ul>
</body></html>`;
}
