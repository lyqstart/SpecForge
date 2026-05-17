/**
 * Agent Integration Example
 * Demonstrates how to use AgentWorkflowEngine for agent-based workflow execution
 */

import { AgentWorkflowEngine, createAgentWorkflowEngine } from '../src/engine/AgentWorkflowEngine.js';
import { createWorkflowAgentRunner } from '../src/AgentRunner.js';
import { WorkflowDefinition } from '../src/types.js';

/**
 * Example 1: Basic Agent Workflow Execution
 */
async function example1() {
  console.log('=== Example 1: Basic Agent Workflow Execution ===');

  // Create agent workflow engine
  const agentEngine = createAgentWorkflowEngine({
    defaultAgentRole: 'dev',
  });

  // Define a workflow with agent-based states
  const workflow: WorkflowDefinition = {
    schema_version: '1.0',
    id: 'agent-example-workflow',
    displayName: 'Agent Example Workflow',
    intent: 'Demonstrate agent integration in workflow',
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
            name: 'Requirements Analysis Gate',
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
            name: 'Design Review Gate',
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
          },
          skills: ['verification'],
          next: undefined,
        },
      },
    },
    artifacts: [],
  };

  // Load the workflow
  agentEngine.loadWorkflow(workflow);

  // Create a workflow instance
  const instance = agentEngine.createInstance(workflow.id);
  console.log(`Created workflow instance: ${instance.id}`);
  console.log(`Initial state: ${instance.currentState}`);

  // Execute the workflow
  console.log('Starting workflow execution with agent integration...');
  const result = await agentEngine.execute(instance.id);

  console.log(`Workflow completed with status: ${result.status}`);
  console.log(`Final state: ${result.currentState}`);
  console.log(`Total execution time: ${result.updatedAt.getTime() - result.createdAt.getTime()}ms`);
}

/**
 * Example 2: Custom Agent Configuration
 */
async function example2() {
  console.log('\n=== Example 2: Custom Agent Configuration ===');

  // Create a custom agent runner with specific configuration
  const agentRunner = createWorkflowAgentRunner();

  // Create agent workflow engine with custom configuration
  const agentEngine = createAgentWorkflowEngine({
    agentRunner,
    defaultAgentRole: 'reviewer',
  });

  // Define a simple workflow for code review
  const workflow: WorkflowDefinition = {
    schema_version: '1.0',
    id: 'code-review-workflow',
    displayName: 'Code Review Workflow',
    intent: 'Automated code review using agents',
    stateMachine: {
      schema_version: '1.0',
      initial: 'code_analysis',
      states: {
        code_analysis: {
          schema_version: '1.0',
          agent: 'reviewer',
          gate: {
            schema_version: '1.0',
            type: 'simple',
            id: 'analysis-gate',
            name: 'Code Analysis Gate',
          },
          skills: ['code-analysis', 'security-review'],
          next: 'quality_check',
        },
        quality_check: {
          schema_version: '1.0',
          agent: 'reviewer',
          gate: {
            schema_version: '1.0',
            type: 'simple',
            id: 'quality-gate',
            name: 'Quality Check Gate',
          },
          skills: ['quality-metrics', 'performance-review'],
          next: 'final_review',
        },
        final_review: {
          schema_version: '1.0',
          agent: 'reviewer',
          gate: {
            schema_version: '1.0',
            type: 'simple',
            id: 'final-gate',
            name: 'Final Review Gate',
          },
          skills: ['documentation-review', 'best-practices'],
          next: undefined,
        },
      },
    },
    artifacts: [],
  };

  // Load and execute
  agentEngine.loadWorkflow(workflow);
  const instance = agentEngine.createInstance(workflow.id);

  console.log(`Code review workflow instance created: ${instance.id}`);
  console.log('Starting automated code review with agent integration...');

  try {
    const result = await agentEngine.execute(instance.id);
    console.log(`Code review completed: ${result.status}`);
    console.log(`Review passed: ${result.currentState === 'final_review' ? 'Yes' : 'No'}`);
  } catch (error) {
    console.error('Code review failed:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Example 3: Mixed Agent and Non-Agent Gates
 */
async function example3() {
  console.log('\n=== Example 3: Mixed Agent and Non-Agent Gates ===');

  const agentEngine = createAgentWorkflowEngine();

  // Workflow with both agent and non-agent gates
  const workflow: WorkflowDefinition = {
    schema_version: '1.0',
    id: 'mixed-workflow',
    displayName: 'Mixed Workflow',
    intent: 'Workflow with both agent and automated gates',
    stateMachine: {
      schema_version: '1.0',
      initial: 'auto_check',
      states: {
        auto_check: {
          schema_version: '1.0',
          agent: 'none', // Non-agent gate
          gate: {
            schema_version: '1.0',
            type: 'simple',
            id: 'auto-gate',
            name: 'Automated Check Gate',
            checkFn: () => Promise.resolve({
              schema_version: '1.0',
              passed: true,
              reason: 'Automated check passed',
            }),
          },
          skills: [],
          next: 'agent_review',
        },
        agent_review: {
          schema_version: '1.0',
          agent: 'reviewer', // Agent gate
          gate: {
            schema_version: '1.0',
            type: 'simple',
            id: 'review-gate',
            name: 'Agent Review Gate',
          },
          skills: ['review'],
          next: 'final',
        },
        final: {
          schema_version: '1.0',
          agent: 'none', // Non-agent gate
          gate: {
            schema_version: '1.0',
            type: 'simple',
            id: 'final-gate',
            name: 'Final Gate',
            checkFn: () => Promise.resolve({
              schema_version: '1.0',
              passed: true,
              reason: 'Workflow completed successfully',
            }),
          },
          skills: [],
          next: undefined,
        },
      },
    },
    artifacts: [],
  };

  agentEngine.loadWorkflow(workflow);
  const instance = agentEngine.createInstance(workflow.id);

  console.log(`Mixed workflow instance: ${instance.id}`);
  console.log('Executing workflow with mixed agent/non-agent gates...');

  const result = await agentEngine.execute(instance.id);
  console.log(`Workflow result: ${result.status}`);
  console.log(`Path: auto_check → agent_review → final`);
}

/**
 * Main function to run all examples
 */
async function main() {
  console.log('Agent Integration Examples for Workflow Runtime');
  console.log('===============================================\n');

  try {
    await example1();
    await example2();
    await example3();

    console.log('\n=== All examples completed successfully ===');
  } catch (error) {
    console.error('Error running examples:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the examples
if (import.meta.main) {
  main().catch(console.error);
}

export { example1, example2, example3, main };