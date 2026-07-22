/**
 * 验证当前 workflow_type / workflow_path 边界：
 * - 显式 workflow_type 与 workflow_path 必须兼容；
 * - 只有已注册路径允许在缺少 workflow_type 时使用默认值；
 * - spec_migration 与 architecture_change 已成为正式工作流身份；
 * - rollback 仍是保留路径，当前不得静默映射。
 */

import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_PATH_DEFAULT_TYPE,
  WORKFLOW_PATH_TO_TYPE,
  WORKFLOW_TYPE_TO_PATH,
  isWorkflowTypeCompatibleWithPath,
  resolveWorkflowTypeForPath,
  type WorkflowPath,
  type WorkflowType,
} from '../src/tools/lib/state_machine';

const CURRENT_PAIRS: ReadonlyArray<readonly [WorkflowType, WorkflowPath]> = [
  ['feature_spec', 'requirement_change_path'],
  ['bugfix_spec', 'requirement_change_path'],
  ['change_request', 'requirement_change_path'],
  ['investigation', 'requirement_change_path'],
  ['feature_spec_design_first', 'design_change_path'],
  ['refactor', 'task_change_path'],
  ['ops_task', 'task_change_path'],
  ['quick_change', 'code_only_fast_path'],
  ['spec_migration', 'spec_migration_path'],
  ['architecture_change', 'architecture_change_path'],
];

const RESERVED_PATHS: WorkflowPath[] = [
  'rollback_path',
];

describe('当前 workflow_type / workflow_path 边界', () => {
  it('完整登记 10 个已注册工作流身份与路径组合', () => {
    expect(Object.entries(WORKFLOW_TYPE_TO_PATH)).toEqual(CURRENT_PAIRS);
  });

  it('为 6 条具有当前工作流身份的路径提供缺省映射', () => {
    expect(WORKFLOW_PATH_DEFAULT_TYPE).toEqual({
      requirement_change_path: 'feature_spec',
      design_change_path: 'feature_spec_design_first',
      spec_migration_path: 'spec_migration',
      architecture_change_path: 'architecture_change',
      task_change_path: 'refactor',
      code_only_fast_path: 'quick_change',
    });
    expect(WORKFLOW_PATH_TO_TYPE).toBe(WORKFLOW_PATH_DEFAULT_TYPE);
  });

  it('保留路径没有用户级默认工作流身份', () => {
    for (const path of RESERVED_PATHS) {
      expect(WORKFLOW_PATH_DEFAULT_TYPE[path]).toBeUndefined();
      expect(resolveWorkflowTypeForPath(path)).toBeUndefined();
    }
  });

  it('显式工作流身份与路径兼容时原样保留', () => {
    for (const [workflowType, workflowPath] of CURRENT_PAIRS) {
      expect(isWorkflowTypeCompatibleWithPath(workflowType, workflowPath)).toBe(true);
      expect(resolveWorkflowTypeForPath(workflowPath, workflowType)).toBe(workflowType);
    }
  });

  it('显式工作流身份与路径不兼容时失败关闭', () => {
    expect(resolveWorkflowTypeForPath('code_only_fast_path', 'bugfix_spec')).toBeUndefined();
    expect(resolveWorkflowTypeForPath('task_change_path', 'feature_spec')).toBeUndefined();
    expect(resolveWorkflowTypeForPath('requirement_change_path', 'quick_change')).toBeUndefined();
  });

  it('未提供工作流身份时只使用已登记的路径默认值', () => {
    expect(resolveWorkflowTypeForPath('requirement_change_path')).toBe('feature_spec');
    expect(resolveWorkflowTypeForPath('design_change_path')).toBe('feature_spec_design_first');
    expect(resolveWorkflowTypeForPath('task_change_path')).toBe('refactor');
    expect(resolveWorkflowTypeForPath('code_only_fast_path')).toBe('quick_change');
    expect(resolveWorkflowTypeForPath('spec_migration_path')).toBe('spec_migration');
    expect(resolveWorkflowTypeForPath('architecture_change_path')).toBe('architecture_change');
  });

  it('未提供路径时可以保留已知工作流身份', () => {
    expect(resolveWorkflowTypeForPath(undefined, 'bugfix_spec')).toBe('bugfix_spec');
    expect(resolveWorkflowTypeForPath(undefined, undefined, 'ops_task')).toBe('ops_task');
  });

  it('未知工作流身份不能通过兼容性检查', () => {
    expect(isWorkflowTypeCompatibleWithPath('unknown', 'requirement_change_path')).toBe(false);
    expect(resolveWorkflowTypeForPath('requirement_change_path', 'unknown')).toBeUndefined();
  });
});
