/**
 * Tool Registry Integration Example
 * 
 * 本文件展示 plugin-loader 如何与 Tool Registry 集成，
 * 包括插件如何注册工具以及工具调用流程。
 * 
 * 对应任务：8.3.2 编写与 Tool Registry 集成示例
 * 
 * 目录：
 *   1. PluginTool 接口定义
 *   2. 工具注册流程
 *   3. 工具调用流程
 *   4. 完整集成示例
 */

// ============================================================================
// 1. PluginTool 接口定义
// ============================================================================

/**
 * 插件暴露的工具接口
 * 
 * 插件可以通过声明 `tools` 字段来暴露可调用的工具。
 * 这些工具会被注册到 Daemon 的 Tool Registry 中。
 */
export interface PluginTool {
  /** 工具唯一标识符（建议使用 pluginId:toolName 格式） */
  id: string;
  
  /** 工具显示名称（用于日志和调试） */
  displayName: string;
  
  /** 工具描述 */
  description?: string;
  
  /** 工具参数类型定义（JSON Schema 格式） */
  inputSchema?: object;
  
  /** 工具返回类型定义（JSON Schema 格式） */
  outputSchema?: object;
  
  /** 工具处理函数 */
  execute: (args: Record<string, unknown>) => Promise<unknown>;
  
  /** 工具所需的权限（用于授权检查） */
  requiredPermissions?: Array<
    | 'filesystem.read'
    | 'filesystem.write'
    | 'network'
    | 'child_process'
    | 'env.read'
  >;
  
  /** 是否为异步工具 */
  isAsync?: boolean;
}

/**
 * 插件工具注册配置
 */
export interface PluginToolRegistration {
  pluginId: string;
  tools: PluginTool[];
}

// ============================================================================
// 2. 工具注册流程
// ============================================================================

/**
 * 工具注册器接口
 * 
 * 定义 Tool Registry 的标准接口，plugin-loader 通过此接口注册工具。
 */
export interface ToolRegistry {
  /**
   * 注册工具
   * 
   * @param tool - 要注册的工具
   * @returns 注册成功返回 true，否则返回 false
   */
  register(tool: PluginTool): boolean;
  
  /**
   * 批量注册工具
   * 
   * @param tools - 要注册的工具数组
   * @returns 成功注册的数量
   */
  registerMany(tools: PluginTool[]): number;
  
  /**
   * 注销工具
   * 
   * @param toolId - 工具 ID
   * @returns 注销成功返回 true
   */
  unregister(toolId: string): boolean;
  
  /**
   * 获取工具
   * 
   * @param toolId - 工具 ID
   * @returns 工具实例或 null
   */
  get(toolId: string): PluginTool | null;
  
  /**
   * 列出所有已注册工具
   * 
   * @returns 工具数组
   */
  list(): PluginTool[];
  
  /**
   * 按插件 ID 查找工具
   * 
   * @param pluginId - 插件 ID
   * @returns 该插件注册的工具数组
   */
  findByPlugin(pluginId: string): PluginTool[];
  
  /**
   * 检查工具是否存在
   * 
   * @param toolId - 工具 ID
   * @returns 是否存在
   */
  has(toolId: string): boolean;
}

/**
 * 内存工具注册表实现（示例）
 * 
 * 这是一个简单的内存实现，生产环境可能使用更复杂的存储。
 */
export class InMemoryToolRegistry implements ToolRegistry {
  private tools: Map<string, PluginTool> = new Map();
  private pluginIndex: Map<string, Set<string>> = new Map();
  
  register(tool: PluginTool): boolean {
    if (this.tools.has(tool.id)) {
      console.warn(`[ToolRegistry] Tool ${tool.id} already registered, skipping`);
      return false;
    }
    
    this.tools.set(tool.id, tool);
    
    // 更新插件索引
    const pluginId = this.extractPluginId(tool.id);
    if (pluginId) {
      if (!this.pluginIndex.has(pluginId)) {
        this.pluginIndex.set(pluginId, new Set());
      }
      this.pluginIndex.get(pluginId)!.add(tool.id);
    }
    
    console.log(`[ToolRegistry] Registered tool: ${tool.id}`);
    return true;
  }
  
  registerMany(tools: PluginTool[]): number {
    let count = 0;
    for (const tool of tools) {
      if (this.register(tool)) {
        count++;
      }
    }
    return count;
  }
  
  unregister(toolId: string): boolean {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return false;
    }
    
    this.tools.delete(toolId);
    
    // 更新插件索引
    const pluginId = this.extractPluginId(toolId);
    if (pluginId) {
      this.pluginIndex.get(pluginId)?.delete(toolId);
    }
    
