/**
 * 集成测试：scope-gate 集成验证
 *
 * 验证：
 * 1. P1/P2 能力在 V6.0 分支默认关闭（feature flag = false）
 * 2. scope-gate 拦截未授权的 P1/P2 能力调用，返回 scope 错误
 * 3. V6.0 分支的 scope tag 正确（P0 能力 scopeTag = "p0"）
 * 4. P0 能力正常通过 scope-gate 检查
 *
 * Requirements: REQ-W3-3 AC-3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ScopeRegistry,
  RuntimeScopeChecker,
  ScopeBoundaryViolationError,
  CapabilityUnavailableError,
} from '../../packages/scope-gate/src/index.js';
import type {
  CapabilityDefinition,
  ScopeContext,
} from '../../packages/scope-gate/src/index.js';

// ============================================================
// 测试用能力定义（模拟 REQ-25 中的 P0/P1/P2 能力）
// ============================================================

/** P0 能力：V6.0 必做项，始终可用 */
const P0_CAPABILITIES: CapabilityDefinition[] = [
  {
    id: 'feature-spec-workflow',
    displayName: 'Feature Spec Workflow',
    scopeTag: 'p0',
    entryPoints: ['WorkflowEngine.execute'],
    dependencies: [],
    description: 'Core feature spec workflow (P0)',
  },
  {
    id: 'requirements-gate',
    displayName: 'Requirements Gate',
    scopeTag: 'p0',
    entryPoints: ['RequirementsGate.check'],
    dependencies: [],
    description: 'Requirements gate check (P0)',
  },
  {
    id: 'daemon-core',
    displayName: 'Daemon Core',
    scopeTag: 'p0',
    entryPoints: ['DaemonCore.start'],
    dependencies: [],
    description: 'Core daemon functionality (P0)',
  },
];

/** P1 能力：V6.0 默认关闭，需要 feature flag */
const P1_CAPABILITIES: CapabilityDefinition[] = [
  {
    id: 'bugfix-workflow',
    displayName: 'Bugfix Workflow',
    scopeTag: 'p1',
    entryPoints: ['BugfixWorkflow.execute'],
    dependencies: [],
    description: 'Bugfix workflow capability (P1)',
  },
  {
    id: 'design-first-workflow',
    displayName: 'Design First Workflow',
    scopeTag: 'p1',
    entryPoints: ['DesignFirstWorkflow.execute'],
    dependencies: [],
    description: 'Design-first workflow (P1)',
  },
  {
    id: 'knowledge-graph',
    displayName: 'Knowledge Graph',
    scopeTag: 'p1',
    entryPoints: ['KnowledgeGraph.query'],
    dependencies: [],
    description: 'Knowledge graph capability (P1)',
  },
];

/** P2 能力：V6.0 默认关闭，需要 feature flag */
const P2_CAPABILITIES: CapabilityDefinition[] = [
  {
    id: 'multimodal-support',
    displayName: 'Multimodal Support',
    scopeTag: 'p2',
    entryPoints: ['MultimodalProcessor.process'],
    dependencies: [],
    description: 'Full multimodal support (P2)',
  },
  {
    id: 'self-healing',
    displayName: 'Self Healing',
    scopeTag: 'p2',
    entryPoints: ['SelfHealingEngine.heal'],
    dependencies: [],
    description: 'Self-healing capability (P2)',
  },
];

// ============================================================
// 辅助函数
// ============================================================

/**
 * 创建已注册所有测试能力的 ScopeRegistry
 */
function createTestRegistry(): ScopeRegistry {
  const registry = new ScopeRegistry();
  for (const cap of [...P0_CAPABILITIES, ...P1_CAPABILITIES, ...P2_CAPABILITIES]) {
    registry.registerCapability(cap);
  }
  return registry;
}

/**
 * 创建 V6.0 分支的 ScopeContext（无 feature flags）
 */
function createV60Context(featureFlags: string[] = []): ScopeContext {
  return {
    releaseBranch: 'v6.0',
    featureFlags: new Set(featureFlags),
    environment: 'production',
  };
}

// ============================================================
// 测试套件
// ============================================================

