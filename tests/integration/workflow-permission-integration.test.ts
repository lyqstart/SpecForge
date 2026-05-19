/**
 * 集成测试：workflow-runtime + permission-engine
 *
 * 验证：
 * 1. 有权限时 workflow 正常执行
 * 2. 无权限时 workflow 被拒绝，返回权限错误
 * 3. 权限检查产生 permission.evaluated 事件（六字段：sessionId, agentId, resource, action, decision, reason）
 *
 * Requirements: REQ-W3-3 AC-1
 *
 * 注意：直接从具体文件导入，绕过 permission-engine/src/index.ts 的导出冲突
 * （services/index.ts 中 ActorContext 被重复导出，导致 bun 模块解析失败）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowEngine } from '../../packages/workflow-runtime/src/WorkflowEngine.js';
import type { WorkflowDefinition, GateResult } from '../../packages/workflow-runtime/src/types.js';
import { HardRuleEvaluator } from '../../packages/permission-engine/src/hard-rules.js';
import { RuleMergingEngine } from '../../packages/permission-engine/src/services/rule-merging-engine.js';
import type { PermissionRequest } from '../../packages/permission-engine/src/services/rule-merging-engine.js';

// ============================================================
// In-memory 权限引擎（轻量级，不依赖文件系统或 daemon）
// ============================================================

/**
 * 权限事件记录（六字段）
 */
interface PermissionEvaluatedEvent {
  action: 'permission.evaluated';
  payload: {
    sessionId: string;   // 字段 1
    agentId: string;     // 字段 2
    resource: string;    // 字段 3
    action: string;      // 字段 4
    decision: 'allow' | 'deny'; // 字段 5
    reason: string;      // 字段 6
  };
}

/**
 * 轻量级内存权限引擎
 * 使用 HardRuleEvaluator + RuleMergingEngine，不依赖文件 I/O
 */
class InMemoryPermissionEngine {
  private ruleMergingEngine: RuleMergingEngine;
  private events: PermissionEvaluatedEvent[] = [];

  constructor() {
    this.ruleMergingEngine = new RuleMergingEngine({
      hardRuleEvaluator: new HardRuleEvaluator(),
      cacheEnabled: false,
      defaultDecision: 'allow',
    });
  }

  /**
   * 检查权限并记录事件
   */
  checkPermission(
    agentId: string,
    action: string,
    resource: string,
    sessionId: string
  ): boolean {
    const request: PermissionRequest = {
      actor: { id: agentId, sessionId },
      action,
      resource: { type: resource },
    };

    const decision = this.ruleMergingEngine.evaluate(request);

    // 记录 permission.evaluated 事件（六字段）
    this.events.push({
      action: 'permission.evaluated',
      payload: {
        sessionId,
        agentId,
        resource,
        action,
        decision: decision.allowed ? 'allow' : 'deny',
        reason: decision.reason,
      },
    });

    return decision.allowed;
  }

  getEvents(): PermissionEvaluatedEvent[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events = [];
  }
}

// ============================================================
// 测试辅助：构建简单的 WorkflowDefinition
// ============================================================

function buildSimpleWorkflowDefinition(
  id: string,
  gateCheckFn: () => Promise<GateResult>
): WorkflowDefinition {
  return {
    schema_version: '1.0',
    id,
    displayName: `Test Workflow ${id}`,
    intent: 'Integration test workflow',
    stateMachine: {
      schema_version: '1.0',
      initial: 'check',
      states: {
        check: {
          schema_version: '1.0',
          agent: 'test-agent',
          gate: {
            schema_version: '1.0',
            type: 'simple',
            id: `${id}-gate`,
            name: 'Test Gate',
            checkFn: gateCheckFn,
          },
          skills: [],
          // 无 next → 执行完即结束
        },
      },
    },
    artifacts: [],
  };
}

/**
 * 带权限检查的 workflow 执行包装函数
 */
