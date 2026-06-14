/**
 * SpecForge OBS-FULL Layer 1 — trace helpers.
 */
import { randomBytes } from "node:crypto";

export function createSfTraceId(prefix = "sftr"): string {
  const now = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `${prefix}_${now}_${randomBytes(6).toString("hex")}`;
}

export function getTraceIdFromContext(context?: Record<string, unknown>): string | undefined {
  const candidates = [
    context?.trace_id,
    context?.traceId,
    context?.traceID,
    context?.request_id,
    context?.requestId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return undefined;
}
