import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Pencil, Trash2, X, Search, Cpu, Server, User, Save, ChevronDown, Workflow as WorkflowIcon, Boxes,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, Button, ScoreBadge, EmptyState } from "@/components/ui-kit";
import { WorkflowForm } from "@/components/WorkflowForm";
import { useWorkflows, deleteWorkflow } from "@/lib/store";
import { useGraph, updateNode, removeNode, NODE_LABELS } from "@/lib/graph";
import type { Workflow, GraphNode, NodeType } from "@/lib/types";

export const Route = createFileRoute("/manage-workflows")({
  head: () => ({ meta: [{ title: "Manage Workflows — KeepSake" }] }),
  component: ManageWorkflows,
});

type Tab = "workflows" | "nodes";

function ManageWorkflows() {
  const [tab, setTab] = useState<Tab>("workflows");
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Manage Workflows"
        subtitle="Edit or remove existing workflows, and manage every node — platforms, services, and staff — in your dependency map."
      />

      <div className="mb-6 inline-flex gap-1 rounded-lg border border-border bg-card p-1">
        <TabButton active={tab === "workflows"} onClick={() => setTab("workflows")} icon={<WorkflowIcon className="h-4 w-4" />}>Workflows</TabButton>
        <TabButton active={tab === "nodes"} onClick={() => setTab("nodes")} icon={<Boxes className="h-4 w-4" />}>Nodes</TabButton>
      </div>

      {tab === "workflows" ? <WorkflowsTab /> : <NodesTab />}
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
      {icon}{children}
    </button>
  );
}

