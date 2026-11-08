import * as fs from 'node:fs/promises';
import path from 'node:path';
import {
  projectSpecManifest,
  workItemRoot,
  workItemCandidateTasks,
} from '@specforge/types/directory-layout';
import { evaluateMergeReport, validateCurrentUserDecisionValue } from '@specforge/types';
import { readAuthoritativeState } from '../tools/lib/state-coordinator-v11';
import { guardHardStop } from '../tools/lib/hard-stop-latch';
import { readWorkItemMetadata } from '../tools/lib/work-item-metadata';
import { validateWorkItemId } from '../tools/lib/work-item-id-validator';
import { candidateManifestContentBlockCode } from '../tools/lib/candidate-manifest-owner';
import {
  validateApprovedUserDecisionForClose,
  computeCandidateHash,
} from '../tools/lib/governance-invariants-v11';
import {
  parseTaskSections,
  parseTaskVerification,
  validateTaskArtifactContract,
} from '../tools/lib/sf_markdown_verification_parser';
import { VALID_VERIFICATION_TYPES } from '../tools/lib/sf_verification_types';
import {
  assertVerificationPath,
  canonicalVerificationJson,
  readVerificationFile,
  verificationId,
} from './owner-store';
import type { VerificationAuthoritySnapshot } from './verification-plan';

export interface VerificationTaskSelector {
  workItemId: string;
  taskId: string;
  verificationType: string;
  commandIndex: number;
}

