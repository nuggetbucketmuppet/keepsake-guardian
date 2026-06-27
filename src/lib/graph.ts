import { useSyncExternalStore } from "react";
import type { DependencyGraph, GraphNode, GraphEdge, NodeType, RiskLevel } from "./types";
import { uid } from "./store";

const KEY = "keepsake.graph";

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: Listener) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// ---- Seed graph (always present on first load) ----
const N = (name: string, type: NodeType, department: GraphNode["department"], riskLevel: RiskLevel, hasGuide = false): GraphNode => ({
  id: uid(),
  name,
  type,
  department,
  riskLevel,
  hasGuide,
});

const shopify = N("Shopify", "saas", "Operations", "high");
const mailchimp = N("Mailchimp", "saas", "Marketing", "medium");
const sheets = N("Google Sheets", "saas", "Operations", "medium", true);
const stockCheck = N("Morning Stock Check (Staff)", "human", "Operations", "high");
const classifier = N("GPT-4o Order Classifier", "ai", "Operations", "high");
const netsuite = N("NetSuite ERP", "internal", "Finance", "high", true);
const invoiceBot = N("Invoice Approval Bot", "ai", "Finance", "high");
const financeMgr = N("Finance Manager", "human", "Finance", "medium");
const csBot = N("CS Onboarding Bot", "ai", "Customer Success", "medium", true);
const customerDb = N("Customer DB", "internal", "Customer Success", "medium");
const twilio = N("Twilio SMS", "external", "Customer Success", "low");

const seedNodes: GraphNode[] = [
  shopify, mailchimp, sheets, stockCheck, classifier,
  netsuite, invoiceBot, financeMgr, csBot, customerDb, twilio,
];

const E = (s: GraphNode, t: GraphNode, label?: string): GraphEdge => ({
  id: uid(), source: s.id, target: t.id, label,
});

const seedEdges: GraphEdge[] = [
  E(shopify, classifier, "new order"),
  E(classifier, mailchimp, "trigger email"),
  E(classifier, sheets, "update inventory"),
  E(sheets, stockCheck, "manual review"),
  E(shopify, netsuite, "sync revenue"),
  E(netsuite, invoiceBot, "invoice data"),
  E(invoiceBot, financeMgr, "approval"),
  E(customerDb, csBot, "profile"),
  E(csBot, twilio, "welcome SMS"),
];

export const seedGraph: DependencyGraph = { nodes: seedNodes, edges: seedEdges };

// ---- Persistence ----
function read(): DependencyGraph {
  if (typeof window === "undefined") return seedGraph;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(seedGraph));
      return seedGraph;
    }
    return JSON.parse(raw) as DependencyGraph;
  } catch {
    return seedGraph;
  }
}
function write(g: DependencyGraph) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(g));
  cache = { raw: localStorage.getItem(KEY), value: g };
  emit();
}

let cache: { raw: string | null; value: DependencyGraph } | null = null;
function getSnapshot(): DependencyGraph {
  const raw = typeof window === "undefined" ? null : localStorage.getItem(KEY);
  if (cache && cache.raw === raw) return cache.value;
  let value: DependencyGraph;
  try {
    value = raw ? (JSON.parse(raw) as DependencyGraph) : seedGraph;
  } catch {
    value = seedGraph;
  }
  cache = { raw, value };
  return value;
}

export function useGraph(): DependencyGraph {
  return useSyncExternalStore(subscribe, getSnapshot, () => seedGraph);
}

// ---- Mutations ----
// Merge nodes/edges from an intake/import. Match nodes by name (case-insensitive).
export function mergeIntoGraph(
  newNodes: { name: string; type: NodeType }[],
  newEdges: { source: string; target: string; label?: string }[],
  meta?: { department?: GraphNode["department"]; workflowId?: string; riskLevel?: RiskLevel },
): void {
  const g = read();
  const byName = new Map(g.nodes.map((n) => [n.name.toLowerCase(), n]));

  for (const nn of newNodes) {
    const existing = byName.get(nn.name.toLowerCase());
    if (existing) {
      existing.type = nn.type;
      if (meta?.department) existing.department = meta.department;
      if (meta?.workflowId) existing.workflowId = meta.workflowId;
    } else {
      const node: GraphNode = {
        id: uid(),
        name: nn.name,
        type: nn.type,
        department: meta?.department,
        riskLevel: meta?.riskLevel ?? "medium",
        workflowId: meta?.workflowId,
      };
      g.nodes.push(node);
      byName.set(nn.name.toLowerCase(), node);
    }
  }

  for (const ne of newEdges) {
    const s = byName.get(ne.source.toLowerCase());
    const t = byName.get(ne.target.toLowerCase());
    if (!s || !t) continue;
    const dup = g.edges.some((e) => e.source === s.id && e.target === t.id);
    if (!dup) g.edges.push({ id: uid(), source: s.id, target: t.id, label: ne.label });
  }

  write(g);
}

export function addNodeManual(node: Omit<GraphNode, "id">): void {
  const g = read();
  g.nodes.push({ ...node, id: uid() });
  write(g);
}
export function updateNode(id: string, patch: Partial<GraphNode>): void {
  const g = read();
  const idx = g.nodes.findIndex((n) => n.id === id);
  if (idx >= 0) {
    g.nodes[idx] = { ...g.nodes[idx], ...patch };
    write(g);
  }
}
export function removeNode(id: string): void {
  const g = read();
  g.nodes = g.nodes.filter((n) => n.id !== id);
  g.edges = g.edges.filter((e) => e.source !== id && e.target !== id);
  write(g);
}
export function addEdge(source: string, target: string, label?: string): void {
  const g = read();
  if (g.edges.some((e) => e.source === source && e.target === target)) return;
  g.edges.push({ id: uid(), source, target, label });
  write(g);
}
export function removeEdge(id: string): void {
  const g = read();
  g.edges = g.edges.filter((e) => e.id !== id);
  write(g);
}

// ---- Derived helpers ----
export function downstreamCount(graph: DependencyGraph, nodeId: string): number {
  return graph.edges.filter((e) => e.source === nodeId).length;
}
export function connectedNodes(graph: DependencyGraph, nodeId: string): { upstream: GraphNode[]; downstream: GraphNode[] } {
  const up = graph.edges.filter((e) => e.target === nodeId).map((e) => e.source);
  const down = graph.edges.filter((e) => e.source === nodeId).map((e) => e.target);
  const find = (id: string) => graph.nodes.find((n) => n.id === id);
  return {
    upstream: up.map(find).filter(Boolean) as GraphNode[],
    downstream: down.map(find).filter(Boolean) as GraphNode[],
  };
}

export const NODE_COLORS: Record<NodeType, string> = {
  ai: "#6C63FF",
  saas: "#3B82F6",
  internal: "#00E5BE",
  human: "#F1F5F9",
  external: "#F59E0B",
  unknown: "#8B93A7",
};
export const NODE_LABELS: Record<NodeType, string> = {
  ai: "AI Tool",
  saas: "SaaS App",
  internal: "Internal System",
  human: "Human Step",
  external: "External Service",
  unknown: "Unknown",
};
