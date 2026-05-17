/**
 * CompositeGate Serializer Module
 * Handles serialization and deserialization of CompositeGate definitions
 * 
 * Validates: Requirements 3.1 - compositeGate 序列化/反序列化
 */

import {
  GateDefinition,
  SimpleGateDefinition,
  CompositeGateDefinition,
  CompositeGateMode,
  FailPolicy,
} from '../types.js';

/**
 * Validation errors for CompositeGate
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Serialized CompositeGate structure (JSON compatible)
 */
export interface SerializedCompositeGate {
  schema_version: '1.0';
  type: 'composite';
  id: string;
  name: string;
  mode: CompositeGateMode;
  failPolicy: FailPolicy;
  children: SerializedGateDefinition[];
}

/**
 * Union type for serialized gate definitions
 */
export type SerializedGateDefinition = 
  | SerializedSimpleGate
  | SerializedCompositeGate;

export interface SerializedSimpleGate {
  schema_version: '1.0';
  type: 'simple';
  id: string;
  name: string;
  checkFn?: string; // Serialized as function reference name
}

/**
 * Result of validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * CompositeGateSerializer class
 * Provides serialization and deserialization for CompositeGate definitions
 */
export class CompositeGateSerializer {
  /**
   * Serialize a CompositeGateDefinition to JSON-compatible object
   * @param gate The CompositeGateDefinition to serialize
   * @returns Serialized CompositeGate
   */
  static serialize(gate: CompositeGateDefinition): SerializedCompositeGate {
    if (gate.type !== 'composite') {
      throw new Error('Cannot serialize non-composite gate as CompositeGate');
    }

    const serialized: SerializedCompositeGate = {
      schema_version: gate.schema_version || '1.0',
      type: 'composite',
      id: gate.id,
      name: gate.name,
      mode: gate.mode,
      failPolicy: gate.failPolicy,
      children: gate.children.map(child => this.serializeGateDefinition(child)),
    };

    return serialized;
  }

  /**
   * Serialize any GateDefinition to its serialized form
   */
  static serializeGateDefinition(gate: GateDefinition): SerializedGateDefinition {
    if (gate.type === 'simple') {
      return this.serializeSimpleGate(gate);
    } else {
      return this.serialize(gate);
    }
  }

  /**
   * Serialize a SimpleGateDefinition
   */
  static serializeSimpleGate(gate: SimpleGateDefinition): SerializedSimpleGate {
    return {
      schema_version: gate.schema_version || '1.0',
      type: 'simple',
      id: gate.id,
      name: gate.name,
      // Note: checkFn cannot be serialized directly, serialize as reference name if available
      checkFn: gate.checkFn ? 'checkFn' : undefined,
    };
  }

  /**
   * Deserialize a SerializedCompositeGate back to CompositeGateDefinition
   * @param data The serialized data
   * @param context Optional context for resolving function references
   * @returns CompositeGateDefinition
   */
  static deserialize(
    data: SerializedCompositeGate,
    context?: { checkFnMap?: Record<string, () => Promise<any> | any> }
  ): CompositeGateDefinition {
    // Validate the serialized data
    const validationResult = this.validateSerialized(data);
    if (!validationResult.valid) {
      const errorMessages = validationResult.errors
        .map(e => `${e.field}: ${e.message}`)
        .join(', ');
      throw new Error(`Invalid CompositeGate data: ${errorMessages}`);
    }

    const compositeGate: CompositeGateDefinition = {
      schema_version: data.schema_version || '1.0',
      type: 'composite',
      id: data.id,
      name: data.name,
      mode: data.mode,
      failPolicy: data.failPolicy,
      children: data.children.map(child => 
        this.deserializeGateDefinition(child, context)
      ),
    };

    return compositeGate;
  }

  /**
   * Deserialize any SerializedGateDefinition back to GateDefinition
   */
  static deserializeGateDefinition(
    data: SerializedGateDefinition,
    context?: { checkFnMap?: Record<string, () => Promise<any> | any> }
  ): GateDefinition {
    if (data.type === 'simple') {
      return this.deserializeSimpleGate(data, context);
    } else {
      return this.deserialize(data as SerializedCompositeGate, context);
    }
  }

  /**
   * Deserialize a SerializedSimpleGate back to SimpleGateDefinition
   */
  static deserializeSimpleGate(
    data: SerializedSimpleGate,
    context?: { checkFnMap?: Record<string, () => Promise<any> | any> }
  ): SimpleGateDefinition {
    const gate: SimpleGateDefinition = {
      schema_version: data.schema_version || '1.0',
      type: 'simple',
      id: data.id,
      name: data.name,
    };

    // Restore checkFn if reference name provided and context available
    if (data.checkFn && context?.checkFnMap?.[data.checkFn]) {
      gate.checkFn = context.checkFnMap[data.checkFn];
    }

    return gate;
  }

