/**
 * Authentication module for SpecForge CLI.
 * 
 * @packageDocumentation
 */

export {
  AuthManager,
  createAuthManager,
  createAuthenticatedClient,
  getDefaultHandshakePath,
  getRuntimeDirPath,
} from './AuthManager';

export type {
  DaemonHandshake,
  AuthManagerConfig,
  AuthValidationResult,
} from './AuthManager';

export {
  AuthError,
  HandshakeNotFoundError,
  InvalidHandshakeError,
  InvalidTokenError,
  TokenExpiredError,
} from './AuthManager';