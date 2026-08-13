/**
 * governance-invariants-v11.ts — SpecForge v1.1 P0 hard governance invariants
 *
 * This module is intentionally daemon-side. Agent / Skill text may guide the
 * process, but these checks are the trust boundary for approval, merge and close.
 */
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  SPEC_DIR_NAME,
  workItemCandidateDesign,
  workItemCandidateManifest,
  workItemCandidateModulesRoot,
  workItemCandidateRequirements,
  workItemCandidateTasks,
  workItemCandidateTraceDelta,
  workItemCandidatesRoot,
  workItemRoot,
  workItemSpecArtifactReadCandidates,
  type WorkItemSpecArtifactKind,
} from '@specforge/types/directory-layout';

export type GovernanceValidationResult = {
  valid: boolean;
  errors: string[];
  facts?: Record<string, unknown>;
};

export type ManifestEntry = {
  candidate_path: string;
  target_path: string;
  operation: string;
  type?: string;
  module_id?: string;
  inferred?: boolean;
  normalized?: boolean;
};

export const VALID_WORKFLOW_PATHS = new Set([
  'requirement_change_path',
  'design_change_path',
  'architecture_change_path',
  'task_change_path',
  'code_only_fast_path',
  'spec_migration_path',
  'contract_change_path',
  'rollback_path',
]);

export const USER_APPROVAL_REQUIRED_PATHS = new Set([
  'requirement_change_path',
  'design_change_path',
  'architecture_change_path',
  'task_change_path',
  'spec_migration_path',
  'contract_change_path',
]);

export function normalizeSlash(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

export function isKnownAgentActor(actor: string | undefined | null): boolean {
  const value = String(actor ?? '')
    .trim()
    .toLowerCase();
  if (!value) return true;
  if (value === 'unknown') return true;
  if (value.startsWith('sf-')) return true;
  return ['orchestrator', 'agent', 'assistant', 'model', 'system'].includes(value);
}

export async function readTextOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function readJsonOrNull<T = any>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

export type ResolvedWorkItemSpecArtifact = {
  path: string;
  content: string;
};

/**
 * 只从 Runtime 已冻结的 candidate_manifest 中解析指定类型的 Candidate。
 *
 * 与 resolveWorkItemSpecArtifacts 不同，本函数不扫描 Candidate 目录，也不读取
 * 兼容路径。用于 Gate 判断“哪个正式 Candidate 承担某项治理职责”，避免把
 * 被 Classification 排除的历史文件重新当成当前 Candidate。
 *
 * Manifest 中命中目标类型的条目若路径非法或文件缺失，必须失败关闭；不能
 * 静默退回目录扫描，因为 Gate、Approval 和 Merge 都以冻结 Manifest 为边界。
 */
export async function resolveFrozenManifestArtifacts(input: {
  projectRoot: string;
  workItemId: string;
  artifactTypes: string[];
}): Promise<ResolvedWorkItemSpecArtifact[]> {
  const manifest = await readJsonOrNull<any>(
    workItemCandidateManifest(input.projectRoot, input.workItemId)
  );
  const entries = [
    ...(Array.isArray(manifest?.entries) ? manifest.entries : []),
    ...(Array.isArray(manifest?.candidates) ? manifest.candidates : []),
  ];
  const acceptedTypes = new Set(
    input.artifactTypes.map(value => String(value ?? '').trim().toLowerCase()).filter(Boolean)
  );
  const resolved: ResolvedWorkItemSpecArtifact[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const type = String(entry?.type ?? entry?.spec_type ?? '')
      .trim()
      .toLowerCase();
    const candidatePath = normalizeSlash(
      String(entry?.candidate_path ?? entry?.path ?? '')
    ).toLowerCase();
    const architectureFallback =
      acceptedTypes.has('architecture') && candidatePath.endsWith('architecture.candidate.md');
    if (!acceptedTypes.has(type) && !architectureFallback) continue;

    const absolutePath = manifestCandidatePathToAbsolute(
      input.projectRoot,
      input.workItemId,
      entry?.candidate_path ?? entry?.path
    );
    if (!absolutePath) {
      throw new Error(`invalid frozen Candidate path: ${candidatePath || '<empty>'}`);
    }

    const normalizedAbsolutePath = path.resolve(absolutePath);
    if (seen.has(normalizedAbsolutePath)) continue;
    seen.add(normalizedAbsolutePath);

    try {
      resolved.push({
        path: normalizedAbsolutePath,
        content: await fs.readFile(normalizedAbsolutePath, 'utf-8'),
      });
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        throw new Error(`frozen Candidate file not found: ${candidatePath}`);
      }
      throw error;
    }
  }

  return resolved;
}

function manifestCandidatePathToAbsolute(
  projectRoot: string,
  workItemId: string,
  candidatePath: unknown
): string | null {
  const normalized = normalizeSlash(String(candidatePath ?? '')).trim();
  if (!normalized || normalized.includes('..')) return null;

  const wiRoot = workItemRoot(projectRoot, workItemId);
  if (normalized.startsWith('candidates/')) {
    return path.join(wiRoot, normalized);
  }

  const projectRelativePrefix = `${SPEC_DIR_NAME}/work-items/${workItemId}/`;
  if (normalized.startsWith(projectRelativePrefix)) {
    return path.join(projectRoot, normalized);
  }

  return null;
}

function manifestEntryMatchesArtifactKind(entry: any, kind: WorkItemSpecArtifactKind): boolean {
  const type = String(entry?.type ?? entry?.spec_type ?? '')
    .trim()
    .toLowerCase();
  const candidatePath = normalizeSlash(
    String(entry?.candidate_path ?? entry?.path ?? '')
  ).toLowerCase();

  if (kind === 'requirements') {
    return (
      type === 'requirements' ||
      type === 'requirement' ||
      candidatePath.endsWith('/requirements.candidate.md')
    );
  }
  if (kind === 'design') {
    return type === 'design' || candidatePath.endsWith('/design.candidate.md');
  }
  if (kind === 'tasks') {
    return type === 'tasks' || type === 'task' || candidatePath.endsWith('/tasks.md');
  }
  return type === 'trace' || type === 'trace_delta' || candidatePath.endsWith('/trace_delta.md');
}

