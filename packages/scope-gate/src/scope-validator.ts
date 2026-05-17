/**
 * Scope Validator implementation
 * 
 * Performs static validation of scope boundaries across the codebase.
 * Validates:
 * 1. Code dependencies (P0 should not depend on P1/P2)
 * 2. Spec scope tags in .config.kiro files
 * 3. Feature flag guards for P1/P2 capability usage
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  ScopeValidator as IScopeValidator,
  ValidationResult,
  SourceLocation,
  CapabilityDefinition,
  ScopeTag
} from './types.js';

interface ConfigKiro {
  specId?: string;
  scopeTag?: string;
  parentSpec?: string;
  [key: string]: unknown;
}

// Note: FileDependency interface kept for potential future use
// interface FileDependency {
//   file: string;
//   imports: string[];
// }

export class ScopeValidator implements IScopeValidator {
  private capabilities: Map<string, CapabilityDefinition> = new Map();
  private p0ModuleNames: Set<string> = new Set();

  /**
   * Set capabilities from registry for validation
   */
  setCapabilities(capabilities: CapabilityDefinition[]): void {
    this.capabilities.clear();
    this.p0ModuleNames.clear();
    
    for (const cap of capabilities) {
      this.capabilities.set(cap.id, cap);
      if (cap.scopeTag === 'p0') {
        // Also add common module name variations
        this.p0ModuleNames.add(cap.id.toLowerCase());
        this.p0ModuleNames.add(cap.id.replace(/-/g, '').toLowerCase());
        this.p0ModuleNames.add(cap.id.replace(/-/g, '_').toLowerCase());
      }
    }
  }

  /**
   * Static analysis: check for P0 code depending on P1/P2
   * Task 5.2: Implement code dependency analysis
   */
  validateCodeDependencies(codebasePath: string): ValidationResult[] {
    const results: ValidationResult[] = [];
    
    if (!fs.existsSync(codebasePath)) {
      results.push(this.createValidationResult(
        'error',
        'unregistered_capability',
        `Codebase path does not exist: ${codebasePath}`,
        undefined,
        { path: codebasePath }
      ));
      return results;
    }

    // Find all TypeScript/JavaScript files
    const files = this.findTypeScriptFiles(codebasePath);
    
    // Analyze each file for imports
    for (const file of files) {
      const fileResults = this.analyzeFileDependencies(file, codebasePath);
      results.push(...fileResults);
    }

    return results;
  }

  /**
   * Find all TypeScript files in the codebase
   */
  private findTypeScriptFiles(dirPath: string, files: string[] = []): string[] {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      if (dirPath.endsWith('.ts') || dirPath.endsWith('.js')) {
        return [dirPath];
      }
      return files;
    }

    // Skip node_modules, dist, etc.
    const skipDirs = ['node_modules', 'dist', 'build', '.git', 'tests', 'artifacts'];
    const dirName = path.basename(dirPath);
    if (skipDirs.includes(dirName)) {
      return files;
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          this.findTypeScriptFiles(fullPath, files);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }

    return files;
  }

  /**
   * Analyze a single file for dependency violations
   */
  private analyzeFileDependencies(filePath: string, basePath: string): ValidationResult[] {
    const results: ValidationResult[] = [];
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(basePath, filePath);
      
      // Check for P1/P2 capability imports without feature flags
      const imports = this.extractImports(content);
      
      for (const importSpec of imports) {
        // Check if this import is a P1 or P2 capability
        const capability = this.findCapabilityByImport(importSpec);
        
        if (capability && (capability.scopeTag === 'p1' || capability.scopeTag === 'p2')) {
          // This is importing a P1/P2 capability - check if there's proper guarding
          const hasGuard = this.hasFeatureFlagGuard(content, capability.id);
          
          if (!hasGuard) {
            results.push(this.createValidationResult(
              'error',
              capability.scopeTag === 'p1' ? 'p0_depends_on_p1' : 'p0_depends_on_p2',
              `P0 code imports P${capability.scopeTag === 'p1' ? '1' : '2'} capability '${capability.id}' without proper feature flag guard`,
              this.createSourceLocation(relativePath, this.findImportLine(content, importSpec), 0),
              {
                capabilityId: capability.id,
                capabilityScope: capability.scopeTag,
                importSpec,
                file: relativePath
              }
            ));
          }
        }
      }
    } catch (error) {
      // Skip files that can't be read
    }

    return results;
  }

  /**
   * Extract import statements from TypeScript code
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];
    
    // Match ES6 imports: import X from 'Y' or import 'Y'
    const importRegex = /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)?\s*from\s*['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    // Also match side-effect imports: import 'X'
    const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g;
    while ((match = sideEffectRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    return imports;
  }

  /**
   * Find capability definition by import specifier
   */
  private findCapabilityByImport(importSpec: string): CapabilityDefinition | null {
    // Normalize the import spec
    const normalized = importSpec
      .replace(/^@specforge\//, '')
      .replace(/^@specforge\\/, '')
      .replace(/^\.\.?\//, '')  // Relative imports - skip
      .replace(/\/index$/, '')
      .replace(/\/src$/, '');
    
    if (!normalized || normalized.startsWith('.')) {
      return null;
    }

    // Check direct match
    const capability = this.capabilities.get(normalized);
    if (capability) {
      return capability;
    }

    // Check partial match (e.g., 'scope-gate' matches capability 'scope-gate')
    for (const [id, cap] of this.capabilities) {
      if (normalized.includes(id) || id.includes(normalized)) {
        return cap;
      }
    }

    return null;
  }

  /**
   * Check if code has feature flag guard for a capability
   */
  private hasFeatureFlagGuard(content: string, capabilityId: string): boolean {
    // Look for patterns like:
    // - if (featureFlags.has('enable_capabilityId'))
    // - if (context.featureFlags.includes('enable_capabilityId'))
    // - if (isEnabled('capabilityId'))
    // - #if ENABLE_CAPABILITY (though this is more C-preprocessor)
    
    const flagPatterns = [
      new RegExp(`featureFlags\\s*[.(]\\s*['"]enable[_-]${capabilityId}['"]`, 'i'),
      new RegExp(`featureFlags\\s*\\.has\\s*\\(\\s*['"]enable[_-]${capabilityId}['"]`, 'i'),
      new RegExp(`context\\.featureFlags`, 'i'),
      new RegExp(`isEnabled\\s*\\(\\s*['"]${capabilityId}['"]`, 'i'),
      new RegExp(`checkScope\\s*\\(`, 'i'),
      new RegExp(`scopeRegistry\\.isAvailable`, 'i'),
      new RegExp(`guardCapability`, 'i'),
    ];

    return flagPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Find line number of import statement
   */
  private findImportLine(content: string, importSpec: string): number {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(importSpec)) {
        return i + 1; // 1-indexed
      }
    }
    return 1;
  }

  /**
   * Validate spec .config.kiro files have correct scopeTag
   * Task 5.3: Add spec scope tag validation
   */
  validateSpecScopeTags(specsPath: string): ValidationResult[] {
    const results: ValidationResult[] = [];
    
    if (!fs.existsSync(specsPath)) {
      results.push(this.createValidationResult(
        'error',
        'missing_scope_tag',
        `Specs path does not exist: ${specsPath}`,
        undefined,
        { path: specsPath }
      ));
      return results;
    }

    // Find all .config.kiro files
    const configFiles = this.findConfigKiroFiles(specsPath);
    
    for (const configFile of configFiles) {
      const fileResults = this.validateConfigFile(configFile, specsPath);
      results.push(...fileResults);
    }

    return results;
  }

  /**
   * Find all .config.kiro files in specs directory
   */
  private findConfigKiroFiles(dirPath: string, files: string[] = []): string[] {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      if (path.basename(dirPath) === '.config.kiro') {
        return [dirPath];
      }
      return files;
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Skip non-spec directories
          if (!entry.name.startsWith('.') && entry.name !== 'artifacts' && entry.name !== 'tests') {
            this.findConfigKiroFiles(fullPath, files);
          }
        } else if (entry.name === '.config.kiro') {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }

    return files;
  }

  /**
   * Validate a single .config.kiro file
   */
  private validateConfigFile(configPath: string, basePath: string): ValidationResult[] {
    const results: ValidationResult[] = [];
    const relativePath = path.relative(basePath, configPath);
    
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      let config: ConfigKiro;
      
      try {
        config = JSON.parse(content);
      } catch {
        results.push(this.createValidationResult(
          'error',
          'incorrect_scope_tag',
          `Invalid JSON in .config.kiro file: ${relativePath}`,
          undefined,
          { file: relativePath }
        ));
        return results;
      }

      // Check if scopeTag exists
      if (!config.scopeTag) {
        results.push(this.createValidationResult(
          'error',
          'missing_scope_tag',
          `Missing 'scopeTag' field in .config.kiro: ${relativePath}`,
          undefined,
          { file: relativePath, specId: config.specId }
        ));
        return results;
      }

      // Validate scopeTag value
      const validScopes: ScopeTag[] = ['p0', 'p1', 'p2'];
      if (!validScopes.includes(config.scopeTag as ScopeTag)) {
        results.push(this.createValidationResult(
          'error',
          'incorrect_scope_tag',
          `Invalid 'scopeTag' value '${config.scopeTag}' in .config.kiro: ${relativePath}. Must be one of: p0, p1, p2`,
          undefined,
          { file: relativePath, specId: config.specId, scopeTag: config.scopeTag }
        ));
        return results;
      }

      // If this spec has a parent spec, check if scopeTag aligns with parent's REQ-25
      if (config.specId && config.parentSpec) {
        const capability = this.capabilities.get(config.specId);
        if (capability && capability.scopeTag !== config.scopeTag) {
          results.push(this.createValidationResult(
            'warning',
            'scope_tag_mismatch',
            `Spec '${config.specId}' scopeTag '${config.scopeTag}' does not match REQ-25 classification '${capability.scopeTag}'`,
            undefined,
            { 
              file: relativePath, 
              specId: config.specId, 
              declaredScope: config.scopeTag,
              req25Scope: capability.scopeTag
            }
          ));
        }
      }
    } catch (error) {
      results.push(this.createValidationResult(
        'error',
        'incorrect_scope_tag',
        `Failed to read .config.kiro file: ${relativePath}`,
        undefined,
        { file: relativePath, error: String(error) }
      ));
    }

    return results;
  }

  /**
   * Check that runtime feature flags are properly guarded
   */
  validateFeatureFlagGuards(codebasePath: string): ValidationResult[] {
    const results: ValidationResult[] = [];
    
    if (!fs.existsSync(codebasePath)) {
      return results;
    }

    // Find all TypeScript files
    const files = this.findTypeScriptFiles(codebasePath);
    
    // Get P1/P2 capability IDs
    const p1p2Capabilities = Array.from(this.capabilities.values())
      .filter(cap => cap.scopeTag === 'p1' || cap.scopeTag === 'p2');
    
    for (const file of files) {
      const fileResults = this.analyzeFeatureFlagGuards(file, codebasePath, p1p2Capabilities);
      results.push(...fileResults);
    }

    return results;
  }

  /**
   * Analyze a single file for proper feature flag guards
   */
  private analyzeFeatureFlagGuards(
    filePath: string, 
    basePath: string, 
    p1p2Capabilities: CapabilityDefinition[]
  ): ValidationResult[] {
    const results: ValidationResult[] = [];
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(basePath, filePath);
      
      for (const capability of p1p2Capabilities) {
        // Check if this file references the capability
        const hasReference = content.includes(capability.id) || 
                            content.includes(capability.displayName);
        
        if (hasReference) {
          // Check if there's a proper guard
          const hasGuard = this.hasFeatureFlagGuard(content, capability.id);
          
          if (!hasGuard) {
            results.push(this.createValidationResult(
              'warning',
              'missing_feature_flag_guard',
              `P${capability.scopeTag === 'p1' ? '1' : '2'} capability '${capability.id}' is referenced without feature flag guard`,
              undefined,
              { 
                file: relativePath, 
                capabilityId: capability.id,
                capabilityScope: capability.scopeTag
              }
            ));
          }
        }
      }
    } catch (error) {
      // Skip files that can't be read
    }

    return results;
  }

  /**
   * Validate a single file for scope compliance
   */
  validateFile(filePath: string): ValidationResult[] {
    const results: ValidationResult[] = [];
    
    if (!fs.existsSync(filePath)) {
      results.push(this.createValidationResult(
        'error',
        'unregistered_capability',
        `File does not exist: ${filePath}`,
        undefined,
        { path: filePath }
      ));
      return results;
    }

    const basePath = path.dirname(filePath);
    
    // Analyze dependencies
    const depResults = this.analyzeFileDependencies(filePath, basePath);
    results.push(...depResults);
    
    return results;
  }

  /**
   * Generate a comprehensive validation report
   */
  generateValidationReport(
    codebasePath: string,
    specsPath: string
  ): {
    codeDependencies: ValidationResult[];
    specScopeTags: ValidationResult[];
    featureFlagGuards: ValidationResult[];
    summary: {
      totalErrors: number;
      totalWarnings: number;
      totalInfos: number;
    };
  } {
    const codeDependencies = this.validateCodeDependencies(codebasePath);
    const specScopeTags = this.validateSpecScopeTags(specsPath);
    const featureFlagGuards = this.validateFeatureFlagGuards(codebasePath);
    
    const allResults = [...codeDependencies, ...specScopeTags, ...featureFlagGuards];
    
    const summary = {
      totalErrors: allResults.filter(r => r.type === "error").length,
      totalWarnings: allResults.filter(r => r.type === "warning").length,
      totalInfos: allResults.filter(r => r.type === "info").length
    };
    
    return {
      codeDependencies,
      specScopeTags,
      featureFlagGuards,
      summary
    };
  }

  /**
   * Create a source location object
   */
  protected createSourceLocation(
    file: string,
    line: number,
    column: number
  ): SourceLocation {
    return { file, line, column };
  }

  /**
   * Create a validation result
   */
  protected createValidationResult(
    type: "error" | "warning" | "info",
    code: string,
    message: string,
    location?: SourceLocation | undefined,
    context?: Record<string, unknown> | undefined
  ): ValidationResult {
    return {
      type,
      code: code as any,
      message,
      location,
      context
    };
  }
}