import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const authorityPath = resolve(repoRoot, 'docs/design/SpecForge架构一致性治理最终实施方案.md');
const handoffPath = resolve(repoRoot, 'docs/implementation/architecture-consistency/current-handoff.md');

function ruleSection(authority: string, ruleId: string): string {
  const marker = `**${ruleId}：**`;
  const lines = authority.split('\n');
  let offset = 0;
  let inFence = false;
  let start = -1;
  let startLine = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const logicalLine = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (/^\s*```/.test(logicalLine)) {
      inFence = !inFence;
    } else if (!inFence && logicalLine.startsWith(marker)) {
      start = offset;
      startLine = index;
      break;
    }
    offset += line.length + 1;
  }

  if (start < 0 || startLine < 0) {
    throw new Error(`missing canonical rule marker: ${marker}`);
  }

  let end = authority.length;
  let scanOffset = start + lines[startLine].length + 1;
  inFence = false;

  for (let index = startLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const logicalLine = line.endsWith('\r') ? line.slice(0, -1) : line;

    if (/^\s*```/.test(logicalLine)) {
      inFence = !inFence;
      scanOffset += line.length + 1;
      continue;
    }

    if (
      !inFence &&
      (
        /^\*\*[A-Z][A-Z0-9-]+：\*\*/.test(logicalLine) ||
        /^#{2,3}\s+[0-9]+(?:\.[0-9]+)*(?:\.)?\s+/.test(logicalLine) ||
        /^##\s+附录(?:\s+|$)/.test(logicalLine) ||
        logicalLine === '<!-- SPECFORGE_NEW_SESSION_PROMPT:START -->'
      )
    ) {
      end = scanOffset;
      break;
    }

    scanOffset += line.length + 1;
  }

  return authority.slice(start, end);
}
function newSessionPrompt(authority: string): string {
  const startMarker = '<!-- SPECFORGE_NEW_SESSION_PROMPT:START -->';
  const endMarker = '<!-- SPECFORGE_NEW_SESSION_PROMPT:END -->';
  const start = authority.indexOf(startMarker);
  const end = authority.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end <= start) throw new Error('invalid new-session prompt markers');
  return authority.slice(start, end + endMarker.length);
}

const stageRuleIds = [
  'GOV-STAGE-001',
  'GOV-STAGE-INPUT-001',
  'GOV-STAGE-CHK-001',
  'GOV-STAGE-OUTPUT-001',
  'GOV-STAGE-DIAG-001',
  'GOV-STAGE-SIDEFX-001',
  'GOV-STAGE-RETRY-001',
  'GOV-STAGE-TRUTH-001',
  'GOV-STAGE-BLOCKER-001',
  'GOV-STAGE-HANDOFF-001',
  'GOV-STAGE-ENV-001',
  'GOV-STAGE-BRANCH-001',
  'GOV-STAGE-TEMPLATE-001',
  'GOV-STAGE-DELIVERY-001',
  'GOV-STAGE-RECEIPT-001',
  'GOV-STAGE-ARTIFACT-VERIFY-001',
  'GOV-STAGE-VALIDATOR-001',
  'GOV-STAGE-DELIVERY-IDENTITY-001',
  'GOV-STAGE-BOOTSTRAP-ENVELOPE-001',
  'GOV-STAGE-RECOVERY-ACCEPT-001',
  'GOV-STAGE-AUTHORITY-BOOTSTRAP-001',
  'GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-001',
  'GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-TEMPLATE-001',
];

