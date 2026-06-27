import { useCallback, useSyncExternalStore } from "react";
import type { Workflow, FallbackGuide, DrillRecord, Policy, ComplianceEvaluation } from "./types";
import { seedWorkflows, seedGuides, seedDrills, seedPolicies, seedEvaluations } from "./seed";

const KEYS = {
  workflows: "keepsake.workflows",
  guides: "keepsake.guides",
  drills: "keepsake.drills",
  policies: "keepsake.policies",
  evaluations: "keepsake.evaluations",
  org: "keepsake.org",
} as const;

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
  emit();
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// Cache parsed snapshots per key so getSnapshot returns a stable reference
// until the underlying raw string actually changes. Without this,
// useSyncExternalStore sees a new object every render and loops forever.
const snapshotCache = new Map<string, { raw: string | null; value: unknown }>();

function getSnapshot<T>(key: string, fallback: T): T {
  const raw = typeof window === "undefined" ? null : localStorage.getItem(key);
  const cached = snapshotCache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;
  let value: T;
  try {
    value = raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    value = fallback;
  }
  snapshotCache.set(key, { raw, value });
  return value;
}

function useStore<T>(key: string, fallback: T): T {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot<T>(key, fallback),
    () => fallback,
  );
}

// ---- Workflows ----
export function useWorkflows(): Workflow[] {
  return useStore<Workflow[]>(KEYS.workflows, seedWorkflows);
}
export function saveWorkflow(wf: Workflow) {
  const list = read<Workflow[]>(KEYS.workflows, seedWorkflows);
  const idx = list.findIndex((w) => w.id === wf.id);
  if (idx >= 0) list[idx] = wf;
  else list.unshift(wf);
  write(KEYS.workflows, list);
}
export function deleteWorkflow(id: string) {
  write(KEYS.workflows, read<Workflow[]>(KEYS.workflows, seedWorkflows).filter((w) => w.id !== id));
}
export function updateWorkflow(id: string, patch: Partial<Workflow>) {
  const list = read<Workflow[]>(KEYS.workflows, seedWorkflows);
  const idx = list.findIndex((w) => w.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...patch };
    write(KEYS.workflows, list);
  }
}

// ---- Guides ----
export function useGuides(): FallbackGuide[] {
  return useStore<FallbackGuide[]>(KEYS.guides, seedGuides);
}
export function saveGuide(g: FallbackGuide) {
  const list = read<FallbackGuide[]>(KEYS.guides, seedGuides);
  const idx = list.findIndex((x) => x.id === g.id);
  if (idx >= 0) list[idx] = g;
  else list.unshift(g);
  write(KEYS.guides, list);
  updateWorkflow(g.workflowId, { hasGuide: true });
}
export function updateGuide(id: string, patch: Partial<FallbackGuide>) {
  const list = read<FallbackGuide[]>(KEYS.guides, seedGuides);
  const idx = list.findIndex((g) => g.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...patch };
    write(KEYS.guides, list);
  }
}

// ---- Drills ----
export function useDrills(): DrillRecord[] {
  return useStore<DrillRecord[]>(KEYS.drills, seedDrills);
}
export function saveDrill(d: DrillRecord) {
  const list = read<DrillRecord[]>(KEYS.drills, seedDrills);
  list.unshift(d);
  write(KEYS.drills, list);
}

// ---- Policies ----
export function usePolicies(): Policy[] {
  return useStore<Policy[]>(KEYS.policies, seedPolicies);
}
export function savePolicy(p: Policy) {
  const list = read<Policy[]>(KEYS.policies, seedPolicies);
  const idx = list.findIndex((x) => x.id === p.id);
  if (idx >= 0) list[idx] = p;
  else list.unshift(p);
  write(KEYS.policies, list);
}
export function deletePolicy(id: string) {
  write(KEYS.policies, read<Policy[]>(KEYS.policies, seedPolicies).filter((p) => p.id !== id));
}

// ---- Compliance evaluations ----
export function useEvaluations(): ComplianceEvaluation[] {
  return useStore<ComplianceEvaluation[]>(KEYS.evaluations, seedEvaluations);
}
export function saveEvaluation(e: ComplianceEvaluation) {
  const list = read<ComplianceEvaluation[]>(KEYS.evaluations, seedEvaluations);
  list.unshift(e);
  write(KEYS.evaluations, list);
}

// ---- Account / Organisation ----
// The signed-in account. Settings stays in sync with this organisation.
export const ACCOUNT = {
  name: "Acme Corp",
  email: "alex.chen@acme.com",
  initials: "AC",
} as const;

export function useOrg(): string {
  return useStore<string>(KEYS.org, ACCOUNT.name);
}
export function setOrg(name: string) {
  write(KEYS.org, name);
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export function useRefresh() {
  return useCallback(() => emit(), []);
}