  /**
   * Validate serialized CompositeGate data
   */
  static validateSerialized(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    if (!data || typeof data !== 'object') {
      errors.push({ field: 'root', message: 'Data must be an object' });
      return { valid: false, errors };
    }

    const obj = data as Record<string, unknown>;

    // Check schema_version
    if (!obj.schema_version) {
      errors.push({ field: 'schema_version', message: 'Missing schema_version' });
    } else if (obj.schema_version !== '1.0') {
      errors.push({ field: 'schema_version', message: `Unsupported schema version: ${obj.schema_version}` });
    }

    // Check type
    if (obj.type !== 'composite') {
      errors.push({ field: 'type', message: 'Type must be "composite"' });
    }

    // Check id
    if (!obj.id || typeof obj.id !== 'string') {
      errors.push({ field: 'id', message: 'id must be a non-empty string' });
    }

    // Check name
    if (!obj.name || typeof obj.name !== 'string') {
      errors.push({ field: 'name', message: 'name must be a non-empty string' });
    }

    // Check mode
    const validModes: CompositeGateMode[] = ['sequential', 'parallel'];
    if (!obj.mode || !validModes.includes(obj.mode as CompositeGateMode)) {
      errors.push({ 
        field: 'mode', 
        message: `mode must be one of: ${validModes.join(', ')}` 
      });
    }

    // Check failPolicy
    const validFailPolicies: FailPolicy[] = ['fail_fast', 'collect_all'];
    if (!obj.failPolicy || !validFailPolicies.includes(obj.failPolicy as FailPolicy)) {
      errors.push({ 
        field: 'failPolicy', 
        message: `failPolicy must be one of: ${validFailPolicies.join(', ')}` 
      });
    }

    // Check children
    if (!Array.isArray(obj.children)) {
      errors.push({ field: 'children', message: 'children must be an array' });
    } else {
      obj.children.forEach((child, index) => {
        const childErrors = this.validateSerializedGate(child);
        childErrors.errors.forEach(err => {
          errors.push({ 
            field: `children[${index}].${err.field}`, 
            message: err.message 
          });
        });
      });
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a serialized gate definition
   */
  static validateSerializedGate(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    if (!data || typeof data !== 'object') {
      errors.push({ field: 'root', message: 'Data must be an object' });
      return { valid: false, errors };
    }

    const obj = data as Record<string, unknown>;

    // Check schema_version
    if (!obj.schema_version) {
      errors.push({ field: 'schema_version', message: 'Missing schema_version' });
    }

    // Check type
    if (!obj.type || !['simple', 'composite'].includes(obj.type as string)) {
      errors.push({ field: 'type', message: 'type must be "simple" or "composite"' });
    }

    // Check id
    if (!obj.id || typeof obj.id !== 'string') {
      errors.push({ field: 'id', message: 'id must be a non-empty string' });
    }

    // Check name
    if (!obj.name || typeof obj.name !== 'string') {
      errors.push({ field: 'name', message: 'name must be a non-empty string' });
    }

    // For composite type, validate children
    if (obj.type === 'composite') {
      if (!Array.isArray(obj.children)) {
        errors.push({ field: 'children', message: 'children must be an array for composite gates' });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Convert a CompositeGate to JSON string
   */
  static toJSON(gate: CompositeGateDefinition): string {
    return JSON.stringify(this.serialize(gate), null, 2);
  }

  /**
   * Parse a JSON string to CompositeGateDefinition
   */
  static fromJSON(
    json: string,
    context?: { checkFnMap?: Record<string, () => Promise<any> | any> }
  ): CompositeGateDefinition {
    try {
      const data = JSON.parse(json) as SerializedCompositeGate;
      return this.deserialize(data, context);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON: ${error.message}`);
      }
      throw error;
    }
  }
}

/**
 * Helper function to validate a CompositeGateDefinition
 */
export function validateCompositeGate(gate: CompositeGateDefinition): ValidationResult {
  const errors: ValidationError[] = [];

  // Check schema_version
  if (!gate.schema_version) {
    errors.push({ field: 'schema_version', message: 'Missing schema_version' });
  }

  // Check id
  if (!gate.id || typeof gate.id !== 'string') {
    errors.push({ field: 'id', message: 'id must be a non-empty string' });
  }

  // Check name
  if (!gate.name || typeof gate.name !== 'string') {
    errors.push({ field: 'name', message: 'name must be a non-empty string' });
  }

  // Check mode
  const validModes: CompositeGateMode[] = ['sequential', 'parallel'];
  if (!gate.mode || !validModes.includes(gate.mode)) {
    errors.push({ 
      field: 'mode', 
      message: `mode must be one of: ${validModes.join(', ')}` 
    });
  }

  // Check failPolicy
  const validFailPolicies: FailPolicy[] = ['fail_fast', 'collect_all'];
  if (!gate.failPolicy || !validFailPolicies.includes(gate.failPolicy)) {
    errors.push({ 
      field: 'failPolicy', 
      message: `failPolicy must be one of: ${validFailPolicies.join(', ')}` 
    });
  }

  // Check children
  if (!Array.isArray(gate.children)) {
    errors.push({ field: 'children', message: 'children must be an array' });
  } else if (gate.children.length === 0) {
    errors.push({ field: 'children', message: 'children cannot be empty' });
  } else {
    gate.children.forEach((child, index) => {
      if (!child.id) {
        errors.push({ field: `children[${index}].id`, message: 'child gate must have id' });
      }
      if (!child.type) {
        errors.push({ field: `children[${index}].type`, message: 'child gate must have type' });
      }
    });
  }

  return { valid: errors.length === 0, errors };
}