/**
 * Service Manager Module
 *
 * Cross-platform service management abstractions and implementations.
 */

// Main interface and types
export type {
  ServiceManager,
  ServiceManagerOptions,
  ServiceManagerType,
  CreateServiceManagerOptions,
  InstallResult,
  UninstallResult,
  StartResult,
  StopResult,
  RestartResult,
} from './service-manager.js';

export { isServiceManager } from './service-manager.js';

// Systemd implementation (Linux)
export { SystemdServiceManager } from './systemd-service-manager.js';
export type { SystemdOptions } from './systemd-service-manager.js';

// NSSM implementation (Windows)
export { NssmServiceManager } from './nssm-service-manager.js';
export type { NssmOptions } from './nssm-service-manager.js';

// Factory
// export { createServiceManager } from './factory.js';

// Precheck
// export { runPrecheck } from './precheck.js';