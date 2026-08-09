import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  ContractRegistrySchema,
  extractModuleFromDdId,
  isValidDesignDecisionId,
  resolveSpecModuleIdentity,
} from '@specforge/types';
import { evaluateChangedFilesAuditVerdict } from './changed-files-audit-verdict.js';
import {
  applyGovernanceTraceDelta,
  compareGovernanceTraceEdges,
  getGovernanceContractConsumers,
  moduleTraceProjection,
  normalizeGovernanceTraceEdges,
  parseGovernanceTrace,
  parseGovernanceTraceDelta,
  validateGovernanceTraceSemantics,
  type GovernanceContractConsumer,
  type GovernanceTraceDeltaOperation,
  type GovernanceTraceEdge,
  type GovernanceTraceIssue,
} from './governance-trace-model.js';
import { getFactualChangedFiles } from './write-guard-log.js';
import { computeFilesystemDiff, loadBaseline } from './filesystem-diff.js';
import {
  workItemCandidateTasks,
  workItemCandidateTraceDelta,
  workItemTasks,
  workItemTraceDelta,
} from '@specforge/types/directory-layout';

const execFileAsync = promisify(execFile);
const SPEC_DIR = '.specforge';

export interface ImpactScope {
  affected_modules: string[];
  architecture_refs: string[];
  data_model_refs: string[];
  design_refs: string[];
  project_contract_refs: string[];
  module_contract_refs: string[];
  planned_code_paths: string[];
}

export interface GovernanceCheck {
  check_id: string;
  description: string;
  passed: boolean;
  severity?: 'error' | 'warning' | 'info';
  details?: string;
}

export interface GovernanceCheckResult {
  active: boolean;
  passed: boolean;
  checks: GovernanceCheck[];
  inputFiles: string[];
}

export interface GovernanceScopeSnapshot {
  schema_version: '1.0';
  work_item_id: string;
  active: boolean;
  affected_modules: string[];
  allowed_write_files: string[];
  architecture_refs: string[];
  data_model_refs: string[];
  design_refs: string[];
  project_contract_refs: string[];
  module_contract_refs: string[];
  project_spec_version: string;
  impact_scope_hash: string;
  frozen_at: string;
}

type ContractEntry = {
  id: string;
  owner_module: string;
  source_refs: string[];
  enforcement: string;
  kind: string;
  module_internal: boolean;
  raw: Record<string, unknown>;
};

type ModuleModel = {
  module_code: string;
  code_paths_declared: boolean;
  contract_file_exists: boolean;
  contract_file_valid: boolean;
  contract_file_owner: string;
  design_path: string;
  contracts_path: string;
  contracts_declared: boolean;
  trace_path: string;
  trace_edges: GovernanceTraceEdge[];
  trace_generated: boolean;
  code_paths: string[];
  design_ids: string[];
  design_text: string;
  contract_entries: ContractEntry[];
};

type TraceEdge = GovernanceTraceEdge;

