import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const LIB_DIR = path.resolve(__dirname, '../../.opencode/tools/lib');

const DELETED_FILES = [
  'state_machine.ts',
  'sf_specforge_plugin_entry.ts',
  'sf_state_transition_core.ts',
  'sf_state_read_core.ts',
  'sf_conversation_recorder_core.ts'
];

describe('V5 Code Cleanup Verification', () => {
  DELETED_FILES.forEach(filename => {
    it(`${filename} should be deleted`, () => {
      expect(fs.existsSync(path.join(LIB_DIR, filename))).toBe(false);
    });
  });
});
