/**
 * Error Classifier — single canonical entry point that maps any error or
 * "unsupported translation result" produced anywhere inside OpenCodeAdapter
 * into a `ClassifiedError` record carrying:
 *
 *   - category:    one of the four design-doc §5.1 buckets (plus a GENERAL
 *                  fallback inherited from `errors/index.ts`)
 *   - retryable:   whether the operation is safe to retry (idempotency-aware)
 *   - recordEvent: whether the caller should emit a Daemon event for it
 *   - eventType:   `adapter.version_mismatch` for version errors, otherwise
 *                  `adapter.error`
 *   - message:     D2-compliant string including `operation`, `timeoutMs`
 *                  (when applicable), the original detail, and a concrete
 *                  `suggestion`
 *
 * Categories (per `.kiro/specs/opencode-adapter/design.md` §5.1):
 *   1. Version Incompatibility   — `VERSION_MISMATCH` from spawnAgent and
 *                                  the AdapterError hierarchy
 *   2. Translation Failure       — `unsupported: true` results from
 *                                  Context/Event/Tool/Capability translators
 *                                  and TRANSLATION_FAILED PromptDeliveryError
 *   3. OpenCode Communication    — spawnAgent transport + timeout +
 *                                  sendPrompt delivery + AdapterError
 *                                  CommunicationError subclasses
 *   4. Thin Plugin Integration   — every ThinPluginClientError code, every
 *                                  DaemonStartupError code (on-demand
 *                                  daemon spawn is part of the Thin Plugin
 *                                  integration surface, see Req 4.3)
 *
 * D2 ("超时透明原则") — see `docs/engineering-lessons/async-resource-lifecycle.md` §D2:
 * superficial "timeout" messages shift the diagnosis cost onto the user,
 * so every timeout (and indeed every classified error) carries an
 * actionable suggestion plus the operation name and timeoutMs when known.
 *
 * Async-safety: this module is a *pure synchronous* function. It never
 * starts timers, opens streams, calls `setTimeout`, or touches the adapter
 * event bus. Importing or calling `classifyError` cannot leak resources.
 *
 * Requirements: 1.6, 2.3, 4.4
 */

import { ErrorCategory, AdapterError, AdapterErrorCode } from './index';
import {
  SessionInitializationError,
  PromptDeliveryError,
} from '../OpenCodeAdapter';
import {
  ThinPluginClientError,
  ThinPluginClientErrorCode,
} from '../integration/ThinPluginClient';
import {
  DaemonStartupError,
  DaemonStartupErrorCode,
} from '../integration/DaemonStartupManager';

// Re-export ErrorCategory so callers can do
// `import { ErrorCategory, classifyError } from '.../ErrorClassifier'`
export { ErrorCategory } from './index';

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

/**
 * Shape of an "unsupported" translation result returned by Context / Event /
 * Tool / Capability translators. They never throw — instead they return
 * `{ success: false, unsupported: true, reason: string }`. The classifier
 * accepts those records directly so callers can pipe them through a single
 * decision lane without a `try/catch` round-trip.
 */
export interface UnsupportedTranslationResult {
  readonly success: false;
  readonly unsupported: true;
  readonly reason: string;
}

/**
 * Canonical, transport-agnostic record produced for every error that
 * crosses the adapter boundary.
 */
export interface ClassifiedError {
  /** Top-level category — picks the handling lane. */
  readonly category: ErrorCategory;
  /** Whether this error came from a transient/idempotent operation that
   *  may be retried by the caller. */
  readonly retryable: boolean;
  /** Whether the caller should emit a Daemon event for forensics/UI. */
  readonly recordEvent: boolean;
  /** Concrete event type when `recordEvent === true`. */
  readonly eventType: string;
  /** Short discriminator code copied from the originating error (or a
   *  synthesized one for unknown values). */
  readonly code: string;
  /** D2-compliant single-line message: includes operation + timeoutMs +
   *  original detail + suggestion. Always populated. */
  readonly message: string;
  /** Originating operation (e.g. `spawnAgent`, `sendPrompt`, `thinPlugin.request`). */
  readonly operation?: string;
  /** Timeout in ms when the originating error is a timeout. */
  readonly timeoutMs?: number;
  /** Concrete next action for the user (D2 — never undefined). */
  readonly suggestion: string;
  /** Original thrown value, preserved for forensics. */
  readonly originalError: unknown;
}

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------

