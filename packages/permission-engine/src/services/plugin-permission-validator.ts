/**
 * Plugin Permission Validator
 * 
 * Validates plugin permission requirements against granted permissions.
 * Implements Property 28: Plugin Permission Gate
 * 
 * Requirements 3.2: Plugin Sandbox Permission Implementation
 * - Parse plugin manifest `requires` field
 * - Compare with granted permission set
 * - Reject plugins with unauthorized requirements
 * 
 * @specforge/permission-engine
 */

import { z } from 'zod';
import { 
  PluginPermissionDeniedEventPayload, 
  createPluginPermissionDeniedEvent 
} from '../types/events';

/**
 * Plugin manifest schema
 * Based on V6 plugin specification
 */
export const PluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  requires: z.array(z.string()).optional(),  // Required permissions
  permissions: z.array(z.string()).optional(), // Declared permissions used by plugin
  entry: z.string().optional(),
  dependencies: z.record(z.string()).optional()
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/**
 * Grant set configuration
 * Represents permissions that have been granted to a user/project
 */
export const GrantSetSchema = z.object({
  permissions: z.array(z.string()),  // Array of granted permission names
  roles: z.array(z.string()).optional(), // Array of granted role names
  scope: z.string().optional()  // Optional scope限制
});

export type GrantSet = z.infer<typeof GrantSetSchema>;

/**
 * Validation result for plugin requirements
 */
export interface PluginValidationResult {
  valid: boolean;
  pluginId: string;
  pluginName: string;
  missingRequirements: string[];
  reason: 'requirements_not_granted' | 'valid';
}

/**
 * Configuration for PluginPermissionValidator
 */
export interface PluginPermissionValidatorConfig {
  /** Project ID for event logging */
  projectId?: string;
  /** Event logging enabled */
  eventLoggingEnabled?: boolean;
  /** Path to events file (for logging) */
  eventsFilePath?: string;
  /** Custom event logger function */
  logEvent?: (event: any) => Promise<void>;
  /** Default grant set to use if none provided */
  defaultGrants?: GrantSet;
  /** Allowed permissions (whitelist) - if provided, requires must be subset of this */
  allowedPermissions?: string[];
}

/**
 * Plugin Permission Validator
 * 
 * Validates plugin manifest requirements against granted permissions.
 * Implements Requirement 3.2 AC-2: "Read plugin's `requires` field during loading, 
 * compare with user grants; IF permissions not granted, THEN reject loading."
 */
export class PluginPermissionValidator {
  private config: Required<PluginPermissionValidatorConfig>;
  private allowedPermissions: Set<string>;
  
  constructor(config: PluginPermissionValidatorConfig = {}) {
    this.config = {
      projectId: config.projectId || 'default-project',
      eventLoggingEnabled: config.eventLoggingEnabled ?? true,
      eventsFilePath: config.eventsFilePath || './.specforge/observability/events.jsonl',
      logEvent: config.logEvent || this.defaultLogEvent.bind(this),
      defaultGrants: config.defaultGrants || { permissions: [] },
      allowedPermissions: config.allowedPermissions 
        ? new Set(config.allowedPermissions)
        : new Set(config.defaultGrants?.permissions || [])
    };
    
    // Initialize allowed permissions from config
    this.allowedPermissions = new Set(config.allowedPermissions || config.defaultGrants?.permissions || []);
  }

  /**
   * Validate plugin requirements against granted permissions
   * 
   * @param manifest Plugin manifest to validate
   * @param grants Permission grants (uses default if not provided)
   * @returns Validation result with missing requirements if any
   */
  validate(manifest: PluginManifest, grants?: GrantSet): PluginValidationResult {
    // Determine which grants to use:
    // - If grants parameter is explicitly provided, use it (custom grants override everything)
    // - Otherwise, use the defaultGrants from config
    const isCustomGrants = grants !== undefined;
    const effectiveGrants = grants || this.config.defaultGrants;
    
    // Parse and validate the manifest
    const parsedManifest = this.parseManifest(manifest);
    if (!parsedManifest) {
      return {
        valid: false,
        pluginId: manifest.id || 'unknown',
        pluginName: manifest.name || 'unknown',
        missingRequirements: [],
        reason: 'requirements_not_granted'
      };
    }

    const requiredPermissions = parsedManifest.requires || [];
    
    // Use the appropriate permission source:
    // - If custom grants are explicitly provided, use grants.permissions directly
    // - If allowedPermissions is explicitly configured (whitelist mode), use it
    // - Otherwise, use defaultGrants.permissions
    let permissionSource: Set<string>;
    if (isCustomGrants) {
      // Custom grants override everything - use them directly
      permissionSource = new Set(effectiveGrants.permissions);
    } else if (this.config.allowedPermissions.size > 0) {
      // Use the configured whitelist (only when using default grants)
      permissionSource = this.config.allowedPermissions;
    } else {
      // Use default grants
      permissionSource = new Set(effectiveGrants.permissions);
    }

    // Find missing requirements
    const missingRequirements = requiredPermissions.filter(
      req => !permissionSource.has(req)
    );

    // Log the validation result
    if (missingRequirements.length > 0) {
      this.logRejection({
        pluginId: parsedManifest.id,
        pluginName: parsedManifest.name,
        reason: 'requirements_not_granted',
        details: {
          missingRequirements
        }
      });
    }

    return {
      valid: missingRequirements.length === 0,
      pluginId: parsedManifest.id,
      pluginName: parsedManifest.name,
      missingRequirements,
      reason: missingRequirements.length > 0 ? 'requirements_not_granted' : 'valid'
    };
  }

