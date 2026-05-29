/**
 * Plugin Loader Integration API
 * 
 * Provides unified permission validation API for the Plugin Loader.
 * Implements Task 4.3: Integrate with Plugin Loader
 * 
 * Requirements 3.2: Plugin Sandbox Permission Implementation
 * - Parse plugin manifest `requires` field
 * - Compare with granted permission set
 * - Reject plugins with unauthorized requirements
 * 
 * Requirements 3.3: Static API Checks
 * - Source code scanning for prohibited APIs
 * - Detect direct `child_process.exec` calls
 * - Detect filesystem out-of-bounds access
 * - Detect undeclared network access
 * 
 * This module provides:
 * 1. Permission validation API - unified interface for Plugin Loader
 * 2. Detailed rejection reasons - comprehensive error information
 * 3. Event logging - plugin load denial events logged to events.jsonl
 * 
 * @specforge/permission-engine
 */

import { z } from 'zod';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import {
  PluginPermissionValidator,
  PluginManifest,
  PluginManifestSchema,
  GrantSet,
  PluginValidationResult
} from './plugin-permission-validator';
import {
  StaticApiChecker,
  StaticApiCheckResult,
  DetectedProhibitedApi,
  ProhibitedApiType,
  ProhibitedApiCategory
} from './static-api-checker';
import {
  PluginPermissionDeniedEventPayload,
  createPluginPermissionDeniedEvent
} from '../types/events';
import type { EventLogger } from '@specforge/observability';

/**
 * Plugin source file for static analysis
 */
export interface PluginSourceFile {
  filename: string;
  content: string;
}

/**
 * Rejection reason with detailed information
 */
export interface RejectionReason {
  code: 'requirements_not_granted' | 'prohibited_api' | 'static_check_failed' | 'invalid_manifest';
  message: string;
  details: {
    missingRequirements?: string[];
    prohibitedApis?: string[];
    staticCheckErrors?: string[];
    validationErrors?: string[];
  };
}

/**
 * Complete plugin load validation result
 */
export interface PluginLoadValidationResult {
  /** Whether the plugin is allowed to load */
  allowed: boolean;
  /** Plugin identifier from manifest */
  pluginId: string;
  /** Plugin name from manifest */
  pluginName: string;
  /** Detailed rejection reasons if denied */
  rejectionReasons: RejectionReason[];
  /** Permission validation result */
  permissionValidation?: PluginValidationResult;
  /** Static API check result */
  staticApiCheck?: StaticApiCheckResult;
  /** Combined validity status */
  isValid: boolean;
  /** Whether permission validation passed */
  permissionValid: boolean;
  /** Whether static API checks passed */
  staticApiValid: boolean;
}

/**
 * Configuration for Plugin Loader Integration
 */
export const PluginLoaderIntegrationConfigSchema = z.object({
  /** Project ID for event logging */
  projectId: z.string().min(1),
  /** Whether event logging is enabled */
  eventLoggingEnabled: z.boolean().optional(),
  /** Path to events file */
  eventsFilePath: z.string().optional(),
  /** Allowed permissions (whitelist for plugin requirements) */
  allowedPermissions: z.array(z.string()).optional(),
  /** Default grants if none provided */
  defaultGrants: z.object({
    permissions: z.array(z.string())
  }).optional(),
  /** Allowed filesystem paths (whitelist) */
  allowedPaths: z.array(z.string()).optional(),
  /** Allowed network hosts (whitelist) */
  allowedHosts: z.array(z.string()).optional(),
  /** Whether to allow child_process execution */
  allowChildProcess: z.boolean().optional(),
  /** Whether to allow filesystem access */
  allowFilesystem: z.boolean().optional(),
  /** Whether to allow network access */
  allowNetwork: z.boolean().optional(),
  /** Whether to allow code injection APIs */
  allowCodeInjection: z.boolean().optional(),
  /** Whether to allow process access */
  allowProcessAccess: z.boolean().optional(),
  /** Skip static API checks (for trusted plugins) */
  skipStaticChecks: z.boolean().optional(),
  /** Skip permission validation (for trusted plugins) */
  skipPermissionChecks: z.boolean().optional()
});

export type PluginLoaderIntegrationConfig = z.infer<typeof PluginLoaderIntegrationConfigSchema>;

