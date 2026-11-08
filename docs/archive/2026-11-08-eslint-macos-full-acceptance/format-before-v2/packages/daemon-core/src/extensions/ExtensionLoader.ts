/**
 * Extension Loader - Daemon 扩展加载器层
 *
 * 本模块负责协调 Daemon 启动时加载各类扩展组件：
 * - Skill Loader
 * - Tool Registry
 * - Workflow Loader
 * - Gate Registry
 *
 * 这是一个统一入口，确保所有扩展在 Daemon 启动时正确初始化。
 */

import path from 'path';
import { existsSync } from 'fs';
import { resolveSpecForgeUserPath } from '@specforge/types/user-level-paths';
import { EventBus } from '../event-bus/EventBus';
import { Event } from '../types';

const CURRENT_WORKFLOW_FILE = 'feature_spec.json';
const CURRENT_WORKFLOW_SCHEMA_VERSION = '2.0';
const CURRENT_WORKFLOW_ID = 'feature_spec';

/**
 * 扩展类型
 */
export type ExtensionType = 
  | 'skill' 
  | 'tool' 
  | 'workflow' 
  | 'gate';

/**
 * 扩展加载状态
 */
export interface ExtensionLoadState {
  type: ExtensionType;
  name: string;
  loaded: boolean;
  error?: Error;
  loadTimeMs?: number;
  count?: number;
}

/**
 * 扩展加载结果
 */
export interface ExtensionLoadResult {
  success: boolean;
  extensions: ExtensionLoadState[];
  totalLoadTimeMs: number;
}

/**
 * 扩展加载器配置
 */
export interface ExtensionLoaderConfig {
  extensionsDir?: string;
  enabledExtensions?: {
    skill?: boolean;
     tool?: boolean;
     workflow?: boolean;
     gate?: boolean;
   };
  workflowEngine?: any;
}

/**
 * 创建默认扩展加载器配置
 */
export function createDefaultExtensionLoaderConfig(): Required<Omit<ExtensionLoaderConfig, 'workflowEngine'>> {
  return {
    extensionsDir: './extensions',
    enabledExtensions: {
      skill: true,
       tool: true,
       workflow: true,
       gate: true,
     },
  };
}

export const DEFAULT_EXTENSION_LOADER_CONFIG = createDefaultExtensionLoaderConfig();

/**
 * 扩展加载器
 * 
 * 负责在 Daemon 启动时加载所有扩展组件。
 * 支持按需加载和批量加载。
 * 
 * 使用示例：
 * ```typescript
 * const eventBus = new EventBus();
 * const loader = new ExtensionLoader({ eventBus });
 * 
 * // 加载所有扩展
 * const result = await loader.loadAll();
 * 
 * ```
 */
export class ExtensionLoader {
  private config: Required<Omit<ExtensionLoaderConfig, 'workflowEngine'>> & { workflowEngine?: any };
  private eventBus: EventBus;
  private extensionStates: Map<string, ExtensionLoadState> = new Map();
  private isLoaded: boolean = false;
  private workflowEngine: any;

  constructor(config: ExtensionLoaderConfig = {}, eventBus?: EventBus) {
    this.config = {
      extensionsDir: config.extensionsDir ?? DEFAULT_EXTENSION_LOADER_CONFIG.extensionsDir,
      enabledExtensions: {
        ...DEFAULT_EXTENSION_LOADER_CONFIG.enabledExtensions,
        ...config.enabledExtensions,
      },
    };
    
    this.eventBus = eventBus ?? new EventBus();
    this.workflowEngine = config.workflowEngine;
  }

  setWorkflowEngine(engine: any): void {
    this.workflowEngine = engine;
  }

  /**
   * 发布扩展加载事件
   */
  private publishEvent(state: ExtensionLoadState): void {
    const event: Event = {
      eventId: `ext-${state.type}-${Date.now()}`,
      ts: Date.now(),
      category: 'extension',
      action: state.loaded ? 'load' : 'load_failed',
      target: state.name,
      success: state.loaded,
      data: {
        type: state.type,
        error: state.error?.message,
        loadTimeMs: state.loadTimeMs,
      },
      payload: {
        type: state.type,
        name: state.name,
        loaded: state.loaded,
        error: state.error?.message,
        loadTimeMs: state.loadTimeMs,
      },
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    };
    
    this.eventBus.publish(event);
  }

  /**
   * 加载所有启用的扩展
   * 
   * @returns 扩展加载结果
   */
  async loadAll(): Promise<ExtensionLoadResult> {
    const startTime = Date.now();
    const extensions: ExtensionLoadState[] = [];
    let allSuccess = true;

    const loadOrder: ExtensionType[] = ['skill', 'tool', 'workflow', 'gate'];

    for (const type of loadOrder) {
      if (this.config.enabledExtensions[type] !== false) {
        try {
          const state = await this.loadByType(type);
          extensions.push(state);
          
          if (!state.loaded) {
            allSuccess = false;
          }
        } catch (error) {
          const state: ExtensionLoadState = {
            type,
            name: type,
            loaded: false,
            error: error instanceof Error ? error : new Error(String(error)),
          };
          extensions.push(state);
          this.publishEvent(state);
          allSuccess = false;
        }
      }
    }

    const totalLoadTimeMs = Date.now() - startTime;
    this.isLoaded = allSuccess;

    return {
      success: allSuccess,
      extensions,
      totalLoadTimeMs,
    };
  }

