import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const activePath = resolve(repoRoot, 'docs/design/SpecForge架构一致性治理最终实施方案.md');
const archivePath = resolve(
  repoRoot,
  'docs/archive/design/SpecForge架构一致性治理最终实施方案.full-history-20261006.md',
);
const projectStatusPath = resolve(repoRoot, 'docs/project-status.md');
const read = (path: string) => readFile(path, 'utf8');

describe('current architecture-governance contract', () => {
  it('keeps the active contract subordinate and the complete predecessor byte-bound to history', async () => {
    const [active, archive] = await Promise.all([read(activePath), read(archivePath)]);

    expect(active).toContain('DOCUMENT_ROLE=SUBORDINATE_TECHNICAL_GOVERNANCE_CONTRACT');
    expect(active).toContain('CONTRACT_VERSION=2.0');
    expect(active).toContain('docs/archive/design/SpecForge架构一致性治理最终实施方案.full-history-20261006.md');
    expect(createHash('sha256').update(archive).digest('hex')).toBe(
      '25861569ced52f8017a68c7c9765c32c376b25afe70568e924db3eed5380b7d8',
    );
  });

  it('defines one local recovery chain and rejects superseded delivery mechanisms', async () => {
    const active = await read(activePath);

    for (const token of [
      'AGENTS.md',
      'node scripts/project-session-bootstrap.mjs',
      '完整读取 Bootstrap 输出的 REQUIRED_RULES',
      'docs/project-status.md 的 NEXT_LEGAL_ACTION',
      '所有 current-handoff 类旧表达均已失效',
    ]) {
      expect(active, token).toContain(token);
    }

    for (const retiredToken of [
      'AUTHORITY_BOOTSTRAP_REMOTE_URL=',
      'DELIVERY_FORMAT=ONE_COMPLETE_ZIP_PLUS_ONE_COPY_PASTE_CMD',
      '<!-- SPECFORGE_NEW_SESSION_PROMPT:START -->',
      'GOV-STAGE-AGENT-SESSION-001',
    ]) {
      expect(active, retiredToken).not.toContain(retiredToken);
    }
  });

  it('delegates execution evidence and active experience rules to their registered contracts', async () => {
    const active = await read(activePath);

    for (const token of [
      'GOV-EXECUTION-MODE-001',
      'CODEX_DIRECT',
      'WORKBUDDY_COORDINATED',
      'docs/rule/specforge-execution-mode-and-evidence-protocol.md',
      'AR-DEC-06',
      'docs/rule/specforge-active-development-rules.md',
      'docs/rule/specforge-development-error-ledger-and-experience.md',
    ]) {
      expect(active, token).toContain(token);
    }
  });

  it('keeps the closed-loop governance and runtime-owned stable contracts explicit', async () => {
    const active = await read(activePath);

    for (const marker of [
      'GOV-AUTH-001',
      'GOV-CONT-001',
      'GOV-SELF-001',
      'GOV-PRE-001',
      'GOV-CLOSELOOP-001',
      'GOV-SCOPE-001',
      'GOV-POST-001',
      'GOV-EVID-001',
      'GOV-STAGE-VALIDATOR-001',
    ]) {
      expect(active.split(`**${marker}：**`).length - 1, marker).toBe(1);
    }

    for (const marker of [
      'GATE-ATTEMPT-001',
      'GATE-LATEST-001',
      'GATE-MIGRATION-001',
      'GATE-RETRY-STATE-001',
    ]) {
      expect(active.split(marker).length - 1, marker).toBe(1);
    }
  });

  it('keeps exactly one schema-2 resumable project-status block', async () => {
    const status = await read(projectStatusPath);

    expect(status.split('<!-- SPECFORGE_PROJECT_STATUS:START -->').length - 1).toBe(1);
    expect(status.split('<!-- SPECFORGE_PROJECT_STATUS:END -->').length - 1).toBe(1);
    for (const field of [
      'PROJECT_STATUS_SCHEMA=2',
      'PROJECT_STATUS_DECLARATION=ACTIVE',
      'EXECUTION_MODE=',
      'EXECUTION_STATE=',
      'EXECUTION_RUN_ID=',
      'LAST_EXECUTION_CHECKPOINT=',
      'NEXT_LEGAL_ACTION=',
      'REQUIRED_RULES=',
      'REQUIRED_VALIDATION=',
    ]) {
      expect(status, field).toContain(field);
    }
    expect(status).not.toMatch(/^(?:REMOTE_HEAD|LOCAL_HEAD|CURRENT_HEAD)=/m);
  });
});
