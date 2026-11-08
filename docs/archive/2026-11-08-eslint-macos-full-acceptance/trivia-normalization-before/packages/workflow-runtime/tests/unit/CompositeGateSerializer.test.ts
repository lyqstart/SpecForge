/**
 * Unit tests for CompositeGateSerializer
 * Tests serialization and deserialization of CompositeGate definitions
 * 
 * Validates: Requirements 3.1 - compositeGate 序列化/反序列化
 */

import { parseJsonObject } from '@specforge/types';
import { describe, it, expect } from 'vitest';

import {
  type SerializedCompositeGate,
  type SerializedSimpleGate, CompositeGateSerializer, validateCompositeGate } from '../../src/gates/CompositeGateSerializer.js';
import type {
  SimpleGateDefinition,
  CompositeGateDefinition} from '../../src/types.js';


describe('CompositeGateSerializer', () => {
  describe('serialize', () => {
    it('should serialize a basic CompositeGateDefinition', () => {
      const gate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'test-composite',
        name: 'Test Composite Gate',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [],
      };

      const result = CompositeGateSerializer.serialize(gate);

      expect(result.type).toBe('composite');
      expect(result.id).toBe('test-composite');
      expect(result.name).toBe('Test Composite Gate');
      expect(result.mode).toBe('sequential');
      expect(result.failPolicy).toBe('collect_all');
      expect(result.children).toEqual([]);
    });

    it('should serialize CompositeGate with child gates', () => {
      const childGate: SimpleGateDefinition = {
        schema_version: '1.0',
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
      };

      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'parent-composite',
        name: 'Parent Composite Gate',
        mode: 'parallel',
        failPolicy: 'fail_fast',
        children: [childGate],
      };

      const result = CompositeGateSerializer.serialize(compositeGate);

      expect(result.children).toHaveLength(1);
      expect(result.children[0].type).toBe('simple');
      expect((result.children[0] as SerializedSimpleGate).id).toBe('child-1');
    });

    it('should serialize nested CompositeGates', () => {
      const simpleChild: SimpleGateDefinition = {
        schema_version: '1.0',
        type: 'simple',
        id: 'simple-child',
        name: 'Simple Child',
      };

      const innerComposite: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'inner-composite',
        name: 'Inner Composite',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [simpleChild],
      };

      const outerComposite: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'outer-composite',
        name: 'Outer Composite',
        mode: 'parallel',
        failPolicy: 'fail_fast',
        children: [innerComposite],
      };

      const result = CompositeGateSerializer.serialize(outerComposite);

      expect(result.children).toHaveLength(1);
      expect(result.children[0].type).toBe('composite');
      const nested = result.children[0] as SerializedCompositeGate;
      expect(nested.children[0].type).toBe('simple');
    });

    it('should throw error for non-composite gate', () => {
      const simpleGate: SimpleGateDefinition = {
        schema_version: '1.0',
        type: 'simple',
        id: 'simple-gate',
        name: 'Simple Gate',
      };

      // @ts-expect-error Deliberate malformed runtime input (TS2345); retain the rejection assertion.
      expect(() => CompositeGateSerializer.serialize(simpleGate)).toThrow(
        'Cannot serialize non-composite gate as CompositeGate'
      );
    });
  });

  describe('deserialize', () => {
    it('should deserialize a basic serialized CompositeGate', () => {
      const serialized: SerializedCompositeGate = {
        schema_version: '1.0',
        type: 'composite',
        id: 'test-composite',
        name: 'Test Composite Gate',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [],
      };

      const result = CompositeGateSerializer.deserialize(serialized);

      expect(result.type).toBe('composite');
      expect(result.id).toBe('test-composite');
      expect(result.name).toBe('Test Composite Gate');
      expect(result.mode).toBe('sequential');
      expect(result.failPolicy).toBe('collect_all');
      expect(result.children).toEqual([]);
    });

    it('should deserialize with child gates', () => {
      const serializedChild: SerializedSimpleGate = {
        schema_version: '1.0',
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
      };

      const serialized: SerializedCompositeGate = {
        schema_version: '1.0',
        type: 'composite',
        id: 'parent-composite',
        name: 'Parent Composite Gate',
        mode: 'parallel',
        failPolicy: 'fail_fast',
        children: [serializedChild],
      };

      const result = CompositeGateSerializer.deserialize(serialized);

      expect(result.children).toHaveLength(1);
      expect(result.children[0].type).toBe('simple');
      expect(result.children[0].id).toBe('child-1');
    });

    it('should deserialize nested CompositeGates', () => {
      const nestedSerialized: SerializedCompositeGate = {
        schema_version: '1.0',
        type: 'composite',
        id: 'inner-composite',
        name: 'Inner Composite',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [
          {
            schema_version: '1.0',
            type: 'simple',
            id: 'simple-child',
            name: 'Simple Child',
          },
        ],
      };

      const outerSerialized: SerializedCompositeGate = {
        schema_version: '1.0',
        type: 'composite',
        id: 'outer-composite',
        name: 'Outer Composite',
        mode: 'parallel',
        failPolicy: 'fail_fast',
        children: [nestedSerialized],
      };

      const result = CompositeGateSerializer.deserialize(outerSerialized);

      expect(result.children).toHaveLength(1);
      expect(result.children[0].type).toBe('composite');
      const innerComposite = result.children[0] as CompositeGateDefinition;
      expect(innerComposite.children[0].type).toBe('simple');
    });

    it('should restore checkFn from context', () => {
      const checkFn = (): { passed: boolean; reason: string; } => ({ passed: true, reason: 'Restored checkFn' });

      const serialized: SerializedCompositeGate = {
        schema_version: '1.0',
        type: 'composite',
        id: 'test-composite',
        name: 'Test',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [
          {
            schema_version: '1.0',
            type: 'simple',
            id: 'child-with-checkfn',
            name: 'Child with CheckFn',
            checkFn: 'myCheckFn',
          },
        ],
      };

      const context = {
        checkFnMap: {
          myCheckFn: checkFn,
        },
      };

      const result = CompositeGateSerializer.deserialize(serialized, context);

      expect(result.children[0]).toHaveProperty('checkFn');
      expect((result.children[0] as SimpleGateDefinition).checkFn).toBe(checkFn);
    });

    it('should throw error for invalid serialized data', () => {
      const invalidSerialized = {
        schema_version: '1.0',
        type: 'composite',
        // Missing id
        name: 'Test',
        mode: 'invalid-mode',
        failPolicy: 'invalid-policy',
        children: [],
      };

      // @ts-expect-error Deliberate malformed runtime input (TS2345); retain the rejection assertion.
      expect(() => CompositeGateSerializer.deserialize(invalidSerialized)).toThrow(
        'Invalid CompositeGate data'
      );
    });

    it('should throw error for invalid schema version', () => {
      const invalidSerialized: SerializedCompositeGate = {
        schema_version: '2.0',
        type: 'composite',
        id: 'test',
        name: 'Test',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [],
      };

      expect(() => CompositeGateSerializer.deserialize(invalidSerialized)).toThrow(
        'Unsupported schema version'
      );
    });
  });

  describe('toJSON and fromJSON', () => {
    it('should convert CompositeGate to JSON string', () => {
      const gate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'test-composite',
        name: 'Test Composite Gate',
        mode: 'parallel',
        failPolicy: 'fail_fast',
        children: [
          {
            schema_version: '1.0',
            type: 'simple',
            id: 'child-1',
            name: 'Child Gate',
          },
        ],
      };

      const json = CompositeGateSerializer.toJSON(gate);

      expect(typeof json).toBe('string');
      const parsed = parseJsonObject(json);
      expect(parsed.id).toBe('test-composite');
      expect(parsed.mode).toBe('parallel');
    });

    it('should parse JSON string to CompositeGate', () => {
      const json = JSON.stringify({
        schema_version: '1.0',
        type: 'composite',
        id: 'test-composite',
        name: 'Test',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [],
      });

      const result = CompositeGateSerializer.fromJSON(json);

      expect(result.type).toBe('composite');
      expect(result.id).toBe('test-composite');
      expect(result.mode).toBe('sequential');
    });

    it('should throw error for invalid JSON', () => {
      expect(() => CompositeGateSerializer.fromJSON('invalid json')).toThrow('Invalid JSON');
    });

    it('should round-trip data correctly', () => {
      const original: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'round-trip-test',
        name: 'Round Trip Test',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [
          {
            schema_version: '1.0',
            type: 'simple',
            id: 'child-1',
            name: 'Child 1',
          },
          {
            schema_version: '1.0',
            type: 'simple',
            id: 'child-2',
            name: 'Child 2',
          },
        ],
      };

      const json = CompositeGateSerializer.toJSON(original);
      const restored = CompositeGateSerializer.fromJSON(json);

      expect(restored.id).toBe(original.id);
      expect(restored.name).toBe(original.name);
      expect(restored.mode).toBe(original.mode);
      expect(restored.failPolicy).toBe(original.failPolicy);
      expect(restored.children).toHaveLength(original.children.length);
    });
  });

  describe('validateSerialized', () => {
    it('should validate a valid serialized CompositeGate', () => {
      const validSerialized: SerializedCompositeGate = {
        schema_version: '1.0',
        type: 'composite',
        id: 'valid-id',
        name: 'Valid Name',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [],
      };

      const result = CompositeGateSerializer.validateSerialized(validSerialized);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report error for missing schema_version', () => {
      const invalid: Record<string, unknown> = {
        schema_version: '1.0',
        type: 'composite',
        id: 'valid-id',
        name: 'Valid Name',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [],
      };
      delete (invalid)['schema_version'];

      const result = CompositeGateSerializer.validateSerialized(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'schema_version')).toBe(true);
    });

    it('should report error for invalid type', () => {
      const invalid: Record<string, unknown> = {
        schema_version: '1.0',
        type: 'invalid',
        id: 'valid-id',
        name: 'Valid Name',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [],
      };

      const result = CompositeGateSerializer.validateSerialized(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'type')).toBe(true);
    });

    it('should report error for invalid mode', () => {
      const invalid: Record<string, unknown> = {
        schema_version: '1.0',
        type: 'composite',
        id: 'valid-id',
        name: 'Valid Name',
        mode: 'invalid-mode',
        failPolicy: 'collect_all',
        children: [],
      };

      const result = CompositeGateSerializer.validateSerialized(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'mode')).toBe(true);
    });

    it('should report error for invalid failPolicy', () => {
      const invalid: Record<string, unknown> = {
        schema_version: '1.0',
        type: 'composite',
        id: 'valid-id',
        name: 'Valid Name',
        mode: 'sequential',
        failPolicy: 'invalid-policy',
        children: [],
      };

      const result = CompositeGateSerializer.validateSerialized(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'failPolicy')).toBe(true);
    });

    it('should report error for non-array children', () => {
      const invalid: Record<string, unknown> = {
        schema_version: '1.0',
        type: 'composite',
        id: 'valid-id',
        name: 'Valid Name',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: 'not-an-array',
      };

      const result = CompositeGateSerializer.validateSerialized(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'children')).toBe(true);
    });
  });

  describe('validateSerializedGate', () => {
    it('should validate a valid serialized simple gate', () => {
      const validGate: SerializedSimpleGate = {
        schema_version: '1.0',
        type: 'simple',
        id: 'simple-gate',
        name: 'Simple Gate',
      };

      const result = CompositeGateSerializer.validateSerializedGate(validGate);

      expect(result.valid).toBe(true);
    });

    it('should report error for invalid gate type', () => {
      const invalidGate: Record<string, unknown> = {
        schema_version: '1.0',
        type: 'unknown',
        id: 'gate-id',
        name: 'Gate Name',
      };

      const result = CompositeGateSerializer.validateSerializedGate(invalidGate);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'type')).toBe(true);
    });
  });
});

