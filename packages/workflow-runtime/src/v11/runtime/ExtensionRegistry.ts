/**
 * ExtensionRegistry.ts — SpecForge v1.1 Extension Registry and Subflow
 *
 * Manages extension type registration, unknown type detection,
 * extension request generation, and extension subflow orchestration.
 *
 * Requirements: 5.1-5.30
 */

import { JsonParser } from './JsonParser.js';

// ---- Types ----

export interface ExtensionTypeEntry {
  type_id: string;
  display_name: string;
  description: string;
  registered_at: string;
  registered_by_work_item: string;
}

export interface ExtensionRegistryData {
  schema_version: '1.0';
  project_spec_version: string;
  namespaces: {
    requirement_types: string[];
    design_types: string[];
    task_types: string[];
    verification_types: string[];
    gate_types: string[];
  };
  updated_by_work_item: string | null;
  updated_at: string | null;
}

export interface ExtensionRequestData {
  schema_version: '1.0';
  work_item_id: string;
  requested_types: Array<{
    namespace: string;
    type_id: string;
    usage_context: string;
  }>;
  blocking_current_flow: boolean;
  requested_at: string;
}

export type ArtifactType = 'requirements' | 'design' | 'tasks' | 'verification' | 'gate_definition';

// ---- Constants ----

const ARTIFACT_TO_NAMESPACE: Record<ArtifactType, keyof ExtensionRegistryData['namespaces']> = {
  requirements: 'requirement_types',
  design: 'design_types',
  tasks: 'task_types',
  verification: 'verification_types',
  gate_definition: 'gate_types',
};

/**
 * ExtensionRegistry — manages extension types.
 *
 * Requirements: 5.1, 5.2
 */
export class ExtensionRegistry {
  private data: ExtensionRegistryData;

  constructor(initialData?: ExtensionRegistryData) {
    this.data = initialData ?? {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      namespaces: {
        requirement_types: [],
        design_types: [],
        task_types: [],
        verification_types: [],
        gate_types: [],
      },
      updated_by_work_item: null,
      updated_at: null,
    };
  }

  /**
   * Get current registry data.
   */
  getData(): Readonly<ExtensionRegistryData> {
    return this.data;
  }

  /**
   * Check if a type is registered in a namespace.
   * Requirements: 5.3-5.7
   */
  isTypeRegistered(namespace: keyof ExtensionRegistryData['namespaces'], typeId: string): boolean {
    return this.data.namespaces[namespace].includes(typeId);
  }

  /**
   * Detect unknown types in an artifact.
   * Requirements: 5.3-5.7
   */
  detectUnknownTypes(artifactType: ArtifactType, usedTypes: string[]): string[] {
    const namespace = ARTIFACT_TO_NAMESPACE[artifactType];
    const registered = new Set(this.data.namespaces[namespace]);
    return usedTypes.filter((t) => !registered.has(t));
  }

  /**
   * Generate an extension request for unknown types.
   * Requirements: 5.8-5.11
   */
  generateExtensionRequest(params: {
    workItemId: string;
    artifactType: ArtifactType;
    unknownTypes: string[];
    usageContext?: string;
    blocking?: boolean;
  }): ExtensionRequestData {
    return {
      schema_version: '1.0',
      work_item_id: params.workItemId,
      requested_types: params.unknownTypes.map((typeId) => ({
        namespace: ARTIFACT_TO_NAMESPACE[params.artifactType],
        type_id: typeId,
        usage_context: params.usageContext ?? `Type '${typeId}' needed for ${params.artifactType}`,
      })),
      blocking_current_flow: params.blocking ?? true,
      requested_at: new Date().toISOString(),
    };
  }

  /**
   * Register a new type in a namespace.
   * Requirements: 5.19-5.22
   */
  registerType(params: {
    namespace: keyof ExtensionRegistryData['namespaces'];
    typeId: string;
    workItemId: string;
  }): { success: boolean; error?: string | undefined } {
    // Check for conflicts
    if (this.data.namespaces[params.namespace].includes(params.typeId)) {
      return { success: false, error: `Type '${params.typeId}' already registered in ${params.namespace}` };
    }

    // Add the type
    this.data.namespaces[params.namespace].push(params.typeId);
    this.data.updated_by_work_item = params.workItemId;
    this.data.updated_at = new Date().toISOString();

    return { success: true };
  }

  /**
   * Serialize the registry to JSON.
   */
  serialize(): { success: boolean; data?: string | undefined; error?: string | undefined } {
    return JsonParser.serialize(this.data);
  }

  /**
   * Parse registry from JSON.
   */
  static parse(jsonString: string): { success: boolean; data?: ExtensionRegistry | undefined; error?: string | undefined } {
    const result = JsonParser.parse<ExtensionRegistryData>(jsonString);
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    return { success: true, data: new ExtensionRegistry(result.data) };
  }
}

/**
 * ExtensionGate — validates extension type definitions.
 * Requirements: 5.15-5.18
 */
export class ExtensionGate {
  /**
   * Validate extension type definition completeness.
   * Requirement: 5.16
   */
  validateCompleteness(request: ExtensionRequestData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (request.requested_types.length === 0) {
      errors.push('Extension request must contain at least one type');
    }

    for (const type of request.requested_types) {
      if (!type.type_id || type.type_id.trim().length === 0) {
        errors.push('Type ID must be non-empty');
      }
      if (!type.namespace || type.namespace.trim().length === 0) {
        errors.push('Namespace must be non-empty');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check for conflicts with existing types.
   * Requirement: 5.17
   */
  validateNoConflicts(
    request: ExtensionRequestData,
    existingRegistry: ExtensionRegistryData,
  ): { valid: boolean; conflicts: string[] } {
    const conflicts: string[] = [];

    for (const type of request.requested_types) {
      const existing = existingRegistry.namespaces[type.namespace as keyof typeof existingRegistry.namespaces];
      if (existing && existing.includes(type.type_id)) {
        conflicts.push(`Type '${type.type_id}' already exists in namespace '${type.namespace}'`);
      }
    }

    return { valid: conflicts.length === 0, conflicts };
  }

  /**
   * This is a hard_gate.
   * Requirement: 5.18
   */
  readonly gateType = 'hard_gate' as const;
}
