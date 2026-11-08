import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  BearerTokenValidator, 
  createBearerTokenValidator,
  parseAuthorizationHeader,
  isValidBearerFormat
} from '../../src/services/bearer-token-validator';
import { EventLogger } from '../../src/services/event-logger';

describe('BearerTokenValidator', () => {
  const validToken = 'test-valid-token-12345';
  const projectId = 'test-project';

  describe('Validation', () => {
    it('should return 401 for missing Authorization header', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      const result = await validator.validate(undefined);

      expect(result.authorized).toBe(false);
      expect(result.httpStatus).toBe(401);
      expect(result.errorCode).toBe('missing_authorization');
      expect(result.reason).toBe('Missing Authorization header');
    });

    it('should return 401 for empty Authorization header', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      const result = await validator.validate('');

      expect(result.authorized).toBe(false);
      expect(result.httpStatus).toBe(401);
      expect(result.errorCode).toBe('missing_authorization');
    });

    it('should return 401 for invalid Authorization header format (missing Bearer prefix)', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      const result = await validator.validate(validToken);

      expect(result.authorized).toBe(false);
      expect(result.httpStatus).toBe(401);
      expect(result.errorCode).toBe('invalid_token_format');
      expect(result.reason).toContain('missing Bearer prefix');
    });

    it('should return 401 for invalid Authorization header format (wrong scheme)', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      const result = await validator.validate('Basic dXNlcjpwYXNz');

      expect(result.authorized).toBe(false);
      expect(result.httpStatus).toBe(401);
      expect(result.errorCode).toBe('invalid_token_format');
    });

    it('should return 401 for empty Bearer token', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      const result = await validator.validate('Bearer ');

      expect(result.authorized).toBe(false);
      expect(result.httpStatus).toBe(401);
      expect(result.errorCode).toBe('invalid_token');
      expect(result.reason).toBe('Empty Bearer token');
    });

    it('should return 401 for invalid token', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      const result = await validator.validate('Bearer wrong-token');

      expect(result.authorized).toBe(false);
      expect(result.httpStatus).toBe(401);
      expect(result.errorCode).toBe('invalid_token');
      expect(result.reason).toBe('Invalid Bearer token');
    });

    it('should return 200 for valid Bearer token', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      const result = await validator.validate(`Bearer ${validToken}`);

      expect(result.authorized).toBe(true);
      expect(result.httpStatus).toBe(200);
      expect(result.errorCode).toBe('valid');
      expect(result.token).toBe(validToken);
    });

    it('should return 401 for token with extra whitespace', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      const result = await validator.validate(`Bearer ${validToken} `);

      expect(result.authorized).toBe(false);
      expect(result.httpStatus).toBe(401);
      expect(result.errorCode).toBe('invalid_token');
    });
  });

  describe('validateRequest', () => {
    it('should extract authorization from headers object', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      const result = await validator.validateRequest({
        authorization: `Bearer ${validToken}`
      });

      expect(result.authorized).toBe(true);
      expect(result.token).toBe(validToken);
    });

    it('should handle headers without authorization property', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      const result = await validator.validateRequest({});

      expect(result.authorized).toBe(false);
      expect(result.httpStatus).toBe(401);
    });
  });

  describe('Request Context', () => {
    it('should include request context in validation', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      const result = await validator.validate(`Bearer ${validToken}`, {
        sessionId: 'session-123',
        remoteIdentity: 'openclaw-user-001',
        action: 'tool.execute',
        resource: { type: 'tool', id: 'my-tool' }
      });

      expect(result.authorized).toBe(true);
    });

    it('should handle missing request context', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      const result = await validator.validate(`Bearer ${validToken}`);

      expect(result.authorized).toBe(true);
    });
  });

  describe('Token Management', () => {
    it('should allow updating the valid token', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      // Original token should work
      let result = await validator.validate(`Bearer ${validToken}`);
      expect(result.authorized).toBe(true);

      // Update token
      const newToken = 'new-valid-token-67890';
      validator.setToken(newToken);

      // New token should work
      result = await validator.validate(`Bearer ${newToken}`);
      expect(result.authorized).toBe(true);

      // Old token should not work
      result = await validator.validate(`Bearer ${validToken}`);
      expect(result.authorized).toBe(false);
    });

    it('should return current token via getToken', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      expect(validator.getToken()).toBe(validToken);
    });

    it('should check token without logging', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      expect(validator.checkToken(validToken)).toBe(true);
      expect(validator.checkToken('wrong-token')).toBe(false);
    });
  });

  describe('Logging', () => {
    let mockLogger: any;

    beforeEach(() => {
      // Create in-memory logger for testing
      const { logger, getEvents, clearEvents } = EventLogger.createInMemoryLogger(projectId);
      mockLogger = { logger, getEvents, clearEvents };
    });

    it('should log permission.denied event for missing header', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: true,
        eventLogger: mockLogger.logger
      });

      await validator.validate(undefined);
      
      const events = mockLogger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe('permission.denied');
      expect(events[0].payload.reason).toBe('Missing Authorization header');
      expect(events[0].payload.layer).toBe('auth');
    });

    it('should log permission.denied event for invalid token', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: true,
        eventLogger: mockLogger.logger
      });

      await validator.validate('Bearer wrong-token');
      
      const events = mockLogger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe('permission.denied');
      expect(events[0].payload.reason).toBe('Invalid Bearer token');
    });

    it('should log permission.denied event for invalid format', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: true,
        eventLogger: mockLogger.logger
      });

      await validator.validate('Basic credentials');
      
      const events = mockLogger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe('permission.denied');
      expect(events[0].payload.layer).toBe('auth');
    });

    it('should not log when logFailures is disabled', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false,
        eventLogger: mockLogger.logger
      });

      await validator.validate(undefined);
      
      const events = mockLogger.getEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe('Middleware', () => {
    it('should create middleware that returns authorized true for valid token', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      const middleware = validator.createMiddleware();
      const result = await middleware({ authorization: `Bearer ${validToken}` });

      expect(result.authorized).toBe(true);
      expect(result.token).toBe(validToken);
      expect(result.response).toBeUndefined();
    });

    it('should create middleware that returns response object for invalid token', async () => {
      const validator = new BearerTokenValidator({
        validToken,
        projectId,
        logFailures: false
      });

      const middleware = validator.createMiddleware();
      const result = await middleware({ authorization: 'Bearer wrong' });

      expect(result.authorized).toBe(false);
      expect(result.token).toBeUndefined();
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(401);
      expect(result.response?.body).toContain('Unauthorized');
    });
  });

  describe('Factory Function', () => {
    it('should create validator via factory function', () => {
      const validator = createBearerTokenValidator({
        validToken,
        projectId
      });

      expect(validator).toBeInstanceOf(BearerTokenValidator);
    });
  });
});

