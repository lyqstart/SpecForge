/**
 * Error Classification and Handling Tests
 *
 * Tests for the comprehensive error classification system
 * Requirements: 1.6, 2.3, 4.4
 */

import { describe, it, expect } from 'vitest';
import {
  AdapterErrorCode,
  ErrorCategory,
  getErrorCategory,
  AdapterError,
  VersionIncompatibilityError,
  VersionParseError,
  VersionRangeInvalidError,
  TranslationError,
  ContextTranslationError,
  EventTranslationError,
  ToolTranslationError,
  CapabilityTranslationError,
  UnsupportedFeatureError,
  CommunicationError,
  SessionInitializationError,
  SessionNotFoundError,
  SessionNotActiveError,
  SessionTerminatedError,
  PromptDeliveryError,
  EventStreamError,
  CommunicationTimeoutError,
  ThinPluginError,
  ThinPluginNetworkError,
  ThinPluginTimeoutError,
  ThinPluginServerError,
  ThinPluginRetryExhaustedError,
  ThinPluginHealthCheckFailedError,
  SessionBindError,
  InvalidParamsError,
  InternalAdapterError,
  isRetryableError,
  getErrorSummary,
  createAdapterError,
} from '../src/errors';

describe('Error Code Enum', () => {
  it('should have correct version incompatibility codes', () => {
    expect(AdapterErrorCode.VERSION_MISMATCH).toBe('VERSION_MISMATCH');
    expect(AdapterErrorCode.VERSION_PARSE_ERROR).toBe('VERSION_PARSE_ERROR');
    expect(AdapterErrorCode.VERSION_RANGE_INVALID).toBe('VERSION_RANGE_INVALID');
  });

  it('should have correct translation failure codes', () => {
    expect(AdapterErrorCode.TRANSLATION_FAILED).toBe('TRANSLATION_FAILED');
    expect(AdapterErrorCode.UNSUPPORTED_FEATURE).toBe('UNSUPPORTED_FEATURE');
    expect(AdapterErrorCode.CONTEXT_TRANSLATION_FAILED).toBe('CONTEXT_TRANSLATION_FAILED');
  });

  it('should have correct communication error codes', () => {
    expect(AdapterErrorCode.SESSION_INIT_FAILED).toBe('SESSION_INIT_FAILED');
    expect(AdapterErrorCode.SESSION_NOT_FOUND).toBe('SESSION_NOT_FOUND');
    expect(AdapterErrorCode.COMMUNICATION_TIMEOUT).toBe('COMMUNICATION_TIMEOUT');
  });

  it('should have correct Thin Plugin error codes', () => {
    expect(AdapterErrorCode.THIN_PLUGIN_ERROR).toBe('THIN_PLUGIN_ERROR');
    expect(AdapterErrorCode.THIN_PLUGIN_NETWORK_ERROR).toBe('THIN_PLUGIN_NETWORK_ERROR');
    expect(AdapterErrorCode.THIN_PLUGIN_RETRY_EXHAUSTED).toBe('THIN_PLUGIN_RETRY_EXHAUSTED');
  });
});

describe('ErrorCategory', () => {
  it('should map version codes to VERSION_INCOMPATIBILITY category', () => {
    expect(getErrorCategory(AdapterErrorCode.VERSION_MISMATCH)).toBe(ErrorCategory.VERSION_INCOMPATIBILITY);
    expect(getErrorCategory(AdapterErrorCode.VERSION_PARSE_ERROR)).toBe(ErrorCategory.VERSION_INCOMPATIBILITY);
  });

  it('should map translation codes to TRANSLATION category', () => {
    expect(getErrorCategory(AdapterErrorCode.TRANSLATION_FAILED)).toBe(ErrorCategory.TRANSLATION);
    expect(getErrorCategory(AdapterErrorCode.CONTEXT_TRANSLATION_FAILED)).toBe(ErrorCategory.TRANSLATION);
  });

  it('should map communication codes to COMMUNICATION category', () => {
    expect(getErrorCategory(AdapterErrorCode.SESSION_INIT_FAILED)).toBe(ErrorCategory.COMMUNICATION);
    expect(getErrorCategory(AdapterErrorCode.COMMUNICATION_TIMEOUT)).toBe(ErrorCategory.COMMUNICATION);
  });

  it('should map Thin Plugin codes to THIN_PLUGIN category', () => {
    expect(getErrorCategory(AdapterErrorCode.THIN_PLUGIN_ERROR)).toBe(ErrorCategory.THIN_PLUGIN);
    expect(getErrorCategory(AdapterErrorCode.THIN_PLUGIN_NETWORK_ERROR)).toBe(ErrorCategory.THIN_PLUGIN);
  });
});

