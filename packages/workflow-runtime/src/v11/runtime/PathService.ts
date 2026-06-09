/**
 * PathService.ts — SpecForge v1.1 Path Service implementation
 *
 * Provides unified path generation for all .specforge/ paths per v1.1 standard.
 * All paths are project-root-relative using POSIX forward slashes.
 *
 * Requirements: 1.1, 1.2, 1.3
 */

/** The canonical SpecForge directory name */
export const SPEC_DIR_NAME = '.specforge';

/**
 * PathService — generates all v1.1 compliant paths.
 *
 * All returned paths use POSIX forward slashes regardless of platform.
 */
export class PathService {
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  // ---- Helpers ----

  /** Join path segments with POSIX forward slashes */
  posixJoin(...segments: string[]): string {
    return segments.join('/');
  }

  /** Get the .specforge/ base path relative to project root */
  specDir(): string {
    return this.posixJoin(this.projectRoot, SPEC_DIR_NAME);
  }

  // ---- Project Spec Paths (Requirement 1.1) ----

  /** `.specforge/project/` */
  projectDir(): string {
    return this.posixJoin(this.specDir(), 'project');
  }

  /** `.specforge/project/spec_manifest.json` */
  specManifestPath(): string {
    return this.posixJoin(this.projectDir(), 'spec_manifest.json');
  }

  /** `.specforge/project/extension_registry.json` */
  extensionRegistryPath(): string {
    return this.posixJoin(this.projectDir(), 'extension_registry.json');
  }

  /** `.specforge/project/requirements_index.md` */
  requirementsIndexPath(): string {
    return this.posixJoin(this.projectDir(), 'requirements_index.md');
  }

  /** `.specforge/project/design_index.md` */
  designIndexPath(): string {
    return this.posixJoin(this.projectDir(), 'design_index.md');
  }

  /** `.specforge/project/architecture.md` */
  architecturePath(): string {
    return this.posixJoin(this.projectDir(), 'architecture.md');
  }

  /** `.specforge/project/glossary.md` */
  glossaryPath(): string {
    return this.posixJoin(this.projectDir(), 'glossary.md');
  }

  /** `.specforge/project/decisions.md` */
  decisionsPath(): string {
    return this.posixJoin(this.projectDir(), 'decisions.md');
  }

  /** `.specforge/project/trace_matrix.md` */
  traceMatrixPath(): string {
    return this.posixJoin(this.projectDir(), 'trace_matrix.md');
  }

  /** `.specforge/project/modules/` */
  modulesDir(): string {
    return this.posixJoin(this.projectDir(), 'modules');
  }

  /** `.specforge/project/modules/<moduleName>/` */
  moduleDir(moduleName: string): string {
    return this.posixJoin(this.modulesDir(), moduleName);
  }

  /** `.specforge/project/modules/<moduleName>/module.json` */
  moduleJsonPath(moduleName: string): string {
    return this.posixJoin(this.moduleDir(moduleName), 'module.json');
  }

  /** `.specforge/project/modules/<moduleName>/requirements.md` */
  moduleRequirementsPath(moduleName: string): string {
    return this.posixJoin(this.moduleDir(moduleName), 'requirements.md');
  }

  /** `.specforge/project/modules/<moduleName>/design.md` */
  moduleDesignPath(moduleName: string): string {
    return this.posixJoin(this.moduleDir(moduleName), 'design.md');
  }

  /** `.specforge/project/modules/<moduleName>/trace.md` */
  moduleTracePath(moduleName: string): string {
    return this.posixJoin(this.moduleDir(moduleName), 'trace.md');
  }

  // ---- Work Item Paths (Requirement 1.2) ----

  /** `.specforge/work-items/` */
  workItemsDir(): string {
    return this.posixJoin(this.specDir(), 'work-items');
  }

  /** `.specforge/work-items/<workItemId>/` */
  workItemDir(workItemId: string): string {
    return this.posixJoin(this.workItemsDir(), workItemId);
  }

  /** `.specforge/work-items/<workItemId>/work_item.json` */
  workItemMetadataPath(workItemId: string): string {
    return this.posixJoin(this.workItemDir(workItemId), 'work_item.json');
  }

  /** `.specforge/work-items/<workItemId>/intake.md` */
  workItemIntakePath(workItemId: string): string {
    return this.posixJoin(this.workItemDir(workItemId), 'intake.md');
  }

  /** `.specforge/work-items/<workItemId>/candidates/` */
  candidatesDir(workItemId: string): string {
    return this.posixJoin(this.workItemDir(workItemId), 'candidates');
  }

