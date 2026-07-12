/**
 * Tool Dispatcher
 * Routes tool invoke requests to handler functions.
 *
 * OBS-FULL Layer 1:
 * - records daemon dispatcher ingress/routing/success/error;
 * - preserves existing RBAC behavior.
 */
import { resolveToolPermission, extractActor, extractEnableRBAC } from './lib/tool-permissions';
import { recordDaemonObservation } from '../observability/observability-recorder';
import { createSfTraceId, getTraceIdFromContext } from '../observability/trace';
import { guardHardStop } from './lib/hard-stop-latch';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

export interface ToolInvokeRequest {
  tool: string;
  args: Record<string, unknown>;
  context?:
    | {
        sessionID?: string;
        agent?: string;
        directory?: string;
        worktree?: string;
        projectPath?: string;
        trace_id?: string;
      }
    | Record<string, unknown>;
}

export interface ToolDeps {
  stateManager: any;
  workflowEngine: any;
  projectManager: any;
  eventLogger: any;
  eventBus: any;
  permissionEngine: any;
  cas: any;
  sessionRegistry: any;
}

type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolInvokeRequest['context'],
  deps: ToolDeps
) => Promise<unknown>;

const HANDLER_TABLE: Record<string, ToolHandler> = {};

export function registerHandler(toolName: string, handler: ToolHandler): void {
  HANDLER_TABLE[toolName] = handler;
}

export function getHandler(toolName: string): ToolHandler | undefined {
  return HANDLER_TABLE[toolName];
}

function extractWorkItemId(args: Record<string, unknown>): string | undefined {
  const candidates = [args.work_item_id, args.workItemId, args.work_item, args.wi, args.id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
  }
  return undefined;
}

const TERMINAL_WORK_ITEM_STATES = new Set(['closed', 'rejected', 'superseded']);

interface HardStopContext {
  resolvedWorkItemId?: string;
  activeWorkItemIds: string[];
}

function resolveHardStopContext(
  projectRoot: string,
  explicitWorkItemId: string | undefined
): HardStopContext {
  if (explicitWorkItemId) {
    return { resolvedWorkItemId: explicitWorkItemId, activeWorkItemIds: [] };
  }

  try {
    const runtimeState = JSON.parse(
      fs.readFileSync(path.join(projectRoot, SPEC_DIR_NAME, 'runtime', 'state.json'), 'utf8')
    );
    const activeWorkItemIds = (Array.isArray(runtimeState?.workItems) ? runtimeState.workItems : [])
      .filter((item: any) => typeof item?.work_item_id === 'string')
      .filter(
        (item: any) =>
          !TERMINAL_WORK_ITEM_STATES.has(String(item?.current_state ?? item?.status ?? ''))
      )
      .map((item: any) => String(item.work_item_id));

    return {
      resolvedWorkItemId: activeWorkItemIds.length === 1 ? activeWorkItemIds[0] : undefined,
      activeWorkItemIds,
    };
  } catch {
    return { activeWorkItemIds: [] };
  }
}

export class ToolDispatcher {
  private deps: ToolDeps;

  constructor(deps: ToolDeps) {
    this.deps = deps;
  }

