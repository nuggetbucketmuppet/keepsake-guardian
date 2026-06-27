# KeepSake — Map, Intake, Drills & Policy Upgrades

This covers all twelve requested changes across the data model, Upload a Workflow, Dependency Map, Failure Drills, and Policy Centre.

## 1. Data model (`src/lib/types.ts`, `src/lib/graph.ts`)
- Collapse `NodeType` to the three allowed kinds: `human` (staff/positions), `platform` (platforms/services/apps), `ai`. Map legacy `saas`/`internal`/`external`/`unknown` → `platform` on read so existing localStorage data still loads.
- Extend `GraphNode` with: `tags?: string[]`, `positionName?` reuse of `name` for humans, and for human nodes `contactName?`, `contactEmail?`, `contactPhone?` (optional, filled via node popup).
- Add `steps?: string[]` to `GraphEdge` so a branch can carry one or more sequential steps (rendered as distinct cylinder segments).
- Node sizing rule (in map): humans = small base; platforms = larger; size scales further by downstream-dependency count.

## 2. Upload a Workflow — platform detection + clarifying questions
- Add an "Auto-detect platforms" button on the intake form. It calls Claude (new `kind: "detect"` in `/api/claude` + `detectPlatforms()` helper) to suggest platform/service nodes from the pasted text/code, plus a list of clarifying questions (e.g. "Which platform handles invoicing in step 2?", "Is this the same Slack used in the Onboarding workflow?").
- Render suggested platforms as accept/dismiss chips and clarifying questions as inline fields the user answers before submission; answers are appended to the intake payload so the final graph parse is more accurate.
- Smart cross-workflow detection on submit: when merging, match nodes by normalized name against existing graph nodes (already partly done in `mergeIntoGraph`) and, when a match is found across a different `workflowId`, keep the single shared node and connect both workflows through it. Surface a toast noting shared nodes detected.

## 3. Dependency Map
- Node rendering: 3 types only, with the human-small / platform-large / dependency-scaled sizing.
- Human nodes show the **position name** as the node label; the **steps** live on the connecting branch, not the node.
- Branches drawn as cylinders/tubes; multi-step edges render each step as a distinct segment with its own label (3D: `linkThreeObject` cylinder per segment; 2D: segmented labels along the link).
- Node click drawer: for human nodes add editable optional Name / Email / Phone fields (saved via `updateNode`). Add a tag editor (add/remove chips) for all nodes.
- **Isolate view**: a per-selection "Isolate" toggle that filters the graph to the selected node plus its connected component, decluttering dense maps.
- **Send to Drill**: from the node drawer (and a multiselect toolbar), a button that navigates to Failure Drills pre-loaded with the selected node(s) as the down candidates.

## 4. Failure Drills
- Down candidates = **any** node (human, platform, ai) — not only AI. Replace the "AI agent" single select with a multi-select node picker sourced from the graph.
- Accept incoming preselected nodes from the map (via route search params) and start configured.
- Scenario generation payload updated to describe the chosen nodes and types.

## 5. Policy Centre
- **File upload**: add a file input on Add-a-Policy that reads `.txt/.md/.pdf-as-text/.docx-as-text`(plain text client read; for binary show name + paste fallback) into the content field.
- **Metadata**: capture `uploadedDate` (auto) and optional `version` / `effectiveDate` / `validUntil` fields; show them on policy rows.
- **Evaluate all**: a button that runs the selected policy against every workflow (or all policies × all workflows) sequentially with progress, instead of one-by-one.
- **Loading fixes**: disable the "Evaluate Compliance" tab while policies/evaluations are still loading; show a spinner.
- **Detail popup**: evaluation cards collapse to a compact summary row; clicking opens a windowed modal with the full findings/recommendations so the list isn't cluttered.

## Technical notes
- `types.ts` additions are all optional fields → no migration needed; add a `normalizeNodeType()` in `graph.ts` used by `read()`/`getSnapshot()`.
- New Claude `detect` prompt returns `{ suggested_platforms: {name,type}[], clarifying_questions: string[] }`.
- Drill ↔ Map handoff uses `navigate({ to: "/failure-drills", search: { nodes: id1,id2 } })`; add `validateSearch` to the drills route.
- Policy file reading stays client-side (FileReader); no new backend route required.

## Sequencing
1. Data model + `graph.ts` normalization & sizing helpers.
2. Dependency Map (types, sizing, cylinders, isolate, contact/tag editor, send-to-drill).
3. Upload a Workflow (detect + clarifying questions + shared-node detection).
4. Failure Drills (multi-node candidates + map handoff).
5. Policy Centre (upload, metadata, evaluate-all, loading guard, detail modal).
