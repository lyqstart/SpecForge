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
import { getFactualChangedFiles } from './write-guard-log.js';

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
  code_paths: string[];
  design_ids: string[];
  design_text: string;
  contract_entries: ContractEntry[];
};

type TraceEdge = {
  from: string;
  relation: 'constrained_by' | 'enforces';
  to: string;
  source: string;
};

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

function parseStructuredTraceDeclarations(text: string, source: string): TraceEdge[] {
  const edges: TraceEdge[] = [];
  const jsonBlocks = text.matchAll(/```json\s*([\s\S]*?)```/gi);
  for (const match of jsonBlocks) {
    let parsed: any;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue;
    }

    for (const field of ['data_designs', 'module_designs']) {
      for (const entry of Array.isArray(parsed?.[field]) ? parsed[field] : []) {
        const from = String(entry?.id ?? '').trim();
        if (!from) continue;
        for (const to of normalizeArray(entry?.constrained_by)) {
          edges.push({ from, relation: 'constrained_by', to, source });
        }
      }
    }

    for (const entry of Array.isArray(parsed?.contract_enforcements)
      ? parsed.contract_enforcements
      : []) {
      const from = String(entry?.id ?? entry?.contract_id ?? '').trim();
      if (!from) continue;
      for (const to of normalizeArray(entry?.enforces ?? entry?.source_refs)) {
        edges.push({ from, relation: 'enforces', to, source });
      }
    }
  }
  return edges;
}

function parseTrace(text: string, source: string): TraceEdge[] {
  const edges: TraceEdge[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim());
    if (cells.length < 3) continue;
    const [from, relation, to] = cells;
    if (relation === 'constrained_by' || relation === 'enforces') {
      edges.push({ from, relation, to, source });
    }
  }
  edges.push(...parseStructuredTraceDeclarations(text, source));
  return edges;
}

type TraceDeltaOperation = { operation: 'ADD' | 'REMOVE'; edge: TraceEdge };

function parseTraceDelta(text: string, source: string): TraceDeltaOperation[] {
  const operations: TraceDeltaOperation[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim());
    if (cells.length < 4 || (cells[0] !== 'ADD' && cells[0] !== 'REMOVE')) continue;
    const relation = cells[2];
    if (relation !== 'constrained_by' && relation !== 'enforces') continue;
    operations.push({
      operation: cells[0] as 'ADD' | 'REMOVE',
      edge: { from: cells[1], relation, to: cells[3], source },
    });
  }
  return operations;
}

