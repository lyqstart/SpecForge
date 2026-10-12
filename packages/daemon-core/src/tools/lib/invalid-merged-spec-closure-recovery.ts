import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  checkProjectGovernanceConsistency,
  checkProjectGovernanceContracts,
  checkProjectGovernanceTrace,
  inspectProjectSpecCoreVersionCoherence,
  readSuccessfulProjectSpecMergeHistoryEvidence,
  type GovernanceCheckResult,
  type ProjectSpecCoreVersionCoherence,
  type ProjectSpecMergeHistoryEvidence,
} from './project-governance-v2.js';

const RECOVERY_FILE = 'invalid_merged_spec_closure_recovery.json';
const RECOVERY_ROOT = 'recovery_generations';
const REQUIRED_WORK_ITEM_ARCHIVE_PATHS = [
  'snapshot/work-item/candidate_manifest.json',
  'snapshot/work-item/gate_summary.md',
  'snapshot/work-item/user_decision.json',
  'snapshot/work-item/merge_report.md',
  'snapshot/work-item/verification_report.md',
  'snapshot/work-item/gates/formal_version_gate.json',
  'snapshot/work-item/gates/close_gate.json',
];

export interface RecoveryEvidenceFile {
  source_kind: 'work_item' | 'formal_project_spec';
  source_relative_path: string;
  archive_relative_path: string;
  size: number;
  sha256: string;
}

export interface InvalidMergedSpecProof {
  close_gate_status: 'passed';
  merge_history: ProjectSpecMergeHistoryEvidence;
  current_project_spec: {
    project_spec_version: string;
    last_merged_work_item: string;
  };
  project_spec_core_version: ProjectSpecCoreVersionCoherence;
  governance_checks: {
    consistency: GovernanceCheckResult;
    contracts: GovernanceCheckResult;
    trace: GovernanceCheckResult;
  };
  invalidity_reasons: string[];
  input_files: Array<{
    relative_path: string;
    size: number;
    sha256: string;
  }>;
}

export interface RecoveryArchive {
  generation_id: string;
  generation_root: string;
  manifest_path: string;
  manifest_relative_path: string;
  manifest_sha256: string;
  files: RecoveryEvidenceFile[];
}

function sha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

async function readJson(filePath: string): Promise<any> {
  return JSON.parse(await fs.readFile(filePath, 'utf-8'));
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  await fs.rename(temporary, filePath);
}

function relativeInside(root: string, target: string, errorCode: string): string {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${errorCode}: path is outside the expected root: ${target}`);
  }
  return relative.split(path.sep).join('/');
}

async function readRegularFile(filePath: string, errorCode: string): Promise<Buffer> {
  const stat = await fs.lstat(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${errorCode}: evidence must be a regular non-symlink file: ${filePath}`);
  }
  return fs.readFile(filePath);
}

function failedChecks(name: string, result: GovernanceCheckResult): string[] {
  return result.checks
    .filter(check => !check.passed)
    .map(check => `${name}:${check.check_id}${check.details ? `:${check.details}` : ''}`);
}