describe('Helper Functions', () => {
  describe('parseAuthorizationHeader', () => {
    it('should parse valid Bearer header', () => {
      const result = parseAuthorizationHeader('Bearer token123');
      
      expect(result).not.toBeNull();
      expect(result?.scheme).toBe('Bearer');
      expect(result?.token).toBe('token123');
    });

    it('should return null for undefined', () => {
      const result = parseAuthorizationHeader(undefined);
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseAuthorizationHeader('');
      expect(result).toBeNull();
    });

    it('should return null for invalid format (no space)', () => {
      const result = parseAuthorizationHeader('Bearertoken123');
      expect(result).toBeNull();
    });

    it('should return null for too many parts', () => {
      const result = parseAuthorizationHeader('Bearer token extra');
      expect(result).toBeNull();
    });

    it('should parse Basic auth header', () => {
      const result = parseAuthorizationHeader('Basic dXNlcjpwYXNz');
      
      expect(result).not.toBeNull();
      expect(result?.scheme).toBe('Basic');
      expect(result?.token).toBe('dXNlcjpwYXNz');
    });
  });

  describe('isValidBearerFormat', () => {
    it('should return true for valid Bearer format', () => {
      expect(isValidBearerFormat('Bearer token123')).toBe(true);
    });

    it('should return false for missing Bearer prefix', () => {
      expect(isValidBearerFormat('token123')).toBe(false);
    });

    it('should return false for empty token', () => {
      expect(isValidBearerFormat('Bearer ')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidBearerFormat(undefined)).toBe(false);
    });

    it('should return false for wrong scheme', () => {
      expect(isValidBearerFormat('Basic dXNlcjpwYXNz')).toBe(false);
    });
  });
});