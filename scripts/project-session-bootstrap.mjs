#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PROJECT_STATUS_PATH = 'docs/project-status.md';
export const AUTHORITY_REGISTRY_PATH = 'docs/product-specification/authority-registry.md';
export const PRODUCT_SPECIFICATION_PATH =
  'docs/product-specification/specforge-product-specification.md';
export const EXECUTION_PROTOCOL_PATH =
  'docs/rule/specforge-execution-mode-and-evidence-protocol.md';
export const ACTIVE_DEVELOPMENT_RULES_PATH =
  'docs/rule/specforge-active-development-rules.md';
export const HISTORICAL_LEDGER_PATH =
  'docs/rule/specforge-development-error-ledger-and-experience.md';
export const PROJECT_STATUS_START = '<!-- SPECFORGE_PROJECT_STATUS:START -->';
export const PROJECT_STATUS_END = '<!-- SPECFORGE_PROJECT_STATUS:END -->';

const REQUIRED_STATUS_FIELDS = Object.freeze([
  'PROJECT_STATUS_SCHEMA',
  'PROJECT_STATUS_DECLARATION',
  'ACTIVE_INITIATIVE',
  'OBJECTIVE',
  'CURRENT_PHASE',
  'OWNER_DECISIONS',
  'LAST_COMPLETED_CHECKPOINT',
  'CURRENT_BLOCKER',
  'NEXT_LEGAL_ACTION',
  'ALLOWED_SCOPE',
  'PROHIBITED',
  'REQUIRED_RULES',
  'REQUIRED_VALIDATION',
]);

const REQUIRED_EXECUTION_FIELDS = Object.freeze([
  'EXECUTION_MODE',
  'EXECUTION_STATE',
  'EXECUTION_PROTOCOL',
  'EXECUTION_PLANNER',
  'EXECUTION_ACTOR',
  'EXECUTION_AUDITOR',
  'EXECUTION_RUN_ID',
  'EXECUTION_EVIDENCE_ROOT',
  'LAST_EXECUTION_CHECKPOINT',
  'NEXT_EXECUTION_STOP',
]);

const EXECUTION_MODES = Object.freeze(['CODEX_DIRECT', 'WORKBUDDY_COORDINATED']);

const LEGACY_ACTIVE_STATUS_PATTERNS = Object.freeze([
  /(^|\/)current-handoff\.md$/i,
  /(^|\/)authority-model-recovery\.md$/i,
  /(^|\/)handoff-(?:resume|p1|p2|fix|final)[^/]*\.md$/i,
  /(^|\/)current-status\.md$/i,
]);

function run(command, args, cwd, timeout = 15_000) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout,
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message,
  };
}

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function parseNulRecords(content) {
  return content.split('\0').filter((value) => value.length > 0);
}

export function parseProjectStatus(content) {
  const start = content.indexOf(PROJECT_STATUS_START);
  const end = content.indexOf(PROJECT_STATUS_END);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('PROJECT_STATUS_MARKERS_INVALID');
  }
  if (content.indexOf(PROJECT_STATUS_START, start + PROJECT_STATUS_START.length) >= 0) {
    throw new Error('PROJECT_STATUS_START_NOT_UNIQUE');
  }
  if (content.indexOf(PROJECT_STATUS_END, end + PROJECT_STATUS_END.length) >= 0) {
    throw new Error('PROJECT_STATUS_END_NOT_UNIQUE');
  }

  const block = content.slice(start + PROJECT_STATUS_START.length, end);
  const fields = {};
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) {
      throw new Error(`PROJECT_STATUS_LINE_INVALID:${line}`);
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (Object.hasOwn(fields, key)) {
      throw new Error(`PROJECT_STATUS_FIELD_DUPLICATE:${key}`);
    }
    fields[key] = value;
  }
  return fields;
}

