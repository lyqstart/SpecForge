// packages/version-unification/src/manifest/types.ts
var LEGACY_FIELDS_USER = [
  "shared_version",
  "required_shared_version_range",
  "schema_version",
  "runtime_schema_version"
];
var LEGACY_FIELDS_PROJECT = [
  ...LEGACY_FIELDS_USER,
  "code_version"
];
class ReadOnlyDegradedError extends Error {
  cause;
  constructor(cause, message) {
    const defaultMessage = `Write operation rejected in read-only degraded mode (cause: ${cause})`;
    super(message ?? defaultMessage);
    this.name = "ReadOnlyDegradedError";
    this.cause = cause;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ReadOnlyDegradedError);
    }
  }
}

// packages/version-unification/src/degraded-mode/read-only-mode.ts
var degradedState = null;
function getDegradedState() {
  return degradedState?.cause ?? null;
}
function isDegraded() {
  return degradedState !== null;
}
function enterReadOnly(cause, message) {
  if (degradedState !== null) {
    if (degradedState.cause !== cause) {
      degradedState = { cause };
    }
    return;
  }
  degradedState = { cause };
  try {
    console.error(`[version-unification] Entered read-only degraded mode: ${cause}${message ? ` - ${message}` : ""}`);
  } catch {}
}
function exitReadOnly() {
  degradedState = null;
}
function requireWritable() {
  if (degradedState !== null) {
    throw new ReadOnlyDegradedError(degradedState.cause);
  }
}
function canWrite() {
  return degradedState === null;
}
function writeIfAllowed(fn) {
  requireWritable();
  return fn();
}
export {
  writeIfAllowed,
  requireWritable,
  isDegraded,
  getDegradedState,
  exitReadOnly,
  enterReadOnly,
  canWrite
};