/**
 * 按现有 Candidate 治理语义解析 Work Item 规格产物。
 *
 * 解析顺序：candidate_manifest 显式条目 → Candidate 目录事实 → Work Item/legacy 只读兼容路径。
 * 本函数只负责读取发现，不定义新路径；所有路径均来自 @specforge/types/directory-layout。
 */
export async function resolveWorkItemSpecArtifacts(input: {
  projectRoot: string;
  workItemId: string;
  kind: WorkItemSpecArtifactKind;
}): Promise<ResolvedWorkItemSpecArtifact[]> {
  const candidates: string[] = [];
  const manifest = await readJsonOrNull<any>(
    workItemCandidateManifest(input.projectRoot, input.workItemId)
  );
  const manifestEntries = [
    ...(Array.isArray(manifest?.entries) ? manifest.entries : []),
    ...(Array.isArray(manifest?.candidates) ? manifest.candidates : []),
  ];

  for (const entry of manifestEntries) {
    if (!manifestEntryMatchesArtifactKind(entry, input.kind)) continue;
    const absolutePath = manifestCandidatePathToAbsolute(
      input.projectRoot,
      input.workItemId,
      entry?.candidate_path ?? entry?.path
    );
    if (absolutePath) candidates.push(absolutePath);
  }

  if (input.kind === 'requirements' || input.kind === 'design') {
    try {
      const moduleNames = (
        await fs.readdir(workItemCandidateModulesRoot(input.projectRoot, input.workItemId), {
          withFileTypes: true,
        })
      )
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort();

      for (const moduleName of moduleNames) {
        candidates.push(
          input.kind === 'requirements'
            ? workItemCandidateRequirements(input.projectRoot, input.workItemId, moduleName)
            : workItemCandidateDesign(input.projectRoot, input.workItemId, moduleName)
        );
      }
    } catch {
      // Candidate module directory may not exist yet.
    }
  } else if (input.kind === 'tasks') {
    candidates.push(workItemCandidateTasks(input.projectRoot, input.workItemId));
  } else {
    candidates.push(workItemCandidateTraceDelta(input.projectRoot, input.workItemId));
  }

  candidates.push(
    ...workItemSpecArtifactReadCandidates(input.projectRoot, input.workItemId, input.kind)
  );

  const resolved: ResolvedWorkItemSpecArtifact[] = [];
  const seen = new Set<string>();
  for (const candidatePath of candidates) {
    const absolutePath = path.resolve(candidatePath);
    if (seen.has(absolutePath)) continue;
    seen.add(absolutePath);
    try {
      resolved.push({ path: absolutePath, content: await fs.readFile(absolutePath, 'utf-8') });
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') continue;
      throw error;
    }
  }

  // Canonical Candidate files are authoritative. Compatibility files are used
  // only when no canonical artifact of the requested kind exists.
  const canonicalRoot =
    path.resolve(workItemCandidatesRoot(input.projectRoot, input.workItemId)) + path.sep;
  const canonical = resolved.filter(artifact => artifact.path.startsWith(canonicalRoot));
  return canonical.length > 0 ? canonical : resolved.slice(0, 1);
}

export async function computeFileHash(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath);
    return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}

async function walkDir(dir: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await walkDir(full)));
      else out.push(full);
    }
  } catch {
    /* absent directory */
  }
  return out;
}

export async function computeCandidateHash(workItemDir: string): Promise<string> {
  const candidatesDir = path.join(workItemDir, 'candidates');
  const hash = crypto.createHash('sha256');
  const files = await walkDir(candidatesDir);
  for (const file of files.sort()) {
    try {
      hash.update(await fs.readFile(file));
    } catch {
      /* skip */
    }
  }
  return 'sha256:' + hash.digest('hex');
}

export function targetPathForCandidate(type: string, candidatePath: string): string | null {
  const t = String(type ?? '').toLowerCase();
  const p = normalizeSlash(candidatePath).toLowerCase();
  const moduleRequirementsCandidate = p.match(
    /(?:^|\/)candidates\/project\/modules\/([^\/]+)\/requirements\.candidate\.md$/
  );
  if (moduleRequirementsCandidate)
    return `.specforge/project/modules/${moduleRequirementsCandidate[1]}/requirements.md`;
  const moduleDesignCandidate = p.match(
    /(?:^|\/)candidates\/project\/modules\/([^\/]+)\/design\.candidate\.md$/
  );
  if (moduleDesignCandidate)
    return `.specforge/project/modules/${moduleDesignCandidate[1]}/design.md`;
  const moduleContractsCandidate = p.match(
    /(?:^|\/)candidates\/project\/modules\/([^\/]+)\/contracts\.candidate\.json$/
  );
  if (moduleContractsCandidate)
    return `.specforge/project/modules/${moduleContractsCandidate[1]}/contracts.json`;
  if (t === 'data_model' || p.endsWith('/data_model.md') || p === 'data_model.md')
    return '.specforge/project/data_model.md';
  if (t === 'requirements' || p.endsWith('/requirements.md') || p === 'requirements.md')
    return '.specforge/project/requirements_index.md';
  if (t === 'design' || p.endsWith('/design.md') || p === 'design.md')
    return '.specforge/project/design_index.md';
  if (
    t === 'trace' ||
    t === 'trace_delta' ||
    p.endsWith('/trace_delta.md') ||
    p === 'trace_delta.md'
  )
    return '.specforge/project/trace_matrix.md';
  if (t === 'architecture' || p.endsWith('/architecture.md') || p === 'architecture.md')
    return '.specforge/project/architecture.md';
  if (t === 'glossary' || p.endsWith('/glossary.md') || p === 'glossary.md')
    return '.specforge/project/glossary.md';
  if (t === 'decisions' || p.endsWith('/decisions.md') || p === 'decisions.md')
    return '.specforge/project/decisions.md';
  return null;
}

