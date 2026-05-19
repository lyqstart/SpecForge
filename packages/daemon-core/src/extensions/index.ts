/**
 * Extensions Module - Index
 * 
 * 导出所有扩展加载器相关的类型和类
 */

export { 
  ExtensionLoader, 
  createExtensionLoader,
  DEFAULT_EXTENSION_LOADER_CONFIG,
  createDefaultExtensionLoaderConfig,
} from './ExtensionLoader';

export type {
  ExtensionType,
  ExtensionLoadState,
  ExtensionLoadResult,
  ExtensionLoaderConfig,
} from './ExtensionLoader';

// Re-export Plugin Loader types
export type { 
  PluginLoaderConfig, 
  LoadResult, 
  BatchLoadResult 
} from '@specforge/plugin-loader';