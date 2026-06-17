/**
 * Tool Dispatcher
 * Routes tool invoke requests to handler functions.
 *
 * OBS-FULL Layer 1:
 * - records daemon dispatcher ingress/routing/success/error;
 * - preserves existing RBAC behavior.
 */
import {
  resolveToolPermission,
  extractActor,
  extractEnableRBAC,
} from "./lib/tool-permissions";
import { recordDaemonObservation } from "../observability/observability-recorder";
import { createSfTraceId, getTraceIdFromContext } from "../observability/trace";

export interface ToolInvokeRequest {
  tool: string;
  args: Record<string, unknown>;
  context?: {
    sessionID?: string;
    agent?: string;
    directory?: string;
    worktree?: string;
    projectPath?: string;
    trace_id?: string;
  } | Record<string, unknown>;
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
  context: ToolInvokeRequest["context"],
  deps: ToolDeps,
) => Promise<unknown>;

const HANDLER_TABLE: Record<string, ToolHandler> = {};

export function registerHandler(toolName: string, handler: ToolHandler): void {
  HANDLER_TABLE[toolName] = handler;
}

export function getHandler(toolName: string): ToolHandler | undefined {
  return HANDLER_TABLE[toolName];
}

function extractWorkItemId(args: Record<string, unknown>): string | undefined {
  const candidates = [
    args.work_item_id,
    args.workItemId,
    args.work_item,
    args.wi,
    args.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
  }
  return undefined;
}

export class ToolDispatcher {
  private deps: ToolDeps;

  constructor(deps: ToolDeps) {
    this.deps = deps;
  }

  async dispatch(req: ToolInvokeRequest): Promise<unknown> {
    const ctx = req.context as Record<string, unknown> | undefined;
    const trace_id = getTraceIdFromContext(ctx) ?? createSfTraceId();
    const started = Date.now();
    const work_item_id = extractWorkItemId(req.args);

    recordDaemonObservation({
      context: ctx,
      category: "dispatcher",
      phase: "dispatch.received",
      trace_id,
      tool_name: req.tool,
      work_item_id,
      status: "received",
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
        category: "dispatcher",
        phase: "dispatch.handler_missing",
        trace_id,
        tool_name: req.tool,
        work_item_id,
        status: "error",
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
      category: "dispatcher",
      phase: "dispatch.rbac",
      trace_id,
      tool_name: req.tool,
      work_item_id,
      status: decision.allowed ? "allowed" : "denied",
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

    try {
      const result = await handler(req.args, { ...(ctx ?? {}), trace_id }, this.deps);
      recordDaemonObservation({
        context: ctx,
        category: "dispatcher",
        phase: "dispatch.completed",
        trace_id,
        tool_name: req.tool,
        handler_name: req.tool,
        work_item_id,
        status: "success",
        duration_ms: Date.now() - started,
        payload: result,
      });
      return result;
    } catch (err) {
      recordDaemonObservation({
        context: ctx,
        category: "dispatcher",
        phase: "dispatch.error",
        trace_id,
        tool_name: req.tool,
        handler_name: req.tool,
        work_item_id,
        status: "error",
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
