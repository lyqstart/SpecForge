import { describe, expect, it } from 'vitest';
import {
  findLegacyActiveStatusPaths,
  parseNulRecords,
  parseProjectStatus,
  sha256,
  validateProjectStatus,
} from '../../../../scripts/project-session-bootstrap.mjs';

const status = `# Status
<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=1
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
<!-- SPECFORGE_PROJECT_STATUS:END -->`;

describe('project session bootstrap contract', () => {
  it('parses one complete current-status block', () => {
    const parsed = parseProjectStatus(status);
    expect(parsed.ACTIVE_INITIATIVE).toBe('TEST');
    expect(parsed.NEXT_LEGAL_ACTION).toBe('Run validation.');
    expect(validateProjectStatus(parsed)).toEqual([]);
  });

  it('fails closed when a required field is absent', () => {
    const parsed = parseProjectStatus(status.replace('CURRENT_BLOCKER=NONE\n', ''));
    expect(validateProjectStatus(parsed)).toContain(
      'PROJECT_STATUS_FIELD_MISSING:CURRENT_BLOCKER',
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
});
