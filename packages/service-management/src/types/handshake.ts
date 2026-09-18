/**
 * Handshake file written by daemon at startup.
 * Contains connection information for clients.
 * Stored at <OpenCode config>/sf-user/runtime/handshake.json with permissions 0600.
 */
export interface HandshakeFile {
  schema_version: '1.0';
  /** Daemon process ID */
  pid: number;
  /** Daemon HTTP server port */
  port: number;
  /** Authentication token for API requests */
  token: string;
  /** Address the daemon listens on; current local runtime is loopback-only. */
  bound_to: '127.0.0.1' | '0.0.0.0';
  /** Startup timestamp (epoch ms) */
  startedAt: number;
  /** Daemon version string */
  version: string;
  /** Whether started by OS service (true) vs ad-hoc (false) */
  serviceMode: boolean;
  /** Machine-readable artifact protocol versions exposed by this daemon. */
  artifact_contract_versions: {
    task_document: string;
  };
}

/** Parse the single current HandshakeFile@1.0 contract. */
export function parseHandshakeFile(value: unknown): HandshakeFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('HandshakeFile root must be an object');
  }

  const handshake = value as Record<string, unknown>;
  const artifactContracts = handshake.artifact_contract_versions;
  if (
    handshake.schema_version !== '1.0' ||
    typeof handshake.pid !== 'number' ||
    !Number.isInteger(handshake.pid) ||
    handshake.pid <= 0 ||
    typeof handshake.port !== 'number' ||
    !Number.isInteger(handshake.port) ||
    handshake.port < 1 ||
    handshake.port > 65_535 ||
    typeof handshake.token !== 'string' ||
    handshake.token.length === 0 ||
    (handshake.bound_to !== '127.0.0.1' && handshake.bound_to !== '0.0.0.0') ||
    typeof handshake.startedAt !== 'number' ||
    !Number.isInteger(handshake.startedAt) ||
    handshake.startedAt < 0 ||
    typeof handshake.version !== 'string' ||
    handshake.version.length === 0 ||
    typeof handshake.serviceMode !== 'boolean' ||
    typeof artifactContracts !== 'object' ||
    artifactContracts === null ||
    Array.isArray(artifactContracts) ||
    typeof (artifactContracts as Record<string, unknown>).task_document !== 'string' ||
    (artifactContracts as Record<string, unknown>).task_document === ''
  ) {
    throw new Error('HandshakeFile does not match the current 1.0 contract');
  }

  return value as HandshakeFile;
}