describe('Stage Execution Contract authority', () => {
  it('keeps canonical stage rule markers in the unique authority', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    expect(authority).toContain('本文件是 SpecForge 架构一致性治理（包括契约治理）的唯一当前权威源。');
    expect(authority).toContain('## 2. SpecForge 自身开发与执行治理协议');

    for (const ruleId of stageRuleIds) {
      const marker = `**${ruleId}：**`;
      expect(authority.split(marker).length - 1, marker).toBe(1);
    }

    for (const field of [
      'GLOBAL_GOAL=',
      'CURRENT_STAGE=',
      'SUCCESS_CRITERIA=',
      'EXPECTED_SIDE_EFFECTS=',
      'FORBIDDEN_SIDE_EFFECTS=',
      'LAST_SUCCESSFUL_STEP=',
      'FIRST_FAILED_STEP=',
      'FAILURE_CLASS=',
      'REQUEST_STARTED=',
      'RESPONSE_RECEIVED=',
      'RETRY_SAFETY=',
      'NEXT_LEGAL_ACTION=',
      'AUTHORITY_BRANCH=',
      'WORKTREE_STATUS=',
      'LOCAL_COMMAND_SHELL=',
      'DOWNLOAD_PACKAGE_DIR=',
      'LOCAL_PATH_QUOTING=',
      'RECOVERY_PRECONCLUSION_FIELDS_AUDIT=',
      'RECOVERY_STAGE_INPUT_FIELDS_AUDIT=',
      'RECOVERY_BRANCH_MODEL_AUDIT=',
      'RECOVERY_ENVIRONMENT_AUDIT=',
      'RECOVERY_TRUTH_SOURCE_AUDIT=',
      'RECOVERY_OPERATION_BOUNDARY_AUDIT=',
      'RECOVERY_NEXT_ACTION_CLASS=',
      'RECOVERY_EVIDENCE_GAPS=',
      'RECOVERY_VALIDATOR_ID=',
      'RECOVERY_VALIDATOR_ACCEPTED=',
      'RECOVERY_ACCEPTED=',
      'AUTHORITY_HEAD=',
      'WORK_BRANCH=',
      'WORK_HEAD=',
      'REMOTE_WORK_HEAD=',
      'PACKAGE_NAME=',
      'PACKAGE_SHA256=',
      'ACTION_TYPE=',
      'BRANCH_SWITCHED=',
      'WORKTREE_AFTER=',
      'FILES_CHANGED=',
      'IMMUTABLE_EVIDENCE_CREATED=',
      'FAILURE_CLASS=',
      'ERROR_CODE=',
      'ERROR=',
      'POWERSHELL_ALLOWED=NO',
      'DELIVERY_FORMAT=ONE_COMPLETE_ZIP_PLUS_ONE_COPY_PASTE_CMD',
      'REMOTE_URL=',
      'AUTHORITY_PATH=',
      'AUTHORITY_COMMIT=',
      'CURRENT_AUTHORITATIVE_STATE=',
      'CURRENT_IMMUTABLE_EVIDENCE=',
      'OPERATION_BOUNDARY=',
      'STOP_CONDITION=',
      'BLOCKER=',
      'BACKLOG=',
      'NEXT_STAGE=',
      'ARTIFACT_ID=',
      'ARTIFACT_TYPE=',
      'ARTIFACT_CONTRACT=',
      'GENERATOR=',
      'VALIDATOR=',
      'STRUCTURE_VALIDATION=',
      'COMPLETENESS_VALIDATION=',
      'SEMANTIC_VALIDATION=',
      'REFERENCE_VALIDATION=',
      'SCOPE_VALIDATION=',
      'EXECUTABILITY_VALIDATION=',
      'CONSUMER_VALIDATION=',
      'VALIDATION_EVIDENCE=',
      'ARTIFACT_ACCEPTED=',
      'ARTIFACT_ACCEPTANCE_AUDIT=',
      'VALIDATOR_ID=',
      'VALIDATION_TARGET=',
      'CONTRACT_SOURCE=',
      'TRUTH_SOURCE=',
      'BASELINE_SOURCE=',
      'BASELINE_FRESHNESS=',
      'VALIDATOR_SELF_CHECK=',
      'VALIDATOR_ACCEPTED=',
      'DELIVERY_ID=',
      'RUNNER_ID=',
      'RECEIPT_EMITTER_ID=',
      'IDENTITY_MANIFEST=',
      'IDENTITY_BINDING_AUDIT=',
      'ASSERTION_ID=',
      'ASSERTION_TYPE=',
      'BLOCKING=',
      'AUTHORITY_BOOTSTRAP_REMOTE_URL=',
      'AUTHORITY_BOOTSTRAP_BRANCH=',
      'AUTHORITY_BOOTSTRAP_PATH=',
      'AUTHORITY_HEAD_SOURCE=',
      'AUTHORITY_EXACT_CONTENT_REF=',
      'AUTHORITY_UNIQUE_MARKER_AUDIT=',
      'AUTHORITY_BOOTSTRAP_EVIDENCE=',
      'AUTHORITY_BOOTSTRAP_EVIDENCE_FRESHNESS=',
      'AUTHORITY_BOOTSTRAP_VALIDATOR_ID=',
      'AUTHORITY_BOOTSTRAP_VALIDATOR_ACCEPTED=',
      'AUTHORITY_BOOTSTRAP_ACCEPTED=',
    ]) {
      expect(authority, field).toContain(field);
    }

    for (const failureClass of [
      'PRODUCT_DEFECT',
      'GOVERNANCE_FAILURE',
      'VALIDATION_HARNESS_DEFECT',
      'ENVIRONMENT_FAILURE',
      'AMBIGUOUS_SIDE_EFFECT',
    ]) {
      expect(authority, failureClass).toContain(failureClass);
    }
  });

  it('keeps exactly one current execution state block in handoff', async () => {
    const handoff = await readFile(handoffPath, 'utf8');
    expect(handoff.split('<!-- SPECFORGE_CURRENT_EXECUTION_STATE:START -->').length - 1).toBe(1);
    expect(handoff.split('<!-- SPECFORGE_CURRENT_EXECUTION_STATE:END -->').length - 1).toBe(1);
    for (const field of [
      'GLOBAL_GOAL=',
      'CURRENT_STAGE=',
      'CURRENT_STAGE_STATUS=',
      'LAST_COMPLETED_STAGE=',
      'CURRENT_BLOCKER=',
      'REMOTE_HEAD_BASELINE=',
      'AUTHORITY_BASELINE_COMMIT=',
      'VALIDATION_PROJECT=',
      'CURRENT_WI=',
      'AUTHORITATIVE_WI_STATE=',
      'LATEST_IMMUTABLE_EVIDENCE=',
      'LATEST_PRODUCT_FIX=',
      'OPERATION_BOUNDARY=',
      'FORBIDDEN_ACTIONS=',
      'NEXT_STAGE=',
      'NEXT_LEGAL_ACTION=',
      'STOP_CONDITION=',
      'PERMANENT_INSUFFICIENT_EVIDENCE=',
      'LOCAL_COMMAND_SHELL=',
      'DOWNLOAD_PACKAGE_DIR=',
      'LOCAL_PATH_QUOTING=',
    ]) {
      expect(handoff, field).toContain(field);
    }
  });
  it('keeps Rule section parsing aligned with the V2 structural boundary matrix', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    const envelope = ruleSection(authority, 'GOV-STAGE-BOOTSTRAP-ENVELOPE-001');
    for (const token of [
      'RULE_SECTION_BOUNDARY_CONTRACT=V2',
      'RULE_SECTION_START=NON_FENCED_CANONICAL_RULE_ID_LINE',
      'RULE_SECTION_END=NEXT_NON_FENCED_RULE_ID|NEXT_NON_FENCED_NUMBERED_SECTION_HEADING_L2_L3|NEXT_NON_FENCED_APPENDIX_HEADING_L2|PROMPT_START',
      'RULE_SECTION_INTERNAL_SUBHEADING_LEVEL_MIN=4',
      'RULE_SECTION_FENCED_CONTENT=IGNORE',
      'RULE_SECTION_PROMPT_SYNC=ONLY_IF_PREAUTHORITY_BEHAVIOR_FIELDS_CHANGE',
    ]) {
      expect(envelope, token).toContain(token);
    }

    const internalAndFenced = [
      '**GOV-TEST-001：** parent rule',
      'parent-value',
      '#### 2.11.7 internal subheading',
      'internal-value',
      '```text',
      '**GOV-FAKE-001：** fenced fake rule',
      '### 9.9 fenced fake heading',
      '## 附录 Z. fenced fake appendix',
      '```',
      '### 3.1 real numbered boundary',
      'outside-value',
    ].join('\n');
    const internalSection = ruleSection(internalAndFenced, 'GOV-TEST-001');
    expect(internalSection).toContain('#### 2.11.7 internal subheading');
    expect(internalSection).toContain('internal-value');
    expect(internalSection).toContain('**GOV-FAKE-001：** fenced fake rule');
    expect(internalSection).toContain('### 9.9 fenced fake heading');
    expect(internalSection).toContain('## 附录 Z. fenced fake appendix');
    expect(internalSection).not.toContain('### 3.1 real numbered boundary');
    expect(internalSection).not.toContain('outside-value');

    for (const boundary of [
      '**GOV-TEST-002：** next rule',
      '### 0.9 numbered compatibility boundary',
      '### 3.1 real numbered subsection boundary',
      '## 4. real numbered chapter boundary',
      '## 附录 A. real appendix boundary',
      '<!-- SPECFORGE_NEW_SESSION_PROMPT:START -->',
    ]) {
      const sample = [
        '**GOV-TEST-001：** parent rule',
        'kept-value',
        boundary,
        'outside-value',
      ].join('\n');
      const section = ruleSection(sample, 'GOV-TEST-001');
      expect(section, boundary).toContain('kept-value');
      expect(section, boundary).not.toContain(boundary);
      expect(section, boundary).not.toContain('outside-value');
    }
  });

  it('enforces canonical Stage Input and new-session Recovery Acceptance structurally', async () => {
    const authority = await readFile(authorityPath, 'utf8');

    const stageInputStart = authority.indexOf('**GOV-STAGE-INPUT-001：**');
    const stageInputEnd = authority.indexOf('**GOV-STAGE-CHK-001：**', stageInputStart);
    expect(stageInputStart).toBeGreaterThanOrEqual(0);
    expect(stageInputEnd).toBeGreaterThan(stageInputStart);
    const stageInputSection = authority.slice(stageInputStart, stageInputEnd);

    for (const field of [
      'GLOBAL_GOAL=',
      'CURRENT_STAGE=',
      'STAGE_GOAL=',
      'REMOTE_URL=',
      'AUTHORITY_BRANCH=',
      'AUTHORITY_HEAD=',
      'AUTHORITY_PATH=',
      'AUTHORITY_COMMIT=',
      'WORK_BRANCH=',
      'WORK_HEAD=',
      'REMOTE_WORK_HEAD=',
      'WORKTREE_STATUS=',
      'CURRENT_AUTHORITATIVE_STATE=',
      'CURRENT_IMMUTABLE_EVIDENCE=',
      'OPERATION_BOUNDARY=',
      'SUCCESS_CRITERIA=',
      'EXPECTED_SIDE_EFFECTS=',
      'FORBIDDEN_SIDE_EFFECTS=',
      'STOP_CONDITION=',
      'BLOCKER=',
      'BACKLOG=',
      'NEXT_STAGE=',
      'LOCAL_COMMAND_SHELL=',
      'DOWNLOAD_PACKAGE_DIR=',
      'LOCAL_PATH_QUOTING=',
    ]) {
      expect(stageInputSection, field).toContain(field);
    }

    const requiredBlockStart = stageInputSection.indexOf('```text');
    const requiredBlockEnd = stageInputSection.indexOf('```', requiredBlockStart + 7);
    const requiredBlock = stageInputSection.slice(requiredBlockStart, requiredBlockEnd);
    expect(requiredBlock).not.toContain('TARGET_BRANCH=');
    expect(requiredBlock).not.toContain('REMOTE_HEAD=');

    const recoverySection = ruleSection(authority, 'GOV-STAGE-RECOVERY-ACCEPT-001');

    for (const field of [
      'RECOVERY_PRECONCLUSION_FIELDS_AUDIT=',
      'RECOVERY_STAGE_INPUT_FIELDS_AUDIT=',
      'RECOVERY_BRANCH_MODEL_AUDIT=',
      'RECOVERY_ENVIRONMENT_AUDIT=',
      'RECOVERY_TRUTH_SOURCE_AUDIT=',
      'RECOVERY_OPERATION_BOUNDARY_AUDIT=',
      'RECOVERY_NEXT_ACTION_CLASS=',
      'RECOVERY_EVIDENCE_GAPS=',
      'RECOVERY_VALIDATOR_ID=',
      'RECOVERY_VALIDATOR_ACCEPTED=',
      'RECOVERY_ACCEPTED=',
    ]) {
      expect(recoverySection, field).toContain(field);
    }

    expect(recoverySection).toContain('READ_ONLY_RECONCILIATION');
    expect(recoverySection).toContain('SIDE_EFFECT_ACTION');
    expect(recoverySection).toContain('WAIT_USER_AUTHORIZATION');
  });

  it('enforces live-ref-first authority bootstrap before new-session recovery', async () => {
    const authority = await readFile(authorityPath, 'utf8');

    const bootstrapSection = ruleSection(authority, 'GOV-STAGE-AUTHORITY-BOOTSTRAP-001');

    for (const field of [
      'AUTHORITY_BOOTSTRAP_REMOTE_URL=',
      'AUTHORITY_BOOTSTRAP_BRANCH=',
      'AUTHORITY_BOOTSTRAP_PATH=',
      'AUTHORITY_HEAD_SOURCE=',
      'AUTHORITY_HEAD=',
      'AUTHORITY_EXACT_CONTENT_REF=',
      'AUTHORITY_UNIQUE_MARKER_AUDIT=',
      'AUTHORITY_BOOTSTRAP_EVIDENCE=',
      'AUTHORITY_BOOTSTRAP_EVIDENCE_FRESHNESS=',
      'AUTHORITY_BOOTSTRAP_VALIDATOR_ID=',
      'AUTHORITY_BOOTSTRAP_VALIDATOR_ACCEPTED=',
      'AUTHORITY_BOOTSTRAP_ACCEPTED=',
    ]) {
      expect(bootstrapSection, field).toContain(field);
    }

    for (const source of [
      'STRUCTURED_GIT_LS_REMOTE',
      'GITHUB_REF_API_LIVE',
      'USER_BOOTSTRAP_GIT_LS_REMOTE',
      'LAST_COMPLETE_RECEIPT',
      'WEB_AUXILIARY',
      'BRANCH_RAW_CONTENT',
    ]) {
      expect(bootstrapSection, source).toContain(source);
    }

    const promptSection = newSessionPrompt(authority);
    for (const token of [
      'AUTHORITY_BOOTSTRAP_ACCEPTED=YES|NO',
      'BOOTSTRAP_EXECUTION_PHASE=AUTHORITY_EXACT_READ',
      'BOOTSTRAP_EXECUTION_PHASE=RECOVERY',
    ]) {
      expect(promptSection, token).toContain(token);
    }
    expect(promptSection.indexOf('BOOTSTRAP_EXECUTION_PHASE=AUTHORITY_EXACT_READ')).toBeLessThan(
      promptSection.indexOf('BOOTSTRAP_EXECUTION_PHASE=RECOVERY'),
    );
    expect(promptSection).toContain('raw/main');
    expect(promptSection).toContain('LAST_EXECUTION_RECEIPT_STATUS=PRESENT_VALID|PRESENT_INVALID|NONE_ALLOWED|MISSING_REQUIRED');
    expect(promptSection).toContain('LAST_EXECUTION_RECEIPT_CONSUMPTION_AUDIT=PASS|FAIL|NOT_APPLICABLE');
    expect(bootstrapSection).toContain('`AUTHORITY_COMMIT` 与 `AUTHORITY_HEAD` 是不同事实');
    expect(bootstrapSection).toContain('`AUTHORITY_HEAD` 是 authority branch 当前 ref');
    expect(bootstrapSection).toContain('`AUTHORITY_COMMIT` 是 authority 文件最近一次变更 commit');
  });


  it('hardens bootstrap, delivery, exact-source applicability, whitespace preflight, and receipt checkpoint truth', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    const bootstrap = ruleSection(authority, 'GOV-STAGE-AUTHORITY-BOOTSTRAP-001');
    const delivery = ruleSection(authority, 'GOV-STAGE-DELIVERY-001');
    const artifact = ruleSection(authority, 'GOV-STAGE-ARTIFACT-VERIFY-001');
    const identity = ruleSection(authority, 'GOV-STAGE-DELIVERY-IDENTITY-001');
    const envelope = ruleSection(authority, 'GOV-STAGE-BOOTSTRAP-ENVELOPE-001');
    const receipt = ruleSection(authority, 'GOV-STAGE-RECEIPT-001');
    const validatorRule = ruleSection(authority, 'GOV-STAGE-VALIDATOR-001');
    const prompt = newSessionPrompt(authority);

    for (const token of [
      'AUTHORITY_REF_API_URL=https://api.github.com/repos/lyqstart/SpecForge/git/ref/heads/main',
      'LIVE_REF_RESOLUTION_POLICY=ORDERED_APPROVED_SOURCE_FALLBACK',
      'LIVE_REF_RESOLUTION_ORDER=GITHUB_REF_API_LIVE>STRUCTURED_GIT_LS_REMOTE>USER_BOOTSTRAP_GIT_LS_REMOTE',
      'LIVE_REF_SOURCE_FAILURE_FALLBACK=NEXT_APPROVED_SOURCE_ONLY',
      'LIVE_REF_WEB_AUXILIARY_FALLBACK_ALLOWED=NO',
      'BOOTSTRAP_DECLARATION_IS_EXECUTION=NO',
    ]) {
      expect(bootstrap, token).toContain(token);
      expect(envelope, token).toContain(token);
      expect(prompt, token).toContain(token);
    }

    for (const token of [
      'OUTER_CMD_CONTROL_FLOW=LINEAR_REQUIRED_STEPS',
      'OUTER_CMD_INLINE_IF_CHAIN_ALLOWED=NO',
      'OUTER_CMD_OPTIONAL_CLEANUP_GATES_REQUIRED_STEPS_ALLOWED=NO',
      'OUTER_CMD_TEMP_DIR_ABSENT_FIXTURE_REQUIRED=YES',
      'OUTER_CMD_TEMP_DIR_PRESENT_FIXTURE_REQUIRED=YES',
      'OUTER_CMD_ZIP_MISSING_FIXTURE_REQUIRED=YES',
      'OUTER_CMD_RUNNER_ENTRY_MISSING_FIXTURE_REQUIRED=YES',
      'BUNDLE_DIR_ID_SCHEMA=SF${DELIVERY_ID}',
      'BUNDLE_IDENTITY_MATCH_MODE=EXACT_EXPECTED_BUNDLE_NAME',
      'OUTER_CMD_DYNAMIC_ZIP_DISCOVERY_ALLOWED=NO',
      'WINDOWS_SCRIPT_SHIM_LAUNCH_MODE=CMD_CALL_BY_COMMAND_NAME',
      'WINDOWS_CLI_DIRECT_EXEC_REQUIRES=VERIFIED_PE_EXECUTABLE',
      'WINDOWS_CLI_RESOLUTION_EVIDENCE_REQUIRED=YES',
      'DELIVERY_MANIFEST_SCHEMA_VALIDATION_REQUIRED=YES',
      'DELIVERY_MANIFEST_RUNNER_ENTRY_PATH=runner_entry',
      'DELIVERY_MANIFEST_IDENTITY_PATH=identity',
    ]) {
      expect(delivery, token).toContain(token);
      expect(envelope, token).toContain(token);
      expect(prompt, token).toContain(token);
    }

    for (const token of [
      'SOURCE_PATCH_ANCHOR_SOURCE=EXACT_COMMIT_CONTENT_ONLY',
      'SOURCE_PATCH_LOG_RECONSTRUCTED_BLOCK_ALLOWED=NO',
      'SOURCE_PATCH_MINIMAL_EXACT_OR_STRUCTURAL_SCOPE_REQUIRED=YES',
      'SOURCE_PATCH_ANCHOR_CARDINALITY_PREWRITE_REQUIRED=YES',
      'ARTIFACT_TARGET_APPLICABILITY_PREFLIGHT_REQUIRED=YES',
    ]) {
      expect(validatorRule, token).toContain(token);
    }

    expect(artifact).toContain('TEXT_FILE_EOF_POLICY=SINGLE_FINAL_NEWLINE');
    expect(artifact).toContain('SOURCE_PATCH_PRETEST_GIT_DIFF_CHECK_REQUIRED=YES');
    expect(receipt).toContain('RECEIPT_CHECKPOINT_FACT_PRESERVATION_REQUIRED=YES');
    expect(receipt).toContain('RECEIPT_FAILED_RESULT_RESETS_PRIOR_PASS=NO');

    expect(artifact).toContain('TEMP_DIR_ABSENT');
    expect(artifact).toContain('TEMP_DIR_PRESENT');
    expect(artifact).toContain('ZIP_MISSING');
    expect(artifact).toContain('RUNNER_ENTRY_MISSING');
    expect(identity).toContain('OUTER_CMD_CONTROL_FLOW=LINEAR_REQUIRED_STEPS');
    expect(identity).toContain('SF${DELIVERY_ID}');
    expect(identity).toContain('EXACT_EXPECTED_BUNDLE_NAME');
    expect(identity).toContain('identity.delivery_id');
    expect(envelope).toContain('BOOTSTRAP_ENVELOPE_VERSION=3');
    expect(prompt).toContain('BOOTSTRAP_ENVELOPE_VERSION=3');
  });

  it('enforces complete fail-closed bootstrap output and accepted live-ref evidence artifact', async () => {
    const authority = await readFile(authorityPath, 'utf8');

    const failureSection = ruleSection(authority, 'GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-001');
    for (const token of [
      'GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-TEMPLATE-001',
      'ACQUIRE_LIVE_BRANCH_REF_ONLY',
      'AUTHORITY_BOOTSTRAP_FAILURE_ACCEPTED',
      'GOV-STAGE-ARTIFACT-VERIFY-001',
      'GOV-STAGE-VALIDATOR-001',
    ]) {
      expect(failureSection, token).toContain(token);
    }

    const failureTemplateSection = ruleSection(authority, 'GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-TEMPLATE-001');
    for (const field of [
      'AUTHORITY_BOOTSTRAP_FAILURE_REASON=',
      'AUTHORITY_BOOTSTRAP_PHASE_ACCESS_AUDIT=',
      'AUTHORITY_BOOTSTRAP_NEXT_ACTION=',
      'AUTHORITY_BOOTSTRAP_READ_ONLY_EVIDENCE_REQUIRED=',
      'AUTHORITY_BOOTSTRAP_EVIDENCE_ARTIFACT_ID=',
      'AUTHORITY_BOOTSTRAP_EVIDENCE_ARTIFACT_ACCEPTED=',
      'AUTHORITY_BOOTSTRAP_FAILURE_ACCEPTED=',
      'ARTIFACT_TYPE=BOOTSTRAP_LIVE_REF_EVIDENCE_ZIP',
      'VALIDATION_EVIDENCE=',
      'ARTIFACT_ACCEPTED=YES|NO',
    ]) {
      expect(failureTemplateSection, field).toContain(field);
    }

    const promptSection = newSessionPrompt(authority);
    for (const field of [
      'AUTHORITY_BOOTSTRAP_FAILURE_ACCEPTED',
      'AUTHORITY_BOOTSTRAP_PHASE_ACCESS_AUDIT',
      'AUTHORITY_BOOTSTRAP_EVIDENCE_ARTIFACT_ACCEPTED',
      'ARTIFACT_TYPE=BOOTSTRAP_LIVE_REF_EVIDENCE_ZIP',
    ]) {
      expect(promptSection, field).toContain(field);
    }
  });
  it('enforces fixed bootstrap failure template and forbids raw command delivery', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    const section = ruleSection(authority, 'GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-TEMPLATE-001');
    for (const token of [
      '===== BEGIN AUTHORITY BOOTSTRAP FAILURE ACCEPTANCE =====',
      '===== END AUTHORITY BOOTSTRAP FAILURE ACCEPTANCE =====',
      'BOOTSTRAP_FAILURE_DELIVERY_MODE=ONE_ACCEPTED_ZIP_PLUS_ONE_CMD',
      'RAW_CMD_ALLOWED=NO',
      '===== BEGIN BOOTSTRAP EVIDENCE ARTIFACT ACCEPTANCE =====',
      'ARTIFACT_TYPE=BOOTSTRAP_LIVE_REF_EVIDENCE_ZIP',
      'ARTIFACT_ACCEPTED=YES|NO',
      'REPOSITORY_READS=NONE',
      'REPOSITORY_WRITES=NONE',
      'LIFECYCLE_ACTIONS=NONE',
    ]) {
      expect(section, token).toContain(token);
    }
    const prompt = newSessionPrompt(authority);
    for (const token of [
      'AUTHORITY_BOOTSTRAP_FAILURE_ACCEPTED=YES|NO',
      'AUTHORITY_BOOTSTRAP_EVIDENCE_ARTIFACT_ACCEPTED=YES|NO|NOT_YET_GENERATED',
      'ARTIFACT_TYPE=BOOTSTRAP_LIVE_REF_EVIDENCE_ZIP',
      'RAW_CMD_ALLOWED=NO',
      'ONE_ACCEPTED_ZIP_PLUS_ONE_CMD',
      'ARTIFACT_ACCEPTED=YES|NO',
      'REPOSITORY_READS=NONE',
      'REPOSITORY_WRITES=NONE',
      'LIFECYCLE_ACTIONS=NONE',
    ]) {
      expect(prompt, token).toContain(token);
    }
  });

  it('binds package runner validator and receipt emitter to one delivery identity', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    const section = ruleSection(authority, 'GOV-STAGE-DELIVERY-IDENTITY-001');

    for (const field of [
      'DELIVERY_ID=',
      'PACKAGE_NAME=',
      'RUNNER_ID=',
      'VALIDATOR_ID=',
      'RECEIPT_EMITTER_ID=',
      'IDENTITY_MANIFEST=manifest.json',
      'IDENTITY_BINDING_AUDIT=PASS|FAIL',
      'identity.delivery_id',
      'identity.runner.delivery_id',
      'identity.validator.delivery_id',
      'identity.receipt_emitter.delivery_id',
    ]) {
      expect(section, field).toContain(field);
    }
  });

  it('keeps the pre-authority bootstrap envelope self-contained and structurally scoped', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    const rule = ruleSection(authority, 'GOV-STAGE-BOOTSTRAP-ENVELOPE-001');
    const prompt = newSessionPrompt(authority);

    for (const token of [
      'LAST_EXECUTION_RECEIPT_STATUS=PRESENT_VALID|PRESENT_INVALID|NONE_ALLOWED|MISSING_REQUIRED',
      'LAST_EXECUTION_RECEIPT_CONSUMPTION_AUDIT=PASS|FAIL|NOT_APPLICABLE',
      'AUTHORITY_BOOTSTRAP_FAILURE_ACCEPTED=YES|NO',
      'BOOTSTRAP_FAILURE_DELIVERY_MODE=ONE_ACCEPTED_ZIP_PLUS_ONE_CMD',
      'RAW_CMD_ALLOWED=NO',
      'ARTIFACT_TYPE=BOOTSTRAP_LIVE_REF_EVIDENCE_ZIP',
      'GOV-STAGE-DELIVERY-IDENTITY-001',
      'DELIVERY_ID=',
      'PACKAGE_NAME=',
      'RUNNER_ID=',
      'VALIDATOR_ID=',
      'RECEIPT_EMITTER_ID=',
      'IDENTITY_MANIFEST=manifest.json',
      'IDENTITY_BINDING_AUDIT=PASS|FAIL',
      'REPOSITORY_READS=NONE',
      'REPOSITORY_WRITES=NONE',
      'LIFECYCLE_ACTIONS=NONE',
      'BOOTSTRAP_COORDINATES_CONTRACT=PASS|FAIL',
      'BOOTSTRAP_RECEIPT_CONSUMPTION_CONTRACT=PASS|FAIL',
      'BOOTSTRAP_FAILURE_CONTRACT=PASS|FAIL',
      'BOOTSTRAP_EVIDENCE_DELIVERY_CONTRACT=PASS|FAIL',
      'BOOTSTRAP_SUCCESS_TRANSITION_CONTRACT=PASS|FAIL',
      'BOOTSTRAP_ENVELOPE_ACCEPTED=YES|NO',
      'RECOVERY_ACCEPTED=YES',
    ]) {
      expect(prompt, token).toContain(token);
    }

    for (const ruleId of [
      'GOV-STAGE-AUTHORITY-BOOTSTRAP-001',
      'GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-001',
      'GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-TEMPLATE-001',
      'GOV-STAGE-DELIVERY-001',
      'GOV-STAGE-ARTIFACT-VERIFY-001',
      'GOV-STAGE-VALIDATOR-001',
      'GOV-STAGE-DELIVERY-IDENTITY-001',
      'GOV-STAGE-BOOTSTRAP-ENVELOPE-001',
    ]) {
      expect(rule, ruleId).toContain(ruleId);
    }

    expect(authority.split('<!-- SPECFORGE_NEW_SESSION_PROMPT:START -->').length - 1).toBe(1);
    expect(authority.split('<!-- SPECFORGE_NEW_SESSION_PROMPT:END -->').length - 1).toBe(1);
    expect(authority).toContain('**GOV-STAGE-RECOVERY-ACCEPT-001：**');
  });
