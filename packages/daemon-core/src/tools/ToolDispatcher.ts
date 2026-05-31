/**
 * Tool Dispatcher
 * Routes tool invoke requests to appropriate handler functions.
 * Each handler implements server-side logic for one sf_* tool.
 */

export interface ToolInvokeRequest {
  tool: string;
  args: Record<string, unknown>;
  context?: {
    sessionID?: string;
    agent?: string;
    directory?: string;
    worktree?: string;
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

type ToolHandler = (args: Record<string, unknown>, context: ToolInvokeRequest['context'], deps: ToolDeps) => Promise<unknown>;

const HANDLER_TABLE: Record<string, ToolHandler> = {};

export function registerHandler(toolName: string, handler: ToolHandler): void {
  HANDLER_TABLE[toolName] = handler;
}

export function getHandler(toolName: string): ToolHandler | undefined {
  return HANDLER_TABLE[toolName];
}

export class ToolDispatcher {
  private deps: ToolDeps;

  constructor(deps: ToolDeps) {
    this.deps = deps;
  }

  async dispatch(req: ToolInvokeRequest): Promise<unknown> {
    const handler = HANDLER_TABLE[req.tool];
    if (!handler) {
      throw new Error(`Unknown tool: ${req.tool}`);
    }

    // TODO: Permission check (once permission engine is integrated)
    // const decision = await this.deps.permissionEngine.evaluate({...});

    return await handler(req.args, req.context, this.deps);
  }

  listRegisteredTools(): string[] {
    return Object.keys(HANDLER_TABLE);
  }
}