export function validateProjectStatus(fields) {
  const issues = [];
  for (const field of REQUIRED_STATUS_FIELDS) {
    if (!fields[field]) issues.push(`PROJECT_STATUS_FIELD_MISSING:${field}`);
  }
  if (fields.PROJECT_STATUS_SCHEMA && fields.PROJECT_STATUS_SCHEMA !== '2') {
    issues.push(`PROJECT_STATUS_SCHEMA_UNSUPPORTED:${fields.PROJECT_STATUS_SCHEMA}`);
  }
  for (const field of REQUIRED_EXECUTION_FIELDS) {
    if (!fields[field]) issues.push(`EXECUTION_FIELD_MISSING:${field}`);
  }
  if (
    fields.EXECUTION_MODE &&
    !EXECUTION_MODES.includes(fields.EXECUTION_MODE)
  ) {
    issues.push(`EXECUTION_MODE_INVALID:${fields.EXECUTION_MODE}`);
  }
  if (
    fields.EXECUTION_PROTOCOL &&
    fields.EXECUTION_PROTOCOL !== EXECUTION_PROTOCOL_PATH
  ) {
    issues.push(`EXECUTION_PROTOCOL_PATH_INVALID:${fields.EXECUTION_PROTOCOL}`);
  }
  if (
    fields.PROJECT_STATUS_DECLARATION &&
    fields.PROJECT_STATUS_DECLARATION !== 'ACTIVE'
  ) {
    issues.push(
      `PROJECT_STATUS_DECLARATION_INVALID:${fields.PROJECT_STATUS_DECLARATION}`,
    );
  }
  const forbiddenSelfReferentialFields = [
    'REMOTE_HEAD',
    'LOCAL_HEAD',
    'CURRENT_HEAD',
    'PUSH_STATUS',
    'COMMIT_STATUS',
  ];
  for (const field of forbiddenSelfReferentialFields) {
    if (Object.hasOwn(fields, field)) {
      issues.push(`PROJECT_STATUS_SELF_REFERENTIAL_FIELD_FORBIDDEN:${field}`);
    }
  }
  return issues;
}

export function findLegacyActiveStatusPaths(trackedPaths) {
  return trackedPaths
    .map((value) => value.replaceAll('\\', '/'))
    .filter((value) => !value.startsWith('docs/archive/'))
    .filter((value) => LEGACY_ACTIVE_STATUS_PATTERNS.some((pattern) => pattern.test(value)))
    .sort();
}

function readRequiredFile(repositoryRoot, relativePath, issues) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  if (!existsSync(absolutePath)) {
    issues.push(`REQUIRED_FILE_MISSING:${relativePath}`);
    return '';
  }
  return readFileSync(absolutePath, 'utf8');
}

