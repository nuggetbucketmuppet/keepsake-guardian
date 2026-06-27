import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, Bell, ShieldCheck, Save } from "lucide-react";
import { Button, Card, PageHeader } from "@/components/ui-kit";
import { ACCOUNT, useOrg, setOrg, useSettings, saveSettings } from "@/lib/store";
import profilePhoto from "@/assets/profile-photo.png.asset.json";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Streamline" }] }),
  component: SettingsPage,
});

const inputCls =
  "w-full rounded-md border border-input bg-secondary/60 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none";

function SettingsPage() {
  const org = useOrg();
  const settings = useSettings();
  const [orgDraft, setOrgDraft] = useState(org);
  const [drillReminders, setDrillReminders] = useState(settings.drillReminders);
  const [autoPause, setAutoPause] = useState(settings.autoPause);

  const save = () => {
    setOrg(orgDraft.trim() || ACCOUNT.name);
    saveSettings({ drillReminders, autoPause });
    toast.success("Settings saved.");
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="Settings" subtitle="Manage your organisation, notifications and AI integration." />

      <div className="space-y-6">
        <Card hover={false} className="p-6">
          <SectionHead icon={<Building2 className="h-4 w-4" />} title="Organisation" />
          <div className="mb-4 flex items-center gap-4">
            <img src={profilePhoto.url} alt={ACCOUNT.name} className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-accent/40" />
            <div>
              <p className="text-sm font-semibold text-foreground">{ACCOUNT.name}</p>
              <p className="text-xs text-muted-foreground">{ACCOUNT.email}</p>
            </div>
          </div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Organisation name</label>
          <input className={inputCls} value={orgDraft} onChange={(e) => setOrgDraft(e.target.value)} />
        </Card>

        <Card hover={false} className="p-6">
          <SectionHead icon={<Bell className="h-4 w-4" />} title="Notifications" />
          <ToggleRow label="Drill reminders" desc="Notify teams when a mandatory drill is due." checked={drillReminders} onChange={setDrillReminders} />
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

        <Button variant="accent" onClick={save}><Save className="h-4 w-4" /> Save Settings</Button>
      </div>
    </div>
  );
}

function SectionHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="mb-4 flex items-center gap-2 text-foreground"><span className="text-accent">{icon}</span><h3 className="font-display font-bold">{title}</h3></div>;
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-3 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <button type="button" onClick={() => onChange(!checked)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${checked ? "bg-primary" : "bg-secondary"}`}>
        <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );
}
