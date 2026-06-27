import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldAlert, WifiOff, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { getGuide } from "@/lib/idb";
import type { NodeFallbackGuide } from "@/lib/types";

export const Route = createFileRoute("/fallback/$id")({
  head: () => ({ meta: [{ title: "Offline Fallback Guide — KeepSake" }] }),
  component: OfflineGuide,
});

function OfflineGuide() {
  const { id } = Route.useParams();
  const [guide, setGuide] = useState<NodeFallbackGuide | null | undefined>(undefined);

  useEffect(() => {
    getGuide(id).then((g) => setGuide(g ?? null));
  }, [id]);

  if (guide === undefined) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Loading offline guide…</div>;
  }
  if (guide === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-center text-muted-foreground">
        <WifiOff className="h-8 w-8" />
        <p>This guide isn't stored on this device.</p>
        <Link to="/fallback-guides" className="text-accent underline">Back to Fallback Guides</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <Link to="/fallback-guides" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent"><WifiOff className="h-3.5 w-3.5" /> Works offline</span>
        </div>
        <h1 className="font-display text-2xl font-bold">{guide.guide_title}</h1>
        <p className="mb-1 text-xs text-muted-foreground">{guide.nodeName} · v{guide.version} · {new Date(guide.generatedDate).toLocaleString()}</p>
        <p className="mb-6 text-sm text-muted-foreground">{guide.scenario}</p>

        <div className="mb-6 rounded-md border border-danger/40 border-l-4 border-l-danger bg-danger/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-danger"><ShieldAlert className="h-4 w-4" /><span className="text-sm font-bold">Cybersecurity risks</span></div>
          <ul className="space-y-2">
            {guide.cybersecurity_risks.map((r, i) => <li key={i} className="text-xs"><span className="font-semibold text-foreground">{r.risk}</span> — <span className="text-muted-foreground">{r.mitigation}</span></li>)}
          </ul>
        </div>

        <Sec title="First 15 minutes" items={guide.immediate_steps_15min} />
        <Sec title="First hour" items={guide.steps_first_hour} />
        <Sec title="First day" items={guide.steps_first_day} />

        <h2 className="mb-1.5 mt-6 font-display text-lg font-bold">Who to contact</h2>
        <div className="space-y-1.5">
          {guide.contacts.map((c, i) => (
            <div key={i} className="rounded-md border border-border bg-card p-2 text-xs"><span className="font-semibold">{c.role}</span> — {c.action}<div className="mt-0.5 italic text-muted-foreground">"{c.script}"</div></div>
          ))}
        </div>

        <h2 className="mb-1.5 mt-6 font-display text-lg font-bold">Common mistakes</h2>
        <ul className="space-y-1 text-xs">
          {guide.common_mistakes.map((m, i) => <li key={i}><span className="font-semibold text-warning">{m.mistake}</span> → <span className="text-muted-foreground">{m.prevention}</span></li>)}
        </ul>

        <Sec title="Recovery checklist" items={guide.recovery_checklist} checklist />
      </div>
    </div>
  );
}

function Sec({ title, items, checklist }: { title: string; items: string[]; checklist?: boolean }) {
  return (
    <div className="mt-6">
      <h2 className="mb-1.5 font-display text-lg font-bold">{title}</h2>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {items.map((it, i) => <li key={i} className="flex gap-2">{checklist ? <span className="text-accent">☐</span> : <span className="text-primary">{i + 1}.</span>} {it}</li>)}
      </ul>
    </div>
  );
}
