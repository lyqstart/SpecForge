/**
 * PrincipalResolver.ts — Principal 解析器
 *
 * 将 daemon-core tool handler 的 context.agent 字符串
 * 解析为统一的 Principal 对象。
 *
 * Phase 1 实现：基于静态映射表。
 * Phase 2+ 可能扩展为配置驱动。
 *
 * 设计决策（P4 §11）：
 * - Q2: user 不加入 ACTOR_ROLES，但仍可作为 Principal.source='user'
 * - Q3: sf-debugger / sf-investigator 继承 agent 权限
 * - unknown 不抛异常，不提升权限
 */

import type { ActorRole } from '@specforge/types/actor-roles';
import { ACTOR_ROLES } from '@specforge/types/actor-roles';
import type { AgentRole } from '@specforge/types/principal';
import type { Principal } from '@specforge/types/principal';

// Re-export for consumer convenience
export type { Principal } from '@specforge/types/principal';

// ---------------------------------------------------------------------------
// AgentRole mapping
// ---------------------------------------------------------------------------

/**
 * ActorRole → AgentRole 映射。
 *
 * 只有有对应 AgentRole 的 ActorRole 才在此映射中。
 * 未映射的 ActorRole 在 Principal 中 agentRole=null。
 */
const ACTOR_TO_AGENT_ROLE: Readonly<Partial<Record<ActorRole, AgentRole>>> = {
  [ACTOR_ROLES.orchestrator]: 'orchestrator',
};

// ---------------------------------------------------------------------------
// PrincipalResolver
// ---------------------------------------------------------------------------

/**
 * 将 context.agent 字符串解析为 Principal 对象。
 *
 * 映射规则：
 * 1. 'sf-orchestrator' → actorRole='sf-orchestrator', agentRole='orchestrator', source='tool_call'
 * 2. undefined / '' → actorRole='agent', agentRole=null, source='internal'
 * 3. 已知 ACTOR_ROLES 值 → actorRole=对应值, agentRole=null, source='tool_call'
 * 4. unknown → actorRole='agent', agentRole=null, source='internal'（不抛异常，不提升权限）
 */
export class PrincipalResolver {
  /**
   * 解析 context.agent 为 Principal。
   *
   * @param contextAgent context.agent 字符串（来自 daemon-core tool handler）
   * @param sessionId 可选的会话 ID
   * @returns 解析后的 Principal
   */
  resolve(contextAgent: string | undefined, sessionId?: string): Principal {
    // Case 2: undefined or empty
    if (contextAgent === undefined || contextAgent === '') {
      return {
        actorRole: 'agent',
        agentRole: null,
        ...(sessionId !== undefined && { sessionId }),
        source: 'internal',
      };
    }

    // Case 1 & 3: known ACTOR_ROLES value
    const knownRoles = new Set<string>(Object.values(ACTOR_ROLES));
    if (knownRoles.has(contextAgent)) {
      const actorRole = contextAgent as ActorRole;
      return {
        actorRole,
        agentRole: ACTOR_TO_AGENT_ROLE[actorRole] ?? null,
        ...(sessionId !== undefined && { sessionId }),
        source: 'tool_call',
      };
    }

    // Case 4: unknown — do not elevate permissions
    return {
      actorRole: 'agent',
      agentRole: null,
      ...(sessionId !== undefined && { sessionId }),
      source: 'internal',
    };
  }
}

/**
 * 创建 PrincipalResolver 实例。
 */
export function createPrincipalResolver(): PrincipalResolver {
  return new PrincipalResolver();
}