export async function captureVerificationAuthority(
  input: VerificationTaskSelector & {
    deps: unknown;
    projectRoot: string;
    consumePurpose?: 'implementation' | 'formal';
  }
): Promise<VerificationAuthoritySnapshot> {
  if (
    validateWorkItemId(input.workItemId) ||
    !new RegExp(`^TASK-${input.workItemId}-[0-9]{3}$`).test(input.taskId) ||
    !VALID_VERIFICATION_TYPES.includes(
      input.verificationType as (typeof VALID_VERIFICATION_TYPES)[number]
    ) ||
    !Number.isSafeInteger(input.commandIndex) ||
    input.commandIndex < 0 ||
    input.commandIndex > 63
  )
    throw new Error('VERIFICATION_TASK_SELECTOR_INVALID');
  const root = path.resolve(input.projectRoot),
    wiRoot = workItemRoot(root, input.workItemId);
  await assertVerificationPath(wiRoot);
  const hardStop = guardHardStop(root, input.workItemId, 'sf_verification_run');
  if (!hardStop.allowed) throw new Error(hardStop.error);
  const state = await readAuthoritativeState({
    deps: input.deps,
    projectRoot: root,
    workItemId: input.workItemId,
  });
  const states =
    input.consumePurpose === 'formal'
      ? ['verification_running', 'verification_done', 'closed']
      : input.consumePurpose === 'implementation'
        ? ['implementation_running', 'implementation_done', 'verification_running']
        : ['implementation_running', 'verification_running'];
  if (state.source !== 'StateManager' || !states.includes(String(state.current_state))) {
    throw new Error('VERIFICATION_AUTHORITATIVE_STATE_REQUIRED');
  }
  const metadata = await readWorkItemMetadata(wiRoot, input.workItemId);
  const files: Record<string, string> = {};
  let total = 0;
  async function read(file: string): Promise<Buffer> {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    if (relative.startsWith('../') || path.isAbsolute(relative))
      throw new Error('VERIFICATION_AUTHORITY_OUTSIDE_PROJECT');
    const raw = await readVerificationFile(file);
    total += raw.length;
    if (total > 16 * 1024 * 1024 || Object.keys(files).length > 2048)
      throw new Error('VERIFICATION_AUTHORITY_BUDGET');
    files[relative] = verificationId(raw);
    return raw;
  }
  const metadataRawSha256 = verificationId(
    await readVerificationFile(path.join(wiRoot, 'work_item.json'))
  );
  // Normal state/Close owners refresh these observation timestamps. All other metadata stays bound.
  const {
    updated_at: _updated,
    code_permission_revoked_at: _revokedAt,
    ...metadataBasis
  } = metadata;
  const metadataBasisSha256 = verificationId(canonicalVerificationJson(metadataBasis));
  const manifestPath = path.join(wiRoot, 'candidate_manifest.json'),
    decisionPath = path.join(wiRoot, 'user_decision.json');
  const manifestRaw = await read(manifestPath);
  if (candidateManifestContentBlockCode(manifestRaw.toString('utf8'), input.workItemId))
    throw new Error('VERIFICATION_CANDIDATE_MANIFEST_INVALID');
  const decision = JSON.parse((await read(decisionPath)).toString('utf8')) as Record<
    string,
    unknown
  >;
  if (!validateCurrentUserDecisionValue(decision, input.workItemId).valid)
    throw new Error('VERIFICATION_APPROVAL_SCHEMA_INVALID');
  const approved = await validateApprovedUserDecisionForClose({
    projectRoot: root,
    workItemDir: wiRoot,
    workItemId: input.workItemId,
    candidateManifestPath: manifestPath,
    userDecisionPath: decisionPath,
  });
  if (!approved.valid)
    throw new Error('VERIFICATION_APPROVAL_INVALID:' + approved.errors.join(';'));
  const merge = evaluateMergeReport(
    (await read(path.join(wiRoot, 'merge_report.md'))).toString('utf8'),
    input.workItemId
  );
  const frozenManifest = JSON.parse(manifestRaw.toString('utf8')) as {
    merge_required: boolean;
    entries: unknown[];
  };
  const codeOnlyNoMerge =
    metadata['workflow_path'] === 'code_only_fast_path' &&
    !frozenManifest.merge_required &&
    frozenManifest.entries.length === 0 &&
    merge.status === 'not_applicable';
  if (!merge.valid || (merge.status !== 'success' && !codeOnlyNoMerge))
    throw new Error('VERIFICATION_SUCCESSFUL_SPEC_MERGE_REQUIRED');
  await read(path.join(wiRoot, 'governance_scope.json'));
  const projectManifest = JSON.parse(
    (await read(projectSpecManifest(root))).toString('utf8')
  ) as Record<string, unknown>;
  const psv = projectManifest['project_spec_version'];
  if (
    typeof psv !== 'string' ||
    !/^PSV-[0-9]{4,}$/.test(psv) ||
    metadata['project_spec_version_at_permission'] !== psv
  ) {
    throw new Error('VERIFICATION_CURRENT_PSV_BINDING_REQUIRED');
  }
  const manifest = JSON.parse(manifestRaw.toString('utf8')) as {
    entries: Array<{ candidate_path: string }>;
  };
  for (const entry of manifest.entries) {
    const candidate = path.resolve(wiRoot, entry.candidate_path);
    if (!candidate.startsWith(wiRoot + path.sep))
      throw new Error('VERIFICATION_CANDIDATE_PATH_INVALID');
    await read(candidate);
  }
  async function projectTree(directory: string): Promise<void> {
    await assertVerificationPath(directory);
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('VERIFICATION_AUTHORITY_LINK');
      if (entry.isDirectory()) await projectTree(full);
      else await read(full);
    }
  }
  await projectTree(path.dirname(projectSpecManifest(root)));
  await projectTree(path.join(wiRoot, 'candidates'));
  // Candidate file bytes remain approved after merge; only pre-merge manifest/summary identities may normalize.
  if (
    typeof decision['candidate_hash'] !== 'string' ||
    decision['candidate_hash'] !== (await computeCandidateHash(wiRoot))
  ) {
    throw new Error('VERIFICATION_APPROVED_CANDIDATE_CONTENT_CHANGED');
  }
  // Tasks are WI-owned; the merge manifest contains Project Spec destinations, not every approved Candidate file.
  // The canonical Tasks bytes were included above in the full approved candidates/ content hash.
  const taskPath = workItemCandidateTasks(root, input.workItemId);
  const tasksRaw = await read(taskPath),
    text = tasksRaw.toString('utf8');
  if (!validateTaskArtifactContract(text).valid)
    throw new Error('VERIFICATION_TASK_DOCUMENT_INVALID');
  const sections = parseTaskSections(text).filter(s => s.taskId === input.taskId);
  if (sections.length !== 1) throw new Error('VERIFICATION_TASK_NOT_FOUND');
  const parsed = parseTaskVerification(sections[0].content),
    declared =
      parsed.typedCommands?.[
        input.verificationType as keyof NonNullable<typeof parsed.typedCommands>
      ];
  const commands = typeof declared === 'string' ? [declared] : declared;
  const command = commands?.[input.commandIndex];
  if (typeof command !== 'string' || !command.trim())
    throw new Error('VERIFICATION_COMMAND_NOT_FOUND');
  const snapshot = {
    state: state.current_state as VerificationAuthoritySnapshot['state'],
    purpose:
      input.consumePurpose ??
      (state.current_state === 'implementation_running'
        ? ('implementation' as const)
        : ('formal' as const)),
    workItemId: input.workItemId,
    psv,
    files,
    taskPath: path.relative(root, taskPath).replace(/\\/g, '/'),
    taskId: input.taskId,
    verificationType: input.verificationType,
    commandIndex: input.commandIndex,
    command,
    metadataRawSha256,
    metadataBasisSha256,
  };
  const { state: _state, metadataRawSha256: _raw, ...basis } = snapshot;
  return {
    ...snapshot,
    basisIdentity: verificationId(canonicalVerificationJson(basis)),
    identity: verificationId(canonicalVerificationJson(snapshot)),
  };
}