describe('VersionIncompatibilityError', () => {
  it('should create error with correct code and category', () => {
    const error = new VersionIncompatibilityError('1.13.0', '^1.14.0');
    
    expect(error.code).toBe(AdapterErrorCode.VERSION_MISMATCH);
    expect(error.category).toBe(ErrorCategory.VERSION_INCOMPATIBILITY);
    expect(error.detectedVersion).toBe('1.13.0');
    expect(error.requiredRange).toBe('^1.14.0');
  });

  it('should include suggestion for version upgrade', () => {
    const error = new VersionIncompatibilityError('1.13.0', '^1.14.0');
    expect(error.suggestion).toContain('upgrade');
  });

  it('should not be retryable', () => {
    const error = new VersionIncompatibilityError('1.13.0', '^1.14.0');
    expect(error.isRetryable()).toBe(false);
  });

  it('should produce user-friendly message', () => {
    const error = new VersionIncompatibilityError('1.13.0', '^1.14.0');
    const userMessage = error.getUserMessage();
    expect(userMessage).toContain('1.13.0');
    expect(userMessage).toContain('^1.14.0');
    expect(userMessage).toContain('Suggestion');
  });
});

describe('VersionParseError', () => {
  it('should create error for invalid version strings', () => {
    const error = new VersionParseError('invalid-version');
    
    expect(error.code).toBe(AdapterErrorCode.VERSION_PARSE_ERROR);
    expect(error.message).toContain('invalid-version');
    expect(error.suggestion).toContain('SemVer');
  });

  it('should serialize to JSON correctly', () => {
    const error = new VersionParseError('bad');
    const json = error.toJSON();
    
    expect(json.code).toBe(AdapterErrorCode.VERSION_PARSE_ERROR);
    expect(json.category).toBe(ErrorCategory.VERSION_INCOMPATIBILITY);
    expect(json.timestamp).toBeDefined();
  });
});

describe('VersionRangeInvalidError', () => {
  it('should create error for invalid range strings', () => {
    const error = new VersionRangeInvalidError('not-a-range');
    
    expect(error.code).toBe(AdapterErrorCode.VERSION_RANGE_INVALID);
    expect(error.suggestion).toContain('SemVer range');
  });
});

describe('Translation Errors', () => {
  it('ContextTranslationError should have correct properties', () => {
    const error = new ContextTranslationError('missing required field', {
      context: { field: 'workspace' },
    });
    
    expect(error.code).toBe(AdapterErrorCode.CONTEXT_TRANSLATION_FAILED);
    expect(error.translationType).toBe('context');
    expect(error.category).toBe(ErrorCategory.TRANSLATION);
  });

  it('EventTranslationError should include event type in message', () => {
    const error = new EventTranslationError('session.start', 'unsupported event version');
    
    expect(error.message).toContain('session.start');
    expect(error.category).toBe(ErrorCategory.TRANSLATION);
  });

  it('ToolTranslationError should include tool name', () => {
    const error = new ToolTranslationError('custom_tool', 'not in allowlist');
    
    expect(error.message).toContain('custom_tool');
    expect(error.code).toBe(AdapterErrorCode.TOOL_TRANSLATION_FAILED);
  });

  it('CapabilityTranslationError should include model name', () => {
    const error = new CapabilityTranslationError('gpt-4', 'invalid capability format');
    
    expect(error.message).toContain('gpt-4');
    expect(error.code).toBe(AdapterErrorCode.CAPABILITY_TRANSLATION_FAILED);
  });

  it('UnsupportedFeatureError should not be retryable', () => {
    const error = new UnsupportedFeatureError('experimental_api');
    
    expect(error.isRetryable()).toBe(false);
    expect(error.feature).toBe('experimental_api');
  });
});

