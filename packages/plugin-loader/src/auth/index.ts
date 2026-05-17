/**
 * auth 模块导出
 *
 * 任务 3.1.1：实现授权集合管理
 * 任务 3.1.3：支持多级配置合并
 */

export {
  AuthorizationCollection,
  ALL_KNOWN_PERMISSIONS,
} from './AuthorizationCollection';

export {
  ConfigLoader,
  configLoader,
} from './ConfigLoader';

export {
  ConfigHotReloader,
  createConfigHotReloader,
} from './ConfigHotReloader';

export type {
  AuthorizationSource,
  PermissionEntry,
  AuthorizationChangeEvent,
} from './AuthorizationCollection';

export type {
  ConfigLoadOptions,
  LoadedConfigLevel,
  ConfigLoadResult,
} from './ConfigLoader';

export type {
  ConfigHotReloadEventType,
  ConfigHotReloadEvent,
  ConfigHotReloadCallback,
  ConfigHotReloaderOptions,
  ConfigVersion,
} from './ConfigHotReloader';