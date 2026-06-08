/**
 * Workflow Definition Loader
 * Loads workflow definitions from YAML/JSON files and validates them
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { WorkflowDefinition, StateMachine } from '../types.js';

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Workflow Definition Loader
 * Handles loading and validating workflow definitions from files
 */
export class WorkflowDefinitionLoader {
  /**
   * Load a workflow definition from a file
   * Supports both JSON and YAML formats
   * @param filePath Path to the workflow definition file
   * @returns The loaded workflow definition
   * @throws Error if file cannot be read or parsed
   */
  async loadFromFile(filePath: string): Promise<WorkflowDefinition> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();

      let definition: unknown;
      if (ext === '.json') {
        definition = JSON.parse(content);
      } else if (ext === '.yaml' || ext === '.yml') {
        // For YAML, we'll use a simple parser since we don't have yaml dependency
        // In production, this should use a proper YAML parser like 'yaml' or 'js-yaml'
        definition = this.parseYAML(content);
      } else {
        throw new Error(`Unsupported file format: ${ext}. Supported formats: .json, .yaml, .yml`);
      }

      return this.validateAndNormalize(definition);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load workflow definition from ${filePath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Load a workflow definition from a JSON string
   * @param jsonString JSON string containing the workflow definition
   * @returns The loaded workflow definition
   * @throws Error if JSON is invalid
   */
  loadFromJSON(jsonString: string): WorkflowDefinition {
    try {
      const definition = JSON.parse(jsonString);
      return this.validateAndNormalize(definition);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse JSON: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Load a workflow definition from a YAML string
   * @param yamlString YAML string containing the workflow definition
   * @returns The loaded workflow definition
   * @throws Error if YAML is invalid
   */
  loadFromYAML(yamlString: string): WorkflowDefinition {
    try {
      const definition = this.parseYAML(yamlString);
      return this.validateAndNormalize(definition);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse YAML: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Load a workflow definition from an object
   * @param obj Object containing the workflow definition
   * @returns The loaded workflow definition
   * @throws Error if object is invalid
   */
  loadFromObject(obj: unknown): WorkflowDefinition {
    return this.validateAndNormalize(obj);
  }

  /**
   * Validate a workflow definition
   * @param definition The workflow definition to validate
   * @returns Validation result with errors if any
   */
  validate(definition: WorkflowDefinition): ValidationResult {
    const errors: ValidationError[] = [];
    const def = definition as unknown as Record<string, unknown>;

    // Check schema_version
    if (!def.schema_version) {
      errors.push({
        field: 'schema_version',
        message: 'schema_version is required',
      });
    } else if (String(def.schema_version) !== '1.0') {
      errors.push({
        field: 'schema_version',
        message: `Unsupported schema version: ${def.schema_version}. Expected: 1.0`,
        value: def.schema_version,
      });
    }

    // Check id
    if (!def.id) {
      errors.push({
        field: 'id',
        message: 'id is required',
      });
    } else if (typeof def.id !== 'string' || (def.id as string).trim() === '') {
      errors.push({
        field: 'id',
        message: 'id must be a non-empty string',
        value: def.id,
      });
    }

    // Check displayName
    if (!def.displayName) {
      errors.push({
        field: 'displayName',
        message: 'displayName is required',
      });
    } else if (typeof def.displayName !== 'string') {
      errors.push({
        field: 'displayName',
        message: 'displayName must be a string',
        value: def.displayName,
      });
    }

    // Check intent (optional but recommended)
    if (def.intent !== undefined) {
      if (typeof def.intent !== 'string') {
        errors.push({
          field: 'intent',
          message: 'intent must be a string',
          value: def.intent,
        });
      } else if (def.intent.trim() === '') {
        errors.push({
          field: 'intent',
          message: 'intent must be a non-empty string when provided',
          value: def.intent,
        });
      }
    }

    // Check intentKeywords (optional)
    if (def.intentKeywords !== undefined && !Array.isArray(def.intentKeywords)) {
      errors.push({
        field: 'intentKeywords',
        message: 'intentKeywords must be an array',
        value: def.intentKeywords,
      });
    }

    // Check stateMachine
    if (!def.stateMachine) {
      errors.push({
        field: 'stateMachine',
        message: 'stateMachine is required',
      });
    } else {
      const smErrors = this.validateStateMachine(def.stateMachine as StateMachine);
      errors.push(...smErrors);
    }

    // Check artifacts
    if (!Array.isArray(def.artifacts)) {
      errors.push({
        field: 'artifacts',
        message: 'artifacts must be an array',
        value: def.artifacts,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate a state machine definition
   */
  private validateStateMachine(stateMachine: StateMachine): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check schema_version
    if (!stateMachine.schema_version) {
      errors.push({
        field: 'stateMachine.schema_version',
        message: 'schema_version is required',
      });
    } else if (String(stateMachine.schema_version) !== '1.0') {
      errors.push({
        field: 'stateMachine.schema_version',
        message: `Unsupported schema version: ${stateMachine.schema_version}. Expected: 1.0`,
        value: stateMachine.schema_version,
      });
    }

    // Check initial state
    if (!stateMachine.initial) {
      errors.push({
        field: 'stateMachine.initial',
        message: 'initial state is required',
      });
    } else if (typeof stateMachine.initial !== 'string') {
      errors.push({
        field: 'stateMachine.initial',
        message: 'initial state must be a string',
        value: stateMachine.initial,
      });
    }

    // Check states
    if (!stateMachine.states || typeof stateMachine.states !== 'object') {
      errors.push({
        field: 'stateMachine.states',
        message: 'states must be an object',
        value: stateMachine.states,
      });
      return errors;
    }

    if (Object.keys(stateMachine.states).length === 0) {
      errors.push({
        field: 'stateMachine.states',
        message: 'states must have at least one state',
      });
      return errors;
    }

    // Check if initial state exists
    if (stateMachine.initial && !stateMachine.states[stateMachine.initial]) {
      errors.push({
        field: 'stateMachine.initial',
        message: `Initial state '${stateMachine.initial}' not found in states`,
      });
    }

    // Validate each state
    for (const [stateId, state] of Object.entries(stateMachine.states)) {
      const stateErrors = this.validateState(stateId, state);
      errors.push(...stateErrors);
    }

    return errors;
  }

  /**
   * Validate a single state definition
   */
  private validateState(stateId: string, state: unknown): ValidationError[] {
    const errors: ValidationError[] = [];
    const prefix = `stateMachine.states.${stateId}`;

    if (!state || typeof state !== 'object') {
      errors.push({
        field: prefix,
        message: 'state must be an object',
        value: state,
      });
      return errors;
    }

    const stateObj = state as Record<string, unknown>;

    // Check schema_version
    if (!stateObj.schema_version) {
      errors.push({
        field: `${prefix}.schema_version`,
        message: 'schema_version is required',
      });
    } else if (String(stateObj.schema_version) !== '1.0') {
      errors.push({
        field: `${prefix}.schema_version`,
        message: `Unsupported schema version: ${stateObj.schema_version}. Expected: 1.0`,
        value: stateObj.schema_version,
      });
    }

    // Check agent — accept empty string for gate/terminal states
    if (stateObj.agent === undefined || stateObj.agent === null) {
      errors.push({
        field: `${prefix}.agent`,
        message: 'agent is required',
      });
    } else if (typeof stateObj.agent !== 'string') {
      errors.push({
        field: `${prefix}.agent`,
        message: 'agent must be a string',
        value: stateObj.agent,
      });
    }

    // Check gate — accept null for non-gate states
    if (stateObj.gate !== null && stateObj.gate !== undefined) {
      const gateErrors = this.validateGate(`${prefix}.gate`, stateObj.gate);
      errors.push(...gateErrors);
    }

    // Check skills
    if (stateObj.skills !== undefined && !Array.isArray(stateObj.skills)) {
      errors.push({
        field: `${prefix}.skills`,
        message: 'skills must be an array',
        value: stateObj.skills,
      });
    }

    // Check next — string or { pass, fail } object; optional for terminal states
    if (stateObj.next !== undefined && stateObj.next !== null) {
      if (typeof stateObj.next === 'string') {
        // Static next state — valid
      } else if (typeof stateObj.next === 'object') {
        const nextObj = stateObj.next as Record<string, unknown>;
        if (typeof nextObj.pass !== 'string' || (nextObj.pass as string).trim() === '') {
          errors.push({
            field: `${prefix}.next.pass`,
            message: 'next.pass must be a non-empty string',
            value: nextObj.pass,
          });
        }
        if (typeof nextObj.fail !== 'string' || (nextObj.fail as string).trim() === '') {
          errors.push({
            field: `${prefix}.next.fail`,
            message: 'next.fail must be a non-empty string',
            value: nextObj.fail,
          });
        }
      } else {
        errors.push({
          field: `${prefix}.next`,
          message: 'next must be a string or { pass, fail } object',
          value: stateObj.next,
        });
      }
    }

    // Check retry (optional)
    if (stateObj.retry !== undefined && stateObj.retry !== null) {
      if (typeof stateObj.retry !== 'object') {
        errors.push({
          field: `${prefix}.retry`,
          message: 'retry must be an object',
          value: stateObj.retry,
        });
      } else {
        const retryObj = stateObj.retry as Record<string, unknown>;
        if (typeof retryObj.maxAttempts !== 'number' || retryObj.maxAttempts < 1) {
          errors.push({
            field: `${prefix}.retry.maxAttempts`,
            message: 'retry.maxAttempts must be a positive number',
            value: retryObj.maxAttempts,
          });
        }
        if (typeof retryObj.onExhausted !== 'string') {
          errors.push({
            field: `${prefix}.retry.onExhausted`,
            message: 'retry.onExhausted must be a string',
            value: retryObj.onExhausted,
          });
        }
      }
    }

    // Check produces (optional)
    if (stateObj.produces !== undefined && stateObj.produces !== null && typeof stateObj.produces !== 'string') {
      errors.push({
        field: `${prefix}.produces`,
        message: 'produces must be a string or null',
        value: stateObj.produces,
      });
    }

    return errors;
  }

  /**
   * Validate a gate definition
   */
  private validateGate(prefix: string, gate: unknown): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!gate || typeof gate !== 'object') {
      errors.push({
        field: prefix,
        message: 'gate must be an object',
        value: gate,
      });
      return errors;
    }

    const gateObj = gate as Record<string, unknown>;

    // Check schema_version
    if (!gateObj.schema_version) {
      errors.push({
        field: `${prefix}.schema_version`,
        message: 'schema_version is required',
      });
    } else if (String(gateObj.schema_version) !== '1.0') {
      errors.push({
        field: `${prefix}.schema_version`,
        message: `Unsupported schema version: ${gateObj.schema_version}. Expected: 1.0`,
        value: gateObj.schema_version,
      });
    }

    // Check type
    if (!gateObj.type) {
      errors.push({
        field: `${prefix}.type`,
        message: 'type is required',
      });
    } else if (gateObj.type !== 'simple' && gateObj.type !== 'composite') {
      errors.push({
        field: `${prefix}.type`,
        message: `type must be 'simple' or 'composite', got: ${gateObj.type}`,
        value: gateObj.type,
      });
    }

    // Check id
    if (!gateObj.id) {
      errors.push({
        field: `${prefix}.id`,
        message: 'id is required',
      });
    } else if (typeof gateObj.id !== 'string') {
      errors.push({
        field: `${prefix}.id`,
        message: 'id must be a string',
        value: gateObj.id,
      });
    }

    // Check name
    if (!gateObj.name) {
      errors.push({
        field: `${prefix}.name`,
        message: 'name is required',
      });
    } else if (typeof gateObj.name !== 'string') {
      errors.push({
        field: `${prefix}.name`,
        message: 'name must be a string',
        value: gateObj.name,
      });
    }

    // Validate composite gate specific fields
    if (gateObj.type === 'composite') {
      if (!gateObj.mode) {
        errors.push({
          field: `${prefix}.mode`,
          message: 'mode is required for composite gates',
        });
      } else if (gateObj.mode !== 'sequential' && gateObj.mode !== 'parallel') {
        errors.push({
          field: `${prefix}.mode`,
          message: `mode must be 'sequential' or 'parallel', got: ${gateObj.mode}`,
          value: gateObj.mode,
        });
      }

      if (!gateObj.failPolicy) {
        errors.push({
          field: `${prefix}.failPolicy`,
          message: 'failPolicy is required for composite gates',
        });
      } else if (gateObj.failPolicy !== 'fail_fast' && gateObj.failPolicy !== 'collect_all') {
        errors.push({
          field: `${prefix}.failPolicy`,
          message: `failPolicy must be 'fail_fast' or 'collect_all', got: ${gateObj.failPolicy}`,
          value: gateObj.failPolicy,
        });
      }

      if (!Array.isArray(gateObj.children)) {
        errors.push({
          field: `${prefix}.children`,
          message: 'children must be an array for composite gates',
          value: gateObj.children,
        });
      } else if (gateObj.children.length === 0) {
        errors.push({
          field: `${prefix}.children`,
          message: 'children must have at least one child gate',
        });
      } else {
        // Validate each child gate
        for (let i = 0; i < gateObj.children.length; i++) {
          const childErrors = this.validateGate(`${prefix}.children[${i}]`, gateObj.children[i]);
          errors.push(...childErrors);
        }
      }
    }

    return errors;
  }

  /**
   * Validate and normalize a workflow definition
   * Ensures all required fields are present and properly typed
   */
  private validateAndNormalize(obj: unknown): WorkflowDefinition {
    if (!obj || typeof obj !== 'object') {
      throw new Error('Workflow definition must be an object');
    }

    const definition = obj as Record<string, unknown>;

    // Ensure schema_version
    if (!definition.schema_version) {
      definition.schema_version = '1.0';
    }

    // Validate
    const result = this.validate(definition as unknown as WorkflowDefinition);
    if (!result.valid) {
      const errorMessages = result.errors.map(e => `${e.field}: ${e.message}`).join('\n');
      throw new Error(`Workflow definition validation failed:\n${errorMessages}`);
    }

    return definition as unknown as WorkflowDefinition;
  }

  /**
   * Simple YAML parser for basic YAML structures
   * For production use, consider using a proper YAML library like 'yaml' or 'js-yaml'
   */
  private parseYAML(content: string): unknown {
    // This is a very basic YAML parser that handles simple key-value structures
    // For more complex YAML, a proper parser should be used
    const lines = content.split('\n');
    const result: Record<string, unknown> = {};
    const stack: Array<{ key: string; value: Record<string, unknown> | unknown[]; indent: number; isArray: boolean }> = [];
    let currentIndent = -1;
    let current: Record<string, unknown> = result;
    let currentArray: unknown[] | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip empty lines and comments
      if (!line.trim() || line.trim().startsWith('#')) {
        continue;
      }

      // Calculate indentation
      const indent = line.search(/\S/);
      const trimmed = line.trim();

      // Handle indentation changes
      if (currentIndent >= 0 && indent < currentIndent) {
        // Pop from stack until we find the right level
        while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
          stack.pop();
        }
        if (stack.length > 0) {
          const parent = stack[stack.length - 1];
          if (parent.isArray) {
            currentArray = parent.value as unknown[];
          } else {
            current = parent.value as Record<string, unknown>;
            currentArray = null;
          }
        } else {
          current = result;
          currentArray = null;
        }
      }
      currentIndent = indent;

      // Parse array items
      if (trimmed.startsWith('- ')) {
        const itemValue = trimmed.substring(2).trim();
        if (currentArray) {
          if (itemValue === 'true') {
            currentArray.push(true);
          } else if (itemValue === 'false') {
            currentArray.push(false);
          } else if (!isNaN(Number(itemValue))) {
            currentArray.push(Number(itemValue));
          } else {
            // Remove quotes if present
            const unquoted = itemValue.startsWith('"') && itemValue.endsWith('"') ? itemValue.slice(1, -1) : itemValue;
            currentArray.push(unquoted);
          }
        }
      } else if (trimmed.includes(':')) {
        // Parse key-value pair
        const colonIndex = trimmed.indexOf(':');
        const key = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();

        if (value === '' || value === '[]' || value === '{}') {
          // Nested object or array
          if (value === '[]') {
            // Array
            const arr: unknown[] = [];
            current[key] = arr;
            stack.push({ key, value: arr, indent: currentIndent, isArray: true });
            currentArray = arr;
          } else {
            // Nested object
            const nested: Record<string, unknown> = {};
            current[key] = nested;
            stack.push({ key, value: nested, indent: currentIndent, isArray: false });
            current = nested;
            currentArray = null;
          }
        } else if (value.startsWith('[') && value.endsWith(']')) {
          // Inline array
          const arrayStr = value.slice(1, -1);
          current[key] = arrayStr.split(',').map(v => {
            const trimmedV = v.trim();
            if (trimmedV === 'true') return true;
            if (trimmedV === 'false') return false;
            if (!isNaN(Number(trimmedV))) return Number(trimmedV);
            return trimmedV;
          });
          currentArray = null;
        } else if (value === 'true') {
          current[key] = true;
          currentArray = null;
        } else if (value === 'false') {
          current[key] = false;
          currentArray = null;
        } else if (!isNaN(Number(value))) {
          current[key] = Number(value);
          currentArray = null;
        } else {
          // Remove quotes if present
          const unquoted = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
          current[key] = unquoted;
          currentArray = null;
        }
      }
    }

    return result;
  }
}
