import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');

describe('current-release path projections', () => {
  it('keeps the installed intake skill on the canonical user root', async () => {
    const intake = await readFile(
      resolve(ROOT, 'setup/userlevel-opencode/skills/sf-intake/SKILL.md'),
      'utf8',
    );

    expect(intake).toContain('<OpenCode config>/sf-user/host-profile.json');
    expect(intake).not.toContain('~/.specforge/host-profile.json');
  });

  it('keeps README runtime projections on events.jsonl', async () => {
    const readme = await readFile(resolve(ROOT, 'README.md'), 'utf8');

    expect(readme).toContain('runtimeFiles.events');
    expect(readme).toContain('runtime/events.jsonl');
    expect(readme).not.toContain('runtimeFiles.wal');
    expect(readme).not.toContain('runtime/wal.jsonl');
  });

  it('keeps current root test consumers off the retired user-home path', async () => {
    const currentConsumers = await Promise.all(
      [
        'tests/unit/installer/paths.test.ts',
        'tests/integration/service-management/windows-nssm-full-lifecycle.test.ts',
        'tests/integration/service-management/precheck-blocking.test.ts',
      ].map((path) => readFile(resolve(ROOT, path), 'utf8')),
    );

    for (const consumer of currentConsumers) {
      expect(consumer).not.toContain('~/.specforge');
    }
  });
});
