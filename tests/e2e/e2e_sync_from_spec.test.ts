import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const userlevelRoot = path.join(repoRoot, 'setup', 'userlevel-opencode');

describe('Userlevel OpenCode source sync contract', () => {
  it('keeps setup/userlevel-opencode as the repository source of installable OpenCode assets', () => {
    expect(fs.existsSync(path.join(userlevelRoot, 'plugins'))).toBe(true);
    expect(fs.existsSync(path.join(userlevelRoot, 'tools'))).toBe(true);
    expect(fs.existsSync(path.join(userlevelRoot, 'skills'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, '.opencode'))).toBe(false);
  });

  it('keeps knowledge-related userlevel tool shells in setup/userlevel-opencode/tools', () => {
    const toolsDir = path.join(userlevelRoot, 'tools');
    const tools = ['sf_knowledge_base.ts', 'sf_knowledge_graph.ts', 'sf_knowledge_query.ts'];

    for (const toolFile of tools) {
      const filePath = path.join(toolsDir, toolFile);
      expect(fs.existsSync(filePath), `${toolFile} should exist`).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('./lib/thin-client');
      expect(content).toMatch(/daemon\.invokeTool\(/);
    }
  });
});
