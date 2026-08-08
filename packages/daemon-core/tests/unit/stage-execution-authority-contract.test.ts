import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const authorityPath = resolve(repoRoot, 'docs/design/SpecForge架构一致性治理最终实施方案.md');
const handoffPath = resolve(repoRoot, 'docs/implementation/architecture-consistency/current-handoff.md');

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
  'GOV-STAGE-DELIVERY-001',
  'GOV-STAGE-RECEIPT-001',
  'GOV-STAGE-ARTIFACT-VERIFY-001',
  'GOV-STAGE-VALIDATOR-001',
  'GOV-STAGE-RECOVERY-ACCEPT-001',
  'GOV-STAGE-AUTHORITY-BOOTSTRAP-001',
  'GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-001',
];

describe('Stage Execution Contract authority', () => {
  it('keeps canonical stage rule markers in the unique authority', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    expect(authority).toContain('本文件是 SpecForge 架构一致性治理（包括契约治理）的唯一当前权威源。');
    expect(authority).toContain('### 0.9.2 完整阶段执行、失败诊断与跨会话一致性协议');

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
      'CURRENT_BLOCKER=',
      'OPERATION_BOUNDARY=',
      'FORBIDDEN_ACTIONS=',
      'NEXT_STAGE=',
      'NEXT_LEGAL_ACTION=',
      'STOP_CONDITION=',
      'LOCAL_COMMAND_SHELL=',
      'DOWNLOAD_PACKAGE_DIR=',
      'LOCAL_PATH_QUOTING=',
      'PERMANENT_INSUFFICIENT_EVIDENCE=',
      'AUTHORITY_BRANCH=',
      'WORK_BRANCH=',
      'DELIVERY_FORMAT=',
      'POWERSHELL_ALLOWED=',
      'FEEDBACK_CONTRACT=',
      'ARTIFACT_ACCEPTANCE_CONTRACT=',
      'VALIDATOR_CONTRACT=',
      'RECOVERY_ACCEPTANCE_CONTRACT=',
      'AUTHORITY_BOOTSTRAP_CONTRACT=',
      'AUTHORITY_BOOTSTRAP_FAILURE_CONTRACT=',
      'SESSION_CONTINUITY_INPUT=',
    ]) {
      expect(handoff, field).toContain(field);
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

    const recoveryStart = authority.indexOf('**GOV-STAGE-RECOVERY-ACCEPT-001：**');
    const recoveryEnd = authority.indexOf('### 0.10 新会话固定提示词', recoveryStart);
    expect(recoveryStart).toBeGreaterThanOrEqual(0);
    expect(recoveryEnd).toBeGreaterThan(recoveryStart);
    const recoverySection = authority.slice(recoveryStart, recoveryEnd);

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

    const bootstrapStart = authority.indexOf('**GOV-STAGE-AUTHORITY-BOOTSTRAP-001：**');
    const bootstrapEnd = authority.indexOf('### 0.4 SpecForge 自身开发：修改前治理', bootstrapStart);
    expect(bootstrapStart).toBeGreaterThanOrEqual(0);
    expect(bootstrapEnd).toBeGreaterThan(bootstrapStart);
    const bootstrapSection = authority.slice(bootstrapStart, bootstrapEnd);

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

    const promptStart = authority.indexOf('### 0.10 新会话固定提示词');
    expect(promptStart).toBeGreaterThanOrEqual(0);
    const promptSection = authority.slice(promptStart);
    expect(promptSection).toContain('AUTHORITY_BOOTSTRAP_ACCEPTED!=YES');
    expect(promptSection).toContain('raw/main');
    expect(promptSection).toContain('MISSING_LAST_EXECUTION_RECEIPT');
  });

  it('enforces complete fail-closed bootstrap output and accepted live-ref evidence artifact', async () => {
    const authority = await readFile(authorityPath, 'utf8');

    const failureStart = authority.indexOf('**GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-001：**');
    const failureEnd = authority.indexOf('### 0.4 SpecForge 自身开发：修改前治理', failureStart);
    expect(failureStart).toBeGreaterThanOrEqual(0);
    expect(failureEnd).toBeGreaterThan(failureStart);
    const failureSection = authority.slice(failureStart, failureEnd);

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
      expect(failureSection, field).toContain(field);
    }

    expect(failureSection).toContain('ACQUIRE_LIVE_BRANCH_REF_ONLY');

    const promptStart = authority.indexOf('### 0.10 新会话固定提示词');
    expect(promptStart).toBeGreaterThanOrEqual(0);
    const promptSection = authority.slice(promptStart);
    for (const field of [
      'AUTHORITY_BOOTSTRAP_FAILURE_ACCEPTED',
      'AUTHORITY_BOOTSTRAP_PHASE_ACCESS_AUDIT',
      'AUTHORITY_BOOTSTRAP_EVIDENCE_ARTIFACT_ACCEPTED',
      'ARTIFACT_TYPE=BOOTSTRAP_LIVE_REF_EVIDENCE_ZIP',
    ]) {
      expect(promptSection, field).toContain(field);
    }
  });

});
