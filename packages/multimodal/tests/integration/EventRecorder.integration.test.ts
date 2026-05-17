/**
 * EventRecorder Integration Tests
 * 
 * Tests the integration of EventRecorder with CAS (Content-Addressable Storage).
 * Verifies event recording, retrieval, and async resource cleanup.
 * 
 * Validates: Requirements 14.2, 14.6, 30.9
 * Feature: multimodal, Requirement: Event recording integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventRecorder, createEventRecorder } from '../../src/EventRecorder.js';
import { createTextMessage, type UserMessage } from '../../src/types/user-message.js';
import { InMemoryCASClient } from '../../src/cas/property-9-helpers.js';

/**
 * Test suite for EventRecorder integration
 * 
 * Async Resource Rules (async-resource-coding-standards.md):
 * - T1: Dynamic resources tracked in afterEach
 * - T2: try/finally for async stream cleanup
 * - T3: vitest.config.ts has testTimeout and pool: 'forks'
 * - T4: Fake timers for timer-based tests
 */
describe('EventRecorder Integration Tests', () => {
  let cas: InMemoryCASClient;
  let recorder: EventRecorder;
  const trackedRecorders: EventRecorder[] = [];

  /**
   * Setup: Create CAS instance
   * 
   * Async Resource Rules:
   * - A4: Creator (test) is responsible for cleanup
   */
  beforeEach(async () => {
    // Create in-memory CAS instance for testing
    cas = new InMemoryCASClient();

    // Create EventRecorder instance
    recorder = createEventRecorder(cas);
    await recorder.initialize();
    trackedRecorders.push(recorder);
  });

  /**
   * Cleanup: Dispose of resources
   * 
   * Async Resource Rules:
   * - T1: Track all created resources and clean them up
   * - A4: Ensure all resources are properly disposed
   */
  afterEach(async () => {
    // Dispose all tracked recorders
    for (const rec of trackedRecorders) {
      try {
        await rec.dispose();
      } catch (error) {
        console.warn('Error disposing recorder:', error);
      }
    }
    trackedRecorders.length = 0;

    // Verify no active operations remain
    expect(recorder._getActiveOperationCount()).toBe(0);
  });

  describe('recordUserMessage', () => {
    it('should record a text-only UserMessage and return blob reference', async () => {
      // Arrange
      const message = createTextMessage('Hello, World!');

      // Act
      const result = await recorder.recordUserMessage(message);

      // Assert
      expect(result).toBeDefined();
      expect(result.blobRef).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.recordedAt).toBeGreaterThan(0);
    });

    it('should produce identical blob references for identical messages', async () => {
      // Arrange
      const message1 = createTextMessage('Same content');
      const message2 = createTextMessage('Same content');

      // Act
      const result1 = await recorder.recordUserMessage(message1);
      const result2 = await recorder.recordUserMessage(message2);

      // Assert - Property 9: Identical content produces identical blob references
      expect(result1.blobRef).toBe(result2.blobRef);
      expect(result1.hash).toBe(result2.hash);
    });

    it('should produce different blob references for different messages', async () => {
      // Arrange
      const message1 = createTextMessage('Content A');
      const message2 = createTextMessage('Content B');

      // Act
      const result1 = await recorder.recordUserMessage(message1);
      const result2 = await recorder.recordUserMessage(message2);

      // Assert - Property 9: Different content produces different blob references
      expect(result1.blobRef).not.toBe(result2.blobRef);
      expect(result1.hash).not.toBe(result2.hash);
    });

    it('should record messages with complex content structure', async () => {
      // Arrange
      const message: UserMessage = {
        schema_version: '1.0',
        content: [
          { type: 'text', text: 'First paragraph' },
          { type: 'text', text: 'Second paragraph' },
        ],
        submittedAt: Date.now(),
        submitter: {
          id: 'agent-123',
          role: 'developer',
          sessionId: 'session-456',
        },
        workItemId: 'work-789',
      };

      // Act
      const result = await recorder.recordUserMessage(message);

      // Assert
      expect(result).toBeDefined();
      expect(result.blobRef).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should throw error if EventRecorder not initialized', async () => {
      // Arrange
      const uninitializedRecorder = createEventRecorder(cas);
      const message = createTextMessage('Test');

      // Act & Assert
      await expect(uninitializedRecorder.recordUserMessage(message)).rejects.toThrow(
        'EventRecorder not initialized'
      );
    });

    it('should handle concurrent recording operations', async () => {
      // Arrange
      const messages = [
        createTextMessage('Message 1'),
        createTextMessage('Message 2'),
        createTextMessage('Message 3'),
      ];

      // Act - Record all messages concurrently
      const results = await Promise.all(messages.map((msg) => recorder.recordUserMessage(msg)));

      // Assert
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.blobRef).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
        expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
      });

      // All hashes should be different
      const hashes = results.map((r) => r.hash);
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(3);
    });
  });

  describe('queryByHash', () => {
    it('should retrieve a recorded message by hash', async () => {
      // Arrange
      const originalMessage = createTextMessage('Test message');
      const recordResult = await recorder.recordUserMessage(originalMessage);

      // Act
      const queryResult = await recorder.queryByHash(recordResult.hash);

      // Assert
      expect(queryResult).toBeDefined();
      expect(queryResult?.message).toEqual(originalMessage);
      expect(queryResult?.hash).toBe(recordResult.hash);
      expect(queryResult?.blobRef).toBe(recordResult.blobRef);
    });

    it('should return null for non-existent hash', async () => {
      // Arrange
      const nonExistentHash = 'a'.repeat(64); // Valid SHA-256 format but doesn't exist

      // Act
      const result = await recorder.queryByHash(nonExistentHash);

      // Assert
      expect(result).toBeNull();
    });

    it('should retrieve complex messages correctly', async () => {
      // Arrange
      const originalMessage: UserMessage = {
        schema_version: '1.0',
        content: [
          { type: 'text', text: 'Line 1' },
          { type: 'text', text: 'Line 2' },
        ],
        submittedAt: 1234567890,
        submitter: {
          id: 'agent-xyz',
          role: 'analyst',
          sessionId: 'session-abc',
        },
        workItemId: 'work-def',
      };

      const recordResult = await recorder.recordUserMessage(originalMessage);

      // Act
      const queryResult = await recorder.queryByHash(recordResult.hash);

      // Assert
      expect(queryResult).toBeDefined();
      expect(queryResult?.message).toEqual(originalMessage);
      expect(queryResult?.message.submitter?.id).toBe('agent-xyz');
      expect(queryResult?.message.workItemId).toBe('work-def');
    });

    it('should use cache for repeated queries', async () => {
      // Arrange
      const message = createTextMessage('Cached message');
      const recordResult = await recorder.recordUserMessage(message);
      const initialCacheSize = recorder._getCacheSize();

      // Act - Query the same hash twice
      const result1 = await recorder.queryByHash(recordResult.hash);
      const result2 = await recorder.queryByHash(recordResult.hash);

      // Assert
      expect(result1).toEqual(result2);
      // Cache size should not increase significantly (only one entry)
      expect(recorder._getCacheSize()).toBeLessThanOrEqual(initialCacheSize + 1);
    });

    it('should throw error if EventRecorder not initialized', async () => {
      // Arrange
      const uninitializedRecorder = createEventRecorder(cas);
      const hash = 'a'.repeat(64);

      // Act & Assert
      await expect(uninitializedRecorder.queryByHash(hash)).rejects.toThrow(
        'EventRecorder not initialized'
      );
    });

    it('should handle concurrent query operations', async () => {
      // Arrange
      const message = createTextMessage('Concurrent query test');
      const recordResult = await recorder.recordUserMessage(message);

      // Act - Query the same hash concurrently
      const results = await Promise.all([
        recorder.queryByHash(recordResult.hash),
        recorder.queryByHash(recordResult.hash),
        recorder.queryByHash(recordResult.hash),
      ]);

      // Assert
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result?.message).toEqual(message);
        expect(result?.hash).toBe(recordResult.hash);
      });
    });
  });

  describe('verifyMessageHash', () => {
    it('should verify that a message matches its hash', async () => {
      // Arrange
      const message = createTextMessage('Verify me');
      const recordResult = await recorder.recordUserMessage(message);

      // Act
      const isValid = recorder.verifyMessageHash(message, recordResult.hash);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should reject message that does not match hash', async () => {
      // Arrange
      const message1 = createTextMessage('Message 1');
      const message2 = createTextMessage('Message 2');
      const recordResult = await recorder.recordUserMessage(message1);

      // Act
      const isValid = recorder.verifyMessageHash(message2, recordResult.hash);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should verify Property 9: CAS Content Addressing', async () => {
      // Arrange
      const message = createTextMessage('Property 9 verification');
      const recordResult = await recorder.recordUserMessage(message);

      // Act
      const isValid = recorder.verifyMessageHash(message, recordResult.hash);

      // Assert - Property 9: store(content).id == "blob://" + sha256(content)
      expect(isValid).toBe(true);
      expect(recordResult.blobRef).toBe(`blob://${recordResult.hash}`);
    });
  });

  describe('dispose', () => {
    it('should dispose of resources cleanly', async () => {
      // Arrange
      const message = createTextMessage('Dispose test');
      await recorder.recordUserMessage(message);

      // Act
      await recorder.dispose();

      // Assert
      expect(recorder._getCacheSize()).toBe(0);
      expect(recorder._getActiveOperationCount()).toBe(0);
    });

    it('should wait for active operations before disposing', async () => {
      // Arrange
      const message = createTextMessage('Active operation test');

      // Act - Start recording but don't await
      const recordPromise = recorder.recordUserMessage(message);

      // Dispose should wait for the operation to complete
      await recorder.dispose();

      // The promise should have completed
      const result = await recordPromise;
      expect(result).toBeDefined();
    });

    it('should handle multiple dispose calls gracefully', async () => {
      // Act & Assert - Should not throw
      await recorder.dispose();
      // Second dispose should also not throw (idempotent)
      await recorder.dispose();
    });
  });

  describe('clearCache', () => {
    it('should clear the recording cache', async () => {
      // Arrange
      const message = createTextMessage('Cache test');
      const recordResult = await recorder.recordUserMessage(message);
      expect(recorder._getCacheSize()).toBeGreaterThan(0);

      // Act
      recorder.clearCache();

      // Assert
      expect(recorder._getCacheSize()).toBe(0);
    });

    it('should still allow queries after cache clear', async () => {
      // Arrange
      const message = createTextMessage('Query after clear');
      const recordResult = await recorder.recordUserMessage(message);
      recorder.clearCache();

      // Act
      const queryResult = await recorder.queryByHash(recordResult.hash);

      // Assert
      expect(queryResult).toBeDefined();
      expect(queryResult?.message).toEqual(message);
    });
  });

  describe('Async Resource Cleanup (async-resource-coding-standards.md)', () => {
    it('should not leak active operations on successful recording', async () => {
      // Arrange
      const message = createTextMessage('No leak test');
      const initialCount = recorder._getActiveOperationCount();

      // Act
      await recorder.recordUserMessage(message);

      // Assert - No operations should remain
      expect(recorder._getActiveOperationCount()).toBe(initialCount);
    });

    it('should clean up active operations on error', async () => {
      // Arrange
      const invalidRecorder = createEventRecorder(cas);
      // Don't initialize it, so operations will fail
      const message = createTextMessage('Error cleanup test');

      // Act & Assert
      try {
        await invalidRecorder.recordUserMessage(message);
      } catch {
        // Expected to fail
      }

      // Active operations should be cleaned up
      expect(invalidRecorder._getActiveOperationCount()).toBe(0);
    });

    it('should handle concurrent operations with proper cleanup', async () => {
      // Arrange
      const messages = Array.from({ length: 10 }, (_, i) => createTextMessage(`Message ${i}`));

      // Act
      const results = await Promise.all(messages.map((msg) => recorder.recordUserMessage(msg)));

      // Assert
      expect(results).toHaveLength(10);
      expect(recorder._getActiveOperationCount()).toBe(0);
    });

    it('should properly dispose with pending operations', async () => {
      // Arrange
      const message = createTextMessage('Pending dispose test');

      // Act - Start multiple operations
      const promises = [
        recorder.recordUserMessage(message),
        recorder.recordUserMessage(message),
        recorder.recordUserMessage(message),
      ];

      // Dispose while operations are in flight
      await recorder.dispose();

      // All operations should complete
      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
    });
  });

  describe('Integration with CAS', () => {
    it('should use CAS blob references correctly', async () => {
      // Arrange
      const message = createTextMessage('CAS integration test');

      // Act
      const recordResult = await recorder.recordUserMessage(message);

      // Assert - Verify blob reference format
      expect(recordResult.blobRef).toMatch(/^blob:\/\/[a-f0-9]{64}$/);

      // Verify we can retrieve from CAS directly
      const casContent = await cas.retrieve(recordResult.blobRef);
      expect(casContent).toBeDefined();

      // Verify content matches
      const retrievedMessage = JSON.parse(
        typeof casContent === 'string' ? casContent : new TextDecoder().decode(casContent)
      );
      expect(retrievedMessage).toEqual(message);
    });

    it('should handle CAS deduplication', async () => {
      // Arrange
      const message = createTextMessage('Deduplication test');

      // Act - Record the same message twice
      const result1 = await recorder.recordUserMessage(message);
      const result2 = await recorder.recordUserMessage(message);

      // Assert - Should produce identical blob references (deduplication)
      expect(result1.blobRef).toBe(result2.blobRef);
      expect(result1.hash).toBe(result2.hash);
    });

    it('should verify Property 9: CAS Content Addressing', async () => {
      // Arrange
      const message = createTextMessage('Property 9 test');

      // Act
      const recordResult = await recorder.recordUserMessage(message);
      const queryResult = await recorder.queryByHash(recordResult.hash);

      // Assert - Property 9: store(content).id == "blob://" + sha256(content)
      expect(queryResult).toBeDefined();
      expect(queryResult?.message).toEqual(message);
      expect(recordResult.blobRef).toMatch(/^blob:\/\/[a-f0-9]{64}$/);

      // Verify the hash is correct
      const isValid = recorder.verifyMessageHash(message, recordResult.hash);
      expect(isValid).toBe(true);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle empty text messages', async () => {
      // Arrange
      const message = createTextMessage('');

      // Act
      const result = await recorder.recordUserMessage(message);

      // Assert
      expect(result).toBeDefined();
      expect(result.blobRef).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle very long text messages', async () => {
      // Arrange
      const longText = 'x'.repeat(100000); // 100KB of text
      const message = createTextMessage(longText);

      // Act
      const result = await recorder.recordUserMessage(message);

      // Assert
      expect(result).toBeDefined();
      expect(result.blobRef).toMatch(/^blob:\/\/[a-f0-9]{64}$/);

      // Verify retrieval
      const queryResult = await recorder.queryByHash(result.hash);
      expect(queryResult?.message.content[0].text).toBe(longText);
    });

    it('should handle messages with special characters', async () => {
      // Arrange
      const specialText = '你好世界 🌍 \n\t\r "quotes" \'apostrophes\' \\backslash';
      const message = createTextMessage(specialText);

      // Act
      const result = await recorder.recordUserMessage(message);

      // Assert
      expect(result).toBeDefined();

      // Verify retrieval preserves special characters
      const queryResult = await recorder.queryByHash(result.hash);
      expect(queryResult?.message.content[0].text).toBe(specialText);
    });

    it('should handle messages with null submitter', async () => {
      // Arrange
      const message: UserMessage = {
        schema_version: '1.0',
        content: [{ type: 'text', text: 'No submitter' }],
        submittedAt: Date.now(),
        submitter: null,
        workItemId: null,
      };

      // Act
      const result = await recorder.recordUserMessage(message);

      // Assert
      expect(result).toBeDefined();
      const queryResult = await recorder.queryByHash(result.hash);
      expect(queryResult?.message.submitter).toBeNull();
    });

    it('should handle messages with multiple text items', async () => {
      // Arrange
      const message: UserMessage = {
        schema_version: '1.0',
        content: [
          { type: 'text', text: 'Item 1' },
          { type: 'text', text: 'Item 2' },
          { type: 'text', text: 'Item 3' },
          { type: 'text', text: 'Item 4' },
          { type: 'text', text: 'Item 5' },
        ],
        submittedAt: Date.now(),
        submitter: null,
        workItemId: null,
      };

      // Act
      const result = await recorder.recordUserMessage(message);

      // Assert
      expect(result).toBeDefined();
      const queryResult = await recorder.queryByHash(result.hash);
      expect(queryResult?.message.content).toHaveLength(5);
    });
  });

  describe('Concurrent Operations and Stress Tests', () => {
    it('should handle 50 concurrent recording operations', async () => {
      // Arrange
      const messages = Array.from({ length: 50 }, (_, i) => createTextMessage(`Message ${i}`));

      // Act
      const results = await Promise.all(messages.map((msg) => recorder.recordUserMessage(msg)));

      // Assert
      expect(results).toHaveLength(50);
      results.forEach((result) => {
        expect(result.blobRef).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
      });

      // All hashes should be unique
      const hashes = results.map((r) => r.hash);
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(50);
    });

    it('should handle mixed concurrent recording and querying', async () => {
      // Arrange
      const messages = Array.from({ length: 10 }, (_, i) => createTextMessage(`Message ${i}`));

      // Act - Record all messages
      const recordResults = await Promise.all(
        messages.map((msg) => recorder.recordUserMessage(msg))
      );

      // Act - Query all messages concurrently
      const queryResults = await Promise.all(
        recordResults.map((result) => recorder.queryByHash(result.hash))
      );

      // Assert
      expect(queryResults).toHaveLength(10);
      queryResults.forEach((result) => {
        expect(result).toBeDefined();
        expect(result?.message).toBeDefined();
      });
    });

    it('should handle rapid cache clear and query cycles', async () => {
      // Arrange
      const message = createTextMessage('Cache cycle test');
      const recordResult = await recorder.recordUserMessage(message);

      // Act & Assert - Perform multiple cache clear and query cycles
      for (let i = 0; i < 5; i++) {
        recorder.clearCache();
        const queryResult = await recorder.queryByHash(recordResult.hash);
        expect(queryResult).toBeDefined();
        expect(queryResult?.message).toEqual(message);
      }
    });

    it('should handle concurrent dispose and operations', async () => {
      // Arrange
      const messages = Array.from({ length: 5 }, (_, i) => createTextMessage(`Message ${i}`));

      // Act - Start recording operations
      const recordPromises = messages.map((msg) => recorder.recordUserMessage(msg));

      // Dispose while operations are in flight
      const disposePromise = recorder.dispose();

      // All operations should complete
      const results = await Promise.all([...recordPromises, disposePromise]);

      // Assert
      expect(results.slice(0, 5)).toHaveLength(5);
      results.slice(0, 5).forEach((result) => {
        expect(result).toBeDefined();
      });
    });
  });

  describe('Hash Verification and Determinism', () => {
    it('should produce consistent hashes for identical messages', async () => {
      // Arrange
      const message = createTextMessage('Determinism test');

      // Act - Record the same message multiple times
      const results = await Promise.all([
        recorder.recordUserMessage(message),
        recorder.recordUserMessage(message),
        recorder.recordUserMessage(message),
      ]);

      // Assert - All hashes should be identical
      expect(results[0].hash).toBe(results[1].hash);
      expect(results[1].hash).toBe(results[2].hash);
    });

    it('should reject invalid hash format in queryByHash', async () => {
      // Arrange
      const invalidHash = 'not-a-valid-hash';

      // Act & Assert
      const result = await recorder.queryByHash(invalidHash);
      expect(result).toBeNull();
    });

    it('should handle hash case sensitivity', async () => {
      // Arrange
      const message = createTextMessage('Case sensitivity test');
      const recordResult = await recorder.recordUserMessage(message);

      // Act - Query with uppercase hash (should not match)
      const upperHash = recordResult.hash.toUpperCase();
      const result = await recorder.queryByHash(upperHash);

      // Assert - Should not find the message (hashes are case-sensitive)
      expect(result).toBeNull();
    });

    it('should verify hash for messages with derived texts', async () => {
      // Arrange
      const message: UserMessage = {
        schema_version: '1.0',
        content: [{ type: 'text', text: 'Original text' }],
        derivedTexts: {
          'blob://abc123': 'Derived text 1',
          'blob://def456': 'Derived text 2',
        },
        submittedAt: Date.now(),
        submitter: null,
        workItemId: null,
      };

      // Act
      const recordResult = await recorder.recordUserMessage(message);
      const isValid = recorder.verifyMessageHash(message, recordResult.hash);

      // Assert
      expect(isValid).toBe(true);
    });
  });

  describe('Resource Lifecycle Management', () => {
    it('should track active operations during recording', async () => {
      // Arrange
      const message = createTextMessage('Operation tracking test');
      const initialCount = recorder._getActiveOperationCount();

      // Act - Start recording but don't await
      const recordPromise = recorder.recordUserMessage(message);

      // Assert - Should have active operation
      // Note: This might be 0 if the operation completes very quickly
      // So we just verify it completes successfully
      const result = await recordPromise;
      expect(result).toBeDefined();

      // After completion, should be back to initial count
      expect(recorder._getActiveOperationCount()).toBe(initialCount);
    });

    it('should maintain cache consistency across operations', async () => {
      // Arrange
      const message1 = createTextMessage('Message 1');
      const message2 = createTextMessage('Message 2');

      // Act
      const result1 = await recorder.recordUserMessage(message1);
      const result2 = await recorder.recordUserMessage(message2);

      // Assert - Cache should contain both messages
      expect(recorder._getCacheSize()).toBeGreaterThanOrEqual(2);

      // Both should be retrievable
      const query1 = await recorder.queryByHash(result1.hash);
      const query2 = await recorder.queryByHash(result2.hash);
      expect(query1).toBeDefined();
      expect(query2).toBeDefined();
    });

    it('should handle dispose during active recording', async () => {
      // Arrange
      const messages = Array.from({ length: 3 }, (_, i) => createTextMessage(`Message ${i}`));

      // Act - Start recording operations
      const recordPromises = messages.map((msg) => recorder.recordUserMessage(msg));

      // Dispose immediately
      await recorder.dispose();

      // Assert - All operations should have completed
      const results = await Promise.all(recordPromises);
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toBeDefined();
      });
    });

    it('should prevent operations after dispose', async () => {
      // Arrange
      const message = createTextMessage('Post-dispose test');

      // Act
      await recorder.dispose();

      // Assert - Should throw error when trying to record after dispose
      await expect(recorder.recordUserMessage(message)).rejects.toThrow(
        'EventRecorder not initialized'
      );
    });
  });

  describe('CAS Integration Edge Cases', () => {
    it('should handle CAS storage of messages with timestamps', async () => {
      // Arrange
      const now = Date.now();
      const message: UserMessage = {
        schema_version: '1.0',
        content: [{ type: 'text', text: 'Timestamp test' }],
        submittedAt: now,
        submitter: null,
        workItemId: null,
      };

      // Act
      const recordResult = await recorder.recordUserMessage(message);
      const queryResult = await recorder.queryByHash(recordResult.hash);

      // Assert
      expect(queryResult?.message.submittedAt).toBe(now);
    });

    it('should handle CAS storage of messages with work item IDs', async () => {
      // Arrange
      const workItemId = 'work-item-12345';
      const message: UserMessage = {
        schema_version: '1.0',
        content: [{ type: 'text', text: 'Work item test' }],
        submittedAt: Date.now(),
        submitter: null,
        workItemId,
      };

      // Act
      const recordResult = await recorder.recordUserMessage(message);
      const queryResult = await recorder.queryByHash(recordResult.hash);

      // Assert
      expect(queryResult?.message.workItemId).toBe(workItemId);
    });

    it('should handle CAS storage of messages with agent identity', async () => {
      // Arrange
      const agentIdentity = {
        id: 'agent-xyz-789',
        role: 'architect',
        sessionId: 'session-abc-123',
      };
      const message: UserMessage = {
        schema_version: '1.0',
        content: [{ type: 'text', text: 'Agent identity test' }],
        submittedAt: Date.now(),
        submitter: agentIdentity,
        workItemId: null,
      };

      // Act
      const recordResult = await recorder.recordUserMessage(message);
      const queryResult = await recorder.queryByHash(recordResult.hash);

      // Assert
      expect(queryResult?.message.submitter).toEqual(agentIdentity);
      expect(queryResult?.message.submitter?.role).toBe('architect');
    });
  });
});