/**
 * Plugin Loader Integration API
 * 
 * Provides unified permission validation for the Plugin Loader.
 * Combines permission requirement validation with static API checks.
 * 
 * Usage:
 * ```typescript
 * const integration = new PluginLoaderIntegration({ projectId: 'my-project' });
 * 
 * const result = await integration.validatePlugin({
 *   manifest: pluginManifest,
 *   sourceFiles: [{ filename: 'index.ts', content: pluginSourceCode }]
 * });
 * 
 * if (!result.allowed) {
 *   console.log('Plugin rejected:', result.rejectionReasons);
 * }
 * ```
 */
export class PluginLoaderIntegration {
  private config: Required<PluginLoaderIntegrationConfig>;
  private permissionValidator: PluginPermissionValidator;
  private staticApiChecker: StaticApiChecker;
  private eventLogger?: EventLogger;
  
  constructor(config: PluginLoaderIntegrationConfig) {
    // Parse and validate config
    const parsedConfig = PluginLoaderIntegrationConfigSchema.parse(config);
    
    this.config = {
      projectId: parsedConfig.projectId,
      eventLoggingEnabled: parsedConfig.eventLoggingEnabled ?? true,
      eventsFilePath: parsedConfig.eventsFilePath || './' + SPEC_DIR_NAME + '/logs/telemetry.jsonl',
      allowedPermissions: parsedConfig.allowedPermissions || [],
      defaultGrants: parsedConfig.defaultGrants || { permissions: [] },
      allowedPaths: parsedConfig.allowedPaths || [],
      allowedHosts: parsedConfig.allowedHosts || [],
      allowChildProcess: parsedConfig.allowChildProcess ?? false,
      allowFilesystem: parsedConfig.allowFilesystem ?? false,
      allowNetwork: parsedConfig.allowNetwork ?? false,
      allowCodeInjection: parsedConfig.allowCodeInjection ?? false,
      allowProcessAccess: parsedConfig.allowProcessAccess ?? false,
      skipStaticChecks: parsedConfig.skipStaticChecks ?? false,
      skipPermissionChecks: parsedConfig.skipPermissionChecks ?? false
    };
    
    // Initialize permission validator
    this.permissionValidator = new PluginPermissionValidator({
      projectId: this.config.projectId,
      eventLoggingEnabled: false, // We handle event logging at integration level
      allowedPermissions: this.config.allowedPermissions,
      defaultGrants: this.config.defaultGrants
    });
    
    // Initialize static API checker
    this.staticApiChecker = new StaticApiChecker({
      projectId: this.config.projectId,
      eventLoggingEnabled: false,
      allowedPaths: this.config.allowedPaths,
      allowedHosts: this.config.allowedHosts,
      allowChildProcess: this.config.allowChildProcess,
      allowFilesystem: this.config.allowFilesystem,
      allowNetwork: this.config.allowNetwork,
      allowCodeInjection: this.config.allowCodeInjection,
      allowProcessAccess: this.config.allowProcessAccess
    });
    
    // Initialize event logger if enabled
    if (this.config.eventLoggingEnabled) {
      this.initEventLogger();
    }
  }
  
  /**
   * Initialize event logger
   */
  private initEventLogger(): void {
    try {
      this.eventLogger = new EventLogger({
        enabled: true,
        projectId: this.config.projectId,
        eventsFilePath: this.config.eventsFilePath,
        fsyncEnabled: true
      });
      
      // Initialize asynchronously
      this.eventLogger.initialize().catch(err => {
        console.warn('Failed to initialize event logger:', err);
      });
    } catch (error) {
      console.warn('Failed to create event logger:', error);
    }
  }
  
