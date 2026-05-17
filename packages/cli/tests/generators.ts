/**
 * Property-Based Test Data Generators for CLI Testing
 * 
 * This file provides fast-check generators for:
 * - CLI command arguments
 * - Async job states and transitions
 * - Blob content and references
 * - Error scenarios
 * - JSON output validation
 */

import * as fc from 'fast-check';

/**
 * Generator for valid CLI command names
 */
export const commandNameGenerator = (): fc.Arbitrary<string> => {
  return fc.sampler(
    fc.constantFrom(
      'daemon',
      'spec',
      'workflow',
      'job',
      'webhook',
      'heal',
      'config',
      'version',
      'help'
    )
  );
};

/**
 * Generator for CLI flags
 */
export const cliFlagsGenerator = (): fc.Arbitrary<Record<string, unknown>> => {
  return fc.record({
    json: fc.boolean(),
    wait: fc.boolean(),
    help: fc.boolean(),
    verbose: fc.boolean(),
    quiet: fc.boolean(),
  });
};

/**
 * Generator for command arguments
 */
export const commandArgsGenerator = (): fc.Arbitrary<Record<string, unknown>> => {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }),
    description: fc.string({ minLength: 0, maxLength: 200 }),
    value: fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.array(fc.string())
    ),
  });
};

/**
 * Generator for job IDs
 */
export const jobIdGenerator = (): fc.Arbitrary<string> => {
  return fc.tuple(
    fc.constant('job-'),
    fc.hexaDecimal({ minLength: 8, maxLength: 16 }),
    fc.constant('-'),
    fc.integer({ min: 1000000000, max: 9999999999 })
  ).map(([prefix, hex, dash, timestamp]) => `${prefix}${hex}${dash}${timestamp}`);
};

/**
 * Generator for session IDs
 */
export const sessionIdGenerator = (): fc.Arbitrary<string> => {
  return fc.tuple(
    fc.constant('session-'),
    fc.hexaDecimal({ minLength: 8, maxLength: 16 }),
    fc.constant('-'),
    fc.integer({ min: 1000000000, max: 9999999999 })
  ).map(([prefix, hex, dash, timestamp]) => `${prefix}${hex}${dash}${timestamp}`);
};

/**
 * Generator for job status values
 */
export const jobStatusGenerator = (): fc.Arbitrary<string> => {
  return fc.constantFrom('pending', 'running', 'completed', 'failed', 'blocked', 'cancelled');
};

/**
 * Generator for terminal job statuses
 */
export const terminalJobStatusGenerator = (): fc.Arbitrary<string> => {
  return fc.constantFrom('completed', 'failed', 'blocked', 'cancelled');
};

/**
 * Generator for job status objects
 */
export const jobStatusObjectGenerator = (): fc.Arbitrary<Record<string, unknown>> => {
  return fc.record({
    jobId: jobIdGenerator(),
    status: jobStatusGenerator(),
    result: fc.option(fc.object()),
    error: fc.option(fc.string()),
    updatedAt: fc.integer({ min: 1000000000000, max: 9999999999999 }),
  });
};

/**
 * Generator for blob references (blob://<sha256>)
 */
export const blobReferenceGenerator = (): fc.Arbitrary<string> => {
  return fc.tuple(
    fc.constant('blob://'),
    fc.hexaDecimal({ minLength: 64, maxLength: 64 })
  ).map(([prefix, hex]) => `${prefix}${hex}`);
};

/**
 * Generator for content that should be converted to blob (> 64 KiB)
 */
export const largeContentGenerator = (): fc.Arbitrary<string> => {
  const threshold = 64 * 1024; // 64 KiB
  return fc.string({
    minLength: threshold + 1,
    maxLength: threshold * 2,
  });
};

/**
 * Generator for content that should remain inline (≤ 64 KiB)
 */
export const smallContentGenerator = (): fc.Arbitrary<string> => {
  const threshold = 64 * 1024; // 64 KiB
  return fc.string({
    minLength: 0,
    maxLength: threshold,
  });
};