function isUnsupportedTranslationResult(
  value: unknown,
): value is UnsupportedTranslationResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v['success'] === false &&
    v['unsupported'] === true &&
    typeof v['reason'] === 'string'
  );
}

function readNumberFromDetails(details: unknown, key: string): number | undefined {
  if (typeof details !== 'object' || details === null) return undefined;
  const ctx = (details as Record<string, unknown>)[key];
  if (typeof ctx === 'number') return ctx;
  // Nested under `context` (used by the AdapterError hierarchy).
  const wrapper = (details as Record<string, unknown>)['context'];
  if (typeof wrapper === 'object' && wrapper !== null) {
    const inner = (wrapper as Record<string, unknown>)[key];
    if (typeof inner === 'number') return inner;
  }
  return undefined;
}

function readStringFromDetails(details: unknown, key: string): string | undefined {
  if (typeof details !== 'object' || details === null) return undefined;
  const direct = (details as Record<string, unknown>)[key];
  if (typeof direct === 'string') return direct;
  const wrapper = (details as Record<string, unknown>)['context'];
  if (typeof wrapper === 'object' && wrapper !== null) {
    const inner = (wrapper as Record<string, unknown>)[key];
    if (typeof inner === 'string') return inner;
  }
  return undefined;
}

/**
 * Build the D2-compliant message. Always includes `[category]`,
 * `operation=...` (when known), `timeoutMs=...` (when known), the original
 * detail, and a `suggestion: ...` clause.
 */
function buildMessage(parts: {
  category: ErrorCategory;
  operation?: string;
  timeoutMs?: number;
  suggestion: string;
  detail: string;
}): string {
  const segments: string[] = [`[${parts.category}]`];
  if (parts.operation) segments.push(`operation=${parts.operation}`);
  if (typeof parts.timeoutMs === 'number') segments.push(`timeoutMs=${parts.timeoutMs}`);
  segments.push(parts.detail);
  segments.push(`suggestion: ${parts.suggestion}`);
  return segments.join(' | ');
}

// --------------------------------------------------------------------------
// Per-source classification helpers
// --------------------------------------------------------------------------

function classifyTranslationUnsupported(err: UnsupportedTranslationResult): ClassifiedError {
  const suggestion =
    'This OpenCode concept is not supported by the current adapter version. ' +
    'Either upgrade the adapter or avoid using this feature.';
  return {
    category: ErrorCategory.TRANSLATION,
    retryable: false,
    recordEvent: true,
    eventType: 'adapter.error',
    code: 'TRANSLATION_UNSUPPORTED',
    message: buildMessage({
      category: ErrorCategory.TRANSLATION,
      operation: 'translate',
      suggestion,
      detail: `unsupported translation: ${err.reason}`,
    }),
    operation: 'translate',
    suggestion,
    originalError: err,
  };
}