// ============= Workflows tab =============
function WorkflowsTab() {
  const navigate = useNavigate();
  const workflows = useWorkflows();
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Workflow | null>(null);

  if (workflows.length === 0) {
    return (
      <EmptyState
        icon={<WorkflowIcon className="h-7 w-7" />}
        title="No workflows yet"
        description="Upload your first workflow to start mapping dependencies."
        action={<Button onClick={() => navigate({ to: "/workflow-recorder" })}>Upload a Workflow</Button>}
      />

    );
  }

  return (
    <>
      <div className="space-y-3">
        {workflows.map((wf) => (
          <Card key={wf.id} hover={false} className="flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-display text-sm font-bold">{wf.name}</span>
                <ScoreBadge score={wf.resilienceScore} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{wf.department}</span>
                <span>· {wf.frequency}</span>
                <span>· {wf.classification}</span>
                {wf.aiTool && wf.aiTool !== "—" && <span>· AI: {wf.aiTool}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button aria-label="Edit workflow" onClick={() => setEditing(wf)} className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <Pencil className="h-4 w-4" />
              </button>
              <button aria-label="Delete workflow" onClick={() => setConfirmDelete(wf)} className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {editing && (
        <Modal title={`Edit — ${editing.name}`} onClose={() => setEditing(null)}>
          <WorkflowForm existing={editing} onSaved={() => setEditing(null)} />
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Delete workflow?" onClose={() => setConfirmDelete(null)} narrow>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-semibold text-foreground">{confirmDelete.name}</span>? This cannot be undone. Its nodes remain on the dependency map.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                deleteWorkflow(confirmDelete.id);
                toast.success(`"${confirmDelete.name}" deleted.`);
                setConfirmDelete(null);
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ============= Nodes tab =============
const TYPE_ICON: Record<NodeType, React.ReactNode> = {
  ai: <Cpu className="h-4 w-4" />,
  platform: <Server className="h-4 w-4" />,
  human: <User className="h-4 w-4" />,
};

function NodesTab() {
  const graph = useGraph();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | NodeType>("all");
  const [editing, setEditing] = useState<GraphNode | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return graph.nodes.filter((n) => {
      if (filter !== "all" && n.type !== filter) return false;
      if (!q) return true;
      return (
        n.name.toLowerCase().includes(q) ||
        (n.department ?? "").toLowerCase().includes(q) ||
        (n.contactEmail ?? "").toLowerCase().includes(q) ||
        (n.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [graph.nodes, query, filter]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes, emails, tags…"
            className="w-full rounded-md border border-input bg-secondary/40 py-2 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="inline-flex gap-1 rounded-md border border-border bg-card p-1">
          {(["all", "platform", "ai", "human"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded px-3 py-1.5 text-xs font-semibold ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f === "all" ? "All" : NODE_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Search className="h-7 w-7" />} title="No matching nodes" description="Try a different search or filter." />

      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((n) => (
            <Card key={n.id} hover={false} className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground ring-1 ring-border">
                {n.icon ? <span className="text-lg leading-none">{n.icon}</span> : TYPE_ICON[n.type]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{n.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {NODE_LABELS[n.type]}
                  {n.contactEmail ? ` · ${n.contactEmail}` : ""}
                  {n.contactPhone ? ` · ${n.contactPhone}` : ""}
                </div>
              </div>
              <button aria-label="Edit node" onClick={() => setEditing(n)} className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <Pencil className="h-4 w-4" />
              </button>
            </Card>
          ))}
        </div>
      )}

      {editing && <NodeEditor node={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function NodeEditor({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const [name, setName] = useState(node.name);
  const [type, setType] = useState<NodeType>(node.type);
  const [icon, setIcon] = useState(node.icon ?? "");
  const [contactName, setContactName] = useState(node.contactName ?? "");
  const [contactEmail, setContactEmail] = useState(node.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(node.contactPhone ?? "");
  const [tagsStr, setTagsStr] = useState((node.tags ?? []).join(", "));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () => {
    if (!name.trim()) {
      toast.error("Node name can't be empty.");
      return;
    }
    updateNode(node.id, {
      name: name.trim(),
      type,
      icon: icon.trim() || undefined,
      contactName: contactName.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      tags: tagsStr.split(",").map((t) => t.trim()).filter(Boolean),
    });
    toast.success(`"${name.trim()}" updated.`);
    onClose();
  };

  return (
    <Modal title={`Edit node`} onClose={onClose} narrow>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Lbl label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className="ninp" />
          </Lbl>
          <Lbl label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as NodeType)} className="ninp">
              {(["platform", "ai", "human"] as NodeType[]).map((t) => <option key={t} value={t}>{NODE_LABELS[t]}</option>)}
            </select>
          </Lbl>
          <Lbl label="Icon (emoji)">
            <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} placeholder="e.g. 🛒" className="ninp" />
          </Lbl>
          <Lbl label="Tags (comma-separated)">
            <input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} placeholder="critical, finance" className="ninp" />
          </Lbl>
        </div>

        <div className="rounded-lg border border-border bg-secondary/20 p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {type === "human" ? "Staff contact details" : "Owner / support contact"}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Lbl label={type === "human" ? "Staff name" : "Contact name"}>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} className="ninp" />
            </Lbl>
            <Lbl label="Email">
              <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" placeholder="name@company.com" className="ninp" />
            </Lbl>
            <Lbl label="Phone / number">
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+1 555 000 0000" className="ninp" />
            </Lbl>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" /> Delete node
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save}><Save className="h-4 w-4" /> Save</Button>
          </div>
        </div>

        {confirmDelete && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4">
            <p className="text-sm">Delete <span className="font-semibold">{node.name}</span> and all its connections from the dependency map?</p>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  removeNode(node.id);
                  toast.success("Node deleted.");
                  onClose();
                }}
              >
                <Trash2 className="h-4 w-4" /> Confirm delete
              </Button>
            </div>
          </div>
        )}
      </div>
      <style>{`.ninp{width:100%;border-radius:0.375rem;border:1px solid hsl(var(--input,222 13% 25%));background:rgba(30,33,42,0.4);padding:0.5rem 0.75rem;font-size:0.875rem;}.ninp:focus-visible{outline:none;box-shadow:0 0 0 1px hsl(var(--ring,250 90% 66%));}`}</style>
    </Modal>
  );
}

function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ============= Modal =============
function Modal({ title, onClose, children, narrow }: { title: string; onClose: () => void; children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`my-8 w-full ${narrow ? "max-w-md" : "max-w-3xl"} rounded-xl border border-border bg-card shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-xl border-b border-border bg-card px-5 py-4">
          <h2 className="font-display text-base font-bold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