  /** `.specforge/work-items/<workItemId>/candidates/<fileName>` */
  candidatePath(workItemId: string, fileName: string): string {
    return this.posixJoin(this.candidatesDir(workItemId), fileName);
  }

  /** `.specforge/work-items/<workItemId>/candidate_manifest.json` */
  candidateManifestPath(workItemId: string): string {
    return this.posixJoin(this.workItemDir(workItemId), 'candidate_manifest.json');
  }

  /** `.specforge/work-items/<workItemId>/gates/` */
  gatesDir(workItemId: string): string {
    return this.posixJoin(this.workItemDir(workItemId), 'gates');
  }

  /** `.specforge/work-items/<workItemId>/gates/<gateId>.json` */
  gatePath(workItemId: string, gateId: string): string {
    return this.posixJoin(this.gatesDir(workItemId), `${gateId}.json`);
  }

  /** `.specforge/work-items/<workItemId>/gate_summary.md` */
  gateSummaryPath(workItemId: string): string {
    return this.posixJoin(this.workItemDir(workItemId), 'gate_summary.md');
  }

  /** `.specforge/work-items/<workItemId>/user_decision.json` */
  userDecisionPath(workItemId: string): string {
    return this.posixJoin(this.workItemDir(workItemId), 'user_decision.json');
  }

  /** `.specforge/work-items/<workItemId>/merge_report.md` */
  mergeReportPath(workItemId: string): string {
    return this.posixJoin(this.workItemDir(workItemId), 'merge_report.md');
  }

  /** `.specforge/work-items/<workItemId>/verification_report.md` */
  verificationReportPath(workItemId: string): string {
    return this.posixJoin(this.workItemDir(workItemId), 'verification_report.md');
  }

  /** `.specforge/work-items/<workItemId>/evidence/` */
  evidenceDir(workItemId: string): string {
    return this.posixJoin(this.workItemDir(workItemId), 'evidence');
  }

  /** `.specforge/work-items/<workItemId>/evidence/evidence_manifest.json` */
  evidenceManifestPath(workItemId: string): string {
    return this.posixJoin(this.evidenceDir(workItemId), 'evidence_manifest.json');
  }

  /** `.specforge/work-items/<workItemId>/extension_request.json` */
  extensionRequestPath(workItemId: string): string {
    return this.posixJoin(this.workItemDir(workItemId), 'extension_request.json');
  }

  /** `.specforge/work-items/<workItemId>/extension_delta.md` */
  extensionDeltaPath(workItemId: string): string {
    return this.posixJoin(this.workItemDir(workItemId), 'extension_delta.md');
  }

  // ---- Runtime Paths (Requirement 1.3) ----

  /** `.specforge/runtime/` */
  runtimeDir(): string {
    return this.posixJoin(this.specDir(), 'runtime');
  }

  /** `.specforge/runtime/state.json` */
  runtimeStatePath(): string {
    return this.posixJoin(this.runtimeDir(), 'state.json');
  }

  /** `.specforge/runtime/events.jsonl` */
  runtimeEventsPath(): string {
    return this.posixJoin(this.runtimeDir(), 'events.jsonl');
  }

  /** `.specforge/runtime/checkpoints/<checkpointId>` */
  runtimeCheckpointPath(checkpointId: string): string {
    return this.posixJoin(this.runtimeDir(), 'checkpoints', checkpointId);
  }

  /** `.specforge/runtime/logs/` */
  runtimeLogsDir(): string {
    return this.posixJoin(this.runtimeDir(), 'logs');
  }

  /** `.specforge/runtime/wal.jsonl` */
  runtimeWalPath(): string {
    return this.posixJoin(this.runtimeDir(), 'wal.jsonl');
  }

  // ---- Legacy paths (read-only) ----

  /** `.specforge/specs/` — legacy specs directory (read-only) */
  legacySpecsDir(): string {
    return this.posixJoin(this.specDir(), 'specs');
  }

  /** Check if a path is a legacy spec path */
  isLegacySpecPath(inputPath: string): boolean {
    const normalized = inputPath.replace(/\\/g, '/');
    return normalized.includes('.specforge/specs/') || normalized.startsWith('specs/');
  }

  /** Check if a path is a project spec path */
  isProjectSpecPath(inputPath: string): boolean {
    const normalized = inputPath.replace(/\\/g, '/');
    return normalized.includes('.specforge/project/') || normalized.startsWith('project/');
  }

  /** Check if a path is a work item path */
  isWorkItemPath(inputPath: string): boolean {
    const normalized = inputPath.replace(/\\/g, '/');
    return normalized.includes('.specforge/work-items/') || normalized.startsWith('work-items/');
  }
}