function classifySessionInitError(err: SessionInitializationError): ClassifiedError {
  const operation = 'spawnAgent';

  if (err.code === 'VERSION_MISMATCH') {
    const suggestion =
      'Upgrade or downgrade OpenCode to match the adapter compatibleKernelRange, ' +
      'or upgrade/downgrade the adapter to match the running OpenCode version.';
    return {
      category: ErrorCategory.VERSION_INCOMPATIBILITY,
      retryable: false,
      recordEvent: true,
      eventType: 'adapter.version_mismatch',
      code: err.code,
      message: buildMessage({
        category: ErrorCategory.VERSION_INCOMPATIBILITY,
        operation,
        suggestion,
        detail: err.message,
      }),
      operation,
      suggestion,
      originalError: err,
    };
  }

  if (err.code === 'TIMEOUT') {
    const timeoutMs = readNumberFromDetails(err.details, 'timeoutMs');
    const suggestion =
      'Check Thin Plugin connectivity and that OpenCode is reachable; ' +
      'increase communicationTimeout in adapter config if the workload is slow.';
    return {
      category: ErrorCategory.COMMUNICATION,
      retryable: true,
      recordEvent: true,
      eventType: 'adapter.error',
      code: err.code,
      message: buildMessage({
        category: ErrorCategory.COMMUNICATION,
        operation,
        timeoutMs,
        suggestion,
        detail: err.message,
      }),
      operation,
      timeoutMs,
      suggestion,
      originalError: err,
    };
  }

  if (err.code === 'INVALID_PARAMS') {
    const suggestion =
      'Validate spawnAgent parameters (agentRole and spawnIntentId must be non-empty strings).';
    return {
      category: ErrorCategory.COMMUNICATION,
      retryable: false,
      recordEvent: false,
      eventType: 'adapter.error',
      code: err.code,
      message: buildMessage({
        category: ErrorCategory.COMMUNICATION,
        operation,
        suggestion,
        detail: err.message,
      }),
      operation,
      suggestion,
      originalError: err,
    };
  }

  // SESSION_INIT_FAILED — generic transient failure.
  const suggestion =
    'Verify OpenCode is running and Thin Plugin is reachable; the spawn is idempotent so retry is safe.';
  return {
    category: ErrorCategory.COMMUNICATION,
    retryable: true,
    recordEvent: true,
    eventType: 'adapter.error',
    code: err.code,
    message: buildMessage({
      category: ErrorCategory.COMMUNICATION,
      operation,
      suggestion,
      detail: err.message,
    }),
    operation,
    suggestion,
    originalError: err,
  };
}

function classifyPromptDeliveryError(err: PromptDeliveryError): ClassifiedError {
  const operation = 'sendPrompt';

  if (err.code === 'TRANSLATION_FAILED') {
    const suggestion =
      'The UserMessage cannot be translated to the OpenCode-internal format. ' +
      'Verify the message shape conforms to the Daemon-neutral schema.';
    return {
      category: ErrorCategory.TRANSLATION,
      retryable: false,
      recordEvent: true,
      eventType: 'adapter.error',
      code: err.code,
      message: buildMessage({
        category: ErrorCategory.TRANSLATION,
        operation,
        suggestion,
        detail: err.message,
      }),
      operation,
      suggestion,
      originalError: err,
    };
  }

  if (err.code === 'DELIVERY_FAILED') {
    const timeoutMs = readNumberFromDetails(err.details, 'timeoutMs');
    const suggestion =
      'The transport to OpenCode failed mid-flight. sendPrompt is idempotent at the message level — ' +
      'check Thin Plugin HTTP availability and retry with the same messageId.';
    return {
      category: ErrorCategory.COMMUNICATION,
      retryable: true,
      recordEvent: true,
      eventType: 'adapter.error',
      code: err.code,
      message: buildMessage({
        category: ErrorCategory.COMMUNICATION,
        operation,
        timeoutMs,
        suggestion,
        detail: err.message,
      }),
      operation,
      timeoutMs,
      suggestion,
      originalError: err,
    };
  }

  // Caller-side errors: SESSION_NOT_FOUND / SESSION_NOT_ACTIVE / INVALID_MESSAGE.
  const suggestion =
    err.code === 'SESSION_NOT_FOUND'
      ? 'The session does not exist; spawn a new agent before sending prompts.'
      : err.code === 'SESSION_NOT_ACTIVE'
        ? 'Wait for the session to become active or spawn a new one.'
        : 'Provide a non-empty content and a valid role (user|assistant|system).';
  return {
    category: ErrorCategory.COMMUNICATION,
    retryable: false,
    recordEvent: false,
    eventType: 'adapter.error',
    code: err.code,
    message: buildMessage({
      category: ErrorCategory.COMMUNICATION,
      operation,
      suggestion,
      detail: err.message,
    }),
    operation,
    suggestion,
    originalError: err,
  };
}

