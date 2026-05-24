import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const TOOLS_DIR = path.resolve(__dirname, '../../.opencode/tools');

const TOOL_FILES = [
  'sf_state_transition.ts', 'sf_state_read.ts', 'sf_artifact_write.ts',
  'sf_context_build.ts', 'sf_continuity.ts', 'sf_cost_report.ts',
  'sf_knowledge_base.ts', 'sf_knowledge_graph.ts', 'sf_knowledge_query.ts',
  'sf_design_gate.ts', 'sf_requirements_gate.ts', 'sf_tasks_gate.ts',
  'sf_verification_gate.ts', 'sf_doc_lint.ts', 'sf_trace_matrix.ts',
  'sf_batch_verify.ts', 'sf_doctor.ts', 'sf_safe_bash.ts'
];

describe('Tool HTTP Shell Validation', () => {
  TOOL_FILES.forEach(filename => {
    describe(filename, () => {
      const filePath = path.join(TOOLS_DIR, filename);
      let content: string;

      it('should exist', () => {
        expect(fs.existsSync(filePath)).toBe(true);
      });

      it('should import from thin-client', () => {
        content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('thin-client');
      });

      it('should be under 5KB', () => {
        const stats = fs.statSync(filePath);
        expect(stats.size).toBeLessThan(5120);
      });

      it('should have a description', () => {
        content = content || fs.readFileSync(filePath, 'utf-8');
        expect(content).toMatch(/description/);
      });
    });
  });
});
