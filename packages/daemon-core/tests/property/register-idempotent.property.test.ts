/**
 * CP-3: Register Idempotent Property Test
 *
 * Feature: daemon-core, CP-3: Register Idempotent
 * Derived-From: TASK-10 (register endpoint)
 *
 * Property: Multiple calls to SessionRegistry.registerPluginSession with the
 * same projectPath must return the same sessionId. The register operation is
 * idempotent — the first call creates a new session, subsequent calls return
 * the existing one without creating duplicates.
 *
 * Uses fast-check to generate random projectId/projectPath pairs and verify
 * that repeated registrations yield identity-stable sessionIds.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { EventBus } from '../../src/event-bus/EventBus';
import { SessionRegistry } from '../../src/session/SessionRegistry';

// ── Arbitraries ──

const projectIdArb = fc.string({ minLength: 1, maxLength: 30 }).filter(
  (s) => s.trim().length > 0,
);

const projectPathArb = fc.string({ minLength: 1, maxLength: 50 }).filter(
  (s) => s.trim().length > 0 && !s.includes('\0'),
);

describe('CP-3: Register Idempotent (registerPluginSession)', () => {
  it('should return same sessionId on repeated calls with same projectPath', () => {
    const eventBus = new EventBus();
    const registry = new SessionRegistry(eventBus);

    fc.assert(
      fc.property(projectIdArb, projectPathArb, (projectId, projectPath) => {
        // First call — creates a new session
        const identity1 = registry.registerPluginSession(projectId, projectPath);
        expect(identity1).toBeDefined();
        expect(identity1.sessionId).toBeDefined();
        expect(typeof identity1.sessionId).toBe('string');
        expect(identity1.sessionId.length).toBeGreaterThan(0);

        // Second call with same projectPath — must return same sessionId
        const identity2 = registry.registerPluginSession(projectId, projectPath);
        expect(identity2).toBeDefined();
        expect(identity2.sessionId).toBe(identity1.sessionId);

        // Third call — still same sessionId
        const identity3 = registry.registerPluginSession(projectId, projectPath);
        expect(identity3.sessionId).toBe(identity1.sessionId);

        // Verify we can look up the session
        const lookedUp = registry.lookupBySessionId(identity1.sessionId);
        expect(lookedUp).toBeDefined();
        expect(lookedUp?.sessionId).toBe(identity1.sessionId);
      }),
      { numRuns: 200 },
    );
  });

  it('should create different sessionIds for different projectPaths', () => {
    const eventBus = new EventBus();
    const registry = new SessionRegistry(eventBus);

    fc.assert(
      fc.property(
        projectIdArb,
        projectPathArb,
        fc.string({ minLength: 1, maxLength: 50 }).filter(
          (s) => s.trim().length > 0,
        ),
        (projectId, path1, path2) => {
          // Skip if paths happen to be equal (fast-check may generate same string)
          fc.pre(path1 !== path2);

          const identity1 = registry.registerPluginSession(projectId, path1);
          const identity2 = registry.registerPluginSession(projectId, path2);

          expect(identity1.sessionId).toBeDefined();
          expect(identity2.sessionId).toBeDefined();
          expect(identity1.sessionId).not.toBe(identity2.sessionId);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('should not create duplicate entries in projectBindings', () => {
    const eventBus = new EventBus();
    const registry = new SessionRegistry(eventBus);

    fc.assert(
      fc.property(projectIdArb, projectPathArb, (projectId, projectPath) => {
        // Call multiple times with same projectPath
        for (let i = 0; i < 10; i++) {
          registry.registerPluginSession(projectId, projectPath);
        }

        // Verify only ONE pending session exists (not 10)
        const pending = registry.getPendingSessions();
        const matching = pending.filter(
          (s) => registry.getProjectPath(s.sessionId) === projectPath,
        );
        expect(matching.length).toBe(1);
      }),
      { numRuns: 50 },
    );
  });

  it('should return same sessionId even after session lookup and touch', () => {
    const eventBus = new EventBus();
    const registry = new SessionRegistry(eventBus);

    fc.assert(
      fc.property(projectIdArb, projectPathArb, (projectId, projectPath) => {
        const identity1 = registry.registerPluginSession(projectId, projectPath);
        const sessionId = identity1.sessionId;

        // Look up the session
        const lookedUp = registry.lookupBySessionId(sessionId);
        expect(lookedUp).toBeDefined();
        expect(lookedUp?.sessionId).toBe(sessionId);

        // Register again — must return same sessionId
        const identity2 = registry.registerPluginSession(projectId, projectPath);
        expect(identity2.sessionId).toBe(sessionId);
      }),
      { numRuns: 100 },
    );
  });

  it('should be idempotent across interleaved different project registrations', () => {
    const eventBus = new EventBus();
    const registry = new SessionRegistry(eventBus);

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            projectId: projectIdArb,
            projectPath: projectPathArb,
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (projects) => {
          // Deduplicate by projectPath
          const seen = new Map<string, string>(); // projectPath → sessionId
          const unique = new Map<string, { projectId: string; projectPath: string }>();

          for (const p of projects) {
            if (!unique.has(p.projectPath)) {
              unique.set(p.projectPath, p);
            }
          }

          const uniqueProjects = Array.from(unique.values());

          // Register each project, then register all again in reverse
          for (const p of uniqueProjects) {
            const identity = registry.registerPluginSession(p.projectId, p.projectPath);
            seen.set(p.projectPath, identity.sessionId);
          }

          // Second pass (reverse order) — all must return same sessionIds
          for (let i = uniqueProjects.length - 1; i >= 0; i--) {
            const p = uniqueProjects[i]!;
            const identity = registry.registerPluginSession(p.projectId, p.projectPath);
            expect(identity.sessionId).toBe(seen.get(p.projectPath));
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