    console.log(`[ToolRegistry] Unregistered tool: ${toolId}`);
    return true;
  }
  
  get(toolId: string): PluginTool | null {
    return this.tools.get(toolId) ?? null;
  }
  
  list(): PluginTool[] {
    return Array.from(this.tools.values());
  }
  
  findByPlugin(pluginId: string): PluginTool[] {
    const toolIds = this.pluginIndex.get(pluginId);
    if (!toolIds) {
      return [];
    }
    return Array.from(toolIds)
      .map(id => this.tools.get(id))
      .filter((t): t is PluginTool => t !== undefined);
  }
  
  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }
  
  /**
   * 从工具 ID 中提取插件 ID
   * 
   * 约定：工具 ID 格式为 `pluginId:toolName`
   */
  private extractPluginId(toolId: string): string | null {
    const colonIndex = toolId.indexOf(':');
    if (colonIndex === -1) {
      return null;
    }
    return toolId.substring(0, colonIndex);
  }
}

// ============================================================================
// 3. 工具调用流程
// ============================================================================

/**
 * 工具调用请求
 */
export interface ToolCallRequest {
  toolId: string;
  args: Record<string, unknown>;
  sessionId?: string;
  correlationId?: string;
}

/**
 * 工具调用结果
 */
export interface ToolCallResult {
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
  executionTimeMs: number;
}

/**
 * 工具调用器
 * 
 * 负责执行工具调用，包含参数验证、权限检查和结果处理。
 */
export class ToolInvoker {
  constructor(
    private registry: ToolRegistry,
    private permissionChecker?: PermissionChecker
  ) {}
  
  /**
   * 调用工具
   * 
   * 完整调用流程：
   * 1. 查找工具
   * 2. 验证参数
   * 3. 检查权限
   * 4. 执行工具
   * 5. 返回结果
   */
  async invoke(request: ToolCallRequest): Promise<ToolCallResult> {
    const startTime = Date.now();
    
    // 1. 查找工具
    const tool = this.registry.get(request.toolId);
    if (!tool) {
      return {
        success: false,
        error: {
          code: 'TOOL_NOT_FOUND',
          message: `Tool ${request.toolId} not found`,
        },
        executionTimeMs: Date.now() - startTime,
      };
    }
    
    // 2. 验证参数（如果有 schema）
    if (tool.inputSchema) {
      const validationResult = this.validateInput(tool.inputSchema, request.args);
      if (!validationResult.valid) {
        return {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: `Invalid input: ${validationResult.errors.join(', ')}`,
          },
          executionTimeMs: Date.now() - startTime,
        };
      }
    }
    
    // 3. 检查权限
    if (tool.requiredPermissions && this.permissionChecker) {
      const permissionResult = await this.permissionChecker.checkPermissions(
        request.sessionId,
        tool.requiredPermissions
      );
      if (!permissionResult.allowed) {
        return {
          success: false,
          error: {
            code: 'PERMISSION_DENIED',
            message: `Missing permissions: ${permissionResult.missing.join(', ')}`,
          },
          executionTimeMs: Date.now() - startTime,
        };
      }
    }
    
    // 4. 执行工具
    try {
      const result = await tool.execute(request.args);
      return {
        success: true,
        result,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'TOOL_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
        executionTimeMs: Date.now() - startTime,
      };
    }
  }
  
  /**
   * 验证输入参数
   */
  private validateInput(schema: object, args: Record<string, unknown>): {
    valid: boolean;
    errors: string[];
  } {
    // 简化实现：实际应使用 JSON Schema 验证库
    // 这里仅做示例展示
    return { valid: true, errors: [] };
  }
}

/**
 * 权限检查器接口
 */
export interface PermissionChecker {
  checkPermissions(
    sessionId: string | undefined,
    requiredPermissions: string[]
  ): Promise<{ allowed: boolean; missing: string[] }>;
}

// ============================================================================
// 4. 完整集成示例
// ============================================================================

/**
 * 插件工具管理器
 * 
 * 负责将已加载的插件中的工具注册到 Tool Registry。
 * 这是 plugin-loader 与 Tool Registry 集成的核心组件。
 */
export class PluginToolManager {
  constructor(
    private registry: ToolRegistry,
    private permissionChecker?: PermissionChecker
  ) {}
  