it('enforces receipt-first pre-tool guard and ordered bootstrap execution before recovery reads', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    const rule = ruleSection(authority, 'GOV-STAGE-BOOTSTRAP-ENVELOPE-001');
    const prompt = newSessionPrompt(authority);

    for (const token of [
      '===== BEGIN BOOTSTRAP ENVELOPE PRETOOL GUARD =====',
      'BOOTSTRAP_EXECUTION_PHASE=RECEIPT_AUDIT',
      'BOOTSTRAP_ALLOWED_TOOL_CLASS=NONE',
      'BOOTSTRAP_PRETOOL_GUARD_ACCEPTED=YES|NO',
      'BOOTSTRAP_EXECUTION_PHASE=LIVE_REF_RESOLUTION',
      'BOOTSTRAP_ALLOWED_TOOL_CLASS=LIVE_REF_ONLY',
      'BOOTSTRAP_EXECUTION_PHASE=AUTHORITY_EXACT_READ',
      'BOOTSTRAP_ALLOWED_TOOL_CLASS=EXACT_AUTHORITY_ONLY',
      'BOOTSTRAP_UNAUTHORIZED_READ_DETECTED=YES|NO',
      'BOOTSTRAP_EXECUTION_ORDER_AUDIT=PASS|FAIL',
      '===== BEGIN BOOTSTRAP ENVELOPE SELF CHECK =====',
      '===== END BOOTSTRAP ENVELOPE SELF CHECK =====',
      'BOOTSTRAP_EXECUTION_PHASE=RECOVERY',
      'BOOTSTRAP_ALLOWED_TOOL_CLASS=RECOVERY',
    ]) {
      expect(prompt, token).toContain(token);
    }

    const receiptIndex = prompt.indexOf('BOOTSTRAP_EXECUTION_PHASE=RECEIPT_AUDIT');
    const liveRefPhaseIndex = prompt.indexOf('BOOTSTRAP_EXECUTION_PHASE=LIVE_REF_RESOLUTION');
    const exactAuthorityIndex = prompt.indexOf('BOOTSTRAP_EXECUTION_PHASE=AUTHORITY_EXACT_READ');
    const recoveryIndex = prompt.indexOf('BOOTSTRAP_EXECUTION_PHASE=RECOVERY');
    const selfCheckIndex = prompt.indexOf('===== BEGIN BOOTSTRAP ENVELOPE SELF CHECK =====');

    expect(receiptIndex).toBeGreaterThanOrEqual(0);
    expect(liveRefPhaseIndex).toBeGreaterThan(receiptIndex);
    expect(exactAuthorityIndex).toBeGreaterThan(liveRefPhaseIndex);
    expect(selfCheckIndex).toBeGreaterThan(exactAuthorityIndex);
    expect(recoveryIndex).toBeGreaterThan(selfCheckIndex);

    for (const token of [
      'BOOTSTRAP_PRETOOL_GUARD_ACCEPTED=YES|NO',
      'BOOTSTRAP_EXECUTION_ORDER_AUDIT=PASS|FAIL',
      'BOOTSTRAP_UNAUTHORIZED_READ_DETECTED=YES|NO',
    ]) {
      expect(rule, token).toContain(token);
    }
  });

  it('enforces canonical machine templates as fill-only exact schemas and serial bootstrap phases', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    const templateRule = ruleSection(authority, 'GOV-STAGE-TEMPLATE-001');
    const bootstrapRule = ruleSection(authority, 'GOV-STAGE-BOOTSTRAP-ENVELOPE-001');
    const artifactVerifyRule = ruleSection(authority, 'GOV-STAGE-ARTIFACT-VERIFY-001');
    const prompt = newSessionPrompt(authority);

    for (const token of [
      'CANONICAL_TEMPLATE_EXECUTION_MODE=FILL_ONLY',
      'CANONICAL_TEMPLATE_SOURCE=APPENDIX_A_EMBEDDED_CANONICAL_BLOCK|EXACT_AUTHORITY_MARKER_SCOPED_BLOCK',
      'CANONICAL_TEMPLATE_STRUCTURE_MUTATION_ALLOWED=NO',
      'CANONICAL_TEMPLATE_VALUE_SLOT_MUTATION_ALLOWED=YES',
      'CANONICAL_TEMPLATE_FIELD_NAME_MUTATION_ALLOWED=NO',
      'CANONICAL_TEMPLATE_FIELD_ORDER_MUTATION_ALLOWED=NO',
      'CANONICAL_TEMPLATE_MARKER_MUTATION_ALLOWED=NO',
      'CANONICAL_TEMPLATE_ENUM_VALUE_SOURCE=DECLARED_SCHEMA_ONLY',
      'CANONICAL_TEMPLATE_RUNTIME_NEWLINE=LF',
      'CANONICAL_TEMPLATE_LITERAL_BACKSLASH_N_ALLOWED=NO',
      'CANONICAL_TEMPLATE_VALIDATION_REQUIRED=YES',
      'CANONICAL_TEMPLATE_VALIDATION_RESULT=PASS|FAIL',
    ]) {
      expect(templateRule, token).toContain(token);
      expect(prompt, token).toContain(token);
    }
    for (const token of [
      'CANONICAL_TEMPLATE_EXECUTION_MODE=FILL_ONLY',
      'BOOTSTRAP_TOOL_PHASE_EXECUTION_MODE=SERIAL_ONE_PHASE_PER_TOOL_CALL',
      'BOOTSTRAP_CROSS_PHASE_BATCH_READ_ALLOWED=NO',
    ]) {
      expect(bootstrapRule, token).toContain(token);
      expect(prompt, token).toContain(token);
    }
    expect(artifactVerifyRule).toContain('ARTIFACT_TARGET_HASH_DOMAIN=NORMALIZED_UTF8_LF_SINGLE_TERMINAL_LF');
    expect(artifactVerifyRule).toContain('ARTIFACT_TARGET_HASH_PRODUCER_CONSUMER_DOMAIN_MATCH_REQUIRED=YES');

    const begin = '===== BEGIN BOOTSTRAP ENVELOPE PRETOOL GUARD =====';
    const end = '===== END BOOTSTRAP ENVELOPE PRETOOL GUARD =====';
    const canonicalDefinition = [
      begin,
      'BOOTSTRAP_EXECUTION_PHASE=RECEIPT_AUDIT',
      'BOOTSTRAP_ALLOWED_TOOL_CLASS=NONE',
      'LAST_EXECUTION_RECEIPT_STATUS=PRESENT_VALID|PRESENT_INVALID|NONE_ALLOWED|MISSING_REQUIRED',
      'LAST_EXECUTION_RECEIPT_PACKAGE_NAME=',
      'LAST_EXECUTION_RECEIPT_DELIVERY_ID=',
      'LAST_EXECUTION_RECEIPT_VALIDATOR_ID=',
      'LAST_EXECUTION_RECEIPT_IDENTITY_BINDING_AUDIT=',
      'LAST_EXECUTION_RECEIPT_RESULT=',
      'LAST_EXECUTION_RECEIPT_CONSUMPTION_AUDIT=PASS|FAIL|NOT_APPLICABLE',
      'BOOTSTRAP_RECEIPT_CONSUMPTION_CONTRACT=PASS|FAIL',
      'BOOTSTRAP_UNAUTHORIZED_READ_DETECTED=NO',
      'BOOTSTRAP_EXECUTION_ORDER_AUDIT=PASS|FAIL',
      'BOOTSTRAP_PRETOOL_GUARD_ACCEPTED=YES|NO',
      end,
    ].join('\n');
    const extractGuard = (content: string): string => {
      const start = content.indexOf(begin);
      const finish = content.indexOf(end, start + begin.length);
      if (start < 0 || finish < 0) throw new Error('canonical pre-tool guard missing');
      return content.slice(start, finish + end.length).replace(/\r\n/g, '\n');
    };
    expect(extractGuard(bootstrapRule)).toBe(canonicalDefinition);
    expect(extractGuard(prompt)).toBe(canonicalDefinition);

    const schema: Array<{ key: string; values: string[] | null }> = [
      { key: 'BOOTSTRAP_EXECUTION_PHASE', values: ['RECEIPT_AUDIT'] },
      { key: 'BOOTSTRAP_ALLOWED_TOOL_CLASS', values: ['NONE'] },
      { key: 'LAST_EXECUTION_RECEIPT_STATUS', values: ['PRESENT_VALID', 'PRESENT_INVALID', 'NONE_ALLOWED', 'MISSING_REQUIRED'] },
      { key: 'LAST_EXECUTION_RECEIPT_PACKAGE_NAME', values: null },
      { key: 'LAST_EXECUTION_RECEIPT_DELIVERY_ID', values: null },
      { key: 'LAST_EXECUTION_RECEIPT_VALIDATOR_ID', values: null },
      { key: 'LAST_EXECUTION_RECEIPT_IDENTITY_BINDING_AUDIT', values: null },
      { key: 'LAST_EXECUTION_RECEIPT_RESULT', values: null },
      { key: 'LAST_EXECUTION_RECEIPT_CONSUMPTION_AUDIT', values: ['PASS', 'FAIL', 'NOT_APPLICABLE'] },
      { key: 'BOOTSTRAP_RECEIPT_CONSUMPTION_CONTRACT', values: ['PASS', 'FAIL'] },
      { key: 'BOOTSTRAP_UNAUTHORIZED_READ_DETECTED', values: ['NO'] },
      { key: 'BOOTSTRAP_EXECUTION_ORDER_AUDIT', values: ['PASS', 'FAIL'] },
      { key: 'BOOTSTRAP_PRETOOL_GUARD_ACCEPTED', values: ['YES', 'NO'] },
    ];
    const validateFilledGuard = (content: string): boolean => {
      const lines = content.replace(/\r\n/g, '\n').split('\n');
      if (lines.length !== schema.length + 2 || lines[0] !== begin || lines[lines.length - 1] !== end) return false;
      const body = lines.slice(1, -1);
      for (let index = 0; index < schema.length; index += 1) {
        const line = body[index];
        const equals = line.indexOf('=');
        if (equals <= 0) return false;
        const key = line.slice(0, equals);
        const value = line.slice(equals + 1);
        const expected = schema[index];
        if (key !== expected.key) return false;
        if (expected.values === null) {
          if (value.length === 0) return false;
        } else if (!expected.values.includes(value)) {
          return false;
        }
      }
      return true;
    };
    const validGuard = [
      begin,
      'BOOTSTRAP_EXECUTION_PHASE=RECEIPT_AUDIT',
      'BOOTSTRAP_ALLOWED_TOOL_CLASS=NONE',
      'LAST_EXECUTION_RECEIPT_STATUS=PRESENT_VALID',
      'LAST_EXECUTION_RECEIPT_PACKAGE_NAME=SFV156.zip',
      'LAST_EXECUTION_RECEIPT_DELIVERY_ID=V156',
      'LAST_EXECUTION_RECEIPT_VALIDATOR_ID=V156_BOOTSTRAP_LIVE_REF_EVIDENCE_VALIDATOR',
      'LAST_EXECUTION_RECEIPT_IDENTITY_BINDING_AUDIT=PASS',
      'LAST_EXECUTION_RECEIPT_RESULT=SUCCESS',
      'LAST_EXECUTION_RECEIPT_CONSUMPTION_AUDIT=PASS',
      'BOOTSTRAP_RECEIPT_CONSUMPTION_CONTRACT=PASS',
      'BOOTSTRAP_UNAUTHORIZED_READ_DETECTED=NO',
      'BOOTSTRAP_EXECUTION_ORDER_AUDIT=PASS',
      'BOOTSTRAP_PRETOOL_GUARD_ACCEPTED=YES',
      end,
    ].join('\n');
    expect(validateFilledGuard(validGuard)).toBe(true);
    expect(validateFilledGuard(validGuard.replace(/\n/g, '\\n'))).toBe(false);

    const missing = validGuard.split('\n').filter(line => !line.startsWith('LAST_EXECUTION_RECEIPT_PACKAGE_NAME=')).join('\n');
    const extra = validGuard.replace(end, `EXTRA_FIELD=NO\n${end}`);
    const reorderedLines = validGuard.split('\n');
    [reorderedLines[4], reorderedLines[5]] = [reorderedLines[5], reorderedLines[4]];
    const mutations = [
      validGuard.replace('LAST_EXECUTION_RECEIPT_STATUS=PRESENT_VALID', 'LAST_RECEIPT_STATUS=PRESENT_VALID'),
      missing,
      extra,
      reorderedLines.join('\n'),
      validGuard.replace('LAST_EXECUTION_RECEIPT_STATUS=PRESENT_VALID', 'LAST_EXECUTION_RECEIPT_STATUS=PRESENT_COMPLETE'),
      validGuard.replace(begin, '===== BEGIN BOOTSTRAP ENVELOPE PRETOOL GUARD V2 ====='),
      validGuard.replace(end, '===== END BOOTSTRAP ENVELOPE PRETOOL_GUARD ====='),
    ];
    for (const mutation of mutations) expect(validateFilledGuard(mutation)).toBe(false);
  });

  it('enforces current-delivery references inside receipt control fields and bootstrap delivery templates', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    const identity = ruleSection(authority, 'GOV-STAGE-DELIVERY-IDENTITY-001');
    const envelope = ruleSection(authority, 'GOV-STAGE-BOOTSTRAP-ENVELOPE-001');
    const prompt = newSessionPrompt(authority);

    for (const token of [
      'DELIVERY_INTERNAL_REFERENCE_AUDIT=PASS|FAIL',
      'DELIVERY_INTERNAL_REFERENCE_MISMATCHES=NONE|<field:token,...>',
      'CURRENT_DELIVERY_REFERENCE_FIELDS=',
      'VERSION_TOKEN_PATTERN=V[0-9]+',
      'receipt_current_delivery_reference_fields',
      'CURRENT_STAGE',
      'ACTION_NAME',
      'NEXT_STAGE',
      'NEXT_LEGAL_ACTION',
      'RESULT=SUCCESS',
    ]) {
      expect(identity, token).toContain(token);
    }

    expect(prompt).toContain('DELIVERY_INTERNAL_REFERENCE_AUDIT=PASS|FAIL');
    expect(prompt).toContain('DELIVERY_INTERNAL_REFERENCE_MISMATCHES=');
    expect(prompt).toContain('GOV-STAGE-DELIVERY-IDENTITY-001#INTERNAL_REFERENCE');
    expect(envelope).toContain('GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-TEMPLATE-001');
    expect(envelope).toContain('GOV-STAGE-DELIVERY-IDENTITY-001#INTERNAL_REFERENCE');
    expect(identity).toContain('历史事实若确需引用旧版本');
    expect(identity).toContain('provenance/evidence');
    expect(identity).toContain('CURRENT_*');
    expect(identity).toContain('NEXT_*');
    expect(identity).toContain('ACTION_*');
  });

  it('keeps one numbered authority information architecture without legacy parallel numbering', async () => {
    const authority = await readFile(authorityPath, 'utf8');

    const expectedChapters = [
      '## 1. 文档定位、权威边界与设计原则',
      '## 2. SpecForge 自身开发与执行治理协议',
      '## 3. SpecForge 目标治理架构',
      '## 4. Requirement → Impact → Classification → Workflow',
      '## 5. Candidate 与正式 Spec 生产',
      '## 6. Contract 与 Trace',
      '## 7. Gate 与 Fast Path 强制治理',
      '## 8. Implementation → Verification → Release',
      '## 9. 项目初始化、首次 WI 与后续 WI',
      '## 10. SpecForge 产品实施路线',
      '## 11. Implementation Mapping',
      '## 12. 验收矩阵与完成标准',
      '## 附录 A. 新会话固定启动提示词',
      '## 附录 B. Rule ID 索引',
    ];

    let cursor = -1;
    for (const heading of expectedChapters) {
      expect(authority.split(heading).length - 1, heading).toBe(1);
      const next = authority.indexOf(heading);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }

    expect(authority).not.toMatch(/^#{1,3}\s+[〇一二三四五六七八九十百]+、/m);
    expect(authority).not.toMatch(/^#{1,3}\s+0\.\d+(?:\.\d+)*\s+/m);
    expect(authority).not.toMatch(/^#{1,3}\s+[A-R]\.\s+/m);

    expect(authority.split('<!-- SPECFORGE_NEW_SESSION_PROMPT:START -->').length - 1).toBe(1);
    expect(authority.split('<!-- SPECFORGE_NEW_SESSION_PROMPT:END -->').length - 1).toBe(1);
    expect(authority).toContain('APPROVED_DEDUP_SCOPE=D1,D2,D3,D4,D5,D6,D7,D8,D9,D10,D11,D12,D13,D14,D15,D16,D17,D18,D19');
    expect(authority).toContain('RULE_ID_DEFINITION_SET_PRESERVED=YES');
  });

it('keeps D9-D14 authority content architecture canonical and non-overlapping', async () => {
    const authority = await readFile(authorityPath, 'utf8');

    const protocolHeadings = [
      '### 2.6 Fail Closed 与证据不足',
      '### 2.7 Continuity 与当前用户授权边界',
      '### 2.8 Stage Execution Contract',
      '### 2.9 Truth Source、Artifact Acceptance 与 Validator',
      '### 2.10 Delivery、Receipt 与 Delivery Identity',
      '### 2.11 Bootstrap Envelope',
      '### 2.12 Recovery Acceptance',
    ];
    let protocolCursor = -1;
    for (const heading of protocolHeadings) {
      expect(authority.split(heading).length - 1, heading).toBe(1);
      const next = authority.indexOf(heading);
      expect(next, heading).toBeGreaterThan(protocolCursor);
      protocolCursor = next;
    }

    const lifecycleStart = '<!-- SPECFORGE_CANONICAL_PRODUCT_LIFECYCLE:START -->';
    const lifecycleEnd = '<!-- SPECFORGE_CANONICAL_PRODUCT_LIFECYCLE:END -->';
    expect(authority.split(lifecycleStart).length - 1).toBe(1);
    expect(authority.split(lifecycleEnd).length - 1).toBe(1);
    const lifecycle = authority.slice(authority.indexOf(lifecycleStart), authority.indexOf(lifecycleEnd) + lifecycleEnd.length);
    for (const token of [
      'Work Item / Intake',
      'Classification / Workflow Routing',
      'Candidate Preparation',
      'Required Candidate Gates',
      'User Decision',
      'Atomic Spec Merge',
      'Post-Spec-Merge Gate',
      'Code Permission',
      'Implementation',
      'Actual Scope Audit',
      'Verification',
      'Formal Version Gate',
      'Close Gate',
      'Git Merge',
    ]) {
      expect(lifecycle, token).toContain(token);
    }

    for (const forbidden of [
      '审计日期：2026-08-01',
      '9 个测试文件、82 个测试',
      '尚未完成对应源码对账',
      'governance active=true',
      '新治理模型 active=true',
      '当前代码虽然预留了 `domain_model.md`',
      '当前 Classification 已有',
      '当前 `canUseCodeOnlyFastPath()`',
      '当前 Code Permission 主要只有',
      '当前 Changed Files Audit 已经可以',
      '当前 Verification Gate 已经',
      '当前 `sf_close_gate` 已经要求',
    ]) {
      expect(authority, forbidden).not.toContain(forbidden);
    }

    for (let phase = 2; phase <= 13; phase += 1) {
      const startToken = `### 10.${phase} `;
      const start = authority.indexOf(startToken);
      expect(start, startToken).toBeGreaterThanOrEqual(0);
      const next = phase < 13 ? authority.indexOf(`### 10.${phase + 1} `, start) : authority.indexOf('## 11. Implementation Mapping', start);
      expect(next, startToken).toBeGreaterThan(start);
      const section = authority.slice(start, next);
      for (const label of [
        '**Goal**',
        '**Canonical References**',
        '**Required Outputs**',
        '**Exit Criteria**',
        '**Required Tests**',
      ]) {
        expect(section, `${startToken}${label}`).toContain(label);
      }
    }

    expect(authority).toContain('IMPLEMENTATION_MAPPING_ONLY=YES');
    expect(authority).toContain('TASK_WRITE_SCOPE_AUTHORITY=NO');
    expect(authority).toContain('| Scenario | Preconditions | Applicable Rules | Expected Artifact / Evidence | Expected Gate / Control | Expected State / Result |');
    expect(authority).toContain('### 12.1 Acceptance Matrix');
    expect(authority).toContain('### 12.2 最终完成标准');
    expect(authority).not.toContain('### 12.19');

    expect(authority).toContain('STATUS=ACTIVE');
    expect(authority).toContain('STATUS=NOT_APPLICABLE');
    expect(authority).toContain('REASON=<为什么不适用>');
    expect(authority).toContain('EVIDENCE=<支持该结论的事实来源>');

    expect(authority).toContain('APPROVED_DEDUP_SCOPE=D1,D2,D3,D4,D5,D6,D7,D8,D9,D10,D11,D12,D13,D14,D15,D16,D17,D18,D19');
  });


  it('keeps final D15-D19 authority semantics stable and source-bound', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    const contractHandler = await readFile(
      resolve(repoRoot, 'packages/daemon-core/src/tools/handlers/sf-contract-register.ts'),
      'utf8',
    );
    const contractProducer = await readFile(
      resolve(repoRoot, 'packages/daemon-core/src/tools/lib/contract-authoring.ts'),
      'utf8',
    );
    const mergeHandler = await readFile(
      resolve(repoRoot, 'packages/daemon-core/src/tools/handlers/sf-v11-merge.ts'),
      'utf8',
    );
    const mergeProducer = await readFile(
      resolve(repoRoot, 'packages/daemon-core/src/tools/lib/merge-runner-v11.ts'),
      'utf8',
    );

    expect(authority).toContain(
      'APPROVED_DEDUP_SCOPE=D1,D2,D3,D4,D5,D6,D7,D8,D9,D10,D11,D12,D13,D14,D15,D16,D17,D18,D19',
    );
    expect(authority).toContain(
      'D15_D19_FINAL_CONTENT_CLOSURE=DEDUP_SCOPE|IMPLEMENTATION_MAPPING|POST_SPEC_MERGE_TERM|PROJECT_CONTRACT_PRODUCER|ATOMIC_SPEC_MERGE_PRODUCER',
    );

    expect(authority).toContain('## 11. Implementation Mapping');
    expect(authority).not.toContain('## 11. 实施影响范围');
    expect(authority).toContain('IMPLEMENTATION_MAPPING_ONLY=YES');
    expect(authority).toContain('TASK_WRITE_SCOPE_AUTHORITY=NO');

    expect(authority).toContain('Post-Spec-Merge Gate');
    expect(authority).not.toContain('Post-Merge Gate');
    const lifecycleStart = authority.indexOf('<!-- SPECFORGE_CANONICAL_PRODUCT_LIFECYCLE:START -->');
    const lifecycleEnd = authority.indexOf('<!-- SPECFORGE_CANONICAL_PRODUCT_LIFECYCLE:END -->');
    expect(lifecycleStart).toBeGreaterThanOrEqual(0);
    expect(lifecycleEnd).toBeGreaterThan(lifecycleStart);
    const lifecycle = authority.slice(lifecycleStart, lifecycleEnd);
    expect(lifecycle).toContain('Atomic Spec Merge');
    expect(lifecycle).toContain('Post-Spec-Merge Gate');
    expect(lifecycle).toContain('Git Merge');

    for (const token of [
      'PROJECT_CONTRACT_CANDIDATE_PUBLIC_TOOL=sf_contract_register',
      'PROJECT_CONTRACT_CANDIDATE_CORE_PRODUCER=packages/daemon-core/src/tools/lib/contract-authoring.ts::authorContractCandidate()',
      'PROJECT_CONTRACT_CANDIDATE_WRITE_SCOPE=WORK_ITEM_CANDIDATE_ONLY',
      'PROJECT_CONTRACT_FORMAL_TRUTH_WRITE=NO',
    ]) {
      expect(authority, token).toContain(token);
    }
    expect(contractHandler).toContain("registerHandler('sf_contract_register'");
    expect(contractHandler).toContain('authorContractCandidate({');
    expect(contractProducer).toContain('export async function authorContractCandidate');

    for (const token of [
      'ATOMIC_SPEC_MERGE_PUBLIC_HANDLER=sf_v11_merge',
      'ATOMIC_SPEC_MERGE_CORE_PRODUCER=packages/daemon-core/src/tools/lib/merge-runner-v11.ts::executeMerge()',
      'ATOMIC_SPEC_MERGE_SEMANTIC_SCOPE=PROJECT_SPEC_ACTIVATION',
      'GIT_MERGE_SEMANTIC_SCOPE=SEPARATE',
    ]) {
      expect(authority, token).toContain(token);
    }
    expect(mergeHandler).toContain("registerHandler('sf_v11_merge'");
    expect(mergeHandler).toContain('const result = await executeMerge({');
    expect(mergeProducer).toContain('export async function executeMerge');
  });



  it('keeps historical V133 error-ledger evidence structurally preserved', async () => {
    const ledger = await readFile(
      resolve(repoRoot, 'docs/rule/specforge-development-error-ledger-and-experience.md'),
      'utf8',
    );
    const err284Start = '<!-- SPECFORGE_ERR284_EXP250_POST_INSERTION_CONSUMER_COUNT_DEFECT:START -->';
    const err284End = '<!-- SPECFORGE_ERR284_EXP250_POST_INSERTION_CONSUMER_COUNT_DEFECT:END -->';
    const start = ledger.indexOf(err284Start);
    const end = ledger.indexOf(err284End, start + err284Start.length);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const err284 = ledger.slice(start, end + err284End.length);
    expect(err284).toContain('\n## ERR-284 / EXP-250');
    expect(err284).not.toContain('\\n## ERR-284 / EXP-250');
    expect(err284).not.toContain('\\n<!-- SPECFORGE_ERR284');
    for (const token of [
      '## ERR-286 / EXP-252',
      '## ERR-287 / EXP-253',
      '## ERR-288 / EXP-254',
      '## ERR-289 / EXP-255',
    ]) {
      expect(ledger, token).toContain(token);
    }
  });


});