describe('Communication Errors', () => {
  it('SessionInitializationError should be retryable', () => {
    const error = new SessionInitializationError('connection refused', 'session-123');
    
    expect(error.code).toBe(AdapterErrorCode.SESSION_INIT_FAILED);
    expect(error.isRetryable()).toBe(true);
    expect(error.sessionId).toBe('session-123');
  });

  it('SessionNotFoundError should not be retryable', () => {
    const error = new SessionNotFoundError('session-456');
    
    expect(error.code).toBe(AdapterErrorCode.SESSION_NOT_FOUND);
    expect(error.isRetryable()).toBe(false);
    expect(error.suggestion).toContain('terminated');
  });

  it('SessionNotActiveError should include current status', () => {
    const error = new SessionNotActiveError('session-789', 'completed');
    
    expect(error.code).toBe(AdapterErrorCode.SESSION_NOT_ACTIVE);
    expect(error.currentStatus).toBe('completed');
    expect(error.suggestion).toContain('active');
  });

  it('SessionTerminatedError should provide clear message', () => {
    const error = new SessionTerminatedError('session-abc');
    
    expect(error.code).toBe(AdapterErrorCode.SESSION_TERMINATED);
    expect(error.message).toContain('terminated');
  });

  it('PromptDeliveryError should include session ID', () => {
    const error = new PromptDeliveryError('connection lost', 'session-xyz');
    
    expect(error.code).toBe(AdapterErrorCode.PROMPT_DELIVERY_FAILED);
    expect(error.sessionId).toBe('session-xyz');
    expect(error.isRetryable()).toBe(true);
  });

  it('EventStreamError should include session ID', () => {
    const error = new EventStreamError('session-stream', 'connection reset');
    
    expect(error.code).toBe(AdapterErrorCode.EVENT_STREAM_ERROR);
    expect(error.sessionId).toBe('session-stream');
  });

  it('CommunicationTimeoutError should include operation and timeout', () => {
    const error = new CommunicationTimeoutError('sendPrompt', 5000, 'session-123');
    
    expect(error.code).toBe(AdapterErrorCode.COMMUNICATION_TIMEOUT);
    expect(error.operation).toBe('sendPrompt');
    expect(error.timeoutMs).toBe(5000);
    expect(error.isRetryable()).toBe(true);
  });
});

describe('Thin Plugin Errors', () => {
  it('ThinPluginNetworkError should be retryable', () => {
    const error = new ThinPluginNetworkError('http://localhost:3000');
    
    expect(error.code).toBe(AdapterErrorCode.THIN_PLUGIN_NETWORK_ERROR);
    expect(error.endpoint).toBe('http://localhost:3000');
    expect(error.isRetryable()).toBe(true);
  });

  it('ThinPluginTimeoutError should include timeout', () => {
    const error = new ThinPluginTimeoutError('http://localhost:3000', 10000);
    
    expect(error.code).toBe(AdapterErrorCode.THIN_PLUGIN_TIMEOUT);
    expect(error.timeoutMs).toBe(10000);
    expect(error.isRetryable()).toBe(true);
  });

  it('ThinPluginServerError should mark 5xx as retryable', () => {
    const error1 = new ThinPluginServerError('http://localhost:3000', 500);
    expect(error1.isRetryable()).toBe(true);

    const error2 = new ThinPluginServerError('http://localhost:3000', 400);
    expect(error2.isRetryable()).toBe(false);

    const error3 = new ThinPluginServerError('http://localhost:3000', 429);
    expect(error3.isRetryable()).toBe(true); // Rate limited
  });

  it('ThinPluginRetryExhaustedError should include attempt count', () => {
    const error = new ThinPluginRetryExhaustedError('http://localhost:3000', 3, 'connection refused');
    
    expect(error.code).toBe(AdapterErrorCode.THIN_PLUGIN_RETRY_EXHAUSTED);
    expect(error.attempts).toBe(3);
    expect(error.lastError).toBe('connection refused');
    expect(error.isRetryable()).toBe(false);
  });

  it('ThinPluginHealthCheckFailedError should be retryable', () => {
    const error = new ThinPluginHealthCheckFailedError('http://localhost:3000', 'unhealthy');
    
    expect(error.code).toBe(AdapterErrorCode.THIN_PLUGIN_HEALTH_CHECK_FAILED);
    expect(error.isRetryable()).toBe(true);
  });

  it('SessionBindError should include spawn intent ID', () => {
    const error = new SessionBindError('intent-123', 'intent not found');
    
    expect(error.code).toBe(AdapterErrorCode.SESSION_BIND_FAILED);
    expect(error.spawnIntentId).toBe('intent-123');
  });
});

