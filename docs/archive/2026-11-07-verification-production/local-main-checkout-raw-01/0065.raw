import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  EXECUTION_PROTOCOL_PATH,
  collectBootstrap,
  findLegacyActiveStatusPaths,
  parseNulRecords,
  parseProjectStatus,
  sha256,
  run,
  validateProjectStatus,
} from '../../../../scripts/project-session-bootstrap.mjs';

const status = `# Status
<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=TEST
OBJECTIVE=Prove deterministic recovery.
CURRENT_PHASE=TESTING
OWNER_DECISIONS=D1:APPROVED
LAST_COMPLETED_CHECKPOINT=Inventory complete.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Run validation.
ALLOWED_SCOPE=docs/**
PROHIBITED=Create parallel status files
REQUIRED_RULES=AGENTS.md;docs/project-status.md
REQUIRED_VALIDATION=bootstrap test
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=TESTING
EXECUTION_PROTOCOL=${EXECUTION_PROTOCOL_PATH}
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=TEST-RUN-001
EXECUTION_EVIDENCE_ROOT=D:\\evidence\\TEST-RUN-001
LAST_EXECUTION_CHECKPOINT=Gate passed.
NEXT_EXECUTION_STOP=Stop after validation.
<!-- SPECFORGE_PROJECT_STATUS:END -->`;

const statusWithout = (field: string) =>
  status
    .split('\n')
    .filter((line) => !line.startsWith(`${field}=`))
    .join('\n');

describe('project session bootstrap contract', () => {
  it('parses one complete current-status block (schema 2 with execution fields)', () => {
    const parsed = parseProjectStatus(status);
    expect(parsed.ACTIVE_INITIATIVE).toBe('TEST');
    expect(parsed.NEXT_LEGAL_ACTION).toBe('Run validation.');
    expect(parsed.EXECUTION_MODE).toBe('CODEX_DIRECT');
    expect(validateProjectStatus(parsed)).toEqual([]);
  });

  it('fails closed when a required field is absent', () => {
    const parsed = parseProjectStatus(statusWithout('CURRENT_BLOCKER'));
    expect(validateProjectStatus(parsed)).toContain(
      'PROJECT_STATUS_FIELD_MISSING:CURRENT_BLOCKER',
    );
  });

  it('rejects schema values other than 2', () => {
    const parsed = parseProjectStatus(status.replace('PROJECT_STATUS_SCHEMA=2', 'PROJECT_STATUS_SCHEMA=1'));
    expect(validateProjectStatus(parsed)).toContain(
      'PROJECT_STATUS_SCHEMA_UNSUPPORTED:1',
    );
  });

  it('fails closed when an execution field is absent', () => {
    const parsed = parseProjectStatus(statusWithout('EXECUTION_EVIDENCE_ROOT'));
    expect(validateProjectStatus(parsed)).toContain(
      'EXECUTION_FIELD_MISSING:EXECUTION_EVIDENCE_ROOT',
    );
  });

  it('rejects execution modes outside the two legal modes', () => {
    const parsed = parseProjectStatus(
      status.replace('EXECUTION_MODE=CODEX_DIRECT', 'EXECUTION_MODE=SIDE_CHANNEL'),
    );
    expect(validateProjectStatus(parsed)).toContain('EXECUTION_MODE_INVALID:SIDE_CHANNEL');
  });

  it('accepts WORKBUDDY_COORDINATED as a legal execution mode', () => {
    const parsed = parseProjectStatus(
      status
        .replace('EXECUTION_MODE=CODEX_DIRECT', 'EXECUTION_MODE=WORKBUDDY_COORDINATED')
        .replace('EXECUTION_ACTOR=CODEX', 'EXECUTION_ACTOR=WORKBUDDY'),
    );
    expect(validateProjectStatus(parsed)).toEqual([]);
  });

  it('rejects execution protocol paths other than the canonical rule file', () => {
    const parsed = parseProjectStatus(
      status.replace(
        `EXECUTION_PROTOCOL=${EXECUTION_PROTOCOL_PATH}`,
        'EXECUTION_PROTOCOL=docs/somewhere-else.md',
      ),
    );
    expect(validateProjectStatus(parsed)).toContain(
      'EXECUTION_PROTOCOL_PATH_INVALID:docs/somewhere-else.md',
    );
  });

  it('rejects self-referential Git state in the committed status', () => {
    const parsed = parseProjectStatus(
      status.replace('CURRENT_BLOCKER=NONE', 'CURRENT_BLOCKER=NONE\nREMOTE_HEAD=abc'),
    );
    expect(validateProjectStatus(parsed)).toContain(
      'PROJECT_STATUS_SELF_REFERENTIAL_FIELD_FORBIDDEN:REMOTE_HEAD',
    );
  });

  it('detects parallel active handoff and recovery paths outside archive', () => {
    expect(
      findLegacyActiveStatusPaths([
        'docs/project-status.md',
        'docs/implementation/current-handoff.md',
        'docs/implementation/authority-model-recovery.md',
        'docs/archive/implementation/current-handoff.md',
      ]),
    ).toEqual([
      'docs/implementation/authority-model-recovery.md',
      'docs/implementation/current-handoff.md',
    ]);
  });

  it('produces stable receipt hashes', () => {
    expect(sha256('same')).toBe(sha256('same'));
    expect(sha256('same')).not.toBe(sha256('different'));
  });

  it('preserves porcelain status prefixes while parsing NUL records', () => {
    expect(parseNulRecords(' M tracked.md\0?? untracked.md\0')).toEqual([
      ' M tracked.md',
      '?? untracked.md',
    ]);
  });

  it('captures a complete NUL path inventory larger than 1 MiB', () => {
    const result = run(process.execPath, ['-e',
      "process.stdout.write(('docs/archive/'+'x'.repeat(128)+'\\0').repeat(10000)+'final-path\\0')",
    ], process.cwd());
    expect(result.ok).toBe(true);
    expect(result.status).toBe(0);
    expect(Buffer.byteLength(result.stdout)).toBeGreaterThan(1024 * 1024);
    const paths = parseNulRecords(result.stdout);
    expect(paths).toHaveLength(10001);
    expect(paths.at(-1)).toBe('final-path');
  });

  it('rejects truncated output exceeding the bounded buffer', () => {
    const result = run(process.execPath, ['-e',
      "process.stdout.write(Buffer.alloc(33*1024*1024,120))",
    ], process.cwd());
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ENOBUFS');
  });

  it('keeps a nonzero command exit failed despite complete large output', () => {
    const result = run(process.execPath, ['-e',
      "process.stdout.write('x'.repeat(2*1024*1024),()=>process.exit(7))",
    ], process.cwd());
    expect(result.status).toBe(7);
    expect(result.ok).toBe(false);
  });

  it('keeps bootstrap blocked when Git cannot provide the inventory', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'sf-bootstrap-git-failure-'));
    try {
      const receipt = collectBootstrap(directory, { offline: true });
      expect(receipt.bootstrapStatus).toBe('BLOCKED');
      expect(receipt.issues).toContain('TRACKED_FILE_LIST_UNAVAILABLE');
    } finally {
      rmdirSync(directory);
    }
  });
});