  /**
   * Parse and validate plugin manifest
   */
  private parseManifest(manifest: PluginManifest): PluginManifest | null {
    try {
      return PluginManifestSchema.parse(manifest);
    } catch (error) {
      console.error('Invalid plugin manifest:', error);
      return null;
    }
  }

  /**
   * Log plugin permission denial event
   */
  private async logRejection(payload: {
    pluginId: string;
    pluginName: string;
    reason: 'requirements_not_granted' | 'prohibited_api' | 'static_check_failed';
    details?: {
      missingRequirements?: string[];
      prohibitedApis?: string[];
      staticCheckErrors?: string[];
    };
  }): Promise<void> {
    if (!this.config.eventLoggingEnabled) {
      return;
    }

    try {
      const eventPayload: PluginPermissionDeniedEventPayload = {
        pluginId: payload.pluginId,
        pluginName: payload.pluginName,
        reason: payload.reason,
        details: payload.details
      };

      const event = createPluginPermissionDeniedEvent(
        this.config.projectId,
        eventPayload
      );

      await this.config.logEvent(event);
    } catch (error) {
      console.error('Failed to log plugin permission denial event:', error);
    }
  }

  /**
   * Default event logging function
   */
  private async defaultLogEvent(_event: any): Promise<void> {
    // Default implementation does nothing
    // Override with actual file logging in production
  }

  /**
   * Update allowed permissions (whitelist mode)
   */
  setAllowedPermissions(permissions: string[]): void {
    this.allowedPermissions = new Set(permissions);
  }

  /**
   * Get current allowed permissions
   */
  getAllowedPermissions(): string[] {
    return Array.from(this.allowedPermissions);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PluginPermissionValidatorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      allowedPermissions: config.allowedPermissions !== undefined
        ? new Set(config.allowedPermissions)
        : this.allowedPermissions
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): PluginPermissionValidatorConfig {
    return {
      projectId: this.config.projectId,
      eventLoggingEnabled: this.config.eventLoggingEnabled,
      eventsFilePath: this.config.eventsFilePath,
      defaultGrants: this.config.defaultGrants,
      allowedPermissions: Array.from(this.allowedPermissions)
    };
  }

  /**
   * Check if a single permission is granted
   */
  hasPermission(permission: string, grants?: GrantSet): boolean {
    // Custom grants always take precedence
    if (grants !== undefined) {
      return grants.permissions.includes(permission);
    }
    
    // Use allowedPermissions if configured (whitelist mode)
    if (this.config.allowedPermissions.size > 0) {
      return this.config.allowedPermissions.has(permission);
    }
    
    // Fall back to default grants
    return this.config.defaultGrants.permissions.includes(permission);
  }

  /**
   * Batch validate multiple plugins
   * Returns results for all plugins
   */
  validateBatch(
    manifests: PluginManifest[], 
    grants?: GrantSet
  ): PluginValidationResult[] {
    return manifests.map(manifest => this.validate(manifest, grants));
  }

  /**
   * Get all unique requirements from multiple plugins
   */
  getAllRequirements(manifests: PluginManifest[]): string[] {
    const requirements = new Set<string>();
    
    for (const manifest of manifests) {
      const parsed = this.parseManifest(manifest);
      if (parsed?.requires) {
        for (const req of parsed.requires) {
          requirements.add(req);
        }
      }
    }
    
    return Array.from(requirements);
  }
}

/**
 * Create a plugin permission validator with common configurations
 */
export function createPluginPermissionValidator(
  config?: PluginPermissionValidatorConfig
): PluginPermissionValidator {
  return new PluginPermissionValidator(config);
}

/**
 * Default plugin permission validator
 * With common permissions pre-configured
 */
export function createDefaultPluginPermissionValidator(
  projectId?: string
): PluginPermissionValidator {
  return new PluginPermissionValidator({
    projectId,
    eventLoggingEnabled: true,
    // Common permissions that might be granted to plugins
    defaultGrants: {
      permissions: [
        'filesystem.read',
        'filesystem.write',
        'network.http',
        'process.exec',
        'tool.execute',
        'workflow.create',
        'workflow.read',
        'spec.create',
        'spec.read',
        'spec.update',
        'task.create',
        'task.read',
        'task.update',
        'task.delete'
      ]
    }
  });
}

// Export types
export type {
  PluginPermissionValidatorConfig,
  PluginValidationResult
};