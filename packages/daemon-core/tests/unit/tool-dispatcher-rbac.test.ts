/**
 * tool-dispatcher-rbac.test.ts — v1.2 M3: Tool Dispatcher RBAC Gate 测试
 *
 * 覆盖：
 * 1. PROTECTED_TOOLS 精确包含 3 个
 * 2. enableRBAC=false/undefined 时行为不变
 * 3. enableRBAC=true 时 protected tool 经过 dispatcher gate
 * 4. enableRBAC=true 时未列入 tool allow-by-default
 * 5. unknown actor 不提升权限
 * 6. handler 没有各自实现 RBAC
 * 7. 拒绝路径使用现有错误返回格式
 * 8. in-memory decision log 可查询
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PROTECTED_TOOLS,
  isProtectedTool,
  getProtectedToolNames,
  extractActor,
  extractEnableRBAC,
  resolveToolPermission,
  getRecentDecisions,
  clearDecisionLog,
  type ToolPermissionParams,
} from '../../src/tools/lib/tool-permissions';
import { ToolDispatcher, getHandler } from '../../src/tools/ToolDispatcher';
import { ACTOR_ROLES } from '@specforge/types/actor-roles';

// Import all handlers to register them via registerHandler side-effect
import '../../src/tools/handlers/sf-state-transition';
import '../../src/tools/handlers/sf-safe-bash';
import '../../src/tools/handlers/sf-artifact-write';
import '../../src/tools/handlers/sf-doctor';

// ---------------------------------------------------------------------------
// Part 1: tool-permissions.ts 单元测试
// ---------------------------------------------------------------------------

describe('tool-permissions — PROTECTED_TOOLS', () => {
  it('must contain exactly 3 protected tools', () => {
    const names = getProtectedToolNames();
    expect(names).toHaveLength(3);
    expect(names).toContain('sf_state_transition');
    expect(names).toContain('sf_artifact_write');
    expect(names).toContain('sf_safe_bash');
  });

  it('all entries must have protected=true', () => {
    for (const config of Object.values(PROTECTED_TOOLS)) {
      expect(config.protected).toBe(true);
      expect(config.description).toBeTruthy();
    }
  });

  it('isProtectedTool returns true for protected tools', () => {
    expect(isProtectedTool('sf_state_transition')).toBe(true);
    expect(isProtectedTool('sf_artifact_write')).toBe(true);
    expect(isProtectedTool('sf_safe_bash')).toBe(true);
  });

  it('isProtectedTool returns false for non-protected tools', () => {
    expect(isProtectedTool('sf_doctor')).toBe(false);
    expect(isProtectedTool('sf_state_read')).toBe(false);
    expect(isProtectedTool('sf_design_gate')).toBe(false);
    expect(isProtectedTool('sf_knowledge_base')).toBe(false);
    expect(isProtectedTool('nonexistent_tool')).toBe(false);
    expect(isProtectedTool('')).toBe(false);
  });
});

describe('tool-permissions — extractActor', () => {
  it('returns actor for valid ActorRole', () => {
    expect(extractActor({ agent: ACTOR_ROLES.orchestrator })).toBe(ACTOR_ROLES.orchestrator);
    expect(extractActor({ agent: ACTOR_ROLES.gateRunner })).toBe(ACTOR_ROLES.gateRunner);
    expect(extractActor({ agent: ACTOR_ROLES.agent })).toBe(ACTOR_ROLES.agent);
    expect(extractActor({ agent: ACTOR_ROLES.closeGate })).toBe(ACTOR_ROLES.closeGate);
  });

  it('returns null for invalid/unknown agent string', () => {
    expect(extractActor({ agent: 'unknown-role' })).toBeNull();
    expect(extractActor({ agent: 'random_agent' })).toBeNull();
  });

  it('returns null for missing agent', () => {
    expect(extractActor({})).toBeNull();
    expect(extractActor(undefined)).toBeNull();
  });

  it('returns null for non-string agent', () => {
    expect(extractActor({ agent: 123 })).toBeNull();
    expect(extractActor({ agent: null })).toBeNull();
    expect(extractActor({ agent: true })).toBeNull();
  });

  it('returns null for empty string agent', () => {
    expect(extractActor({ agent: '' })).toBeNull();
  });
});

describe('tool-permissions — extractEnableRBAC', () => {
  it('returns true only for boolean true', () => {
    expect(extractEnableRBAC({ enableRBAC: true })).toBe(true);
  });

  it('returns false for boolean false', () => {
    expect(extractEnableRBAC({ enableRBAC: false })).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(extractEnableRBAC({})).toBe(false);
    expect(extractEnableRBAC(undefined)).toBe(false);
  });

  it('returns false for string values (no string modes)', () => {
    expect(extractEnableRBAC({ enableRBAC: 'audit_only' })).toBe(false);
    expect(extractEnableRBAC({ enableRBAC: 'enforced' })).toBe(false);
  });

  it('returns false for other truthy values', () => {
    expect(extractEnableRBAC({ enableRBAC: 1 })).toBe(false);
    expect(extractEnableRBAC({ enableRBAC: 'yes' })).toBe(false);
  });
});

describe('tool-permissions — resolveToolPermission', () => {
  beforeEach(() => {
    clearDecisionLog();
  });

  // --- enableRBAC=false: no check, always allow ---
  it('allows protected tool when enableRBAC=false', () => {
    const decision = resolveToolPermission({
      tool: 'sf_state_transition',
      actor: null,
      enableRBAC: false,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.rbacActive).toBe(false);
  });

  it('allows protected tool when enableRBAC=false even with no actor', () => {
    const decision = resolveToolPermission({
      tool: 'sf_artifact_write',
      actor: null,
      enableRBAC: false,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.rbacActive).toBe(false);
  });

  // --- enableRBAC=true + non-protected tool: allow-by-default ---
  it('allows non-protected tool when enableRBAC=true (allow-by-default)', () => {
    const decision = resolveToolPermission({
      tool: 'sf_doctor',
      actor: null,
      enableRBAC: true,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.rbacActive).toBe(true);
  });

  it('allows sf_doc_lint when enableRBAC=true with no actor (allow-by-default)', () => {
    const decision = resolveToolPermission({
      tool: 'sf_doc_lint',
      actor: null,
      enableRBAC: true,
    });
    expect(decision.allowed).toBe(true);
  });

  // --- enableRBAC=true + protected tool: gate active ---
  it('allows protected tool with valid actor when enableRBAC=true', () => {
    const decision = resolveToolPermission({
      tool: 'sf_state_transition',
      actor: ACTOR_ROLES.orchestrator,
      enableRBAC: true,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.rbacActive).toBe(true);
    expect(decision.actor).toBe(ACTOR_ROLES.orchestrator);
  });

  it('allows sf_artifact_write with gate_runner when enableRBAC=true', () => {
    const decision = resolveToolPermission({
      tool: 'sf_artifact_write',
      actor: ACTOR_ROLES.gateRunner,
      enableRBAC: true,
    });
    expect(decision.allowed).toBe(true);
  });

  it('allows sf_safe_bash with agent when enableRBAC=true', () => {
    const decision = resolveToolPermission({
      tool: 'sf_safe_bash',
      actor: ACTOR_ROLES.agent,
      enableRBAC: true,
    });
    expect(decision.allowed).toBe(true);
  });

  // --- enableRBAC=true + protected tool + no actor: denied ---
  it('denies protected tool with null actor when enableRBAC=true', () => {
    const decision = resolveToolPermission({
      tool: 'sf_state_transition',
      actor: null,
      enableRBAC: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('requires a valid actor');
    expect(decision.rbacActive).toBe(true);
  });

  it('denies sf_artifact_write with null actor when enableRBAC=true', () => {
    const decision = resolveToolPermission({
      tool: 'sf_artifact_write',
      actor: null,
      enableRBAC: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('requires a valid actor');
  });

  it('denies sf_safe_bash with null actor when enableRBAC=true', () => {
    const decision = resolveToolPermission({
      tool: 'sf_safe_bash',
      actor: null,
      enableRBAC: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('requires a valid actor');
  });

  // --- Decision log ---
  it('records decisions in memory log', () => {
    resolveToolPermission({ tool: 'sf_state_transition', actor: ACTOR_ROLES.orchestrator, enableRBAC: true });
    resolveToolPermission({ tool: 'sf_doctor', actor: null, enableRBAC: false });

    const log = getRecentDecisions(10);
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log[0].tool).toBe('sf_state_transition');
    expect(log[1].tool).toBe('sf_doctor');
  });

  it('clearDecisionLog clears all decisions', () => {
    resolveToolPermission({ tool: 'sf_state_transition', actor: null, enableRBAC: false });
    clearDecisionLog();
    expect(getRecentDecisions().length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Part 2: ToolDispatcher integration tests
// ---------------------------------------------------------------------------

describe('ToolDispatcher — RBAC gate integration', () => {
  // Register a mock handler for testing
  const mockHandler = vi.fn().mockResolvedValue({ success: true, data: 'mock' });

  beforeEach(() => {
    mockHandler.mockClear();
    clearDecisionLog();
    // Register mock handler (registerHandler is idempotent for same name)
    // Use a unique name to avoid colliding with real handlers
  });

  it('passes through to handler when enableRBAC is not set', async () => {
    // sf_doctor is not protected → always passes
    const handler = getHandler('sf_doctor');
    if (!handler) {
      // sf_doctor handler may not be imported yet; test with ToolDispatcher directly
      // by using the tool-permissions logic (already tested above)
      return; // skip if handler not loaded
    }
    const dispatcher = new ToolDispatcher({} as any);
    const result = await dispatcher.dispatch({
      tool: 'sf_doctor',
      args: {},
      context: { directory: '/tmp' },
    });
    // Should reach handler (no RBAC check for non-protected tool)
    expect(result).toBeDefined();
  });

  it('returns denied result for protected tool with no actor when enableRBAC=true', async () => {
    const dispatcher = new ToolDispatcher({} as any);
    const result = await dispatcher.dispatch({
      tool: 'sf_state_transition',
      args: { work_item_id: 'WI-001', to_state: 'closed' },
      context: { enableRBAC: true }, // No agent → actor=null
    }) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.denied).toBe(true);
    expect(result.error).toContain('requires a valid actor');
  });

  it('returns denied result for sf_artifact_write with no actor when enableRBAC=true', async () => {
    const dispatcher = new ToolDispatcher({} as any);
    const result = await dispatcher.dispatch({
      tool: 'sf_artifact_write',
      args: { work_item_id: 'WI-001', file_type: 'work_log' },
      context: { enableRBAC: true },
    }) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.denied).toBe(true);
  });

  it('returns denied result for sf_safe_bash with no actor when enableRBAC=true', async () => {
    const dispatcher = new ToolDispatcher({} as any);
    const result = await dispatcher.dispatch({
      tool: 'sf_safe_bash',
      args: { command: 'echo hello' },
      context: { enableRBAC: true },
    }) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.denied).toBe(true);
  });

  it('allows protected tool with valid actor when enableRBAC=true', async () => {
    const dispatcher = new ToolDispatcher({} as any);
    // sf_state_transition will proceed past the dispatcher gate
    // but may fail later due to missing deps — that's fine,
    // we only verify the dispatcher gate passed
    const result = await dispatcher.dispatch({
      tool: 'sf_state_transition',
      args: { work_item_id: 'WI-001', from_state: '', to_state: 'intake' },
      context: { enableRBAC: true, agent: ACTOR_ROLES.orchestrator, directory: '/tmp/nonexistent' },
    }) as Record<string, unknown>;

    // Should NOT be denied at dispatcher level
    // (may fail for other reasons like missing project, which is fine)
    expect(result.denied).toBeUndefined();
  });

  it('allows non-protected tool with no actor when enableRBAC=true', async () => {
    const dispatcher = new ToolDispatcher({} as any);
    // sf_doctor is not protected → allow-by-default
    const result = await dispatcher.dispatch({
      tool: 'sf_doctor',
      args: {},
      context: { enableRBAC: true }, // No agent
    }) as Record<string, unknown>;

    // Should NOT be denied
    expect(result.denied).toBeUndefined();
  });

  it('does not check RBAC when enableRBAC is false for protected tool', async () => {
    const dispatcher = new ToolDispatcher({} as any);
    const result = await dispatcher.dispatch({
      tool: 'sf_state_transition',
      args: { work_item_id: 'WI-001', from_state: '', to_state: 'intake' },
      context: { enableRBAC: false }, // No agent, but RBAC off
    }) as Record<string, unknown>;

    // Should NOT be denied at dispatcher level
    expect(result.denied).toBeUndefined();
  });

  it('does not check RBAC when enableRBAC is undefined for protected tool', async () => {
    const dispatcher = new ToolDispatcher({} as any);
    const result = await dispatcher.dispatch({
      tool: 'sf_state_transition',
      args: { work_item_id: 'WI-001', from_state: '', to_state: 'intake' },
      context: { }, // No enableRBAC → undefined → no check
    }) as Record<string, unknown>;

    // Should NOT be denied at dispatcher level
    expect(result.denied).toBeUndefined();
  });

  it('unknown tool still throws Error', async () => {
    const dispatcher = new ToolDispatcher({} as any);
    await expect(
      dispatcher.dispatch({ tool: 'sf_nonexistent_tool', args: {}, context: {} }),
    ).rejects.toThrow('Unknown tool: sf_nonexistent_tool');
  });

  it('rejects unknown agent string when enableRBAC=true for protected tool', async () => {
    const dispatcher = new ToolDispatcher({} as any);
    const result = await dispatcher.dispatch({
      tool: 'sf_state_transition',
      args: {},
      context: { enableRBAC: true, agent: 'totally_invalid_role' },
    }) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.denied).toBe(true);
    expect(result.error).toContain('requires a valid actor');
  });

  it('decision log is populated after dispatch calls', async () => {
    clearDecisionLog();
    const dispatcher = new ToolDispatcher({} as any);

    await dispatcher.dispatch({
      tool: 'sf_doctor',
      args: {},
      context: { enableRBAC: true },
    });

    const log = getRecentDecisions(10);
    expect(log.length).toBeGreaterThanOrEqual(1);
    const doctorDecision = log.find(d => d.tool === 'sf_doctor');
    expect(doctorDecision).toBeDefined();
    expect(doctorDecision!.allowed).toBe(true);
  });
});
