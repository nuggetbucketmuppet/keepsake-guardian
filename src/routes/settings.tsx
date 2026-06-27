import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, SlidersHorizontal, Bell, ShieldCheck, Save } from "lucide-react";
import { Button, Card, PageHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — KeepSake" }] }),
  component: SettingsPage,
});

const inputCls =
  "w-full rounded-md border border-input bg-secondary/60 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none";

function SettingsPage() {
  const [org, setOrg] = useState("Northwind Enterprises");
  const [notifyDecay, setNotifyDecay] = useState(true);
  const [notifyDrills, setNotifyDrills] = useState(true);
  const [autoPause, setAutoPause] = useState(true);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="Settings" subtitle="Configure your organisation, decay thresholds, and notification preferences." />

      <div className="space-y-6">
        <Card hover={false} className="p-6">
          <SectionHead icon={<Building2 className="h-4 w-4" />} title="Organisation" />
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Organisation name</label>
          <input className={inputCls} value={org} onChange={(e) => setOrg(e.target.value)} />
        </Card>

        <Card hover={false} className="p-6">
          <SectionHead icon={<Bell className="h-4 w-4" />} title="Notifications" />
          <ToggleRow label="Knowledge decay alerts" desc="Email managers when a workflow enters Warning or Critical." checked={notifyDecay} onChange={setNotifyDecay} />
          <ToggleRow label="Drill reminders" desc="Notify teams when a mandatory drill is due." checked={notifyDrills} onChange={setNotifyDrills} />
          <ToggleRow label="Auto-pause automation" desc="Automatically pause automation when a workflow hits Critical." checked={autoPause} onChange={setAutoPause} />
        </Card>

        <Card hover={false} className="p-6">
          <SectionHead icon={<ShieldCheck className="h-4 w-4" />} title="AI Integration" />
          <div className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Anthropic Claude</p>
              <p className="font-mono text-xs text-muted-foreground">claude-sonnet-4-6 · proxied securely server-side</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-success/15 px-2.5 py-1 text-xs font-semibold text-success ring-1 ring-success/40">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Connected
            </span>
          </div>
        </Card>

        <Button variant="accent" onClick={() => toast.success("Settings saved.")}><Save className="h-4 w-4" /> Save Settings</Button>
      </div>
    </div>
  );
}

function SectionHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="mb-4 flex items-center gap-2 text-foreground"><span className="text-accent">{icon}</span><h3 className="font-display font-bold">{title}</h3></div>;
}

function Threshold({ label, value, onChange, color }: { label: string; value: number; onChange: (v: number) => void; color: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color }}>{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" min={1} value={value} onChange={(e) => onChange(Number(e.target.value))} className={inputCls} />
        <span className="text-xs text-muted-foreground">days</span>
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-3 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <button type="button" onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-secondary"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