export function collectBootstrap(repositoryRoot, options = {}) {
  const issues = [];
  const warnings = [];
  const git = (...args) => run('git', args, repositoryRoot);

  const localHeadResult = git('rev-parse', 'HEAD');
  const branchResult = git('branch', '--show-current');
  const worktreeResult = git('status', '--porcelain=v1', '-z');
  const trackedResult = git('ls-files', '-z');

  if (!localHeadResult.ok) issues.push('LOCAL_HEAD_UNAVAILABLE');
  if (!branchResult.ok) issues.push('LOCAL_BRANCH_UNAVAILABLE');
  if (!worktreeResult.ok) issues.push('WORKTREE_STATUS_UNAVAILABLE');
  if (!trackedResult.ok) issues.push('TRACKED_FILE_LIST_UNAVAILABLE');

  const localHead = localHeadResult.stdout.trim();
  const branch = branchResult.stdout.trim() || 'DETACHED';
  const worktreeLines = worktreeResult.stdout ? parseNulRecords(worktreeResult.stdout) : [];
  const trackedPaths = trackedResult.stdout ? parseNulRecords(trackedResult.stdout) : [];

  let remoteHead = 'NOT_CHECKED';
  if (!options.offline) {
    const remoteResult = git('ls-remote', 'origin', 'refs/heads/main');
    if (!remoteResult.ok || !remoteResult.stdout.trim()) {
      issues.push(
        `REMOTE_MAIN_UNAVAILABLE:${remoteResult.stderr.trim() || remoteResult.error || 'unknown'}`,
      );
    } else {
      remoteHead = remoteResult.stdout.trim().split(/\s+/)[0] ?? '';
      if (localHead && remoteHead && localHead !== remoteHead) {
        issues.push(`LOCAL_REMOTE_HEAD_MISMATCH:${localHead}:${remoteHead}`);
      }
    }
  } else {
    warnings.push('REMOTE_MAIN_NOT_CHECKED_OFFLINE_MODE');
  }

  const statusContent = readRequiredFile(repositoryRoot, PROJECT_STATUS_PATH, issues);
  const registryContent = readRequiredFile(repositoryRoot, AUTHORITY_REGISTRY_PATH, issues);
  const specificationContent = readRequiredFile(
    repositoryRoot,
    PRODUCT_SPECIFICATION_PATH,
    issues,
  );
  const executionProtocolContent = readRequiredFile(
    repositoryRoot,
    EXECUTION_PROTOCOL_PATH,
    issues,
  );
  const activeDevelopmentRulesContent = readRequiredFile(
    repositoryRoot,
    ACTIVE_DEVELOPMENT_RULES_PATH,
    issues,
  );
  if (activeDevelopmentRulesContent && activeDevelopmentRulesContent.trim().length === 0) {
    issues.push(`ACTIVE_DEVELOPMENT_RULES_EMPTY:${ACTIVE_DEVELOPMENT_RULES_PATH}`);
  }

  let status = {};
  if (statusContent) {
    try {
      status = parseProjectStatus(statusContent);
      issues.push(...validateProjectStatus(status));
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }

  const requiredRules = (status.REQUIRED_RULES ?? '')
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean);
  for (const requiredRule of requiredRules) {
    if (!existsSync(path.join(repositoryRoot, requiredRule))) {
      issues.push(`REQUIRED_RULE_MISSING:${requiredRule}`);
    }
  }
  if (requiredRules.length > 0 && !requiredRules.includes(ACTIVE_DEVELOPMENT_RULES_PATH)) {
    issues.push(`ACTIVE_DEVELOPMENT_RULES_NOT_IN_REQUIRED_RULES:${ACTIVE_DEVELOPMENT_RULES_PATH}`);
  }
  if (requiredRules.includes(HISTORICAL_LEDGER_PATH)) {
    issues.push(`HISTORICAL_LEDGER_FULL_READ_REQUIREMENT_FORBIDDEN:${HISTORICAL_LEDGER_PATH}`);
  }

  const legacyStatusPaths = findLegacyActiveStatusPaths(trackedPaths);
  for (const legacyPath of legacyStatusPaths) {
    issues.push(`PARALLEL_ACTIVE_STATUS_PATH:${legacyPath}`);
  }
  if (existsSync(path.join(repositoryRoot, '.kiro'))) {
    issues.push('ROOT_KIRO_DIRECTORY_PRESENT');
  }

  if (worktreeLines.length > 0) {
    warnings.push('WORKTREE_CHANGES_REQUIRE_REVIEW');
  }

  const receipt = {
    receiptVersion: 1,
    repositoryRoot,
    localHead,
    remoteHead,
    branch,
    worktree: worktreeLines,
    projectStatusSha256: statusContent ? sha256(statusContent) : '',
    authorityRegistrySha256: registryContent ? sha256(registryContent) : '',
    productSpecificationSha256: specificationContent ? sha256(specificationContent) : '',
    executionProtocolSha256: executionProtocolContent ? sha256(executionProtocolContent) : '',
    activeDevelopmentRulesSha256: activeDevelopmentRulesContent ? sha256(activeDevelopmentRulesContent) : '',
    activeDevelopmentRulesInRequiredRules: requiredRules.includes(ACTIVE_DEVELOPMENT_RULES_PATH),
    executionMode: status.EXECUTION_MODE ?? '',
    executionState: status.EXECUTION_STATE ?? '',
    executionProtocol: status.EXECUTION_PROTOCOL ?? '',
    executionPlanner: status.EXECUTION_PLANNER ?? '',
    executionActor: status.EXECUTION_ACTOR ?? '',
    executionAuditor: status.EXECUTION_AUDITOR ?? '',
    executionRunId: status.EXECUTION_RUN_ID ?? '',
    executionEvidenceRoot: status.EXECUTION_EVIDENCE_ROOT ?? '',
    lastExecutionCheckpoint: status.LAST_EXECUTION_CHECKPOINT ?? '',
    nextExecutionStop: status.NEXT_EXECUTION_STOP ?? '',
    activeInitiative: status.ACTIVE_INITIATIVE ?? '',
    currentPhase: status.CURRENT_PHASE ?? '',
    lastCompletedCheckpoint: status.LAST_COMPLETED_CHECKPOINT ?? '',
    currentBlocker: status.CURRENT_BLOCKER ?? '',
    nextLegalAction: status.NEXT_LEGAL_ACTION ?? '',
    requiredRules,
    requiredValidation: (status.REQUIRED_VALIDATION ?? '')
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean),
    writeReadiness: worktreeLines.length === 0 ? 'CLEAN' : 'REVIEW_REQUIRED',
    issues,
    warnings,
    bootstrapStatus: issues.length === 0 ? (options.offline ? 'READY_OFFLINE' : 'READY') : 'BLOCKED',
  };
  return receipt;
}

