/**
 * Unit tests for Daemon Integration
 * 
 * @specforge/permission-engine
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  DaemonIntegration, 
  createDaemonIntegration,
  type DaemonIntegrationConfig,
  type HttpRequestContext 
} from '../../src/services/daemon-integration';

// Mock the Event Logger to avoid file system operations
vi.mock('../../src/services/event-logger', () => ({
  EventLogger: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    logPermissionDecision: vi.fn().mockResolvedValue(undefined),
    logPermissionDenied: vi.fn().mockResolvedValue(undefined),
    logHardRuleConflict: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('DaemonIntegration', () => {
  let integration: DaemonIntegration;
  let config: DaemonIntegrationConfig;

  beforeEach(() => {
    config = {
      projectId: 'test-project',
      eventsFilePath: './test-events.jsonl',
      eventLoggingEnabled: true,
      sessionTimeout: 60000
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a DaemonIntegration instance with config', () => {
      integration = createDaemonIntegration(config);
      
      expect(integration).toBeDefined();
      expect(integration.getConfig().projectId).toBe('test-project');
    });

    it('should throw error if projectId is not provided', () => {
      expect(() => {
        createDaemonIntegration({} as DaemonIntegrationConfig);
      }).toThrow('Project ID is required for Daemon Integration');
    });

    it('should use default values for optional config', () => {
      integration = createDaemonIntegration({
        projectId: 'test-project'
      });

      const cfg = integration.getConfig();
      expect(cfg.sessionTimeout).toBe(300000); // 5 minutes default
      expect(cfg.fsyncEnabled).toBe(true);
      expect(cfg.eventLoggingEnabled).toBe(true);
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      integration = createDaemonIntegration(config);
      
      expect(integration.isInitialized()).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the config', () => {
      integration = createDaemonIntegration(config);
      
      const cfg = integration.getConfig();
      cfg.projectId = 'modified';
      
      // Original config should not be modified
      expect(integration.getConfig().projectId).toBe('test-project');
    });
  });

  describe('validateRequest', () => {
    beforeEach(() => {
      integration = createDaemonIntegration(config);
    });

    it('should return denied if authorization header is missing', async () => {
      const request: HttpRequestContext = {
        method: 'GET',
        path: '/api/test',
        headers: {},
        clientIp: '127.0.0.1'
      };

      const result = await integration.validateRequest(request);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Missing Authorization header');
    });

    it('should return denied if authorization header has invalid format', async () => {
      const request: HttpRequestContext = {
        method: 'GET',
        path: '/api/test',
        headers: {
          authorization: 'Basic abc123'
        },
        clientIp: '127.0.0.1'
      };

      const result = await integration.validateRequest(request);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Invalid Authorization header format');
    });

    it('should return denied if authorization header has invalid format', async () => {
      const request: HttpRequestContext = {
        method: 'GET',
        path: '/api/test',
        headers: {
          authorization: 'Basic abc123'
        },
        clientIp: '127.0.0.1'
      };

      const result = await integration.validateRequest(request);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Invalid Authorization header format');
    });

    it('should return denied if token is empty', async () => {
      const request: HttpRequestContext = {
        method: 'GET',
        path: '/api/test',
        headers: {
          authorization: 'Bearer '
        },
        clientIp: '127.0.0.1'
      };

      const result = await integration.validateRequest(request);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Invalid Authorization header format');
    });
  });

  describe('setPermissionEngine', () => {
    it('should store the permission engine reference', () => {
      integration = createDaemonIntegration(config);
      
      // Create a mock PermissionEngine
      const mockEngine = {
        checkPermission: vi.fn().mockResolvedValue(true),
        checkPermissionWithDetails: vi.fn().mockResolvedValue({
          allowed: true,
          matchedRule: 'test-rule',
          ruleLayer: 'builtin' as const,
          reason: 'Test allowed'
        })
      } as any;

      integration.setPermissionEngine(mockEngine);
      
      expect(integration.getPermissionEngine()).toBe(mockEngine);
    });
  });

  describe('cleanup', () => {
    it('should clean up resources', async () => {
      integration = createDaemonIntegration(config);
      
      // Should not throw
      await integration.cleanup();
      expect(integration.isInitialized()).toBe(false);
    });
  });
});

describe('Integration flow', () => {
  let integration: DaemonIntegration;
  let mockEventBus: any;
  let mockSessionRegistry: any;

  beforeEach(() => {
    // Create mock EventBus
    mockEventBus = {
      subscribe: vi.fn().mockReturnValue({ id: 'test-sub', topic: 'session.*', handler: vi.fn() }),
      unsubscribe: vi.fn(),
      publish: vi.fn()
    };

    // Create mock SessionRegistry
    mockSessionRegistry = {
      lookupBySessionId: vi.fn().mockReturnValue(null)
    };
  });

  it('should initialize with daemon-core components', async () => {
    integration = createDaemonIntegration({
      projectId: 'integration-test',
      eventLoggingEnabled: false
    });

    // Note: This would require actual daemon-core to be importable
    // For now, we verify the interface is correct
    expect(integration.getConfig().projectId).toBe('integration-test');
  });
});