type ProjectModel = {
  active: boolean;
  default_module: string;
  manifest: any;
  manifestPath: string;
  architecturePath: string;
  dataModelPath: string;
  architectureIds: string[];
  dataModelIds: string[];
  dataModelNotApplicable: boolean;
  modules: ModuleModel[];
  contracts: ContractEntry[];
  trace: TraceEdge[];
  current_trace: TraceEdge[];
  trace_delta_operations: GovernanceTraceDeltaOperation[];
  trace_issues: GovernanceTraceIssue[];
  already_merged: boolean;
  inputFiles: string[];
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function slash(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/');
}

function absolute(projectRoot: string, value: string): string {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(projectRoot, value);
}

async function readText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function readFirstExistingText(
  filePaths: string[],
): Promise<{ path: string; content: string } | null> {
  for (const filePath of filePaths) {
    try {
      return { path: filePath, content: await fs.readFile(filePath, 'utf8') };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
    }
  }
  return null;
}

async function readJson(filePath: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function digest(value: unknown): string {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return unique(value.map(item => String(item ?? '').trim()).filter(Boolean));
}
export function isSpecMigrationNoCodeWorkflow(
  workflowType: unknown,
  workflowPath: unknown,
): boolean {
  const type = String(workflowType ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  const route = String(workflowPath ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  return type === 'spec_migration' || route === 'spec_migration_path';
}

export function normalizeImpactScope(value: unknown): ImpactScope {
  const scope = value && typeof value === 'object' ? (value as any) : {};
  const affectedModules = [
    ...normalizeArray(scope.affected_modules),
    ...normalizeArray(scope.existing_modules),
    ...normalizeArray(scope.new_modules),
  ];
  return {
    affected_modules: unique(affectedModules),
    architecture_refs: normalizeArray(scope.architecture_refs),
    data_model_refs: normalizeArray(scope.data_model_refs),
    design_refs: normalizeArray(scope.design_refs),
    project_contract_refs: normalizeArray(scope.project_contract_refs),
    module_contract_refs: normalizeArray(scope.module_contract_refs),
    planned_code_paths: normalizeArray(scope.planned_code_paths),
  };
}

function isCrossModuleTestHarnessPath(value: string): boolean {
  const normalized = slash(value);
  return (
    normalized.startsWith('tests/') ||
    /(?:^|\/)[^/]+\.(?:integration\.)?test\.[cm]?[jt]sx?$/i.test(normalized)
  );
}

async function readApprovedTaskFiles(workItemDir: string): Promise<Set<string>> {
  const approved = new Set<string>();
  const projectRoot = path.resolve(workItemDir, '..', '..', '..');
  const workItemId = path.basename(workItemDir);
  const artifact = await readFirstExistingText([
    workItemCandidateTasks(projectRoot, workItemId),
    workItemTasks(projectRoot, workItemId),
  ]);
  if (!artifact) return approved;

  for (const match of artifact.content.matchAll(/\*\*files\*\*\s*:\s*\[([^\]]*)\]/gi)) {
    for (const raw of match[1].split(',')) {
      const candidate = slash(raw.replace(/[`'"]/g, '').trim());
      if (candidate) approved.add(candidate);
    }
  }
  return approved;
}

function isApprovedMergedArchitectureScope(
  trigger: any,
  model: ProjectModel,
  workItemId: string,
): boolean {
  return (
    String(trigger?.workflow_path ?? '') === 'architecture_change_path' &&
    trigger?.classification?.architecture_changed === true &&
    String(model.manifest?.last_merged_work_item ?? '') === workItemId
  );
}

function extractIds(text: string, prefix: 'ARCH' | 'DATA' | 'DD'): string[] {
  const candidates = text.match(new RegExp(`\\b${prefix}-[A-Z][A-Z0-9]{1,11}-[0-9]{3}\\b`, 'g')) ?? [];
  return unique(
    candidates.filter(id => prefix !== 'DD' || isValidDesignDecisionId(id)),
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegex(pattern: string): RegExp {
  const normalized = slash(pattern).replace(/^\/+/, '');
  let expression = '^';
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char === '*') {
      if (normalized[i + 1] === '*') {
        i += 1;
        expression += '.*';
      } else {
        expression += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      expression += '[^/]';
      continue;
    }
    expression += escapeRegex(char);
  }
  return new RegExp(`${expression}$`);
}

export function resolveModuleOwnershipFromManifest(manifest: any, filePath: string): string[] {
  const relative = slash(filePath).replace(/^\/+/, '');
  const owners: string[] = [];
  for (const raw of Array.isArray(manifest?.modules) ? manifest.modules : []) {
    const identity = resolveSpecModuleIdentity(raw);
    if (!identity.valid || !identity.moduleCode) continue;
    const patterns = normalizeArray((raw as any).code_paths);
    if (patterns.some(pattern => globToRegex(pattern).test(relative))) {
      owners.push(identity.moduleCode);
    }
  }
  return unique(owners);
}

function candidateAbsolute(projectRoot: string, workItemDir: string, candidatePath: string): string {
  if (path.isAbsolute(candidatePath)) return candidatePath;
  const normalized = slash(candidatePath);
  return normalized.startsWith(`${SPEC_DIR}/`)
    ? absolute(projectRoot, normalized)
    : absolute(workItemDir, normalized);
}

async function prospectiveReader(projectRoot: string, workItemDir: string) {
  const manifestPath = path.join(workItemDir, 'candidate_manifest.json');
  const candidate = await readJson(manifestPath);
  const targetMap = new Map<string, { operation: string; candidate?: string }>();

  for (const entry of Array.isArray(candidate?.entries) ? candidate.entries : []) {
    const target = slash(String(entry?.target_path ?? ''));
    if (!target) continue;
    targetMap.set(target, {
      operation: String(entry?.operation ?? 'replace'),
      candidate: entry?.candidate_path
        ? candidateAbsolute(projectRoot, workItemDir, String(entry.candidate_path))
        : undefined,
    });
  }

  async function text(targetPath: string): Promise<string> {
    const relative = slash(path.relative(projectRoot, targetPath));
    const entry = targetMap.get(relative) ?? targetMap.get(slash(targetPath));
    if (entry?.operation === 'delete') return '';
    if (entry?.candidate) return readText(entry.candidate);
    return readText(targetPath);
  }

  async function json(targetPath: string): Promise<any | null> {
    const content = await text(targetPath);
    if (!content) return null;
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  return { candidate, text, json, targets: new Set(targetMap.keys()) };
}

function flattenContracts(registry: any, moduleInternal: boolean): ContractEntry[] {
  const result: ContractEntry[] = [];
  for (const field of ['shared_enums', 'invariants', 'public_interfaces', 'extension_points']) {
    for (const entry of Array.isArray(registry?.[field]) ? registry[field] : []) {
      if (!entry?.id) continue;
      result.push({
        id: String(entry.id),
        owner_module: String(entry.owner_module ?? ''),
        source_refs: normalizeArray(entry.source_refs),
        enforcement: String(entry.enforcement ?? '').trim(),
        kind: field,
        module_internal: moduleInternal,
        raw: entry as Record<string, unknown>,
      });
    }
  }
  return result;
}

function canonicalModuleEntry(moduleCode: string, existing: any = {}): any {
  const root = `${SPEC_DIR}/project/modules/${moduleCode}`;
  return {
    ...existing,
    module_code: moduleCode,
    path: existing?.path ?? root,
    module_file: existing?.module_file ?? `${root}/module.json`,
    requirements: existing?.requirements ?? `${root}/requirements.md`,
    design: existing?.design ?? `${root}/design.md`,
    trace: existing?.trace ?? `${root}/trace.md`,
  };
}

async function prospectiveModuleEntries(
  projectRoot: string,
  manifest: any,
  reader: Awaited<ReturnType<typeof prospectiveReader>>,
  prospective: boolean,
): Promise<any[]> {
  const entries = new Map<string, any>();
  for (const raw of Array.isArray(manifest?.modules) ? manifest.modules : []) {
    const identity = resolveSpecModuleIdentity(raw);
    if (!identity.valid || !identity.moduleCode) continue;
    entries.set(identity.moduleCode, canonicalModuleEntry(identity.moduleCode, raw));
  }

  if (!prospective) return Array.from(entries.values());

  for (const target of reader.targets) {
    const match = /^\.specforge\/project\/modules\/([^/]+)\/module\.json$/i.exec(target);
    if (!match?.[1]) continue;
    const moduleCode = match[1].toUpperCase();
    const modulePath = absolute(projectRoot, target);
    const definition = await reader.json(modulePath);
    const identity = resolveSpecModuleIdentity(definition);
    if (!identity.valid || identity.moduleCode !== moduleCode) continue;
    const existing = entries.get(moduleCode) ?? {};
    entries.set(
      moduleCode,
      canonicalModuleEntry(moduleCode, {
        ...existing,
        ...definition,
        module_code: moduleCode,
      }),
    );
  }

  return Array.from(entries.values());
}

async function loadProjectModel(
  projectRoot: string,
  workItemDir: string,
  prospective: boolean,
): Promise<ProjectModel> {
  const workItemId = path.basename(workItemDir);
  const reader = await prospectiveReader(projectRoot, workItemDir);
  const manifestPath = path.join(projectRoot, SPEC_DIR, 'project', 'spec_manifest.json');
  const formalManifest = await readJson(manifestPath);
  const alreadyMerged = String(formalManifest?.last_merged_work_item ?? '') === workItemId;
  const useCandidateProjection = prospective && !alreadyMerged;
  const manifest = useCandidateProjection ? await reader.json(manifestPath) : formalManifest;
  const project = manifest?.project ?? {};

  const architecturePath = absolute(
    projectRoot,
    String(project.architecture ?? `${SPEC_DIR}/project/architecture.md`),
  );
  const dataModelPath = absolute(
    projectRoot,
    String(project.data_model ?? `${SPEC_DIR}/project/data_model.md`),
  );
  const architectureText = useCandidateProjection
    ? await reader.text(architecturePath)
    : await readText(architecturePath);
  const dataModelText = useCandidateProjection
    ? await reader.text(dataModelPath)
    : await readText(dataModelPath);
  const architectureIds = extractIds(architectureText, 'ARCH');
  const dataModelIds = extractIds(dataModelText, 'DATA');
  const dataModelNotApplicable = /\bDATA_MODEL_NOT_APPLICABLE\b/.test(dataModelText);

  const modules: ModuleModel[] = [];
  const contracts: ContractEntry[] = [];
  const inputFiles = [manifestPath, architecturePath, dataModelPath];
  const traceIssues: GovernanceTraceIssue[] = [];

  const extensionRegistryPath = absolute(
    projectRoot,
    String(project.extension_registry ?? `${SPEC_DIR}/project/extension_registry.json`),
  );
  const extensionRegistry = useCandidateProjection
    ? await reader.json(extensionRegistryPath)
    : await readJson(extensionRegistryPath);
  if (extensionRegistry?.contracts) {
    contracts.push(...flattenContracts(extensionRegistry.contracts, false));
  }
  inputFiles.push(extensionRegistryPath);

  const projectTracePath = absolute(
    projectRoot,
    String(project.trace_matrix ?? `${SPEC_DIR}/project/trace_matrix.md`),
  );
  // The candidate artifact is a Delta, never a replacement truth source. Always
  // read the current formal matrix directly and apply the Delta below.
  const currentTraceParse = parseGovernanceTrace(await readText(projectTracePath), projectTracePath);
  traceIssues.push(...currentTraceParse.issues);
  const currentTrace = currentTraceParse.edges;
  inputFiles.push(projectTracePath);

  const effectiveModuleEntries = await prospectiveModuleEntries(
    projectRoot,
    manifest,
    reader,
    useCandidateProjection,
  );

  for (const raw of effectiveModuleEntries) {
    const identity = resolveSpecModuleIdentity(raw);
    if (!identity.valid || !identity.moduleCode) continue;
    const moduleCode = identity.moduleCode;
    const moduleRoot = `${SPEC_DIR}/project/modules/${moduleCode}`;
    const moduleFilePath = absolute(
      projectRoot,
      String(raw.module_file ?? `${moduleRoot}/module.json`),
    );
    const moduleDefinition = useCandidateProjection
      ? await reader.json(moduleFilePath)
      : await readJson(moduleFilePath);
    const designPath = absolute(projectRoot, String(raw.design ?? `${moduleRoot}/design.md`));
    const configuredContracts =
      raw.contracts ?? moduleDefinition?.contracts ?? `${moduleRoot}/contracts.json`;
    const contractsPath = absolute(projectRoot, String(configuredContracts));
    const tracePath = absolute(projectRoot, String(raw.trace ?? `${moduleRoot}/trace.md`));
    const designText = useCandidateProjection
      ? await reader.text(designPath)
      : await readText(designPath);
    const moduleContractJson = useCandidateProjection
      ? await reader.json(contractsPath)
      : await readJson(contractsPath);
    const registryParse = moduleContractJson
      ? ContractRegistrySchema.safeParse(moduleContractJson.contracts)
      : null;
    const parsedModuleContract =
      moduleContractJson &&
      moduleContractJson.schema_version === '1.0' &&
      typeof moduleContractJson.owner_module === 'string' &&
      moduleContractJson.owner_module.trim().length > 0 &&
      registryParse?.success
        ? {
            owner_module: moduleContractJson.owner_module.trim(),
            contracts: registryParse.data,
          }
        : null;
    const internalContracts = parsedModuleContract
      ? flattenContracts(parsedModuleContract.contracts, true)
      : [];
    contracts.push(...internalContracts);

    const codePathsDeclared =
      Array.isArray(raw.code_paths) || Array.isArray(moduleDefinition?.code_paths);
    const codePaths = normalizeArray(moduleDefinition?.code_paths ?? raw.code_paths);
    const contractsTarget = slash(path.relative(projectRoot, contractsPath));
    const contractsDeclared =
      (typeof raw.contracts === 'string' && String(raw.contracts).trim().length > 0) ||
      (typeof moduleDefinition?.contracts === 'string' &&
        String(moduleDefinition.contracts).trim().length > 0) ||
      (useCandidateProjection && reader.targets.has(contractsTarget));
    const moduleTraceText = await readText(tracePath);
    const moduleTraceParse = parseGovernanceTrace(moduleTraceText, tracePath);

    modules.push({
      module_code: moduleCode,
      code_paths_declared: codePathsDeclared,
      contract_file_exists: moduleContractJson !== null,
      contract_file_valid: parsedModuleContract !== null,
      contract_file_owner: parsedModuleContract?.owner_module ?? '',
      design_path: designPath,
      contracts_path: contractsPath,
      contracts_declared: contractsDeclared,
      trace_path: tracePath,
      trace_edges: moduleTraceParse.edges,
      trace_generated: /GENERATED_FROM_PROJECT_TRACE:\s*module projection/i.test(moduleTraceText),
      code_paths: codePaths,
      design_ids: extractIds(designText, 'DD'),
      design_text: designText,
      contract_entries: internalContracts,
    });
    inputFiles.push(moduleFilePath, designPath, contractsPath, tracePath);
  }

  let traceDeltaOperations: GovernanceTraceDeltaOperation[] = [];
  let trace = normalizeGovernanceTraceEdges(currentTrace);
  if (useCandidateProjection) {
    const traceDeltaArtifact = await readFirstExistingText([
      workItemCandidateTraceDelta(projectRoot, workItemId),
      workItemTraceDelta(projectRoot, workItemId),
    ]);
    if (traceDeltaArtifact?.content.trim()) {
      inputFiles.push(traceDeltaArtifact.path);
      const deltaParse = parseGovernanceTraceDelta(
        traceDeltaArtifact.content,
        traceDeltaArtifact.path,
      );
      traceDeltaOperations = deltaParse.operations;
      const projection = applyGovernanceTraceDelta({
        current: currentTrace,
        operations: traceDeltaOperations,
        inheritedIssues: deltaParse.issues,
      });
      trace = projection.prospective;
      traceIssues.push(...projection.issues);
    }
  }

  const designOwners = new Map<string, string>();
  for (const module of modules) {
    for (const designId of module.design_ids) designOwners.set(designId, module.module_code);
  }
  traceIssues.push(
    ...validateGovernanceTraceSemantics({
      edges: trace,
      context: {
        architecture_ids: architectureIds,
        data_model_ids: dataModelIds,
        design_owners: designOwners,
        contracts: contracts.map(contract => ({
          id: contract.id,
          owner_module: contract.owner_module,
          module_internal: contract.module_internal,
        })),
      },
    }),
  );

  // Compatibility rule: Architecture + Data Model are the migration boundary.
  const active = Boolean(
    architectureIds.length > 0 &&
      (dataModelIds.length > 0 || dataModelNotApplicable) &&
      modules.length > 0,
  );

  const effectiveManifest =
    manifest && typeof manifest === 'object'
      ? {
          ...manifest,
          modules: effectiveModuleEntries.map((raw: any) => {
            const identity = resolveSpecModuleIdentity(raw);
            const model = modules.find(item => item.module_code === identity.moduleCode);
            return model
              ? {
                  ...raw,
                  code_paths: model.code_paths,
                  ...(model.contracts_declared
                    ? { contracts: slash(path.relative(projectRoot, model.contracts_path)) }
                    : {}),
                }
              : raw;
          }),
        }
      : manifest;

  return {
    active,
    default_module: String(manifest?.default_module ?? '').trim().toUpperCase(),
    manifest: effectiveManifest,
    manifestPath,
    architecturePath,
    dataModelPath,
    architectureIds,
    dataModelIds,
    dataModelNotApplicable,
    modules,
    contracts,
    trace,
    current_trace: currentTrace,
    trace_delta_operations: traceDeltaOperations,
    trace_issues: traceIssues,
    already_merged: alreadyMerged,
    inputFiles: unique(inputFiles),
  };
}

async function readTrigger(workItemDir: string): Promise<any | null> {
  return readJson(path.join(workItemDir, 'trigger_result.json'));
}

function candidateHasTarget(candidate: any, suffix: string): boolean {
  return (Array.isArray(candidate?.entries) ? candidate.entries : []).some((entry: any) =>
    slash(String(entry?.target_path ?? '')).endsWith(slash(suffix)),
  );
}

function addCheck(
  checks: GovernanceCheck[],
  checkId: string,
  description: string,
  passed: boolean,
  details?: string,
  severity: GovernanceCheck['severity'] = 'error',
): void {
  checks.push({
    check_id: checkId,
    description,
    passed,
    severity: passed ? undefined : severity,
    details,
  });
}

function allIds(model: ProjectModel): Set<string> {
  return new Set([
    ...model.architectureIds,
    ...model.dataModelIds,
    ...model.modules.flatMap(module => module.design_ids),
    ...model.contracts.map(contract => contract.id),
  ]);
}

function designOwnerMap(model: ProjectModel): Map<string, string> {
  const owners = new Map<string, string>();
  for (const module of model.modules) {
    for (const designId of module.design_ids) owners.set(designId, module.module_code);
  }
  return owners;
}

function contractOwnerMap(model: ProjectModel): Map<string, string> {
  return new Map(model.contracts.map(contract => [contract.id, contract.owner_module]));
}

function contractConsumers(
  model: ProjectModel,
  contractIds?: Iterable<string>,
): GovernanceContractConsumer[] {
  return getGovernanceContractConsumers({
    edges: model.trace,
    design_owners: designOwnerMap(model),
    contract_ids: contractIds,
  });
}

function expandImpactScopeWithContractConsumers(
  scope: ImpactScope,
  model: ProjectModel,
): ImpactScope & { consumer_modules: string[]; consumer_design_refs: string[] } {
  const changedContracts = unique([
    ...scope.project_contract_refs,
    ...scope.module_contract_refs,
  ]);
  const consumers = contractConsumers(model, changedContracts);
  const consumerModules = unique(consumers.map(consumer => consumer.module_code));
  const consumerDesignRefs = unique(consumers.map(consumer => consumer.design_id));
  const consumerCodePaths = unique(
    model.modules
      .filter(module => consumerModules.includes(module.module_code))
      .flatMap(module => module.code_paths),
  );
  return {
    affected_modules: unique([...scope.affected_modules, ...consumerModules]),
    architecture_refs: scope.architecture_refs,
    data_model_refs: scope.data_model_refs,
    design_refs: unique([...scope.design_refs, ...consumerDesignRefs]),
    project_contract_refs: scope.project_contract_refs,
    module_contract_refs: scope.module_contract_refs,
    planned_code_paths: unique([...scope.planned_code_paths, ...consumerCodePaths]),
    consumer_modules: consumerModules,
    consumer_design_refs: consumerDesignRefs,
  };
}

function relationValid(edge: TraceEdge, model: ProjectModel): boolean {
  const architecture = new Set(model.architectureIds);
  const data = new Set(model.dataModelIds);
  const owners = designOwnerMap(model);
  const design = new Set(owners.keys());
  const contracts = new Map(model.contracts.map(contract => [contract.id, contract]));

  if (edge.relation === 'constrained_by') {
    if (data.has(edge.from) && architecture.has(edge.to)) return true;
    if (!design.has(edge.from)) return false;
    if (architecture.has(edge.to) || data.has(edge.to)) return true;
    const contract = contracts.get(edge.to);
    if (!contract) return false;
    return !contract.module_internal || owners.get(edge.from) === contract.owner_module;
  }
  return (
    contracts.has(edge.from) &&
    (architecture.has(edge.to) || data.has(edge.to) || design.has(edge.to))
  );
}

export type ProjectGovernanceContractConsumerSnapshot = {
  active: boolean;
  already_merged: boolean;
  contracts: Array<{
    id: string;
    owner_module: string;
    module_internal: boolean;
    kind: string;
    source_refs: string[];
    raw: Record<string, unknown>;
  }>;
  consumers: GovernanceContractConsumer[];
  trace: GovernanceTraceEdge[];
  current_trace: GovernanceTraceEdge[];
  trace_delta_operations: GovernanceTraceDeltaOperation[];
  trace_issues: GovernanceTraceIssue[];
  module_code_paths: Record<string, string[]>;
  inputFiles: string[];
};

export async function inspectProjectGovernanceContractConsumers(input: {
  projectRoot: string;
  workItemDir: string;
  prospective?: boolean;
}): Promise<ProjectGovernanceContractConsumerSnapshot> {
  const model = await loadProjectModel(
    input.projectRoot,
    input.workItemDir,
    input.prospective !== false,
  );
  return {
    active: model.active,
    already_merged: model.already_merged,
    contracts: model.contracts.map(contract => ({
      id: contract.id,
      owner_module: contract.owner_module,
      module_internal: contract.module_internal,
      kind: contract.kind,
      source_refs: contract.source_refs,
      raw: contract.raw,
    })),
    consumers: contractConsumers(model),
    trace: model.trace,
    current_trace: model.current_trace,
    trace_delta_operations: model.trace_delta_operations,
    trace_issues: model.trace_issues,
    module_code_paths: Object.fromEntries(
      model.modules.map(module => [module.module_code, module.code_paths]),
    ),
    inputFiles: model.inputFiles,
  };
}

export async function checkProjectGovernanceConsistency(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
}): Promise<GovernanceCheckResult> {
  const model = await loadProjectModel(input.projectRoot, input.workItemDir, true);
  const checks: GovernanceCheck[] = [];

  if (!model.active) {
    addCheck(
      checks,
      'project_governance_compatibility_mode',
      'Architecture/Data/Module governance stays compatibility-safe until formal Project Spec migration establishes Architecture and Data Model truth sources',
      true,
      'governance_active=false',
      'info',
    );
    return { active: false, passed: true, checks, inputFiles: model.inputFiles };
  }

  addCheck(
    checks,
    'architecture_ids_exist',
    'Formal Project Architecture contains stable ARCH-* IDs',
    model.architectureIds.length > 0,
  );
  addCheck(
    checks,
    'data_model_declared',
    'Formal Project Data Model contains DATA-* IDs or explicit DATA_MODEL_NOT_APPLICABLE',
    model.dataModelIds.length > 0 || model.dataModelNotApplicable,
  );

  for (const module of model.modules) {
    const governanceOnlyDefault =
      module.module_code === model.default_module &&
      module.code_paths_declared &&
      module.code_paths.length === 0 &&
      model.modules.some(
        candidate =>
          candidate.module_code !== module.module_code && candidate.code_paths.length > 0,
      );
    addCheck(
      checks,
      `module_${module.module_code}_code_paths`,
      `Module ${module.module_code} declares explicit code_paths in spec_manifest.json`,
      module.code_paths.length > 0 || governanceOnlyDefault,
      governanceOnlyDefault ? 'default Module is an explicit governance/specification root' : undefined,
    );
    addCheck(
      checks,
      `module_${module.module_code}_contracts_path`,
      `Module ${module.module_code} declares contracts.json in spec_manifest.json`,
      module.contracts_declared,
    );
    addCheck(
      checks,
      `module_${module.module_code}_design_ids`,
      `Module ${module.module_code} Design contains stable DD-* decisions`,
      module.design_ids.length > 0,
    );
  }

  for (const [index, issue] of model.trace_issues.entries()) {
    addCheck(
      checks,
      `governance_trace_issue_${index}`,
      issue.message,
      false,
      [issue.code, issue.source ?? '', issue.line ? `line=${issue.line}` : '']
        .filter(Boolean)
        .join('; '),
    );
  }

  const ids = allIds(model);
  for (const [index, edge] of model.trace.entries()) {
    addCheck(
      checks,
      `governance_trace_${index}_endpoints`,
      `${edge.from} ${edge.relation} ${edge.to}: both IDs exist`,
      ids.has(edge.from) && ids.has(edge.to),
      edge.source,
    );
    addCheck(
      checks,
      `governance_trace_${index}_shape`,
      `${edge.from} ${edge.relation} ${edge.to}: relation direction/type is legal`,
      relationValid(edge, model),
      edge.source,
    );
  }

  const trigger = await readTrigger(input.workItemDir);
  const workflowPath = String(trigger?.workflow_path ?? '');
  const declaredImpactScope = normalizeImpactScope(
    trigger?.impact_scope ?? trigger?.impact_summary,
  );
  const impactScope = expandImpactScopeWithContractConsumers(declaredImpactScope, model);

  if (workflowPath !== 'spec_migration_path') {
    addCheck(
      checks,
      'impact_scope_contract_consumers_expanded',
      'Impact Scope is expanded from changed Contracts to every formal DD and Module consumer',
      true,
      [
        `declared_modules=${declaredImpactScope.affected_modules.join(',') || 'none'}`,
        `consumer_modules=${impactScope.consumer_modules.join(',') || 'none'}`,
        `effective_modules=${impactScope.affected_modules.join(',') || 'none'}`,
      ].join('; '),
      'info',
    );
    const scopePresent = Object.values(impactScope).some(values => values.length > 0);
    addCheck(
      checks,
      'impact_scope_present',
      'Active governance requires a non-empty machine-readable Impact Scope',
      scopePresent,
    );

    for (const ref of [
      ...impactScope.architecture_refs,
      ...impactScope.data_model_refs,
      ...impactScope.design_refs,
      ...impactScope.project_contract_refs,
      ...impactScope.module_contract_refs,
    ]) {
      addCheck(
        checks,
        `impact_ref_${ref.replace(/[^A-Za-z0-9]/g, '_')}`,
        `Impact Scope reference exists: ${ref}`,
        ids.has(ref),
      );
    }

    for (const plannedPath of impactScope.planned_code_paths) {
      const owners = resolveModuleOwnershipFromManifest(model.manifest, plannedPath);
      addCheck(
        checks,
        `planned_code_owner_${digest(plannedPath).slice(0, 8)}`,
        `Planned code path maps to exactly one Module: ${plannedPath}`,
        owners.length === 1,
        `owners=${owners.join(',') || 'none'}`,
      );
      if (owners.length === 1) {
        addCheck(
          checks,
          `planned_code_scope_${digest(plannedPath).slice(0, 8)}`,
          `Planned code path owner is declared affected: ${plannedPath}`,
          impactScope.affected_modules.includes(owners[0]),
          `owner=${owners[0]}`,
        );
      }
    }

    const classification = trigger?.classification ?? {};
    const candidate = (await prospectiveReader(input.projectRoot, input.workItemDir)).candidate;
    if (classification.architecture_changed === true) {
      addCheck(
        checks,
        'architecture_candidate_required',
        'architecture_changed requires an Architecture Candidate',
        candidateHasTarget(candidate, '/architecture.md'),
      );
    }
    if (classification.data_model_changed === true) {
      addCheck(
        checks,
        'data_model_candidate_required',
        'data_model_changed requires a Project Data Model Candidate',
        candidateHasTarget(candidate, '/data_model.md'),
      );
    }
    if (classification.design_changed === true) {
      const present = (candidate?.entries ?? []).some((entry: any) =>
        /\/modules\/[^/]+\/design\.md$/.test(slash(String(entry?.target_path ?? ''))),
      );
      addCheck(
        checks,
        'design_candidate_required',
        'design_changed requires at least one Module Design Candidate',
        present,
      );
    }
    if (classification.module_contract_changed === true) {
      const present = (candidate?.entries ?? []).some((entry: any) =>
        /\/modules\/[^/]+\/contracts\.json$/.test(slash(String(entry?.target_path ?? ''))),
      );
      addCheck(
        checks,
        'module_contract_candidate_required',
        'module_contract_changed requires at least one Module Contract Candidate',
        present,
      );
    }

    if (workflowPath === 'code_only_fast_path') {
      const upperUnchanged =
        classification.architecture_changed === false &&
        classification.design_changed === false &&
        classification.api_contract_changed === false &&
        classification.data_semantics_changed === false &&
        classification.data_model_changed !== true &&
        classification.module_contract_changed !== true;
      addCheck(
        checks,
        'fast_path_upper_spec_unchanged',
        'Fast Path is legal only when Architecture/Data/Design/Contracts remain unchanged',
        upperUnchanged,
      );
      addCheck(
        checks,
        'fast_path_trace_unchanged',
        'Fast Path is legal only when formal Trace relations remain unchanged',
        model.trace_delta_operations.length === 0,
        `trace_delta_operations=${model.trace_delta_operations.length}`,
      );
    }
  }

  return {
    active: true,
    passed: checks.every(check => check.passed),
    checks,
    inputFiles: model.inputFiles,
  };
}

export async function checkProjectGovernanceContracts(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
}): Promise<GovernanceCheckResult> {
  const model = await loadProjectModel(input.projectRoot, input.workItemDir, true);
  const checks: GovernanceCheck[] = [];

  if (!model.active) {
    return {
      active: false,
      passed: true,
      checks: [
        {
          check_id: 'module_contract_compatibility_mode',
          description: 'Module Contract governance waits for formal Project Spec migration',
          passed: true,
          severity: 'info',
        },
      ],
      inputFiles: model.inputFiles,
    };
  }

  for (const [index, issue] of model.trace_issues.entries()) {
    addCheck(
      checks,
      `contract_trace_issue_${index}`,
      issue.message,
      false,
      issue.code,
    );
  }

  const contractIdCounts = new Map<string, number>();
  for (const contract of model.contracts) {
    contractIdCounts.set(contract.id, (contractIdCounts.get(contract.id) ?? 0) + 1);
  }
  for (const [contractId, count] of contractIdCounts) {
    addCheck(
      checks,
      `contract_${contractId}_unique_truth_source`,
      `Contract ${contractId} has exactly one governance-level definition`,
      count === 1,
      `definitions=${count}`,
    );
  }

  for (const module of model.modules) {
    addCheck(
      checks,
      `module_contract_${module.module_code}_exists`,
      `Module ${module.module_code} has a contracts.json`,
      module.contract_file_exists,
    );
    addCheck(
      checks,
      `module_contract_${module.module_code}_valid`,
      `Module ${module.module_code} contracts.json is valid`,
      module.contract_file_valid,
    );
    addCheck(
      checks,
      `module_contract_${module.module_code}_owner`,
      `Module ${module.module_code} contracts.json owner_module matches its directory Module`,
      module.contract_file_valid && module.contract_file_owner === module.module_code,
      `owner_module=${module.contract_file_owner || 'missing'}`,
    );
  }

  const architecture = new Set(model.architectureIds);
  const data = new Set(model.dataModelIds);
  const design = new Set(model.modules.flatMap(module => module.design_ids));

  for (const contract of model.contracts) {
    addCheck(
      checks,
      `contract_${contract.id}_owner`,
      `Contract ${contract.id} declares a valid owner Module`,
      model.modules.some(module => module.module_code === contract.owner_module),
      `owner=${contract.owner_module}`,
    );
    addCheck(
      checks,
      `contract_${contract.id}_source_refs`,
      `Contract ${contract.id} declares source_refs`,
      contract.source_refs.length > 0,
    );
    addCheck(
      checks,
      `contract_${contract.id}_enforcement`,
      `Contract ${contract.id} declares machine enforcement`,
      contract.enforcement.length > 0,
    );

    for (const ref of contract.source_refs) {
      const validSource = contract.module_internal
        ? design.has(ref) && extractModuleFromDdId(ref) === contract.owner_module
        : architecture.has(ref) || data.has(ref);
      addCheck(
        checks,
        `contract_${contract.id}_source_${ref.replace(/[^A-Za-z0-9]/g, '_')}`,
        `Contract ${contract.id} source is legal: ${ref}`,
        validSource,
      );
    }

    const consumers = contractConsumers(model, [contract.id]);
    for (const consumer of consumers) {
      addCheck(
        checks,
        `contract_${contract.id}_consumer_${consumer.design_id}`,
        `Contract ${contract.id} consumer ${consumer.design_id} resolves to Module ${consumer.module_code}`,
        Boolean(consumer.module_code),
      );
    }
    if (contract.module_internal) {
      const crossModule = consumers.filter(
        consumer => consumer.module_code !== contract.owner_module,
      );
      addCheck(
        checks,
        `contract_${contract.id}_internal_boundary`,
        `Internal Contract ${contract.id} is consumed only inside owner Module ${contract.owner_module}`,
        crossModule.length === 0,
        crossModule
          .map(consumer => `${consumer.design_id}->${consumer.module_code}`)
          .join(', ') || 'all consumers are internal',
      );
    }

  }

  return {
    active: true,
    passed: checks.every(check => check.passed),
    checks,
    inputFiles: model.inputFiles,
  };
}

export async function checkProjectGovernanceTrace(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
}): Promise<GovernanceCheckResult> {
  const model = await loadProjectModel(input.projectRoot, input.workItemDir, true);
  const checks: GovernanceCheck[] = [];

  if (!model.active) {
    return {
      active: false,
      passed: true,
      checks: [
        {
          check_id: 'governance_trace_compatibility_mode',
          description: 'Governance Trace semantics wait for formal Project Spec migration',
          passed: true,
          severity: 'info',
        },
      ],
      inputFiles: model.inputFiles,
    };
  }

  for (const [index, issue] of model.trace_issues.entries()) {
    addCheck(
      checks,
      `trace_model_issue_${index}`,
      issue.message,
      false,
      [issue.code, issue.source ?? ''].filter(Boolean).join('; '),
    );
  }

  const hasEdge = (from: string, relation: TraceEdge['relation'], to?: string) =>
    model.trace.some(
      edge => edge.from === from && edge.relation === relation && (!to || edge.to === to),
    );

  for (const dataId of model.dataModelIds) {
    const constrainedByArchitecture = model.trace.some(
      edge =>
        edge.from === dataId &&
        edge.relation === 'constrained_by' &&
        model.architectureIds.includes(edge.to),
    );
    addCheck(
      checks,
      `trace_data_${dataId}`,
      `Data design ${dataId} is constrained by Project Architecture`,
      constrainedByArchitecture,
    );
  }

  for (const module of model.modules) {
    for (const designId of module.design_ids) {
      addCheck(
        checks,
        `trace_dd_${designId}`,
        `Module Design ${designId} is constrained by Architecture, Data Model, or a formal Contract`,
        hasEdge(designId, 'constrained_by'),
      );
    }
  }

  for (const contract of model.contracts) {
    for (const ref of contract.source_refs) {
      addCheck(
        checks,
        `trace_contract_${contract.id}_${digest(ref).slice(0, 6)}`,
        `Contract ${contract.id} formally enforces source ${ref}`,
        hasEdge(contract.id, 'enforces', ref),
      );
    }
  }

  for (const [index, edge] of model.trace.entries()) {
    addCheck(
      checks,
      `trace_relation_${index}`,
      `${edge.from} ${edge.relation} ${edge.to} is semantically legal`,
      relationValid(edge, model),
      edge.source,
    );
  }

  if (model.already_merged) {
    const designOwners = designOwnerMap(model);
    const contractOwners = contractOwnerMap(model);
    for (const module of model.modules) {
      const expected = moduleTraceProjection({
        edges: model.trace,
        module_code: module.module_code,
        design_owners: designOwners,
        contract_owners: contractOwners,
      });
      const comparison = compareGovernanceTraceEdges(expected, module.trace_edges);
      addCheck(
        checks,
        `trace_module_view_${module.module_code}`,
        `Module ${module.module_code} trace.md is a generated projection of the canonical project Trace Matrix`,
        module.trace_generated && comparison.matches,
        [
          `generated=${module.trace_generated}`,
          `missing=${comparison.missing.join(',') || 'none'}`,
          `unexpected=${comparison.unexpected.join(',') || 'none'}`,
        ].join('; '),
      );
    }
  }

  return {
    active: true,
    passed: checks.every(check => check.passed),
    checks,
    inputFiles: model.inputFiles,
  };
}

function isSubset(child: string[], parent: string[]): boolean {
  return child.every(item => parent.includes(item));
}

export async function freezeGovernanceScopeForCodePermission(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
  allowedWriteFiles: Array<{ path: string; operation?: string }>;
}): Promise<{
  passed: boolean;
  error?: string;
  snapshot: GovernanceScopeSnapshot;
  checks: GovernanceCheck[];
}> {
  const model = await loadProjectModel(input.projectRoot, input.workItemDir, false);
  const trigger = await readTrigger(input.workItemDir);
  const declaredScope = normalizeImpactScope(trigger?.impact_scope ?? trigger?.impact_summary);
  const scope = expandImpactScopeWithContractConsumers(declaredScope, model);
  const mergedArchitectureScope = isApprovedMergedArchitectureScope(
    trigger,
    model,
    input.workItemId,
  );
  const approvedTaskFiles = await readApprovedTaskFiles(input.workItemDir);
  const allowedPaths = unique(
    input.allowedWriteFiles
      .map(entry => {
        const raw = String(entry?.path ?? '').trim();
        if (!raw) return '';
        return slash(path.isAbsolute(raw) ? path.relative(input.projectRoot, raw) : raw);
      })
      .filter(Boolean),
  );

  const snapshot: GovernanceScopeSnapshot = {
    schema_version: '1.0',
    work_item_id: input.workItemId,
    active: model.active,
    affected_modules: [],
    allowed_write_files: allowedPaths,
    architecture_refs: [],
    data_model_refs: [],
    design_refs: [],
    project_contract_refs: [],
    module_contract_refs: [],
    project_spec_version: String(model.manifest?.project_spec_version ?? ''),
    impact_scope_hash: digest(scope),
    frozen_at: new Date().toISOString(),
  };
  const checks: GovernanceCheck[] = [];

  if (!model.active) {
    checks.push({
      check_id: 'governance_scope_compatibility_mode',
      description:
        'Code Permission governance scope stays compatibility-safe until formal Project Spec migration',
      passed: true,
      severity: 'info',
    });
    return { passed: true, snapshot, checks };
  }

  const inferredModules: string[] = [];
  for (const allowedPath of allowedPaths) {
    const owners = resolveModuleOwnershipFromManifest(model.manifest, allowedPath);
    const approvedCrossModuleTestHarness =
      owners.length === 0 &&
      isCrossModuleTestHarnessPath(allowedPath) &&
      approvedTaskFiles.has(allowedPath);
    addCheck(
      checks,
      `permission_owner_${digest(allowedPath).slice(0, 8)}`,
      `Allowed write file maps to exactly one Module or an approved cross-module test harness: ${allowedPath}`,
      owners.length === 1 || approvedCrossModuleTestHarness,
      [
        `owners=${owners.join(',') || 'none'}`,
        `approved_cross_module_test_harness=${approvedCrossModuleTestHarness}`,
      ].join('; '),
    );
    if (owners.length === 1) inferredModules.push(owners[0]);
  }

  snapshot.affected_modules = unique([...inferredModules, ...scope.consumer_modules]);
  addCheck(
    checks,
    'permission_affected_modules_effective',
    'Code Permission scope includes every Module reached by files and every formal Contract consumer',
    isSubset(inferredModules, snapshot.affected_modules) &&
      isSubset(scope.consumer_modules, snapshot.affected_modules),
    [
      `file_modules=${unique(inferredModules).join(',') || 'none'}`,
      `consumer_modules=${scope.consumer_modules.join(',') || 'none'}`,
      `effective=${snapshot.affected_modules.join(',') || 'none'}`,
    ].join('; '),
  );

  for (const consumerModule of scope.consumer_modules) {
    const module = model.modules.find(candidate => candidate.module_code === consumerModule);
    const requiresCodeCoverage = Boolean(module && module.code_paths.length > 0);
    const coveredByAllowedFile = inferredModules.includes(consumerModule);
    addCheck(
      checks,
      `permission_consumer_module_${consumerModule}`,
      `Code Permission includes an approved file for Contract consumer Module ${consumerModule}`,
      !requiresCodeCoverage || coveredByAllowedFile,
      `code_paths=${module?.code_paths.join(',') || 'none'}; covered=${coveredByAllowedFile}`,
    );
  }

  const mergedModuleDesignRefs = unique(
    model.modules
      .filter(module => snapshot.affected_modules.includes(module.module_code))
      .flatMap(module => module.design_ids),
  );
  snapshot.design_refs = unique([
    ...scope.design_refs,
    ...(scope.design_refs.length === 0 && mergedArchitectureScope ? mergedModuleDesignRefs : []),
    ...scope.consumer_design_refs,
  ]);

  for (const moduleCode of snapshot.affected_modules) {
    const module = model.modules.find(candidate => candidate.module_code === moduleCode);
    const moduleRefs = snapshot.design_refs.filter(ref => extractModuleFromDdId(ref) === moduleCode);
    addCheck(
      checks,
      `permission_design_${moduleCode}`,
      `Impact Scope declares applicable DD refs for Module ${moduleCode}`,
      moduleRefs.length > 0 && moduleRefs.every(ref => module?.design_ids.includes(ref)),
      `refs=${moduleRefs.join(',') || 'none'}`,
    );
  }

  const designEdges = model.trace.filter(
    edge => snapshot.design_refs.includes(edge.from) && edge.relation === 'constrained_by',
  );
  snapshot.data_model_refs = unique(
    designEdges.filter(edge => model.dataModelIds.includes(edge.to)).map(edge => edge.to),
  );
  snapshot.architecture_refs = unique([
    ...designEdges
      .filter(edge => model.architectureIds.includes(edge.to))
      .map(edge => edge.to),
    ...model.trace
      .filter(
        edge =>
          snapshot.data_model_refs.includes(edge.from) &&
          edge.relation === 'constrained_by' &&
          model.architectureIds.includes(edge.to),
      )
      .map(edge => edge.to),
  ]);
  const designContractEdges = model.trace.filter(
    edge =>
      snapshot.design_refs.includes(edge.from) &&
      edge.relation === 'constrained_by' &&
      model.contracts.some(contract => contract.id === edge.to),
  );
  const consumedContractIds = unique(designContractEdges.map(edge => edge.to));
  snapshot.project_contract_refs = unique([
    ...scope.project_contract_refs,
    ...model.contracts
      .filter(contract => !contract.module_internal && consumedContractIds.includes(contract.id))
      .map(contract => contract.id),
  ]);
  snapshot.module_contract_refs = unique([
    ...scope.module_contract_refs,
    ...model.contracts
      .filter(contract => contract.module_internal && consumedContractIds.includes(contract.id))
      .map(contract => contract.id),
  ]);

  const contractSourceEdges = model.trace.filter(
    edge =>
      snapshot.project_contract_refs.includes(edge.from) && edge.relation === 'enforces',
  );
  snapshot.data_model_refs = unique([
    ...snapshot.data_model_refs,
    ...contractSourceEdges
      .filter(edge => model.dataModelIds.includes(edge.to))
      .map(edge => edge.to),
  ]);
  snapshot.architecture_refs = unique([
    ...snapshot.architecture_refs,
    ...contractSourceEdges
      .filter(edge => model.architectureIds.includes(edge.to))
      .map(edge => edge.to),
  ]);


  const comparisons: Array<[string, string[], string[]]> = [
    [
      'architecture',
      snapshot.architecture_refs,
      scope.architecture_refs.length > 0 || !mergedArchitectureScope
        ? scope.architecture_refs
        : snapshot.architecture_refs,
    ],
    [
      'data_model',
      snapshot.data_model_refs,
      scope.data_model_refs.length > 0 || !mergedArchitectureScope
        ? scope.data_model_refs
        : snapshot.data_model_refs,
    ],
    [
      'project_contract',
      snapshot.project_contract_refs,
      scope.project_contract_refs.length > 0 || !mergedArchitectureScope
        ? scope.project_contract_refs
        : snapshot.project_contract_refs,
    ],
    [
      'module_contract',
      snapshot.module_contract_refs,
      scope.module_contract_refs.length > 0 || !mergedArchitectureScope
        ? scope.module_contract_refs
        : snapshot.module_contract_refs,
    ],
  ];
  for (const [name, derived, declared] of comparisons) {
    addCheck(
      checks,
      `permission_${name}_scope`,
      `Impact Scope covers derived ${name} refs`,
      isSubset(derived, declared),
      `derived=${derived.join(',') || 'none'}; declared=${declared.join(',') || 'none'}`,
    );
  }

  const previous = (await readJson(
    path.join(input.workItemDir, 'governance_scope.json'),
  )) as GovernanceScopeSnapshot | null;
  if (previous?.active) {
    addCheck(
      checks,
      'permission_extension_same_modules',
      'Permission extension cannot add a new governance Module',
      isSubset(snapshot.affected_modules, previous.affected_modules),
    );
    addCheck(
      checks,
      'permission_extension_same_design',
      'Permission extension cannot add new Design scope',
      isSubset(snapshot.design_refs, previous.design_refs),
    );
    addCheck(
      checks,
      'permission_extension_same_data',
      'Permission extension cannot add new Data Model scope',
      isSubset(snapshot.data_model_refs, previous.data_model_refs),
    );
    addCheck(
      checks,
      'permission_extension_same_architecture',
      'Permission extension cannot add new Architecture scope',
      isSubset(snapshot.architecture_refs, previous.architecture_refs),
    );

    snapshot.allowed_write_files = unique([
      ...previous.allowed_write_files,
      ...allowedPaths,
    ]);
    snapshot.affected_modules = previous.affected_modules;
    snapshot.design_refs = previous.design_refs;
    snapshot.data_model_refs = previous.data_model_refs;
    snapshot.architecture_refs = previous.architecture_refs;
    snapshot.project_contract_refs = previous.project_contract_refs;
    snapshot.module_contract_refs = previous.module_contract_refs;
  }

  const passed = checks.every(check => check.passed);
  return {
    passed,
    error: passed ? undefined : 'SCOPE_EXPANSION_REQUIRED',
    snapshot,
    checks,
  };
}

export async function persistGovernanceScope(
  workItemDir: string,
  snapshot: GovernanceScopeSnapshot,
): Promise<string> {
  const output = path.join(workItemDir, 'governance_scope.json');
  await fs.writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  const workItemPath = path.join(workItemDir, 'work_item.json');
  const workItem = await readJson(workItemPath);
  if (workItem) {
    workItem.governance_scope = 'governance_scope.json';
    workItem.affected_modules = snapshot.affected_modules;
    workItem.architecture_refs = snapshot.architecture_refs;
    workItem.data_model_refs = snapshot.data_model_refs;
    workItem.design_refs = snapshot.design_refs;
    workItem.project_contract_refs = snapshot.project_contract_refs;
    workItem.module_contract_refs = snapshot.module_contract_refs;
    workItem.project_spec_version_at_permission = snapshot.project_spec_version;
    workItem.impact_scope_hash = snapshot.impact_scope_hash;
    await fs.writeFile(workItemPath, `${JSON.stringify(workItem, null, 2)}\n`, 'utf8');
  }
  return output;
}

function repositoryRelativePath(projectRoot: string, value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!path.isAbsolute(raw)) return slash(raw);
  const relative = path.relative(projectRoot, raw);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return slash(raw);
  return slash(relative);
}

/**
 * Read the durable, passed Changed Files Audit entry set.
 *
 * Recovery can legitimately start from a new daemon process where the
 * in-memory/write-guard observation stream is no longer available.  The
 * freshly regenerated changed_files_audit.md is therefore the durable
 * producer contract for the implementation file set used by Formal Version.
 * Only PASS reports and explicit in_scope entries are accepted.
 */
export function extractPassedChangedFilesAuditEntries(auditText: string): string[] {
  if (!evaluateChangedFilesAuditVerdict(auditText).passed) return [];

  const entriesMatch = auditText.match(
    /(?:^|\n)## Entries\s*\r?\n([\s\S]*?)(?=\r?\n##\s|\s*$)/,
  );
  if (!entriesMatch) return [];

  const files: string[] = [];
  for (const line of entriesMatch[1].split(/\r?\n/)) {
    const match = line.match(/^\s*-\s*\[[^\]]+\]\s+(.+?)\s+→\s+in_scope\s*$/);
    if (!match) continue;
    const file = slash(match[1].trim());
    if (!file || file === SPEC_DIR || file.startsWith(`${SPEC_DIR}/`)) continue;
    files.push(file);
  }
  return unique(files);
}

export async function deriveActualChangedFiles(
  projectRoot: string,
  workItemDir: string
): Promise<{ files: string[]; source: string }> {
  // A passed Changed Files Audit is the durable, phase-complete producer
  // contract.  It must take precedence over a later Write Guard log because
  // recovery/gate activity can append governance-only or blocked-operation
  // entries that do not describe the committed implementation file set.
  const auditPath = path.join(workItemDir, 'changed_files_audit.md');
  const auditFiles = normalizeFormalImplementationFiles(
    extractPassedChangedFilesAuditEntries(await readText(auditPath)),
    projectRoot,
  );
  if (auditFiles.length > 0) {
    return {
      files: auditFiles,
      source: 'changed_files_audit.md',
    };
  }

  // Before a durable PASS audit exists, successful Write Guard observations
  // remain the preferred live evidence.  Governance-only entries are removed
  // before deciding whether this source is usable; they must not suppress the
  // remaining fail-closed fallback chain.
  const factualFiles = normalizeFormalImplementationFiles(
    getFactualChangedFiles(workItemDir).map(entry => entry.path),
    projectRoot,
  );
  if (factualFiles.length > 0) {
    return {
      files: factualFiles,
      source: 'write_guard_log.jsonl',
    };
  }

  const workItem = await readJson(path.join(workItemDir, 'work_item.json'));
  if (Array.isArray(workItem?.actual_changed_files) && workItem.actual_changed_files.length > 0) {
    return {
      files: normalizeFormalImplementationFiles(
        workItem.actual_changed_files.map((entry: unknown) =>
          typeof entry === 'string'
            ? entry
            : String((entry as { path?: unknown } | null)?.path ?? '')
        ),
        projectRoot,
      ),
      source: 'work_item.actual_changed_files',
    };
  }

  const baseline = loadBaseline(workItemDir);
  if (baseline) {
    const diff = computeFilesystemDiff(baseline, projectRoot, []);
    if (diff.all_changes.length > 0) {
      return {
        files: normalizeFormalImplementationFiles(
          diff.all_changes.map(entry => entry.path),
          projectRoot,
        ),
        source: 'filesystem_baseline.json',
      };
    }
  }

  return { files: [], source: 'none' };
}

export async function auditActualGovernanceScope(input: {
  projectRoot: string;
  workItemDir: string;
  changedFiles?: Array<{ path: string }> | string[];
}): Promise<{
  passed: boolean;
  active: boolean;
  violations: string[];
  actual_modules: string[];
  actual_files: string[];
}> {
  const snapshot = (await readJson(
    path.join(input.workItemDir, 'governance_scope.json'),
  )) as GovernanceScopeSnapshot | null;

  // The governance activation flag controls module/scope enforcement only.
  // It must never erase durable implementation-file evidence needed by
  // Formal Version Git closure, including compatibility-mode and recovered WIs.
  let actualFiles = (input.changedFiles ?? []).map(raw =>
    slash(typeof raw === 'string' ? raw : raw.path),
  );
  if (input.changedFiles === undefined) {
    const derived = await deriveActualChangedFiles(input.projectRoot, input.workItemDir);
    actualFiles = derived.files;
  }
  actualFiles = unique(actualFiles.filter(Boolean));

  if (!snapshot?.active) {
    return {
      passed: true,
      active: false,
      violations: [],
      actual_modules: [],
      actual_files: actualFiles,
    };
  }

  const manifest = await readJson(
    path.join(input.projectRoot, SPEC_DIR, 'project', 'spec_manifest.json'),
  );
  const violations: string[] = [];
  const actualModules: string[] = [];

  const approvedPermissionPaths = new Set(
    normalizeArray(snapshot.allowed_write_files).map(value => slash(value)),
  );
  for (const changedPath of actualFiles) {
    if (changedPath === SPEC_DIR || changedPath.startsWith(`${SPEC_DIR}/`)) {
      continue;
    }
    const owners = resolveModuleOwnershipFromManifest(manifest, changedPath);
    const approvedCrossModuleTestHarness =
      owners.length === 0 &&
      isCrossModuleTestHarnessPath(changedPath) &&
      approvedPermissionPaths.has(changedPath);
    if (owners.length !== 1) {
      if (approvedCrossModuleTestHarness) continue;
      violations.push(
        `ACTUAL_FILE_MODULE_OWNERSHIP_INVALID: ${changedPath}; owners=${owners.join(',') || 'none'}`,
      );
      continue;
    }
    actualModules.push(owners[0]);
    if (!snapshot.affected_modules.includes(owners[0])) {
      violations.push(`ACTUAL_SCOPE_EXCEEDS_APPROVED_MODULES: ${changedPath} -> ${owners[0]}`);
    }
  }

  return {
    passed: violations.length === 0,
    active: true,
    violations,
    actual_modules: unique(actualModules),
    actual_files: actualFiles,
  };
}

export async function verifyProjectGovernanceAfterImplementation(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
}): Promise<GovernanceCheckResult> {
  const workItem = await readJson(path.join(input.workItemDir, 'work_item.json'));
  const specMigrationNoCode = isSpecMigrationNoCodeWorkflow(
    workItem?.workflow_type,
    workItem?.workflow_path,
  );
  const consistency = await checkProjectGovernanceConsistency(input);
  const contracts = await checkProjectGovernanceContracts(input);
  const trace = await checkProjectGovernanceTrace(input);
  const auditText = await readText(path.join(input.workItemDir, 'changed_files_audit.md'));
  const auditPassed = evaluateChangedFilesAuditVerdict(auditText).passed;
  const actualScope = await auditActualGovernanceScope({
    projectRoot: input.projectRoot,
    workItemDir: input.workItemDir,
  });

  const checks = [...consistency.checks, ...contracts.checks, ...trace.checks];
  addCheck(
    checks,
    'actual_scope_audit_passed',
    'Changed Files Audit passed and actual implementation stays inside approved Module scope',
    auditPassed && actualScope.passed,
    [
      `changed_files_audit=${auditPassed ? 'passed' : 'failed'}`,
      `actual_modules=${actualScope.actual_modules.join(',') || 'none'}`,
      `violations=${actualScope.violations.join(' | ') || 'none'}`,
    ].join('; '),
  );

  const scopePath = path.join(input.workItemDir, 'governance_scope.json');
  const frozenScope = await readJson(scopePath);
  const formalManifestPath = path.join(input.projectRoot, SPEC_DIR, 'project', 'spec_manifest.json');
  const formalManifest = await readJson(formalManifestPath);
  if (consistency.active) {
    addCheck(
      checks,
      'project_spec_version_frozen',
      specMigrationNoCode
        ? 'Project Spec version is governed by Atomic Spec Merge; Code Permission is not applicable to spec_migration'
        : 'Project Spec version did not change after Code Permission was issued',
      specMigrationNoCode ||
        (Boolean(frozenScope) &&
          String(frozenScope?.project_spec_version ?? '') ===
            String(formalManifest?.project_spec_version ?? '')),
      specMigrationNoCode
        ? `code_permission=not_applicable; current=${String(formalManifest?.project_spec_version ?? 'missing')}`
        : `permission=${String(frozenScope?.project_spec_version ?? 'missing')}; current=${String(formalManifest?.project_spec_version ?? 'missing')}`,
    );
  }

  return {
    active: consistency.active,
    passed: checks.every(check => check.passed),
    checks,
    inputFiles: unique([
      ...consistency.inputFiles,
      ...contracts.inputFiles,
      ...trace.inputFiles,
      path.join(input.workItemDir, 'changed_files_audit.md'),
      path.join(input.workItemDir, 'governance_scope.json'),
      path.join(input.workItemDir, 'git_context.json'),
      path.join(input.projectRoot, SPEC_DIR, 'project', 'spec_manifest.json'),
    ]),
  };
}

async function gitHead(projectRoot: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot });
    return String(stdout).trim();
  } catch {
    return '';
  }
}

async function gitLines(projectRoot: string, args: string[]): Promise<string[]> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: projectRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
  return unique(
    String(stdout ?? '')
      .split(/\r?\n/)
      .map(value => slash(value.trim()))
      .filter(Boolean),
  );
}

async function gitCurrentBranch(projectRoot: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['branch', '--show-current'], {
      cwd: projectRoot,
    });
    return String(stdout ?? '').trim();
  } catch {
    return '';
  }
}

async function gitIsAncestor(
  projectRoot: string,
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  if (!ancestor || !descendant) return false;
  try {
    await execFileAsync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: projectRoot,
    });
    return true;
  } catch {
    return false;
  }
}

async function gitResolveCommit(projectRoot: string, ref: string): Promise<string> {
  if (!ref) return '';
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', `${ref}^{commit}`], {
      cwd: projectRoot,
    });
    return String(stdout ?? '').trim();
  } catch {
    return '';
  }
}

function normalizeFormalImplementationFiles(
  files: string[],
  projectRoot?: string,
): string[] {
  return unique(
    files
      .map(value => (projectRoot ? repositoryRelativePath(projectRoot, value) : slash(value)))
      .filter(value => value && value !== SPEC_DIR && !value.startsWith(`${SPEC_DIR}/`)),
  );
}
export interface FormalImplementationFileSetComparison {
  matches: boolean;
  missing_from_recorded_files: string[];
  unexpected_recorded_files: string[];
}
export function compareFormalImplementationFileSets(
  recordedFiles: string[],
  committedFiles: string[],
): FormalImplementationFileSetComparison {
  const recorded = normalizeFormalImplementationFiles(recordedFiles);
  const committed = normalizeFormalImplementationFiles(committedFiles);
  const recordedSet = new Set(recorded);
  const committedSet = new Set(committed);
  const missingFromRecordedFiles = committed.filter(file => !recordedSet.has(file));
  const unexpectedRecordedFiles = recorded.filter(file => !committedSet.has(file));
  return {
    matches: missingFromRecordedFiles.length === 0 && unexpectedRecordedFiles.length === 0,
    missing_from_recorded_files: missingFromRecordedFiles,
    unexpected_recorded_files: unexpectedRecordedFiles,
  };
}
async function gitCommittedImplementationFiles(
  projectRoot: string,
  baseCommit: string,
  headCommit: string,
): Promise<string[]> {
  if (!baseCommit || !headCommit) return [];
  return normalizeFormalImplementationFiles(
    await gitLines(projectRoot, ['diff', '--name-only', `${baseCommit}...${headCommit}`, '--']),
  );
}
async function gitImplementationFingerprint(
  projectRoot: string,
  commit: string,
  files: string[],
): Promise<string> {
  const facts: string[] = [];
  for (const relativePath of unique(files.map(slash))) {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['rev-parse', `${commit}:${relativePath}`],
        { cwd: projectRoot },
      );
      facts.push(`${relativePath}\0${String(stdout ?? '').trim()}`);
    } catch {
      facts.push(`${relativePath}\0deleted`);
    }
  }
  return digest(facts.join('\n'));
}

export interface FormalGitBinding {
  enabled: boolean;
  branch_name: string;
  expected_branch: string;
  head_commit: string;
  base_commit: string;
  base_is_ancestor: boolean;
  committed_files: string[];
  committed_implementation_files: string[];
  worktree_files: string[];
  implementation_files: string[];
  implementation_file_set_matches: boolean;
  unrecorded_committed_implementation_files: string[];
  missing_from_commit: string[];
  uncommitted_implementation_files: string[];
}

export async function inspectFormalGitBinding(input: {
  projectRoot: string;
  gitContext: any;
  implementationFiles: string[];
}): Promise<FormalGitBinding> {
  const enabled = input.gitContext?.git_enabled === true;
  const expectedBranch = String(input.gitContext?.branch_name ?? '');
  const baseCommit = String(input.gitContext?.base_commit ?? '');
  const implementationFiles = unique(
    input.implementationFiles
      .map(value => repositoryRelativePath(input.projectRoot, value))
      .filter(value => value && value !== SPEC_DIR && !value.startsWith(`${SPEC_DIR}/`)),
  );
  if (!enabled) {
    return {
      enabled,
      branch_name: '',
      expected_branch: expectedBranch,
      head_commit: '',
      base_commit: baseCommit,
      base_is_ancestor: false,
      committed_files: [],
      committed_implementation_files: [],
      worktree_files: [],
      implementation_files: implementationFiles,
      implementation_file_set_matches: implementationFiles.length === 0,
      unrecorded_committed_implementation_files: [],
      missing_from_commit: implementationFiles,
      uncommitted_implementation_files: implementationFiles,
    };
  }

  const headCommit = await gitHead(input.projectRoot);
  const [branchName, committedFiles, trackedWorktreeFiles, untrackedFiles] =
    await Promise.all([
      gitCurrentBranch(input.projectRoot),
      baseCommit && headCommit
        ? gitLines(input.projectRoot, ['diff', '--name-only', `${baseCommit}...${headCommit}`, '--'])
        : Promise.resolve([]),
      gitLines(input.projectRoot, ['diff', '--name-only', 'HEAD', '--']),
      gitLines(input.projectRoot, ['ls-files', '--others', '--exclude-standard']),
    ]);
  const worktreeFiles = unique([...trackedWorktreeFiles, ...untrackedFiles]);
  const committedImplementationFiles = normalizeFormalImplementationFiles(committedFiles);
  const implementationFileSet = compareFormalImplementationFileSets(
    implementationFiles,
    committedImplementationFiles,
  );
  const worktreeSet = new Set(worktreeFiles.map(slash));

  return {
    enabled,
    branch_name: branchName,
    expected_branch: expectedBranch,
    head_commit: headCommit,
    base_commit: baseCommit,
    base_is_ancestor: await gitIsAncestor(input.projectRoot, baseCommit, headCommit),
    committed_files: committedFiles,
    committed_implementation_files: committedImplementationFiles,
    worktree_files: worktreeFiles,
    implementation_files: implementationFiles,
    implementation_file_set_matches: implementationFileSet.matches,
    unrecorded_committed_implementation_files:
      implementationFileSet.missing_from_recorded_files,
    missing_from_commit: implementationFileSet.unexpected_recorded_files,
    uncommitted_implementation_files: implementationFiles.filter(file => worktreeSet.has(file)),
  };
}

async function gitDiffFingerprint(projectRoot: string, baseCommit: string): Promise<string> {
  try {
    const [{ stdout: trackedStdout }, { stdout: untrackedStdout }] = await Promise.all([
      execFileAsync('git', ['diff', '--name-only', baseCommit, '--'], { cwd: projectRoot }),
      execFileAsync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: projectRoot }),
    ]);
    const changedPaths = unique(
      `${String(trackedStdout)}\n${String(untrackedStdout)}`
        .split(/\r?\n/)
        .map(value => slash(value.trim()))
        .filter(Boolean)
    );
    const facts: string[] = [];
    for (const relativePath of changedPaths) {
      const filePath = path.resolve(projectRoot, relativePath);
      try {
        const content = await fs.readFile(filePath);
        facts.push(
          `${relativePath}\0file\0${createHash('sha256').update(content).digest('hex')}`
        );
      } catch {
        // A path still reported by git but absent from the filesystem is a deletion.
        facts.push(`${relativePath}\0deleted`);
      }
    }
    return digest(facts.join('\n'));
  } catch {
    return '';
  }
}

export async function checkFormalVersionEligibility(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
  workflowPath: string;
}): Promise<GovernanceCheckResult> {
  const checks: GovernanceCheck[] = [];
  const inputFiles: string[] = [];
  const specMigrationNoCode = isSpecMigrationNoCodeWorkflow('', input.workflowPath);

  const readGate = async (gateId: string) => {
    const gatePath = path.join(input.workItemDir, 'gates', `${gateId}.json`);
    inputFiles.push(gatePath);
    return readJson(gatePath);
  };

  const verification = await readGate('verification_gate');
  addCheck(
    checks,
    'formal_verification_gate',
    'Verification Gate passed',
    verification?.status === 'passed',
  );

  const auditPath = path.join(input.workItemDir, 'changed_files_audit.md');
  const audit = await readText(auditPath);
  inputFiles.push(auditPath);
  addCheck(
    checks,
    'formal_changed_files_audit',
    'Changed Files Audit passed',
    evaluateChangedFilesAuditVerdict(audit).passed,
  );

  const actualScope = await auditActualGovernanceScope({
    projectRoot: input.projectRoot,
    workItemDir: input.workItemDir,
  });
  inputFiles.push(
    path.join(input.workItemDir, 'governance_scope.json'),
    path.join(input.workItemDir, 'git_context.json')
  );
  addCheck(
    checks,
    'formal_actual_governance_scope',
    'Actual implementation files map to exactly one approved Module and do not expand governance scope',
    actualScope.passed,
    `actual_modules=${actualScope.actual_modules.join(',') || 'none'}; violations=${actualScope.violations.join(' | ') || 'none'}`,
  );

  const gitContextPath = path.join(input.workItemDir, 'git_context.json');
  const gitContext = await readJson(gitContextPath);
  const governanceScope = await readJson(path.join(input.workItemDir, 'governance_scope.json'));
  const gitRequired =
    actualScope.active &&
    !specMigrationNoCode &&
    input.workflowPath !== 'contract_change_path' &&
    input.workflowPath !== 'rollback_path';
  const expectedImplementation =
    gitRequired &&
    normalizeArray(governanceScope?.allowed_write_files).some(
      value => value !== SPEC_DIR && !slash(value).startsWith(`${SPEC_DIR}/`),
    );
  const gitBinding = await inspectFormalGitBinding({
    projectRoot: input.projectRoot,
    gitContext,
    implementationFiles: actualScope.actual_files,
  });
  inputFiles.push(gitContextPath);
  addCheck(
    checks,
    'formal_git_context',
    'Git-enabled implementation is bound to WI branch and base commit',
    !gitRequired ||
      (gitBinding.enabled &&
        Boolean(gitBinding.expected_branch) &&
        Boolean(gitBinding.base_commit)),
    `required=${gitRequired}; enabled=${gitBinding.enabled}; branch=${gitBinding.expected_branch || 'missing'}; base=${gitBinding.base_commit || 'missing'}`,
  );
  if (gitBinding.enabled) {
    addCheck(
      checks,
      'formal_git_branch',
      'Current branch matches git_context branch',
      gitBinding.branch_name === gitBinding.expected_branch,
      `current=${gitBinding.branch_name || 'missing'}; expected=${gitBinding.expected_branch || 'missing'}`,
    );
    addCheck(
      checks,
      'formal_git_base_ancestor',
      'git_context base commit is an ancestor of the implementation commit',
      gitBinding.base_is_ancestor,
      `base=${gitBinding.base_commit || 'missing'}; head=${gitBinding.head_commit || 'missing'}`,
    );
    addCheck(
      checks,
      'formal_git_actual_files_present',
      'Implementation produced observable project-file changes',
      !expectedImplementation || gitBinding.implementation_files.length > 0,
      `expected=${expectedImplementation}; actual=${gitBinding.implementation_files.join(',') || 'none'}`,
    );
    addCheck(
      checks,
      'formal_git_implementation_file_set_complete',
      'Formal Version implementation files exactly match the WI committed non-governance Git diff',
      gitBinding.implementation_file_set_matches,
      `committed=${gitBinding.committed_implementation_files.join(',') || 'none'}; unrecorded=${gitBinding.unrecorded_committed_implementation_files.join(',') || 'none'}; absent_from_commit=${gitBinding.missing_from_commit.join(',') || 'none'}`,
    );
    addCheck(
      checks,
      'formal_git_implementation_committed',
      'Every observed implementation file is present in the WI committed diff',
      gitBinding.missing_from_commit.length === 0,
      `implementation_commit=${gitBinding.head_commit || 'missing'}; missing=${gitBinding.missing_from_commit.join(',') || 'none'}`,
    );
    addCheck(
      checks,
      'formal_git_implementation_worktree_clean',
      'Observed implementation files have no staged, unstaged, or untracked changes',
      gitBinding.uncommitted_implementation_files.length === 0,
      `uncommitted=${gitBinding.uncommitted_implementation_files.join(',') || 'none'}`,
    );
  }

  const semanticRequired =
    input.workflowPath !== 'contract_change_path' && input.workflowPath !== 'rollback_path';
  const semanticPath = path.join(input.workItemDir, '.semantic_closure.json');
  const semantic = semanticRequired ? await readJson(semanticPath) : null;
  if (semanticRequired) inputFiles.push(semanticPath);
  addCheck(
    checks,
    'formal_semantic_closure',
    semanticRequired
      ? 'Semantic closure evidence exists'
      : 'Semantic closure is not applicable to this no-code formal workflow',
    semanticRequired ? Boolean(semantic) : true,
  );

  const candidateManifest = await readJson(path.join(input.workItemDir, 'candidate_manifest.json'));
  const formalMergeRequired = candidateManifest?.merge_required === true;
  if (formalMergeRequired) {
    const mergePath = path.join(input.workItemDir, 'merge_report.md');
    const merge = await readText(mergePath);
    inputFiles.push(mergePath);
    addCheck(
      checks,
      'formal_spec_merge',
      'Formal Spec Candidate merge succeeded',
      /^Status:\s*success\s*$/im.test(merge),
    );

    const decisionPath = path.join(input.workItemDir, 'user_decision.json');
    const decision = await readJson(decisionPath);
    inputFiles.push(decisionPath);
    addCheck(
      checks,
      'formal_user_decision',
      'User Decision is approved/waived',
      ['approved', 'waived'].includes(String(decision?.decision_status ?? '')),
    );
  }

  const gatesDirectory = path.join(input.workItemDir, 'gates');
  try {
    for (const name of await fs.readdir(gatesDirectory)) {
      if (
        !name.endsWith('.json') ||
        name === 'formal_version_gate.json' ||
        name === 'close_gate.json' ||
        name === 'gate_summary_gate.json'
      ) {
        continue;
      }
      const report = await readJson(path.join(gatesDirectory, name));
      if (report?.gate_type === 'hard_gate') {
        addCheck(
          checks,
          `formal_hard_gate_${name.replace(/\W/g, '_')}`,
          `Hard Gate ${name} did not fail`,
          ['passed', 'skipped'].includes(String(report?.status ?? '')),
        );
      }
    }
  } catch {
    addCheck(checks, 'formal_gate_reports_dir', 'Gate report directory exists', false);
  }

  const model = await loadProjectModel(input.projectRoot, input.workItemDir, false);
  if (model.active) {
    const consistency = await checkProjectGovernanceConsistency(input);
    const contracts = await checkProjectGovernanceContracts(input);
    const trace = await checkProjectGovernanceTrace(input);
    addCheck(
      checks,
      'formal_project_consistency',
      'Project Architecture/Data/Design consistency is valid',
      consistency.passed,
    );
    addCheck(
      checks,
      'formal_contract_integrity',
      'Project/Module Contract integrity is valid',
      contracts.passed,
    );
    addCheck(
      checks,
      'formal_trace_integrity',
      'Governance Trace is valid',
      trace.passed,
    );
    const frozenScope = await readJson(path.join(input.workItemDir, 'governance_scope.json'));
    addCheck(
      checks,
      'formal_governance_scope_frozen',
      specMigrationNoCode ||
      input.workflowPath === 'contract_change_path' ||
      input.workflowPath === 'rollback_path'
        ? 'Frozen governance scope is not applicable to this no-code formal workflow'
        : 'Implementation has a frozen governance scope',
      specMigrationNoCode ||
      input.workflowPath === 'contract_change_path' ||
      input.workflowPath === 'rollback_path'
        ? true
        : Boolean(frozenScope?.active),
    );
  }

  const passed = checks.every(check => check.passed);
  if (passed) {
    const headCommit = gitBinding.head_commit || (await gitHead(input.projectRoot));
    const baseCommit = gitBinding.base_commit || String(gitContext?.base_commit ?? '');
    const snapshot = {
      schema_version: '1.0',
      work_item_id: input.workItemId,
      head_commit: headCommit,
      implementation_commit: gitBinding.enabled ? headCommit : '',
      branch_name: gitBinding.enabled ? gitBinding.branch_name : '',
      implementation_files: gitBinding.committed_implementation_files,
      implementation_tree_fingerprint:
        gitBinding.enabled && headCommit
          ? await gitImplementationFingerprint(
              input.projectRoot,
              headCommit,
              gitBinding.committed_implementation_files,
            )
          : '',
      base_commit: baseCommit,
      diff_fingerprint: baseCommit
        ? await gitDiffFingerprint(input.projectRoot, baseCommit)
        : '',
      created_at: new Date().toISOString(),
    };
    const snapshotPath = path.join(input.workItemDir, 'formal_version_snapshot.json');
    await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    inputFiles.push(snapshotPath);
  }

  return {
    active: model.active,
    passed,
    checks,
    inputFiles: unique(inputFiles),
  };
}

export async function assertFormalVersionSnapshotForGitMerge(
  projectRoot: string,
  workItemId: string,
): Promise<void> {
  const workItemDir = path.join(projectRoot, SPEC_DIR, 'work-items', workItemId);
  const closeReport = await readJson(path.join(workItemDir, 'gates', 'close_gate.json'));
  if (closeReport?.status !== 'passed') {
    throw new Error('FORMAL_GIT_MERGE_REQUIRES_CLOSE_GATE');
  }
  const report = await readJson(path.join(workItemDir, 'gates', 'formal_version_gate.json'));
  if (report?.status !== 'passed') {
    throw new Error('FORMAL_VERSION_GATE_REQUIRED_BEFORE_GIT_MERGE');
  }

  const snapshot = await readJson(path.join(workItemDir, 'formal_version_snapshot.json'));
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('FORMAL_VERSION_SNAPSHOT_REQUIRED_BEFORE_GIT_MERGE');
  }

  if (snapshot.implementation_commit) {
    const [currentHead, currentBranch, trackedWorktreeFiles, untrackedFiles] =
      await Promise.all([
        gitHead(projectRoot),
        gitCurrentBranch(projectRoot),
        gitLines(projectRoot, ['diff', '--name-only', 'HEAD', '--']),
        gitLines(projectRoot, ['ls-files', '--others', '--exclude-standard']),
      ]);
    if (unique([...trackedWorktreeFiles, ...untrackedFiles]).length > 0) {
      throw new Error('FORMAL_VERSION_WORKTREE_NOT_CLEAN_BEFORE_GIT_MERGE');
    }
    if (snapshot.branch_name && currentBranch !== snapshot.branch_name) {
      throw new Error('FORMAL_VERSION_BRANCH_CHANGED_AFTER_GATE');
    }
    if (!(await gitIsAncestor(projectRoot, snapshot.implementation_commit, currentHead))) {
      throw new Error('FORMAL_VERSION_IMPLEMENTATION_COMMIT_NOT_ANCESTOR');
    }
    const baseCommit = String(snapshot.base_commit ?? '');
    if (!baseCommit) {
      throw new Error('FORMAL_VERSION_BASE_COMMIT_REQUIRED');
    }
    const implementationFiles = normalizeFormalImplementationFiles(
      normalizeArray(snapshot.implementation_files),
    );
    const currentImplementationFiles = await gitCommittedImplementationFiles(
      projectRoot,
      baseCommit,
      currentHead,
    );
    const implementationFileSet = compareFormalImplementationFileSets(
      implementationFiles,
      currentImplementationFiles,
    );
    if (!implementationFileSet.matches) {
      throw new Error(
        `FORMAL_VERSION_IMPLEMENTATION_FILE_SET_MISMATCH: missing_from_snapshot=${implementationFileSet.missing_from_recorded_files.join(',') || 'none'}; unexpected_in_snapshot=${implementationFileSet.unexpected_recorded_files.join(',') || 'none'}`,
      );
    }
    const fingerprint = await gitImplementationFingerprint(
      projectRoot,
      currentHead,
      implementationFiles,
    );
    if (fingerprint !== snapshot.implementation_tree_fingerprint) {
      throw new Error('FORMAL_VERSION_IMPLEMENTATION_CHANGED_AFTER_GATE');
    }
    return;
  }

  if (snapshot.base_commit) {
    const fingerprint = await gitDiffFingerprint(projectRoot, snapshot.base_commit);
    if (fingerprint !== snapshot.diff_fingerprint) {
      throw new Error('FORMAL_VERSION_DIFF_CHANGED_AFTER_GATE');
    }
  }
}

export interface FormalVersionPostMergeVerification {
  work_item_id: string;
  close_gate_passed: boolean;
  formal_version_gate_passed: boolean;
  snapshot_present: boolean;
  implementation_commit: string;
  implementation_commit_ancestor: boolean;
  implementation_file_set_matches: boolean;
  implementation_tree_matches: boolean;
  base_diff_matches: boolean;
}

export async function verifyFormalVersionSnapshotAfterGitMerge(
  projectRoot: string,
  workItemId: string,
  targetHead: string,
): Promise<FormalVersionPostMergeVerification> {
  const workItemDir = path.join(projectRoot, SPEC_DIR, 'work-items', workItemId);
  const closeReport = await readJson(path.join(workItemDir, 'gates', 'close_gate.json'));
  if (closeReport?.status !== 'passed') {
    throw new Error('POST_MERGE_VERIFY_REQUIRES_CLOSE_GATE');
  }
  const formalReport = await readJson(
    path.join(workItemDir, 'gates', 'formal_version_gate.json'),
  );
  if (formalReport?.status !== 'passed') {
    throw new Error('POST_MERGE_VERIFY_REQUIRES_FORMAL_VERSION_GATE');
  }
  const snapshot = await readJson(path.join(workItemDir, 'formal_version_snapshot.json'));
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('POST_MERGE_VERIFY_REQUIRES_FORMAL_VERSION_SNAPSHOT');
  }
  if (!targetHead) {
    throw new Error('POST_MERGE_VERIFY_TARGET_HEAD_REQUIRED');
  }

  let implementationCommitAncestor = true;
  let implementationFileSetMatches = true;
  let implementationTreeMatches = true;
  let baseDiffMatches = true;
  const implementationCommit = String(snapshot.implementation_commit ?? '');

  if (implementationCommit) {
    implementationCommitAncestor = await gitIsAncestor(
      projectRoot,
      implementationCommit,
      targetHead,
    );
    if (!implementationCommitAncestor) {
      throw new Error('POST_MERGE_IMPLEMENTATION_COMMIT_NOT_ANCESTOR');
    }
    const baseCommit = String(snapshot.base_commit ?? '');
    if (!baseCommit) {
      throw new Error('POST_MERGE_BASE_COMMIT_REQUIRED');
    }
    const sourceBranch = String(snapshot.branch_name ?? '');
    const sourceHead = await gitResolveCommit(projectRoot, sourceBranch);
    if (!sourceBranch || !sourceHead) {
      throw new Error('POST_MERGE_SOURCE_BRANCH_REQUIRED');
    }
    if (!(await gitIsAncestor(projectRoot, sourceHead, targetHead))) {
      throw new Error('POST_MERGE_SOURCE_HEAD_NOT_ANCESTOR');
    }
    const implementationFiles = normalizeFormalImplementationFiles(
      normalizeArray(snapshot.implementation_files),
    );
    const sourceImplementationFiles = await gitCommittedImplementationFiles(
      projectRoot,
      baseCommit,
      sourceHead,
    );
    const implementationFileSet = compareFormalImplementationFileSets(
      implementationFiles,
      sourceImplementationFiles,
    );
    implementationFileSetMatches = implementationFileSet.matches;
    if (!implementationFileSetMatches) {
      throw new Error(
        `POST_MERGE_IMPLEMENTATION_FILE_SET_MISMATCH: missing_from_snapshot=${implementationFileSet.missing_from_recorded_files.join(',') || 'none'}; unexpected_in_snapshot=${implementationFileSet.unexpected_recorded_files.join(',') || 'none'}`,
      );
    }
    const fingerprint = await gitImplementationFingerprint(
      projectRoot,
      targetHead,
      implementationFiles,
    );
    implementationTreeMatches =
      fingerprint === String(snapshot.implementation_tree_fingerprint ?? '');
    if (!implementationTreeMatches) {
      throw new Error('POST_MERGE_IMPLEMENTATION_TREE_CHANGED');
    }
  } else if (snapshot.base_commit) {
    const fingerprint = await gitDiffFingerprint(projectRoot, String(snapshot.base_commit));
    baseDiffMatches = fingerprint === String(snapshot.diff_fingerprint ?? '');
    if (!baseDiffMatches) {
      throw new Error('POST_MERGE_FORMAL_DIFF_CHANGED');
    }
  }

  return {
    work_item_id: workItemId,
    close_gate_passed: true,
    formal_version_gate_passed: true,
    snapshot_present: true,
    implementation_commit: implementationCommit,
    implementation_commit_ancestor: implementationCommitAncestor,
    implementation_file_set_matches: implementationFileSetMatches,
    implementation_tree_matches: implementationTreeMatches,
    base_diff_matches: baseDiffMatches,
  };
}