describe('General Errors', () => {
  it('InvalidParamsError should include parameter name', () => {
    const error = new InvalidParamsError('model', 'must be a non-empty string');
    
    expect(error.code).toBe(AdapterErrorCode.INVALID_PARAMS);
    expect(error.paramName).toBe('model');
    expect(error.suggestion).toContain('model');
  });

  it('InternalAdapterError should not be retryable', () => {
    const error = new InternalAdapterError('unexpected null value');
    
    expect(error.code).toBe(AdapterErrorCode.INTERNAL_ERROR);
    expect(error.isRetryable()).toBe(false);
  });
});

describe('Helper Functions', () => {
  it('isRetryableError should check retryable flag', () => {
    const retryableError = new SessionInitializationError('failed', 's1');
    const nonRetryableError = new SessionNotFoundError('s2');
    
    expect(isRetryableError(retryableError)).toBe(true);
    expect(isRetryableError(nonRetryableError)).toBe(false);
  });

  it('getErrorSummary should format error nicely', () => {
    const error = new VersionIncompatibilityError('1.0.0', '^2.0.0');
    const summary = getErrorSummary(error);
    
    expect(summary).toContain('[VERSION_INCOMPATIBILITY]');
    expect(summary).toContain('[VERSION_MISMATCH]');
    expect(summary).toContain('1.0.0');
  });

  it('createAdapterError should wrap existing AdapterError', () => {
    const original = new SessionNotFoundError('test-session');
    const wrapped = createAdapterError(original);
    
    expect(wrapped).toBe(original);
  });

  it('createAdapterError should wrap generic errors', () => {
    const error = new Error('timeout occurred');
    const wrapped = createAdapterError(error, AdapterErrorCode.COMMUNICATION_TIMEOUT, 'operation timed out');
    
    expect(wrapped).toBeInstanceOf(CommunicationTimeoutError);
  });

  it('createAdapterError should handle timeout in message', () => {
    const error = new Error('Request timeout after 5000ms');
    const wrapped = createAdapterError(error);
    
    expect(wrapped).toBeInstanceOf(CommunicationTimeoutError);
  });
});

describe('Error Serialization', () => {
  it('should serialize to JSON with all relevant fields', () => {
    const error = new VersionIncompatibilityError('1.13.0', '^1.14.0', {
      originalError: new Error('test'),
      context: { extra: 'data' },
    });
    
    const json = error.toJSON();
    
    expect(json.name).toBe('VersionIncompatibilityError');
    expect(json.code).toBe('VERSION_MISMATCH');
    expect(json.category).toBe('VERSION_INCOMPATIBILITY');
    expect(json.timestamp).toBeDefined();
    expect(json.stack).toBeDefined();
    expect(json.details).toBeDefined();
  });
});

describe('Error Inheritance', () => {
  it('all errors should extend AdapterError base class', () => {
    const errors = [
      new VersionIncompatibilityError('1.0.0', '^2.0.0'),
      new VersionParseError('bad'),
      new VersionRangeInvalidError('bad'),
      new ContextTranslationError('failed'),
      new EventTranslationError('type', 'reason'),
      new ToolTranslationError('tool', 'reason'),
      new CapabilityTranslationError('model', 'reason'),
      new UnsupportedFeatureError('feature'),
      new SessionInitializationError('msg', 'id'),
      new SessionNotFoundError('id'),
      new SessionNotActiveError('id', 'status'),
      new SessionTerminatedError('id'),
      new PromptDeliveryError('msg', 'id'),
      new EventStreamError('id', 'reason'),
      new CommunicationTimeoutError('op', 5000, 'id'),
      new ThinPluginNetworkError('url'),
      new ThinPluginTimeoutError('url', 5000),
      new ThinPluginServerError('url', 500),
      new ThinPluginRetryExhaustedError('url', 3, 'err'),
      new ThinPluginHealthCheckFailedError('url', 'reason'),
      new SessionBindError('intent', 'reason'),
      new InvalidParamsError('param', 'reason'),
      new InternalAdapterError('msg'),
    ];
    
    errors.forEach(error => {
      expect(error).toBeInstanceOf(AdapterError);
      expect(error.code).toBeDefined();
      expect(error.category).toBeDefined();
      expect(error.timestamp).toBeInstanceOf(Date);
    });
  });
});