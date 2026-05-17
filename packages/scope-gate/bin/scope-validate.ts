/**
 * scope-validate CLI Tool
 * 
 * Validates scope tags in the SpecForge repository.
 * Supports validating both code dependencies and spec scope tags.
 * 
 * Usage:
 *   bun run packages/scope-gate/bin/scope-validate.ts
 *   bun run packages/scope-gate/bin/scope-validate.ts --path ./packages/my-package
 *   bun run packages/scope-gate/bin/scope-validate.ts --output json
 */

import { resolve, join } from 'path';
import { existsSync } from 'fs';
import { ScopeValidator } from '../src/scope-validator.js';
import { Req25Loader } from '../src/req25-loader.js';
import type { ValidationResult, CapabilityDefinition } from '../src/types.js';

/**
 * Parse command line arguments
 */
function parseArgs(): { 
  path: string | null; 
  output: 'text' | 'json';
  help: boolean;
} {
  const args = process.argv.slice(2);
  let path: string | null = null;
  let output: 'text' | 'json' = 'text';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--path' || arg === '-p') {
      path = args[++i] || null;
    } else if (arg === '--output' || arg === '-o') {
      const value = args[++i]?.toLowerCase();
      if (value === 'json') {
        output = 'json';
      }
    } else if (!arg.startsWith('-')) {
      // Treat non-flag arguments as path
      path = arg;
    }
  }

  return { path, output, help };
}

/**
 * Print usage information
 */
function printHelp(): void {
  console.log(`
scope-validate - Validate scope tags in SpecForge

Usage:
  bun run packages/scope-gate/bin/scope-validate.ts [options]

Options:
  --path, -p <path>    Path to validate (default: current directory)
  --output, -o <format>  Output format: text or json (default: text)
  --help, -h           Show this help message

Examples:
  # Validate current directory
  bun run packages/scope-gate/bin/scope-validate.ts

  # Validate a specific package
  bun run packages/scope-gate/bin/scope-validate.ts --path ./packages/my-package

  # Output as JSON
  bun run packages/scope-gate/bin/scope-validate.ts --output json
`);
}

/**
 * Determine default paths for validation
 */
function getDefaultPaths(): { codebasePath: string; specsPath: string } {
  const cwd = process.cwd();
  const repoRoot = resolve(cwd, '..', '..');
  
  // Check if we're in scope-gate package
  if (cwd.includes('packages/scope-gate') || cwd.includes('packages\\scope-gate')) {
    return {
      codebasePath: resolve(cwd, '..'),
      specsPath: resolve(repoRoot, '.kiro', 'specs')
    };
  }
  
  // Assume we're in repo root
  return {
    codebasePath: cwd,
    specsPath: resolve(cwd, '.kiro', 'specs')
  };
}

/**
 * Load capabilities from REQ-25
 */
function loadCapabilities(): CapabilityDefinition[] {
  const loader = new Req25Loader();
  const parentSpecPath = Req25Loader.getDefaultParentSpecPath();
  
  if (!existsSync(parentSpecPath)) {
    console.warn(`Warning: Parent spec not found at ${parentSpecPath}`);
    return [];
  }
  
  const result = loader.loadFromParentSpec(parentSpecPath);
  
  if (!result.success) {
    console.warn(`Warning: Failed to load REQ-25: ${result.error}`);
    return [];
  }
  
  return result.capabilities;
}

/**
 * Format validation results for human-readable output
 */