  /**
   * Validate a plugin for loading
   * 
   * Performs both permission validation and static API checks.
   * Logs denial events to events.jsonl when plugin is rejected.
   * 
   * @param manifest Plugin manifest from plugin metadata
   * @param sourceFiles Optional source files for static API checking
   * @param grants Optional custom grants (overrides default)
   * @returns Complete validation result with detailed rejection reasons
   */
  async validatePlugin(
    manifest: PluginManifest,
    sourceFiles?: PluginSourceFile[],
    grants?: GrantSet
  ): Promise<PluginLoadValidationResult> {
    // Parse and validate manifest
    const parsedManifest = this.parseManifest(manifest);
    if (!parsedManifest) {
      const result = this.createInvalidManifestResult(manifest);
      await this.logDenialEvent(result);
      return result;
    }
    
    const rejectionReasons: RejectionReason[] = [];
    let permissionValidation: PluginValidationResult | undefined;
    let staticApiCheck: StaticApiCheckResult | undefined;
    let permissionValid = true;
    let staticApiValid = true;
    
    // Step 1: Permission validation (if not skipped)
    if (!this.config.skipPermissionChecks) {
      permissionValidation = this.permissionValidator.validate(parsedManifest, grants);
      
      if (!permissionValidation.valid) {
        permissionValid = false;
        rejectionReasons.push({
          code: 'requirements_not_granted',
          message: `Plugin requires permissions not granted: ${permissionValidation.missingRequirements.join(', ')}`,
          details: {
            missingRequirements: permissionValidation.missingRequirements
          }
        });
      }
    }
    
    // Step 2: Static API checks (if not skipped and source provided)
    if (!this.config.skipStaticChecks && sourceFiles && sourceFiles.length > 0) {
      staticApiCheck = this.staticApiChecker.checkMultipleFiles(
        sourceFiles,
        parsedManifest.id,
        parsedManifest.name
      );
      
      if (!staticApiCheck.valid) {
        staticApiValid = false;
        const prohibitedApis = staticApiCheck.detectedApis.map(api => api.type);
        const errorDetails = staticApiCheck.detectedApis
          .filter(api => api.severity === 'error')
          .map(api => `Line ${api.line}: ${api.type} - ${api.context}`);
        
        rejectionReasons.push({
          code: 'prohibited_api',
          message: `Plugin contains prohibited API usage: ${prohibitedApis.join(', ')}`,
          details: {
            prohibitedApis,
            staticCheckErrors: errorDetails
          }
        });
      }
    } else if (!this.config.skipStaticChecks && (!sourceFiles || sourceFiles.length === 0)) {
      // No source files provided but static checks not skipped - warn but don't fail
      // This allows plugins without source (e.g., pure configuration plugins)
    }
    
    // Determine overall validity
    const isValid = permissionValid && staticApiValid;
    const allowed = isValid;
    
    const result: PluginLoadValidationResult = {
      allowed,
      pluginId: parsedManifest.id,
      pluginName: parsedManifest.name,
      rejectionReasons,
      permissionValidation,
      staticApiCheck,
      isValid,
      permissionValid,
      staticApiValid
    };
    
    // Log denial event if plugin is rejected
    if (!allowed) {
      await this.logDenialEvent(result);
    }
    
    return result;
  }
  
  /**
   * Validate only the permission requirements (without static API checks)
   * 
   * @param manifest Plugin manifest
   * @param grants Optional custom grants
   * @returns Permission validation result
   */
  validatePermissions(
    manifest: PluginManifest,
    grants?: GrantSet
  ): PluginValidationResult {
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
    
    return this.permissionValidator.validate(parsedManifest, grants);
  }
  
