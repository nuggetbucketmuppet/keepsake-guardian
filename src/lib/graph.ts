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

// Map any legacy/raw node type to the 3 allowed kinds.
export function normalizeNodeType(raw: string | undefined): NodeType {
  const v = (raw ?? "").toLowerCase();
  if (v === "ai") return "ai";
  if (v === "human") return "human";
  return "platform"; // saas, internal, external, unknown, service, app, etc.
}

// ---- Seed graph (always present on first load) ----
const N = (name: string, type: NodeType, department: GraphNode["department"], riskLevel: RiskLevel, hasGuide = false): GraphNode => ({
  id: uid(),
  name,
  type,
  department,
  riskLevel,
  hasGuide,
});

const shopify = N("Shopify", "platform", "Operations", "high");
const mailchimp = N("Mailchimp", "platform", "Marketing", "medium");
const sheets = N("Google Sheets", "platform", "Operations", "medium", true);
const stockCheck = N("Inventory Officer", "human", "Operations", "high");
const classifier = N("GPT-4o Order Classifier", "ai", "Operations", "high");
const netsuite = N("NetSuite ERP", "platform", "Finance", "high", true);
const invoiceBot = N("Invoice Approval Bot", "ai", "Finance", "high");
const financeMgr = N("Finance Manager", "human", "Finance", "medium");
const csBot = N("CS Onboarding Bot", "ai", "Customer Success", "medium", true);
const customerDb = N("Customer DB", "platform", "Customer Success", "medium");
const twilio = N("Twilio SMS", "platform", "Customer Success", "low");

const seedNodes: GraphNode[] = [
  shopify, mailchimp, sheets, stockCheck, classifier,
  netsuite, invoiceBot, financeMgr, csBot, customerDb, twilio,
];

const E = (s: GraphNode, t: GraphNode, label?: string, steps?: string[]): GraphEdge => ({
  id: uid(), source: s.id, target: t.id, label, steps,
});

const seedEdges: GraphEdge[] = [
  E(shopify, classifier, "new order"),
  E(classifier, mailchimp, "trigger email"),
  E(classifier, sheets, "update inventory"),
  E(sheets, stockCheck, "manual review", ["Open the inventory sheet", "Cross-check stock counts", "Flag discrepancies"]),
  E(shopify, netsuite, "sync revenue"),
  E(netsuite, invoiceBot, "invoice data"),
  E(invoiceBot, financeMgr, "approval", ["Review flagged invoices", "Approve or reject", "Log decision"]),
  E(customerDb, csBot, "profile"),
  E(csBot, twilio, "welcome SMS"),
];

export const seedGraph: DependencyGraph = { nodes: seedNodes, edges: seedEdges };

// ---- Persistence ----
function normalizeGraph(g: DependencyGraph): DependencyGraph {
  return {
    nodes: g.nodes.map((n) => ({ ...n, type: normalizeNodeType(n.type) })),
    edges: g.edges,
  };
}

function read(): DependencyGraph {
  if (typeof window === "undefined") return seedGraph;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(seedGraph));
      return seedGraph;
    }
    return normalizeGraph(JSON.parse(raw) as DependencyGraph);
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
    value = raw ? normalizeGraph(JSON.parse(raw) as DependencyGraph) : seedGraph;
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
// Returns the names of nodes that already existed in the graph from a *different*
// workflow — i.e. shared single points of failure now connected across workflows.
export function mergeIntoGraph(
  newNodes: { name: string; type: NodeType }[],
  newEdges: { source: string; target: string; label?: string; steps?: string[] }[],
  meta?: { department?: GraphNode["department"]; workflowId?: string; riskLevel?: RiskLevel },
): string[] {
  const g = read();
  const byName = new Map(g.nodes.map((n) => [n.name.toLowerCase(), n]));
  const sharedNodeNames: string[] = [];

  for (const nn of newNodes) {
    const existing = byName.get(nn.name.toLowerCase());
    if (existing) {
      existing.type = normalizeNodeType(nn.type);
      if (meta?.department) existing.department = meta.department;
      // Track every workflow that references this node so shared nodes are visible.
      const ids = new Set(existing.workflowIds ?? (existing.workflowId ? [existing.workflowId] : []));
      if (meta?.workflowId && !ids.has(meta.workflowId)) {
        sharedNodeNames.push(existing.name);
        ids.add(meta.workflowId);
      }
      existing.workflowIds = Array.from(ids);
      if (meta?.workflowId && !existing.workflowId) existing.workflowId = meta.workflowId;
    } else {
      const node: GraphNode = {
        id: uid(),
        name: nn.name,
        type: normalizeNodeType(nn.type),
        department: meta?.department,
        riskLevel: meta?.riskLevel ?? "medium",
        workflowId: meta?.workflowId,
        workflowIds: meta?.workflowId ? [meta.workflowId] : [],
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
    if (!dup) g.edges.push({ id: uid(), source: s.id, target: t.id, label: ne.label, steps: ne.steps });
  }

  write(g);
  return sharedNodeNames;
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

// Node render size: humans are small, platforms larger, AI mid; all scale up
// further with the number of downstream dependencies (single points of failure).
export function nodeSize(graph: DependencyGraph, node: GraphNode): number {
  const base = node.type === "human" ? 2 : node.type === "platform" ? 6 : 4;
  return base + downstreamCount(graph, node.id) * 2.5;
}

// All nodes reachable from a starting node (ignoring edge direction) — used for "Isolate".
export function connectedComponent(graph: DependencyGraph, nodeId: string): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }
  const seen = new Set<string>([nodeId]);
  const stack = [nodeId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) { seen.add(next); stack.push(next); }
    }
  }
  return seen;
}

export const NODE_COLORS: Record<NodeType, string> = {
  ai: "#6C63FF",
  platform: "#3B82F6",
  human: "#00E5BE",
};
export const NODE_LABELS: Record<NodeType, string> = {
  ai: "AI",
  platform: "Platform / Service",
  human: "Staff / Position",
};