describe('scope-gate 集成验证', () => {
  let registry: ScopeRegistry;

  beforeEach(() => {
    registry = createTestRegistry();
  });

  // ----------------------------------------------------------
  // 测试 1：P1/P2 能力在 V6.0 分支默认关闭
  // ----------------------------------------------------------
  describe('P1/P2 能力在 V6.0 分支默认关闭', () => {
    it('P1 能力在 V6.0 无 feature flag 时应不可用', () => {
      const context = createV60Context();

      for (const cap of P1_CAPABILITIES) {
        const result = registry.isAvailable(cap.id, context);
        expect(result.available).toBe(false);
        expect(result.reason).toContain('V6.0');
      }
    });

    it('P2 能力在 V6.0 无 feature flag 时应不可用', () => {
      const context = createV60Context();

      for (const cap of P2_CAPABILITIES) {
        const result = registry.isAvailable(cap.id, context);
        expect(result.available).toBe(false);
        expect(result.reason).toContain('V6.0');
      }
    });

    it('bugfix-workflow（P1）在 V6.0 默认关闭', () => {
      const context = createV60Context();
      const result = registry.isAvailable('bugfix-workflow', context);

      expect(result.available).toBe(false);
      expect(result.requiredFlag).toBe('enable_bugfix-workflow');
    });

    it('multimodal-support（P2）在 V6.0 默认关闭', () => {
      const context = createV60Context();
      const result = registry.isAvailable('multimodal-support', context);

      expect(result.available).toBe(false);
      expect(result.requiredFlag).toBe('enable_multimodal-support');
    });

    it('P1 能力在 V6.0 关闭时应返回所需的 feature flag 名称', () => {
      const context = createV60Context();

      for (const cap of P1_CAPABILITIES) {
        const result = registry.isAvailable(cap.id, context);
        expect(result.requiredFlag).toBe(`enable_${cap.id}`);
      }
    });

    it('P2 能力在 V6.0 关闭时应返回所需的 feature flag 名称', () => {
      const context = createV60Context();

      for (const cap of P2_CAPABILITIES) {
        const result = registry.isAvailable(cap.id, context);
        expect(result.requiredFlag).toBe(`enable_${cap.id}`);
      }
    });

    it('启用 feature flag 后 P1 能力应变为可用', () => {
      const context = createV60Context(['enable_bugfix-workflow']);
      const result = registry.isAvailable('bugfix-workflow', context);

      expect(result.available).toBe(true);
    });

    it('启用 enable_all_p1p2 后所有 P1/P2 能力应变为可用', () => {
      const context = createV60Context(['enable_all_p1p2']);

      for (const cap of [...P1_CAPABILITIES, ...P2_CAPABILITIES]) {
        const result = registry.isAvailable(cap.id, context);
        expect(result.available).toBe(true);
      }
    });
  });

  // ----------------------------------------------------------
  // 测试 2：scope-gate 拦截未授权能力调用
  // ----------------------------------------------------------
  describe('scope-gate 拦截未授权的 P1/P2 能力调用', () => {
    let checker: RuntimeScopeChecker;

    beforeEach(() => {
      checker = new RuntimeScopeChecker(registry, createV60Context());
    });

    it('调用未授权的 P1 能力应抛出 ScopeBoundaryViolationError', () => {
      const context = createV60Context();

      expect(() => {
        checker.checkCapability('bugfix-workflow', context);
      }).toThrow(ScopeBoundaryViolationError);
    });

    it('调用未授权的 P2 能力应抛出 ScopeBoundaryViolationError', () => {
      const context = createV60Context();

      expect(() => {
        checker.checkCapability('multimodal-support', context);
      }).toThrow(ScopeBoundaryViolationError);
    });

    it('ScopeBoundaryViolationError 应包含正确的 code', () => {
      const context = createV60Context();

      try {
        checker.checkCapability('bugfix-workflow', context);
        expect.fail('应该抛出错误');
      } catch (err) {
        expect(err).toBeInstanceOf(ScopeBoundaryViolationError);
        const scopeErr = err as ScopeBoundaryViolationError;
        expect(scopeErr.code).toBe('SCOPE_BOUNDARY_VIOLATION');
      }
    });

    it('ScopeBoundaryViolationError 应包含正确的 capabilityId', () => {
      const context = createV60Context();

      try {
        checker.checkCapability('design-first-workflow', context);
        expect.fail('应该抛出错误');
      } catch (err) {
        expect(err).toBeInstanceOf(ScopeBoundaryViolationError);
        const scopeErr = err as ScopeBoundaryViolationError;
        expect(scopeErr.capabilityId).toBe('design-first-workflow');
      }
    });

    it('ScopeBoundaryViolationError 应包含正确的 scopeTag', () => {
      const context = createV60Context();

      try {
        checker.checkCapability('knowledge-graph', context);
        expect.fail('应该抛出错误');
      } catch (err) {
        expect(err).toBeInstanceOf(ScopeBoundaryViolationError);
        const scopeErr = err as ScopeBoundaryViolationError;
        expect(scopeErr.scopeTag).toBe('p1');
      }
    });

    it('ScopeBoundaryViolationError 应包含所需的 feature flag', () => {
      const context = createV60Context();

      try {
        checker.checkCapability('self-healing', context);
        expect.fail('应该抛出错误');
      } catch (err) {
        expect(err).toBeInstanceOf(ScopeBoundaryViolationError);
        const scopeErr = err as ScopeBoundaryViolationError;
        expect(scopeErr.requiredFlag).toBe('enable_self-healing');
      }
    });

    it('批量检查时未授权的 P1/P2 能力应返回错误结果', () => {
      const context = createV60Context();
      const capabilityIds = P1_CAPABILITIES.map(c => c.id);

      const results = checker.checkCapabilities(capabilityIds, context);

      expect(results).toHaveLength(capabilityIds.length);
      for (const result of results) {
        expect(result.available).toBe(false);
        expect(result.error).toBeInstanceOf(ScopeBoundaryViolationError);
      }
    });

    it('未注册的能力调用应抛出 CapabilityUnavailableError', () => {
      const context = createV60Context();

      expect(() => {
        checker.checkCapability('nonexistent-capability', context);
      }).toThrow(CapabilityUnavailableError);
    });

    it('启用 feature flag 后 P1 能力调用不应抛出错误', () => {
      const context = createV60Context(['enable_bugfix-workflow']);

      expect(() => {
        checker.checkCapability('bugfix-workflow', context);
      }).not.toThrow();
    });

    it('启用 enable_all_p1p2 后所有 P1/P2 能力调用不应抛出错误', () => {
      const context = createV60Context(['enable_all_p1p2']);

      for (const cap of [...P1_CAPABILITIES, ...P2_CAPABILITIES]) {
        expect(() => {
          checker.checkCapability(cap.id, context);
        }).not.toThrow();
      }
    });
  });

  // ----------------------------------------------------------
  // 测试 3：V6.0 分支 scope tag 正确
  // ----------------------------------------------------------
  describe('V6.0 分支 scope tag 正确', () => {
    it('P0 能力的 scopeTag 应为 "p0"', () => {
      for (const cap of P0_CAPABILITIES) {
        const capability = registry.getCapability(cap.id);
        expect(capability).toBeDefined();
        expect(capability!.scopeTag).toBe('p0');
      }
    });

    it('P1 能力的 scopeTag 应为 "p1"', () => {
      for (const cap of P1_CAPABILITIES) {
        const capability = registry.getCapability(cap.id);
        expect(capability).toBeDefined();
        expect(capability!.scopeTag).toBe('p1');
      }
    });

    it('P2 能力的 scopeTag 应为 "p2"', () => {
      for (const cap of P2_CAPABILITIES) {
        const capability = registry.getCapability(cap.id);
        expect(capability).toBeDefined();
        expect(capability!.scopeTag).toBe('p2');
      }
    });

    it('getCapabilitiesByScope("p0") 应只返回 P0 能力', () => {
      const p0Caps = registry.getCapabilitiesByScope('p0');

      expect(p0Caps.length).toBeGreaterThanOrEqual(P0_CAPABILITIES.length);
      for (const cap of p0Caps) {
        expect(cap.scopeTag).toBe('p0');
      }
    });

    it('getCapabilitiesByScope("p1") 应只返回 P1 能力', () => {
      const p1Caps = registry.getCapabilitiesByScope('p1');

      expect(p1Caps.length).toBeGreaterThanOrEqual(P1_CAPABILITIES.length);
      for (const cap of p1Caps) {
        expect(cap.scopeTag).toBe('p1');
      }
    });

    it('getCapabilitiesByScope("p2") 应只返回 P2 能力', () => {
      const p2Caps = registry.getCapabilitiesByScope('p2');

      expect(p2Caps.length).toBeGreaterThanOrEqual(P2_CAPABILITIES.length);
      for (const cap of p2Caps) {
        expect(cap.scopeTag).toBe('p2');
      }
    });

    it('V6.0 分支中 P0 能力的 isAvailable 应返回 available=true', () => {
      const context = createV60Context();

      for (const cap of P0_CAPABILITIES) {
        const result = registry.isAvailable(cap.id, context);
        expect(result.available).toBe(true);
      }
    });

    it('V6.0 分支中 P1 能力的 isAvailable 应返回 available=false', () => {
      const context = createV60Context();

      for (const cap of P1_CAPABILITIES) {
        const result = registry.isAvailable(cap.id, context);
        expect(result.available).toBe(false);
      }
    });

    it('V6.0 分支中 P2 能力的 isAvailable 应返回 available=false', () => {
      const context = createV60Context();

      for (const cap of P2_CAPABILITIES) {
        const result = registry.isAvailable(cap.id, context);
        expect(result.available).toBe(false);
      }
    });
  });

  // ----------------------------------------------------------
  // 测试 4：P0 能力正常通过 scope-gate 检查
  // ----------------------------------------------------------
  describe('P0 能力正常通过 scope-gate 检查', () => {
    let checker: RuntimeScopeChecker;

    beforeEach(() => {
      checker = new RuntimeScopeChecker(registry, createV60Context());
    });

    it('P0 能力调用不应抛出任何错误', () => {
      const context = createV60Context();

      for (const cap of P0_CAPABILITIES) {
        expect(() => {
          checker.checkCapability(cap.id, context);
        }).not.toThrow();
      }
    });

    it('feature-spec-workflow（P0）在 V6.0 应可用', () => {
      const context = createV60Context();
      const result = registry.isAvailable('feature-spec-workflow', context);

      expect(result.available).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('requirements-gate（P0）在 V6.0 应可用', () => {
      const context = createV60Context();
      const result = registry.isAvailable('requirements-gate', context);

      expect(result.available).toBe(true);
    });

    it('daemon-core（P0）在 V6.0 应可用', () => {
      const context = createV60Context();
      const result = registry.isAvailable('daemon-core', context);

      expect(result.available).toBe(true);
    });

    it('P0 能力在 V6.0 不需要任何 feature flag', () => {
      const context = createV60Context(); // 无任何 feature flag

      for (const cap of P0_CAPABILITIES) {
        const result = registry.isAvailable(cap.id, context);
        expect(result.available).toBe(true);
        expect(result.requiredFlag).toBeUndefined();
      }
    });

    it('批量检查 P0 能力时所有结果应为可用', () => {
      const context = createV60Context();
      const capabilityIds = P0_CAPABILITIES.map(c => c.id);

      const results = checker.checkCapabilities(capabilityIds, context);

      expect(results).toHaveLength(capabilityIds.length);
      for (const result of results) {
        expect(result.available).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it('P0 能力在 production 环境 V6.0 分支应可用', () => {
      const context: ScopeContext = {
        releaseBranch: 'v6.0',
        featureFlags: new Set(),
        environment: 'production',
      };

      for (const cap of P0_CAPABILITIES) {
        const result = registry.isAvailable(cap.id, context);
        expect(result.available).toBe(true);
      }
    });

    it('P0 能力在 test 环境 V6.0 分支应可用', () => {
      const context: ScopeContext = {
        releaseBranch: 'v6.0',
        featureFlags: new Set(),
        environment: 'test',
      };

      for (const cap of P0_CAPABILITIES) {
        const result = registry.isAvailable(cap.id, context);
        expect(result.available).toBe(true);
      }
    });
  });

  // ----------------------------------------------------------
  // 测试 5：综合场景验证
  // ----------------------------------------------------------
  describe('综合场景：V6.0 scope-gate 完整行为', () => {
    it('V6.0 分支：P0 可用，P1/P2 默认不可用', () => {
      const context = createV60Context();

      // P0 全部可用
      for (const cap of P0_CAPABILITIES) {
        expect(registry.isAvailable(cap.id, context).available).toBe(true);
      }

      // P1 全部不可用
      for (const cap of P1_CAPABILITIES) {
        expect(registry.isAvailable(cap.id, context).available).toBe(false);
      }

      // P2 全部不可用
      for (const cap of P2_CAPABILITIES) {
        expect(registry.isAvailable(cap.id, context).available).toBe(false);
      }
    });

    it('非 V6.0 分支（development）：P0/P1/P2 均可用', () => {
      const context: ScopeContext = {
        releaseBranch: 'development',
        featureFlags: new Set(),
        environment: 'development',
      };

      for (const cap of [...P0_CAPABILITIES, ...P1_CAPABILITIES, ...P2_CAPABILITIES]) {
        const result = registry.isAvailable(cap.id, context);
        expect(result.available).toBe(true);
      }
    });

    it('validateDependencies 不应报告 P0 依赖 P1/P2 的错误（测试能力无此依赖）', () => {
      const errors = registry.validateDependencies();
      expect(errors).toHaveLength(0);
    });

    it('scope-gate 拦截 P1 能力时错误信息应包含 "V6.0"', () => {
      const context = createV60Context();

      try {
        const checker = new RuntimeScopeChecker(registry, context);
        checker.checkCapability('bugfix-workflow', context);
        expect.fail('应该抛出错误');
      } catch (err) {
        expect(err).toBeInstanceOf(ScopeBoundaryViolationError);
        expect((err as Error).message).toContain('V6.0');
      }
    });

    it('scope-gate 拦截 P2 能力时错误信息应包含 "P2"', () => {
      const context = createV60Context();

      try {
        const checker = new RuntimeScopeChecker(registry, context);
        checker.checkCapability('multimodal-support', context);
        expect.fail('应该抛出错误');
      } catch (err) {
        expect(err).toBeInstanceOf(ScopeBoundaryViolationError);
        expect((err as Error).message).toContain('P2');
      }
    });
  });
});