function classifyThinPluginClientError(err: ThinPluginClientError): ClassifiedError {
  const operation = 'thinPlugin.request';
  let retryable = false;
  let suggestion = 'Check Thin Plugin status and configuration.';
  let timeoutMs: number | undefined;

  switch (err.code) {
    case ThinPluginClientErrorCode.NETWORK_ERROR:
      retryable = true;
      suggestion =
        'Check Thin Plugin HTTP server reachability and network connectivity. ' +
        'Network failures are usually transient; backoff and retry.';
      break;
    case ThinPluginClientErrorCode.TIMEOUT:
      retryable = true;
      timeoutMs = readNumberFromDetails(err.details, 'timeoutMs');
      suggestion =
        'Increase the Thin Plugin client timeout or verify the plugin process is responsive.';
      break;
    case ThinPluginClientErrorCode.SERVER_ERROR: {
      const sc = err.statusCode ?? 0;
      // 5xx and 429 are transient and idempotent endpoints can be retried.
      retryable = sc >= 500 || sc === 429;
      suggestion = retryable
        ? `Thin Plugin returned ${sc}; backoff and retry.`
        : `Thin Plugin returned ${sc}; fix the request payload before retrying — the request will not succeed unchanged.`;
      break;
    }
    case ThinPluginClientErrorCode.INVALID_RESPONSE:
      retryable = false;
      suggestion =
        'Thin Plugin returned a malformed response body. Check Thin Plugin version and schema compatibility.';
      break;
    case ThinPluginClientErrorCode.RETRY_EXHAUSTED:
      retryable = false;
      suggestion =
        'Thin Plugin remained unavailable after every configured retry. Inspect the daemon and plugin logs.';
      break;
    case ThinPluginClientErrorCode.CONFIG_ERROR:
      retryable = false;
      suggestion =
        'Fix ThinPluginClient configuration (baseUrl is required and must be a non-empty URL).';
      break;
    case ThinPluginClientErrorCode.ABORTED:
      retryable = false;
      suggestion = 'The request was aborted (typically expected on shutdown); no further action required.';
      break;
  }

  return {
    category: ErrorCategory.THIN_PLUGIN,
    retryable,
    // ABORTED is a normal shutdown signal and must not pollute the event log.
    recordEvent: err.code !== ThinPluginClientErrorCode.ABORTED,
    eventType: 'adapter.error',
    code: err.code,
    message: buildMessage({
      category: ErrorCategory.THIN_PLUGIN,
      operation,
      timeoutMs,
      suggestion,
      detail: err.message,
    }),
    operation,
    timeoutMs,
    suggestion,
    originalError: err,
  };
}

function classifyDaemonStartupError(err: DaemonStartupError): ClassifiedError {
  const operation = 'daemonStartup';
  let retryable = false;
  let suggestion = 'Inspect daemon logs and configuration.';

  switch (err.code) {
    case DaemonStartupErrorCode.STARTUP_TIMEOUT:
    case DaemonStartupErrorCode.HEALTH_CHECK_FAILED:
    case DaemonStartupErrorCode.STARTUP_FAILED:
      retryable = true;
      suggestion =
        'Check daemon command, working directory, and required ports; ' +
        'startup is idempotent (no daemon yet) so retry is safe.';
      break;
    case DaemonStartupErrorCode.CONFIG_ERROR:
      retryable = false;
      suggestion =
        'Fix DaemonStartupManager configuration (daemonCommand and daemonArgs are required).';
      break;
    case DaemonStartupErrorCode.DAEMON_NOT_FOUND:
      retryable = false;
      suggestion = 'Install the daemon binary or fix the daemonCommand path.';
      break;
    case DaemonStartupErrorCode.PERMISSION_DENIED:
      retryable = false;
      suggestion = 'Run with the necessary permissions or change the binary file mode.';
      break;
    case DaemonStartupErrorCode.ALREADY_RUNNING:
      retryable = false;
      suggestion = 'The daemon is already running; reuse the existing instance.';
      break;
    case DaemonStartupErrorCode.PROCESS_ERROR:
      retryable = true;
      suggestion = 'The daemon process crashed; inspect daemon logs and retry.';
      break;
  }

  return {
    category: ErrorCategory.THIN_PLUGIN,
    retryable,
    recordEvent: true,
    eventType: 'adapter.error',
    code: err.code,
    message: buildMessage({
      category: ErrorCategory.THIN_PLUGIN,
      operation,
      suggestion,
      detail: err.message,
    }),
    operation,
    suggestion,
    originalError: err,
  };
}