function sameTraceEdge(a: TraceEdge, b: TraceEdge): boolean {
  return a.from === b.from && a.relation === b.relation && a.to === b.to;
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
  const reader = await prospectiveReader(projectRoot, workItemDir);
  const manifestPath = path.join(projectRoot, SPEC_DIR, 'project', 'spec_manifest.json');
  const manifest = prospective ? await reader.json(manifestPath) : await readJson(manifestPath);
  const project = manifest?.project ?? {};

  const architecturePath = absolute(
    projectRoot,
    String(project.architecture ?? `${SPEC_DIR}/project/architecture.md`),
  );
  const dataModelPath = absolute(
    projectRoot,
    String(project.data_model ?? `${SPEC_DIR}/project/data_model.md`),
  );
  const architectureText = prospective
    ? await reader.text(architecturePath)
    : await readText(architecturePath);
  const dataModelText = prospective
    ? await reader.text(dataModelPath)
    : await readText(dataModelPath);
  const architectureIds = extractIds(architectureText, 'ARCH');
  const dataModelIds = extractIds(dataModelText, 'DATA');
  const dataModelNotApplicable = /\bDATA_MODEL_NOT_APPLICABLE\b/.test(dataModelText);

  const modules: ModuleModel[] = [];
  const contracts: ContractEntry[] = [];
  const trace: TraceEdge[] = [];
  const inputFiles = [manifestPath, architecturePath, dataModelPath];

  const extensionRegistryPath = absolute(
    projectRoot,
    String(project.extension_registry ?? `${SPEC_DIR}/project/extension_registry.json`),
  );
  const extensionRegistry = prospective
    ? await reader.json(extensionRegistryPath)
    : await readJson(extensionRegistryPath);
  if (extensionRegistry?.contracts) {
    const projectContracts = flattenContracts(extensionRegistry.contracts, false);
    contracts.push(...projectContracts);
    for (const contract of projectContracts) {
      for (const ref of contract.source_refs) {
        trace.push({
          from: contract.id,
          relation: 'enforces',
          to: ref,
          source: extensionRegistryPath,
        });
      }
    }
  }
  inputFiles.push(extensionRegistryPath);

  const projectTracePath = absolute(
    projectRoot,
    String(project.trace_matrix ?? `${SPEC_DIR}/project/trace_matrix.md`),
  );
  trace.push(
    ...parseTrace(
      prospective ? await reader.text(projectTracePath) : await readText(projectTracePath),
      projectTracePath,
    ),
  );
  inputFiles.push(projectTracePath);

  const effectiveModuleEntries = await prospectiveModuleEntries(
    projectRoot,
    manifest,
    reader,
    prospective,
  );

  for (const raw of effectiveModuleEntries) {
    const identity = resolveSpecModuleIdentity(raw);
    if (!identity.valid || !identity.moduleCode) continue;
    const moduleCode = identity.moduleCode;
    const moduleRoot = `${SPEC_DIR}/project/modules/${moduleCode}`;
    const moduleFilePath = absolute(projectRoot, String(raw.module_file ?? `${moduleRoot}/module.json`));
    const moduleDefinition = prospective
      ? await reader.json(moduleFilePath)
      : await readJson(moduleFilePath);
    const designPath = absolute(projectRoot, String(raw.design ?? `${moduleRoot}/design.md`));
    const configuredContracts =
      raw.contracts ?? moduleDefinition?.contracts ?? `${moduleRoot}/contracts.json`;
    const contractsPath = absolute(projectRoot, String(configuredContracts));
    const tracePath = absolute(projectRoot, String(raw.trace ?? `${moduleRoot}/trace.md`));
    const designText = prospective ? await reader.text(designPath) : await readText(designPath);
    const moduleContractJson = prospective
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
    for (const contract of internalContracts) {
      for (const ref of contract.source_refs) {
        trace.push({
          from: contract.id,
          relation: 'enforces',
          to: ref,
          source: contractsPath,
        });
      }
    }

    const codePathsDeclared =
      Array.isArray(raw.code_paths) || Array.isArray(moduleDefinition?.code_paths);
    const codePaths = normalizeArray(moduleDefinition?.code_paths ?? raw.code_paths);
    const contractsTarget = slash(path.relative(projectRoot, contractsPath));
    const contractsDeclared =
      (typeof raw.contracts === 'string' && String(raw.contracts).trim().length > 0) ||
      (typeof moduleDefinition?.contracts === 'string' &&
        String(moduleDefinition.contracts).trim().length > 0) ||
      (prospective && reader.targets.has(contractsTarget));

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
      code_paths: codePaths,
      design_ids: extractIds(designText, 'DD'),
      design_text: designText,
      contract_entries: internalContracts,
    });
    trace.push(
      ...parseTrace(
        prospective ? await reader.text(tracePath) : await readText(tracePath),
        tracePath,
      ),
    );
    inputFiles.push(moduleFilePath, designPath, contractsPath, tracePath);
  }

  if (prospective) {
    const traceDeltaPath = path.join(workItemDir, 'trace_delta.md');
    const traceDeltaText = await readText(traceDeltaPath);
    if (traceDeltaText.trim()) {
      inputFiles.push(traceDeltaPath);
      for (const operation of parseTraceDelta(traceDeltaText, traceDeltaPath)) {
        const index = trace.findIndex(edge => sameTraceEdge(edge, operation.edge));
        if (operation.operation === 'REMOVE') {
          if (index >= 0) trace.splice(index, 1);
        } else if (index < 0) {
          trace.push(operation.edge);
        }
      }
    }
  }

  // Compatibility rule: Architecture + Data Model are the migration boundary.
  // Before that boundary, legacy projects remain readable. Once the boundary is
  // established, missing Module contracts/code_paths must fail consistency
  // checks instead of switching governance back off (fail-closed after migration).
  const active = Boolean(
    architectureIds.length > 0 &&
      (dataModelIds.length > 0 || dataModelNotApplicable) &&
      modules.length > 0,
  );

  const effectiveManifest = manifest && typeof manifest === 'object'
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

