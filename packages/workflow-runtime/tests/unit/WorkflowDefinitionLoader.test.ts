/**
 * Unit tests for WorkflowDefinitionLoader
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { WorkflowDefinitionLoader } from '../../src/loaders/WorkflowDefinitionLoader.js';
import { WorkflowDefinition } from '../../src/types.js';

describe('WorkflowDefinitionLoader', () => {
  let loader: WorkflowDefinitionLoader;
  let tempDir: string;

  beforeEach(async () => {
    loader = new WorkflowDefinitionLoader();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-loader-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('loadFromJSON', () => {
    it('should load a valid workflow definition from JSON string', () => {
      const json = JSON.stringify({
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test Workflow',
        intent: 'Test workflow intent',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
              },
              skills: ['skill1'],
              next: 'state2',
            },
            state2: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate2',
                name: 'Gate 2',
              },
              skills: ['skill2'],
            },
          },
        },
        artifacts: [],
      });

      const definition = loader.loadFromJSON(json);
      expect(definition.id).toBe('test-workflow');
      expect(definition.displayName).toBe('Test Workflow');
      expect(definition.stateMachine.initial).toBe('state1');
    });

    it('should throw error for invalid JSON', () => {
      const invalidJson = '{ invalid json }';
      expect(() => loader.loadFromJSON(invalidJson)).toThrow('Failed to parse JSON');
    });

    it('should throw error for missing required fields', () => {
      const json = JSON.stringify({
        schema_version: '1.0',
        id: 'test-workflow',
        // Missing displayName, intent, stateMachine
        artifacts: [],
      });

      expect(() => loader.loadFromJSON(json)).toThrow('validation failed');
    });
  });

  describe('loadFromYAML', () => {
    it('should load a valid workflow definition from YAML string', () => {
      // Note: The simple YAML parser has limitations with complex nested structures
      // For production use, a proper YAML library like 'yaml' or 'js-yaml' should be used
      const yaml = `
schema_version: "1.0"
id: test-workflow
displayName: Test Workflow
intent: Test workflow intent
stateMachine:
  schema_version: "1.0"
  initial: state1
  states:
    state1:
      schema_version: "1.0"
      agent: test-agent
      gate:
        schema_version: "1.0"
        type: simple
        id: gate1
        name: Gate 1
      skills: []
      next: state2
    state2:
      schema_version: "1.0"
      agent: test-agent
      gate:
        schema_version: "1.0"
        type: simple
        id: gate2
        name: Gate 2
      skills: []
artifacts: []
`;

      const definition = loader.loadFromYAML(yaml);
      expect(definition.id).toBe('test-workflow');
      expect(definition.displayName).toBe('Test Workflow');
    });

    it('should throw error for invalid YAML', () => {
      const invalidYaml = 'invalid: yaml: content:';
      // The simple YAML parser might not catch all errors, but validation should
      expect(() => loader.loadFromYAML(invalidYaml)).toThrow();
    });
  });

  describe('loadFromFile', () => {
    it('should load a workflow definition from a JSON file', async () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test Workflow',
        intent: 'Test workflow intent',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
              },
              skills: ['skill1'],
            },
          },
        },
        artifacts: [],
      };

      const filePath = path.join(tempDir, 'workflow.json');
      await fs.writeFile(filePath, JSON.stringify(definition, null, 2));

      const loaded = await loader.loadFromFile(filePath);
      expect(loaded.id).toBe('test-workflow');
      expect(loaded.displayName).toBe('Test Workflow');
    });

    it('should load a workflow definition from a YAML file', async () => {
      // Note: The simple YAML parser has limitations with complex nested structures
      // For production use, a proper YAML library like 'yaml' or 'js-yaml' should be used
      const yaml = `
schema_version: "1.0"
id: test-workflow
displayName: Test Workflow
intent: Test workflow intent
stateMachine:
  schema_version: "1.0"
  initial: state1
  states:
    state1:
      schema_version: "1.0"
      agent: test-agent
      gate:
        schema_version: "1.0"
        type: simple
        id: gate1
        name: Gate 1
      skills: []
artifacts: []
`;

      const filePath = path.join(tempDir, 'workflow.yaml');
      await fs.writeFile(filePath, yaml);

      const loaded = await loader.loadFromFile(filePath);
      expect(loaded.id).toBe('test-workflow');
    });

    it('should throw error for unsupported file format', async () => {
      const filePath = path.join(tempDir, 'workflow.txt');
      await fs.writeFile(filePath, 'some content');

      await expect(loader.loadFromFile(filePath)).rejects.toThrow('Unsupported file format');
    });

    it('should throw error for non-existent file', async () => {
      const filePath = path.join(tempDir, 'non-existent.json');
      await expect(loader.loadFromFile(filePath)).rejects.toThrow('Failed to load workflow definition');
    });
  });

  describe('loadFromObject', () => {
    it('should load a workflow definition from an object', () => {
      const obj = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test Workflow',
        intent: 'Test workflow intent',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
              },
              skills: ['skill1'],
            },
          },
        },
        artifacts: [],
      };

      const definition = loader.loadFromObject(obj);
      expect(definition.id).toBe('test-workflow');
    });

    it('should throw error for non-object input', () => {
      expect(() => loader.loadFromObject('not an object')).toThrow('must be an object');
      expect(() => loader.loadFromObject(null)).toThrow('must be an object');
      expect(() => loader.loadFromObject(undefined)).toThrow('must be an object');
    });
  });

  describe('validate', () => {
    const validDefinition: WorkflowDefinition = {
      schema_version: '1.0',
      id: 'test-workflow',
      displayName: 'Test Workflow',
      intent: 'Test workflow intent',
      stateMachine: {
        schema_version: '1.0',
        initial: 'state1',
        states: {
          state1: {
            schema_version: '1.0',
            agent: 'test-agent',
            gate: {
              schema_version: '1.0',
              type: 'simple',
              id: 'gate1',
              name: 'Gate 1',
            },
            skills: ['skill1'],
          },
        },
      },
      artifacts: [],
    };

    it('should validate a correct workflow definition', () => {
      const result = loader.validate(validDefinition);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing schema_version', () => {
      const def = { ...validDefinition, schema_version: undefined as unknown as string };
      const result = loader.validate(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'schema_version')).toBe(true);
    });

    it('should detect unsupported schema_version', () => {
      const def = { ...validDefinition, schema_version: '2.0' as unknown as '1.0' };
      const result = loader.validate(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'schema_version')).toBe(true);
    });

    it('should detect missing id', () => {
      const def = { ...validDefinition, id: '' };
      const result = loader.validate(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'id')).toBe(true);
    });

    it('should detect missing displayName', () => {
      const def = { ...validDefinition, displayName: '' };
      const result = loader.validate(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'displayName')).toBe(true);
    });

    it('should detect missing intent', () => {
      const def = { ...validDefinition, intent: '' };
      const result = loader.validate(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'intent')).toBe(true);
    });

    it('should detect missing stateMachine', () => {
      const def = { ...validDefinition, stateMachine: undefined as unknown as any };
      const result = loader.validate(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'stateMachine')).toBe(true);
    });

    it('should detect missing initial state', () => {
      const def = {
        ...validDefinition,
        stateMachine: {
          ...validDefinition.stateMachine,
          initial: '',
        },
      };
      const result = loader.validate(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'stateMachine.initial')).toBe(true);
    });

    it('should detect missing states', () => {
      const def = {
        ...validDefinition,
        stateMachine: {
          ...validDefinition.stateMachine,
          states: {},
        },
      };
      const result = loader.validate(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'stateMachine.states')).toBe(true);
    });

    it('should detect non-existent initial state', () => {
      const def = {
        ...validDefinition,
        stateMachine: {
          ...validDefinition.stateMachine,
          initial: 'non-existent-state',
        },
      };
      const result = loader.validate(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'stateMachine.initial')).toBe(true);
    });

    it('should detect invalid gate type', () => {
      const def = {
        ...validDefinition,
        stateMachine: {
          ...validDefinition.stateMachine,
          states: {
            state1: {
              ...validDefinition.stateMachine.states.state1,
              gate: {
                ...validDefinition.stateMachine.states.state1.gate,
                type: 'invalid' as unknown as 'simple',
              },
            },
          },
        },
      };
      const result = loader.validate(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field.includes('gate.type'))).toBe(true);
    });

    it('should detect invalid composite gate mode', () => {
      const def = {
        ...validDefinition,
        stateMachine: {
          ...validDefinition.stateMachine,
          states: {
            state1: {
              ...validDefinition.stateMachine.states.state1,
              gate: {
                schema_version: '1.0',
                type: 'composite',
                id: 'composite-gate',
                name: 'Composite Gate',
                mode: 'invalid' as unknown as 'sequential',
                failPolicy: 'fail_fast',
                children: [
                  {
                    schema_version: '1.0',
                    type: 'simple',
                    id: 'child-gate',
                    name: 'Child Gate',
                  },
                ],
              },
            },
          },
        },
      };
      const result = loader.validate(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field.includes('mode'))).toBe(true);
    });

    it('should detect composite gate without children', () => {
      const def = {
        ...validDefinition,
        stateMachine: {
          ...validDefinition.stateMachine,
          states: {
            state1: {
              ...validDefinition.stateMachine.states.state1,
              gate: {
                schema_version: '1.0',
                type: 'composite',
                id: 'composite-gate',
                name: 'Composite Gate',
                mode: 'sequential',
                failPolicy: 'fail_fast',
                children: [],
              },
            },
          },
        },
      };
      const result = loader.validate(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field.includes('children'))).toBe(true);
    });
  });

  describe('version management', () => {
    it('should support workflow version field', () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test Workflow',
        intent: 'Test workflow intent',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
              },
              skills: ['skill1'],
            },
          },
        },
        artifacts: [],
      };

      const loaded = loader.loadFromObject(definition);
      expect(loaded.schema_version).toBe('1.0');
    });

    it('should auto-add schema_version if missing', () => {
      const obj = {
        id: 'test-workflow',
        displayName: 'Test Workflow',
        intent: 'Test workflow intent',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
              },
              skills: ['skill1'],
            },
          },
        },
        artifacts: [],
      };

      const loaded = loader.loadFromObject(obj);
      expect(loaded.schema_version).toBe('1.0');
    });
  });

  describe('composite gate validation', () => {
    it('should validate composite gate with sequential mode', () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test Workflow',
        intent: 'Test workflow intent',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'composite',
                id: 'composite-gate',
                name: 'Composite Gate',
                mode: 'sequential',
                failPolicy: 'fail_fast',
                children: [
                  {
                    schema_version: '1.0',
                    type: 'simple',
                    id: 'child-gate-1',
                    name: 'Child Gate 1',
                  },
                  {
                    schema_version: '1.0',
                    type: 'simple',
                    id: 'child-gate-2',
                    name: 'Child Gate 2',
                  },
                ],
              },
              skills: ['skill1'],
            },
          },
        },
        artifacts: [],
      };

      const result = loader.validate(definition);
      expect(result.valid).toBe(true);
    });

    it('should validate composite gate with parallel mode', () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test Workflow',
        intent: 'Test workflow intent',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'composite',
                id: 'composite-gate',
                name: 'Composite Gate',
                mode: 'parallel',
                failPolicy: 'collect_all',
                children: [
                  {
                    schema_version: '1.0',
                    type: 'simple',
                    id: 'child-gate-1',
                    name: 'Child Gate 1',
                  },
                  {
                    schema_version: '1.0',
                    type: 'simple',
                    id: 'child-gate-2',
                    name: 'Child Gate 2',
                  },
                ],
              },
              skills: ['skill1'],
            },
          },
        },
        artifacts: [],
      };

      const result = loader.validate(definition);
      expect(result.valid).toBe(true);
    });

    it('should validate nested composite gates', () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test Workflow',
        intent: 'Test workflow intent',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'composite',
                id: 'outer-composite-gate',
                name: 'Outer Composite Gate',
                mode: 'sequential',
                failPolicy: 'fail_fast',
                children: [
                  {
                    schema_version: '1.0',
                    type: 'simple',
                    id: 'simple-gate',
                    name: 'Simple Gate',
                  },
                  {
                    schema_version: '1.0',
                    type: 'composite',
                    id: 'inner-composite-gate',
                    name: 'Inner Composite Gate',
                    mode: 'parallel',
                    failPolicy: 'collect_all',
                    children: [
                      {
                        schema_version: '1.0',
                        type: 'simple',
                        id: 'inner-child-gate-1',
                        name: 'Inner Child Gate 1',
                      },
                      {
                        schema_version: '1.0',
                        type: 'simple',
                        id: 'inner-child-gate-2',
                        name: 'Inner Child Gate 2',
                      },
                    ],
                  },
                ],
              },
              skills: ['skill1'],
            },
          },
        },
        artifacts: [],
      };

      const result = loader.validate(definition);
      expect(result.valid).toBe(true);
    });
  });
});
