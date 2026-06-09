/**
 * Feature: specforge-v1-1-compliance-remediation
 * Unit tests for Extension Registry
 *
 * Requirements: 5.1-5.30
 */

import { describe, it, expect } from 'vitest';
import { ExtensionRegistry, ExtensionGate } from '@/v11/runtime/ExtensionRegistry';

describe('ExtensionRegistry', () => {
  describe('Initialization', () => {
    it('should initialize with empty namespaces', () => {
      const registry = new ExtensionRegistry();
      const data = registry.getData();

      expect(data.schema_version).toBe('1.0');
      expect(data.namespaces.requirement_types).toEqual([]);
      expect(data.namespaces.design_types).toEqual([]);
      expect(data.namespaces.task_types).toEqual([]);
      expect(data.namespaces.verification_types).toEqual([]);
      expect(data.namespaces.gate_types).toEqual([]);
    });
  });

  describe('Type registration', () => {
    it('should register a new type', () => {
      const registry = new ExtensionRegistry();
      const result = registry.registerType({
        namespace: 'requirement_types',
        typeId: 'performance_requirement',
        workItemId: 'WI-0001',
      });

      expect(result.success).toBe(true);
      expect(registry.isTypeRegistered('requirement_types', 'performance_requirement')).toBe(true);
    });

    it('should reject duplicate type registration', () => {
      const registry = new ExtensionRegistry();
      registry.registerType({
        namespace: 'requirement_types',
        typeId: 'performance_requirement',
        workItemId: 'WI-0001',
      });

      const result = registry.registerType({
        namespace: 'requirement_types',
        typeId: 'performance_requirement',
        workItemId: 'WI-0002',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already registered');
    });
  });

  describe('Unknown type detection', () => {
    it('should detect unknown types in requirements', () => {
      const registry = new ExtensionRegistry();
      const unknowns = registry.detectUnknownTypes('requirements', ['functional_requirement', 'unknown_type']);
      expect(unknowns).toEqual(['functional_requirement', 'unknown_type']);
    });

    it('should not flag registered types as unknown', () => {
      const registry = new ExtensionRegistry();
      registry.registerType({
        namespace: 'requirement_types',
        typeId: 'functional_requirement',
        workItemId: 'WI-0001',
      });

      const unknowns = registry.detectUnknownTypes('requirements', ['functional_requirement', 'unknown_type']);
      expect(unknowns).toEqual(['unknown_type']);
    });

    it('should detect unknown types in all artifact types', () => {
      const registry = new ExtensionRegistry();
      expect(registry.detectUnknownTypes('design', ['arch_type']).length).toBeGreaterThan(0);
      expect(registry.detectUnknownTypes('tasks', ['task_type']).length).toBeGreaterThan(0);
      expect(registry.detectUnknownTypes('verification', ['verify_type']).length).toBeGreaterThan(0);
      expect(registry.detectUnknownTypes('gate_definition', ['gate_type']).length).toBeGreaterThan(0);
    });
  });

  describe('Extension request generation', () => {
    it('should generate extension request for unknown types', () => {
      const registry = new ExtensionRegistry();
      const request = registry.generateExtensionRequest({
        workItemId: 'WI-0001',
        artifactType: 'requirements',
        unknownTypes: ['performance_requirement'],
        usageContext: 'Need performance requirements',
      });

      expect(request.schema_version).toBe('1.0');
      expect(request.work_item_id).toBe('WI-0001');
      expect(request.blocking_current_flow).toBe(true);
      expect(request.requested_types).toHaveLength(1);
      expect(request.requested_types[0].namespace).toBe('requirement_types');
      expect(request.requested_types[0].type_id).toBe('performance_requirement');
    });
  });

  describe('Serialization', () => {
    it('should serialize and parse registry', () => {
      const registry = new ExtensionRegistry();
      registry.registerType({
        namespace: 'requirement_types',
        typeId: 'func_req',
        workItemId: 'WI-0001',
      });

      const serialized = registry.serialize();
      expect(serialized.success).toBe(true);

      const parsed = ExtensionRegistry.parse(serialized.data!);
      expect(parsed.success).toBe(true);
      expect(parsed.data!.isTypeRegistered('requirement_types', 'func_req')).toBe(true);
    });
  });
});

describe('ExtensionGate', () => {
  const gate = new ExtensionGate();

  describe('Completeness validation', () => {
    it('should pass for valid requests', () => {
      const request = {
        schema_version: '1.0' as const,
        work_item_id: 'WI-0001',
        requested_types: [{
          namespace: 'requirement_types',
          type_id: 'perf_req',
          usage_context: 'Performance requirements',
        }],
        blocking_current_flow: true,
        requested_at: new Date().toISOString(),
      };

      const result = gate.validateCompleteness(request);
      expect(result.valid).toBe(true);
    });

    it('should fail for empty requested types', () => {
      const request = {
        schema_version: '1.0' as const,
        work_item_id: 'WI-0001',
        requested_types: [],
        blocking_current_flow: true,
        requested_at: new Date().toISOString(),
      };

      const result = gate.validateCompleteness(request);
      expect(result.valid).toBe(false);
    });
  });

  describe('Conflict detection', () => {
    it('should detect conflicts with existing types', () => {
      const existing = {
        schema_version: '1.0' as const,
        project_spec_version: 'PSV-0001',
        namespaces: {
          requirement_types: ['func_req'],
          design_types: [],
          task_types: [],
          verification_types: [],
          gate_types: [],
        },
        updated_by_work_item: null,
        updated_at: null,
      };

      const request = {
        schema_version: '1.0' as const,
        work_item_id: 'WI-0001',
        requested_types: [{
          namespace: 'requirement_types',
          type_id: 'func_req', // Conflict!
          usage_context: 'Test',
        }],
        blocking_current_flow: true,
        requested_at: new Date().toISOString(),
      };

      const result = gate.validateNoConflicts(request, existing);
      expect(result.valid).toBe(false);
      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it('should pass when no conflicts', () => {
      const existing = {
        schema_version: '1.0' as const,
        project_spec_version: 'PSV-0001',
        namespaces: {
          requirement_types: ['func_req'],
          design_types: [],
          task_types: [],
          verification_types: [],
          gate_types: [],
        },
        updated_by_work_item: null,
        updated_at: null,
      };

      const request = {
        schema_version: '1.0' as const,
        work_item_id: 'WI-0001',
        requested_types: [{
          namespace: 'requirement_types',
          type_id: 'perf_req', // No conflict
          usage_context: 'Test',
        }],
        blocking_current_flow: true,
        requested_at: new Date().toISOString(),
      };

      const result = gate.validateNoConflicts(request, existing);
      expect(result.valid).toBe(true);
    });
  });

  it('should be a hard gate', () => {
    expect(gate.gateType).toBe('hard_gate');
  });
});