function relationValid(edge: TraceEdge, model: ProjectModel): boolean {
  const architecture = new Set(model.architectureIds);
  const data = new Set(model.dataModelIds);
  const design = new Set(model.modules.flatMap(module => module.design_ids));
  const contracts = new Set(model.contracts.map(contract => contract.id));

  if (edge.relation === 'constrained_by') {
    return (
      (data.has(edge.from) && architecture.has(edge.to)) ||
      (design.has(edge.from) && (architecture.has(edge.to) || data.has(edge.to)))
    );
  }
  return (
    contracts.has(edge.from) &&
    (architecture.has(edge.to) || data.has(edge.to) || design.has(edge.to))
  );
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
  const impactScope = normalizeImpactScope(trigger?.impact_scope ?? trigger?.impact_summary);

  if (workflowPath !== 'spec_migration_path') {
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

    if (contract.module_internal) {
      const matcher = new RegExp(`\\b${escapeRegex(contract.id)}\\b`);
      for (const module of model.modules.filter(
        candidate => candidate.module_code !== contract.owner_module,
      )) {
        addCheck(
          checks,
          `contract_${contract.id}_not_consumed_by_${module.module_code}`,
          `Internal Contract ${contract.id} is not consumed by Module ${module.module_code}`,
          !matcher.test(module.design_text),
        );
      }
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
        `Module Design ${designId} is constrained by Architecture or Data Model`,
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
  const scope = normalizeImpactScope(trigger?.impact_scope ?? trigger?.impact_summary);
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
    addCheck(
      checks,
      `permission_owner_${digest(allowedPath).slice(0, 8)}`,
      `Allowed write file maps to exactly one Module: ${allowedPath}`,
      owners.length === 1,
      `owners=${owners.join(',') || 'none'}`,
    );
    if (owners.length === 1) inferredModules.push(owners[0]);
  }

  snapshot.affected_modules = unique(inferredModules);
  addCheck(
    checks,
    'permission_affected_modules_declared',
    'Impact Scope covers every Module reached by allowed write files',
    isSubset(snapshot.affected_modules, scope.affected_modules),
    `derived=${snapshot.affected_modules.join(',')}; declared=${scope.affected_modules.join(',')}`,
  );

  snapshot.design_refs = unique(scope.design_refs);
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
  snapshot.project_contract_refs = unique(
    model.contracts
      .filter(
        contract =>
          !contract.module_internal &&
          contract.source_refs.some(
            ref =>
              snapshot.architecture_refs.includes(ref) || snapshot.data_model_refs.includes(ref),
          ),
      )
      .map(contract => contract.id),
  );
  snapshot.module_contract_refs = unique(
    model.contracts
      .filter(
        contract =>
          contract.module_internal &&
          snapshot.affected_modules.includes(contract.owner_module) &&
          contract.source_refs.some(ref => snapshot.design_refs.includes(ref)),
      )
      .map(contract => contract.id),
  );

  const comparisons: Array<[string, string[], string[]]> = [
    ['architecture', snapshot.architecture_refs, scope.architecture_refs],
    ['data_model', snapshot.data_model_refs, scope.data_model_refs],
    ['project_contract', snapshot.project_contract_refs, scope.project_contract_refs],
    ['module_contract', snapshot.module_contract_refs, scope.module_contract_refs],
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

async function deriveActualChangedFiles(
  projectRoot: string,
  workItemDir: string
): Promise<{ files: string[]; source: string }> {
  // Reuse the same factual source as sf_changed_files_audit. This keeps the
  // governance-scope audit scoped to this WI instead of treating unrelated
  // working-tree/untracked files as implementation changes.
  const factual = getFactualChangedFiles(workItemDir);
  if (factual.length > 0) {
    return {
      files: unique(
        factual
          .map(entry => repositoryRelativePath(projectRoot, entry.path))
          .filter(Boolean)
      ),
      source: 'write_guard_log.jsonl',
    };
  }

  const workItem = await readJson(path.join(workItemDir, 'work_item.json'));
  if (Array.isArray(workItem?.actual_changed_files)) {
    return {
      files: unique(
        workItem.actual_changed_files
          .map((entry: unknown) =>
            repositoryRelativePath(
              projectRoot,
              typeof entry === 'string'
                ? entry
                : String((entry as { path?: unknown } | null)?.path ?? '')
            )
          )
          .filter(Boolean)
      ),
      source: 'work_item.actual_changed_files',
    };
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
  if (!snapshot?.active) {
    return {
      passed: true,
      active: false,
      violations: [],
      actual_modules: [],
      actual_files: [],
    };
  }

  const manifest = await readJson(
    path.join(input.projectRoot, SPEC_DIR, 'project', 'spec_manifest.json'),
  );
  const violations: string[] = [];
  const actualModules: string[] = [];

  let actualFiles = (input.changedFiles ?? []).map(raw =>
    slash(typeof raw === 'string' ? raw : raw.path),
  );
  if (input.changedFiles === undefined) {
    const derived = await deriveActualChangedFiles(input.projectRoot, input.workItemDir);
    actualFiles = derived.files;
  }
  actualFiles = unique(actualFiles.filter(Boolean));

  for (const changedPath of actualFiles) {
    if (changedPath === SPEC_DIR || changedPath.startsWith(`${SPEC_DIR}/`)) {
      continue;
    }
    const owners = resolveModuleOwnershipFromManifest(manifest, changedPath);
    if (owners.length !== 1) {
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
      'Project Spec version did not change after Code Permission was issued',
      Boolean(frozenScope) &&
        String(frozenScope?.project_spec_version ?? '') ===
          String(formalManifest?.project_spec_version ?? ''),
      `permission=${String(frozenScope?.project_spec_version ?? 'missing')}; current=${String(formalManifest?.project_spec_version ?? 'missing')}`,
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

  const gateSummaryPath = path.join(input.workItemDir, 'gate_summary.md');
  const gateSummary = await readText(gateSummaryPath);
  inputFiles.push(gateSummaryPath);
  addCheck(
    checks,
    'formal_gate_summary',
    'Candidate Gate Summary is not failed/blocked/invalidated/expired',
    Boolean(gateSummary) &&
      !/Overall Status:\s*(failed|blocked|invalidated|expired)/i.test(gateSummary),
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
      if (!name.endsWith('.json') || name === 'formal_version_gate.json' || name === 'close_gate.json') {
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
      input.workflowPath === 'contract_change_path' || input.workflowPath === 'rollback_path'
        ? 'Frozen governance scope is not applicable to this no-code formal workflow'
        : 'Implementation has a frozen governance scope',
      input.workflowPath === 'contract_change_path' || input.workflowPath === 'rollback_path'
        ? true
        : Boolean(frozenScope?.active),
    );
  }

  const passed = checks.every(check => check.passed);
  if (passed) {
    const gitContext = await readJson(path.join(input.workItemDir, 'git_context.json'));
    const headCommit = await gitHead(input.projectRoot);
    const baseCommit = String(gitContext?.base_commit ?? '');
    const snapshot = {
      schema_version: '1.0',
      work_item_id: input.workItemId,
      head_commit: headCommit,
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

  if (snapshot.base_commit) {
    const fingerprint = await gitDiffFingerprint(projectRoot, snapshot.base_commit);
    if (fingerprint !== snapshot.diff_fingerprint) {
      throw new Error('FORMAL_VERSION_DIFF_CHANGED_AFTER_GATE');
    }
  }
}