function normalizeManifestPathForInferenceV12(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function normalizeManifestEntryForInferenceV12(entry: any): any {
  const candidatePath = normalizeManifestPathForInferenceV12(entry?.candidate_path ?? entry?.path);
  const targetPath = normalizeManifestPathForInferenceV12(entry?.target_path);
  const normalized: any = {
    candidate_path: candidatePath,
    target_path: targetPath,
  };
  const type = String(entry?.type ?? '').trim();
  if (type) normalized.type = type;
  const moduleId = String(entry?.module_id ?? entry?.target_module ?? entry?.module ?? '').trim();
  if (moduleId) normalized.module_id = moduleId;
  return normalized;
}

function isUsableExplicitManifestEntryForInferenceV12(entry: any): boolean {
  const normalized = normalizeManifestEntryForInferenceV12(entry);
  return Boolean(
    normalized.candidate_path &&
    normalized.target_path &&
    normalized.target_path.startsWith('.specforge/project/')
  );
}

function preferExplicitManifestEntriesForInferenceV12(manifest: any): any[] | null {
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  if (entries.length === 0) return null;
  if (!entries.every(isUsableExplicitManifestEntryForInferenceV12)) return null;
  return entries.map(normalizeManifestEntryForInferenceV12);
}

export type CandidateManifestMaterializationResult = {
  entries: ManifestEntry[];
  required_candidate_types: string[];
  ignored_candidate_paths: string[];
};

type CandidateClassificationLike = Record<string, unknown>;

function isClassificationObject(value: unknown): value is CandidateClassificationLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function classificationRequiresRequirementsCandidate(
  classification: CandidateClassificationLike
): boolean {
  return (
    classification.requirement_changed === true ||
    classification.acceptance_criteria_changed === true ||
    classification.business_rule_changed === true
  );
}

function candidateEntryKey(entry: ManifestEntry): string {
  return `${normalizeSlash(entry.candidate_path).toLowerCase()}=>${normalizeSlash(entry.target_path).toLowerCase()}`;
}

function canonicalExplicitManifestEntriesForMaterialization(manifest: any): ManifestEntry[] {
  const rawEntries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const entries: ManifestEntry[] = [];
  for (const raw of rawEntries) {
    if (!isUsableExplicitManifestEntryForInferenceV12(raw)) {
      throw new Error(
        'CANDIDATE_MANIFEST_EXPLICIT_ENTRY_INVALID: every explicit entry must have a canonical candidate_path and a .specforge/project target_path'
      );
    }
    const normalized = normalizeManifestEntryForInferenceV12(raw);
    entries.push({
      candidate_path: normalized.candidate_path,
      target_path: normalized.target_path,
      operation: String(raw?.operation ?? 'replace'),
      type: normalized.type,
      module_id: normalized.module_id,
      inferred: false,
      normalized: true,
    });
  }
  return entries;
}

function listCanonicalCandidateFiles(workItemDir: string): Array<{
  candidate_path: string;
  target_path: string;
  type: string;
  module_id?: string;
}> {
  const discovered: Array<{
    candidate_path: string;
    target_path: string;
    type: string;
    module_id?: string;
  }> = [];
  const append = (
    candidatePath: string,
    targetPath: string,
    type: string,
    moduleId?: string
  ): void => {
    if (!fsSync.existsSync(path.join(workItemDir, candidatePath))) return;
    discovered.push({
      candidate_path: candidatePath,
      target_path: targetPath,
      type,
      module_id: moduleId,
    });
  };

  append(
    'candidates/project/architecture.candidate.md',
    '.specforge/project/architecture.md',
    'architecture'
  );
  append(
    'candidates/project/data_model.candidate.md',
    '.specforge/project/data_model.md',
    'data_model'
  );
  append(
    'candidates/project/extension_registry.json',
    '.specforge/project/extension_registry.json',
    'extension_registry'
  );

  const modulesRoot = path.join(workItemDir, 'candidates', 'project', 'modules');
  try {
    for (const entry of fsSync
      .readdirSync(modulesRoot, { withFileTypes: true })
      .filter(item => item.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const moduleId = String(entry.name ?? '').trim();
      if (!moduleId) continue;
      const candidateRoot = `candidates/project/modules/${moduleId}`;
      const targetRoot = `.specforge/project/modules/${moduleId}`;
      append(
        `${candidateRoot}/module.candidate.json`,
        `${targetRoot}/module.json`,
        'module_definition',
        moduleId
      );
      append(
        `${candidateRoot}/requirements.candidate.md`,
        `${targetRoot}/requirements.md`,
        'requirements',
        moduleId
      );
      append(
        `${candidateRoot}/design.candidate.md`,
        `${targetRoot}/design.md`,
        'design',
        moduleId
      );
      append(
        `${candidateRoot}/contracts.candidate.json`,
        `${targetRoot}/contracts.json`,
        'module_contract',
        moduleId
      );
      append(
        `${candidateRoot}/trace.candidate.md`,
        `${targetRoot}/trace.md`,
        'module_trace',
        moduleId
      );
    }
  } catch {
    // No module Candidates have been produced.
  }

  append(
    'candidates/trace_delta.md',
    '.specforge/project/trace_matrix.md',
    'trace_delta'
  );
  return discovered;
}

/**
 * Runtime-owned Candidate Manifest materialization.
 *
 * Candidate-producing Tools may create files at different times. Before the
 * authoritative candidate_preparing -> candidate_prepared transition, Runtime
 * merges already-explicit entries with the canonical Candidates required by the
 * actual Classification. Unrelated files remain historical WI evidence and are
 * deliberately excluded from the merge list.
 */
function normalizeModuleCodePathsForMaterialization(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .map(item => normalizeSlash(String(item ?? '').trim()))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}
function moduleDefinitionCandidateHasGovernedCodePathDelta(
  workItemDir: string,
  entry: { candidate_path: string; target_path: string; type: string; module_id?: string }
): boolean {
  if (entry.type !== 'module_definition') return false;
  const candidatePath = path.join(workItemDir, normalizeSlash(entry.candidate_path));
  let candidate: any;
  try {
    candidate = JSON.parse(fsSync.readFileSync(candidatePath, 'utf-8'));
  } catch {
    // A malformed Module Candidate must stay in the governed Candidate set
    // so the normal schema/Gate boundary can fail closed instead of ignoring it.
    return true;
  }
  const projectRoot = path.resolve(workItemDir, '..', '..', '..');
  const targetPath = path.resolve(projectRoot, normalizeSlash(entry.target_path));
  if (!fsSync.existsSync(targetPath)) return true;
  if (!Object.prototype.hasOwnProperty.call(candidate, 'code_paths')) return false;
  const candidateCodePaths = normalizeModuleCodePathsForMaterialization(candidate.code_paths);
  if (!candidateCodePaths) return true;
  let formal: any;
  try {
    formal = JSON.parse(fsSync.readFileSync(targetPath, 'utf-8'));
  } catch {
    return true;
  }
  const formalCodePaths = normalizeModuleCodePathsForMaterialization(formal?.code_paths ?? []);
  if (!formalCodePaths) return true;
  return JSON.stringify(candidateCodePaths) !== JSON.stringify(formalCodePaths);
}

export function materializeCandidateManifestEntries(
  manifest: any,
  workItemDir: string,
  classificationValue: unknown
): CandidateManifestMaterializationResult {
  if (!isClassificationObject(classificationValue)) {
    throw new Error(
      'CANDIDATE_MANIFEST_CLASSIFICATION_REQUIRED: trigger_result.classification must exist before candidate_prepared'
    );
  }
  const classification = classificationValue;
  const explicit = canonicalExplicitManifestEntriesForMaterialization(manifest);
  const discovered = listCanonicalCandidateFiles(workItemDir);
  const selected: ManifestEntry[] = [];
  const candidateToTarget = new Map<string, string>();
  const targetToCandidate = new Map<string, string>();

  const appendEntry = (entry: ManifestEntry): void => {
    const candidatePath = normalizeSlash(entry.candidate_path);
    const targetPath = normalizeSlash(entry.target_path);
    const candidateKey = candidatePath.toLowerCase();
    const targetKey = targetPath.toLowerCase();
    const existingTarget = candidateToTarget.get(candidateKey);
    const existingCandidate = targetToCandidate.get(targetKey);
    if (existingTarget && existingTarget !== targetKey) {
      throw new Error(
        `CANDIDATE_MANIFEST_CONFLICT: ${candidatePath} maps to both ${existingTarget} and ${targetPath}`
      );
    }
    if (existingCandidate && existingCandidate !== candidateKey) {
      throw new Error(
        `CANDIDATE_MANIFEST_CONFLICT: target ${targetPath} is produced by both ${existingCandidate} and ${candidatePath}`
      );
    }
    candidateToTarget.set(candidateKey, targetKey);
    targetToCandidate.set(targetKey, candidateKey);
    const key = candidateEntryKey({
      ...entry,
      candidate_path: candidatePath,
      target_path: targetPath,
    });
    if (selected.some(existing => candidateEntryKey(existing) === key)) return;
    selected.push({
      ...entry,
      candidate_path: candidatePath,
      target_path: targetPath,
      operation: String(entry.operation ?? 'replace'),
    });
  };

  const architectureRequired = classification.architecture_changed === true;
  const dataModelRequired = classification.data_model_changed === true;
  const designRequired = classification.design_changed === true;
  const moduleContractRequired = classification.module_contract_changed === true;
  const moduleBoundaryChanged = classification.module_boundary_changed === true;
  const governedModuleDefinitionCandidates = new Set(
    discovered
      .filter(entry =>
        moduleDefinitionCandidateHasGovernedCodePathDelta(workItemDir, entry)
      )
      .map(entry => normalizeSlash(entry.candidate_path).toLowerCase())
  );
  const moduleDefinitionRequired =
    moduleBoundaryChanged || governedModuleDefinitionCandidates.size > 0;
  // A governed new module is incomplete without its canonical Requirements and
  // module Trace views, even when the business Requirement itself did not change.
  const requirementsRequired =
    classificationRequiresRequirementsCandidate(classification) || moduleBoundaryChanged;
  const moduleTraceRequired = moduleBoundaryChanged;
  const projectContractChanged =
    classification.project_contract_changed === true ||
    classification.api_contract_changed === true ||
    classification.contract_registry_only === true;
  const workflowPath = String(manifest?.workflow_path ?? '').trim();
  const knownMaterializedTypes = new Set([
    'architecture',
    'data_model',
    'requirements',
    'design',
    'module_contract',
    'module_definition',
    'extension_registry',
    'trace_delta',
    'module_trace',
  ]);
  const includeType = (type: string): boolean => {
    switch (type) {
      case 'architecture':
        return architectureRequired;
      case 'data_model':
        return dataModelRequired;
      case 'requirements':
        return requirementsRequired;
      case 'design':
        return designRequired;
      case 'module_contract':
        return moduleContractRequired;
      case 'module_definition':
        return moduleDefinitionRequired;
      case 'extension_registry':
        return projectContractChanged;
      case 'trace_delta':
        return workflowPath !== 'code_only_fast_path';
      case 'module_trace':
        return moduleTraceRequired;
      default:
        return true;
    }
  };
  const discoveredByCandidate = new Map(
    discovered.map(entry => [normalizeSlash(entry.candidate_path).toLowerCase(), entry])
  );
  for (const entry of explicit) {
    const discoveredEntry = discoveredByCandidate.get(
      normalizeSlash(entry.candidate_path).toLowerCase()
    );
    const effectiveEntry: ManifestEntry = {
      ...entry,
      type: entry.type ?? discoveredEntry?.type,
      module_id: entry.module_id ?? discoveredEntry?.module_id,
    };
    const effectiveType = String(effectiveEntry.type ?? '').trim();
    if (effectiveType === 'module_definition' && !moduleBoundaryChanged) {
      const candidateKey = normalizeSlash(effectiveEntry.candidate_path).toLowerCase();
      if (!governedModuleDefinitionCandidates.has(candidateKey)) continue;
    }
    if (knownMaterializedTypes.has(effectiveType) && !includeType(effectiveType)) {
      continue;
    }
    appendEntry(effectiveEntry);
  }

  const includeDiscovered = (entry: (typeof discovered)[number]): boolean =>
    includeType(entry.type) &&
    (entry.type !== 'module_definition' ||
      moduleBoundaryChanged ||
      governedModuleDefinitionCandidates.has(
        normalizeSlash(entry.candidate_path).toLowerCase()
      ));

  for (const entry of discovered) {
    if (!includeDiscovered(entry)) continue;
    appendEntry({
      ...entry,
      operation: 'replace',
      inferred: true,
      normalized: true,
    });
  }

  const requiredCandidateTypes: string[] = [];
  const requireType = (required: boolean, type: string, description: string): void => {
    if (!required) return;
    requiredCandidateTypes.push(type);
    if (!selected.some(entry => entry.type === type)) {
      throw new Error(
        `CANDIDATE_MANIFEST_REQUIRED_ENTRY_MISSING: ${description} requires a ${type} Candidate`
      );
    }
  };
  requireType(architectureRequired, 'architecture', 'architecture_changed=true');
  requireType(dataModelRequired, 'data_model', 'data_model_changed=true');
  requireType(requirementsRequired, 'requirements', 'Requirement Classification changed');
  requireType(designRequired, 'design', 'design_changed=true');
  requireType(moduleContractRequired, 'module_contract', 'module_contract_changed=true');
  requireType(moduleDefinitionRequired, 'module_definition', 'module boundary changed or governed code_paths changed');
  requireType(moduleTraceRequired, 'module_trace', 'module_boundary_changed=true');
  requireType(
    projectContractChanged,
    'extension_registry',
    'project_contract_changed=true, api_contract_changed=true or contract_registry_only=true'
  );

  const selectedPaths = new Set(selected.map(entry => normalizeSlash(entry.candidate_path)));
  const ignoredCandidatePaths = discovered
    .map(entry => normalizeSlash(entry.candidate_path))
    .filter(candidatePath => !selectedPaths.has(candidatePath))
    .sort();

  return {
    entries: selected,
    required_candidate_types: requiredCandidateTypes,
    ignored_candidate_paths: ignoredCandidatePaths,
  };
}

export function inferManifestEntries(manifest: any, workItemDir: string): ManifestEntry[] {
  const explicitEntriesV12 = preferExplicitManifestEntriesForInferenceV12(manifest);
  if (explicitEntriesV12) {
    return explicitEntriesV12;
  }
  const normalized: ManifestEntry[] = [];
  const rawEntries = Array.isArray(manifest?.entries) ? manifest.entries : [];

  for (const entry of rawEntries) {
    if (!entry || typeof entry !== 'object') continue;
    const candidatePath = entry.candidate_path ?? entry.path;
    const targetPath = entry.target_path;
    if (!candidatePath || !targetPath) continue;
    normalized.push({
      candidate_path: normalizeSlash(candidatePath),
      target_path: normalizeSlash(targetPath),
      operation: entry.operation ?? 'replace',
      type: entry.type,
      inferred: Boolean(entry.inferred),
      normalized: Boolean(entry.normalized),
    });
  }

  if (normalized.length === 0 && Array.isArray(manifest?.candidates)) {
    for (const candidate of manifest.candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const candidatePath = normalizeSlash(candidate.candidate_path ?? candidate.path ?? '');
      if (!candidatePath) continue;
      const targetPath = targetPathForCandidate(candidate.type, candidatePath);
      if (!targetPath) continue;
      normalized.push({
        candidate_path: candidatePath,
        target_path: targetPath,
        operation: candidate.operation ?? 'replace',
        type: candidate.type,
        inferred: false,
        normalized: true,
      });
    }
  }

  if (normalized.length === 0) {
    const moduleCandidatesRoot = path.join(workItemDir, 'candidates', 'project', 'modules');
    try {
      for (const moduleName of fsSync.readdirSync(moduleCandidatesRoot)) {
        const moduleDir = path.join(moduleCandidatesRoot, moduleName);
        if (!fsSync.statSync(moduleDir).isDirectory()) continue;
        const reqCandidate = path.join(moduleDir, 'requirements.candidate.md');
        const designCandidate = path.join(moduleDir, 'design.candidate.md');
        const moduleCandidate = path.join(moduleDir, 'module.candidate.json');
        const contractsCandidate = path.join(moduleDir, 'contracts.candidate.json');
        const traceCandidate = path.join(moduleDir, 'trace.candidate.md');
        if (fsSync.existsSync(moduleCandidate))
          normalized.push({
            candidate_path: normalizeSlash(path.relative(workItemDir, moduleCandidate)),
            target_path: `.specforge/project/modules/${moduleName}/module.json`,
            operation: 'replace',
            type: 'module_definition',
            inferred: true,
            normalized: true,
          });
        if (fsSync.existsSync(reqCandidate))
          normalized.push({
            candidate_path: normalizeSlash(path.relative(workItemDir, reqCandidate)),
            target_path: `.specforge/project/modules/${moduleName}/requirements.md`,
            operation: 'replace',
            type: 'requirements',
            inferred: true,
            normalized: true,
          });
        if (fsSync.existsSync(designCandidate))
          normalized.push({
            candidate_path: normalizeSlash(path.relative(workItemDir, designCandidate)),
            target_path: `.specforge/project/modules/${moduleName}/design.md`,
            operation: 'replace',
            type: 'design',
            inferred: true,
            normalized: true,
          });
        if (fsSync.existsSync(contractsCandidate))
          normalized.push({
            candidate_path: normalizeSlash(path.relative(workItemDir, contractsCandidate)),
            target_path: `.specforge/project/modules/${moduleName}/contracts.json`,
            operation: 'replace',
            type: 'module_contract',
            inferred: true,
            normalized: true,
          });
        if (fsSync.existsSync(traceCandidate))
          normalized.push({
            candidate_path: normalizeSlash(path.relative(workItemDir, traceCandidate)),
            target_path: `.specforge/project/modules/${moduleName}/trace.md`,
            operation: 'replace',
            type: 'module_trace',
            inferred: true,
            normalized: true,
          });
      }
    } catch {
      /* absent v1.14 module candidates */
    }
  } // Important P0 follow-up:
  // Do not infer a root-level trace_delta.md entry here. Candidate Gate requires
  // candidate_path to be under candidates/, and approval/merge must compare the
  // manifest against exactly the same normalized object that Gate accepted.
  // If trace_delta is intended to be merged, it must be explicitly present as
  // candidates/trace_delta.md in candidate_manifest entries or candidates[].
  const traceDeltaCandidatePath = path.join(workItemDir, 'candidates', 'trace_delta.md');
  const alreadyHasTrace = normalized.some(entry =>
    normalizeSlash(entry.target_path).endsWith('trace_matrix.md')
  );
  if (
    fsSync.existsSync(traceDeltaCandidatePath) &&
    !alreadyHasTrace &&
    manifest?.workflow_path !== 'code_only_fast_path'
  ) {
    normalized.push({
      candidate_path: 'candidates/trace_delta.md',
      target_path: '.specforge/project/trace_matrix.md',
      operation: 'replace',
      type: 'trace_delta',
      inferred: false,
      normalized: true,
    });
  }

  const seen = new Set<string>();
  return normalized.filter(entry => {
    const key = (entry.candidate_path + '=>' + entry.target_path).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function entriesSemanticallyEqual(a: ManifestEntry[], b: ManifestEntry[]): boolean {
  const canon = (items: ManifestEntry[]) =>
    items
      .map(e => ({
        candidate_path: normalizeSlash(e.candidate_path),
        target_path: normalizeSlash(e.target_path),
        operation: String(e.operation ?? 'replace'),
        type: e.type,
      }))
      .sort((x, y) =>
        `${x.candidate_path}|${x.target_path}`.localeCompare(`${y.candidate_path}|${y.target_path}`)
      );
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

export function extractOverallGateStatus(summary: string | null): string {
  if (!summary) return 'missing';
  const match = summary.match(/Overall Status:\s*([^\r\n]+)/i);
  return match ? match[1].trim().toLowerCase() : 'missing';
}

async function readWorkItemFacts(
  projectRoot: string,
  workItemDir: string,
  workItemId: string
): Promise<Record<string, any>> {
  const workItem = await readJsonOrNull<Record<string, any>>(
    path.join(workItemDir, 'work_item.json')
  );
  const trigger = await readJsonOrNull<Record<string, any>>(
    path.join(workItemDir, 'trigger_result.json')
  );
  const manifest = await readJsonOrNull<Record<string, any>>(
    path.join(workItemDir, 'candidate_manifest.json')
  );
  const runtime = await readJsonOrNull<Record<string, any>>(
    path.join(projectRoot, '.specforge', 'runtime', 'state.json')
  );
  let runtimeItem: any = null;
  if (runtime?.work_item_id === workItemId) runtimeItem = runtime;
  if (!runtimeItem && Array.isArray(runtime?.workItems))
    runtimeItem = runtime.workItems.find((x: any) => x?.work_item_id === workItemId) ?? null;
  const workflowPath =
    workItem?.workflow_path ??
    trigger?.workflow_path ??
    manifest?.workflow_path ??
    runtimeItem?.workflow_path;
  const currentState = runtimeItem?.current_state ?? runtimeItem?.status ?? null;
  return { workItem, trigger, manifest, runtimeItem, workflowPath, currentState };
}

async function validateCandidateManifest(
  projectRoot: string,
  workItemDir: string,
  workItemId: string,
  errors: string[]
): Promise<any> {
  const manifestPath = path.join(workItemDir, 'candidate_manifest.json');
  const manifest = await readJsonOrNull<Record<string, any>>(manifestPath);
  if (!manifest) {
    errors.push('candidate_manifest.json is missing or invalid JSON');
    return null;
  }
  if (manifest.work_item_id && manifest.work_item_id !== workItemId)
    errors.push(`candidate_manifest.work_item_id mismatch: ${manifest.work_item_id}`);
  const workflowPath = manifest.workflow_path;
  if (!VALID_WORKFLOW_PATHS.has(String(workflowPath)))
    errors.push(`candidate_manifest.workflow_path invalid: ${workflowPath ?? 'missing'}`);
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const inferred = inferManifestEntries(manifest, workItemDir);
  if (workflowPath !== 'code_only_fast_path') {
    if (entries.length === 0)
      errors.push(
        'candidate_manifest.entries must be non-empty before approval/merge for spec-changing workflows'
      );
    if (!entriesSemanticallyEqual(entries, inferred))
      errors.push(
        'candidate_manifest.entries must be normalized before approval; merge_runner must not infer or mutate entries after approval'
      );
  }
  for (const [i, entry] of entries.entries()) {
    const candidatePath = normalizeSlash(entry?.candidate_path ?? entry?.path ?? '');
    const targetPath = normalizeSlash(entry?.target_path ?? '');
    if (!candidatePath) errors.push(`candidate_manifest.entries[${i}].candidate_path missing`);
    if (!targetPath) errors.push(`candidate_manifest.entries[${i}].target_path missing`);
    if (candidatePath.includes('..'))
      errors.push(`candidate_manifest.entries[${i}].candidate_path contains ..`);
    if (targetPath.includes('..'))
      errors.push(`candidate_manifest.entries[${i}].target_path contains ..`);
    if (
      targetPath &&
      !targetPath.startsWith('.specforge/project/') &&
      !targetPath.startsWith('project/')
    ) {
      errors.push(
        `candidate_manifest.entries[${i}].target_path must point to .specforge/project/: ${targetPath}`
      );
    }
    const candidateFullPath = path.resolve(workItemDir, candidatePath);
    const workItemRoot = path.resolve(workItemDir);
    if (!candidateFullPath.toLowerCase().startsWith(workItemRoot.toLowerCase()))
      errors.push(`candidate_manifest.entries[${i}].candidate_path outside WI`);
    try {
      await fs.access(candidateFullPath);
    } catch {
      errors.push(`candidate file missing: ${candidatePath}`);
    }
  }
  return manifest;
}

async function validateGatePassed(workItemDir: string, errors: string[]): Promise<void> {
  const summary = await readTextOrNull(path.join(workItemDir, 'gate_summary.md'));
  const status = extractOverallGateStatus(summary);
  if (!['passed', 'passed_with_waiver_required'].includes(status))
    errors.push(
      `gate_summary Overall Status must be passed before approval/merge/close, got ${status}`
    );
  if (summary && /Some hard gates failed/i.test(summary))
    errors.push('gate_summary says hard gates failed; user cannot approve');
  const gatesDir = path.join(workItemDir, 'gates');
  for (const gateName of ['required_files_gate', 'candidate_manifest_gate', 'path_policy_gate']) {
    const gate = await readJsonOrNull<Record<string, any>>(path.join(gatesDir, `${gateName}.json`));
    if (
      gate &&
      gate.required !== false &&
      !['passed', 'not_applicable'].includes(String(gate.status))
    ) {
      errors.push(`${gateName}.json status must be passed/not_applicable, got ${gate.status}`);
    }
  }
}

export async function validateDecisionRecordPreconditions(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
  requestedWorkflowPath?: string;
  decisionStatus: string;
  decisionType: string;
  decidedBy: string;
  currentState?: string;
}): Promise<GovernanceValidationResult> {
  const errors: string[] = [];
  const facts = await readWorkItemFacts(input.projectRoot, input.workItemDir, input.workItemId);
  if (typeof input.currentState === 'string' && input.currentState.length > 0)
    facts.currentState = input.currentState;
  const workflowPath = input.requestedWorkflowPath || facts.workflowPath;
  if (
    !workflowPath ||
    workflowPath === 'unknown' ||
    !VALID_WORKFLOW_PATHS.has(String(workflowPath))
  )
    errors.push(`workflow_path invalid for user_decision: ${workflowPath ?? 'missing'}`);
  if (
    input.requestedWorkflowPath &&
    facts.workflowPath &&
    input.requestedWorkflowPath !== facts.workflowPath
  )
    errors.push(
      `workflow_path mismatch: requested=${input.requestedWorkflowPath}, work_item=${facts.workflowPath}`
    );
  if (facts.workItem?.workflow_path && workflowPath !== facts.workItem.workflow_path)
    errors.push(
      `user_decision.workflow_path must equal work_item.workflow_path: ${workflowPath} != ${facts.workItem.workflow_path}`
    );
  if (facts.trigger?.workflow_path && workflowPath !== facts.trigger.workflow_path)
    errors.push(
      `user_decision.workflow_path must equal trigger_result.workflow_path: ${workflowPath} != ${facts.trigger.workflow_path}`
    );
  if (facts.manifest?.workflow_path && workflowPath !== facts.manifest.workflow_path)
    errors.push(
      `user_decision.workflow_path must equal candidate_manifest.workflow_path: ${workflowPath} != ${facts.manifest.workflow_path}`
    );

  await validateCandidateManifest(input.projectRoot, input.workItemDir, input.workItemId, errors);

  if (USER_APPROVAL_REQUIRED_PATHS.has(String(workflowPath))) {
    if (facts.currentState !== 'approval_required')
      errors.push(
        `user_decision_record requires approval_required state for ${workflowPath}, current=${facts.currentState ?? 'missing'}`
      );
    await validateGatePassed(input.workItemDir, errors);
    if (
      input.decisionStatus === 'approved' &&
      input.decisionType === 'user_approved' &&
      isKnownAgentActor(input.decidedBy)
    ) {
      errors.push(`user_approved cannot be recorded by Agent actor: ${input.decidedBy}`);
    }
    if (input.decisionStatus === 'approved' && input.decisionType !== 'user_approved')
      errors.push(`approved decision for ${workflowPath} must use decision_type=user_approved`);
  }
  return {
    valid: errors.length === 0,
    errors,
    facts: { workflowPath, currentState: facts.currentState, decidedBy: input.decidedBy },
  };
}

export async function validateApprovedUserDecisionForMerge(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
  candidateManifestPath: string;
  userDecisionPath: string;
}): Promise<GovernanceValidationResult> {
  const errors: string[] = [];
  const facts = await readWorkItemFacts(input.projectRoot, input.workItemDir, input.workItemId);
  const decision = await readJsonOrNull<Record<string, any>>(input.userDecisionPath);
  if (!decision) errors.push('user_decision.json is missing or invalid JSON');
  const workflowPath = decision?.workflow_path;
  if (
    !workflowPath ||
    workflowPath === 'unknown' ||
    !VALID_WORKFLOW_PATHS.has(String(workflowPath))
  )
    errors.push(`user_decision.workflow_path invalid: ${workflowPath ?? 'missing'}`);
  if (facts.workItem?.workflow_path && workflowPath !== facts.workItem.workflow_path)
    errors.push(
      `user_decision.workflow_path != work_item.workflow_path: ${workflowPath} != ${facts.workItem.workflow_path}`
    );
  if (facts.trigger?.workflow_path && workflowPath !== facts.trigger.workflow_path)
    errors.push(
      `user_decision.workflow_path != trigger_result.workflow_path: ${workflowPath} != ${facts.trigger.workflow_path}`
    );
  if (facts.manifest?.workflow_path && workflowPath !== facts.manifest.workflow_path)
    errors.push(
      `user_decision.workflow_path != candidate_manifest.workflow_path: ${workflowPath} != ${facts.manifest.workflow_path}`
    );

  await validateCandidateManifest(input.projectRoot, input.workItemDir, input.workItemId, errors);
  await validateGatePassed(input.workItemDir, errors);

  if (USER_APPROVAL_REQUIRED_PATHS.has(String(workflowPath))) {
    if (decision?.decision_status !== 'approved')
      errors.push(
        `spec-changing workflow requires decision_status=approved, got ${decision?.decision_status}`
      );
    if (decision?.decision_type !== 'user_approved')
      errors.push(
        `spec-changing workflow requires decision_type=user_approved, got ${decision?.decision_type}`
      );
    if (isKnownAgentActor(decision?.decided_by))
      errors.push(`user approval cannot be by Agent actor: ${decision?.decided_by}`);
  } else if (decision && !['approved', 'waived'].includes(String(decision.decision_status))) {
    errors.push(`User Decision status is not approved/waived: ${decision.decision_status}`);
  }

  const currentManifestHash = await computeFileHash(input.candidateManifestPath);
  const currentGateSummaryHash = await computeFileHash(
    path.join(input.workItemDir, 'gate_summary.md')
  );
  const currentCandidateHash = await computeCandidateHash(input.workItemDir);
  if (decision?.manifest_hash && decision.manifest_hash !== currentManifestHash)
    errors.push(
      'user_decision.manifest_hash does not match current candidate_manifest.json; approval target changed'
    );
  if (decision?.gate_summary_hash && decision.gate_summary_hash !== currentGateSummaryHash)
    errors.push(
      'user_decision.gate_summary_hash does not match current gate_summary.md; gate result changed after approval'
    );
  if (decision?.candidate_hash && decision.candidate_hash !== currentCandidateHash)
    errors.push(
      'user_decision.candidate_hash does not match current candidates/ content; candidate changed after approval'
    );

  return {
    valid: errors.length === 0,
    errors,
    facts: { workflowPath, decidedBy: decision?.decided_by },
  };
}

export async function validateApprovedUserDecisionForClose(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
  candidateManifestPath: string;
  userDecisionPath: string;
}): Promise<GovernanceValidationResult> {
  const errors: string[] = [];
  const facts = await readWorkItemFacts(input.projectRoot, input.workItemDir, input.workItemId);
  const decision = await readJsonOrNull<Record<string, any>>(input.userDecisionPath);
  if (!decision) errors.push('user_decision.json is missing or invalid JSON');

  const workflowPath = String(decision?.workflow_path ?? facts.workflowPath ?? '');
  if (!workflowPath || workflowPath === 'unknown' || !VALID_WORKFLOW_PATHS.has(workflowPath)) {
    errors.push(`user_decision.workflow_path invalid for close: ${workflowPath || 'missing'}`);
  }
  if (facts.workItem?.workflow_path && workflowPath !== facts.workItem.workflow_path) {
    errors.push(
      `user_decision.workflow_path != work_item.workflow_path: ${workflowPath} != ${facts.workItem.workflow_path}`
    );
  }
  if (facts.trigger?.workflow_path && workflowPath !== facts.trigger.workflow_path) {
    errors.push(
      `user_decision.workflow_path != trigger_result.workflow_path: ${workflowPath} != ${facts.trigger.workflow_path}`
    );
  }
  if (facts.manifest?.workflow_path && workflowPath !== facts.manifest.workflow_path) {
    errors.push(
      `user_decision.workflow_path != candidate_manifest.workflow_path: ${workflowPath} != ${facts.manifest.workflow_path}`
    );
  }

  if (USER_APPROVAL_REQUIRED_PATHS.has(workflowPath)) {
    if (decision?.decision_status !== 'approved')
      errors.push(
        `spec-changing workflow requires decision_status=approved for close, got ${decision?.decision_status}`
      );
    if (decision?.decision_type !== 'user_approved')
      errors.push(
        `spec-changing workflow requires decision_type=user_approved for close, got ${decision?.decision_type}`
      );
    if (isKnownAgentActor(decision?.decided_by))
      errors.push(`user approval cannot be by Agent actor for close: ${decision?.decided_by}`);
  } else if (decision && !['approved', 'waived'].includes(String(decision.decision_status))) {
    errors.push(
      `User Decision status is not approved/waived for close: ${decision.decision_status}`
    );
  }

  // Close is post-merge. Pre-merge hashes (candidate_hash, manifest_hash,
  // gate_summary_hash) are enforced by validateApprovedUserDecisionForMerge().
  // Rechecking them here incorrectly blocks a completed, verified workflow after
  // merge has normalized candidate_manifest or gate_summary has been overwritten
  // by close-gate output. Close must validate the approval subject and rely on
  // merge_report, verification_report, evidence_manifest and write-permission
  // revocation checks for post-merge integrity.
  return {
    valid: errors.length === 0,
    errors,
    facts: {
      workflowPath,
      decidedBy: decision?.decided_by,
      close_validation: 'post_merge_no_pre_merge_hash_recheck',
    },
  };
}