function classifyAdapterError(err: AdapterError): ClassifiedError {
  // The AdapterError hierarchy already self-classifies; we only adapt it
  // into a `ClassifiedError` and apply event/operation rules.
  const operation = readStringFromDetails(err.details, 'operation');
  const timeoutMs = readNumberFromDetails(err.details, 'timeoutMs');
  const suggestion =
    err.suggestion ?? 'Review the error details and consult adapter documentation.';

  // INVALID_PARAMS is a caller-side bug; do not pollute the event log.
  const recordEvent = err.code !== AdapterErrorCode.INVALID_PARAMS;
  const eventType =
    err.code === AdapterErrorCode.VERSION_MISMATCH
      ? 'adapter.version_mismatch'
      : 'adapter.error';

  return {
    category: err.category,
    retryable: err.isRetryable(),
    recordEvent,
    eventType,
    code: err.code,
    message: buildMessage({
      category: err.category,
      operation,
      timeoutMs,
      suggestion,
      detail: err.message,
    }),
    operation,
    timeoutMs,
    suggestion,
    originalError: err,
  };
}

function classifyUnknown(err: unknown): ClassifiedError {
  const message = err instanceof Error ? err.message : String(err ?? 'unknown error');
  const lower = message.toLowerCase();

  // Heuristic: the word "timeout" is a reasonably reliable signal for
  // transient communication failures.
  if (lower.includes('timeout')) {
    const suggestion =
      'Increase the relevant timeout configuration or investigate the upstream operation.';
    return {
      category: ErrorCategory.COMMUNICATION,
      retryable: true,
      recordEvent: true,
      eventType: 'adapter.error',
      code: 'UNKNOWN_TIMEOUT',
      message: buildMessage({
        category: ErrorCategory.COMMUNICATION,
        operation: 'unknown',
        suggestion,
        detail: message,
      }),
      operation: 'unknown',
      suggestion,
      originalError: err,
    };
  }

  const suggestion = 'Inspect the original error and adapter logs for context.';
  return {
    category: ErrorCategory.GENERAL,
    retryable: false,
    recordEvent: true,
    eventType: 'adapter.error',
    code: 'UNKNOWN',
    message: buildMessage({
      category: ErrorCategory.GENERAL,
      suggestion,
      detail: message || 'Unknown error',
    }),
    suggestion,
    originalError: err,
  };
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Classify an arbitrary error or translator unsupported result into a
 * canonical `ClassifiedError`. The function is total — for any input it
 * returns a fully populated record (falling back to `ErrorCategory.GENERAL`
 * for genuinely unknown shapes).
 *
 * The function performs no I/O, starts no timers, and never throws.
 */
export function classifyError(err: unknown): ClassifiedError {
  if (isUnsupportedTranslationResult(err)) {
    return classifyTranslationUnsupported(err);
  }

  if (err instanceof SessionInitializationError) {
    return classifySessionInitError(err);
  }

  if (err instanceof PromptDeliveryError) {
    return classifyPromptDeliveryError(err);
  }

  if (err instanceof ThinPluginClientError) {
    return classifyThinPluginClientError(err);
  }

  if (err instanceof DaemonStartupError) {
    return classifyDaemonStartupError(err);
  }

  if (err instanceof AdapterError) {
    return classifyAdapterError(err);
  }

  return classifyUnknown(err);
}
