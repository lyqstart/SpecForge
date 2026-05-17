/**
 * Scope Tag Validator - Validates .config.kiro scope tags against REQ-25
 * 
 * This module provides validation of scope tags in downstream spec
 * configuration files, ensuring they align with REQ-25 capability definitions.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4 (Scope Tag Convention Enforcement)
 * Task: 9.1 Create tool to validate `.config.kiro` scope tags
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';
import type { CapabilityDefinition, ScopeTag, ValidationResult, Req25Data } from './types.js';
import { Req25Loader } from './req25-loader.js';

/**
 * Config file structure from .config.kiro
 */
export interface SpecConfig {
  specId: string;
  workflowType?: string;
  specType?: string;
  scopeTag?: ScopeTag;
  parentSpec?: string;
  /**
   * Declared capabilities for this spec
   * These should match capabilities defined in REQ-25
   */
  capabilities?: string[];
  [key: string]: unknown;
}

/**
 * Result of validating a single spec's .config.kiro
 */
export interface SpecValidationResult {
  specPath: string;
  specId: string;
  valid: boolean;
  scopeTag?: ScopeTag;
  errors: string[];
  warnings: string[];
  capabilityAlignment?: {
    aligned: boolean;
    expectedScope: ScopeTag;
    reason?: string;
  };
  /**
   * Additional details about capability alignment validation
   */
  capabilityDetails?: {
    /**
     * Capabilities declared in the spec
     */
    declaredCapabilities: string[];
    /**
     * Capabilities found in REQ-25
     */
    req25Capabilities: string[];
    /**
     * Capabilities declared but not in REQ-25
     */
    undeclaredCapabilities: string[];
    /**
     * Capabilities with scopeTag mismatch
     */
    mismatchedCapabilities: Array<{
      capabilityId: string;
      declaredScope: ScopeTag;
      expectedScope: ScopeTag;
    }>;
  };
}

/**
 * Result of validating all specs in a directory
 */
export interface ScopeTagValidationReport {
  schema_version: "1.0";
  generatedAt: Date;
  parentSpecPath: string;
  specsPath: string;
  
  // Summary
  summary: {
    totalSpecs: number;
    validSpecs: number;
    invalidSpecs: number;
    p0Specs: number;
    p1Specs: number;
    p2Specs: number;
    warnings: number;
  };
  
  // Detailed results
  results: SpecValidationResult[];
  
  // Recommendations
  recommendations: string[];
  
  // Metadata
  metadata: {
    toolVersion: string;
    durationMs: number;
  };
}

// ============================================================
// Violation Detection Types (Task 9.3)
// ============================================================

/**
 * Types of violations that can be detected
 */
export type ViolationType = 
  | 'missing_scope_tag'
  | 'invalid_scope_tag_value'
  | 'scope_tag_case_mismatch'
  | 'capability_not_in_req25'
  | 'capability_scope_mismatch'
  | 'missing_capability_declaration'
  | 'inconsistent_scope_with_parent'
  | 'deprecated_capability';

/**
 * Severity levels for violations
 */
export type ViolationSeverity = 'error' | 'warning' | 'info';

/**
 * A single violation detected during validation
 */
export interface Violation {
  /**
   * Unique identifier for this violation
   */
  id: string;
  
  /**
   * Type of violation
   */
  type: ViolationType;
  
  /**
   * Severity level
   */
  severity: ViolationSeverity;
  
  /**
   * Path to the spec directory containing the violation
   */
  specPath: string;
  
  /**
   * Spec name (extracted from path)
   */
  specName: string;
  
  /**
   * The config field or area where the violation occurred
   */
  location: string;
  
  /**
   * Detailed violation message
   */
  message: string;
  
  /**
   * Current value (if applicable)
   */
  currentValue?: string;
  
  /**
   * Expected value (if applicable)
   */
  expectedValue?: string;
  
  /**
   * Suggested fix for this violation
   */
  suggestedFix: string;
  
  /**
   * Related capability ID (if applicable)
   */
  capabilityId?: string;
  
  /**
   * Link to relevant documentation or REQ-25
   */
  reference?: string;
}

/**
 * Comprehensive violation report with all detected violations
 */
export interface ViolationReport {
  schema_version: "1.0";
  generatedAt: Date;
  parentSpecPath: string;
  specsPath: string;
  
  // Summary by severity
  summary: {
    totalViolations: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    specsWithViolations: number;
    specsWithoutViolations: number;
    
    // Violations by type
    byType: Record<ViolationType, number>;
  };
  
  // All violations organized by spec
  violations: {
    specPath: string;
    specName: string;
    scopeTag?: ScopeTag;
    violations: Violation[];
  }[];
  
  // Quick fix suggestions for all violations
  fixSuggestions: Array<{
    specName: string;
    violations: Violation[];
    batchFix?: string;
  }>;
  
  // Recommendations
  recommendations: string[];
  
  // Metadata
  metadata: {
    toolVersion: string;
    durationMs: number;
  };
}

/**
 * Scope Tag Validator
 * 
 * Validates .config.kiro scope tags against REQ-25 capability definitions
 * from the parent specification.
 */
export class ScopeTagValidator {
  private req25Loader: Req25Loader;
  private parentSpecPath: string;
  private specsPath: string;
  private capabilities: Req25Data | null = null;

  /**
   * Create a new ScopeTagValidator
   * 
   * @param options - Configuration options
   */
  constructor(options?: {
    parentSpecPath?: string;
    specsPath?: string;
  }) {
    this.req25Loader = new Req25Loader();
    
    // Set parent spec path
    this.parentSpecPath = options?.parentSpecPath || this.getDefaultParentSpecPath();
    
    // Set specs path (where to look for .config.kiro files)
    this.specsPath = options?.specsPath || this.getDefaultSpecsPath();
  }

  /**
   * Get default parent spec path
   */
  private getDefaultParentSpecPath(): string {
    const envPath = process.env.SCOPE_GATE_PARENT_SPEC;
    if (envPath) {
      return envPath;
    }
    
    const scopeGatePath = process.cwd();
    if (scopeGatePath.endsWith('packages/scope-gate') || scopeGatePath.endsWith('packages\\scope-gate')) {
      const repoRoot = resolve(scopeGatePath, '..', '..');
      return resolve(repoRoot, '.kiro', 'specs', 'v6-architecture-overview');
    }
    
    return resolve('.kiro', 'specs', 'v6-architecture-overview');
  }

