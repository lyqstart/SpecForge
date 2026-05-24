import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const WORKFLOWS_DIR = path.resolve(__dirname, '../../configs/workflows/builtin');

const WORKFLOW_FILES = [
  'feature_spec.json', 'bugfix_spec.json', 'feature_spec_design_first.json',
  'quick_change.json', 'change_request.json', 'refactor.json',
  'ops_task.json', 'investigation.json'
];

describe('Workflow JSON Definitions', () => {
  WORKFLOW_FILES.forEach(filename => {
    describe(filename, () => {
      let data: any;

      it('should exist', () => {
        expect(fs.existsSync(path.join(WORKFLOWS_DIR, filename))).toBe(true);
      });

      it('should be valid JSON', () => {
        const content = fs.readFileSync(path.join(WORKFLOWS_DIR, filename), 'utf-8');
        expect(() => JSON.parse(content)).not.toThrow();
        data = JSON.parse(content);
      });

      it('should have schema_version 1.0', () => {
        expect(data.schema_version).toBe('1.0');
      });

      it('should have stateMachine with initial state', () => {
        expect(data.stateMachine).toBeDefined();
        expect(data.stateMachine.initial).toBe('intake');
        expect(data.stateMachine.states).toBeDefined();
      });

      it('should have at least 5 states', () => {
        expect(Object.keys(data.stateMachine.states).length).toBeGreaterThanOrEqual(5);
      });

      it('should have a completed state', () => {
        expect(data.stateMachine.states).toHaveProperty('completed');
      });
    });
  });
});
