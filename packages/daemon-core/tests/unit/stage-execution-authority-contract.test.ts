import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const authorityPath = resolve(repoRoot, 'docs/design/SpecForge架构一致性治理最终实施方案.md');
const handoffPath = resolve(repoRoot, 'docs/implementation/architecture-consistency/current-handoff.md');

function ruleSection(authority: string, ruleId: string): string {
  const marker = `**${ruleId}：**`;
  const canonical = `\n${marker}`;
  const newlineStart = authority.indexOf(canonical);
  const start = newlineStart >= 0 ? newlineStart + 1 : (authority.startsWith(marker) ? 0 : -1);
  if (start < 0) throw new Error(`missing canonical rule marker: ${marker}`);
  const tailStart = start + marker.length;
  const tail = authority.slice(tailStart);
  const candidates = [
    tail.search(/\n\*\*[A-Z][A-Z0-9-]+：\*\*/),
    tail.search(/\n## (?=\d+\.|附录 )/),
    tail.search(/\n<!-- SPECFORGE_NEW_SESSION_PROMPT:START -->/),
  ].filter((value) => value >= 0);
  const end = candidates.length > 0 ? tailStart + Math.min(...candidates) : authority.length;
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
      'DELIVERY_IDENTITY_CONTRACT=',
      'DELIVERY_INTERNAL_REFERENCE_CONTRACT=',
      'BOOTSTRAP_ENVELOPE_CONTRACT=',
      'BOOTSTRAP_EXECUTION_ORDER_CONTRACT=',
      'RECOVERY_ACCEPTANCE_CONTRACT=',
      'AUTHORITY_BOOTSTRAP_CONTRACT=',
      'AUTHORITY_BOOTSTRAP_FAILURE_CONTRACT=',
      'AUTHORITY_BOOTSTRAP_FAILURE_TEMPLATE_CONTRACT=',
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
    const liveRefIndex = prompt.indexOf('STRUCTURED_GIT_LS_REMOTE');
    const exactAuthorityIndex = prompt.indexOf('BOOTSTRAP_EXECUTION_PHASE=AUTHORITY_EXACT_READ');
    const recoveryIndex = prompt.indexOf('BOOTSTRAP_EXECUTION_PHASE=RECOVERY');
    const selfCheckIndex = prompt.indexOf('===== BEGIN BOOTSTRAP ENVELOPE SELF CHECK =====');

    expect(receiptIndex).toBeGreaterThanOrEqual(0);
    expect(liveRefIndex).toBeGreaterThan(receiptIndex);
    expect(exactAuthorityIndex).toBeGreaterThan(liveRefIndex);
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
      'NEXT_LEGAL_ACTION',
    ]) {
      expect(identity, token).toContain(token);
    }

    expect(prompt).toContain('DELIVERY_INTERNAL_REFERENCE_AUDIT=PASS|FAIL');
    expect(prompt).toContain('DELIVERY_INTERNAL_REFERENCE_MISMATCHES=');
    expect(prompt).toContain('GOV-STAGE-DELIVERY-IDENTITY-001#INTERNAL_REFERENCE');
    expect(envelope).toContain('GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-TEMPLATE-001');
    expect(envelope).toContain('GOV-STAGE-DELIVERY-IDENTITY-001#INTERNAL_REFERENCE');
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
      '## 11. 实施影响范围',
      '## 12. 验收与完成标准',
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
    expect(authority).toContain('APPROVED_DEDUP_SCOPE=D1,D2,D3,D4,D5,D6,D7,D8');
    expect(authority).toContain('RULE_ID_DEFINITION_SET_PRESERVED=YES');
  });

});