function formatResults(report: {
  codeDependencies: ValidationResult[];
  specScopeTags: ValidationResult[];
  featureFlagGuards: ValidationResult[];
  summary: {
    totalErrors: number;
    totalWarnings: number;
    totalInfos: number;
  };
}, outputMode: 'text' | 'json'): void {
  if (outputMode === 'json') {
    // JSON output - don't exit here, let main() handle exit code
    return;
  }
  
  console.log('\n=== Scope Validation Report ===\n');
  
  // Summary
  console.log('Summary:');
  console.log(`  Errors:   ${report.summary.totalErrors}`);
  console.log(`  Warnings: ${report.summary.totalWarnings}`);
  console.log(`  Info:     ${report.summary.totalInfos}`);
  console.log('');
  
  // Code dependencies
  if (report.codeDependencies.length > 0) {
    console.log('Code Dependencies:');
    for (const result of report.codeDependencies) {
      const location = result.location ? ` (${result.location.file}:${result.location.line})` : '';
      console.log(`  [${result.type.toUpperCase()}] ${result.code}${location}`);
      console.log(`    ${result.message}`);
    }
    console.log('');
  }
  
  // Spec scope tags
  if (report.specScopeTags.length > 0) {
    console.log('Spec Scope Tags:');
    for (const result of report.specScopeTags) {
      const file = result.context?.file || result.context?.path || '';
      const location = file ? ` (${file})` : '';
      console.log(`  [${result.type.toUpperCase()}] ${result.code}${location}`);
      console.log(`    ${result.message}`);
    }
    console.log('');
  }
  
  // Feature flag guards
  if (report.featureFlagGuards.length > 0) {
    console.log('Feature Flag Guards:');
    for (const result of report.featureFlagGuards) {
      const file = result.context?.file || '';
      const location = file ? ` (${file})` : '';
      console.log(`  [${result.type.toUpperCase()}] ${result.code}${location}`);
      console.log(`    ${result.message}`);
    }
    console.log('');
  }
  
  if (report.summary.totalErrors === 0 && report.summary.totalWarnings === 0) {
    console.log('✓ Validation passed - no issues found.\n');
  } else if (report.summary.totalErrors > 0) {
    console.log('✗ Validation failed - errors found.\n');
    process.exit(1);
  } else {
    console.log('⚠ Validation passed with warnings.\n');
  }
}

/**
 * Main validation function
 */
async function main(): Promise<void> {
  const { path, output, help } = parseArgs();
  
  if (help) {
    printHelp();
    return;
  }
  
  // Determine paths
  let codebasePath: string;
  let specsPath: string;
  
  if (path) {
    const resolvedPath = resolve(process.cwd(), path);
    if (!existsSync(resolvedPath)) {
      console.error(`Error: Path does not exist: ${resolvedPath}`);
      process.exit(1);
    }
    codebasePath = resolvedPath;
    
    // Calculate repo root from the given path
    // Handle common patterns:
    // - ./packages/my-package -> go up 2 levels
    // - ./src -> go up enough levels to find .kiro/specs
    let repoRoot = resolvedPath;
    let foundSpecs = false;
    for (let i = 0; i < 5; i++) { // Max 5 levels up
      const potentialSpecsPath = resolve(repoRoot, '.kiro', 'specs');
      if (existsSync(potentialSpecsPath)) {
        specsPath = potentialSpecsPath;
        foundSpecs = true;
        break;
      }
      repoRoot = resolve(repoRoot, '..');
    }
    if (!foundSpecs) {
      // Fallback: use the default calculation
      repoRoot = resolve(resolvedPath, '..');
      specsPath = resolve(repoRoot, '.kiro', 'specs');
    }
  } else {
    const defaults = getDefaultPaths();
    codebasePath = defaults.codebasePath;
    specsPath = defaults.specsPath;
  }
  
  console.log(`Validating:`);
  console.log(`  Codebase: ${codebasePath}`);
  console.log(`  Specs:    ${specsPath}`);
  
  // Load capabilities
  const capabilities = loadCapabilities();
  
  if (capabilities.length === 0) {
    console.error('Error: No capabilities loaded from REQ-25');
    process.exit(1);
  }
  
  console.log(`Loaded ${capabilities.length} capabilities from REQ-25`);
  
  // Create validator and set capabilities
  const validator = new ScopeValidator();
  validator.setCapabilities(capabilities);
  
  // Run validation
  const report = validator.generateValidationReport(codebasePath, specsPath);
  
  // Output results
  if (output === 'json') {
    console.log(JSON.stringify({
      codebasePath,
      specsPath,
      ...report
    }, null, 2));
  } else {
    formatResults(report, output);
  }
}

// Run the CLI
main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});