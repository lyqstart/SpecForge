/**
 * meta-schema.test.ts — T4 单元测试
 *
 * 验证 `packages/types/src/meta-schema.ts` 的 zod schema：
 * - 必填字段缺失时 `parse()` 抛 ZodError
 * - 枚举字段非法取值时 `parse()` 抛 ZodError
 * - 含全部可选字段的完整对象正常通过
 * - 类型推导 `WorkItemMeta = z.infer<typeof WorkItemMetaSchema>` 可用
 *
 * 至少 6 个用例（≥ 2 valid + ≥ 4 invalid），覆盖 refactor_plan.md T4 列出的
 * 全部 invalid 类型（缺必填 / 枚举非法 / 类型错）。
 *
 * 关联：refactor_plan.md T4 / 方案 A §6.3。
 */

import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import {
  WorkItemMetaSchema,
  WORKFLOW_TYPES,
  STAGE_TYPES,
  type WorkItemMeta,
} from '../src/meta-schema';

// 一个最小合法 _meta.json 对象（只含必填字段）
const minimalMeta = {
  id: 'WI-001',
  workflow_type: 'feature_spec',
  title: 'A feature title',
  summary: 'A short summary.',
  key_decisions: [],
  current_stage: 'requirements',
  created_at: '2026-05-29T08:30:00Z',
};

// 一个含全部可选字段的完整 _meta.json 对象
const fullMeta = {
  ...minimalMeta,
  id: 'WI-010',
  workflow_type: 'refactor',
  current_stage: 'development',
  completed_at: '2026-05-30T12:00:00Z',
  related_modules: ['packages/types', 'packages/daemon-core'],
  upstream_wis: ['WI-004', 'WI-002'],
  downstream_wis: ['WI-011'],
};

describe('WorkItemMetaSchema — valid cases', () => {
  it('parses minimal object (required fields only) without throwing', () => {
    const parsed = WorkItemMetaSchema.parse(minimalMeta);
    expect(parsed.id).toBe('WI-001');
    expect(parsed.workflow_type).toBe('feature_spec');
    expect(parsed.current_stage).toBe('requirements');
    // 可选字段在缺失时应为 undefined
    expect(parsed.completed_at).toBeUndefined();
    expect(parsed.related_modules).toBeUndefined();
  });

  it('parses object with ALL optional fields filled', () => {
    const parsed = WorkItemMetaSchema.parse(fullMeta);
    expect(parsed.id).toBe('WI-010');
    expect(parsed.workflow_type).toBe('refactor');
    expect(parsed.completed_at).toBe('2026-05-30T12:00:00Z');
    expect(parsed.related_modules).toEqual([
      'packages/types',
      'packages/daemon-core',
    ]);
    expect(parsed.upstream_wis).toEqual(['WI-004', 'WI-002']);
    expect(parsed.downstream_wis).toEqual(['WI-011']);
  });

  it('accepts every workflow_type enum value', () => {
    for (const wt of WORKFLOW_TYPES) {
      const obj = { ...minimalMeta, workflow_type: wt };
      expect(() => WorkItemMetaSchema.parse(obj)).not.toThrow();
    }
  });

  it('accepts every current_stage enum value', () => {
    for (const st of STAGE_TYPES) {
      const obj = { ...minimalMeta, current_stage: st };
      expect(() => WorkItemMetaSchema.parse(obj)).not.toThrow();
    }
  });
});

describe('WorkItemMetaSchema — invalid cases', () => {
  it('throws ZodError when required field "id" is missing', () => {
    const { id: _id, ...withoutId } = minimalMeta;
    expect(() => WorkItemMetaSchema.parse(withoutId)).toThrow(ZodError);
  });

  it('throws ZodError when required field "created_at" is missing', () => {
    const { created_at: _ts, ...withoutTs } = minimalMeta;
    expect(() => WorkItemMetaSchema.parse(withoutTs)).toThrow(ZodError);
  });

  it('throws ZodError when current_stage is an unknown enum value', () => {
    const bad = { ...minimalMeta, current_stage: 'bogus_stage' };
    expect(() => WorkItemMetaSchema.parse(bad)).toThrow(ZodError);
  });

  it('throws ZodError when workflow_type is an unknown enum value', () => {
    const bad = { ...minimalMeta, workflow_type: 'unknown' };
    expect(() => WorkItemMetaSchema.parse(bad)).toThrow(ZodError);
  });

  it('throws ZodError when "summary" is a number (type mismatch)', () => {
    const bad = { ...minimalMeta, summary: 12345 };
    expect(() => WorkItemMetaSchema.parse(bad)).toThrow(ZodError);
  });

  it('throws ZodError when id does not match /^WI-\\d+$/', () => {
    const bad = { ...minimalMeta, id: 'WORKITEM-1' };
    expect(() => WorkItemMetaSchema.parse(bad)).toThrow(ZodError);
  });

  it('throws ZodError when summary exceeds 500 chars', () => {
    const bad = { ...minimalMeta, summary: 'x'.repeat(501) };
    expect(() => WorkItemMetaSchema.parse(bad)).toThrow(ZodError);
  });

  it('throws ZodError when created_at is not an ISO 8601 datetime', () => {
    const bad = { ...minimalMeta, created_at: 'not-a-datetime' };
    expect(() => WorkItemMetaSchema.parse(bad)).toThrow(ZodError);
  });

  it('throws ZodError when title is empty string', () => {
    const bad = { ...minimalMeta, title: '' };
    expect(() => WorkItemMetaSchema.parse(bad)).toThrow(ZodError);
  });

  it('safeParse returns success=false on invalid input (does not throw)', () => {
    const bad = { ...minimalMeta, id: 'invalid' };
    const result = WorkItemMetaSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe('WorkItemMetaSchema — type inference', () => {
  it('WorkItemMeta type is structurally assignable from a valid object', () => {
    // 编译期类型推导验证：以下赋值若失败则 tsc --noEmit 报错
    const value: WorkItemMeta = {
      id: 'WI-999',
      workflow_type: 'quick_change',
      title: 'inference check',
      summary: 'ensure z.infer works',
      key_decisions: ['decision A'],
      current_stage: 'completed',
      created_at: '2026-05-29T10:00:00Z',
    };
    expect(value.id).toBe('WI-999');
  });
});