  /**
   * Get default specs path (where to look for .config.kiro files)
   */
  private getDefaultSpecsPath(): string {
    const envPath = process.env.SCOPE_GATE_SPECS_PATH;
    if (envPath) {
      return envPath;
    }
    
    const scopeGatePath = process.cwd();
    if (scopeGatePath.endsWith('packages/scope-gate') || scopeGatePath.endsWith('packages\\scope-gate')) {
      const repoRoot = resolve(scopeGatePath, '..', '..');
      return resolve(repoRoot, '.kiro', 'specs');
    }
    
    return resolve('.kiro', 'specs');
  }

  /**
   * Load REQ-25 capabilities from parent spec
   */
  loadCapabilities(): boolean {
    const result = this.req25Loader.loadFromParentSpec(this.parentSpecPath);
    
    if (!result.success) {
      console.error(`[ScopeTagValidator] Failed to load REQ-25: ${result.error}`);
      return false;
    }

    this.capabilities = this.req25Loader.getCachedData();
    return this.capabilities !== null;
  }

  /**
   * Get capabilities grouped by scope
   */
  getCapabilitiesByScope(): { p0: CapabilityDefinition[]; p1: CapabilityDefinition[]; p2: CapabilityDefinition[] } {
    if (!this.capabilities) {
      if (!this.loadCapabilities()) {
        return { p0: [], p1: [], p2: [] };
      }
    }
    
    return {
      p0: this.capabilities!.p0,
      p1: this.capabilities!.p1,
      p2: this.capabilities!.p2
    };
  }

