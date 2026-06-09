/**
 * Feature: specforge-v1-1-compliance-remediation
 * Property 17: Configuration Parser/Serializer Round-Trip (WorkItemMetadata)
 * Property 14: Unknown Type Detection
 *
 * Validates: Requirements 2.1-2.24, 5.3-5.7, 6.4, 6.5, 6.6
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { StateMachine, WORK_ITEM_STATES } from '@/v11/runtime/StateMachine';
import { JsonParser } from '@/v11/runtime/JsonParser';
import { ExtensionRegistry, type ArtifactType } from '@/v11/runtime/ExtensionRegistry';
import type { WorkItemMetadata } from '@/v11/runtime/StateMachine';

describe('Property 17: WorkItemMetadata Round-Trip', () => {
  it('should produce equivalent metadata after round-trip', () => {
    fc.assert(
      fc.property(
        fc.record({
          schema_version: fc.constant('1.0' as const),
          work_item_id: fc.string({ minLength: 1, maxLength: 20 }),
          title: fc.string({ minLength: 1, maxLength: 50 }),
          description: fc.string({ maxLength: 200 }),
          current_state: fc.constantFrom(...WORK_ITEM_STATES),
          workflow_type: fc.constantFrom<'requirements-first' | 'design-first' | 'bugfix' | 'fast-task'>(
            'requirements-first', 'design-first', 'bugfix', 'fast-task',
          ),
          created_at: fc.string({ maxLength: 30 }),
          updated_at: fc.string({ maxLength: 30 }),
          created_by: fc.string({ maxLength: 30 }),
          tags: fc.oneof(fc.constant(undefined), fc.array(fc.string({ maxLength: 20 }))),
        }),
        (baseMeta) => {
          const metadata: WorkItemMetadata = {
            ...baseMeta,
            state_history: [],
          };

          const serialized = JsonParser.serialize(metadata);
          if (!serialized.success || serialized.data === undefined) return false;

          const parsed = StateMachine.parseMetadata(serialized.data);
          if (!parsed.success || parsed.data === undefined) return false;

          // Check key fields preserved
          return parsed.data.work_item_id === metadata.work_item_id
            && parsed.data.current_state === metadata.current_state
            && parsed.data.workflow_type === metadata.workflow_type;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 14: Unknown Type Detection', () => {
  const artifactTypes: ArtifactType[] = ['requirements', 'design', 'tasks', 'verification', 'gate_definition'];

  it('should detect types not in registry as unknown', () => {
    const registry = new ExtensionRegistry();

    fc.assert(
      fc.property(
        fc.constantFrom(...artifactTypes),
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.startsWith('registered_')),
        (artifactType, typeId) => {
          const unknowns = registry.detectUnknownTypes(artifactType, [typeId]);
          return unknowns.includes(typeId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should not detect registered types as unknown', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...artifactTypes),
        fc.string({ minLength: 1, maxLength: 30 }),
        (artifactType, typeId) => {
          const registry = new ExtensionRegistry();
          registry.registerType({
            namespace: artifactType === 'requirements' ? 'requirement_types'
              : artifactType === 'design' ? 'design_types'
              : artifactType === 'tasks' ? 'task_types'
              : artifactType === 'verification' ? 'verification_types'
              : 'gate_types',
            typeId,
            workItemId: 'WI-0001',
          });

          const unknowns = registry.detectUnknownTypes(artifactType, [typeId]);
          return !unknowns.includes(typeId);
        },
      ),
      { numRuns: 100 },
    );
  });
});