export async function proveInvalidMergedSpecClosure(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
  workItem: Record<string, unknown>;
}): Promise<InvalidMergedSpecProof> {
  if (input.workItem.code_change_allowed === true || input.workItem.code_permission_revoked !== true) {
    throw new Error(
      'INVALID_MERGED_SPEC_RECOVERY_PERMISSION_STATE_INVALID: code permission must remain revoked',
    );
  }

  const closeGate = await readJson(path.join(input.workItemDir, 'gates', 'close_gate.json'))
    .catch(() => null);
  if (closeGate?.status !== 'passed') {
    throw new Error(
      'INVALID_MERGED_SPEC_RECOVERY_EVIDENCE_MISSING: prior close_gate.json with status=passed is required',
    );
  }

  const mergeHistory = await readSuccessfulProjectSpecMergeHistoryEvidence({
    projectRoot: input.projectRoot,
    workItemDir: input.workItemDir,
    workItemId: input.workItemId,
  });
  if (!mergeHistory) {
    throw new Error(
      'INVALID_MERGED_SPEC_RECOVERY_MERGE_PROOF_MISSING: active approved decision and successful Atomic Spec Merge evidence are required',
    );
  }

  const manifestPath = path.join(input.projectRoot, '.specforge', 'project', 'spec_manifest.json');
  const manifest = await readJson(manifestPath).catch(() => null);
  const currentVersion = String(manifest?.project_spec_version ?? '');
  const lastMergedWorkItem = String(manifest?.last_merged_work_item ?? '');
  if (lastMergedWorkItem !== input.workItemId || currentVersion !== mergeHistory.project_spec_version) {
    throw new Error(
      'INVALID_MERGED_SPEC_RECOVERY_PROJECT_SPEC_OWNERSHIP_MISMATCH: current Project Spec must still be the exact result of this Work Item merge',
    );
  }

  let core: ProjectSpecCoreVersionCoherence;
  let consistency: GovernanceCheckResult;
  let contracts: GovernanceCheckResult;
  let trace: GovernanceCheckResult;
  try {
    [core, consistency, contracts, trace] = await Promise.all([
      inspectProjectSpecCoreVersionCoherence(input.projectRoot),
      checkProjectGovernanceConsistency(input),
      checkProjectGovernanceContracts(input),
      checkProjectGovernanceTrace(input),
    ]);
  } catch (error) {
    throw new Error(
      `INVALID_MERGED_SPEC_RECOVERY_VALIDATION_UNAVAILABLE: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const invalidityReasons = [
    ...(!core.passed ? [`project_spec_core_version:${core.reason}`] : []),
    ...failedChecks('consistency', consistency),
    ...failedChecks('contracts', contracts),
    ...failedChecks('trace', trace),
  ];
  if (invalidityReasons.length === 0) {
    throw new Error(
      'INVALID_MERGED_SPEC_RECOVERY_NOT_PROVEN: shared formal Project Spec validators all pass',
    );
  }

  const inputFiles: InvalidMergedSpecProof['input_files'] = [];
  const uniquePaths = Array.from(new Set([
    ...core.input_files,
    ...consistency.inputFiles,
    ...contracts.inputFiles,
    ...trace.inputFiles,
  ].map(filePath => path.resolve(filePath)))).sort();
  for (const filePath of uniquePaths) {
    const relativePath = relativeInside(
      input.projectRoot,
      filePath,
      'INVALID_MERGED_SPEC_RECOVERY_VALIDATION_INPUT_OUTSIDE_PROJECT',
    );
    let content: Buffer;
    try {
      content = await readRegularFile(
        filePath,
        'INVALID_MERGED_SPEC_RECOVERY_VALIDATION_INPUT_INVALID',
      );
    } catch (error) {
      throw new Error(
        `INVALID_MERGED_SPEC_RECOVERY_VALIDATION_INPUT_UNAVAILABLE: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    inputFiles.push({
      relative_path: relativePath,
      size: content.byteLength,
      sha256: sha256(content),
    });
  }

  return {
    close_gate_status: 'passed',
    merge_history: mergeHistory,
    current_project_spec: {
      project_spec_version: currentVersion,
      last_merged_work_item: lastMergedWorkItem,
    },
    project_spec_core_version: core,
    governance_checks: { consistency, contracts, trace },
    invalidity_reasons: invalidityReasons,
    input_files: inputFiles,
  };
}

async function collectWorkItemFiles(input: {
  workItemDir: string;
  directory?: string;
}): Promise<string[]> {
  const directory = input.directory ?? input.workItemDir;
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (directory === input.workItemDir && entry.name === RECOVERY_ROOT) continue;
    const fullPath = path.join(directory, entry.name);
    const stat = await fs.lstat(fullPath);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `INVALID_MERGED_SPEC_RECOVERY_ARCHIVE_SYMLINK_FORBIDDEN: ${fullPath}`,
      );
    }
    if (stat.isDirectory()) {
      files.push(...await collectWorkItemFiles({ ...input, directory: fullPath }));
    } else if (stat.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function copyEvidenceFile(input: {
  source: string;
  target: string;
  sourceKind: RecoveryEvidenceFile['source_kind'];
  sourceRelativePath: string;
  generationRoot: string;
}): Promise<RecoveryEvidenceFile> {
  const content = await readRegularFile(
    input.source,
    'INVALID_MERGED_SPEC_RECOVERY_ARCHIVE_SOURCE_INVALID',
  );
  await fs.mkdir(path.dirname(input.target), { recursive: true });
  await fs.writeFile(input.target, content, { flag: 'wx' });
  await fs.chmod(input.target, 0o444).catch(() => undefined);
  return {
    source_kind: input.sourceKind,
    source_relative_path: input.sourceRelativePath,
    archive_relative_path: path.relative(input.generationRoot, input.target).split(path.sep).join('/'),
    size: content.byteLength,
    sha256: sha256(content),
  };
}

export async function archiveInvalidMergedSpecGeneration(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
  proof: InvalidMergedSpecProof;
}): Promise<RecoveryArchive> {
  const generationId = `generation-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const archiveRoot = path.join(input.workItemDir, RECOVERY_ROOT);
  const temporaryRoot = path.join(archiveRoot, `.${generationId}.tmp`);
  const generationRoot = path.join(archiveRoot, generationId);
  await fs.mkdir(archiveRoot, { recursive: true });
  await fs.mkdir(temporaryRoot, { recursive: false });

  const files: RecoveryEvidenceFile[] = [];
  try {
    for (const source of await collectWorkItemFiles({ workItemDir: input.workItemDir })) {
      const relative = relativeInside(
        input.workItemDir,
        source,
        'INVALID_MERGED_SPEC_RECOVERY_ARCHIVE_PATH_INVALID',
      );
      files.push(await copyEvidenceFile({
        source,
        target: path.join(temporaryRoot, 'snapshot', 'work-item', ...relative.split('/')),
        sourceKind: 'work_item',
        sourceRelativePath: relative,
        generationRoot: temporaryRoot,
      }));
    }

    for (const evidence of input.proof.input_files) {
      const source = path.join(input.projectRoot, ...evidence.relative_path.split('/'));
      const archived = await copyEvidenceFile({
        source,
        target: path.join(
          temporaryRoot,
          'snapshot',
          'formal-project-spec',
          ...evidence.relative_path.split('/'),
        ),
        sourceKind: 'formal_project_spec',
        sourceRelativePath: evidence.relative_path,
        generationRoot: temporaryRoot,
      });
      if (archived.size !== evidence.size || archived.sha256 !== evidence.sha256) {
        throw new Error(
          `INVALID_MERGED_SPEC_RECOVERY_VALIDATION_INPUT_CHANGED_DURING_ARCHIVE: ${evidence.relative_path}`,
        );
      }
      files.push(archived);
    }

    files.sort((left, right) => left.archive_relative_path.localeCompare(right.archive_relative_path));
    const manifestPath = path.join(temporaryRoot, 'manifest.json');
    const manifest = {
      schema_version: '1.0',
      work_item_id: input.workItemId,
      generation_id: generationId,
      created_at: new Date().toISOString(),
      project_spec_version: input.proof.current_project_spec.project_spec_version,
      last_merged_work_item: input.proof.current_project_spec.last_merged_work_item,
      file_count: files.length,
      files,
    };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    const manifestBytes = await fs.readFile(manifestPath);
    await fs.chmod(manifestPath, 0o444).catch(() => undefined);
    await fs.rename(temporaryRoot, generationRoot);
    const finalManifestPath = path.join(generationRoot, 'manifest.json');
    return {
      generation_id: generationId,
      generation_root: generationRoot,
      manifest_path: finalManifestPath,
      manifest_relative_path: relativeInside(input.workItemDir, finalManifestPath, 'INVALID_MERGED_SPEC_RECOVERY_ARCHIVE_PATH_INVALID'),
      manifest_sha256: sha256(manifestBytes),
      files,
    };
  } catch (error) {
    await fs.rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function verifyRecoveryArchive(input: {
  workItemDir: string;
  manifestRelativePath: string;
  manifestSha256: string;
  expectedWorkItemId?: string;
  expectedGenerationId?: string;
}): Promise<void> {
  const manifestPath = path.join(input.workItemDir, ...input.manifestRelativePath.split('/'));
  relativeInside(
    path.join(input.workItemDir, RECOVERY_ROOT),
    manifestPath,
    'INVALID_MERGED_SPEC_RECOVERY_ARCHIVE_PATH_INVALID',
  );
  const bytes = await readRegularFile(
    manifestPath,
    'INVALID_MERGED_SPEC_RECOVERY_ARCHIVE_MANIFEST_INVALID',
  );
  if (sha256(bytes) !== input.manifestSha256) {
    throw new Error('INVALID_MERGED_SPEC_RECOVERY_ARCHIVE_MANIFEST_HASH_MISMATCH');
  }
  const manifest = JSON.parse(bytes.toString('utf-8'));
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('INVALID_MERGED_SPEC_RECOVERY_ARCHIVE_MANIFEST_EMPTY');
  }
  const generationRoot = path.dirname(manifestPath);
  const generationId = path.basename(generationRoot);
  if (
    manifest.schema_version !== '1.0' ||
    manifest.generation_id !== generationId ||
    (input.expectedGenerationId !== undefined &&
      manifest.generation_id !== input.expectedGenerationId) ||
    (input.expectedWorkItemId !== undefined &&
      manifest.work_item_id !== input.expectedWorkItemId) ||
    manifest.file_count !== manifest.files.length
  ) {
    throw new Error('INVALID_MERGED_SPEC_RECOVERY_ARCHIVE_MANIFEST_IDENTITY_MISMATCH');
  }
  const archivePaths = new Set<string>();
  for (const entry of manifest.files as RecoveryEvidenceFile[]) {
    if (
      !entry ||
      !['work_item', 'formal_project_spec'].includes(entry.source_kind) ||
      typeof entry.source_relative_path !== 'string' ||
      typeof entry.archive_relative_path !== 'string' ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      !/^[0-9a-f]{64}$/.test(entry.sha256) ||
      archivePaths.has(entry.archive_relative_path)
    ) {
      throw new Error('INVALID_MERGED_SPEC_RECOVERY_ARCHIVE_MANIFEST_ENTRY_INVALID');
    }
    archivePaths.add(entry.archive_relative_path);
    const archived = path.join(generationRoot, ...String(entry.archive_relative_path).split('/'));
    relativeInside(
      generationRoot,
      archived,
      'INVALID_MERGED_SPEC_RECOVERY_ARCHIVE_ENTRY_PATH_INVALID',
    );
    const content = await readRegularFile(
      archived,
      'INVALID_MERGED_SPEC_RECOVERY_ARCHIVE_ENTRY_INVALID',
    );
    if (content.byteLength !== entry.size || sha256(content) !== entry.sha256) {
      throw new Error(
        `INVALID_MERGED_SPEC_RECOVERY_ARCHIVE_ENTRY_MISMATCH: ${entry.archive_relative_path}`,
      );
    }
  }
  for (const requiredPath of REQUIRED_WORK_ITEM_ARCHIVE_PATHS) {
    if (!archivePaths.has(requiredPath)) {
      throw new Error(
        `INVALID_MERGED_SPEC_RECOVERY_ARCHIVE_REQUIRED_EVIDENCE_MISSING: ${requiredPath}`,
      );
    }
  }
  if (![...archivePaths].some(value => value.startsWith('snapshot/work-item/candidates/'))) {
    throw new Error(
      'INVALID_MERGED_SPEC_RECOVERY_ARCHIVE_REQUIRED_EVIDENCE_MISSING: snapshot/work-item/candidates/',
    );
  }
  if (![...archivePaths].some(value => value.startsWith('snapshot/formal-project-spec/'))) {
    throw new Error(
      'INVALID_MERGED_SPEC_RECOVERY_ARCHIVE_REQUIRED_EVIDENCE_MISSING: snapshot/formal-project-spec/',
    );
  }
}

export async function verifyInvalidMergedSpecRecoveryAuthorization(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
}): Promise<Record<string, any>> {
  const recoveryPath = path.join(input.workItemDir, RECOVERY_FILE);
  const recovery = await readJson(recoveryPath).catch(() => null);
  if (
    recovery?.work_item_id !== input.workItemId ||
    recovery?.recovery_action !== 'closed_to_candidate_preparing' ||
    recovery?.status !== 'authorized' ||
    !Array.isArray(recovery?.proof?.invalidity_reasons) ||
    recovery.proof.invalidity_reasons.length === 0
  ) {
    throw new Error(
      `STATE_COORDINATOR_INVALID_MERGED_SPEC_RECOVERY_FAILED: authorized ${RECOVERY_FILE} is required`,
    );
  }

  await verifyRecoveryArchive({
    workItemDir: input.workItemDir,
    manifestRelativePath: String(recovery.archive?.manifest_path ?? ''),
    manifestSha256: String(recovery.archive?.manifest_sha256 ?? ''),
    expectedWorkItemId: input.workItemId,
    expectedGenerationId: String(recovery.archive?.generation_id ?? ''),
  });

  const workItem = await readJson(path.join(input.workItemDir, 'work_item.json'));
  if (workItem.code_change_allowed === true || workItem.code_permission_revoked !== true) {
    throw new Error(
      'STATE_COORDINATOR_INVALID_MERGED_SPEC_RECOVERY_FAILED: code permission must remain revoked',
    );
  }
  const decision = await readJson(path.join(input.workItemDir, 'user_decision.json'));
  if (
    decision.decision_status !== 'invalidated' ||
    !['approved', 'waived'].includes(String(decision.previous_decision_status ?? ''))
  ) {
    throw new Error(
      'STATE_COORDINATOR_INVALID_MERGED_SPEC_RECOVERY_FAILED: prior active decision must be invalidated',
    );
  }

  const manifest = await readJson(
    path.join(input.projectRoot, '.specforge', 'project', 'spec_manifest.json'),
  );
  if (
    String(manifest.last_merged_work_item ?? '') !== input.workItemId ||
    String(manifest.project_spec_version ?? '') !==
      String(recovery.proof.current_project_spec?.project_spec_version ?? '')
  ) {
    throw new Error(
      'STATE_COORDINATOR_INVALID_MERGED_SPEC_RECOVERY_FAILED: current Project Spec ownership changed',
    );
  }

  for (const evidence of recovery.proof.input_files ?? []) {
    const source = path.join(input.projectRoot, ...String(evidence.relative_path).split('/'));
    relativeInside(
      input.projectRoot,
      source,
      'STATE_COORDINATOR_INVALID_MERGED_SPEC_RECOVERY_FAILED',
    );
    const content = await readRegularFile(
      source,
      'STATE_COORDINATOR_INVALID_MERGED_SPEC_RECOVERY_FAILED',
    );
    if (content.byteLength !== evidence.size || sha256(content) !== evidence.sha256) {
      throw new Error(
        `STATE_COORDINATOR_INVALID_MERGED_SPEC_RECOVERY_FAILED: validation input changed: ${evidence.relative_path}`,
      );
    }
  }
  return recovery;
}

export async function writeInvalidMergedSpecRecoveryRecord(
  workItemDir: string,
  record: Record<string, unknown>,
): Promise<string> {
  const recoveryPath = path.join(workItemDir, RECOVERY_FILE);
  await writeJsonAtomic(recoveryPath, record);
  return recoveryPath;
}

export async function restoreFileAtomically(filePath: string, content: Buffer): Promise<void> {
  const temporary = `${filePath}.rollback-${process.pid}-${Date.now()}-${randomUUID()}`;
  await fs.writeFile(temporary, content);
  await fs.rename(temporary, filePath);
}