function printText(receipt) {
  const line = (key, value) => console.log(`${key}=${value}`);
  line('BOOTSTRAP_STATUS', receipt.bootstrapStatus);
  line('LOCAL_HEAD', receipt.localHead);
  line('REMOTE_HEAD', receipt.remoteHead);
  line('BRANCH', receipt.branch);
  line('WORKTREE_STATUS', receipt.worktree.length === 0 ? 'CLEAN' : 'DIRTY');
  line('WRITE_READINESS', receipt.writeReadiness);
  line('ACTIVE_INITIATIVE', receipt.activeInitiative);
  line('CURRENT_PHASE', receipt.currentPhase);
  line('LAST_COMPLETED_CHECKPOINT', receipt.lastCompletedCheckpoint);
  line('CURRENT_BLOCKER', receipt.currentBlocker);
  line('NEXT_LEGAL_ACTION', receipt.nextLegalAction);
  line('PROJECT_STATUS_SHA256', receipt.projectStatusSha256);
  line('AUTHORITY_REGISTRY_SHA256', receipt.authorityRegistrySha256);
  line('PRODUCT_SPECIFICATION_SHA256', receipt.productSpecificationSha256);
  line('EXECUTION_PROTOCOL_SHA256', receipt.executionProtocolSha256);
  line('ACTIVE_DEVELOPMENT_RULES_SHA256', receipt.activeDevelopmentRulesSha256);
  line('EXECUTION_MODE', receipt.executionMode);
  line('EXECUTION_STATE', receipt.executionState);
  line('EXECUTION_PROTOCOL', receipt.executionProtocol);
  line('EXECUTION_PLANNER', receipt.executionPlanner);
  line('EXECUTION_ACTOR', receipt.executionActor);
  line('EXECUTION_AUDITOR', receipt.executionAuditor);
  line('EXECUTION_RUN_ID', receipt.executionRunId);
  line('EXECUTION_EVIDENCE_ROOT', receipt.executionEvidenceRoot);
  line('LAST_EXECUTION_CHECKPOINT', receipt.lastExecutionCheckpoint);
  line('NEXT_EXECUTION_STOP', receipt.nextExecutionStop);
  line('REQUIRED_RULES', receipt.requiredRules.join(';'));
  line('REQUIRED_VALIDATION', receipt.requiredValidation.join(';'));
  line('WARNINGS', receipt.warnings.join(';') || 'NONE');
  line('ISSUES', receipt.issues.join(';') || 'NONE');
}

function main() {
  const args = new Set(process.argv.slice(2));
  const repositoryRootResult = run('git', ['rev-parse', '--show-toplevel'], process.cwd());
  if (!repositoryRootResult.ok || !repositoryRootResult.stdout) {
    console.error('BOOTSTRAP_STATUS=BLOCKED');
    console.error('ISSUES=REPOSITORY_ROOT_UNAVAILABLE');
    process.exit(2);
  }
  const receipt = collectBootstrap(repositoryRootResult.stdout.trim(), {
    offline: args.has('--offline'),
  });
  if (args.has('--json')) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    printText(receipt);
  }
  process.exit(receipt.bootstrapStatus === 'BLOCKED' ? 2 : 0);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
