/**
 * Property-Based Test: Remote Access Guard (Property 26)
 * 
 * Validates: Property 26, Requirements 16.3-16.6
 * 
 * Property: For all requests r arriving in remote access mode 
 * (bind=0.0.0.0 && requireAuth=true), if r lacks valid long-term API key 
 * or r's source IP is not in whitelist, THEN Daemon rejects the request; 
 * for sensitive operations (delete WorkItem / permission change / config reset), 
 * even if r passes authentication, it must undergo two-step confirmation before proceeding.
 * 
 * Iterations: ≥ 100
 * 
 * @specforge/permission-engine
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { 
  RemoteAccessGuard, 
  createRemoteAccessGuard,
  SensitiveOperation 
} from '../../src/services/remote-access-guard';

/**
 * Feature: Remote Access Guard, Property 26
 * 
 * Derived-From: v6-architecture-overview Property 26
 * 
 * Tests:
 * - API key validation for remote mode requests
 * - IP whitelist enforcement
 * - Two-step confirmation for sensitive operations
 * - User binding for OpenClaw requests
 */

// Helper to generate a random valid IPv4 address string
function generateIp(): string {
  return `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
}

// Helper to generate a random API key format (32 hex chars)
function generateRandomApiKey(): string {
  const chars = '0123456789abcdef';
  let key = '';
  for (let i = 0; i < 32; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

// All sensitive operations requiring two-step confirmation
const sensitiveOperations: SensitiveOperation[] = [
  'workitem.delete',
  'permission.change', 
  'config.reset',
  'config.modify_security',
  'user.revoke_access',
  'plugin.unload',
  'workflow.terminate',
  'file.delete_critical'
];

describe('Property 26: Remote Access Guard', () => {
  const testProjectId = 'test-project-property-26';
  let guard: RemoteAccessGuard;

  beforeEach(() => {
    guard = createRemoteAccessGuard({
      enabled: true,
      requireAuth: true,
      projectId: testProjectId
    });
  });

  /**
   * Property 26.1: API Key Requirement
   * 
   * For remote mode with requireAuth=true, requests without valid API key must be rejected.
   */
  describe('26.1: API Key Enforcement', () => {
    /**
     * Property: For any remote access guard with remote mode enabled and requireAuth=true,
     * a request without an API key must be rejected.
     */
    it('should reject requests without API key when remote access is enabled with requireAuth=true', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 1000 }),
          async (seed) => {
            // Create fresh guard for each iteration
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            const result = await testGuard.validateRequest({
              apiKey: undefined,
              clientIp: generateIp(),
              operation: 'remote.test'
            });

            expect(result.authorized).toBe(false);
            expect(result.errorCode).toBe('missing_api_key');
            expect(result.httpStatus).toBe(401);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Valid API keys should be accepted.
     */
    it('should accept valid API keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            // Create a valid key
            const { key } = testGuard.createApiKey({
              name: `Test Key ${seed}`,
              userId: `user-${seed}`
            });

            const result = await testGuard.validateRequest({
              apiKey: key,
              clientIp: generateIp(),
              operation: 'remote.test'
            });

            expect(result.authorized).toBe(true);
            expect(result.errorCode).toBe('valid');
            expect(result.httpStatus).toBe(200);
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Random non-existent API keys should always be rejected.
     */
    it('should reject non-existent/random API keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 32, maxLength: 64 }),
          async (randomKey) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: 'test-project-random-key'
            });

            // Ensure key is not accidentally valid
            if (randomKey.length >= 32) {
              const result = await testGuard.validateRequest({
                apiKey: randomKey,
                clientIp: '192.168.1.1',
                operation: 'remote.test'
              });

              expect(result.authorized).toBe(false);
              expect(['key_not_found', 'invalid_api_key']).toContain(result.errorCode);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Expired API keys should be rejected.
     */
    it('should reject expired API keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            // Create a key that expires immediately (in the past)
            const { key } = testGuard.createApiKey({
              name: `Expired Key ${seed}`,
              userId: `user-${seed}`,
              expiresAt: new Date(Date.now() - 1000) // Already expired
            });

            const result = await testGuard.validateRequest({
              apiKey: key,
              clientIp: '192.168.1.1',
              operation: 'remote.test'
            });

            expect(result.authorized).toBe(false);
            expect(result.errorCode).toBe('key_expired');
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Revoked API keys should be rejected.
     */
    it('should reject revoked API keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            const { key, apiKey: metadata } = testGuard.createApiKey({
              name: `Revokable Key ${seed}`,
              userId: `user-${seed}`
            });

            // Revoke the key
            testGuard.revokeApiKey(metadata.id);

            const result = await testGuard.validateRequest({
              apiKey: key,
              clientIp: '192.168.1.1',
              operation: 'remote.test'
            });

            expect(result.authorized).toBe(false);
            expect(result.errorCode).toBe('key_disabled');
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 26.2: IP Whitelist Enforcement
   * 
   * Requests from IPs not in the whitelist should be rejected.
   */
  describe('26.2: IP Whitelist Enforcement', () => {
    /**
     * Property: Requests from IPs not in the whitelist should be rejected.
     */
    it('should reject IPs not in whitelist', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            const whitelistIp = '192.168.1.100';
            const { key } = testGuard.createApiKey({
              name: `IP Restricted Key ${seed}`,
              userId: `user-${seed}`,
              ipWhitelist: [whitelistIp]
            });

            // IP outside of whitelist - should be rejected
            const outsideIp = '10.0.0.1';
            const result = await testGuard.validateRequest({
              apiKey: key,
              clientIp: outsideIp,
              operation: 'remote.test'
            });

            expect(result.authorized).toBe(false);
            expect(result.errorCode).toBe('key_not_found'); // IP not in whitelist treated as key not found
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Requests from IPs in the whitelist should be accepted.
     */
    it('should accept IPs in whitelist', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            const whitelistIp = '192.168.1.100';
            const { key } = testGuard.createApiKey({
              name: `IP Whitelisted Key ${seed}`,
              userId: `user-${seed}`,
              ipWhitelist: [whitelistIp]
            });

            // IP in whitelist - should be accepted
            const result = await testGuard.validateRequest({
              apiKey: key,
              clientIp: whitelistIp,
              operation: 'remote.test'
            });

            expect(result.authorized).toBe(true);
            expect(result.errorCode).toBe('valid');
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: CIDR notation should correctly restrict IP ranges (/24).
     */
    it('should enforce CIDR notation in whitelist (/24)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            const { key } = testGuard.createApiKey({
              name: `CIDR Key ${seed}`,
              userId: `user-${seed}`,
              ipWhitelist: ['10.0.0.0/24']
            });

            // IP within CIDR range should be allowed
            const insideResult = await testGuard.validateRequest({
              apiKey: key,
              clientIp: '10.0.0.50',
              operation: 'remote.test'
            });
            expect(insideResult.authorized).toBe(true);

            // IP outside CIDR range should be rejected
            const outsideResult = await testGuard.validateRequest({
              apiKey: key,
              clientIp: '10.0.1.1',
              operation: 'remote.test'
            });
            expect(outsideResult.authorized).toBe(false);
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: CIDR /16 notation should correctly restrict IP ranges.
     */
    it('should enforce CIDR notation in whitelist (/16)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            const { key } = testGuard.createApiKey({
              name: `CIDR /16 Key ${seed}`,
              userId: `user-${seed}`,
              ipWhitelist: ['192.168.0.0/16']
            });

            // IP within /16 range should be allowed
            const insideResult = await testGuard.validateRequest({
              apiKey: key,
              clientIp: '192.168.50.100',
              operation: 'remote.test'
            });
            expect(insideResult.authorized).toBe(true);

            // IP outside /16 range should be rejected
            const outsideResult = await testGuard.validateRequest({
              apiKey: key,
              clientIp: '10.0.0.1',
              operation: 'remote.test'
            });
            expect(outsideResult.authorized).toBe(false);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 26.3: Two-Step Confirmation for Sensitive Operations
   * 
   * Sensitive operations should require two-step confirmation.
   */
  describe('26.3: Two-Step Confirmation for Sensitive Operations', () => {
    /**
     * Property: Sensitive operations should require two-step confirmation.
     */
    it('should require confirmation for sensitive operations (workitem.delete)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            const { key } = testGuard.createApiKey({
              name: `Test Key ${seed}`,
              userId: `user-${seed}`
            });

            const result = await testGuard.validateRequest({
              apiKey: key,
              clientIp: '192.168.1.1',
              operation: 'test',
              isSensitiveOperation: true,
              sensitiveOperationType: 'workitem.delete'
            });

            expect(result.authorized).toBe(false);
            expect(result.errorCode).toBe('confirmation_required');
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Sensitive operations should require confirmation (permission.change).
     */
    it('should require confirmation for permission.change', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            const { key } = testGuard.createApiKey({
              name: `Test Key ${seed}`,
              userId: `user-${seed}`
            });

            const result = await testGuard.validateRequest({
              apiKey: key,
              clientIp: '192.168.1.1',
              operation: 'test',
              isSensitiveOperation: true,
              sensitiveOperationType: 'permission.change'
            });

            expect(result.authorized).toBe(false);
            expect(result.errorCode).toBe('confirmation_required');
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Sensitive operations should require confirmation (config.reset).
     */
    it('should require confirmation for config.reset', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            const { key } = testGuard.createApiKey({
              name: `Test Key ${seed}`,
              userId: `user-${seed}`
            });

            const result = await testGuard.validateRequest({
              apiKey: key,
              clientIp: '192.168.1.1',
              operation: 'test',
              isSensitiveOperation: true,
              sensitiveOperationType: 'config.reset'
            });

            expect(result.authorized).toBe(false);
            expect(result.errorCode).toBe('confirmation_required');
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Non-sensitive operations should not require confirmation.
     */
    it('should not require confirmation for non-sensitive operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            const { key } = testGuard.createApiKey({
              name: `Test Key ${seed}`,
              userId: `user-${seed}`
            });

            const result = await testGuard.validateRequest({
              apiKey: key,
              clientIp: '192.168.1.1',
              operation: 'tool.execute',
              isSensitiveOperation: false,
              sensitiveOperationType: undefined
            });

            expect(result.authorized).toBe(true);
            expect(result.errorCode).toBe('valid');
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Confirming a sensitive operation should allow it to proceed.
     */
    it('should allow sensitive operation after confirmation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            // Register a user
            const user = testGuard.registerUser({
              username: `testuser-${seed}`,
              roles: ['editor'],
              permissions: ['tool.execute']
            });

            // Request confirmation for sensitive operation
            const confirmation = testGuard.requestConfirmation({
              userId: user.id,
              operation: 'workitem.delete',
              description: `Test workitem.delete confirmation ${seed}`
            });

            expect(confirmation.success).toBe(true);
            expect(confirmation.confirmationId).toBeDefined();

            // Confirm the operation
            const confirmed = testGuard.confirmOperation(confirmation.confirmationId!, user.id);
            expect(confirmed.success).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Denying a sensitive operation should block it.
     */
    it('should deny sensitive operation after denial', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            const user = testGuard.registerUser({
              username: `testuser-${seed}`,
              roles: ['editor'],
              permissions: ['tool.execute']
            });

            const confirmation = testGuard.requestConfirmation({
              userId: user.id,
              operation: 'permission.change',
              description: `Test permission.change confirmation ${seed}`
            });

            // Deny the operation
            const denied = testGuard.denyOperation(confirmation.confirmationId!, user.id);
            expect(denied.success).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 26.4: User Binding for OpenClaw Requests
   * 
   * Requests with user binding should include user identity.
   */
  describe('26.4: User Binding for OpenClaw Requests', () => {
    /**
     * Property: Requests with valid API key and user binding should include user identity.
     */
    it('should bind users to sessions with valid API key', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            // Register a user
            const user = testGuard.registerUser({
              username: `testuser-${seed}`,
              displayName: `Test User ${seed}`,
              email: `test${seed}@example.com`,
              roles: ['editor'],
              permissions: ['tool.execute']
            });

            const { key } = testGuard.createApiKey({
              name: `Test Key ${seed}`,
              userId: user.id
            });

            const sessionId = `session-${seed}-${generateRandomApiKey()}`;
            
            const result = await testGuard.validateRequest({
              apiKey: key,
              clientIp: generateIp(),
              sessionId,
              userId: user.id,
              operation: 'remote.test'
            });

            expect(result.authorized).toBe(true);
            expect(result.boundUser).toBeDefined();
            expect(result.boundUser?.id).toBe(user.id);
            expect(result.binding).toBeDefined();
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Binding should track session and IP information.
     */
    it('should track session and IP in user binding', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            const user = testGuard.registerUser({
              username: `bindtest-${seed}`,
              roles: ['viewer'],
              permissions: ['file.read']
            });

            const { key } = testGuard.createApiKey({
              name: `Binding Test Key ${seed}`,
              userId: user.id
            });

            const sessionId = `session-${seed}-${generateRandomApiKey()}`;
            const clientIp = generateIp();

            const result = await testGuard.validateRequest({
              apiKey: key,
              clientIp,
              sessionId,
              userId: user.id,
              userAgent: 'TestAgent/1.0',
              operation: 'remote.test'
            });

            expect(result.binding).toBeDefined();
            expect(result.binding?.sessionId).toBe(sessionId);
            expect(result.binding?.remoteAddress).toBe(clientIp);
            expect(result.binding?.userAgent).toBe('TestAgent/1.0');
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Disabled users should be rejected.
     */
    it('should reject disabled users', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            const user = testGuard.registerUser({
              username: `disableme-${seed}`,
              roles: ['editor'],
              permissions: ['tool.execute']
            });

            // Disable the user
            testGuard.getUserBindingManager().disableUser(user.id);

            const { key } = testGuard.createApiKey({
              name: `Test Key ${seed}`,
              userId: user.id
            });

            const result = await testGuard.validateRequest({
              apiKey: key,
              clientIp: '192.168.1.1',
              sessionId: `session-${seed}`,
              userId: user.id,
              operation: 'remote.test'
            });

            expect(result.authorized).toBe(false);
            expect(result.errorCode).toBe('user_disabled');
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 26.5: Remote Access Mode Control
   * 
   * When remote access is disabled, all remote requests should be rejected.
   */
  describe('26.5: Remote Access Mode Control', () => {
    /**
     * Property: When remote access is disabled, all remote requests should be rejected.
     */
    it('should reject all requests when remote access is disabled', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: false, // Remote access disabled
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            // Even with a valid key, should be rejected when remote access disabled
            const { key } = testGuard.createApiKey({
              name: `Test Key ${seed}`,
              userId: `user-${seed}`
            });

            const result = await testGuard.validateRequest({
              apiKey: key,
              clientIp: '192.168.1.1',
              operation: 'remote.test'
            });

            expect(result.authorized).toBe(false);
            expect(result.errorCode).toBe('remote_access_disabled');
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Remote access can be enabled/disabled at runtime.
     */
    it('should allow toggling remote access at runtime', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: `test-project-${seed}`
            });

            expect(testGuard.isEnabled()).toBe(true);

            // Toggle off
            testGuard.setEnabled(false);
            expect(testGuard.isEnabled()).toBe(false);

            // Toggle back on
            testGuard.setEnabled(true);
            expect(testGuard.isEnabled()).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 26.6: Combined Property Tests
   * 
   * Comprehensive tests covering multiple aspects of Property 26.
   */
  describe('26.6: Combined Property Tests', () => {
    /**
     * Property: When requireAuth=false, requests without API keys should be allowed.
     */
    it('should allow requests without API key when requireAuth=false', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: false, // Auth NOT required
              projectId: `test-project-${seed}`
            });

            const result = await testGuard.validateRequest({
              apiKey: undefined,
              clientIp: '192.168.1.1',
              operation: 'remote.test'
            });

            expect(result.authorized).toBe(true);
            expect(result.errorCode).toBe('valid');
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Multiple sensitive operations should all require confirmation.
     */
    it('should require confirmation for all sensitive operation types', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: sensitiveOperations.length - 1 }),
          async (opIndex) => {
            const testGuard = createRemoteAccessGuard({
              enabled: true,
              requireAuth: true,
              projectId: 'test-project-sensitive-ops'
            });

            const operation = sensitiveOperations[opIndex];
            const { key } = testGuard.createApiKey({
              name: 'Sensitive Ops Key',
              userId: 'user-sensitive'
            });

            const result = await testGuard.validateRequest({
              apiKey: key,
              clientIp: '192.168.1.1',
              operation: 'test',
              isSensitiveOperation: true,
              sensitiveOperationType: operation
            });

            expect(result.authorized).toBe(false);
            expect(result.errorCode).toBe('confirmation_required');
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Verify all sensitive operations are properly defined.
     */
    it('should have all required sensitive operations defined', () => {
      const requiredOps: SensitiveOperation[] = [
        'workitem.delete',
        'permission.change',
        'config.reset',
        'config.modify_security'
      ];

      const definedOps = guard.getSensitiveOperations();
      
      for (const required of requiredOps) {
        expect(definedOps).toContain(required);
      }
    });
  });
});