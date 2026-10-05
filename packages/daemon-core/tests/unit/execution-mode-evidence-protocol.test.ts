import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXECUTION_PROTOCOL_PATH,
  parseProjectStatus,
  validateProjectStatus,
} from '../../../../scripts/project-session-bootstrap.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const protocolPath = resolve(repoRoot, EXECUTION_PROTOCOL_PATH);

describe('execution-mode and evidence protocol contract', () => {
  it('stores the protocol rule file at the canonical registered path', () => {
    expect(existsSync(protocolPath)).toBe(true);
  });

  it('declares exactly two execution modes with fixed role definitions', async () => {
    const protocol = await readFile(protocolPath, 'utf8');
    expect(protocol).toContain('CODEX_DIRECT');
    expect(protocol).toContain('WORKBUDDY_COORDINATED');
    expect(protocol).toContain('两种且仅两种');
    expect(protocol).toContain('不能替代 Codex 独立审核');
    expect(protocol).toContain('Planner / Auditor');
    expect(protocol).toContain('Executor / Evidence Producer');
  });

  it('locks the session recovery chain and mode-switching discipline', async () => {
    const protocol = await readFile(protocolPath, 'utf8');
    for (const token of [
      'AGENTS.md',
      'project-session-bootstrap',
      'REQUIRED_RULES',
      'EXECUTION_MODE',
      'EXECUTION_RUN_ID / EVIDENCE_ROOT',
      'LAST_EXECUTION_CHECKPOINT',
      'NEXT_LEGAL_ACTION',
      'STOP_CONDITION',
      '最新明确用户指令可以切换模式',
      '不得在阶段中途静默切换',
    ]) expect(protocol, token).toContain(token);
  });

  it('locks the four write classes and six evidence grades plus first-hand exclusions', async () => {
    const protocol = await readFile(protocolPath, 'utf8');
    for (const token of [
      'TRUTH_SOURCE_WRITES',
      'REPOSITORY_TRACKED_WRITES',
      'RUNTIME_OBSERVER_WRITES',
      'EXTERNAL_EVIDENCE_WRITES',
      'CONFIRMED',
      'CORROBORATED',
      'HYPOTHESIS',
      'INSUFFICIENT_EVIDENCE',
      'AUTHORITY_CONFLICT',
      'RUNTIME_DEFECT',
      'exit=True',
      '$LASTEXITCODE',
    ]) expect(protocol, token).toContain(token);
  });

  it('keeps the schema-2 project status valid against bootstrap validation', async () => {
    const statusContent = await readFile(resolve(repoRoot, 'docs/project-status.md'), 'utf8');
    const parsed = parseProjectStatus(statusContent);
    const issues = validateProjectStatus(parsed);
    expect(issues, issues.join(';')).toEqual([]);
    expect(['CODEX_DIRECT', 'WORKBUDDY_COORDINATED']).toContain(parsed.EXECUTION_MODE);
    expect(parsed.EXECUTION_STATE).toBeTruthy();
    expect(parsed.EXECUTION_PLANNER).toBe('CODEX');
    expect(parsed.EXECUTION_ACTOR).toBe(
      parsed.EXECUTION_MODE === 'CODEX_DIRECT' ? 'CODEX' : 'WORKBUDDY',
    );
    expect(parsed.EXECUTION_AUDITOR).toBe('CODEX');
    expect(parsed.EXECUTION_PROTOCOL).toBe(EXECUTION_PROTOCOL_PATH);
    expect(parsed.EXECUTION_RUN_ID).toBeTruthy();
    expect(parsed.EXECUTION_EVIDENCE_ROOT).toBeTruthy();
  });
});
