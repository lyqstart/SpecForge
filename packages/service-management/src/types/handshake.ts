/**
 * Handshake file written by daemon at startup.
 * Contains connection information for clients.
 * Stored at ~/.specforge/runtime/handshake.json with permissions 0600.
 */
export interface HandshakeFile {
  schema_version: "1.0";
  /** Daemon process ID */
  pid: number;
  /** Daemon HTTP server port */
  port: number;
  /** Authentication token for API requests */
  token: string;
  /** Startup timestamp (epoch ms) */
  startedAt: number;
  /** Daemon version string */
  version: string;
  /** Whether started by OS service (true) vs ad-hoc (false) */
  serviceMode: boolean;
}