/**
 * Health check response from daemon's GET /api/v1/healthz endpoint.
 */
export interface HealthCheckResponse {
  schema_version: "1.0";
  /** Current health status */
  status: "ok" | "degraded" | "shutting-down";
  /** Daemon process ID */
  pid: number;
  /** Daemon version string */
  version: string;
  /** Startup timestamp (epoch ms) */
  startedAt: number;
  /** Uptime in seconds */
  uptimeSec: number;
  /** Current number of HTTP/SSE clients */
  activeClients: number;
  /** Number of events pending flush to disk */
  pendingEvents: number;
  /** Timestamp of last event (epoch ms), null if no events yet */
  lastEventTs: number | null;
}