/**
 * Generator for mixed content (some inline, some blob)
 */
export const mixedContentGenerator = (): fc.Arbitrary<Record<string, unknown>> => {
  return fc.record({
    smallField: smallContentGenerator(),
    largeField: largeContentGenerator(),
    metadata: fc.record({
      timestamp: fc.integer(),
      version: fc.string(),
    }),
  });
};

/**
 * Generator for HTTP status codes
 */
export const httpStatusCodeGenerator = (): fc.Arbitrary<number> => {
  return fc.oneof(
    fc.constantFrom(200, 201, 202, 204), // Success
    fc.constantFrom(400, 401, 403, 404), // Client errors
    fc.constantFrom(500, 502, 503)       // Server errors
  );
};

/**
 * Generator for error objects
 */
export const errorObjectGenerator = (): fc.Arbitrary<Record<string, unknown>> => {
  return fc.record({
    error: fc.string({ minLength: 1, maxLength: 50 }),
    message: fc.string({ minLength: 1, maxLength: 200 }),
    code: fc.integer({ min: 1000, max: 9999 }),
    timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
  });
};

/**
 * Generator for JSON output (must be valid JSON)
 */
export const jsonOutputGenerator = (): fc.Arbitrary<string> => {
  return fc.record({
    status: fc.constantFrom('success', 'error', 'pending'),
    data: fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.object()
    ),
    timestamp: fc.integer(),
  }).map(obj => JSON.stringify(obj));
};

/**
 * Generator for webhook URLs
 */
export const webhookUrlGenerator = (): fc.Arbitrary<string> => {
  return fc.tuple(
    fc.constantFrom('http://', 'https://'),
    fc.domain(),
    fc.option(fc.tuple(
      fc.constant(':'),
      fc.integer({ min: 1024, max: 65535 })
    ).map(([colon, port]) => `${colon}${port}`)),
    fc.option(fc.tuple(
      fc.constant('/'),
      fc.string({ minLength: 1, maxLength: 50 })
    ).map(([slash, path]) => `${slash}${path}`))
  ).map(([protocol, domain, port, path]) => 
    `${protocol}${domain}${port ?? ''}${path ?? ''}`
  );
};

/**
 * Generator for event patterns (e.g., "gate.*", "permission.denied")
 */
export const eventPatternGenerator = (): fc.Arbitrary<string> => {
  return fc.oneof(
    fc.constantFrom(
      'gate.*',
      'permission.*',
      'workflow.*',
      'spec.*',
      'job.*',
      'daemon.*',
      'error.*'
    ),
    fc.tuple(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.constant('.'),
      fc.string({ minLength: 1, maxLength: 20 })
    ).map(([prefix, dot, suffix]) => `${prefix}${dot}${suffix}`)
  );
};

/**
 * Generator for async command sequences
 * Simulates realistic command execution patterns
 */
export const asyncCommandSequenceGenerator = (): fc.Arbitrary<Array<Record<string, unknown>>> => {
  return fc.array(
    fc.record({
      command: commandNameGenerator(),
      jobId: jobIdGenerator(),
      status: jobStatusGenerator(),
      timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
    }),
    { minLength: 1, maxLength: 10 }
  );
};

/**
 * Generator for command execution results
 */
export const commandResultGenerator = (): fc.Arbitrary<Record<string, unknown>> => {
  return fc.record({
    success: fc.boolean(),
    output: fc.oneof(
      fc.string(),
      fc.object()
    ),
    duration: fc.integer({ min: 0, max: 60000 }),
    timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
  });
};

/**
 * Generator for CLI configuration objects
 */
export const cliConfigGenerator = (): fc.Arbitrary<Record<string, unknown>> => {
  return fc.record({
    schema_version: fc.constant('1.0'),
    default_mode: fc.constantFrom('interactive', 'json'),
    color_enabled: fc.boolean(),
    timeout_seconds: fc.integer({ min: 5, max: 300 }),
    max_content_size_kib: fc.integer({ min: 64, max: 1024 }),
  });
};

