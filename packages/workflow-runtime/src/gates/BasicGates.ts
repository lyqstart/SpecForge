/**
 * Basic Gate Types Module
 * Implements RequirementsGate, DesignGate, TasksGate, and VerificationGate
 */

import { GateResult, SimpleGateDefinition } from '../types.js';

const CURRENT_SCHEMA_VERSION = '1.0';

/**
 * Create a GateResult with schema_version
 */
function createGateResult(result: Omit<GateResult, 'schema_version'>): GateResult {
  return { schema_version: CURRENT_SCHEMA_VERSION, ...result };
}

/**
 * Base class for all basic Gate types
 */
export abstract class BaseGate {
  protected id: string;
  protected name: string;
  protected config: Record<string, unknown>;

  /**
   * Create a new BaseGate
   */
  constructor(id: string, name: string, config: Record<string, unknown> = {}) {
    this.id = id;
    this.name = name;
    this.config = config;
  }

  /**
   * Get the gate ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get the gate name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get the gate configuration
   */
  getConfig(): Record<string, unknown> {
    return this.config;
  }

  /**
   * Execute the gate check
   * Must be implemented by subclasses
   */
  abstract check(): Promise<GateResult> | GateResult;

  /**
   * Get gate definition for serialization
   */
  abstract toGateDefinition(): SimpleGateDefinition;
}

/**
 * RequirementsGate - Validates requirements completeness
 * Checks if all required sections are present and properly formatted
 */
export class RequirementsGate extends BaseGate {
  private requiredSections: string[];
  private minLength: number;

  /**
   * Create a new RequirementsGate
   */
  constructor(
    id: string = 'requirements-gate',
    config: {
      requiredSections?: string[];
      minLength?: number;
    } = {}
  ) {
    super(id, 'Requirements Gate', config);
    this.requiredSections = config.requiredSections ?? [
      'Introduction',
      'Requirements',
      'Acceptance Criteria',
    ];
    this.minLength = config.minLength ?? 100;
  }

  /**
   * Check requirements completeness
   * Accepts requirements content directly or via config
   */
  check(): GateResult {
    const requirementsContent = this.config.content as string | undefined;
    
    if (!requirementsContent) {
      // No content provided - check if content is expected to be loaded from elsewhere
      if (this.config.requireContent === false) {
        // Content not required for this gate
        return createGateResult({
          passed: true,
          reason: 'Requirements gate check passed (no content required)',
          details: { gateId: this.id },
        });
      }
      
      return createGateResult({
        passed: false,
        reason: 'No requirements content provided',
        details: { gateId: this.id },
      });
    }

    // Check required sections
    const missingSections: string[] = [];
    for (const section of this.requiredSections) {
      if (!requirementsContent.toLowerCase().includes(section.toLowerCase())) {
        missingSections.push(section);
      }
    }

    if (missingSections.length > 0) {
      return createGateResult({
        passed: false,
        reason: `Missing required sections: ${missingSections.join(', ')}`,
        details: {
          gateId: this.id,
          missingSections,
          requiredSections: this.requiredSections,
        },
      });
    }

    // Check minimum length
    if (requirementsContent.length < this.minLength) {
      return createGateResult({
        passed: false,
        reason: `Requirements content too short (${requirementsContent.length} chars, minimum ${this.minLength})`,
        details: {
          gateId: this.id,
          contentLength: requirementsContent.length,
          minLength: this.minLength,
        },
      });
    }

    return createGateResult({
      passed: true,
      reason: 'All required sections present and content meets minimum length',
      details: {
        gateId: this.id,
        contentLength: requirementsContent.length,
        sectionsFound: this.requiredSections.length,
      },
    });
  }

  /**
   * Convert to GateDefinition
   */
  toGateDefinition(): SimpleGateDefinition {
    return {
      schema_version: CURRENT_SCHEMA_VERSION,
      type: 'simple',
      id: this.id,
      name: this.name,
    };
  }
}

/**
 * DesignGate - Validates design completeness
 * Checks if design document has all required components
 */
export class DesignGate extends BaseGate {
  private requiredComponents: string[];

