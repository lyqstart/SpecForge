/**
 * Unit tests for WorkflowLoader
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { WorkflowLoader } from '../../src/engine/WorkflowLoader.js';
import type { WorkflowDefinition } from '../../src/types.js';

describe('WorkflowLoader', () => {
  let loader: WorkflowLoader;
  let tempDir: string;

  beforeEach(async () => {
    loader = new WorkflowLoader();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-loader-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch  {
      // Ignore cleanup errors
    }
    loader.clearLoadedDefinitions();
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
      expect(loader.isLoaded('test-workflow')).toBe(true);
    });

    it('should load a workflow definition from a YAML file', async () => {
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
      expect(loader.isLoaded('test-workflow')).toBe(true);
    });

    it('should throw error for non-existent file', async () => {
      const filePath = path.join(tempDir, 'non-existent.json');
      await expect(loader.loadFromFile(filePath)).rejects.toThrow('Failed to load workflow from file');
    });

    it('should throw error for unsupported file format', async () => {
      const filePath = path.join(tempDir, 'workflow.txt');
      await fs.writeFile(filePath, 'some content');

      await expect(loader.loadFromFile(filePath)).rejects.toThrow('Failed to load workflow from file');
    });
  });

  describe('loadFromJSON', () => {
    it('should load a workflow definition from JSON string', () => {
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
            },
          },
        },
        artifacts: [],
      });

      const definition = loader.loadFromJSON(json);
      expect(definition.id).toBe('test-workflow');
      expect(loader.isLoaded('test-workflow')).toBe(true);
    });

    it('should throw error for invalid JSON', () => {
      const invalidJson = '{ invalid json }';
      expect(() => loader.loadFromJSON(invalidJson)).toThrow('Failed to load workflow from JSON');
    });

    it('should throw error for missing required fields', () => {
      const json = JSON.stringify({
        schema_version: '1.0',
        id: 'test-workflow',
        // Missing displayName, intent, stateMachine
        artifacts: [],
      });

      expect(() => loader.loadFromJSON(json)).toThrow('Failed to load workflow from JSON');
    });
  });

  describe('loadFromYAML', () => {
    it('should load a workflow definition from YAML string', () => {
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

      const definition = loader.loadFromYAML(yaml);
      expect(definition.id).toBe('test-workflow');
      expect(loader.isLoaded('test-workflow')).toBe(true);
    });

    it('should throw error for invalid YAML', () => {
      const invalidYaml = 'invalid: yaml: content:';
      expect(() => loader.loadFromYAML(invalidYaml)).toThrow('Failed to load workflow from YAML');
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
      expect(loader.isLoaded('test-workflow')).toBe(true);
    });

    it('should throw error for non-object input', () => {
      expect(() => loader.loadFromObject('not an object')).toThrow('Failed to load workflow from object');
      expect(() => loader.loadFromObject(null)).toThrow('Failed to load workflow from object');
      expect(() => loader.loadFromObject(undefined)).toThrow('Failed to load workflow from object');
    });
  });

  describe('loadFromDirectory', () => {
    it('should load all workflow definitions from a directory', async () => {
      const def1: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'workflow-1',
        displayName: 'Workflow 1',
        intent: 'Intent 1',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'agent1',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
              },
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      const def2: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'workflow-2',
        displayName: 'Workflow 2',
        intent: 'Intent 2',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'agent2',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate2',
                name: 'Gate 2',
              },
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      await fs.writeFile(path.join(tempDir, 'workflow1.json'), JSON.stringify(def1));
      await fs.writeFile(path.join(tempDir, 'workflow2.json'), JSON.stringify(def2));

      const definitions = await loader.loadFromDirectory(tempDir);
      expect(definitions).toHaveLength(2);
      expect(definitions.map(d => d.id)).toContain('workflow-1');
      expect(definitions.map(d => d.id)).toContain('workflow-2');
    });

    it('should skip invalid files in directory', async () => {
      const validDef: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'valid-workflow',
        displayName: 'Valid Workflow',
        intent: 'Intent',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate',
                name: 'Gate',
              },
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      await fs.writeFile(path.join(tempDir, 'valid.json'), JSON.stringify(validDef));
      await fs.writeFile(path.join(tempDir, 'invalid.json'), '{ invalid json }');
      await fs.writeFile(path.join(tempDir, 'readme.txt'), 'This is not a workflow');

      await expect(loader.loadFromDirectory(tempDir)).rejects.toThrow();
      expect(loader.getAllLoadedDefinitions()).toEqual([]);
    });

    it('should throw error for non-existent directory', async () => {
      const dirPath = path.join(tempDir, 'non-existent');
      await expect(loader.loadFromDirectory(dirPath)).rejects.toThrow('Failed to load workflows from directory');
    });
  });

  describe('validate', () => {
    it('should validate a correct workflow definition', () => {
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

      const result = loader.validate(definition);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect validation errors', () => {
      const definition = {
        schema_version: '1.0',
        id: '',
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
      } as WorkflowDefinition;

      const result = loader.validate(definition);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateOrThrow', () => {
    it('should not throw for valid definition', () => {
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

      expect(() => loader.validateOrThrow(definition)).not.toThrow();
    });

    it('should throw for invalid definition', () => {
      const definition = {
        schema_version: '1.0',
        id: '',
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
      } as WorkflowDefinition;

      expect(() => loader.validateOrThrow(definition)).toThrow('validation failed');
    });
  });

  describe('loaded definitions management', () => {
    it('should track loaded definitions', () => {
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

      loader.loadFromObject(obj);
      expect(loader.isLoaded('test-workflow')).toBe(true);
      expect(loader.getLoadedDefinition('test-workflow')).toBeDefined();
    });

    it('should return all loaded definitions', () => {
      const obj1 = {
        schema_version: '1.0',
        id: 'workflow-1',
        displayName: 'Workflow 1',
        intent: 'Intent 1',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'agent1',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
              },
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      const obj2 = {
        schema_version: '1.0',
        id: 'workflow-2',
        displayName: 'Workflow 2',
        intent: 'Intent 2',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'agent2',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate2',
                name: 'Gate 2',
              },
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      loader.loadFromObject(obj1);
      loader.loadFromObject(obj2);

      const all = loader.getAllLoadedDefinitions();
      expect(all).toHaveLength(2);
      expect(all.map(d => d.id)).toContain('workflow-1');
      expect(all.map(d => d.id)).toContain('workflow-2');
    });

    it('should clear loaded definitions', () => {
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

      loader.loadFromObject(obj);
      expect(loader.isLoaded('test-workflow')).toBe(true);

      loader.clearLoadedDefinitions();
      expect(loader.isLoaded('test-workflow')).toBe(false);
      expect(loader.getAllLoadedDefinitions()).toHaveLength(0);
    });
  });

  describe('getDefinitionLoader', () => {
    it('should return the underlying WorkflowDefinitionLoader', () => {
      const definitionLoader = loader.getDefinitionLoader();
      expect(definitionLoader).toBeDefined();
      expect(typeof definitionLoader.validate).toBe('function');
    });
  });
});
