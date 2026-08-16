/**
 * merge-runner-v11.ts - v1.1 Spec Merge Runner
 *
 * P0 governance:
 * - Merge must use the same manifest normalization rules as approval.
 * - Merge must not infer or mutate candidate_manifest.json after approval.
 * - Spec-changing workflows must merge at least one Project Spec artifact.
 * - evidence_only / no_project_spec_change workflows never merge Work Item evidence.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  validateApprovedUserDecisionForMerge,
  entriesSemanticallyEqual,
  inferManifestEntries,
  normalizeSlash,
} from './governance-invariants-v11.js';
import {
  normalizeProjectSpecTargetPath,
  readDeclaredProjectSpecTargetPaths,
} from './path-policy.js';
import {
  canonicalProjectSpecModuleEntry,
  ContractRegistrySchema,
  extractModuleFromDdId,
  moduleCodeFromProjectSpecPath,
  resolveSpecModuleIdentity,
} from '@specforge/types';
import { readUnifiedContracts } from './contracts-registry.js';
import {
  applyGovernanceTraceDelta,
  parseGovernanceTrace,
  parseGovernanceTraceDelta,
  renderGovernanceModuleTrace,
  renderGovernanceTraceDocument,
  type GovernanceTraceEdge,
} from './governance-trace-model.js';
import { recordAtomicSpecMergeProjectWrites } from './atomic-spec-merge-write-provenance.js';

export interface MergeInput {
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  candidateManifestPath: string;
  userDecisionPath: string;
}

export interface MergeEntryResult {
  candidate_path: string;
  target_path: string;
  operation: string;
  status: 'success' | 'skipped' | 'failed' | 'not_applicable';
  hash_match: boolean;
  error?: string;
}

export interface MergeResult {
  success: boolean;
  merged_files: MergeEntryResult[];
  spec_manifest_updated: boolean;
  project_spec_version: string;
  errors: string[];
  status?: 'success' | 'failed' | 'not_applicable';
  reason?: string;
  rolled_back?: boolean;
}

type ManifestEntry = {
  candidate_path: string;
  target_path: string;
  operation: string;
  type?: string;
  inferred?: boolean;
  normalized?: boolean;
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function computeFileHash(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath);
    return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}

async function readJsonFile(filePath: string): Promise<any> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

async function readCurrentProjectSpecVersion(projectRoot: string): Promise<string> {
  const projectSpecManifestPath = path.join(
    projectRoot,
    '.specforge',
    'project',
    'spec_manifest.json'
  );
  try {
    const specManifest = await readJsonFile(projectSpecManifestPath);
    return specManifest.project_spec_version ?? 'PSV-0000';
  } catch {
    return 'PSV-0000';
  }
}

function isEvidenceOnlyNoProjectSpecChange(manifest: any): boolean {
  return (
    manifest?.no_project_spec_change === true ||
    String(manifest?.project_integration_effect ?? '')
      .trim()
      .toLowerCase() === 'evidence_only'
  );
}

function isNoProjectSpecMerge(manifest: any): boolean {
  return (
    manifest?.workflow_path === 'code_only_fast_path' || isEvidenceOnlyNoProjectSpecChange(manifest)
  );
}

function isSubPath(child: string, parent: string): boolean {
  const c = path.resolve(child).toLowerCase();
  const p = path.resolve(parent).toLowerCase();
  return c === p || c.startsWith(p + path.sep.toLowerCase()) || c.startsWith(p + '/');
}

function normalizeEntryForMerge(entry: ManifestEntry): ManifestEntry {
  return {
    candidate_path: normalizeSlash(entry.candidate_path),
    target_path: normalizeSlash(entry.target_path),
    operation: entry.operation ?? 'replace',
    type: entry.type,
    inferred: Boolean(entry.inferred),
    normalized: Boolean(entry.normalized),
  };
}

function normalizeProjectTargetPathV12(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}
function inferModuleCodeFromProjectTarget(value: unknown): string | null {
  return moduleCodeFromProjectSpecPath(normalizeProjectTargetPathV12(value));
}
async function registerMergedProjectModules(
  specManifest: any,
  projectRoot: string,
  replaceLegacyModuleEntries = false
): Promise<void> {
  if (!specManifest || typeof specManifest !== 'object') return;
  const targets = Array.isArray(specManifest.last_merged_targets)
    ? specManifest.last_merged_targets
    : [];
  const moduleCodes = Array.from(
    new Set(
      targets
        .map((target: unknown) => {
          const moduleCode = inferModuleCodeFromProjectTarget(target);
          const normalizedTarget = normalizeProjectTargetPathV12(target);
          return moduleCode &&
            normalizedTarget.startsWith(`.specforge/project/modules/${moduleCode}/`)
            ? moduleCode
            : null;
        })
        .filter(Boolean)
    )
  ) as string[];

  if (moduleCodes.length === 0) {
    specManifest.modules = Array.isArray(specManifest.modules) ? specManifest.modules : [];
    return;
  }

  const modules = Array.isArray(specManifest.modules) ? [...specManifest.modules] : [];
  for (const moduleCode of moduleCodes) {
    const existingIndex = modules.findIndex(entry => {
      const resolution = resolveSpecModuleIdentity(entry);
      return resolution.valid && resolution.moduleCode === moduleCode;
    });
    const existing =
      existingIndex >= 0 && modules[existingIndex] && typeof modules[existingIndex] === 'object'
        ? modules[existingIndex]
        : {};

    const moduleRoot = path.join(
      projectRoot,
      '.specforge',
      'project',
      'modules',
      moduleCode
    );
    let moduleDefinition: any = null;
    try {
      moduleDefinition = await readJsonFile(path.join(moduleRoot, 'module.json'));
    } catch {
      moduleDefinition = null;
    }
    const moduleCodePaths: string[] = Array.isArray(moduleDefinition?.code_paths)
      ? Array.from(
          new Set<string>(
            moduleDefinition.code_paths
              .map((value: unknown) => String(value ?? '').trim())
              .filter(Boolean)
          )
        )
      : [];
    const existingCodePaths: string[] = Array.isArray((existing as any).code_paths)
      ? Array.from(
          new Set<string>(
            (existing as any).code_paths
              .map((value: unknown) => String(value ?? '').trim())
              .filter(Boolean)
          )
        )
      : [];
    const codePaths = moduleCodePaths.length > 0 ? moduleCodePaths : existingCodePaths;
    const contractsPath = path.join(moduleRoot, 'contracts.json');
    const defaultModule = String(specManifest.default_module ?? '').trim().toUpperCase();
    const governanceOnlyDefault =
      moduleCode === defaultModule &&
      Array.isArray(moduleDefinition?.code_paths) &&
      moduleCodePaths.length === 0;
    const governanceReady =
      (codePaths.length > 0 || governanceOnlyDefault) && (await fileExists(contractsPath));

    const canonicalEntry = canonicalProjectSpecModuleEntry(moduleCode, {
      include_governance: governanceReady,
      code_paths: codePaths,
    });

    // Normal merges preserve forward-compatible fields. A governed Project
    // Spec repair replaces the legacy record so deprecated aliases do not survive.
    const mergedEntry = replaceLegacyModuleEntries
      ? canonicalEntry
      : { ...existing, ...canonicalEntry };
    if (governanceReady) {
      (mergedEntry as any).contracts =
        `.specforge/project/modules/${moduleCode}/contracts.json`;
      (mergedEntry as any).code_paths = codePaths;
    }

    if (existingIndex >= 0) modules[existingIndex] = mergedEntry;
    else modules.push(mergedEntry);
  }
  specManifest.modules = modules;
}

const NEW_MODULE_REQUIRED_FILES = ['module.json', 'requirements.md', 'design.md', 'contracts.json', 'trace.md'] as const;

const PROJECT_SPEC_REPAIR_REQUIRED_FILES = [
  'module.json',
  'requirements.md',
  'design.md',
  'trace.md',
] as const;

async function isGovernedNewModuleAdmission(
  workItemDir: string,
  workflowPath: unknown
): Promise<boolean> {
  if (workflowPath === 'architecture_change_path' || workflowPath === 'spec_migration_path') {
    return true;
  }
  if (workflowPath !== 'requirement_change_path') return false;
  try {
    const trigger = await readJsonFile(path.join(workItemDir, 'trigger_result.json'));
    return (
      trigger?.classification?.architecture_changed === true ||
      trigger?.classification?.module_boundary_changed === true
    );
  } catch {
    return false;
  }
}

async function isProjectSpecRepairMerge(
  workItemDir: string,
  workflowPath: unknown
): Promise<boolean> {
  return (
    workflowPath === 'spec_migration_path' &&
    (await fileExists(path.join(workItemDir, 'project_spec_repair_plan.json')))
  );
}

async function validateGovernedNewModuleTargets(input: {
  projectRoot: string;
  workItemDir: string;
  workflowPath: unknown;
  entries: ManifestEntry[];
  declaredTargetPaths: Set<string>;
}): Promise<{ allowedTargets: Set<string>; errors: string[] }> {
  const allowedTargets = new Set<string>();
  const errors: string[] = [];
  const governedModuleAdmission = await isGovernedNewModuleAdmission(
    input.workItemDir,
    input.workflowPath
  );
  const projectSpecRepair = await isProjectSpecRepairMerge(
    input.workItemDir,
    input.workflowPath
  );

  const specManifestPath = path.join(
    input.projectRoot,
    '.specforge',
    'project',
    'spec_manifest.json'
  );
  let modules: unknown[] = [];
  try {
    const specManifest = await readJsonFile(specManifestPath);
    modules = Array.isArray(specManifest?.modules) ? specManifest.modules : [];
  } catch (error: any) {
    errors.push(`Cannot validate Project Spec module registry: ${error.message}`);
  }

  const resolutions = modules.map(entry => resolveSpecModuleIdentity(entry));
  const registryErrors = resolutions.flatMap(resolution => resolution.errors);
  if (registryErrors.length > 0) {
    errors.push(`MODULE_REGISTRY_INVALID: ${registryErrors.join('; ')}`);
  }

  const entriesByGovernedModule = new Map<string, Map<string, ManifestEntry>>();
  for (const entry of input.entries) {
    const target = normalizeProjectSpecTargetPath(entry.target_path);
    if (!target || input.declaredTargetPaths.has(target)) continue;

    const moduleCode = moduleCodeFromProjectSpecPath(target);
    if (!moduleCode) continue;

    const canonicalRoot = `.specforge/project/modules/${moduleCode}/`;
    if (!target.startsWith(canonicalRoot)) {
      errors.push(
        `New module target must use canonical MODULE_CODE directory ${canonicalRoot}: ${target}`
      );
      continue;
    }

    if (!governedModuleAdmission) {
      errors.push(
        `Only architecture_change_path or spec_migration_path, or a governed requirement_change_path with architecture/module-boundary impact, may introduce module ${moduleCode}: ${target}`
      );
      continue;
    }

    if (entry.operation === 'delete') {
      errors.push(`A new module cannot be introduced with delete operation: ${target}`);
      continue;
    }

    const filename = target.slice(canonicalRoot.length);
    const supportedFiles = projectSpecRepair
      ? PROJECT_SPEC_REPAIR_REQUIRED_FILES
      : NEW_MODULE_REQUIRED_FILES;

    if (!supportedFiles.includes(filename as never)) {
      errors.push(`Unsupported new module target for ${moduleCode}: ${target}`);
      continue;
    }

    const moduleEntries =
      entriesByGovernedModule.get(moduleCode) ?? new Map<string, ManifestEntry>();
    moduleEntries.set(filename, entry);
    entriesByGovernedModule.set(moduleCode, moduleEntries);
  }

  for (const [moduleCode, moduleEntries] of entriesByGovernedModule) {
    const requiredFiles = projectSpecRepair
      ? PROJECT_SPEC_REPAIR_REQUIRED_FILES
      : NEW_MODULE_REQUIRED_FILES;
    const missing = requiredFiles.filter(filename => !moduleEntries.has(filename));

    if (missing.length > 0) {
      errors.push(
        `New module ${moduleCode} requires one approved candidate for each required file; missing: ${missing.join(', ')}`
      );
      continue;
    }

    const definitionEntry = moduleEntries.get('module.json') as ManifestEntry;
    const definitionPath = path.resolve(input.workItemDir, definitionEntry.candidate_path);
    if (!isSubPath(definitionPath, path.resolve(input.workItemDir))) {
      errors.push(`New module ${moduleCode} module.json candidate is outside the Work Item`);
      continue;
    }

    let definition: any;
    try {
      definition = await readJsonFile(definitionPath);
      const identity = resolveSpecModuleIdentity(definition);
      if (!identity.valid || identity.moduleCode !== moduleCode) {
        errors.push(
          `New module ${moduleCode} module.json must declare the same canonical module_code: ${identity.errors.join('; ') || String(identity.moduleCode)}`
        );
        continue;
      }
    } catch (error: any) {
      errors.push(
        `Cannot validate new module ${moduleCode} module.json candidate: ${error.message}`
      );
      continue;
    }

    if (projectSpecRepair) {
      for (const filename of PROJECT_SPEC_REPAIR_REQUIRED_FILES) {
        allowedTargets.add(`.specforge/project/modules/${moduleCode}/${filename}`);
      }
      continue;
    }

    const codePaths = Array.isArray(definition?.code_paths)
      ? definition.code_paths
          .map((value: unknown) => String(value ?? '').trim())
          .filter(Boolean)
      : [];
    if (codePaths.length === 0) {
      errors.push(`New module ${moduleCode} module.json must declare non-empty code_paths`);
      continue;
    }

    const contractsEntry = moduleEntries.get('contracts.json') as ManifestEntry;
    const contractsPath = path.resolve(input.workItemDir, contractsEntry.candidate_path);
    if (!isSubPath(contractsPath, path.resolve(input.workItemDir))) {
      errors.push(`New module ${moduleCode} contracts.json candidate is outside the Work Item`);
      continue;
    }

    try {
      const contracts = await readJsonFile(contractsPath);
      const registry = ContractRegistrySchema.safeParse(contracts?.contracts);
      if (
        contracts?.schema_version !== '1.0' ||
        String(contracts?.owner_module ?? '').trim() !== moduleCode ||
        !registry.success
      ) {
        errors.push(
          `New module ${moduleCode} contracts.json must declare schema_version=1.0, owner_module=${moduleCode}, and a valid contracts registry`
        );
        continue;
      }
    } catch (error: any) {
      errors.push(
        `Cannot validate new module ${moduleCode} contracts.json candidate: ${error.message}`
      );
      continue;
    }

    for (const filename of NEW_MODULE_REQUIRED_FILES) {
      allowedTargets.add(`.specforge/project/modules/${moduleCode}/${filename}`);
    }
  }

  return { allowedTargets, errors };
}


type MergeFileSnapshot = {
  filePath: string;
  existed: boolean;
  content: Buffer | null;
};

async function snapshotFiles(filePaths: Iterable<string>): Promise<MergeFileSnapshot[]> {
  const snapshots: MergeFileSnapshot[] = [];
  for (const filePath of Array.from(new Set(Array.from(filePaths).map(value => path.resolve(value))))) {
    try {
      snapshots.push({ filePath, existed: true, content: await fs.readFile(filePath) });
    } catch {
      snapshots.push({ filePath, existed: false, content: null });
    }
  }
  return snapshots;
}

async function restoreSnapshots(snapshots: MergeFileSnapshot[]): Promise<string[]> {
  const errors: string[] = [];
  for (const snapshot of [...snapshots].reverse()) {
    try {
      if (snapshot.existed) {
        await fs.mkdir(path.dirname(snapshot.filePath), { recursive: true });
        await fs.writeFile(snapshot.filePath, snapshot.content as Buffer);
      } else {
        await fs.rm(snapshot.filePath, { force: true });
      }
    } catch (error) {
      errors.push(`${snapshot.filePath}: ${(error as Error).message}`);
    }
  }
  return errors;
}

function isProjectTraceTarget(targetPath: string): boolean {
  return normalizeProjectSpecTargetPath(targetPath) === '.specforge/project/trace_matrix.md';
}

function targetModuleTrace(targetPath: string): string | null {
  const normalized = normalizeProjectSpecTargetPath(targetPath);
  const moduleCode = moduleCodeFromProjectSpecPath(normalized);
  return moduleCode && normalized === `.specforge/project/modules/${moduleCode}/trace.md`
    ? moduleCode
    : null;
}

function designOwnersFromTrace(edges: Iterable<GovernanceTraceEdge>): Map<string, string> {
  const owners = new Map<string, string>();
  for (const edge of edges) {
    for (const id of [edge.from, edge.to]) {
      const moduleCode = extractModuleFromDdId(id);
      if (moduleCode) owners.set(id, moduleCode);
    }
  }
  return owners;
}

async function governedModuleCodes(projectRoot: string, entries: ManifestEntry[]): Promise<string[]> {
  const result = new Set<string>();
  try {
    const manifest = await readJsonFile(
      path.join(projectRoot, '.specforge', 'project', 'spec_manifest.json'),
    );
    for (const raw of Array.isArray(manifest?.modules) ? manifest.modules : []) {
      const moduleCode = String(raw?.module_code ?? raw?.module ?? '').trim().toUpperCase();
      if (moduleCode) result.add(moduleCode);
    }
  } catch {
    // New Project Spec bootstrap.
  }
  for (const entry of entries) {
    const moduleCode = moduleCodeFromProjectSpecPath(
      normalizeProjectSpecTargetPath(entry.target_path),
    );
    if (moduleCode) result.add(moduleCode);
  }
  return Array.from(result).sort();
}

async function projectTraceProjection(input: {
  projectRoot: string;
  workItemDir: string;
  entries: ManifestEntry[];
}): Promise<{
  targeted: boolean;
  governanceChanged: boolean;
  governanceActive: boolean;
  edges: GovernanceTraceEdge[];
  content: string | null;
  errors: string[];
}> {
  const traceEntry = input.entries.find(entry => isProjectTraceTarget(entry.target_path));
  const currentPath = path.join(
    input.projectRoot,
    '.specforge',
    'project',
    'trace_matrix.md',
  );
  let currentContent = '';
  try {
    currentContent = await fs.readFile(currentPath, 'utf-8');
  } catch {
    // Empty current Trace is valid during bootstrap.
  }
  const current = parseGovernanceTrace(currentContent, currentPath);
  const currentGovernanceActive = current.marked_section || current.edges.length > 0;
  if (!traceEntry) {
    return {
      targeted: false,
      governanceChanged: false,
      governanceActive: currentGovernanceActive,
      edges: current.edges,
      content: null,
      errors: current.issues.map(issue => issue.message),
    };
  }

  if (traceEntry.operation === 'delete') {
    return {
      targeted: true,
      governanceChanged: false,
      governanceActive: currentGovernanceActive,
      edges: current.edges,
      content: null,
      errors: [
        'The canonical Project Trace Matrix cannot be deleted; use explicit REMOVE operations in the Governance Relation Delta section.',
      ],
    };
  }

  const candidatePath = path.resolve(input.workItemDir, traceEntry.candidate_path);
  let deltaContent = '';
  try {
    deltaContent = await fs.readFile(candidatePath, 'utf-8');
  } catch (error) {
    return {
      targeted: true,
      governanceChanged: false,
      governanceActive: currentGovernanceActive,
      edges: current.edges,
      content: null,
      errors: [`Cannot read Trace Delta ${traceEntry.candidate_path}: ${(error as Error).message}`],
    };
  }

  const delta = parseGovernanceTraceDelta(deltaContent, candidatePath);
  const candidateAsFormalTrace = parseGovernanceTrace(deltaContent, candidatePath);
  if (
    delta.operations.length === 0 &&
    !delta.marked_section &&
    candidateAsFormalTrace.edges.length > 0
  ) {
    delta.issues.push({
      code: 'TRACE_DELTA_FULL_GOVERNANCE_MATRIX_FORBIDDEN',
      message:
        'trace_delta.md cannot replace Governance Relations with a full From/Relation/To matrix; use explicit ADD/REMOVE operations.',
      source: candidatePath,
    });
  }

  if (delta.operations.length === 0) {
    const errors = [...current.issues, ...delta.issues, ...candidateAsFormalTrace.issues].map(
      issue => issue.message,
    );
    const legacyContent = delta.marked_section
      ? delta.content_without_governance_delta
      : deltaContent;
    let content: string | null = legacyContent;
    if (currentGovernanceActive && errors.length === 0) {
      content = renderGovernanceTraceDocument(legacyContent, current.edges);
    }
    return {
      targeted: true,
      governanceChanged: false,
      governanceActive: currentGovernanceActive,
      edges: current.edges,
      content: errors.length === 0 ? content : null,
      errors,
    };
  }

  const projection = applyGovernanceTraceDelta({
    current: current.edges,
    operations: delta.operations,
  });
  const errors = [...current.issues, ...delta.issues, ...projection.issues].map(
    issue => issue.message,
  );
  const baseContent =
    delta.marked_section && delta.has_legacy_trace_payload
      ? delta.content_without_governance_delta
      : currentContent;
  return {
    targeted: true,
    governanceChanged: true,
    governanceActive: true,
    edges: projection.prospective,
    content:
      errors.length === 0
        ? renderGovernanceTraceDocument(baseContent, projection.prospective)
        : null,
    errors,
  };
}

export async function executeMerge(input: MergeInput): Promise<MergeResult> {
  const result: MergeResult = {
    success: true,
    merged_files: [],
    spec_manifest_updated: false,
    project_spec_version: '',
    errors: [],
    status: 'success',
  };
  const preflightErrors: string[] = [];

  let manifest: any;
  try {
    manifest = await readJsonFile(input.candidateManifestPath);
  } catch (err: any) {
    return {
      ...result,
      success: false,
      status: 'failed',
      errors: ['Cannot read candidate_manifest.json: ' + err.message],
    };
  }

  const manifestEntries = Array.isArray(manifest.entries)
    ? manifest.entries.map((entry: ManifestEntry) => normalizeEntryForMerge(entry))
    : [];
  const noProjectSpecMerge = isNoProjectSpecMerge(manifest);
  const normalizedEntries = noProjectSpecMerge
    ? []
    : inferManifestEntries(manifest, input.workItemDir).map(normalizeEntryForMerge);
  const entries = normalizedEntries;

  result.project_spec_version = await readCurrentProjectSpecVersion(input.projectRoot);
  const previousProjectSpecVersion = result.project_spec_version;

  if (isEvidenceOnlyNoProjectSpecChange(manifest)) {
    const evidenceOnlyCanonical =
      manifest.no_project_spec_change === true &&
      String(manifest.project_integration_effect ?? '')
        .trim()
        .toLowerCase() === 'evidence_only' &&
      manifest.merge_required === false &&
      manifest.merge_applicable === false &&
      manifestEntries.length === 0;
    if (!evidenceOnlyCanonical) {
      preflightErrors.push(
        'evidence_only candidate_manifest must set no_project_spec_change=true, project_integration_effect=evidence_only, merge_required=false, merge_applicable=false, and entries=[].'
      );
    }
  }

  if (!noProjectSpecMerge && !entriesSemanticallyEqual(manifestEntries, normalizedEntries)) {
    preflightErrors.push(
      'candidate_manifest.entries must be normalized before user approval; merge_runner uses the same inferManifestEntries() rules as approval and will not infer or mutate entries after approval.'
    );
  }

  if (noProjectSpecMerge && preflightErrors.length === 0) {
    const evidenceOnly = isEvidenceOnlyNoProjectSpecChange(manifest);
    const notApplicable: MergeResult = {
      ...result,
      success: true,
      status: 'not_applicable',
      reason: evidenceOnly
        ? 'evidence_only Work Item artifacts are retained as evidence and are not merged into Project Spec.'
        : 'code_only_fast_path has no candidate spec artifacts to merge; candidate_manifest.entries is empty.',
      merged_files: [],
      spec_manifest_updated: false,
    };
    await generateMergeReport(input, notApplicable);
    return notApplicable;
  }

  if (entries.length === 0) {
    if (!noProjectSpecMerge) {
      preflightErrors.push(
        'Non-code-only workflow requires at least one merge entry. candidate_manifest.entries is empty.'
      );
    }
  }

  if (manifest.project_spec_precondition_sha256) {
    const currentManifestPath = path.join(
      input.projectRoot,
      '.specforge',
      'project',
      'spec_manifest.json'
    );
    const currentManifestHash = await computeFileHash(currentManifestPath);
    if (currentManifestHash !== manifest.project_spec_precondition_sha256) {
      preflightErrors.push(
        'PROJECT_SPEC_PRECONDITION_STALE: spec_manifest.json changed after repair Candidates were prepared.'
      );
    }
  }

  const declaredTargetPaths = await readDeclaredProjectSpecTargetPaths(input.projectRoot);
  const governedNewModules = await validateGovernedNewModuleTargets({
    projectRoot: input.projectRoot,
    workItemDir: input.workItemDir,
    workflowPath: manifest.workflow_path,
    entries,
    declaredTargetPaths,
  });
  const undeclaredTargets = entries
    .map(entry => normalizeProjectSpecTargetPath(entry.target_path))
    .filter(
      targetPath =>
        !declaredTargetPaths.has(targetPath) && !governedNewModules.allowedTargets.has(targetPath)
    );
  if (governedNewModules.errors.length > 0 || undeclaredTargets.length > 0) {
    preflightErrors.push(...governedNewModules.errors);
    if (undeclaredTargets.length > 0) {
      preflightErrors.push(
        `candidate_manifest contains target_path values not declared by spec_manifest.json: ${Array.from(
          new Set(undeclaredTargets)
        ).join(', ')}`
      );
    }
  }

  const approvalValidation = await validateApprovedUserDecisionForMerge({
    projectRoot: input.projectRoot,
    workItemDir: input.workItemDir,
    workItemId: input.workItemId,
    candidateManifestPath: input.candidateManifestPath,
    userDecisionPath: input.userDecisionPath,
  });

  if (!approvalValidation.valid) {
    preflightErrors.push(...approvalValidation.errors);
  }

  const workItemRoot = path.resolve(input.workItemDir);
  const projectSpecRoot = path.resolve(input.projectRoot, '.specforge', 'project');

  for (const entry of entries) {
    const candidateFullPath = path.resolve(input.workItemDir, entry.candidate_path);
    const targetFullPath = path.resolve(input.projectRoot, entry.target_path);
    if (!isSubPath(candidateFullPath, workItemRoot)) {
      preflightErrors.push('Security: candidate_path outside WI: ' + entry.candidate_path);
    }
    if (!isSubPath(targetFullPath, projectSpecRoot)) {
      preflightErrors.push(
        'Security: target_path outside .specforge/project/: ' + entry.target_path
      );
    }
    if (!(await fileExists(candidateFullPath))) {
      preflightErrors.push('Candidate file does not exist: ' + entry.candidate_path);
    }
  }

  const traceProjection = await projectTraceProjection({
    projectRoot: input.projectRoot,
    workItemDir: input.workItemDir,
    entries,
  });
  if (traceProjection.errors.length > 0) {
    preflightErrors.push(...traceProjection.errors.map(error => `TRACE_DELTA_INVALID: ${error}`));
  }
  const independentModuleTraceTargets = entries
    .map(entry => ({ entry, moduleCode: targetModuleTrace(entry.target_path) }))
    .filter(item => item.moduleCode && traceProjection.governanceActive && !traceProjection.governanceChanged);
  if (independentModuleTraceTargets.length > 0) {
    preflightErrors.push(
      'Module trace.md is a generated projection and cannot be merged independently; update the canonical Project Trace through Trace Delta.',
    );
  }

  if (preflightErrors.length > 0) {
    const failed: MergeResult = {
      ...result,
      success: false,
      status: 'failed',
      errors: Array.from(new Set(preflightErrors)),
    };
    await generateMergeReport(input, failed);
    return failed;
  }

  const projectSpecManifestPath = path.join(
    input.projectRoot,
    '.specforge',
    'project',
    'spec_manifest.json',
  );
  const moduleCodes = await governedModuleCodes(input.projectRoot, entries);
  const transactionTargets = new Set<string>([
    projectSpecManifestPath,
    ...entries.map(entry => path.resolve(input.projectRoot, entry.target_path)),
    ...moduleCodes.map(moduleCode =>
      path.join(
        input.projectRoot,
        '.specforge',
        'project',
        'modules',
        moduleCode,
        'trace.md',
      ),
    ),
  ]);
  const snapshots = await snapshotFiles(transactionTargets);

  try {
    for (const entry of entries) {
      const candidateFullPath = path.resolve(input.workItemDir, entry.candidate_path);
      const targetFullPath = path.resolve(input.projectRoot, entry.target_path);
      const moduleTraceCode = targetModuleTrace(entry.target_path);

      if (traceProjection.governanceChanged && moduleTraceCode) {
        // Module Trace is a generated projection and is written after all formal
        // objects and spec_manifest.json are committed inside this transaction.
        continue;
      }

      if (entry.operation === 'delete') {
        await fs.rm(targetFullPath, { force: true });
        result.merged_files.push({
          candidate_path: entry.candidate_path,
          target_path: entry.target_path,
          operation: 'delete',
          status: 'success',
          hash_match: true,
        });
        continue;
      }

      await fs.mkdir(path.dirname(targetFullPath), { recursive: true });
      if (isProjectTraceTarget(entry.target_path) && traceProjection.targeted) {
        await fs.writeFile(targetFullPath, traceProjection.content as string, 'utf-8');
      } else {
        await fs.copyFile(candidateFullPath, targetFullPath);
      }
      const expectedHash = isProjectTraceTarget(entry.target_path) && traceProjection.targeted
        ? 'sha256:' + crypto
            .createHash('sha256')
            .update(traceProjection.content as string)
            .digest('hex')
        : await computeFileHash(candidateFullPath);
      const targetHash = await computeFileHash(targetFullPath);
      if (expectedHash !== targetHash) {
        throw new Error(`Hash mismatch after writing ${entry.target_path}`);
      }
      result.merged_files.push({
        candidate_path: entry.candidate_path,
        target_path: entry.target_path,
        operation: entry.operation,
        status: 'success',
        hash_match: true,
      });
    }

    if (entries.length > 0) {
      const versionMatch = /^PSV-(\d+)$/.exec(result.project_spec_version);
      if (!versionMatch) {
        throw new Error(`Invalid current project_spec_version: ${result.project_spec_version}`);
      }
      const versionNum = Number.parseInt(versionMatch[1], 10);
      const newVersion = 'PSV-' + String(versionNum + 1).padStart(4, '0');
      result.project_spec_version = newVersion;

      let specManifest: any = {};
      try {
        specManifest = await readJsonFile(projectSpecManifestPath);
      } catch {
        // First spec merge.
      }
      specManifest.schema_version = specManifest.schema_version ?? '1.0';
      specManifest.project_spec_version = newVersion;
      specManifest.last_merged_work_item = input.workItemId;
      specManifest.last_merged_at = new Date().toISOString();
      specManifest.last_merged_targets = result.merged_files
        .filter(entry => entry.status === 'success')
        .map(entry => entry.target_path);

      await fs.mkdir(path.dirname(projectSpecManifestPath), { recursive: true });
      const replaceLegacyModuleEntries = await isProjectSpecRepairMerge(
        input.workItemDir,
        manifest.workflow_path,
      );
      await registerMergedProjectModules(
        specManifest,
        input.projectRoot,
        replaceLegacyModuleEntries,
      );
      await fs.writeFile(
        projectSpecManifestPath,
        JSON.stringify(specManifest, null, 2) + '\n',
        'utf-8',
      );
      result.spec_manifest_updated = true;

      const mergedExtensionRegistry = result.merged_files.find(
        entry =>
          entry.status === 'success' &&
          entry.target_path.replace(/\\/g, '/').endsWith('project/extension_registry.json'),
      );
      if (mergedExtensionRegistry) {
        const registryAbsPath = path.join(
          input.projectRoot,
          '.specforge',
          'project',
          'extension_registry.json',
        );
        const registry = await readJsonFile(registryAbsPath);
        if (registry && typeof registry === 'object' && registry.project_spec_version !== newVersion) {
          registry.project_spec_version = newVersion;
          await fs.writeFile(
            registryAbsPath,
            JSON.stringify(registry, null, 2) + '\n',
            'utf-8',
          );
        }
      }
    }

    if (traceProjection.governanceChanged) {
      const unifiedContracts = readUnifiedContracts(input.projectRoot);
      if (unifiedContracts.errors.length > 0) {
        throw new Error(
          `Cannot generate Module Trace projections: ${unifiedContracts.errors.join('; ')}`,
        );
      }
      const designOwners = designOwnersFromTrace(traceProjection.edges);
      const contractOwners = new Map(
        unifiedContracts.contracts.map(contract => [contract.id, contract.owner_module]),
      );
      const finalModuleCodes = await governedModuleCodes(input.projectRoot, entries);
      for (const moduleCode of finalModuleCodes) {
        const targetPath = `.specforge/project/modules/${moduleCode}/trace.md`;
        const targetFullPath = path.join(input.projectRoot, ...targetPath.split('/'));
        const content = renderGovernanceModuleTrace({
          edges: traceProjection.edges,
          module_code: moduleCode,
          design_owners: designOwners,
          contract_owners: contractOwners,
        });
        await fs.mkdir(path.dirname(targetFullPath), { recursive: true });
        await fs.writeFile(targetFullPath, content, 'utf-8');
        const existing = result.merged_files.find(
          entry => normalizeProjectSpecTargetPath(entry.target_path) === targetPath,
        );
        if (existing) {
          existing.status = 'success';
          existing.hash_match = true;
          existing.error = undefined;
        } else {
          result.merged_files.push({
            candidate_path: 'generated:project_trace_projection',
            target_path: targetPath,
            operation: 'replace',
            status: 'success',
            hash_match: true,
          });
        }
      }

      const specManifest = await readJsonFile(projectSpecManifestPath);
      specManifest.last_merged_targets = result.merged_files
        .filter(entry => entry.status === 'success')
        .map(entry => entry.target_path);
      await fs.writeFile(
        projectSpecManifestPath,
        JSON.stringify(specManifest, null, 2) + '\n',
        'utf-8',
      );
    }

    if (result.spec_manifest_updated) {
      recordAtomicSpecMergeProjectWrites({
        projectRoot: input.projectRoot,
        workItemId: input.workItemId,
        projectSpecVersion: result.project_spec_version,
        relativePaths: [
          '.specforge/project/spec_manifest.json',
          ...result.merged_files
            .filter(entry => entry.status === 'success' && entry.operation !== 'delete')
            .map(entry => entry.target_path),
        ],
      });
    }
  } catch (error) {
    const rollbackErrors = await restoreSnapshots(snapshots);
    result.success = false;
    result.rolled_back = rollbackErrors.length === 0;
    result.spec_manifest_updated = false;
    result.project_spec_version = previousProjectSpecVersion;
    result.errors.push(`Atomic merge failed and was rolled back: ${(error as Error).message}`);
    if (rollbackErrors.length > 0) {
      result.errors.push(`Rollback errors: ${rollbackErrors.join('; ')}`);
    }
    for (const entry of result.merged_files) {
      if (entry.status === 'success') {
        entry.status = 'failed';
        entry.hash_match = false;
        entry.error = 'Rolled back because another merge operation failed';
      }
    }
  }

  result.status = result.success ? 'success' : 'failed';
  await generateMergeReport(input, result);
  return result;
}

async function generateMergeReport(input: MergeInput, result: MergeResult): Promise<void> {
  const status = result.status ?? (result.success ? 'success' : 'failed');
  const lines: string[] = [
    '# Merge Report',
    '',
    'Work Item: ' + input.workItemId,
    'Status: ' + status,
    'Timestamp: ' + new Date().toISOString(),
    '',
    '## Summary',
    '',
    '- Total entries: ' + result.merged_files.length,
    '- Successful: ' + result.merged_files.filter(e => e.status === 'success').length,
    '- Failed: ' + result.merged_files.filter(e => e.status === 'failed').length,
    '- Spec Manifest Updated: ' + result.spec_manifest_updated,
    '- Project Spec Version: ' + (result.project_spec_version || 'N/A'),
  ];

  if (status === 'not_applicable') {
    lines.push(
      '',
      '## Not Applicable',
      '',
      result.reason ?? 'No Candidate artifacts need to be merged.'
    );
  }

  lines.push(
    '',
    '## Inputs',
    '',
    '- candidate_manifest: ' + input.candidateManifestPath,
    '- user_decision: ' + input.userDecisionPath,
    '',
    '## Merged Files',
    ''
  );

  if (result.merged_files.length === 0) {
    lines.push('No files merged.');
  } else {
    lines.push('| Status | Operation | Candidate | Target | Hash Match |');
    lines.push('|--------|-----------|-----------|--------|------------|');
    for (const entry of result.merged_files) {
      lines.push(
        '| ' +
          entry.status +
          ' | ' +
          entry.operation +
          ' | ' +
          entry.candidate_path +
          ' | ' +
          entry.target_path +
          ' | ' +
          entry.hash_match +
          ' |'
      );
      if (entry.error) lines.push('- Error: ' + entry.error);
    }
  }

  if (result.errors.length > 0) {
    lines.push('', '## Errors', '', ...result.errors.map(err => '- ' + err));
  }

  lines.push('', '## Evidence', '', '- merge_runner_execution_log');
  await fs.writeFile(path.join(input.workItemDir, 'merge_report.md'), lines.join('\n'), 'utf-8');
}