  /**
   * Create a new DesignGate
   */
  constructor(
    id: string = 'design-gate',
    config: {
      requiredComponents?: string[];
    } = {}
  ) {
    super(id, 'Design Gate', config);
    this.requiredComponents = config.requiredComponents ?? [
      'Architecture',
      'Implementation Details',
      'Data Models',
    ];
  }

  /**
   * Check design completeness
   */
  check(): GateResult {
    const designContent = this.config.content as string | undefined;

    if (!designContent) {
      if (this.config.requireContent === false) {
        return createGateResult({
          passed: true,
          reason: 'Design gate check passed (no content required)',
          details: { gateId: this.id },
        });
      }

      return createGateResult({
        passed: false,
        reason: 'No design content provided',
        details: { gateId: this.id },
      });
    }

    // Check required components
    const missingComponents: string[] = [];
    for (const component of this.requiredComponents) {
      if (!designContent.toLowerCase().includes(component.toLowerCase())) {
        missingComponents.push(component);
      }
    }

    if (missingComponents.length > 0) {
      return createGateResult({
        passed: false,
        reason: `Missing required design components: ${missingComponents.join(', ')}`,
        details: {
          gateId: this.id,
          missingComponents,
          requiredComponents: this.requiredComponents,
        },
      });
    }

    return createGateResult({
      passed: true,
      reason: 'All required design components present',
      details: {
        gateId: this.id,
        componentsFound: this.requiredComponents.length,
      },
    });
  }

  /**
   * Convert to GateDefinition
   */
  toGateDefinition(): SimpleGateDefinition {
    return {
      schema_version: CURRENT_SCHEMA_VERSION,
      type: 'simple',
      id: this.id,
      name: this.name,
    };
  }
}

/**
 * TasksGate - Validates tasks completeness
 * Checks if all tasks are defined with proper structure
 */
export class TasksGate extends BaseGate {
  private minTasks: number;
  private requirePhases: boolean;

  /**
   * Create a new TasksGate
   */
  constructor(
    id: string = 'tasks-gate',
    config: {
      minTasks?: number;
      requirePhases?: boolean;
    } = {}
  ) {
    super(id, 'Tasks Gate', config);
    this.minTasks = config.minTasks ?? 1;
    this.requirePhases = config.requirePhases ?? false;
  }

  /**
   * Check tasks completeness
   */
  check(): GateResult {
    const tasksContent = this.config.content as string | undefined;
    const tasksData = this.config.tasks as Array<{ id: string; title: string; subtasks?: Array<{ id: string }> }> | undefined;

    // If tasks are provided as structured data
    if (tasksData) {
      if (tasksData.length < this.minTasks) {
        return createGateResult({
          passed: false,
          reason: `Insufficient tasks (${tasksData.length}, minimum ${this.minTasks})`,
          details: {
            gateId: this.id,
            taskCount: tasksData.length,
            minTasks: this.minTasks,
          },
        });
      }

      // Check for empty task titles
      const emptyTasks = tasksData.filter(t => !t.title || t.title.trim() === '');
      if (emptyTasks.length > 0) {
        return createGateResult({
          passed: false,
          reason: `Found ${emptyTasks.length} tasks with empty titles`,
          details: {
            gateId: this.id,
            emptyTaskIds: emptyTasks.map(t => t.id),
          },
        });
      }

      // Check if phases are required
      if (this.requirePhases) {
        const tasksWithSubtasks = tasksData.filter(t => t.subtasks && t.subtasks.length > 0);
        if (tasksWithSubtasks.length === 0) {
          return createGateResult({
            passed: false,
            reason: 'Tasks require phases (subtasks) but none found',
            details: {
              gateId: this.id,
              requirePhases: true,
            },
          });
        }
      }

      return createGateResult({
        passed: true,
        reason: `All ${tasksData.length} tasks are valid`,
        details: {
          gateId: this.id,
          taskCount: tasksData.length,
        },
      });
    }

    // If content is provided as text
    if (tasksContent) {
      // Basic check: look for task markers like "- [ ]" or "1."
      const taskMarkers = tasksContent.match(/^[-*]\s*\[\s*\]|^\\d+\\./m);
      const taskCount = taskMarkers?.length ?? 0;

      if (taskCount < this.minTasks) {
        return createGateResult({
          passed: false,
          reason: `Insufficient tasks found in content (${taskCount}, minimum ${this.minTasks})`,
          details: {
            gateId: this.id,
            taskCount,
            minTasks: this.minTasks,
          },
        });
      }

      return createGateResult({
        passed: true,
        reason: `Found ${taskCount} tasks in content`,
        details: {
          gateId: this.id,
          taskCount,
        },
      });
    }

    // No content provided
    if (this.config.requireContent === false) {
      return createGateResult({
        passed: true,
        reason: 'Tasks gate check passed (no content required)',
        details: { gateId: this.id },
      });
    }

    return createGateResult({
      passed: false,
      reason: 'No tasks content provided',
      details: { gateId: this.id },
    });
  }