  async dispatch(req: ToolInvokeRequest): Promise<unknown> {
    const ctx = req.context;
    const trace_id = getTraceIdFromContext(ctx) ?? createSfTraceId();
    const started = Date.now();
    const work_item_id = extractWorkItemId(req.args);

    recordDaemonObservation({
      context: ctx,
      category: 'dispatcher',
      phase: 'dispatch.received',
      trace_id,
      tool_name: req.tool,
      work_item_id,
      status: 'received',
      payload: {
        tool: req.tool,
        args: req.args,
        context: ctx,
      },
      metadata: {
        registered_tool_count: Object.keys(HANDLER_TABLE).length,
      },
    });

    const handler = HANDLER_TABLE[req.tool];
    if (!handler) {
      const error = new Error(`Unknown tool: ${req.tool}`);
      recordDaemonObservation({
        context: ctx,
        category: 'dispatcher',
        phase: 'dispatch.handler_missing',
        trace_id,
        tool_name: req.tool,
        work_item_id,
        status: 'error',
        error: {
          message: error.message,
          registered_tools: Object.keys(HANDLER_TABLE),
        },
        force: true,
      });
      throw error;
    }

    const actor = extractActor(ctx);
    const enableRBAC = extractEnableRBAC(ctx);
    const decision = resolveToolPermission({
      tool: req.tool,
      actor,
      enableRBAC,
    });

    recordDaemonObservation({
      context: ctx,
      category: 'dispatcher',
      phase: 'dispatch.rbac',
      trace_id,
      tool_name: req.tool,
      work_item_id,
      status: decision.allowed ? 'allowed' : 'denied',
      payload: {
        actor,
        enableRBAC,
        decision,
      },
    });

    if (!decision.allowed) {
      return {
        success: false,
        error: decision.reason,
        denied: true,
      };
    }

    const projectRoot =
      (typeof ctx?.directory === 'string' && ctx.directory) ||
      (typeof ctx?.worktree === 'string' && ctx.worktree) ||
      (typeof ctx?.projectPath === 'string' && ctx.projectPath) ||
      process.cwd();

    const hardStopContext = resolveHardStopContext(projectRoot, work_item_id);

    // Project-scoped HardStop is independent of WI resolution and must be
    // enforced even when no active WI exists or several WIs are active.
    const projectHardStopGuard = guardHardStop(projectRoot, '', req.tool);
    if (!projectHardStopGuard.allowed) {
      const result = {
        success: false,
        error: projectHardStopGuard.error,
        hard_stop: true,
        hard_stop_record: projectHardStopGuard.hard_stop_record,
        work_item_id: undefined,
      };

      recordDaemonObservation({
        context: ctx,
        category: 'dispatcher',
        phase: 'dispatch.hard_stop',
        trace_id,
        tool_name: req.tool,
        work_item_id: undefined,
        status: 'denied',
        payload: result,
        force: true,
      });
      return result;
    }

    // A work-item-scoped HardStop must not be bypassed merely because several
    // active WIs make implicit context resolution ambiguous. The caller can
    // still operate on an unrelated WI by passing that WI explicitly.
    if (!work_item_id && hardStopContext.activeWorkItemIds.length > 1) {
      const blockedWorkItemIds = hardStopContext.activeWorkItemIds.filter(
        activeWorkItemId => !guardHardStop(projectRoot, activeWorkItemId, req.tool).allowed
      );

      if (blockedWorkItemIds.length > 0) {
        const result = {
          success: false,
          error:
            'HARD_STOP_CONTEXT_AMBIGUOUS: multiple active work items exist and at least one ' +
            'has an unresolved HardStop. Pass an explicit work_item_id before invoking a ' +
            `write or governance-advancing tool. Blocked work items: ${blockedWorkItemIds.join(', ')}.`,
          hard_stop: true,
          blocked_work_item_ids: blockedWorkItemIds,
          active_work_item_ids: hardStopContext.activeWorkItemIds,
        };

        recordDaemonObservation({
          context: ctx,
          category: 'dispatcher',
          phase: 'dispatch.hard_stop',
          trace_id,
          tool_name: req.tool,
          work_item_id,
          status: 'denied',
          payload: result,
          force: true,
        });
        return result;
      }
    }

    const relevantWorkItemId = hardStopContext.resolvedWorkItemId;
    const hardStopGuard = guardHardStop(projectRoot, relevantWorkItemId ?? '', req.tool);
    if (!hardStopGuard.allowed) {
      const result = {
        success: false,
        error: hardStopGuard.error,
        hard_stop: true,
        hard_stop_record: hardStopGuard.hard_stop_record,
        work_item_id: relevantWorkItemId,
      };

      recordDaemonObservation({
        context: ctx,
        category: 'dispatcher',
        phase: 'dispatch.hard_stop',
        trace_id,
        tool_name: req.tool,
        work_item_id: relevantWorkItemId,
        status: 'denied',
        payload: result,
        force: true,
      });
      return result;
    }

    try {
      const result = await handler(req.args, { ...(ctx ?? {}), trace_id }, this.deps);
      recordDaemonObservation({
        context: ctx,
        category: 'dispatcher',
        phase: 'dispatch.completed',
        trace_id,
        tool_name: req.tool,
        handler_name: req.tool,
        work_item_id,
        status: 'success',
        duration_ms: Date.now() - started,
        payload: result,
      });
      return result;
    } catch (err) {
      recordDaemonObservation({
        context: ctx,
        category: 'dispatcher',
        phase: 'dispatch.error',
        trace_id,
        tool_name: req.tool,
        handler_name: req.tool,
        work_item_id,
        status: 'error',
        duration_ms: Date.now() - started,
        error: {
          name: (err as Error).name,
          message: (err as Error).message,
          stack: (err as Error).stack,
        },
        force: true,
      });
      throw err;
    }
  }

  listRegisteredTools(): string[] {
    return Object.keys(HANDLER_TABLE);
  }
}
