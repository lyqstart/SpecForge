/**
 * SpecForge OBS-FULL Layer 1 — daemon redaction helpers.
 */
import { createHash } from "node:crypto";

const SECRET_KEY_PATTERN = /(api[_-]?key|authorization|cookie|password|secret|private[_-]?key|access[_-]?token|refresh[_-]?token|token)/i;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function stableJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ unserializable: true, type: typeof value });
  }
}

export function sha256(value: unknown): string {
  return createHash("sha256")
    .update(typeof value === "string" ? value : stableJson(value))
    .digest("hex");
}

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key)) {
    if (typeof value === "string" && value.length > 0) {
      return `[REDACTED sha256=${sha256(value).slice(0, 12)}]`;
    }
    return "[REDACTED]";
  }

  if (typeof value === "string") {
    if (JWT_PATTERN.test(value)) return `[REDACTED_JWT sha256=${sha256(value).slice(0, 12)}]`;
    if (/^Bearer\s+.+/i.test(value)) return `[REDACTED_BEARER sha256=${sha256(value).slice(0, 12)}]`;
  }

  return value;
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const redacted = redactValue(key, raw);
      out[key] = redacted === raw ? redactSecrets(raw) : redacted;
    }
    return out;
  }

  return value;
}
