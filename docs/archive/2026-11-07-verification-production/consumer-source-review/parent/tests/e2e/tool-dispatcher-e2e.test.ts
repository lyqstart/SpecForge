import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');
const TOOLS_DIR = path.join(REPO_ROOT, 'setup', 'userlevel-opencode', 'tools');
const HANDLERS_DIR = path.join(REPO_ROOT, 'packages', 'daemon-core', 'src', 'tools', 'handlers');

function listToolFiles(): string[] {
  return fs.readdirSync(TOOLS_DIR)
    .filter((f) => f.startsWith('sf_') && f.endsWith('.ts'))
    .sort();
}

describe('Tool Dispatcher E2E', () => {
  it('uses setup/userlevel-opencode/tools as the canonical repository source', () => {
    expect(fs.existsSync(TOOLS_DIR)).toBe(true);
    expect(fs.existsSync(path.resolve(REPO_ROOT, '.opencode', 'tools'))).toBe(false);
  });

  it('all userlevel sf tool files are thin-client shells', () => {
    const files = listToolFiles();
    expect(files.length).toBeGreaterThanOrEqual(18);

    for (const file of files) {
      const content = fs.readFileSync(path.join(TOOLS_DIR, file), 'utf-8');
      expect(content, file).toContain('thin-client');
      expect(content, file).toContain('async execute');
      expect(content, file).not.toContain('async handler');
    }
  });

  it('all userlevel sf tool files pass OpenCode context to daemon or project API', () => {
    const files = listToolFiles();

    for (const file of files) {
      const content = fs.readFileSync(path.join(TOOLS_DIR, file), 'utf-8');
      const passesContextToDaemon = /daemon\.invokeTool\([\s\S]*?,\s*args,\s*context\s*\)/.test(content);
      const passesProjectPath = /context\.directory|context\.worktree|projectPath:\s*context\.directory/.test(content);

      expect(
        passesContextToDaemon || passesProjectPath,
        `${file} should pass OpenCode context to daemon.invokeTool or derive projectPath from context`,
      ).toBe(true);
    }
  });

  it('all userlevel sf tool files stringify non-string daemon responses', () => {
    const files = listToolFiles();

    for (const file of files) {
      const content = fs.readFileSync(path.join(TOOLS_DIR, file), 'utf-8');
      expect(content, file).toContain('JSON.stringify');
    }
  });

  it('daemon-core handler count is no longer fixed to the legacy 18 stubs', () => {
    const handlers = fs.readdirSync(HANDLERS_DIR).filter((f) => f.endsWith('.ts'));
    const tools = listToolFiles();

    expect(handlers.length).toBeGreaterThanOrEqual(18);
    expect(handlers.length).toBeGreaterThanOrEqual(tools.length);
  });
});
