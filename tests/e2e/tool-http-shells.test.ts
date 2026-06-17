import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');
const TOOLS_DIR = path.join(REPO_ROOT, 'setup', 'userlevel-opencode', 'tools');

const REQUIRED_V11_TOOLS = [
  'sf_gate_run.ts',
  'sf_user_decision_record.ts',
  'sf_merge_run.ts',
  'sf_code_permission.ts',
  'sf_changed_files_audit.ts',
  'sf_close_gate.ts',
  'sf_state_read.ts',
  'sf_artifact_write.ts',
  'sf_safe_bash.ts',
];

function listToolFiles(): string[] {
  return fs.readdirSync(TOOLS_DIR)
    .filter((f) => f.startsWith('sf_') && f.endsWith('.ts'))
    .sort();
}

describe('Tool HTTP Shell Validation', () => {
  it('canonical v1.1 governance tool shells exist', () => {
    for (const filename of REQUIRED_V11_TOOLS) {
      expect(fs.existsSync(path.join(TOOLS_DIR, filename)), filename).toBe(true);
    }
  });

  listToolFiles().forEach((filename) => {
    describe(filename, () => {
      const filePath = path.join(TOOLS_DIR, filename);

      it('imports from thin-client', () => {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('thin-client');
      });

      it('is a lightweight OpenCode shell', () => {
        const stats = fs.statSync(filePath);
        expect(stats.size).toBeGreaterThan(128);
        expect(stats.size).toBeLessThan(16 * 1024);
      });

      it('has a tool description', () => {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toMatch(/description\s*:/);
      });

      it('returns string output to OpenCode', () => {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('JSON.stringify');
      });
    });
  });
});
