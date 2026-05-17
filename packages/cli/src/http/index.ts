/**
 * HTTP Client module for Daemon communication.
 * 
 * @packageDocumentation
 */

export {
  DaemonClient,
  createClientFromHandshake,
  type DaemonClientConfig,
  type HttpMethod,
  type RequestOptions,
  type SSEEvent,
  type SSEConnection,
  type DaemonClientError,
  type DaemonTimeoutError,
  type DaemonUnreachableError,
  type DaemonAuthError,
} from './DaemonClient';

// Re-export BlobHandler types for external use
export {
  BlobHandler,
  createBlobHandler,
  BLOB_THRESHOLD_BYTES,
  type BlobReference,
  type ProcessedContent,
  type BlobHandlerOptions,
} from '../blob/BlobHandler';