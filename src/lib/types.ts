// KeepSake domain types

export type Severity = "low" | "medium" | "high" | "critical";
export type Department =
  | "Finance"
  | "Procurement"
  | "HR"
  | "IT"
  | "Customer Success"
  | "Operations"
  | "Legal"
  | "Marketing"
  | "Others";
export type Frequency = "Real-time" | "Daily" | "Weekly" | "Monthly" | "Ad-hoc";
export type Classification = "Public" | "Internal" | "Confidential" | "Restricted";

export interface SystemTouched {
  systemName: string;
  action: "Read" | "Write" | "Approve" | "Notify" | "Delete";
  dataType: string;
}
export interface DecisionNode {
  decisionPoint: string;
  options: string;
  chosen: string;
  reason: string;
}
export interface DataUsed {
  source: string;
  type: "PII" | "Financial" | "Operational" | "Public";
  volume: string;
}

export interface RiskFlag {
  flag_title: string;
  description: string;
  severity: Severity;
}
export interface AnalysisResult {
  risk_flags: RiskFlag[];
  resilience_score: number;
  resilience_reasoning: string;
  recommended_actions: string[];
}

export interface Workflow {
  id: string;
  name: string;
  department: Department;
  aiTool: string;
  frequency: Frequency;
  classification: Classification;
  taskDescription: string;
  expectedOutput: string;
  systems: SystemTouched[];
  decisions: DecisionNode[];
  data: DataUsed[];
  approvalsSkipped: boolean;
  skippedWhich?: string;
  skippedReason?: string;
  skippedRisk?: Severity;
  resilienceScore: number;
  analysis?: AnalysisResult;
  lastUpdated: string;
  lastEdited?: string; // ISO date of last manual edit
  lastHumanTouch: string; // ISO date
  automationPaused?: boolean;
  hasGuide?: boolean;
  code?: string; // uploaded/pasted automation code or pseudocode
  codeLanguage?: string;
}

export interface GuideStep {
  step_number: number;
  title: string;
  detailed_instruction: string;
  system_used: string;
  decision_points: string[];
  common_mistakes: string[];
}
export interface FallbackGuide {
  id: string;
  workflowId: string;
  workflowName: string;
  guide_title: string;
  estimated_time_manual: string;
  required_personnel: string[];
  required_system_access: string[];
  pre_conditions: string[];
  steps: GuideStep[];
  escalation_path: string;
  estimated_risk_if_skipped: string;
  generatedDate: string;
  lastReviewed?: string;
}

export interface DrillTask {
  task_id: string;
  task_title: string;
  task_description: string;
  is_critical: boolean;
  requires_system_access: string;
  estimated_minutes: number;
  hint: string;
}
export interface ScoringCriterion {
  criterion: string;
  points_available: number;
  description: string;
}
export interface DrillScenario {
  scenario_title: string;
  scenario_briefing: string;
  critical_question: string;
  drill_tasks: DrillTask[];
  scoring_criteria: ScoringCriterion[];
  total_points_available: number;
}
export interface DrillRecord {
  id: string;
  name: string;
  dateRun: string;
  agent: string;
  team: string;
  outageDuration: string;
  mode: string;
  readinessScore: number;
  grade: string;
  passed: boolean;
  scenario: DrillScenario;
  completedTasks: string[];
  debrief?: string;
}

// ============= Dependency Graph =============
export type NodeType = "ai" | "saas" | "internal" | "human" | "external" | "unknown";
export type RiskLevel = "high" | "medium" | "low";

export interface GraphNode {
  id: string;
  name: string;
  type: NodeType;
  department?: Department;
  riskLevel: RiskLevel;
  hasGuide?: boolean;
  reviewedAt?: string; // ISO date a manager last marked it updated
  workflowId?: string; // source workflow if generated from an upload
  // optional manual positions (edit mode)
  fx?: number;
  fy?: number;
  fz?: number;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}
export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Claude intake result for a single workflow upload
export interface IntakeResult {
  nodes: { name: string; type: NodeType }[];
  edges: { source: string; target: string; label?: string }[];
  risk_summary: string;
  risk_flags: RiskFlag[];
  resilience_score: number;
}

// ============= OpenAI Node-Failure Fallback Guide =============
export interface NodeGuideContact {
  role: string;
  action: string;
  script: string;
}
export interface CyberRisk {
  risk: string;
  mitigation: string;
}
export interface CommonMistake {
  mistake: string;
  prevention: string;
}
export interface NodeFallbackGuide {
  id: string;
  nodeId?: string;
  nodeName: string;
  guide_title: string;
  scenario: string;
  cybersecurity_risks: CyberRisk[];
  immediate_steps_15min: string[];
  steps_first_hour: string[];
  steps_first_day: string[];
  contacts: NodeGuideContact[];
  common_mistakes: CommonMistake[];
  recovery_checklist: string[];
  version: number;
  generatedDate: string;
}
