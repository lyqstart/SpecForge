/**
 * Unit tests for EventLogger (Task 7.2: Event logging)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventLogger } from '../src/event-logger/EventLogger';

describe('EventLogger', () => {
  let eventLogger: EventLogger;

  beforeEach(() => {
    eventLogger = new EventLogger({ verboseLogging: false });
  });

  describe('logVersionMismatch', () => {
    it('should create version mismatch event', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      eventLogger.logVersionMismatch({
        detectedVersion: '1.13.0',
        requiredRange: '>=1.14.0 <2.0.0',
        reason: 'Version too low',
        suggestedAction: 'upgrade_adapter',
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should support custom project ID', () => {
      const customLogger = new EventLogger({ projectId: 'custom-project' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      customLogger.logVersionMismatch({
        detectedVersion: '1.13.0',
        requiredRange: '>=1.14.0',
        reason: 'Version mismatch',
        suggestedAction: 'check_versions',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[EventLogger] adapter.version_mismatch',
        expect.objectContaining({
          projectId: 'custom-project',
        })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('logTranslationFailure', () => {
    it('should create translation failure event', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      eventLogger.logTranslationFailure({
        sessionId: 'session-123',
        translationType: 'event',
        inputType: 'unknown_event_type',
        reason: 'Unsupported event type',
        unsupported: true,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[EventLogger] translation.failure',
        expect.objectContaining({
          payload: expect.objectContaining({
            sessionId: 'session-123',
            translationType: 'event',
            unsupported: true,
          }),
        })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('logSessionLifecycle', () => {
    it('should create session lifecycle event for created', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      eventLogger.logSessionLifecycle({
        sessionId: 'session-456',
        spawnIntentId: 'intent-789',
        event: 'created',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[EventLogger] session.lifecycle',
        expect.objectContaining({
          payload: expect.objectContaining({
            sessionId: 'session-456',
            event: 'created',
          }),
        })
      );
      consoleSpy.mockRestore();
    });

    it('should create session lifecycle event for activated', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      eventLogger.logSessionLifecycle({
        sessionId: 'session-456',
        event: 'activated',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[EventLogger] session.lifecycle',
        expect.objectContaining({
          payload: expect.objectContaining({
            sessionId: 'session-456',
            event: 'activated',
          }),
        })
      );
      consoleSpy.mockRestore();
    });

    it('should create session lifecycle event for cancelled with reason', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      eventLogger.logSessionLifecycle({
        sessionId: 'session-456',
        event: 'cancelled',
        reason: 'User requested cancellation',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[EventLogger] session.lifecycle',
        expect.objectContaining({
          payload: expect.objectContaining({
            sessionId: 'session-456',
            event: 'cancelled',
            reason: 'User requested cancellation',
          }),
        })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('logIntegrationError', () => {
    it('should create integration error event', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      eventLogger.logIntegrationError({
        sessionId: 'session-789',
        errorType: 'thin_plugin',
        code: 'ECONNREFUSED',
        message: 'Connection refused',
        recoverable: true,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[EventLogger] integration.error',
        expect.objectContaining({
          payload: expect.objectContaining({
            sessionId: 'session-789',
            errorType: 'thin_plugin',
            recoverable: true,
          }),
        })
      );
      consoleSpy.mockRestore();
    });

    it('should handle unknown error type', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      eventLogger.logIntegrationError({
        errorType: 'unknown',
        message: 'Unknown error occurred',
        recoverable: false,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[EventLogger] integration.error',
        expect.objectContaining({
          payload: expect.objectContaining({
            errorType: 'unknown',
            recoverable: false,
          }),
        })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('setEventBus', () => {
    it('should accept event bus and publish events', () => {
      const mockEventBus = {
        publish: vi.fn(),
      };
      
      eventLogger.setEventBus(mockEventBus);
      
      eventLogger.logVersionMismatch({
        detectedVersion: '1.0.0',
        requiredRange: '>=1.14.0',
        reason: 'Version too low',
        suggestedAction: 'upgrade_adapter',
      });

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'adapter.version_mismatch',
          payload: expect.objectContaining({
            detectedVersion: '1.0.0',
          }),
        })
      );
    });

    it('should handle event bus publish errors gracefully', () => {
      const mockEventBus = {
        publish: vi.fn().mockImplementation(() => {
          throw new Error('Event bus error');
        }),
      };
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      eventLogger.setEventBus(mockEventBus);
      
      eventLogger.logVersionMismatch({
        detectedVersion: '1.0.0',
        requiredRange: '>=1.14.0',
        reason: 'Version too low',
        suggestedAction: 'upgrade_adapter',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[EventLogger] Failed to publish event to Event Bus:',
        expect.any(Error)
      );
      // Should also log to console as fallback
      expect(logSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe('verboseLogging', () => {
    it('should log detailed info when verboseLogging is enabled', () => {
      const verboseLogger = new EventLogger({ verboseLogging: true });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      verboseLogger.logSessionLifecycle({
        sessionId: 'session-123',
        event: 'created',
      });

      // Should log both the event and the publishing info
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith(
        '[EventLogger] Publishing event: session.lifecycle',
        expect.any(Object)
      );
      
      consoleSpy.mockRestore();
    });
  });
});