  /**
   * 加载指定类型的扩展
   * 
   * @param type 扩展类型
   * @returns 扩展加载状态
   */
  async loadByType(type: ExtensionType): Promise<ExtensionLoadState> {
    const startTime = Date.now();
    const key = `${type}-${type}`; // name 默认为 type 本身

    try {
      let state: ExtensionLoadState;

      switch (type) {
        case 'skill':
          state = await this.loadSkills();
          break;
        case 'tool':
          state = await this.loadTools();
          break;
        case 'workflow':
          state = await this.loadWorkflows();
          break;
        case 'gate':
          state = await this.loadGates();
          break;
        default:
          throw new Error(`Unknown extension type: ${type}`);
      }

      state.loadTimeMs = Date.now() - startTime;
      this.extensionStates.set(key, state);
      this.publishEvent(state);

      return state;
    } catch (error) {
      const state: ExtensionLoadState = {
        type,
        name: type,
        loaded: false,
        error: error instanceof Error ? error : new Error(String(error)),
        loadTimeMs: Date.now() - startTime,
      };
      
      this.extensionStates.set(key, state);
      this.publishEvent(state);

      return state;
    }
  }

  /**
   * 加载 Skill 扩展
   * 
   * 占位实现：Skill Loader 尚未在本任务中实现
   */
  private async loadSkills(): Promise<ExtensionLoadState> {
    // TODO: 实现 Skill Loader 集成
    // 当前返回占位状态
    return {
      type: 'skill',
      name: 'skill-loader',
      loaded: true, // 占位：认为已加载
    };
  }

  /**
   * 加载 Tool 扩展
   * 
   * 占位实现：Tool Registry 尚未在本任务中实现
   */
  private async loadTools(): Promise<ExtensionLoadState> {
    // TODO: 实现 Tool Registry 集成
    return {
      type: 'tool',
      name: 'tool-registry',
      loaded: true,
    };
  }

  /**
   * 加载 Workflow 扩展
   * 
   * 占位实现：Workflow Loader 尚未在本任务中实现
   */
  private async loadWorkflows(): Promise<ExtensionLoadState> {
    const startTs = Date.now();
    try {
      const { WorkflowDefinitionLoader } = await import('@specforge/workflow-runtime');
      const loader = new WorkflowDefinitionLoader();
      // Try multiple locations for workflow JSON files:
      // 1. Relative to binary location (production: <OpenCode config>/sf-user/workflows/builtin)
      // 2. Relative to cwd (development: configs/workflows/builtin)
      // 3. SpecForge project root (development)
      const candidateDirs: string[] = [
        resolveSpecForgeUserPath('workflows', 'builtin'),
        path.resolve(process.cwd(), 'configs/workflows/builtin'),
        path.resolve(__dirname, '../../../../configs/workflows/builtin'),
      ];
      const builtinDir = candidateDirs.find((directory) =>
        existsSync(path.join(directory, CURRENT_WORKFLOW_FILE)),
      );
      if (!builtinDir) {
        throw new Error(
          `Current workflow ${CURRENT_WORKFLOW_FILE} not found in: ${candidateDirs.join(', ')}`,
        );
      }

      const workflowPath = path.join(builtinDir, CURRENT_WORKFLOW_FILE);
      const definition = await loader.loadFromFile(workflowPath);
      if (definition.id !== CURRENT_WORKFLOW_ID) {
        throw new Error(
          `Current workflow id mismatch: expected ${CURRENT_WORKFLOW_ID}, received ${definition.id}`,
        );
      }
      if (String(definition.schema_version) !== CURRENT_WORKFLOW_SCHEMA_VERSION) {
        throw new Error(
          `Current workflow schema mismatch: expected ${CURRENT_WORKFLOW_SCHEMA_VERSION}, received ${definition.schema_version}`,
        );
      }
      if (this.workflowEngine) {
        this.workflowEngine.registerDefinition(definition);
      }

      return {
        type: 'workflow',
        name: 'workflow-loader',
        loaded: true,
        count: 1,
        loadTimeMs: Date.now() - startTs,
      };
    } catch (err) {
      return {
        type: 'workflow',
        name: 'workflow-loader',
        loaded: false,
        error: err instanceof Error ? err : new Error(String(err)),
        loadTimeMs: Date.now() - startTs,
      };
    }
  }

  /**
   * 加载 Gate 扩展
   * 
   * 占位实现：Gate Registry 尚未在本任务中实现
   */
  private async loadGates(): Promise<ExtensionLoadState> {
    // TODO: 实现 Gate Registry 集成
    return {
      type: 'gate',
      name: 'gate-registry',
      loaded: true,
    };
  }

  /**
   * 获取所有扩展状态
   * 
   * @returns 扩展状态数组
   */
  getState(): ExtensionLoadState[] {
    return Array.from(this.extensionStates.values());
  }

  /**
   * 获取指定扩展状态
   * 
   * @param type 扩展类型
   * @param name 扩展名称
   * @returns 扩展状态（如果存在）
   */
  getExtensionState(type: ExtensionType, name: string): ExtensionLoadState | undefined {
    return this.extensionStates.get(`${type}-${name}`);
  }

  /**
   * 检查扩展是否已加载
   * 
   * @returns 是否所有扩展都已加载
   */
  isExtensionLoaded(): boolean {
    return this.isLoaded;
  }

}

/**
 * 创建扩展加载器实例
 * 
 * @param config 扩展加载器配置
 * @param eventBus EventBus 实例
 * @returns 扩展加载器实例
 */
export function createExtensionLoader(
  config: ExtensionLoaderConfig = {},
  eventBus?: EventBus
): ExtensionLoader {
  return new ExtensionLoader(config, eventBus);
}
