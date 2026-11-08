/** Bounded private diagnostics. Never logs arbitrary exception text, paths or response bodies. */
import { createHash } from 'node:crypto';
export function verificationRejectionDiagnostic(error: unknown): Record<string, unknown> {
  const value = error instanceof Error ? error : null,
    extended = value as
      | (Error & { code?: unknown; syscall?: unknown; statusCode?: unknown })
      | null;
  const token = (input: unknown, pattern: RegExp) =>
    typeof input === 'string' && pattern.test(input) ? input : null;
  const message = value?.message ?? '';
  return {
    event: 'verification.request.rejected',
    utc: new Date().toISOString(),
    error_name: token(value?.name, /^[A-Za-z][A-Za-z0-9_]{0,63}$/),
    system_code: token(extended?.code, /^[A-Z][A-Z0-9_]{0,63}$/),
    syscall: token(extended?.syscall, /^[a-z_]{1,40}$/),
    http_status:
      typeof extended?.statusCode === 'number' &&
      Number.isInteger(extended.statusCode) &&
      extended.statusCode >= 100 &&
      extended.statusCode <= 599
        ? extended.statusCode
        : null,
    message_family: message.match(/^([A-Z][A-Z0-9_]{2,95})(?=:|$)/)?.[1] ?? null,
    transport_category: /timed out after \d+ms/.test(message)
      ? 'timeout'
      : /returned invalid JSON/.test(message)
        ? 'invalid_json'
        : /failed with HTTP \d+/.test(message)
          ? 'http_error'
          : /request failed/.test(message)
            ? 'request_failed'
            : null,
    message_sha256: createHash('sha256').update(message).digest('hex'),
  };
}