describe('validateCompositeGate', () => {
  it('should validate a valid CompositeGateDefinition', () => {
    const gate: CompositeGateDefinition = {
      schema_version: '1.0',
      type: 'composite',
      id: 'valid-composite',
      name: 'Valid Composite',
      mode: 'sequential',
      failPolicy: 'collect_all',
      children: [
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'child-1',
          name: 'Child 1',
        },
      ],
    };

    const result = validateCompositeGate(gate);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should report error for missing schema_version', () => {
    const gate: Record<string, unknown> = {
      schema_version: '1.0',
      type: 'composite',
      id: 'valid-id',
      name: 'Valid Name',
      mode: 'sequential',
      failPolicy: 'collect_all',
      children: [],
    };
    delete gate.schema_version;

    // @ts-expect-error Deliberate malformed runtime input (TS2345); retain the rejection assertion.
    const result = validateCompositeGate(gate);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'schema_version')).toBe(true);
  });

  it('should report error for empty children', () => {
    const gate: CompositeGateDefinition = {
      schema_version: '1.0',
      type: 'composite',
      id: 'valid-id',
      name: 'Valid Name',
      mode: 'sequential',
      failPolicy: 'collect_all',
      children: [],
    };

    const result = validateCompositeGate(gate);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'children')).toBe(true);
  });

  it('should report error for invalid mode', () => {
    const gate: CompositeGateDefinition = {
      schema_version: '1.0',
      type: 'composite',
      id: 'valid-id',
      name: 'Valid Name',
      // @ts-expect-error Deliberate malformed runtime input (TS2322); retain the rejection assertion.
      mode: 'invalid-mode',
      failPolicy: 'collect_all',
      children: [
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'child-1',
          name: 'Child',
        },
      ],
    };

    const result = validateCompositeGate(gate);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'mode')).toBe(true);
  });

  it('should report error for invalid failPolicy', () => {
    const gate: CompositeGateDefinition = {
      schema_version: '1.0',
      type: 'composite',
      id: 'valid-id',
      name: 'Valid Name',
      mode: 'sequential',
      // @ts-expect-error Deliberate malformed runtime input (TS2322); retain the rejection assertion.
      failPolicy: 'invalid-policy',
      children: [
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'child-1',
          name: 'Child',
        },
      ],
    };

    const result = validateCompositeGate(gate);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'failPolicy')).toBe(true);
  });

  it('should report error for child gate without id', () => {
    const gate: CompositeGateDefinition = {
      schema_version: '1.0',
      type: 'composite',
      id: 'valid-id',
      name: 'Valid Name',
      mode: 'sequential',
      failPolicy: 'collect_all',
      children: [
        // @ts-expect-error Deliberate malformed runtime input (TS2322); retain the rejection assertion.
        {
          schema_version: '1.0',
          type: 'simple',
          // Missing id
          name: 'Child',
        },
      ],
    };

    const result = validateCompositeGate(gate);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field.includes('children'))).toBe(true);
  });
});