async function executeWorkflowWithPermissionCheck(
  workflowEngine: WorkflowEngine,
  permEngine: InMemoryPermissionEngine,
  instanceId: string,
  sessionId: string,
  agentId: string,
  resource: string,
  action: string
): Promise<{ success: boolean; error?: string }> {
  const allowed = permEngine.checkPermission(agentId, action, resource, sessionId);

  if (!allowed) {
    return {
      success: false,
      error: `Permission denied: agent '${agentId}' cannot perform '${action}' on '${resource}'`,
    };
  }

  try {
    await workflowEngine.execute(instanceId);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================
// 测试套件
// ============================================================

describe('workflow + permission-engine 集成测试', () => {
  let workflowEngine: WorkflowEngine;
  let permEngine: InMemoryPermissionEngine;

  beforeEach(() => {
    workflowEngine = new WorkflowEngine();
    permEngine = new InMemoryPermissionEngine();
  });

  // ----------------------------------------------------------
  // 测试 1：有权限时 workflow 正常执行
  // ----------------------------------------------------------
  describe('有权限时 workflow 正常执行', () => {
    it('当权限通过时，workflow 应该成功执行并完成', async () => {
      let gateExecuted = false;

      const definition = buildSimpleWorkflowDefinition('wf-allowed', async () => {
        gateExecuted = true;
        return { schema_version: '1.0', passed: true, reason: 'Gate passed' };
      });

      workflowEngine.loadWorkflow(definition);
      const instance = workflowEngine.createInstance('wf-allowed');

      const result = await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, instance.id,
        'session-001', 'agent-dev', 'workflow', 'workflow.execute'
      );

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(gateExecuted).toBe(true);

      const finalInstance = workflowEngine.getInstance(instance.id);
      expect(finalInstance?.status).toBe('completed');
    });

    it('有权限时 workflow 的 gate 应该被执行', async () => {
      const gateResults: boolean[] = [];

      const definition = buildSimpleWorkflowDefinition('wf-gate-result', async () => {
        gateResults.push(true);
        return { schema_version: '1.0', passed: true, reason: 'All checks passed' };
      });

      workflowEngine.loadWorkflow(definition);
      const instance = workflowEngine.createInstance('wf-gate-result');

      const result = await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, instance.id,
        'session-002', 'agent-reviewer', 'spec', 'spec.read'
      );

      expect(result.success).toBe(true);
      expect(gateResults).toHaveLength(1);
    });

    it('普通 workflow.execute 操作应该被允许（默认 allow）', () => {
      const allowed = permEngine.checkPermission(
        'agent-normal', 'workflow.execute', 'workflow', 'session-normal'
      );
      expect(allowed).toBe(true);
    });

    it('spec.read 操作应该被允许', () => {
      const allowed = permEngine.checkPermission(
        'agent-reader', 'spec.read', 'spec', 'session-reader'
      );
      expect(allowed).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // 测试 2：无权限时 workflow 被拒绝
  // ----------------------------------------------------------
  describe('无权限时 workflow 被拒绝', () => {
    it('当 action 触发 hard rule 时，workflow 不应执行', async () => {
      let gateExecuted = false;

      const definition = buildSimpleWorkflowDefinition('wf-denied-hard', async () => {
        gateExecuted = true;
        return { schema_version: '1.0', passed: true, reason: 'Should not reach here' };
      });

      workflowEngine.loadWorkflow(definition);
      const instance = workflowEngine.createInstance('wf-denied-hard');

      // gate.bypass 触发 hard-001 规则
      const result = await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, instance.id,
        'session-003', 'agent-malicious', 'gate', 'gate.bypass'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
      expect(gateExecuted).toBe(false);
    });

    it('权限拒绝时应返回包含 agentId 和 action 的错误信息', async () => {
      const definition = buildSimpleWorkflowDefinition('wf-denied-info', async () => {
        return { schema_version: '1.0', passed: true, reason: 'Should not reach here' };
      });

      workflowEngine.loadWorkflow(definition);
      const instance = workflowEngine.createInstance('wf-denied-info');

      const result = await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, instance.id,
        'session-004', 'agent-test', 'verification', 'verification.forge'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('agent-test');
      expect(result.error).toContain('verification.forge');
    });

    it('权限拒绝时 workflow 实例状态应保持 pending（未执行）', async () => {
      const definition = buildSimpleWorkflowDefinition('wf-denied-status', async () => {
        return { schema_version: '1.0', passed: true, reason: 'Should not reach here' };
      });

      workflowEngine.loadWorkflow(definition);
      const instance = workflowEngine.createInstance('wf-denied-status');

      // code.execute 触发 hard-005
      await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, instance.id,
        'session-005', 'agent-blocked', 'script', 'code.execute'
      );

      const finalInstance = workflowEngine.getInstance(instance.id);
      expect(finalInstance?.status).toBe('pending');
    });

    it('gate.bypass 操作应该被拒绝（hard rule hard-001）', () => {
      const allowed = permEngine.checkPermission(
        'agent-bypass', 'gate.bypass', 'gate', 'session-bypass'
      );
      expect(allowed).toBe(false);
    });

    it('verification.forge 操作应该被拒绝（hard rule hard-002）', () => {
      const allowed = permEngine.checkPermission(
        'agent-forge', 'verification.forge', 'verification', 'session-forge'
      );
      expect(allowed).toBe(false);
    });

    it('code.execute 操作应该被拒绝（hard rule hard-005）', () => {
      const allowed = permEngine.checkPermission(
        'agent-exec', 'code.execute', 'script', 'session-exec'
      );
      expect(allowed).toBe(false);
    });

    it('多次权限拒绝不影响其他 workflow 实例', async () => {
      let allowedGateExecuted = false;

      const deniedDef = buildSimpleWorkflowDefinition('wf-multi-denied', async () => {
        return { schema_version: '1.0', passed: true, reason: 'Should not reach here' };
      });
      const allowedDef = buildSimpleWorkflowDefinition('wf-multi-allowed', async () => {
        allowedGateExecuted = true;
        return { schema_version: '1.0', passed: true, reason: 'Allowed gate passed' };
      });

      workflowEngine.loadWorkflow(deniedDef);
      workflowEngine.loadWorkflow(allowedDef);

      const deniedInstance = workflowEngine.createInstance('wf-multi-denied');
      const allowedInstance = workflowEngine.createInstance('wf-multi-allowed');

      const deniedResult = await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, deniedInstance.id,
        'session-006', 'agent-bad', 'gate', 'gate.bypass'
      );

      const allowedResult = await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, allowedInstance.id,
        'session-007', 'agent-good', 'workflow', 'workflow.execute'
      );

      expect(deniedResult.success).toBe(false);
      expect(allowedResult.success).toBe(true);
      expect(allowedGateExecuted).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // 测试 3：权限事件记录（六字段验证）
  // ----------------------------------------------------------
  describe('权限事件记录（permission.evaluated 六字段）', () => {
    it('权限检查应产生 permission.evaluated 事件', async () => {
      const definition = buildSimpleWorkflowDefinition('wf-event-basic', async () => {
        return { schema_version: '1.0', passed: true, reason: 'Gate passed' };
      });

      workflowEngine.loadWorkflow(definition);
      const instance = workflowEngine.createInstance('wf-event-basic');

      await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, instance.id,
        'session-evt-001', 'agent-evt', 'workflow', 'workflow.execute'
      );

      const events = permEngine.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe('permission.evaluated');
    });

    it('permission.evaluated 事件应包含 sessionId 字段', async () => {
      const definition = buildSimpleWorkflowDefinition('wf-event-session', async () => {
        return { schema_version: '1.0', passed: true, reason: 'Gate passed' };
      });

      workflowEngine.loadWorkflow(definition);
      const instance = workflowEngine.createInstance('wf-event-session');

      const sessionId = 'session-field-test-001';
      await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, instance.id,
        sessionId, 'agent-field-test', 'workflow', 'workflow.execute'
      );

      const events = permEngine.getEvents();
      expect(events[0].payload.sessionId).toBe(sessionId);
    });

    it('permission.evaluated 事件应包含 agentId 字段', async () => {
      const definition = buildSimpleWorkflowDefinition('wf-event-agent', async () => {
        return { schema_version: '1.0', passed: true, reason: 'Gate passed' };
      });

      workflowEngine.loadWorkflow(definition);
      const instance = workflowEngine.createInstance('wf-event-agent');

      const agentId = 'agent-field-test-unique';
      await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, instance.id,
        'session-agent-field', agentId, 'workflow', 'workflow.execute'
      );

      const events = permEngine.getEvents();
      expect(events[0].payload.agentId).toBe(agentId);
    });

    it('permission.evaluated 事件应包含 resource 字段', async () => {
      const definition = buildSimpleWorkflowDefinition('wf-event-resource', async () => {
        return { schema_version: '1.0', passed: true, reason: 'Gate passed' };
      });

      workflowEngine.loadWorkflow(definition);
      const instance = workflowEngine.createInstance('wf-event-resource');

      const resource = 'spec';
      await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, instance.id,
        'session-resource-field', 'agent-resource-test', resource, 'spec.read'
      );

      const events = permEngine.getEvents();
      expect(events[0].payload.resource).toBe(resource);
    });

    it('permission.evaluated 事件应包含 action 字段', async () => {
      const definition = buildSimpleWorkflowDefinition('wf-event-action', async () => {
        return { schema_version: '1.0', passed: true, reason: 'Gate passed' };
      });

      workflowEngine.loadWorkflow(definition);
      const instance = workflowEngine.createInstance('wf-event-action');

      const action = 'workflow.execute';
      await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, instance.id,
        'session-action-field', 'agent-action-test', 'workflow', action
      );

      const events = permEngine.getEvents();
      expect(events[0].payload.action).toBe(action);
    });

    it('permission.evaluated 事件应包含 decision 字段（allow/deny）', async () => {
      // allow 决策
      const allowDef = buildSimpleWorkflowDefinition('wf-event-decision-allow', async () => {
        return { schema_version: '1.0', passed: true, reason: 'Gate passed' };
      });
      workflowEngine.loadWorkflow(allowDef);
      const allowInstance = workflowEngine.createInstance('wf-event-decision-allow');

      await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, allowInstance.id,
        'session-decision-allow', 'agent-allow', 'workflow', 'workflow.execute'
      );

      expect(permEngine.getEvents()[0].payload.decision).toBe('allow');

      permEngine.clearEvents();

      // deny 决策
      const denyDef = buildSimpleWorkflowDefinition('wf-event-decision-deny', async () => {
        return { schema_version: '1.0', passed: true, reason: 'Should not reach here' };
      });
      workflowEngine.loadWorkflow(denyDef);
      const denyInstance = workflowEngine.createInstance('wf-event-decision-deny');

      await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, denyInstance.id,
        'session-decision-deny', 'agent-deny', 'gate', 'gate.bypass'
      );

      expect(permEngine.getEvents()[0].payload.decision).toBe('deny');
    });

    it('permission.evaluated 事件应包含 reason 字段（非空字符串）', async () => {
      const definition = buildSimpleWorkflowDefinition('wf-event-reason', async () => {
        return { schema_version: '1.0', passed: true, reason: 'Gate passed' };
      });

      workflowEngine.loadWorkflow(definition);
      const instance = workflowEngine.createInstance('wf-event-reason');

      await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, instance.id,
        'session-reason-field', 'agent-reason-test', 'workflow', 'workflow.execute'
      );

      const events = permEngine.getEvents();
      expect(events[0].payload.reason).toBeTruthy();
      expect(typeof events[0].payload.reason).toBe('string');
      expect(events[0].payload.reason.length).toBeGreaterThan(0);
    });

    it('permission.evaluated 事件应同时包含全部六个字段', async () => {
      const definition = buildSimpleWorkflowDefinition('wf-event-all-fields', async () => {
        return { schema_version: '1.0', passed: true, reason: 'Gate passed' };
      });

      workflowEngine.loadWorkflow(definition);
      const instance = workflowEngine.createInstance('wf-event-all-fields');

      const sessionId = 'session-all-fields-001';
      const agentId = 'agent-all-fields';
      const resource = 'workflow';
      const action = 'workflow.execute';

      await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, instance.id,
        sessionId, agentId, resource, action
      );

      const events = permEngine.getEvents();
      expect(events).toHaveLength(1);
      const evt = events[0];

      // 验证六字段全部存在且有值
      expect(evt.payload.sessionId).toBe(sessionId);            // 字段 1: sessionId
      expect(evt.payload.agentId).toBe(agentId);               // 字段 2: agentId
      expect(evt.payload.resource).toBe(resource);             // 字段 3: resource
      expect(evt.payload.action).toBe(action);                 // 字段 4: action
      expect(evt.payload.decision).toMatch(/^(allow|deny)$/);  // 字段 5: decision
      expect(evt.payload.reason).toBeTruthy();                 // 字段 6: reason
    });

    it('每次权限检查都应产生独立的事件记录', async () => {
      const def1 = buildSimpleWorkflowDefinition('wf-multi-event-1', async () => {
        return { schema_version: '1.0', passed: true, reason: 'Gate 1 passed' };
      });
      const def2 = buildSimpleWorkflowDefinition('wf-multi-event-2', async () => {
        return { schema_version: '1.0', passed: true, reason: 'Gate 2 passed' };
      });

      workflowEngine.loadWorkflow(def1);
      workflowEngine.loadWorkflow(def2);

      const instance1 = workflowEngine.createInstance('wf-multi-event-1');
      const instance2 = workflowEngine.createInstance('wf-multi-event-2');

      await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, instance1.id,
        'session-multi-1', 'agent-multi-1', 'workflow', 'workflow.execute'
      );

      await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, instance2.id,
        'session-multi-2', 'agent-multi-2', 'spec', 'spec.read'
      );

      const events = permEngine.getEvents();
      expect(events).toHaveLength(2);
      expect(events[0].payload.agentId).toBe('agent-multi-1');
      expect(events[1].payload.agentId).toBe('agent-multi-2');
    });

    it('权限拒绝时也应产生 permission.evaluated 事件（decision=deny）', async () => {
      const definition = buildSimpleWorkflowDefinition('wf-deny-event', async () => {
        return { schema_version: '1.0', passed: true, reason: 'Should not reach here' };
      });

      workflowEngine.loadWorkflow(definition);
      const instance = workflowEngine.createInstance('wf-deny-event');

      await executeWorkflowWithPermissionCheck(
        workflowEngine, permEngine, instance.id,
        'session-deny-event', 'agent-deny-event', 'gate', 'gate.bypass'
      );

      const events = permEngine.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe('permission.evaluated');
      expect(events[0].payload.decision).toBe('deny');
      expect(events[0].payload.sessionId).toBe('session-deny-event');
      expect(events[0].payload.agentId).toBe('agent-deny-event');
    });
  });
});