  /**
   * Perform static API checks on source code
   * 
   * @param sourceCode Source code to scan
   * @param pluginId Plugin identifier
   * @param pluginName Plugin name
   * @returns Static API check result
   */
  checkStaticApis(
    sourceCode: string,
    pluginId: string,
    pluginName: string
  ): StaticApiCheckResult {
    return this.staticApiChecker.check(sourceCode, pluginId, pluginName);
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
   * Create result for invalid manifest
   */
  private createInvalidManifestResult(manifest: PluginManifest): PluginLoadValidationResult {
    const validationErrors: string[] = [];
    
    // Collect validation errors
    try {
      PluginManifestSchema.parse(manifest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        for (const issue of error.issues) {
          validationErrors.push(`${issue.path.join('.')}: ${issue.message}`);
        }
      }
    }
    
    return {
      allowed: false,
      pluginId: manifest.id || 'unknown',
      pluginName: manifest.name || 'unknown',
      rejectionReasons: [{
        code: 'invalid_manifest',
        message: 'Plugin manifest is invalid',
        details: { validationErrors }
      }],
      isValid: false,
      permissionValid: false,
      staticApiValid: false
    };
  }
  
  /**
   * Log plugin load denial event
   */
  private async logDenialEvent(result: PluginLoadValidationResult): Promise<void> {
    if (!this.eventLogger || !this.config.eventLoggingEnabled) {
      return;
    }
    
    try {
      // Determine primary rejection reason
      const primaryReason = result.rejectionReasons[0]?.code || 'requirements_not_granted';
      
      // Collect all details
      const details: PluginPermissionDeniedEventPayload['details'] = {};
      
      for (const reason of result.rejectionReasons) {
        if (reason.details.missingRequirements) {
          details.missingRequirements = reason.details.missingRequirements;
        }
        if (reason.details.prohibitedApis) {
          details.prohibitedApis = reason.details.prohibitedApis;
        }
        if (reason.details.staticCheckErrors) {
          details.staticCheckErrors = reason.details.staticCheckErrors;
        }
      }
      
      const eventPayload: PluginPermissionDeniedEventPayload = {
        pluginId: result.pluginId,
        pluginName: result.pluginName,
        reason: primaryReason,
        details
      };
      
      await this.eventLogger.logPluginPermissionDenied(eventPayload);
    } catch (error) {
      console.error('Failed to log plugin load denial event:', error);
    }
  }
  
  /**
   * Update allowed permissions (whitelist mode)
   */
  setAllowedPermissions(permissions: string[]): void {
    this.permissionValidator.setAllowedPermissions(permissions);
    this.config.allowedPermissions = permissions;
  }
  
  /**
   * Update allowed filesystem paths
   */
  setAllowedPaths(paths: string[]): void {
    this.staticApiChecker.updateConfig({ allowedPaths: paths });
    this.config.allowedPaths = paths;
  }
  
  /**
   * Update allowed network hosts
   */
  setAllowedHosts(hosts: string[]): void {
    this.staticApiChecker.updateConfig({ allowedHosts: hosts });
    this.config.allowedHosts = hosts;
  }
  
  /**
   * Get current configuration
   */
  getConfig(): PluginLoaderIntegrationConfig {
    return {
      projectId: this.config.projectId,
      eventLoggingEnabled: this.config.eventLoggingEnabled,
      eventsFilePath: this.config.eventsFilePath,
      allowedPermissions: this.config.allowedPermissions,
      defaultGrants: this.config.defaultGrants,
      allowedPaths: this.config.allowedPaths,
      allowedHosts: this.config.allowedHosts,
      allowChildProcess: this.config.allowChildProcess,
      allowFilesystem: this.config.allowFilesystem,
      allowNetwork: this.config.allowNetwork,
      allowCodeInjection: this.config.allowCodeInjection,
      allowProcessAccess: this.config.allowProcessAccess,
      skipStaticChecks: this.config.skipStaticChecks,
      skipPermissionChecks: this.config.skipPermissionChecks
    };
  }
  
  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.eventLogger) {
      await this.eventLogger.cleanup();
    }
  }
}

/**
 * Create a Plugin Loader Integration with restrictive defaults
 * (no permissions granted, no filesystem/network access)
 */
export function createRestrictivePluginLoaderIntegration(
  config: Pick<PluginLoaderIntegrationConfig, 'projectId' | 'eventLoggingEnabled' | 'eventsFilePath'>
): PluginLoaderIntegration {
  return new PluginLoaderIntegration({
    ...config,
    allowedPermissions: [],
    defaultGrants: { permissions: [] },
    allowChildProcess: false,
    allowFilesystem: false,
    allowNetwork: false,
    allowCodeInjection: false,
    allowProcessAccess: false
  });
}

/**
 * Create a Plugin Loader Integration with standard permissions
 * (common permissions for typical plugins)
 */
export function createStandardPluginLoaderIntegration(
  config: Pick<PluginLoaderIntegrationConfig, 'projectId' | 'eventLoggingEnabled' | 'eventsFilePath'>
): PluginLoaderIntegration {
  return new PluginLoaderIntegration({
    ...config,
    allowedPermissions: [
      'filesystem.read',
      'filesystem.write',
      'network.http',
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
    ],
    defaultGrants: {
      permissions: [
        'filesystem.read',
        'filesystem.write',
        'network.http',
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

/**
 * Create a Plugin Loader Integration with permissive settings
 * (useful for testing or trusted plugin environments)
 */
export function createPermissivePluginLoaderIntegration(
  config: Pick<PluginLoaderIntegrationConfig, 'projectId' | 'eventLoggingEnabled' | 'eventsFilePath'>
): PluginLoaderIntegration {
  return new PluginLoaderIntegration({
    ...config,
    allowChildProcess: true,
    allowFilesystem: true,
    allowNetwork: true,
    allowCodeInjection: true,
    allowProcessAccess: true,
    skipStaticChecks: false // Always run static checks even in permissive mode
  });
}

// Export types
export type {
  PluginLoaderIntegrationConfig,
  PluginLoadValidationResult,
  RejectionReason
};