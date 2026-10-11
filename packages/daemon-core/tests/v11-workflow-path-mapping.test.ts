/**
 * 验证当前 workflow_type / workflow_path 边界：
 * - 新流程只有 feature_spec 身份；
 * - 事实分类仍可选择不同治理路径；
 * - 旧 workflow type 映射只为历史读取/恢复保留；
 * - rollback 仍是保留路径，当前不得静默映射。
 */

import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_PATH_DEFAULT_TYPE,
  WORKFLOW_PATH_TO_TYPE,
  WORKFLOW_TYPE_TO_PATH,
  CURRENT_FEATURE_SPEC_PATHS,
  isWorkflowTypeCompatibleWithPath,
  resolveWorkflowTypeForPath,
  type WorkflowPath,
  type WorkflowType,
} from '../src/tools/lib/state_machine';

const LEGACY_COMPATIBILITY_PAIRS: ReadonlyArray<readonly [WorkflowType, WorkflowPath]> = [
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
  ['contract_change', 'contract_change_path'],
];

const RESERVED_PATHS: WorkflowPath[] = [
  'rollback_path',
];

describe('当前 workflow_type / workflow_path 边界', () => {
  it('保留 11 个历史身份映射，但不把它们作为新建默认值', () => {
    expect(Object.entries(WORKFLOW_TYPE_TO_PATH)).toEqual(LEGACY_COMPATIBILITY_PAIRS);
  });

  it('为当前六条事实路由统一提供 feature_spec 身份', () => {
    expect(WORKFLOW_PATH_DEFAULT_TYPE).toEqual({
      requirement_change_path: 'feature_spec',
      design_change_path: 'feature_spec',
      spec_migration_path: 'spec_migration',
      architecture_change_path: 'feature_spec',
      contract_change_path: 'feature_spec',
      task_change_path: 'feature_spec',
      code_only_fast_path: 'feature_spec',
    });
    expect([...CURRENT_FEATURE_SPEC_PATHS]).toEqual([
      'requirement_change_path',
      'design_change_path',
      'architecture_change_path',
      'task_change_path',
      'code_only_fast_path',
      'contract_change_path',
    ]);
    expect(WORKFLOW_PATH_TO_TYPE).toBe(WORKFLOW_PATH_DEFAULT_TYPE);
  });

  it('保留路径没有用户级默认工作流身份', () => {
    for (const path of RESERVED_PATHS) {
      expect(WORKFLOW_PATH_DEFAULT_TYPE[path]).toBeUndefined();
      expect(resolveWorkflowTypeForPath(path)).toBeUndefined();
    }
  });

  it('历史工作流身份与原路径仍可供已有产物恢复', () => {
    for (const [workflowType, workflowPath] of LEGACY_COMPATIBILITY_PAIRS) {
      expect(isWorkflowTypeCompatibleWithPath(workflowType, workflowPath)).toBe(true);
      expect(resolveWorkflowTypeForPath(workflowPath, workflowType)).toBe(workflowType);
    }
  });

  it('feature_spec 与每条当前事实路由兼容', () => {
    for (const workflowPath of CURRENT_FEATURE_SPEC_PATHS) {
      expect(isWorkflowTypeCompatibleWithPath('feature_spec', workflowPath)).toBe(true);
      expect(resolveWorkflowTypeForPath(workflowPath, 'feature_spec')).toBe('feature_spec');
    }
  });

  it('显式工作流身份与路径不兼容时失败关闭', () => {
    expect(resolveWorkflowTypeForPath('code_only_fast_path', 'bugfix_spec')).toBeUndefined();
    expect(resolveWorkflowTypeForPath('requirement_change_path', 'quick_change')).toBeUndefined();
  });

  it('未提供工作流身份时只使用已登记的路径默认值', () => {
    expect(resolveWorkflowTypeForPath('requirement_change_path')).toBe('feature_spec');
    expect(resolveWorkflowTypeForPath('design_change_path')).toBe('feature_spec');
    expect(resolveWorkflowTypeForPath('task_change_path')).toBe('feature_spec');
    expect(resolveWorkflowTypeForPath('code_only_fast_path')).toBe('feature_spec');
    expect(resolveWorkflowTypeForPath('spec_migration_path')).toBe('spec_migration');
    expect(resolveWorkflowTypeForPath('architecture_change_path')).toBe('feature_spec');
    expect(resolveWorkflowTypeForPath('contract_change_path')).toBe('feature_spec');
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
