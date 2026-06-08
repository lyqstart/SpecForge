/**
 * AgentWorkflowEngine Tests
 * Tests for AgentWorkflowEngine integration with Agent system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentWorkflowEngine, createAgentWorkflowEngine } from '../../src/engine/AgentWorkflowEngine.js';
import { WorkflowAgentRunner, createWorkflowAgentRunner } from '../../src/AgentRunner.js';
import { 
  WorkflowDefinition, 
  WorkflowInstance, 
  SimpleGateDefinition,
  CompositeGateDefinition 
} from '../../src/types.js';

describe('AgentWorkflowEngine', () => {
  let agentEngine: AgentWorkflowEngine;
  let agentRunner: WorkflowAgentRunner;
  let testWorkflow: WorkflowDefinition;

  beforeEach(() => {
    // Create agent runner
    agentRunner = createWorkflowAgentRunner();
    
    // Create agent workflow engine
    agentEngine = createAgentWorkflowEngine({
      agentRunner,
      defaultAgentRole: 'general',
    });

    // Create test workflow with agent-based states
    testWorkflow = {
      schema_version: '1.0',
      id: 'agent-test-workflow',
      displayName: 'Agent Test Workflow',
      intent: 'Workflow for testing agent integration',
      stateMachine: {
        schema_version: '1.0',
        initial: 'requirements',
        states: {
          requirements: {
            schema_version: '1.0',
            agent: 'requirements',
            gate: {
              schema_version: '1.0',
              type: 'simple',
              id: 'req-gate',
              name: 'Requirements Gate',
              checkFn: () => Promise.resolve({
                schema_version: '1.0',
                passed: true,
                reason: 'Requirements check passed',
              }),
            },
            skills: ['requirements-analysis'],
            next: 'design',
          },
          design: {
            schema_version: '1.0',
            agent: 'design',
            gate: {
              schema_version: '1.0',
              type: 'simple',
              id: 'design-gate',
              name: 'Design Gate',
              checkFn: () => Promise.resolve({
                schema_version: '1.0',
                passed: true,
                reason: 'Design check passed',
              }),
            },
            skills: ['design-review'],
            next: 'implementation',
          },
          implementation: {
            schema_version: '1.0',
            agent: 'dev',
            gate: {
              schema_version: '1.0',
              type: 'simple',
              id: 'impl-gate',
              name: 'Implementation Gate',
              checkFn: () => Promise.resolve({
                schema_version: '1.0',
                passed: true,
                reason: 'Implementation check passed',
              }),
            },
            skills: ['implementation'],
            next: 'verification',
          },
          verification: {
            schema_version: '1.0',
            agent: 'verifier',
            gate: {
              schema_version: '1.0',
              type: 'simple',
              id: 'verify-gate',
              name: 'Verification Gate',
              checkFn: () => Promise.resolve({
                schema_version: '1.0',
                passed: true,
                reason: 'Verification check passed',
              }),
            },
            skills: ['verification'],
            next: undefined,
          },
        },
      },
      artifacts: [],
    };
  });

  afterEach(async () => {
    // Clean up any active agents
    const scheduler = agentRunner.getScheduler();
    await scheduler.cancelAll();
  });

  describe('Basic functionality', () => {
    it('should create AgentWorkflowEngine with default configuration', () => {
      const engine = createAgentWorkflowEngine();
      
      expect(engine).toBeInstanceOf(AgentWorkflowEngine);
      expect(engine.getAgentRunner()).toBeDefined();
      expect(engine.getDefaultAgentRole()).toBe('general');
    });

    it('should create AgentWorkflowEngine with custom configuration', () => {
      const customRunner = createWorkflowAgentRunner();
      const engine = createAgentWorkflowEngine({
        agentRunner: customRunner,
        defaultAgentRole: 'dev',
      });
      
      expect(engine.getAgentRunner()).toBe(customRunner);
      expect(engine.getDefaultAgentRole()).toBe('dev');
    });

    it('should set and get agent runner', () => {
      const newRunner = createWorkflowAgentRunner();
      agentEngine.setAgentRunner(newRunner);
      
      expect(agentEngine.getAgentRunner()).toBe(newRunner);
    });

    it('should set and get default agent role', () => {
      agentEngine.setDefaultAgentRole('reviewer');
      
      expect(agentEngine.getDefaultAgentRole()).toBe('reviewer');
    });
  });

  describe('Workflow execution with agent integration', () => {
    it('should load and execute workflow with agent-based states', async () => {
      // Load workflow
      agentEngine.loadWorkflow(testWorkflow);
      
      // Create instance
      const instance = agentEngine.createInstance(testWorkflow.id);
      
      expect(instance).toBeDefined();
      expect(instance.currentState).toBe('requirements');
      expect(instance.status).toBe('pending');
    });

    it('should create agent gate runner', () => {
      const gate: SimpleGateDefinition = {
        schema_version: '1.0',
        type: 'simple',
        id: 'test-gate',
        name: 'Test Gate',
      };
      
      const agentGateRunner = agentEngine.createAgentGateRunner(gate, 'dev', { custom: 'context' });
      
      expect(agentGateRunner).toBeDefined();
      expect(agentGateRunner.getAgentRunner()).toBe(agentRunner);
      expect(agentGateRunner.getAgentRole()).toBe('dev');
    });

    it('should determine agent role for state', () => {
      // Load workflow first
      agentEngine.loadWorkflow(testWorkflow);
      
      // Get the requirements state
      const state = testWorkflow.stateMachine.states.requirements;
      
      // This is a private method, but we can test through public API
      // by creating an instance and executing
      const instance = agentEngine.createInstance(testWorkflow.id);
      
      // Mock agent execution to verify role determination
      const mockExecuteAgentGate = vi.spyOn(agentEngine as any, 'executeAgentGate')
        .mockResolvedValue({
          schema_version: '1.0',
          passed: true,
          reason: 'Mock execution',
        });

      // This will trigger agent role determination
      agentEngine.execute(instance.id).catch(() => {
        // Ignore errors since we're mocking
      });
      
      // Verify that agent gate execution was attempted
      expect(mockExecuteAgentGate).toHaveBeenCalled();
      
      mockExecuteAgentGate.mockRestore();
    });
  });

  describe('Agent gate execution', () => {
    it('should execute agent gate for agent-based state', async () => {
      // Load workflow
      agentEngine.loadWorkflow(testWorkflow);
      
      // Create instance
      const instance = agentEngine.createInstance(testWorkflow.id);
      
      // Mock agent execution
      const mockRunAgentForState = vi.spyOn(agentRunner, 'runAgentForState')
        .mockResolvedValue({
          schema_version: '1.0',
          success: true,
          sessionId: 'test-session',
          output: 'Agent completed requirements analysis',
          duration: 150,
        });

      // Execute the workflow
      const result = await agentEngine.execute(instance.id);
      
      // Verify agent was called for requirements state
      expect(mockRunAgentForState).toHaveBeenCalledWith(
        'requirements',
        'req-gate',
        expect.stringContaining('Requirements Gate'),
        expect.any(Object)
      );
      
      expect(result.status).toBe('completed');
      
      mockRunAgentForState.mockRestore();
    });

    it('should handle agent execution failure', async () => {
      // Load workflow
      agentEngine.loadWorkflow(testWorkflow);
      
      // Create instance
      const instance = agentEngine.createInstance(testWorkflow.id);
      
      // Mock agent execution to fail
      const mockRunAgentForState = vi.spyOn(agentRunner, 'runAgentForState')
        .mockResolvedValue({
          schema_version: '1.0',
          success: false,
          sessionId: 'fail-session',
          error: 'Agent failed to analyze requirements',
          duration: 100,
        });

      // v1.1 strict: gate failed + string next → throws (unconsumed gate result)
      // This is correct behavior — gate failure must not silently proceed
      await expect(agentEngine.execute(instance.id)).rejects.toThrow('unconsumed');
      
      mockRunAgentForState.mockRestore();
    });

    it('should use default agent role when state has no agent specified', async () => {
      // Create workflow with state that has no agent specified
      const noAgentWorkflow: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'no-agent-workflow',
        displayName: 'No Agent Workflow',
        intent: 'Workflow without explicit agent specification',
        stateMachine: {
          schema_version: '1.0',
          initial: 'start',
          states: {
            start: {
              schema_version: '1.0',
              agent: 'none', // Explicitly no agent
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'start-gate',
                name: 'Start Gate',
                checkFn: () => Promise.resolve({
                  schema_version: '1.0',
                  passed: true,
                  reason: 'Start check passed',
                }),
              },
              skills: [],
              next: undefined,
            },
          },
        },
        artifacts: [],
      };
      
      agentEngine.loadWorkflow(noAgentWorkflow);
      const instance = agentEngine.createInstance(noAgentWorkflow.id);
      
      // Mock to verify no agent execution
      const mockRunAgentForState = vi.spyOn(agentRunner, 'runAgentForState');
      
      await agentEngine.execute(instance.id);
      
      // Should not call agent for state with agent: 'none'
      expect(mockRunAgentForState).not.toHaveBeenCalled();
      
      mockRunAgentForState.mockRestore();
    });
  });

  describe('Integration with parent WorkflowEngine', () => {
    it('should inherit WorkflowEngine functionality', () => {
      // Load workflow
      agentEngine.loadWorkflow(testWorkflow);
      
      // Verify inherited methods work
      const workflow = agentEngine.getWorkflow(testWorkflow.id);
      expect(workflow).toBeDefined();
      expect(workflow?.id).toBe(testWorkflow.id);
      
      const instance = agentEngine.createInstance(testWorkflow.id);
      expect(instance).toBeDefined();
      
      const retrievedInstance = agentEngine.getInstance(instance.id);
      expect(retrievedInstance).toBeDefined();
      expect(retrievedInstance?.id).toBe(instance.id);
    });

    it('should handle non-agent gates through parent implementation', async () => {
      // Create workflow with simple gate (no agent)
      const simpleWorkflow: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'simple-workflow',
        displayName: 'Simple Workflow',
        intent: 'Workflow with simple gates',
        stateMachine: {
          schema_version: '1.0',
          initial: 'check',
          states: {
            check: {
              schema_version: '1.0',
              agent: 'none',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'simple-gate',
                name: 'Simple Gate',
                checkFn: () => Promise.resolve({
                  schema_version: '1.0',
                  passed: true,
                  reason: 'Simple check passed',
                }),
              },
              skills: [],
              next: undefined,
            },
          },
        },
        artifacts: [],
      };
      
      agentEngine.loadWorkflow(simpleWorkflow);
      const instance = agentEngine.createInstance(simpleWorkflow.id);
      
      // Execute should work without agent integration
      const result = await agentEngine.execute(instance.id);
      
      expect(result.status).toBe('completed');
      expect(result.currentState).toBe('check');
    });
  });
});