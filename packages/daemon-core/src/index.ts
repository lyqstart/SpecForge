/**
 * Daemon Core entry point
 * 
 * This module initializes and starts the Daemon Core process.
 * Can be used as both a library (import Daemon class) and a CLI entry point.
 */

// Library exports
export { Daemon } from './daemon/Daemon';
export { HTTPServer } from './http/HTTPServer';
export { EventBus } from './event-bus/EventBus';
export { StateManager } from './state/StateManager';
export { RecoverySubsystem } from './recovery/RecoverySubsystem';
export { HandshakeManager } from './daemon/HandshakeManager';
export { DaemonConfig } from './daemon/DaemonConfig';
export { SessionRegistry } from './session/SessionRegistry';
export { ProjectManager } from './project/ProjectManager';
export { ContentAddressableStorage } from './cas/ContentAddressableStorage';
export { WAL } from './wal/WAL';

// Type exports
export type {
  Event,
  ApiResponse,
  ApiError,
  DaemonError as DaemonErrorType,
  HandshakeFile,
  ProjectState,
  WorkItemState,
  AgentIdentity,
  Subscription,
  ConsistencyCheckResult,
  ConsistencyIssue,
  RepairResult,
} from './types';

// CLI entry point (when run directly)
if (typeof require !== 'undefined' && require.main === module) {
  const { Daemon } = require('./daemon/Daemon');

  async function main(): Promise<void> {
    const daemon = new Daemon();

    try {
      await daemon.start();
      console.log('Daemon Core started successfully');
    } catch (error) {
      console.error('Failed to start Daemon Core:', error);
      process.exit(1);
    }
  }

  main();
}
