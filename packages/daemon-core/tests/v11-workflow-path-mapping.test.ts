/**
 * v11-workflow-path-mapping.test.ts
 *
 * Verifies that the daemon v1.1 state transition handler correctly
 * accepts workflow_path as the v1.1 external interface and maps it
 * to the internal legacy workflow_type for StateManager compatibility.
 *
 * Key invariants:
 * - v1.1 external input uses workflow_path (not workflow_type)
 * - daemon handler maps workflow_path → internal workflow_type via WORKFLOW_PATH_TO_TYPE
 * - Unknown workflow_path returns explicit error
 * - Internal workflow_type is preserved for StateManager/WAL backward compat
 * - Legacy workflow_type input is still accepted for backward compatibility
 */

import { describe, it, expect } from 'vitest';
import {
  WORKFLOW_TYPE_TO_PATH,
  WORKFLOW_PATH_TO_TYPE,
  type WorkflowPath,
  type WorkflowType,
} from '../src/tools/lib/state_machine';

describe('v1.1 workflow_path boundary mapping', () => {

  // ═══════════════════════════════════════════════════════════════════════════
  // Mapping table completeness
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WORKFLOW_PATH_TO_TYPE mapping', () => {
    it('maps requirement_change_path to a valid WorkflowType', () => {
      expect(WORKFLOW_PATH_TO_TYPE['requirement_change_path']).toBeDefined();
      expect(typeof WORKFLOW_PATH_TO_TYPE['requirement_change_path']).toBe('string');
    });

    it('maps design_change_path to a valid WorkflowType', () => {
      expect(WORKFLOW_PATH_TO_TYPE['design_change_path']).toBeDefined();
    });

    it('maps architecture_change_path to a valid WorkflowType', () => {
      expect(WORKFLOW_PATH_TO_TYPE['architecture_change_path']).toBeDefined();
    });

    it('maps task_change_path to a valid WorkflowType', () => {
      expect(WORKFLOW_PATH_TO_TYPE['task_change_path']).toBeDefined();
    });

    it('maps code_only_fast_path to a valid WorkflowType', () => {
      expect(WORKFLOW_PATH_TO_TYPE['code_only_fast_path']).toBe('quick_change');
    });

    it('maps spec_migration_path to a valid WorkflowType', () => {
      expect(WORKFLOW_PATH_TO_TYPE['spec_migration_path']).toBeDefined();
    });

    it('maps rollback_path to a valid WorkflowType', () => {
      expect(WORKFLOW_PATH_TO_TYPE['rollback_path']).toBeDefined();
    });

    it('covers all declared WorkflowPath values', () => {
      const allPaths: WorkflowPath[] = [
        'requirement_change_path',
        'design_change_path',
        'architecture_change_path',
        'task_change_path',
        'code_only_fast_path',
        'spec_migration_path',
        'rollback_path',
      ];
      for (const path of allPaths) {
        expect(WORKFLOW_PATH_TO_TYPE[path]).toBeDefined();
      }
    });
  });

  describe('WORKFLOW_TYPE_TO_PATH mapping', () => {
    it('maps all WorkflowType values to a WorkflowPath', () => {
      const allTypes: WorkflowType[] = [
        'feature_spec',
        'bugfix_spec',
        'feature_spec_design_first',
        'quick_change',
        'change_request',
        'refactor',
        'ops_task',
        'investigation',
      ];
      for (const type of allTypes) {
        expect(WORKFLOW_TYPE_TO_PATH[type]).toBeDefined();
      }
    });

    it('feature_spec maps to requirement_change_path', () => {
      expect(WORKFLOW_TYPE_TO_PATH['feature_spec']).toBe('requirement_change_path');
    });

    it('quick_change maps to code_only_fast_path', () => {
      expect(WORKFLOW_TYPE_TO_PATH['quick_change']).toBe('code_only_fast_path');
    });

    it('feature_spec_design_first maps to design_change_path', () => {
      expect(WORKFLOW_TYPE_TO_PATH['feature_spec_design_first']).toBe('design_change_path');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Bidirectional consistency
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Bidirectional mapping consistency', () => {
    it('every WorkflowPath maps back to a WorkflowType that maps to a WorkflowPath', () => {
      for (const [path, type] of Object.entries(WORKFLOW_PATH_TO_TYPE)) {
        const reverseMapping = WORKFLOW_TYPE_TO_PATH[type as WorkflowType];
        expect(reverseMapping).toBeDefined();
        // The reverse path may not be the same (many-to-one), but must be a valid path
        expect(Object.keys(WORKFLOW_PATH_TO_TYPE)).toContain(reverseMapping);
      }
    });

    it('every WorkflowType maps to a WorkflowPath that exists in WORKFLOW_PATH_TO_TYPE', () => {
      for (const [type, path] of Object.entries(WORKFLOW_TYPE_TO_PATH)) {
        expect(WORKFLOW_PATH_TO_TYPE[path as WorkflowPath]).toBeDefined();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Handler boundary behavior (simulated)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Handler boundary: workflow_path input → internal workflow_type', () => {
    /**
     * Simulates the sf_state_transition handler's workflow_path resolution logic.
     * This is the EXACT logic from sf-state-transition.ts lines 14-30.
     */
    function resolveWorkflowType(args: { workflow_path?: string; workflow_type?: string }): {
      resolved: string | undefined;
      error?: string;
    } {
      const rawWorkflowPath = args.workflow_path;
      const rawWorkflowType = args.workflow_type;
      let resolvedWorkflowType: string | undefined = rawWorkflowType;

      if (rawWorkflowPath && !rawWorkflowType) {
        const mapped = WORKFLOW_PATH_TO_TYPE[rawWorkflowPath as WorkflowPath];
        if (mapped) {
          resolvedWorkflowType = mapped;
        } else {
          return {
            resolved: undefined,
            error: `Unknown workflow_path: ${rawWorkflowPath}. Valid paths: ${Object.keys(WORKFLOW_PATH_TO_TYPE).join(', ')}`,
          };
        }
      }

      return { resolved: resolvedWorkflowType };
    }

    it('workflow_path=requirement_change_path resolves to feature_spec', () => {
      const result = resolveWorkflowType({ workflow_path: 'requirement_change_path' });
      expect(result.resolved).toBe('feature_spec');
      expect(result.error).toBeUndefined();
    });

    it('workflow_path=design_change_path resolves to feature_spec_design_first', () => {
      const result = resolveWorkflowType({ workflow_path: 'design_change_path' });
      expect(result.resolved).toBe('feature_spec_design_first');
      expect(result.error).toBeUndefined();
    });

    it('workflow_path=code_only_fast_path resolves to quick_change', () => {
      const result = resolveWorkflowType({ workflow_path: 'code_only_fast_path' });
      expect(result.resolved).toBe('quick_change');
      expect(result.error).toBeUndefined();
    });

    it('workflow_path=task_change_path resolves to refactor', () => {
      const result = resolveWorkflowType({ workflow_path: 'task_change_path' });
      expect(result.resolved).toBe('refactor');
      expect(result.error).toBeUndefined();
    });

    it('workflow_path=architecture_change_path resolves correctly', () => {
      const result = resolveWorkflowType({ workflow_path: 'architecture_change_path' });
      expect(result.resolved).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('workflow_path=spec_migration_path resolves correctly', () => {
      const result = resolveWorkflowType({ workflow_path: 'spec_migration_path' });
      expect(result.resolved).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('workflow_path=rollback_path resolves correctly', () => {
      const result = resolveWorkflowType({ workflow_path: 'rollback_path' });
      expect(result.resolved).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('unknown workflow_path returns explicit error', () => {
      const result = resolveWorkflowType({ workflow_path: 'nonexistent_path' });
      expect(result.resolved).toBeUndefined();
      expect(result.error).toContain('Unknown workflow_path');
      expect(result.error).toContain('nonexistent_path');
    });

    it('empty workflow_path with no workflow_type returns undefined (no error)', () => {
      const result = resolveWorkflowType({});
      expect(result.resolved).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('legacy workflow_type is still accepted for backward compatibility', () => {
      const result = resolveWorkflowType({ workflow_type: 'bugfix_spec' });
      expect(result.resolved).toBe('bugfix_spec');
      expect(result.error).toBeUndefined();
    });

    it('workflow_path takes precedence over workflow_type when both absent from type', () => {
      // When workflow_path is provided WITHOUT workflow_type, path is used
      const result = resolveWorkflowType({ workflow_path: 'code_only_fast_path' });
      expect(result.resolved).toBe('quick_change');
    });

    it('workflow_type takes precedence when both provided (backward compat)', () => {
      // When BOTH are provided, the handler keeps workflow_type (rawWorkflowType already set)
      const result = resolveWorkflowType({
        workflow_path: 'code_only_fast_path',
        workflow_type: 'bugfix_spec',
      });
      // workflow_type wins because: `if (rawWorkflowPath && !rawWorkflowType)` — condition is false
      expect(result.resolved).toBe('bugfix_spec');
    });

    it('v1.1 user does NOT need to pass workflow_type — workflow_path is sufficient', () => {
      // This is the key v1.1 invariant: external users only need workflow_path
      const allV11Paths: WorkflowPath[] = [
        'requirement_change_path',
        'design_change_path',
        'architecture_change_path',
        'task_change_path',
        'code_only_fast_path',
        'spec_migration_path',
        'rollback_path',
      ];

      for (const path of allV11Paths) {
        const result = resolveWorkflowType({ workflow_path: path });
        expect(result.resolved).toBeDefined();
        expect(result.error).toBeUndefined();
      }
    });
  });
});
