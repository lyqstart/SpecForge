/**
 * AgentGateRunner Tests
 * Tests for AgentGateRunner integration with Agent system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentGateRunner, createAgentGateRunner } from '../../src/gates/AgentGateRunner.js';
import { WorkflowAgentRunner, createWorkflowAgentRunner } from '../../src/AgentRunner.js';
import { SimpleGateDefinition, WorkflowInstance, WorkflowDefinition } from '../../src/types.js';

describe('AgentGateRunner', () => {
  let agentRunner: WorkflowAgentRunner;
  let mockGate: SimpleGateDefinition;
  let mockContext: any;

  beforeEach(() => {
    // Create mock agent runner
    agentRunner = createWorkflowAgentRunner();

    // Create mock gate definition
    mockGate = {
      schema_version: '1.0',
      type: 'simple',
      id: 'test-agent-gate',
      name: 'Test Agent Gate',
    };

    // Create mock workflow context
    mockContext = {
      instance: {
        schema_version: '1.0',
        id: 'test-instance',
        workflowId: 'test-workflow',
        currentState: 'requirements',
        status: 'running',
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as WorkflowInstance,
      definition: {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test Workflow',
        intent: 'Test workflow for agent integration',
        stateMachine: {
          schema_version: '1.0',
          initial: 'requirements',
          states: {
            requirements: {
              schema_version: '1.0',
              agent: 'requirements',
              gate: mockGate,
              skills: ['requirements-analysis'],
              next: 'design',
            },
          },
        },
        artifacts: [],
      } as WorkflowDefinition,
    };
  });

  afterEach(async () => {
    // Clean up any active agents
    const scheduler = agentRunner.getScheduler();
    await scheduler.cancelAll();
  });

  describe('Basic functionality', () => {
    it('should create AgentGateRunner with default configuration', () => {
      const runner = createAgentGateRunner(mockGate, agentRunner);
      
      expect(runner).toBeInstanceOf(AgentGateRunner);
      expect(runner.getAgentRunner()).toBe(agentRunner);
      expect(runner.getAgentRole()).toBe('general');
    });

    it('should create AgentGateRunner with custom agent role', () => {
      const runner = createAgentGateRunner(mockGate, agentRunner, 'dev');
      
      expect(runner.getAgentRole()).toBe('dev');
    });

    it('should create AgentGateRunner with custom context', () => {
      const customContext = { customField: 'value' };
      const runner = createAgentGateRunner(mockGate, agentRunner, 'general', customContext);
      
      expect(runner.getContext()).toEqual(customContext);
    });

    it('should set and get agent role', () => {
      const runner = createAgentGateRunner(mockGate, agentRunner);
      
      runner.setAgentRole('design');
      expect(runner.getAgentRole()).toBe('design');
    });
  });

  describe('Gate execution', () => {
    // AgentRunner uses real setTimeout for timeout handling and processing simulation
    // Global setup enables fake timers which blocks these
    beforeEach(() => { vi.useRealTimers(); });
    afterEach(() => { vi.useFakeTimers(); });

    it('should execute agent gate successfully', async () => {
      const runner = createAgentGateRunner(mockGate, agentRunner, 'requirements');
      
      const result = await runner.check(mockContext);
      
      expect(result.passed).toBe(true);
      expect(result.schema_version).toBe('1.0');
      expect(result.reason).toContain('Agent execution successful');
      expect(result.details?.agentResult).toBeDefined();
      expect(result.details?.sessionId).toBeDefined();
    });

    it('should handle agent execution failure', async () => {
      const runner = createAgentGateRunner(mockGate, agentRunner, 'dev');
      
      // Create a context that will trigger failure
      const failureContext = {
        ...mockContext,
        instance: {
          ...mockContext.instance,
          currentState: 'implementation',
        },
      };
      
      // Mock the agent runner to simulate failure
      const mockRunAgentForState = vi.spyOn(agentRunner, 'runAgentForState')
        .mockResolvedValue({
          schema_version: '1.0',
          success: false,
          sessionId: 'fail-session',
          error: 'Simulated agent failure',
          duration: 100,
        });

      const result = await runner.check(failureContext);
      
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Agent execution failed');
      expect(result.details?.error).toBe('Simulated agent failure');
      
      mockRunAgentForState.mockRestore();
    });

    it('should use custom prompt from context', async () => {
      const customContext = {
        ...mockContext,
        prompt: 'Custom prompt for agent execution',
      };
      
      const runner = createAgentGateRunner(mockGate, agentRunner, 'general', customContext);
      
      const mockRunAgentForState = vi.spyOn(agentRunner, 'runAgentForState')
        .mockResolvedValue({
          schema_version: '1.0',
          success: true,
          sessionId: 'test-session',
          output: 'Agent completed',
          duration: 100,
        });

      await runner.check(mockContext);
      
      // Check that custom prompt was used
      // Note: agent role will be determined from state name 'requirements', not 'general'
      expect(mockRunAgentForState).toHaveBeenCalledWith(
        'requirements', // Determined from state name, not the 'general' we passed
        'test-agent-gate',
        'Custom prompt for agent execution',
        expect.any(Object)
      );
      
      mockRunAgentForState.mockRestore();
    });

    it('should determine agent role from state name', async () => {
      const runner = createAgentGateRunner(mockGate, agentRunner, 'general');
      
      const mockRunAgentForState = vi.spyOn(agentRunner, 'runAgentForState')
        .mockResolvedValue({
          schema_version: '1.0',
          success: true,
          sessionId: 'test-session',
          output: 'Agent completed',
          duration: 100,
        });

      await runner.check(mockContext);
      
      // Check that agent role was determined from state name 'requirements'
      expect(mockRunAgentForState).toHaveBeenCalledWith(
        'requirements', // Determined from state name
        'test-agent-gate',
        expect.any(String),
        expect.any(Object)
      );
      
      mockRunAgentForState.mockRestore();
    });

    it('should handle missing workflow context', async () => {
      const runner = createAgentGateRunner(mockGate, agentRunner);
      
      // @ts-expect-error: Testing error case
      const result = await runner.check();
      
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Workflow context is required');
    });
  });

  describe('Error handling', () => {
    it('should handle agent runner errors', async () => {
      const runner = createAgentGateRunner(mockGate, agentRunner);
      
      // Mock agent runner to throw error
      const mockRunAgentForState = vi.spyOn(agentRunner, 'runAgentForState')
        .mockRejectedValue(new Error('Agent runner error'));

      const result = await runner.check(mockContext);
      
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Agent runner error');
      
      mockRunAgentForState.mockRestore();
    });

    it('should handle invalid gate definition', async () => {
      const invalidGate = {
        schema_version: '1.0',
        type: 'simple',
        id: '', // Empty ID should trigger validation error
        name: 'Invalid Gate',
      } as SimpleGateDefinition;
      
      const runner = createAgentGateRunner(invalidGate, agentRunner);
      
      const result = await runner.check(mockContext);
      
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Gate definition must have an id');
    });
  });
});