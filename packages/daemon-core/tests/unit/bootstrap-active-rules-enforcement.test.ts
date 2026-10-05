import { describe, expect, it } from 'vitest';
import {
  ACTIVE_DEVELOPMENT_RULES_PATH,
  HISTORICAL_LEDGER_PATH,
  collectBootstrap,
} from '../../../../scripts/project-session-bootstrap.mjs';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function initMinimalRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sf-bootstrap-ardec06-'));
  spawnSync('git', ['init', '-b', 'main'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@specforge.local'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  mkdirSync(join(dir, 'docs/rule'), { recursive: true });
  mkdirSync(join(dir, 'docs/product-specification'), { recursive: true });
  writeFileSync(join(dir, ACTIVE_DEVELOPMENT_RULES_PATH), '# active rules\n');
  writeFileSync(
    join(dir, 'docs/rule/specforge-execution-mode-and-evidence-protocol.md'),
    '# protocol\n',
  );
  writeFileSync(
    join(dir, 'docs/product-specification/authority-registry.md'),
    '# registry\n',
  );
  writeFileSync(
    join(dir, 'docs/product-specification/specforge-product-specification.md'),
    '# sps\n',
  );
  writeFileSync(
    join(dir, 'docs/project-status.md'),
    `<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=TEST
OBJECTIVE=Test
CURRENT_PHASE=TESTING
OWNER_DECISIONS=AR-DEC-06:APPROVED
LAST_COMPLETED_CHECKPOINT=x
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=none
ALLOWED_SCOPE=docs/**
PROHIBITED=none
REQUIRED_RULES=${ACTIVE_DEVELOPMENT_RULES_PATH}
REQUIRED_VALIDATION=none
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=TESTING
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=T-1
EXECUTION_EVIDENCE_ROOT=/tmp/T-1
LAST_EXECUTION_CHECKPOINT=x
NEXT_EXECUTION_STOP=x
<!-- SPECFORGE_PROJECT_STATUS:END -->
`,
  );
  return dir;
}

describe('bootstrap active-rules and ledger-separation enforcement', () => {
  it('accepts REQUIRED_RULES containing the active rules file (offline)', () => {
    const dir = initMinimalRepo();
    try {
      const receipt = collectBootstrap(dir, { offline: true });
      expect(receipt.activeDevelopmentRulesInRequiredRules).toBe(true);
      expect(receipt.issues).not.toContain(
        `ACTIVE_DEVELOPMENT_RULES_NOT_IN_REQUIRED_RULES:${ACTIVE_DEVELOPMENT_RULES_PATH}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when REQUIRED_RULES omits the active rules file', () => {
    const dir = initMinimalRepo();
    try {
      const statusPath = join(dir, 'docs/project-status.md');
      const status = readFileSyncSafe(statusPath).replace(
        `REQUIRED_RULES=${ACTIVE_DEVELOPMENT_RULES_PATH}`,
        'REQUIRED_RULES=docs/project-status.md',
      );
      writeFileSync(statusPath, status);
      const receipt = collectBootstrap(dir, { offline: true });
      expect(receipt.activeDevelopmentRulesInRequiredRules).toBe(false);
      expect(receipt.issues).toContain(
        `ACTIVE_DEVELOPMENT_RULES_NOT_IN_REQUIRED_RULES:${ACTIVE_DEVELOPMENT_RULES_PATH}`,
      );
      expect(receipt.bootstrapStatus).toBe('BLOCKED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when the historical ledger is re-listed as a full-read required rule', () => {
    const dir = initMinimalRepo();
    try {
      const statusPath = join(dir, 'docs/project-status.md');
      writeFileSync(join(dir, HISTORICAL_LEDGER_PATH), '# ledger\n');
      const status = readFileSyncSafe(statusPath).replace(
        `REQUIRED_RULES=${ACTIVE_DEVELOPMENT_RULES_PATH}`,
        `REQUIRED_RULES=${ACTIVE_DEVELOPMENT_RULES_PATH};${HISTORICAL_LEDGER_PATH}`,
      );
      writeFileSync(statusPath, status);
      const receipt = collectBootstrap(dir, { offline: true });
      expect(receipt.issues).toContain(
        `HISTORICAL_LEDGER_FULL_READ_REQUIREMENT_FORBIDDEN:${HISTORICAL_LEDGER_PATH}`,
      );
      expect(receipt.bootstrapStatus).toBe('BLOCKED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when the active rules file exists but is empty', () => {
    const dir = initMinimalRepo();
    try {
      writeFileSync(join(dir, ACTIVE_DEVELOPMENT_RULES_PATH), '   \n\n');
      const receipt = collectBootstrap(dir, { offline: true });
      expect(receipt.issues).toContain(
        `ACTIVE_DEVELOPMENT_RULES_EMPTY:${ACTIVE_DEVELOPMENT_RULES_PATH}`,
      );
      expect(receipt.bootstrapStatus).toBe('BLOCKED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports activeDevelopmentRulesSha256 for a non-empty rules file', () => {
    const dir = initMinimalRepo();
    try {
      const receipt = collectBootstrap(dir, { offline: true });
      expect(receipt.activeDevelopmentRulesSha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function readFileSyncSafe(p: string): string {
  return readFileSync(p, 'utf8');
}