  /**
   * 从已加载插件注册工具
   * 
   * 插件清单中可以声明 `tools` 字段，描述暴露的工具。
   * 本方法解析该字段并注册到 Tool Registry。
   */
  async registerToolsFromPlugin(plugin: {
    id: string;
    manifest: {
      tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: object;
        outputSchema?: object;
        requiredPermissions?: string[];
        handler: string; // 指向插件模块中的导出函数名
      }>;
    };
    module: Record<string, unknown>;
  }): Promise<number> {
    if (!plugin.manifest.tools || plugin.manifest.tools.length === 0) {
      return 0;
    }
    
    const tools: PluginTool[] = [];
    
    for (const toolDecl of plugin.manifest.tools) {
      const handler = plugin.module[toolDecl.handler];
      
      if (typeof handler !== 'function') {
        console.warn(
          `[PluginToolManager] Plugin ${plugin.id}: handler ${toolDecl.handler} not found, skipping tool ${toolDecl.name}`
        );
        continue;
      }
      
      const tool: PluginTool = {
        id: `${plugin.id}:${toolDecl.name}`,
        displayName: toolDecl.name,
        description: toolDecl.description,
        inputSchema: toolDecl.inputSchema,
        outputSchema: toolDecl.outputSchema,
        execute: handler as (args: Record<string, unknown>) => Promise<unknown>,
        requiredPermissions: toolDecl.requiredPermissions as PluginTool['requiredPermissions'],
      };
      
      tools.push(tool);
    }
    
    return this.registry.registerMany(tools);
  }
  
  /**
   * 注销插件的所有工具
   * 
   * 当插件卸载时，调用此方法清理已注册的工具。
   */
  async unregisterToolsFromPlugin(pluginId: string): Promise<number> {
    const tools = this.registry.findByPlugin(pluginId);
    
    let count = 0;
    for (const tool of tools) {
      if (this.registry.unregister(tool.id)) {
        count++;
      }
    }
    
    return count;
  }
  
  /**
   * 创建工具调用器
   */
  createInvoker(): ToolInvoker {
    return new ToolInvoker(this.registry, this.permissionChecker);
  }
}

// ============================================================================
// 使用示例
// ============================================================================

/**
 * 完整集成示例代码
 * 
 * 以下展示如何将插件工具集成到 Daemon 的 Tool Registry 中。
 */
export async function exampleIntegration() {
  // 1. 创建 Tool Registry
  const registry = new InMemoryToolRegistry();
  
  // 2. 创建权限检查器（可选）
  const permissionChecker: PermissionChecker = {
    async checkPermissions(_sessionId, requiredPermissions) {
      // 简化实现：实际应从授权配置中检查
      const granted = ['filesystem.read', 'filesystem.write', 'network'];
      const missing = requiredPermissions.filter(p => !granted.includes(p));
      return {
        allowed: missing.length === 0,
        missing,
      };
    },
  };
  
  // 3. 创建 Plugin Tool Manager
  const toolManager = new PluginToolManager(registry, permissionChecker);
  
  // 4. 模拟已加载的插件
  const loadedPlugin = {
    id: 'github-integration',
    manifest: {
      id: 'github-integration',
      version: '1.0.0',
      requires: ['network', 'filesystem.read'],
      entry: './dist/index.js',
      tools: [
        {
          name: 'fetchPr',
          description: 'Fetch a GitHub Pull Request',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
              prNumber: { type: 'number' },
            },
            required: ['owner', 'repo', 'prNumber'],
          },
          requiredPermissions: ['network'],
          handler: 'fetchPr',
        },
        {
          name: 'listIssues',
          description: 'List GitHub Issues',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
              state: { type: 'string', enum: ['open', 'closed', 'all'] },
            },
            required: ['owner', 'repo'],
          },
          requiredPermissions: ['network'],
          handler: 'listIssues',
        },
      ],
    },
    module: {
      // 插件的实际处理函数
      fetchPr: async (args: Record<string, unknown>) => {
        const { owner, repo, prNumber } = args;
        // 实际调用 GitHub API
        return {
          owner,
          repo,
          prNumber,
          title: 'Example PR',
          state: 'open',
        };
      },
      listIssues: async (args: Record<string, unknown>) => {
        const { owner, repo, state = 'open' } = args;
        // 实际调用 GitHub API
        return {
          owner,
          repo,
          state,
          issues: [],
        };
      },
    },
  };
  
  // 5. 注册插件工具
  const registeredCount = await toolManager.registerToolsFromPlugin(loadedPlugin);
  console.log(`Registered ${registeredCount} tools from plugin ${loadedPlugin.id}`);
  
  // 6. 列出已注册工具
  console.log('\nRegistered tools:');
  for (const tool of registry.list()) {
    console.log(`  - ${tool.id}: ${tool.description}`);
  }
  
  // 7. 创建调用器并调用工具
  const invoker = toolManager.createInvoker();
  
  // 成功调用
  console.log('\nCalling tool: github-integration:fetchPr');
  const result1 = await invoker.invoke({
    toolId: 'github-integration:fetchPr',
    args: {
      owner: 'specforge',
      repo: 'specforge',
      prNumber: 42,
    },
  });
  console.log('Result:', JSON.stringify(result1, null, 2));
  
  // 工���不存在
  console.log('\nCalling non-existent tool:');
  const result2 = await invoker.invoke({
    toolId: 'nonexistent:tool',
    args: {},
  });
  console.log('Result:', JSON.stringify(result2, null, 2));
  
  // 8. 插件卸载时注销工具
  console.log('\nUnregistering plugin tools...');
  const unregisteredCount = await toolManager.unregisterToolsFromPlugin(loadedPlugin.id);
  console.log(`Unregistered ${unregisteredCount} tools`);
}

// ============================================================================
// 导出
// ============================================================================

// 注意：这里不需要再次导出，因为类定义时已经使用了 export 关键字
// 保持空，让 TypeScript 处理