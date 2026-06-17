import * as path from 'node:path';

export const SPEC_DIR_NAME = '.specforge' as const;
export const SPEC_USER_DIR_NAME = '.specforge' as const;

export const legacyPaths = {
  specsReadOnly: 'specs',
  manifest: 'manifest.json',
  config: 'config',
  configFiles: {
    projectRules: 'config/project-rules.md',
    prodEnv: 'config/prod-environment.md',
    project: 'config/project.json',
    riskPolicy: 'config/risk_policy.json',
    skillFragments: 'config/skill_fragments.json',
  },
  knowledge: 'knowledge',
  knowledgeGraph: 'knowledge/graph.json',
} as const;

export const LAYOUT = {
  // CLI legacy compatibility: older CLI doctor/startup paths still read .specforge/manifest.json.
  // New project spec truth source remains project/spec_manifest.json.
  manifest: legacyPaths.manifest,

  project: 'project',
  projectFiles: {
    specManifest: 'project/spec_manifest.json',
    extensionRegistry: 'project/extension_registry.json',
    requirementsIndex: 'project/requirements_index.md',
    designIndex: 'project/design_index.md',
    architecture: 'project/architecture.md',
    glossary: 'project/glossary.md',
    decisions: 'project/decisions.md',
    traceMatrix: 'project/trace_matrix.md',
    modulesRoot: 'project/modules',
  },

  workItems: 'work-items',
  workItemFiles: {
    workItemJson: 'work_item.json',
    intake: 'intake.md',
    changeClassification: 'change_classification.md',
    impactAnalysis: 'impact_analysis.md',
    triggerResult: 'trigger_result.json',
    requirementsDelta: 'requirements_delta.md',
    designDelta: 'design_delta.md',
    tasks: 'tasks.md',
    traceDelta: 'trace_delta.md',
    candidateManifest: 'candidate_manifest.json',
    candidates: 'candidates',
    gates: 'gates',
    gateSummary: 'gate_summary.md',
    userDecision: 'user_decision.json',
    verificationReport: 'verification_report.md',
    mergeReport: 'merge_report.md',
    evidence: 'evidence',
    evidenceManifest: 'evidence/evidence_manifest.json',
    extensionRequest: 'extension_request.json',
    extensionDelta: 'extension_delta.md',
  },

  runtime: 'runtime',
  runtimeFiles: {
    wal: 'runtime/wal.jsonl',
    state: 'runtime/state.json',
    checkpoints: 'runtime/checkpoints',
    logs: 'runtime/logs',
  },
} as const;

export type LayoutKey = keyof typeof LAYOUT;

export const legacyUserLayoutReadOnly = {
  runtime: 'runtime',
  runtimeHandshake: 'runtime/handshake.json',
  runtimeState: 'runtime/state.json',
  runtimeEvents: 'runtime/events.jsonl',
  runtimeDaemonLock: 'runtime/daemon.lock',
  hostProfile: 'host-profile.json',
  logs: 'logs',
  projects: 'projects',
  templates: 'templates',
  backups: 'backups',
} as const;

export function resolveProjectPath(projectRoot: string, key: LayoutKey, ...subpath: string[]): string {
  const value = LAYOUT[key];
  const segment = typeof value === 'string' ? value : key;
  return path.join(projectRoot, SPEC_DIR_NAME, segment, ...subpath);
}

export function projectRoot(projectRoot: string): string {
  return resolveProjectPath(projectRoot, 'project');
}

export function projectSpecManifest(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.specManifest);
}

export function projectExtensionRegistry(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.extensionRegistry);
}

export function projectRequirementsIndex(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.requirementsIndex);
}

export function projectDesignIndex(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.designIndex);
}

export function projectArchitecture(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.architecture);
}

export function projectGlossary(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.glossary);
}

export function projectDecisions(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.decisions);
}

export function projectTraceMatrix(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.traceMatrix);
}

export function projectModulesRoot(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.modulesRoot);
}

export function moduleRoot(projectRoot: string, moduleName: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, 'project', 'modules', moduleName);
}

export function moduleJson(projectRoot: string, moduleName: string): string {
  return path.join(moduleRoot(projectRoot, moduleName), 'module.json');
}

export function moduleRequirements(projectRoot: string, moduleName: string): string {
  return path.join(moduleRoot(projectRoot, moduleName), 'requirements.md');
}

export function moduleDesign(projectRoot: string, moduleName: string): string {
  return path.join(moduleRoot(projectRoot, moduleName), 'design.md');
}

export function moduleTrace(projectRoot: string, moduleName: string): string {
  return path.join(moduleRoot(projectRoot, moduleName), 'trace.md');
}

export function workItemsRoot(projectRoot: string): string {
  return resolveProjectPath(projectRoot, 'workItems');
}

export function workItemRoot(projectRoot: string, workItemId: string): string {
  return path.join(resolveProjectPath(projectRoot, 'workItems'), workItemId);
}

export function workItemJson(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'work_item.json');
}

export function workItemIntake(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'intake.md');
}

export function workItemRuntimeLog(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'runtime.log');
}

export function workItemCandidateManifest(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'candidate_manifest.json');
}

export function workItemCandidatesRoot(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'candidates');
}

export function workItemGatesRoot(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'gates');
}

export function workItemGateSummary(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'gate_summary.md');
}

export function workItemUserDecision(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'user_decision.json');
}

export function workItemVerificationReport(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'verification_report.md');
}

export function workItemMergeReport(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'merge_report.md');
}

export function workItemEvidenceRoot(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'evidence');
}

export function workItemEvidenceManifest(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'evidence', 'evidence_manifest.json');
}

export function validatePathPolicy(inputPath: string): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  if (inputPath.startsWith('/') || /^[A-Za-z]:/.test(inputPath)) violations.push('absolute_path_not_allowed');
  if (inputPath.includes('..')) violations.push('parent_traversal_not_allowed');
  if (inputPath.includes('~')) violations.push('home_shorthand_not_allowed');
  if (inputPath.includes('\\')) violations.push('backslash_not_allowed');
  return { valid: violations.length === 0, violations };
}

export function isProjectSpecPath(inputPath: string): boolean {
  return inputPath.replace(/\\/g, '/').startsWith('.specforge/project/');
}

export function isWorkItemPath(inputPath: string): boolean {
  return inputPath.replace(/\\/g, '/').startsWith('.specforge/work-items/');
}

export function isLegacySpecPath(inputPath: string): boolean {
  return inputPath.replace(/\\/g, '/').startsWith('.specforge/specs/');
}