  /**
   * Convert to GateDefinition
   */
  toGateDefinition(): SimpleGateDefinition {
    return {
      schema_version: CURRENT_SCHEMA_VERSION,
      type: 'simple',
      id: this.id,
      name: this.name,
    };
  }
}

/**
 * VerificationGate - Validates verification criteria
 * Checks if verification tests and checks are in place
 */
export class VerificationGate extends BaseGate {
  private requireTests: boolean;
  private minTests: number;

  /**
   * Create a new VerificationGate
   */
  constructor(
    id: string = 'verification-gate',
    config: {
      requireTests?: boolean;
      minTests?: number;
    } = {}
  ) {
    super(id, 'Verification Gate', config);
    this.requireTests = config.requireTests ?? true;
    this.minTests = config.minTests ?? 1;
  }

  /**
   * Check verification completeness
   */
  check(): GateResult {
    const verificationContent = this.config.content as string | undefined;
    const testData = this.config.testCount as number | undefined;
    const hasUnitTests = this.config.hasUnitTests as boolean | undefined;
    const hasPropertyTests = this.config.hasPropertyTests as boolean | undefined;

    // If test count is provided directly
    if (testData !== undefined) {
      if (this.requireTests && testData < this.minTests) {
        return createGateResult({
          passed: false,
          reason: `Insufficient tests (${testData}, minimum ${this.minTests})`,
          details: {
            gateId: this.id,
            testCount: testData,
            minTests: this.minTests,
          },
        });
      }

      return createGateResult({
        passed: true,
        reason: `Verification complete with ${testData} tests`,
        details: {
          gateId: this.id,
          testCount: testData,
          hasUnitTests,
          hasPropertyTests,
        },
      });
    }

    // If content is provided as text
    if (verificationContent) {
      // Look for test-related keywords
      const testKeywords = ['test', 'verify', 'check', 'validate', 'spec'];
      const foundKeywords = testKeywords.filter(keyword =>
        verificationContent.toLowerCase().includes(keyword)
      );

      if (foundKeywords.length === 0) {
        return createGateResult({
          passed: false,
          reason: 'No verification criteria found in content',
          details: {
            gateId: this.id,
          },
        });
      }

      return createGateResult({
        passed: true,
        reason: `Verification criteria found: ${foundKeywords.join(', ')}`,
        details: {
          gateId: this.id,
          keywordsFound: foundKeywords,
        },
      });
    }

    // No content provided
    if (this.config.requireContent === false) {
      return createGateResult({
        passed: true,
        reason: 'Verification gate check passed (no content required)',
        details: { gateId: this.id },
      });
    }

    return createGateResult({
      passed: false,
      reason: 'No verification content provided',
      details: { gateId: this.id },
    });
  }

  /**
   * Convert to GateDefinition
   */
  toGateDefinition(): SimpleGateDefinition {
    return {
      schema_version: CURRENT_SCHEMA_VERSION,
      type: 'simple',
      id: this.id,
      name: this.name,
    };
  }
}

/**
 * Factory function to create basic gate instances
 */
export function createBasicGate(
  type: 'requirements' | 'design' | 'tasks' | 'verification',
  config?: Record<string, unknown>
): BaseGate {
  switch (type) {
    case 'requirements':
      return new RequirementsGate(config?.id as string, config);
    case 'design':
      return new DesignGate(config?.id as string, config);
    case 'tasks':
      return new TasksGate(config?.id as string, config);
    case 'verification':
      return new VerificationGate(config?.id as string, config);
    default:
      throw new Error(`Unknown gate type: ${type}`);
  }
}