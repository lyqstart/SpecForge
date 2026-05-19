/**
 * Type declarations for @specforge/plugin-loader
 * These declarations allow daemon-core to use plugin-loader types without requiring a separate types package.
 */

declare module '@specforge/plugin-loader' {

import type { ZodType } from 'zod';

// Re-export common types from plugin-loader
// Since plugin-loader uses Zod for validation, we declare the types here

export type PluginPermission = 
  | 'filesystem.read'
  | 'filesystem.write'
  | 'network'
  | 'child_process'
  | 'env.read';

export interface PluginManifest {
  schema_version: string;
  id: string;
  version: string;
  requires: PluginPermission[];
  entry: string;
  description?: string;
  author?: string;
  compatible?: string;
  dependencies?: Array<{
    type: 'plugin' | 'library' | 'tool';
    id: string;
    version?: string;
  }>;
  permissions?: PluginPermission[]; // Alternative field name
}

export interface GrantsConfig {
  schema_version: string;
  grants: string[];
  plugins?: Record<string, string[]>;
}

export interface LoadedPlugin {
  id: string;
  version: string;
  manifest: PluginManifest;
  entryPath: string;
  module: unknown;
  loadedAt: number;
  lastUsedAt: number;
  stats: {
    loadCount: number;
    errorCount: number;
    totalExecutionTimeMs: number;
  };
}

export interface LoadError {
  code: string;
  message: string;
  details?: unknown;
  pluginId?: string;
}

export interface LoadResult {
  success: boolean;
  plugin?: LoadedPlugin;
  error?: LoadError;
}

export interface BatchLoadResult {
  success: boolean;
  loaded: LoadedPlugin[];
  failed: Array<{
    pluginId: string;
    error: LoadError;
  }>;
  total: number;
}

export interface PluginLoaderConfig {
  pluginDir?: string;
  manifestFileName?: string;
  recursive?: boolean;
  grants?: string[];
  registry?: Record<string, unknown>;
  staticAnalyzerOptions?: {
    strictMode?: boolean;
    ruleSet?: unknown;
  };
  enableStaticCheck?: boolean;
  enablePermissionCheck?: boolean;
  auditLogger?: Record<string, unknown>;
}

export interface StaticAnalysisResult {
  passed: boolean;
  violations?: Array<{
    line: number;
    column: number;
    ruleName: string;
    errorMessage: string;
    severity: 'error' | 'warning';
  }>;
}

export interface ViolationReport {
  filePath: string;
  violations: Array<{
    line: number;
    column: number;
    ruleName: string;
    errorMessage: string;
    severity: 'error' | 'warning';
  }>;
}

/**
 * Plugin Loader interface
 */
export interface IPluginLoader {
  getGrants(): string[];
  updateGrants(grants: string[]): void;
  getRegistry(): unknown;
  getAuditLogger(): unknown;
  loadPlugin(pluginDir: string): Promise<LoadResult>;
  loadPlugins(pluginDir?: string): Promise<BatchLoadResult>;
  reloadPlugin(pluginId: string): Promise<LoadResult>;
  unloadPlugin(pluginId: string): void;
}

/**
 * Plugin Loader class
 */
export class PluginLoader implements IPluginLoader {
  constructor(config?: PluginLoaderConfig);
  
  getGrants(): string[];
  updateGrants(grants: string[]): void;
  getRegistry(): unknown;
  getAuditLogger(): unknown;
  
  loadPlugin(pluginDir: string): Promise<LoadResult>;
  loadPlugins(pluginDir?: string): Promise<BatchLoadResult>;
  reloadPlugin(pluginId: string): Promise<LoadResult>;
  unloadPlugin(pluginId: string): void;
}

/**
 * Create a plugin loader instance
 */
export function createPluginLoader(config?: PluginLoaderConfig): PluginLoader;

/**
 * Permission validator
 */
export class PermissionValidator {
  validatePermissions(permissions: string[], grants: string[]): Array<{
    permission: string;
    reason: string;
    suggestion?: string;
  }>;
}

/**
 * Static analyzer
 */
export class StaticAnalyzer {
  constructor(options?: {
    permissions?: string[];
    strictMode?: boolean;
    ruleSet?: unknown;
  });
  
  analyzeFile(source: string, filePath: string): StaticAnalysisResult;
  setPermissions(grants: string[]): void;
}

/**
 * Audit logger
 */
export interface AuditLogger {
  logLoad(pluginId: string, success: boolean, details?: Record<string, unknown>): void;
  logReload(pluginId: string, success: boolean, details?: Record<string, unknown>): void;
  logUnload(pluginId: string, success: boolean, details?: Record<string, unknown>): void;
}

export function getAuditLogger(config?: Record<string, unknown>): AuditLogger;

/**
 * Manifest validation
 */
export function isPluginManifest(manifest: unknown): manifest is PluginManifest;
}