  /**
   * Read and parse a .config.kiro file
   * 
   * @param configPath - Path to .config.kiro file
   * @returns Parsed config or null if invalid
   */
  readConfigFile(configPath: string): SpecConfig | null {
    if (!existsSync(configPath)) {
      return null;
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content) as SpecConfig;
      return config;
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate a single spec's .config.kiro file
   * 
   * @param specPath - Path to the spec directory containing .config.kiro
   * @returns Validation result
   */
  validateSpec(specPath: string): SpecValidationResult {
    const result: SpecValidationResult = {
      specPath,
      specId: 'unknown',
      valid: false,
      errors: [],
      warnings: []
    };

    const configPath = join(specPath, '.config.kiro');
    const config = this.readConfigFile(configPath);

    // Check if config file exists
    if (!config) {
      result.errors.push('.config.kiro file not found or invalid JSON');
      return result;
    }

    result.specId = config.specId || 'unknown';

    // Check for scopeTag field
    if (!config.scopeTag) {
      result.errors.push('Missing required field: scopeTag');
      return result;
    }

    // Validate scopeTag value
    if (!['p0', 'p1', 'p2'].includes(config.scopeTag)) {
      result.errors.push(`Invalid scopeTag value: '${config.scopeTag}'. Must be one of: p0, p1, p2`);
      return result;
    }

    result.scopeTag = config.scopeTag;

    // Validate capability alignment if capabilities are loaded
    if (this.capabilities) {
      // Basic alignment check (scope tag vs REQ-25)
      const alignment = this.validateCapabilityAlignment(config, specPath);
      result.capabilityAlignment = alignment;
      
      if (!alignment.aligned) {
        result.errors.push(alignment.reason || 'Scope tag does not align with REQ-25 capabilities');
      }

      // Detailed capability validation
      const capabilityValidation = this.validateDeclaredCapabilities(config, specPath);
      result.capabilityDetails = {
        declaredCapabilities: capabilityValidation.details.declaredCapabilities,
        req25Capabilities: capabilityValidation.details.req25Capabilities,
        undeclaredCapabilities: capabilityValidation.details.undeclaredCapabilities,
        mismatchedCapabilities: capabilityValidation.details.mismatchedCapabilities
      };

      // Add capability validation errors
      for (const error of capabilityValidation.errors) {
        if (!result.errors.includes(error)) {
          result.errors.push(error);
        }
      }

      // Add capability validation warnings
      result.warnings.push(...capabilityValidation.warnings);
    }

    // If no errors, mark as valid
    result.valid = result.errors.length === 0;

    return result;
  }

  /**
   * Validate that scopeTag aligns with REQ-25 capabilities
   * 
   * This checks if the spec's scopeTag matches what we'd expect based on
   * the capabilities listed in REQ-25.
   * 
   * @param config - The parsed .config.kiro config
   * @param specPath - Path to the spec directory
   * @returns Alignment result
   */
  private validateCapabilityAlignment(config: SpecConfig, specPath: string): {
    aligned: boolean;
    expectedScope: ScopeTag;
    reason?: string;
  } {
    if (!this.capabilities) {
      return { aligned: true, expectedScope: 'p0' };
    }

    // Extract spec name from path
    const specName = this.extractSpecName(specPath);
    
    // Map spec name to expected scope based on REQ-25
    // This is a simplified check - in reality, we'd need more sophisticated mapping
    
    // Check if spec is in the P0 list (by name matching)
    const p0Names = this.capabilities.p0.map(c => c.id.toLowerCase());
    const p1Names = this.capabilities.p1.map(c => c.id.toLowerCase());
    const p2Names = this.capabilities.p2.map(c => c.id.toLowerCase());
    
    const lowerSpecName = specName.toLowerCase();
    
    // Find which scope list contains this spec (if any)
    let foundInScope: ScopeTag | null = null;
    
    if (p0Names.some(name => lowerSpecName.includes(name) || name.includes(lowerSpecName))) {
      foundInScope = 'p0';
    } else if (p1Names.some(name => lowerSpecName.includes(name) || name.includes(lowerSpecName))) {
      foundInScope = 'p1';
    } else if (p2Names.some(name => lowerSpecName.includes(name) || name.includes(lowerSpecName))) {
      foundInScope = 'p2';
    }

    // If we found a match in REQ-25, validate alignment
    if (foundInScope) {
      if (foundInScope !== config.scopeTag) {
        return {
          aligned: false,
          expectedScope: foundInScope,
          reason: `Scope tag '${config.scopeTag}' does not match REQ-25 classification '${foundInScope}' for '${specName}'`
        };
      }
    } else {
      // Spec not found in REQ-25 - warn but don't fail
      // This could be a new spec not yet in REQ-25
      return {
        aligned: true,
        expectedScope: config.scopeTag
      };
    }

    return { aligned: true, expectedScope: config.scopeTag };
  }

  /**
   * Validate that spec's declared capabilities match REQ-25 definitions
   * 
   * This method performs a more detailed validation:
   * 1. Checks if declared capabilities exist in REQ-25
   * 2. Validates scopeTag matches capability definitions in REQ-25
   * 3. Detects capabilities that are not declared in REQ-25
   * 
   * @param config - The parsed .config.kiro config
   * @param specPath - Path to the spec directory
   * @returns Detailed validation result with capability information
   */
  validateDeclaredCapabilities(config: SpecConfig, specPath: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    details: {
      declaredCapabilities: string[];
      req25Capabilities: string[];
      undeclaredCapabilities: string[];
      mismatchedCapabilities: Array<{
        capabilityId: string;
        declaredScope: ScopeTag;
        expectedScope: ScopeTag;
      }>;
      missingCapabilities: string[];
    };
  } {
    const result = {
      isValid: true,
      errors: [] as string[],
      warnings: [] as string[],
      details: {
        declaredCapabilities: [] as string[],
        req25Capabilities: [] as string[],
        undeclaredCapabilities: [] as string[],
        mismatchedCapabilities: [] as Array<{
          capabilityId: string;
          declaredScope: ScopeTag;
          expectedScope: ScopeTag;
        }>,
        missingCapabilities: [] as string[]
      }
    };

    if (!this.capabilities) {
      result.warnings.push('REQ-25 capabilities not loaded, skipping capability alignment validation');
      return result;
    }

    // Get declared capabilities from config
    const declaredCapabilities = config.capabilities || [];
    result.details.declaredCapabilities = declaredCapabilities;

    // Build REQ-25 capability lookup map
    const req25CapabilityMap = new Map<string, ScopeTag>();
    for (const cap of this.capabilities.p0) {
      req25CapabilityMap.set(cap.id.toLowerCase(), 'p0');
    }
    for (const cap of this.capabilities.p1) {
      req25CapabilityMap.set(cap.id.toLowerCase(), 'p1');
    }
    for (const cap of this.capabilities.p2) {
      req25CapabilityMap.set(cap.id.toLowerCase(), 'p2');
    }
    result.details.req25Capabilities = Array.from(req25CapabilityMap.keys());

    // Check each declared capability
    for (const declaredCap of declaredCapabilities) {
      const lowerCap = declaredCap.toLowerCase();
      const expectedScope = req25CapabilityMap.get(lowerCap);

      if (!expectedScope) {
        // Capability not found in REQ-25
        result.details.undeclaredCapabilities.push(declaredCap);
        result.errors.push(
          `Capability '${declaredCap}' is declared in .config.kiro but not found in REQ-25. ` +
          `Either add it to REQ-25 or remove it from the spec's capabilities list.`
        );
        result.isValid = false;
      } else {
        // Check if scopeTag matches the capability's scope in REQ-25
        const configScope = config.scopeTag || 'p0';
        if (configScope !== expectedScope) {
          result.details.mismatchedCapabilities.push({
            capabilityId: declaredCap,
            declaredScope: configScope,
            expectedScope
          });
          result.errors.push(
            `Capability '${declaredCap}' is defined as ${expectedScope.toUpperCase()} in REQ-25, ` +
            `but spec has scopeTag '${configScope}'. Update .config.kiro scopeTag to match.`
          );
          result.isValid = false;
        }
      }
    }

    // Extract spec name and check if it's in REQ-25
    const specName = this.extractSpecName(specPath);
    const lowerSpecName = specName.toLowerCase();
    
    // Find capabilities that should be in REQ-25 based on spec name
    for (const [capId, scope] of req25CapabilityMap) {
      if (capId.includes(lowerSpecName) || lowerSpecName.includes(capId)) {
        // Check if this capability is declared
        const isDeclared = declaredCapabilities.some(
          dc => dc.toLowerCase() === capId || dc.toLowerCase() === specName.toLowerCase()
        );
        if (!isDeclared) {
          result.details.missingCapabilities.push(capId);
          result.warnings.push(
            `Spec '${specName}' may need to declare capability '${capId}' from REQ-25 in its .config.kiro`
          );
        }
      }
    }

    return result;
  }

  /**
   * Validate scopeTag consistency with spec name and REQ-25
   * 
   * Checks if the scopeTag in .config.kiro is consistent with:
   * 1. What REQ-25 says about this spec
   * 2. The parent spec's expectation
   * 
   * @param specPath - Path to the spec directory
   * @returns Validation result
   */
  validateScopeTagConsistency(specPath: string): {
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const result = {
      isValid: true,
      issues: [] as string[],
      recommendations: [] as string[]
    };

    if (!this.capabilities) {
      result.issues.push('REQ-25 capabilities not loaded');
      return result;
    }

    const configPath = join(specPath, '.config.kiro');
    const config = this.readConfigFile(configPath);

    if (!config) {
      result.issues.push('Could not read .config.kiro file');
      result.isValid = false;
      return result;
    }

    if (!config.scopeTag) {
      result.issues.push('Missing scopeTag in .config.kiro');
      result.isValid = false;
      return result;
    }

    const specName = this.extractSpecName(specPath);
    const lowerSpecName = specName.toLowerCase();

    // Check if this spec is mentioned in REQ-25
    const p0Names = this.capabilities.p0.map(c => c.id.toLowerCase());
    const p1Names = this.capabilities.p1.map(c => c.id.toLowerCase());
    const p2Names = this.capabilities.p2.map(c => c.id.toLowerCase());

    let foundInReq25: ScopeTag | null = null;

    // Try to find this spec in any of the REQ-25 lists
    if (p0Names.some(name => name.includes(lowerSpecName) || lowerSpecName.includes(name))) {
      foundInReq25 = 'p0';
    } else if (p1Names.some(name => name.includes(lowerSpecName) || lowerSpecName.includes(name))) {
      foundInReq25 = 'p1';
    } else if (p2Names.some(name => name.includes(lowerSpecName) || lowerSpecName.includes(name))) {
      foundInReq25 = 'p2';
    }

    // Validate consistency
    if (foundInReq25 && foundInReq25 !== config.scopeTag) {
      result.issues.push(
        `Scope tag mismatch: spec '${specName}' has scopeTag '${config.scopeTag}' ` +
        `but appears as '${foundInReq25}' in REQ-25`
      );
      result.recommendations.push(
        `Update .config.kiro scopeTag to '${foundInReq25}' to align with REQ-25`
      );
      result.isValid = false;
    } else if (!foundInReq25) {
      // Spec not found in REQ-25 - check if it's the parent spec
      if (!specName.includes('v6-architecture') && !specName.includes('architecture-overview')) {
        result.recommendations.push(
          `Spec '${specName}' was not found in REQ-25. ` +
          `If this is a new P0 capability, add it to REQ-25.1 in the parent specification.`
        );
      }
    }

    return result;
  }

  /**
   * Generate a comprehensive capability alignment report
   * 
   * This method provides a detailed report of all capability alignment
   * issues across all specs.
   * 
   * @param specsPath - Path to specs directory
   * @returns Comprehensive alignment report
   */
  generateCapabilityAlignmentReport(specsPath?: string): {
    schema_version: "1.0";
    generatedAt: Date;
    summary: {
      totalSpecs: number;
      specsWithAlignmentIssues: number;
      specsWithUndeclaredCapabilities: number;
      specsWithScopeMismatch: number;
      totalIssues: number;
    };
    details: Array<{
      specPath: string;
      specName: string;
      scopeTag: ScopeTag;
      issues: string[];
      undeclaredCapabilities: string[];
      scopeMismatch: Array<{
        capabilityId: string;
        declaredScope: ScopeTag;
        expectedScope: ScopeTag;
      }>;
    }>;
    recommendations: string[];
  } {
    const targetPath = specsPath || this.specsPath;
    const specDirs = this.findSpecDirectories(targetPath);
    
    const report = {
      schema_version: "1.0" as const,
      generatedAt: new Date(),
      summary: {
        totalSpecs: specDirs.length,
        specsWithAlignmentIssues: 0,
        specsWithUndeclaredCapabilities: 0,
        specsWithScopeMismatch: 0,
        totalIssues: 0
      },
      details: [] as Array<{
        specPath: string;
        specName: string;
        scopeTag: ScopeTag;
        issues: string[];
        undeclaredCapabilities: string[];
        scopeMismatch: Array<{
          capabilityId: string;
          declaredScope: ScopeTag;
          expectedScope: ScopeTag;
        }>;
      }>,
      recommendations: [] as string[]
    };

    // Load capabilities if not already loaded
    if (!this.capabilities) {
      this.loadCapabilities();
    }

    for (const specDir of specDirs) {
      const configPath = join(specDir, '.config.kiro');
      const config = this.readConfigFile(configPath);
      
      if (!config) continue;

      const specName = this.extractSpecName(specDir);
      const capabilityResult = this.validateDeclaredCapabilities(config, specDir);
      const consistencyResult = this.validateScopeTagConsistency(specDir);

      const specDetail = {
        specPath: specDir,
        specName,
        scopeTag: config.scopeTag || 'p0',
        issues: [...capabilityResult.errors, ...consistencyResult.issues],
        undeclaredCapabilities: capabilityResult.details.undeclaredCapabilities,
        scopeMismatch: capabilityResult.details.mismatchedCapabilities
      };

      if (specDetail.issues.length > 0) {
        report.summary.specsWithAlignmentIssues++;
      }
      if (specDetail.undeclaredCapabilities.length > 0) {
        report.summary.specsWithUndeclaredCapabilities++;
      }
      if (specDetail.scopeMismatch.length > 0) {
        report.summary.specsWithScopeMismatch++;
      }

      report.summary.totalIssues += specDetail.issues.length;
      report.details.push(specDetail);
    }

    // Generate recommendations
    if (report.summary.specsWithAlignmentIssues > 0) {
      report.recommendations.push(
        `Fix capability alignment issues in ${report.summary.specsWithAlignmentIssues} spec(s)`
      );
    }
    if (report.summary.specsWithUndeclaredCapabilities > 0) {
      report.recommendations.push(
        `Add undeclared capabilities to REQ-25 or remove them from spec configurations`
      );
    }
    if (report.summary.specsWithScopeMismatch > 0) {
      report.recommendations.push(
        `Update scopeTag values to match REQ-25 classifications`
      );
    }
    if (report.summary.totalSpecs === 0) {
      report.recommendations.push('No specs found in the specified directory');
    } else if (report.summary.totalIssues === 0) {
      report.recommendations.push('All specs have valid capability alignments');
    }

    return report;
  }

  /**
   * Extract spec name from path
   */
  private extractSpecName(specPath: string): string {
    const parts = specPath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || 'unknown';
  }

  /**
   * Find all spec directories containing .config.kiro
   * 
   * @param basePath - Base path to search
   * @returns Array of spec directory paths
   */
  findSpecDirectories(basePath: string): string[] {
    const specs: string[] = [];

    if (!existsSync(basePath)) {
      return specs;
    }

    const entries = readdirSync(basePath);
    
    for (const entry of entries) {
      // Skip special directories
      if (entry.startsWith('.') || entry.startsWith('_')) {
        continue;
      }

      const entryPath = join(basePath, entry);
      const stat = statSync(entryPath);

      if (stat.isDirectory()) {
        const configPath = join(entryPath, '.config.kiro');
        if (existsSync(configPath)) {
          specs.push(entryPath);
        } else {
          // Recursively search subdirectories (but not too deep)
          const relativePath = relative(basePath, entryPath);
          const depth = relativePath.split('/').length;
          
          if (depth < 3) {
            const subSpecs = this.findSpecDirectories(entryPath);
            specs.push(...subSpecs);
          }
        }
      }
    }

    return specs;
  }

  /**
   * Validate all specs in the specs directory
   * 
   * @param specsPath - Path to specs directory (optional, uses default)
   * @returns Full validation report
   */
  validateAllSpecs(specsPath?: string): ScopeTagValidationReport {
    const startTime = Date.now();
    const targetPath = specsPath || this.specsPath;
    
    // Load capabilities if not already loaded
    if (!this.capabilities) {
      this.loadCapabilities();
    }

    // Find all spec directories
    const specDirs = this.findSpecDirectories(targetPath);
    
    const results: SpecValidationResult[] = [];
    let validCount = 0;
    let p0Count = 0;
    let p1Count = 0;
    let p2Count = 0;
    let warningCount = 0;

    for (const specDir of specDirs) {
      const result = this.validateSpec(specDir);
      results.push(result);
      
      if (result.valid) {
        validCount++;
      }
      
      if (result.scopeTag === 'p0') p0Count++;
      else if (result.scopeTag === 'p1') p1Count++;
      else if (result.scopeTag === 'p2') p2Count++;
      
      warningCount += result.warnings.length;
    }

    const report: ScopeTagValidationReport = {
      schema_version: "1.0",
      generatedAt: new Date(),
      parentSpecPath: this.parentSpecPath,
      specsPath: targetPath,
      summary: {
        totalSpecs: specDirs.length,
        validSpecs: validCount,
        invalidSpecs: specDirs.length - validCount,
        p0Specs: p0Count,
        p1Specs: p1Count,
        p2Specs: p2Count,
        warnings: warningCount
      },
      results,
      recommendations: this.generateRecommendations(results),
      metadata: {
        toolVersion: '1.0.0',
        durationMs: Date.now() - startTime
      }
    };

    return report;
  }

  /**
   * Generate recommendations based on validation results
   */
  private generateRecommendations(results: SpecValidationResult[]): string[] {
    const recommendations: string[] = [];
    
    // Check for specs without valid scopeTag
    const invalidSpecs = results.filter(r => !r.valid);
    if (invalidSpecs.length > 0) {
      recommendations.push(`Fix ${invalidSpecs.length} invalid spec configuration(s)`);
    }
    
    // Check for missing scope tags
    const missingScopeTag = results.filter(r => !r.scopeTag);
    if (missingScopeTag.length > 0) {
      recommendations.push('Add scopeTag field to all .config.kiro files');
    }
    
    // Check for capability alignment issues
    const misaligned = results.filter(r => r.capabilityAlignment && !r.capabilityAlignment.aligned);
    if (misaligned.length > 0) {
      recommendations.push('Align scopeTag values with REQ-25 capability classifications');
    }
    
    // Add positive recommendation if all valid
    if (invalidSpecs.length === 0 && results.length > 0) {
      recommendations.push('All scope tags are valid and aligned with REQ-25');
    }
    
    return recommendations;
  }

  /**
   * Validate a specific spec by path
   * 
   * @param specPath - Path to the spec directory
   * @returns Validation result
   */
  validateSpecificSpec(specPath: string): SpecValidationResult {
    // Load capabilities if not already loaded
    if (!this.capabilities) {
      this.loadCapabilities();
    }
    
    return this.validateSpec(specPath);
  }

  /**
   * Get the parent spec path
   */
  getParentSpecPath(): string {
    return this.parentSpecPath;
  }

  /**
   * Get the specs path
   */
  getSpecsPath(): string {
    return this.specsPath;
  }

  /**
   * Check if a spec's scopeTag is valid
   * 
   * @param scopeTag - The scope tag to validate
   * @returns True if valid
   */
  static isValidScopeTag(scopeTag: unknown): scopeTag is ScopeTag {
    return scopeTag === 'p0' || scopeTag === 'p1' || scopeTag === 'p2';
  }

  // ============================================================
  // Violation Detection Methods (Task 9.3)
  // ============================================================

  /**
   * Generate a violation report with all detected violations
   * 
   * This is the main entry point for violation detection and reporting.
   * It scans all specs and generates a comprehensive report.
   * 
   * @param specsPath - Optional path to specs directory
   * @returns Comprehensive violation report
   */
  generateViolationReport(specsPath?: string): ViolationReport {
    const startTime = Date.now();
    const targetPath = specsPath || this.specsPath;
    
    // Load capabilities if not already loaded
    if (!this.capabilities) {
      this.loadCapabilities();
    }

    // Find all spec directories
    const specDirs = this.findSpecDirectories(targetPath);
    
    // Collect all violations grouped by spec
    const specViolations: ViolationReport['violations'] = [];
    let totalErrors = 0;
    let totalWarnings = 0;
    let totalInfos = 0;
    const byType: Record<ViolationType, number> = {
      'missing_scope_tag': 0,
      'invalid_scope_tag_value': 0,
      'scope_tag_case_mismatch': 0,
      'capability_not_in_req25': 0,
      'capability_scope_mismatch': 0,
      'missing_capability_declaration': 0,
      'inconsistent_scope_with_parent': 0,
      'deprecated_capability': 0
    };

    for (const specDir of specDirs) {
      const violations = this.detectViolations(specDir);
      
      if (violations.length > 0) {
        const specName = this.extractSpecName(specDir);
        const configPath = join(specDir, '.config.kiro');
        const config = this.readConfigFile(configPath);
        
        specViolations.push({
          specPath: specDir,
          specName,
          scopeTag: config?.scopeTag,
          violations
        });

        // Count by severity
        for (const v of violations) {
          if (v.severity === 'error') totalErrors++;
          else if (v.severity === 'warning') totalWarnings++;
          else totalInfos++;
          
          byType[v.type]++;
        }
      }
    }

    const specsWithViolations = specViolations.length;
    const specsWithoutViolations = specDirs.length - specsWithViolations;

    // Generate fix suggestions
    const fixSuggestions = specViolations.map(spec => ({
      specName: spec.specName,
      violations: spec.violations,
      batchFix: this.generateBatchFix(spec.violations)
    }));

    // Generate recommendations
    const recommendations = this.generateViolationRecommendations(specViolations, byType);

    const report: ViolationReport = {
      schema_version: "1.0",
      generatedAt: new Date(),
      parentSpecPath: this.parentSpecPath,
      specsPath: targetPath,
      summary: {
        totalViolations: totalErrors + totalWarnings + totalInfos,
        errorCount: totalErrors,
        warningCount: totalWarnings,
        infoCount: totalInfos,
        specsWithViolations,
        specsWithoutViolations,
        byType
      },
      violations: specViolations,
      fixSuggestions,
      recommendations,
      metadata: {
        toolVersion: '1.0.0',
        durationMs: Date.now() - startTime
      }
    };

    return report;
  }

  /**
   * Detect all violations for a single spec
   * 
   * @param specPath - Path to the spec directory
   * @returns Array of violations found
   */
  detectViolations(specPath: string): Violation[] {
    const violations: Violation[] = [];
    const configPath = join(specPath, '.config.kiro');
    const config = this.readConfigFile(configPath);
    const specName = this.extractSpecName(specPath);
    
    // If no config file, add violation
    if (!config) {
      violations.push(this.createViolation({
        type: 'missing_scope_tag',
        severity: 'error',
        specPath,
        specName,
        location: '.config.kiro',
        message: 'Missing .config.kiro file',
        suggestedFix: 'Create .config.kiro with required fields: specId, scopeTag',
        expectedValue: 'Valid .config.kiro file'
      }));
      return violations;
    }

    // Check for missing scopeTag
    if (!config.scopeTag) {
      violations.push(this.createViolation({
        type: 'missing_scope_tag',
        severity: 'error',
        specPath,
        specName,
        location: 'scopeTag',
        message: 'Missing required field: scopeTag in .config.kiro',
        suggestedFix: 'Add scopeTag field with value: p0, p1, or p2',
        expectedValue: 'p0 | p1 | p2'
      }));
    }
    // Check for invalid scopeTag value
    else if (config.scopeTag && !ScopeTagValidator.isValidScopeTag(config.scopeTag)) {
      violations.push(this.createViolation({
        type: 'invalid_scope_tag_value',
        severity: 'error',
        specPath,
        specName,
        location: 'scopeTag',
        message: `Invalid scopeTag value: '${config.scopeTag}'. Must be one of: p0, p1, p2`,
        currentValue: config.scopeTag,
        suggestedFix: 'Change scopeTag to p0, p1, or p2',
        expectedValue: 'p0 | p1 | p2'
      }));
    }
    // Check for case mismatch (e.g., 'P0' instead of 'p0')
    else if (config.scopeTag && config.scopeTag !== config.scopeTag.toLowerCase()) {
      violations.push(this.createViolation({
        type: 'scope_tag_case_mismatch',
        severity: 'error',
        specPath,
        specName,
        location: 'scopeTag',
        message: `scopeTag case mismatch: '${config.scopeTag}'. Must be lowercase.`,
        currentValue: config.scopeTag,
        suggestedFix: `Change to lowercase: '${config.scopeTag.toLowerCase()}'`,
        expectedValue: 'p0'
      }));
    }

    // Check capability alignment if capabilities are loaded
    if (this.capabilities && config.scopeTag) {
      // Validate declared capabilities
      const capabilityResult = this.validateDeclaredCapabilities(config, specPath);
      
      // Add violations for undeclared capabilities
      for (const undeclared of capabilityResult.details.undeclaredCapabilities) {
        violations.push(this.createViolation({
          type: 'capability_not_in_req25',
          severity: 'error',
          specPath,
          specName,
          location: 'capabilities',
          message: `Capability '${undeclared}' is declared but not found in REQ-25`,
          currentValue: undeclared,
          suggestedFix: `Either add '${undeclared}' to REQ-25 in parent spec or remove it from .config.kiro capabilities`,
          capabilityId: undeclared,
          reference: `${this.parentSpecPath}/requirements.md`
        }));
      }

      // Add violations for scope mismatch
      for (const mismatch of capabilityResult.details.mismatchedCapabilities) {
        violations.push(this.createViolation({
          type: 'capability_scope_mismatch',
          severity: 'error',
          specPath,
          specName,
          location: 'scopeTag + capabilities',
          message: `Capability '${mismatch.capabilityId}' is defined as ${mismatch.expectedScope.toUpperCase()} in REQ-25 but spec has scopeTag '${mismatch.declaredScope}'`,
          currentValue: `scopeTag: ${mismatch.declaredScope}, capability: ${mismatch.capabilityId}`,
          expectedValue: `scopeTag: ${mismatch.expectedScope}`,
          suggestedFix: `Update .config.kiro scopeTag to '${mismatch.expectedScope}' to match REQ-25`,
          capabilityId: mismatch.capabilityId
        }));
      }

      // Validate scope tag consistency with parent
      const consistencyResult = this.validateScopeTagConsistency(specPath);
      for (const issue of consistencyResult.issues) {
        if (issue.includes('mismatch')) {
          violations.push(this.createViolation({
            type: 'inconsistent_scope_with_parent',
            severity: 'error',
            specPath,
            specName,
            location: 'scopeTag',
            message: issue,
            suggestedFix: consistencyResult.recommendations[0] || 'Update scopeTag to match REQ-25',
            reference: `${this.parentSpecPath}/requirements.md`
          }));
        }
      }
    }

    return violations;
  }

  /**
   * Create a violation object with all required fields
   */
  private createViolation(params: {
    type: ViolationType;
    severity: ViolationSeverity;
    specPath: string;
    specName: string;
    location: string;
    message: string;
    currentValue?: string;
    expectedValue?: string;
    suggestedFix: string;
    capabilityId?: string;
    reference?: string;
  }): Violation {
    return {
      id: `${params.specName}-${params.type}-${Date.now()}`,
      type: params.type,
      severity: params.severity,
      specPath: params.specPath,
      specName: params.specName,
      location: params.location,
      message: params.message,
      currentValue: params.currentValue,
      expectedValue: params.expectedValue,
      suggestedFix: params.suggestedFix,
      capabilityId: params.capabilityId,
      reference: params.reference
    };
  }

  /**
   * Generate a batch fix command for multiple violations
   */
  private generateBatchFix(violations: Violation[]): string | undefined {
    const errors = violations.filter(v => v.severity === 'error');
    if (errors.length === 0) return undefined;

    // Group by type
    const byType = new Map<ViolationType, Violation[]>();
    for (const v of errors) {
      const existing = byType.get(v.type) || [];
      existing.push(v);
      byType.set(v.type, existing);
    }

    const fixes: string[] = [];

    // Missing scope tag fix
    if (byType.has('missing_scope_tag')) {
      fixes.push('# Add scopeTag to .config.kiro files');
    }

    // Invalid scope tag fix
    if (byType.has('invalid_scope_tag_value')) {
      fixes.push('# Update scopeTag values to p0, p1, or p2');
    }

    // Capability issues
    if (byType.has('capability_not_in_req25')) {
      fixes.push('# Review capabilities list - add to REQ-25 or remove from spec');
    }

    if (byType.has('capability_scope_mismatch')) {
      fixes.push('# Align scopeTag with REQ-25 capability definitions');
    }

    return fixes.join('\n');
  }

  /**
   * Generate recommendations based on violations found
   */
  private generateViolationRecommendations(
    specViolations: ViolationReport['violations'],
    byType: Record<ViolationType, number>
  ): string[] {
    const recommendations: string[] = [];

    const totalErrors = Object.values(byType).reduce((a, b) => a + b, 0);
    
    if (totalErrors > 0) {
      recommendations.push(`Fix ${totalErrors} violation(s) across ${specViolations.length} spec(s)`);
    }

    if (byType['missing_scope_tag'] > 0) {
      recommendations.push('Add scopeTag field to all .config.kiro files');
    }

    if (byType['capability_not_in_req25'] > 0) {
      recommendations.push(
        'Add undeclared capabilities to REQ-25 in parent spec, or remove them from spec configurations'
      );
    }

    if (byType['capability_scope_mismatch'] > 0) {
      recommendations.push(
        'Update scopeTag values to match REQ-25 capability classifications'
      );
    }

    if (byType['inconsistent_scope_with_parent'] > 0) {
      recommendations.push(
        'Align spec scopeTag with parent specification (REQ-25)'
      );
    }

    if (specViolations.length === 0) {
      recommendations.push('All specs are compliant - no violations detected');
    }

    return recommendations;
  }

  /**
   * Get violations for a specific spec
   * 
   * @param specPath - Path to the spec directory
   * @returns Array of violations for this spec
   */
  getViolationsForSpec(specPath: string): Violation[] {
    // Load capabilities if not already loaded
    if (!this.capabilities) {
      this.loadCapabilities();
    }
    
    return this.detectViolations(specPath);
  }

  /**
   * Check if a spec has any violations
   * 
   * @param specPath - Path to the spec directory
   * @returns True if the spec has violations
   */
  hasViolations(specPath: string): boolean {
    const violations = this.detectViolations(specPath);
    return violations.length > 0;
  }

  /**
   * Get violation count by severity for all specs
   * 
   * @param specsPath - Optional path to specs directory
   * @returns Object with error, warning, and info counts
   */
  getViolationSummary(specsPath?: string): {
    errors: number;
    warnings: number;
    infos: number;
    total: number;
  } {
    const report = this.generateViolationReport(specsPath);
    return {
      errors: report.summary.errorCount,
      warnings: report.summary.warningCount,
      infos: report.summary.infoCount,
      total: report.summary.totalViolations
    };
  }
}

// ============================================================
// CLI Interface
// ============================================================

/**
 * Main CLI function
 */
export function main(): void {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let specsPath: string | undefined;
  let parentSpecPath: string | undefined;
  let outputJson = false;
  let specificSpec: string | undefined;
  let capabilityAlignment = false;
  let violationsReport = false;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--specs' || arg === '-s') {
      specsPath = args[++i];
    } else if (arg === '--parent' || arg === '-p') {
      parentSpecPath = args[++i];
    } else if (arg === '--json' || arg === '-j') {
      outputJson = true;
    } else if (arg === '--spec') {
      specificSpec = args[++i];
    } else if (arg === '--capability-alignment' || arg === '-c') {
      capabilityAlignment = true;
    } else if (arg === '--violations' || arg === '-v') {
      violationsReport = true;
    } else if (!arg.startsWith('-')) {
      // Positional argument - treat as specs path
      specsPath = arg;
    }
  }

  // Create validator
  const validator = new ScopeTagValidator({
    specsPath,
    parentSpecPath
  });

  // Handle violation report (Task 9.3)
  if (violationsReport) {
    const violationReport = validator.generateViolationReport(specsPath);
    
    if (outputJson) {
      console.log(JSON.stringify(violationReport, null, 2));
    } else {
      // Human-readable output
      console.log('=== Violation Detection Report ===\n');
      console.log(`Generated: ${violationReport.generatedAt.toISOString()}`);
      console.log(`Duration: ${violationReport.metadata.durationMs}ms\n`);
      
      console.log('Summary:');
      console.log(`  Total Violations: ${violationReport.summary.totalViolations}`);
      console.log(`  Errors: ${violationReport.summary.errorCount}`);
      console.log(`  Warnings: ${violationReport.summary.warningCount}`);
      console.log(`  Info: ${violationReport.summary.infoCount}`);
      console.log(`  Specs with Violations: ${violationReport.summary.specsWithViolations}`);
      console.log(`  Specs without Violations: ${violationReport.summary.specsWithoutViolations}\n`);
      
      // Show violations by type
      console.log('Violations by Type:');
      const byType = violationReport.summary.byType;
      for (const [type, count] of Object.entries(byType)) {
        if (count > 0) {
          console.log(`  ${type}: ${count}`);
        }
      }
      console.log('');
      
      // Show violations for each spec
      if (violationReport.violations.length > 0) {
        console.log('Violations by Spec:');
        for (const specViolation of violationReport.violations) {
          console.log(`\n  ${specViolation.specName} (${specViolation.scopeTag || 'no scopeTag'}):`);
          for (const violation of specViolation.violations) {
            const severityIcon = violation.severity === 'error' ? '✗' : violation.severity === 'warning' ? '⚠' : 'ℹ';
            console.log(`    ${severityIcon} [${violation.severity.toUpperCase()}] ${violation.type}`);
            console.log(`      Location: ${violation.location}`);
            console.log(`      Message: ${violation.message}`);
            console.log(`      Fix: ${violation.suggestedFix}`);
            if (violation.capabilityId) {
              console.log(`      Capability: ${violation.capabilityId}`);
            }
          }
        }
        console.log('');
      }
      
      if (violationReport.recommendations.length > 0) {
        console.log('Recommendations:');
        for (const rec of violationReport.recommendations) {
          console.log(`  - ${rec}`);
        }
      }
    }
    
    process.exit(violationReport.summary.errorCount > 0 ? 1 : 0);
    return;
  }

  // Handle capability alignment report
  if (capabilityAlignment) {
    const alignmentReport = validator.generateCapabilityAlignmentReport(specsPath);
    
    if (outputJson) {
      console.log(JSON.stringify(alignmentReport, null, 2));
    } else {
      // Human-readable output
      console.log('=== Capability Alignment Report ===\n');
      console.log(`Generated: ${alignmentReport.generatedAt.toISOString()}\n`);
      
      console.log('Summary:');
      console.log(`  Total Specs: ${alignmentReport.summary.totalSpecs}`);
      console.log(`  Specs with Alignment Issues: ${alignmentReport.summary.specsWithAlignmentIssues}`);
      console.log(`  Specs with Undeclared Capabilities: ${alignmentReport.summary.specsWithUndeclaredCapabilities}`);
      console.log(`  Specs with Scope Mismatch: ${alignmentReport.summary.specsWithScopeMismatch}`);
      console.log(`  Total Issues: ${alignmentReport.summary.totalIssues}\n`);
      
      // Show specs with issues
      const specsWithIssues = alignmentReport.details.filter(d => d.issues.length > 0);
      if (specsWithIssues.length > 0) {
        console.log('Specs with Issues:');
        for (const spec of specsWithIssues) {
          console.log(`  - ${spec.specName} (${spec.scopeTag})`);
          for (const issue of spec.issues) {
            console.log(`    - ${issue}`);
          }
        }
        console.log('');
      }
      
      // Show undeclared capabilities
      const specsWithUndeclared = alignmentReport.details.filter(d => d.undeclaredCapabilities.length > 0);
      if (specsWithUndeclared.length > 0) {
        console.log('Undeclared Capabilities:');
        for (const spec of specsWithUndeclared) {
          console.log(`  - ${spec.specName}:`);
          for (const cap of spec.undeclaredCapabilities) {
            console.log(`    - ${cap}`);
          }
        }
        console.log('');
      }
      
      // Show scope mismatches
      const specsWithMismatch = alignmentReport.details.filter(d => d.scopeMismatch.length > 0);
      if (specsWithMismatch.length > 0) {
        console.log('Scope Mismatches:');
        for (const spec of specsWithMismatch) {
          console.log(`  - ${spec.specName}:`);
          for (const mismatch of spec.scopeMismatch) {
            console.log(`    - ${mismatch.capabilityId}: declared ${mismatch.declaredScope}, expected ${mismatch.expectedScope}`);
          }
        }
        console.log('');
      }
      
      if (alignmentReport.recommendations.length > 0) {
        console.log('Recommendations:');
        for (const rec of alignmentReport.recommendations) {
          console.log(`  - ${rec}`);
        }
      }
    }
    
    process.exit(alignmentReport.summary.totalIssues > 0 ? 1 : 0);
    return;
  }

  let report: ScopeTagValidationReport | SpecValidationResult;

  if (specificSpec) {
    // Validate specific spec
    report = validator.validateSpecificSpec(specificSpec);
  } else {
    // Validate all specs
    report = validator.validateAllSpecs();
  }

  // Output
  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    // Human-readable output
    if ('summary' in report) {
      // Full report
      console.log('=== Scope Tag Validation Report ===\n');
      console.log(`Specs Path: ${report.specsPath}`);
      console.log(`Parent Spec: ${report.parentSpecPath}`);
      console.log(`Generated: ${report.generatedAt.toISOString()}\n`);
      
      console.log('Summary:');
      console.log(`  Total Specs: ${report.summary.totalSpecs}`);
      console.log(`  Valid: ${report.summary.validSpecs}`);
      console.log(`  Invalid: ${report.summary.invalidSpecs}`);
      console.log(`  P0: ${report.summary.p0Specs}, P1: ${report.summary.p1Specs}, P2: ${report.summary.p2Specs}`);
      console.log(`  Warnings: ${report.summary.warnings}\n`);
      
      if (report.summary.invalidSpecs > 0) {
        console.log('Invalid Specs:');
        for (const result of report.results.filter(r => !r.valid)) {
          console.log(`  - ${result.specPath}`);
          for (const error of result.errors) {
            console.log(`    Error: ${error}`);
          }
        }
        console.log('');
      }
      
      if (report.recommendations.length > 0) {
        console.log('Recommendations:');
        for (const rec of report.recommendations) {
          console.log(`  - ${rec}`);
        }
      }
    } else {
      // Single spec result
      console.log(`Spec: ${report.specPath}`);
      console.log(`Valid: ${report.valid}`);
      console.log(`Scope Tag: ${report.scopeTag || 'none'}`);
      
      if (report.errors.length > 0) {
        console.log('\nErrors:');
        for (const error of report.errors) {
          console.log(`  - ${error}`);
        }
      }
      
      if (report.warnings.length > 0) {
        console.log('\nWarnings:');
        for (const warning of report.warnings) {
          console.log(`  - ${warning}`);
        }
      }
    }
  }

  // Exit code
  if ('summary' in report) {
    process.exit(report.summary.invalidSpecs > 0 ? 1 : 0);
  } else {
    process.exit(report.valid ? 0 : 1);
  }
}

/**
 * CLI entry point - run this function to execute the CLI
 * Usage: bun run packages/scope-gate/src/scope-tag-validator.ts
 */
export function runCli(): void {
  main();
}

// Only run CLI when this file is explicitly executed as a CLI tool
// This check runs at module load time, so we use a simple heuristic:
// Only run if the script path explicitly contains 'scope-tag-validator' and nothing else
const shouldRunCli = 
  process.argv[1]?.includes('scope-tag-validator') && 
  !process.argv[1].includes('test') &&
  !process.argv[1].includes('vitest') &&
  !process.argv[1].includes('node_modules');

if (shouldRunCli) {
  runCli();
}

export default ScopeTagValidator;