/**
 * Generator for daemon handshake file content
 */
export const daemonHandshakeGenerator = (): fc.Arbitrary<Record<string, unknown>> => {
  return fc.record({
    pid: fc.integer({ min: 1000, max: 99999 }),
    port: fc.integer({ min: 3000, max: 9999 }),
    token: fc.hexaDecimal({ minLength: 32, maxLength: 64 }),
    schema_version: fc.constant('1.0'),
    bound_to: fc.constantFrom('127.0.0.1', '0.0.0.0'),
  });
};

/**
 * Generator for authentication tokens
 */
export const authTokenGenerator = (): fc.Arbitrary<string> => {
  return fc.tuple(
    fc.constant('Bearer '),
    fc.hexaDecimal({ minLength: 32, maxLength: 64 })
  ).map(([prefix, hex]) => `${prefix}${hex}`);
};

/**
 * Generator for timeout values (in milliseconds)
 */
export const timeoutMsGenerator = (): fc.Arbitrary<number> => {
  return fc.integer({ min: 100, max: 60000 });
};

/**
 * Generator for retry counts
 */
export const retryCountGenerator = (): fc.Arbitrary<number> => {
  return fc.integer({ min: 0, max: 10 });
};

/**
 * Generator for polling intervals (in milliseconds)
 */
export const pollingIntervalGenerator = (): fc.Arbitrary<number> => {
  return fc.integer({ min: 50, max: 5000 });
};

/**
 * Composite generator for complete async command flow
 */
export const asyncCommandFlowGenerator = (): fc.Arbitrary<Record<string, unknown>> => {
  return fc.record({
    command: commandNameGenerator(),
    args: commandArgsGenerator(),
    flags: cliFlagsGenerator(),
    jobId: jobIdGenerator(),
    initialStatus: fc.constant('pending'),
    statusUpdates: fc.array(
      fc.record({
        status: jobStatusGenerator(),
        timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
      }),
      { minLength: 1, maxLength: 5 }
    ),
    finalStatus: terminalJobStatusGenerator(),
  });
};

/**
 * Composite generator for blob handling scenarios
 */
export const blobHandlingScenarioGenerator = (): fc.Arbitrary<Record<string, unknown>> => {
  return fc.record({
    content: fc.oneof(
      smallContentGenerator(),
      largeContentGenerator()
    ),
    mode: fc.constantFrom('interactive', 'json'),
    shouldConvertToBlob: fc.boolean(),
    expectedResult: fc.oneof(
      fc.string(), // Original content or blob reference
      blobReferenceGenerator()
    ),
  });
};

/**
 * Export all generators as a namespace
 */
export const generators = {
  commandName: commandNameGenerator,
  cliFlags: cliFlagsGenerator,
  commandArgs: commandArgsGenerator,
  jobId: jobIdGenerator,
  sessionId: sessionIdGenerator,
  jobStatus: jobStatusGenerator,
  terminalJobStatus: terminalJobStatusGenerator,
  jobStatusObject: jobStatusObjectGenerator,
  blobReference: blobReferenceGenerator,
  largeContent: largeContentGenerator,
  smallContent: smallContentGenerator,
  mixedContent: mixedContentGenerator,
  httpStatusCode: httpStatusCodeGenerator,
  errorObject: errorObjectGenerator,
  jsonOutput: jsonOutputGenerator,
  webhookUrl: webhookUrlGenerator,
  eventPattern: eventPatternGenerator,
  asyncCommandSequence: asyncCommandSequenceGenerator,
  commandResult: commandResultGenerator,
  cliConfig: cliConfigGenerator,
  daemonHandshake: daemonHandshakeGenerator,
  authToken: authTokenGenerator,
  timeoutMs: timeoutMsGenerator,
  retryCount: retryCountGenerator,
  pollingInterval: pollingIntervalGenerator,
  asyncCommandFlow: asyncCommandFlowGenerator,
  blobHandlingScenario: blobHandlingScenarioGenerator,
};

export default generators;
