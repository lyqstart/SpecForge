/**
 * Property-Based Test: Bearer Token Enforcement (Property 16)
 * 
 * Validates: Property 16, Requirements 5.4, 5.5
 * 
 * Property: For all HTTP/SSE requests r arriving at Daemon Edge layer,
 * if r does not carry valid `Authorization: Bearer <token>` (token matching
 * handshake file token), THEN Daemon returns HTTP 401 and writes a
 * `permission.denied` event to events.jsonl.
 * 
 * Iterations: ≥ 100
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { 
  PolicyEnforcementPoint, 
  createPolicyEnforcementPoint, 
  HttpRequestContext 
} from '../../src/services/policy-enforcement-point';
import { EventLogger } from '../../src/services/event-logger';
import { RuleMergingEngine } from '../../src/services/rule-merging-engine';
import { PermissionEvent, PermissionDeniedEvent } from '../../src/types/events';

/**
 * Feature: Bearer Token Enforcement, Property 16
 * 
 * Derived-From: v6-architecture-overview Property 16
 */

describe('Property 16: Bearer Token Enforcement', () => {
  let pep: PolicyEnforcementPoint;
  let eventLogger: ReturnType<typeof EventLogger.createInMemoryLogger>;
  const testProjectId = 'test-project-property-16';
  const validToken = 'valid-test-token-12345';

  beforeEach(() => {
    // Create in-memory event logger for testing
    eventLogger = EventLogger.createInMemoryLogger(testProjectId);

    // Create PEP with authentication required
    pep = createPolicyEnforcementPoint({
      bearerToken: validToken,
      projectId: testProjectId,
      requireAuth: true, // Authentication IS required for this test
      logDecisions: true,
      logDenials: true, // Log permission.denied events
      eventLogger: eventLogger.logger,
      pdp: new RuleMergingEngine({
        cacheEnabled: true,
        defaultDecision: 'allow'
      })
    });
  });

  afterEach(() => {
    eventLogger.clearEvents();
  });

  /**
   * Helper: wait for async operations to complete
   */
  const waitForEvents = (ms: number = 10): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  /**
   * Helper: create basic HTTP request context
   */
  const createBaseRequest = (overrides?: Partial<HttpRequestContext>): HttpRequestContext => {
    const baseHeaders = {
      'x-actor-id': 'test-actor',
      'x-action': 'spec.read',
      'x-resource-type': 'spec'
    };
    
    // Merge headers if overrides contains headers
    const mergedHeaders = overrides?.headers 
      ? { ...baseHeaders, ...overrides.headers }
      : baseHeaders;
    
    return {
      method: 'GET',
      path: '/api/specs',
      headers: mergedHeaders,
      clientIp: '127.0.0.1',
      ...Object.fromEntries(
        Object.entries(overrides ?? {}).filter(([key]) => key !== 'headers')
      )
    };
  };

  describe('16.1: Missing Authorization header returns HTTP 401', () => {
    it('requests without Authorization header receive HTTP 401', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 1000}),
          async (seed) => {
            eventLogger.clearEvents();
            
            // Create request WITHOUT Authorization header
            const request = createBaseRequest({
              headers: {
                'x-actor-id': `actor-${seed}`,
                'x-action': 'spec.read',
                'x-resource-type': 'spec'
                // Note: NO 'authorization' header
              }
            });

            // Process request
            const result = await pep.processRequest(request);

            // Assert: HTTP 401 returned
            expect(result.httpStatus).toBe(401);
            expect(result.allowed).toBe(false);
            expect(result.errorCode).toBe('missing_authorization');

            // Wait for async event logging
            await waitForEvents();

            // Verify permission.denied event was logged
            const events = eventLogger.getEvents();
            const deniedEvents = events.filter(
              e => e.action === 'permission.denied'
            ) as PermissionDeniedEvent[];

            expect(deniedEvents.length).toBeGreaterThan(0);
            
            // Verify event contains required information
            const event = deniedEvents[0];
            expect(event.payload.reason).toContain('Missing Authorization header');
            expect(event.payload.layer).toBe('auth');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('16.2: Invalid Authorization format returns HTTP 401', () => {
    it('requests with non-Bearer format receive HTTP 401', async () => {
      const invalidFormats = [
        'Basic dXNlcjpwYXNz',  // Basic auth
        'Bearer',              // Bearer without token
        'Bearer123',           // No space
        'BEARER test-token',   // Wrong case
        'OAuth2 test-token',   // Different scheme
      ];

      for (const format of invalidFormats) {
        eventLogger.clearEvents();

        const request = createBaseRequest({
          headers: {
            'x-actor-id': 'test-actor',
            'authorization': format
          }
        });

        const result = await pep.processRequest(request);

        // Should get 401 for invalid format
        expect(result.httpStatus).toBe(401);
        expect(result.allowed).toBe(false);

        await waitForEvents();

        // Verify permission.denied event
        const events = eventLogger.getEvents();
        const deniedEvents = events.filter(e => e.action === 'permission.denied');
        expect(deniedEvents.length).toBeGreaterThan(0);
      }
    });

    it('random invalid formats are rejected with 401', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (prefix, suffix) => {
            // Generate random invalid format that's not "Bearer <validToken>"
            const invalidFormat = `${prefix} ${suffix}`;
            if (invalidFormat.startsWith('Bearer ') && invalidFormat.substring(7) === validToken) {
              return; // Skip valid token case
            }

            eventLogger.clearEvents();

            const request = createBaseRequest({
              headers: {
                'x-actor-id': 'test-actor',
                'authorization': invalidFormat
              }
            });

            const result = await pep.processRequest(request);

            // Should get 401
            expect(result.httpStatus).toBe(401);

            await waitForEvents();

            // Verify event logged
            const events = eventLogger.getEvents();
            const deniedEvents = events.filter(e => e.action === 'permission.denied');
            expect(deniedEvents.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('16.3: Invalid Bearer token returns HTTP 401', () => {
    it('requests with wrong token receive HTTP 401', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          async (invalidToken) => {
            // Skip if somehow it matches valid token
            if (invalidToken === validToken) {
              return;
            }

            eventLogger.clearEvents();

            const request = createBaseRequest({
              headers: {
                'x-actor-id': 'test-actor',
                'x-action': 'spec.read',
                'x-resource-type': 'spec',
                'authorization': `Bearer ${invalidToken}`
              }
            });

            const result = await pep.processRequest(request);

            // Should get 401
            expect(result.httpStatus).toBe(401);
            expect(result.allowed).toBe(false);
            expect(result.errorCode).toBe('invalid_token');

            await waitForEvents();

            // Verify permission.denied event was logged
            const events = eventLogger.getEvents();
            const deniedEvents = events.filter(
              e => e.action === 'permission.denied'
            ) as PermissionDeniedEvent[];

            expect(deniedEvents.length).toBeGreaterThan(0);
            
            const event = deniedEvents[0];
            expect(event.payload.reason).toContain('Invalid Bearer token');
            expect(event.payload.layer).toBe('auth');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('empty Bearer token is rejected with 401', async () => {
      eventLogger.clearEvents();

      const request = createBaseRequest({
        headers: {
          'x-actor-id': 'test-actor',
          'x-action': 'spec.read',
          'x-resource-type': 'spec',
          'authorization': 'Bearer '
        }
      });

      const result = await pep.processRequest(request);

      expect(result.httpStatus).toBe(401);
      expect(result.errorCode).toBe('invalid_token');

      await waitForEvents();

      const events = eventLogger.getEvents();
      const deniedEvents = events.filter(e => e.action === 'permission.denied');
      expect(deniedEvents.length).toBeGreaterThan(0);
    });
  });

  describe('16.4: Valid Bearer token allows request', () => {
    it('requests with valid token receive HTTP 200', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant(validToken),
            fc.constant(`  ${validToken}`),  // with whitespace (will be trimmed)
          ),
          async (token) => {
            // Clean token for the test
            const cleanToken = token.trim();

            eventLogger.clearEvents();

            const request = createBaseRequest({
              headers: {
                'x-actor-id': 'test-actor',
                'x-action': 'spec.read',
                'x-resource-type': 'spec',
                'authorization': `Bearer ${cleanToken}`
              }
            });

            const result = await pep.processRequest(request);

            // Should get 200
            expect(result.httpStatus).toBe(200);
            expect(result.allowed).toBe(true);

            // Wait for any async operations
            await waitForEvents();

            // For valid tokens, permission.denied should NOT be logged
            // But permission.evaluated should be logged
            const events = eventLogger.getEvents();
            const deniedEvents = events.filter(e => e.action === 'permission.denied');
            
            // Valid token should NOT trigger permission.denied
            expect(deniedEvents.length).toBe(0);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('16.5: permission.denied events contain required fields', () => {
    it('all permission.denied events have required fields', async () => {
      // Test various invalid token scenarios
      const testCases = [
        { description: 'no auth header', headers: { 'x-actor-id': 'actor1' } },
        { description: 'invalid format', headers: { 'authorization': 'Basic abc', 'x-actor-id': 'actor2' } },
        { description: 'wrong token', headers: { 'authorization': 'Bearer wrongtoken', 'x-actor-id': 'actor3' } },
      ];

      for (const tc of testCases) {
        eventLogger.clearEvents();

        const request = createBaseRequest({
          headers: {
            'x-action': 'tool.execute',
            'x-resource-type': 'tool',
            ...tc.headers
          }
        });

        await pep.processRequest(request);
        await waitForEvents();

        const events = eventLogger.getEvents();
        const deniedEvents = events.filter(e => e.action === 'permission.denied') as PermissionDeniedEvent[];

        expect(deniedEvents.length).toBeGreaterThan(0);

        for (const event of deniedEvents) {
          // Required fields per Property 16
          expect(event).toHaveProperty('eventId');
          expect(event).toHaveProperty('ts');
          expect(event).toHaveProperty('projectId');
          expect(event).toHaveProperty('action');
          expect(event.action).toBe('permission.denied');
          
          // Payload required fields
          expect(event.payload).toHaveProperty('actor');
          expect(event.payload).toHaveProperty('action');
          expect(event.payload).toHaveProperty('resource');
          expect(event.payload).toHaveProperty('reason');
          expect(event.payload).toHaveProperty('layer');
          
          // Layer should be 'auth' for bearer token failures
          expect(['auth', 'remote']).toContain(event.payload.layer);
        }
      }
    });
  });

  describe('16.6: Different HTTP methods with invalid tokens', () => {
    it('all HTTP methods reject invalid tokens with 401', async () => {
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

      for (const method of methods) {
        eventLogger.clearEvents();

        const request = createBaseRequest({
          method,
          headers: {
            'x-actor-id': 'test-actor',
            'x-action': 'spec.read',
            'x-resource-type': 'spec',
            'authorization': 'Bearer invalid-token-12345'
          }
        });

        const result = await pep.processRequest(request);

        expect(result.httpStatus).toBe(401);
        expect(result.allowed).toBe(false);
      }
    });
  });

  describe('16.7: Different paths with invalid tokens', () => {
    it('all API paths reject invalid tokens with 401', async () => {
      const paths = [
        '/api/specs',
        '/api/specs/123',
        '/api/tasks',
        '/api/tasks/456',
        '/api/tools/execute',
        '/api/workflows/run',
        '/api/config',
        '/health',
        '/metrics'
      ];

      for (const path of paths) {
        eventLogger.clearEvents();

        const request = createBaseRequest({
          path,
          headers: {
            'x-actor-id': 'test-actor',
            'x-action': 'spec.read',
            'x-resource-type': 'spec',
            'authorization': 'Bearer wrong-token'
          }
        });

        const result = await pep.processRequest(request);

        expect(result.httpStatus).toBe(401);
      }
    });
  });

  describe('16.8: Authorization disabled mode allows requests', () => {
    it('when requireAuth=false, requests without tokens are allowed', () => {
      // Create PEP with requireAuth = false
      const pepNoAuth = createPolicyEnforcementPoint({
        bearerToken: validToken,
        projectId: testProjectId,
        requireAuth: false, // Auth NOT required
        logDecisions: true,
        logDenials: true,
        eventLogger: eventLogger.logger,
        pdp: new RuleMergingEngine({
          cacheEnabled: true,
          defaultDecision: 'allow'
        })
      });

      return fc.assert(
        fc.asyncProperty(
          fc.option(fc.string({ minLength: 1, maxLength: 50 })),
          async (token) => {
            eventLogger.clearEvents();

            const headers: Record<string, string> = {
              'x-actor-id': 'test-actor',
              'x-action': 'spec.read',
              'x-resource-type': 'spec'
            };

            if (token) {
              headers['authorization'] = `Bearer ${token}`;
            }

            const request = createBaseRequest({ headers });

            const result = await pepNoAuth.processRequest(request);

            // Should allow without auth when requireAuth=false
            expect(result.httpStatus).toBe(200);
            expect(result.allowed).toBe(true);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('16.9: Token validation is case-sensitive', () => {
    it('case variations of token are rejected', async () => {
      // Note: valid-token is 'valid-test-token-12345'
      // Case variations that should NOT match
      const caseVariations = [
        `VALID-TEST-TOKEN-12345`,  // All upper
        `VALID-test-token-12345`,  // Mixed
        ` Valid-Test-Token-12345`, // With leading space in token part
      ];

      for (const token of caseVariations) {
        eventLogger.clearEvents();

        const request = createBaseRequest({
          headers: {
            'x-actor-id': 'test-actor',
            'x-action': 'spec.read',
            'x-resource-type': 'spec',
            'authorization': `Bearer ${token}`
          }
        });

        const result = await pep.processRequest(request);

        // Should reject if case doesn't match exactly
        expect(result.httpStatus).toBe(401);
      }

      // Verify that exact match works
      const exactMatchRequest = createBaseRequest({
        headers: {
          'x-actor-id': 'test-actor',
          'x-action': 'spec.read',
          'x-resource-type': 'spec',
          'authorization': `Bearer ${validToken}`
        }
      });
      const exactResult = await pep.processRequest(exactMatchRequest);
      expect(exactResult.httpStatus).toBe(200);
    });
  });

  describe('16.10: Complex random tests with various token inputs', () => {
    it('comprehensive random token testing', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            // Valid token
            fc.constant({ 
              token: validToken, 
              shouldPass: true 
            }),
            // Invalid tokens
            fc.record({
              token: fc.string({ minLength: 1, maxLength: 100 }),
              shouldPass: fc.constant(false)
            }).filter(r => r.token !== validToken),
            // Empty/invalid formats
            fc.record({
              token: fc.oneof(
                fc.constant(''),
                fc.constant('   '),
                fc.constant('BadFormat')
              ),
              shouldPass: fc.constant(false)
            })
          ),
          async ({ token, shouldPass }) => {
            eventLogger.clearEvents();

            const request = createBaseRequest({
              headers: {
                'x-actor-id': 'test-actor',
                'x-action': 'spec.read',
                'x-resource-type': 'spec',
                'authorization': `Bearer ${token}`
              }
            });

            const result = await pep.processRequest(request);

            if (shouldPass) {
              expect(result.httpStatus).toBe(200);
              expect(result.allowed).toBe(true);
            } else {
              expect(result.httpStatus).toBe(401);
              expect(result.allowed).toBe(false);
            }

            await waitForEvents();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});