import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const WORKFLOWS_DIR = path.resolve(__dirname, '../../configs/workflows/builtin');
const EXPECTED_FILES = [
  'feature_spec.json',
  'feature_spec_design_first.json',
  'bugfix_spec.json',
  'quick_change.json',
  'change_request.json',
  'refactor.json',
  'ops_task.json',
  'investigation.json',
];

const VALID_AGENTS = new Set([
  '', 'sf-orchestrator', 'sf-requirements', 'sf-design',
  'sf-task-planner', 'sf-executor', 'sf-debugger',
  'sf-reviewer', 'sf-verifier', 'sf-knowledge'
]);

describe('Workflow JSON schema consistency', () => {
  it('should have exactly 8 workflow JSON files', () => {
    const found = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json'));
    expect(found.sort()).toEqual(EXPECTED_FILES.sort());
  });

  EXPECTED_FILES.forEach(filename => {
    describe(filename, () => {
      const filepath = path.join(WORKFLOWS_DIR, filename);
      let def: any;

      it('is valid JSON', () => {
        const content = fs.readFileSync(filepath, 'utf-8');
        expect(() => JSON.parse(content)).not.toThrow();
        def = JSON.parse(content);
      });

      it('has schema_version 1.0', () => {
        expect(def.schema_version).toBe('1.0');
      });

      it('has matching id field with filename', () => {
        expect(def.id).toBe(filename.replace('.json', ''));
      });

      it('has stateMachine with initial state', () => {
        expect(def.stateMachine).toBeDefined();
        expect(def.stateMachine.initial).toBe('intake');
        expect(def.stateMachine.states).toBeDefined();
      });

      it('initial state exists in states map', () => {
        expect(def.stateMachine.states).toHaveProperty(def.stateMachine.initial);
      });

      it('has completed state', () => {
        expect(def.stateMachine.states).toHaveProperty('completed');
      });

      it('all next references are valid state names', () => {
        const stateNames = new Set(Object.keys(def.stateMachine.states));
        for (const [name, state] of Object.entries(def.stateMachine.states) as [string, any][]) {
          if (!state.next) continue;
          const targets = typeof state.next === 'string'
            ? [state.next]
            : Object.values(state.next) as string[];
          for (const t of targets) {
            expect(stateNames.has(t), `${filename}.${name}.next references unknown state '${t}'`).toBe(true);
          }
        }
      });

      it('all agent references are valid roles', () => {
        for (const [name, state] of Object.entries(def.stateMachine.states) as [string, any][]) {
          expect(
            VALID_AGENTS.has(state.agent ?? ''),
            `${filename}.${name}.agent='${state.agent}' is not a valid agent role`
          ).toBe(true);
        }
      });

      it('gate states use pass/fail in next', () => {
        for (const [name, state] of Object.entries(def.stateMachine.states) as [string, any][]) {
          if (state.gate && state.gate !== null) {
            // Gate states must have conditional next
            expect(typeof state.next, `${filename}.${name} is a gate state but next is not an object`).toBe('object');
            if (typeof state.next === 'object') {
              expect(state.next).toHaveProperty('pass');
              expect(state.next).toHaveProperty('fail');
            }
          }
        }
      });

      it('completed state has no next', () => {
        const completed = def.stateMachine.states.completed;
        expect(completed.next).toBeUndefined();
      });
    });
  });
});
