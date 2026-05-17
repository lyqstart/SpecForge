/**
 * scope-context CLI Tool
 * 
 * Inspects and displays the current scope context including:
 * - Current scope context information
 * - Enabled feature flags
 * - Current scope tag
 * - Supports JSON output format
 * 
 * Usage:
 *   bun run packages/scope-gate/bin/scope-context.ts
 *   bun run packages/scope-gate/bin/scope-context.ts --output json
 *   bun run packages/scope-gate/bin/scope-context.ts --verbose
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import { ScopeRegistry } from '../src/scope-registry.js';
import { FeatureFlagManager } from '../src/feature-flag-manager.js';
import { Req25Loader } from '../src/req25-loader.js';
import type { ScopeContext, CapabilityDefinition, ScopeTag } from '../src/types.js';

/**
 * Scope context inspection result
 */
export interface ScopeContextInspection {
  scopeContext: {
    releaseBranch: string;
    environment: string;
    scopeTag: string;
  };
  featureFlags: {
    enabled: string[];
    disabled: string[];
    total: number;
  };
  capabilities: {
    p0: number;
    p1: number;
    p2: number;
    total: number;
  };
  inspectionTime: string;
  sourceInfo: {
    parentSpecPath: string;
    capabilitiesLoaded: boolean;
  };
}

/**
 * Parse command line arguments
 */
function parseArgs(): {
  output: 'text' | 'json';
  verbose: boolean;
  help: boolean;
} {
  const args = process.argv.slice(2);
  let output: 'text' | 'json' = 'text';
  let verbose = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--output' || arg === '-o') {
      const value = args[++i]?.toLowerCase();
      if (value === 'json') {
        output = 'json';
      }
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    }
  }

  return { output, verbose, help };
}

/**
 * Print usage information
 */
function printHelp(): void {
  console.log(`
scope-context - Inspect current scope context

Usage:
  bun run packages/scope-gate/bin/scope-context.ts [options]

Options:
  --output, -o <format>  Output format: text or json (default: text)
  --verbose, -v          Show detailed information
  --help, -h             Show this help message

Examples:
  # Inspect current scope context (human-readable)
  bun run packages/scope-gate/bin/scope-context.ts

  # Output as JSON for machine consumption
  bun run packages/scope-gate/bin/scope-context.ts --output json

  # Show detailed information
  bun run packages/scope-gate/bin/scope-context.ts --verbose
`);
}

/**
 * Determine the repository root path
 */
function getRepoRoot(): string {
  const cwd = process.cwd();
  
  // Check if we're in scope-gate package
  if (cwd.includes('packages/scope-gate') || cwd.includes('packages\\scope-gate')) {
    return resolve(cwd, '..', '..');
  }
  
  // Assume we're in repo root
  return cwd;
}

/**
 * Detect current scope tag based on release branch and feature flags
 */
function detectScopeTag(context: ScopeContext, flagManager: FeatureFlagManager): ScopeTag {
  // In V6.0, P1/P2 are disabled by default
  if (context.releaseBranch === 'v6.0') {
    // Check if any P1/P2 flags are enabled
    const hasEnabledP1 = flagManager.isEnabled('enable_all_p1');
    const hasEnabledP2 = flagManager.isEnabled('enable_all_p2');
    const hasEnabledP1P2 = flagManager.isEnabled('enable_all_p1p2');
    
    if (hasEnabledP1 || hasEnabledP2 || hasEnabledP1P2) {
      // If any P1/P2 is enabled, we're in extended scope
      return 'p1';
    }
    
    // Default V6.0 is P0-only
    return 'p0';
  }
  
  // For development branches, default to p1 (includes p0)
  if (context.releaseBranch === 'development') {
    return 'p1';
  }
  
  // For v6.1+, default to p1
  return 'p1';
}

/**
 * Load capabilities and create managers
 */
function loadScopeContext(): {
  registry: ScopeRegistry;
  flagManager: FeatureFlagManager;
  parentSpecPath: string;
  capabilitiesLoaded: boolean;
} {
  const registry = new ScopeRegistry();
  const flagManager = new FeatureFlagManager();
  const parentSpecPath = Req25Loader.getDefaultParentSpecPath();
  
  let capabilitiesLoaded = false;
  
  if (existsSync(parentSpecPath)) {
    // Load capabilities synchronously
    registry.loadFromParentSpecSync(parentSpecPath);
    
    // Register capabilities with feature flag manager
    const capabilities = registry.getAllCapabilities();
    for (const capability of capabilities) {
      flagManager.registerCapability(capability.id, capability.scopeTag);
    }
    
    capabilitiesLoaded = capabilities.length > 0;
  } else {
    console.warn(`Warning: Parent spec not found at ${parentSpecPath}`);
  }
  
  return { registry, flagManager, parentSpecPath, capabilitiesLoaded };
}

/**
 * Create scope context from environment
 */
function createScopeContext(flagManager: FeatureFlagManager): ScopeContext {
  const releaseBranch = (process.env.SCOPEGATE_RELEASE_BRANCH as ScopeContext['releaseBranch']) || 'v6.0';
  const environment = (process.env.SCOPEGATE_ENVIRONMENT as ScopeContext['environment']) || 
    (process.env.NODE_ENV === 'development' ? 'development' : 
     process.env.NODE_ENV === 'test' ? 'test' : 'production');
  
  // Get enabled flags from flag manager
  const enabledFlags = flagManager.getEnabled().map(f => f.name);
  
  return {
    releaseBranch,
    featureFlags: new Set(enabledFlags),
    environment
  };
}

/**
 * Format scope context for human-readable output
 */
function formatOutput(
  inspection: ScopeContextInspection,
  verbose: boolean
): void {
  const { scopeContext, featureFlags, capabilities, sourceInfo } = inspection;
  
  console.log('\n=== Scope Context Inspection ===\n');
  
  // Scope Context Section
  console.log('Scope Context:');
  console.log(`  Release Branch: ${scopeContext.releaseBranch}`);
  console.log(`  Environment:    ${scopeContext.environment}`);
  console.log(`  Current Tag:    ${scopeContext.scopeTag.toUpperCase()}`);
  console.log('');
  
  // Feature Flags Section
  console.log('Feature Flags:');
  console.log(`  Total: ${featureFlags.total} (${featureFlags.enabled.length} enabled, ${featureFlags.disabled.length} disabled)`);
  
  if (verbose) {
    if (featureFlags.enabled.length > 0) {
      console.log('  Enabled:');
      for (const flag of featureFlags.enabled) {
        console.log(`    ✓ ${flag}`);
      }
    }
    
    if (featureFlags.disabled.length > 0) {
      console.log('  Disabled:');
      // Show first 10 in verbose mode
      const showFlags = featureFlags.disabled.slice(0, 10);
      for (const flag of showFlags) {
        console.log(`    ✗ ${flag}`);
      }
      if (featureFlags.disabled.length > 10) {
        console.log(`    ... and ${featureFlags.disabled.length - 10} more`);
      }
    }
  } else {
    if (featureFlags.enabled.length > 0) {
      console.log(`  Enabled: ${featureFlags.enabled.join(', ')}`);
    } else {
      console.log('  Enabled: (none)');
    }
  }
  console.log('');
  
  // Capabilities Section
  console.log('Capabilities:');
  console.log(`  P0: ${capabilities.p0}`);
  console.log(`  P1: ${capabilities.p1}`);
  console.log(`  P2: ${capabilities.p2}`);
  console.log(`  Total: ${capabilities.total}`);
  console.log('');
  
  // Source Info (verbose only)
  if (verbose) {
    console.log('Source Information:');
    console.log(`  Parent Spec: ${sourceInfo.parentSpecPath}`);
    console.log(`  Capabilities Loaded: ${sourceInfo.capabilitiesLoaded ? 'Yes' : 'No'}`);
    console.log('');
  }
  
  console.log(`Inspected at: ${inspection.inspectionTime}\n`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const { output, verbose, help } = parseArgs();

  if (help) {
    printHelp();
    return;
  }

  // Load scope context
  const { registry, flagManager, parentSpecPath, capabilitiesLoaded } = loadScopeContext();
  
  // Create scope context from environment
  const scopeContext = createScopeContext(flagManager);
  
  // Detect current scope tag
  const currentScopeTag = detectScopeTag(scopeContext, flagManager);
  
  // Get all capabilities
  const allCapabilities = registry.getAllCapabilities();
  const p0Capabilities = registry.getCapabilitiesByScope('p0');
  const p1Capabilities = registry.getCapabilitiesByScope('p1');
  const p2Capabilities = registry.getCapabilitiesByScope('p2');
  
  // Get feature flags
  const allFlags = flagManager.getAll();
  const enabledFlags = allFlags.filter(f => f.enabled).map(f => f.name);
  const disabledFlags = allFlags.filter(f => !f.enabled).map(f => f.name);
  
  // Build inspection result
  const inspection: ScopeContextInspection = {
    scopeContext: {
      releaseBranch: scopeContext.releaseBranch,
      environment: scopeContext.environment,
      scopeTag: currentScopeTag
    },
    featureFlags: {
      enabled: enabledFlags,
      disabled: disabledFlags,
      total: allFlags.length
    },
    capabilities: {
      p0: p0Capabilities.length,
      p1: p1Capabilities.length,
      p2: p2Capabilities.length,
      total: allCapabilities.length
    },
    inspectionTime: new Date().toISOString(),
    sourceInfo: {
      parentSpecPath,
      capabilitiesLoaded
    }
  };

  // Output results
  if (output === 'json') {
    console.log(JSON.stringify(inspection, null, 2));
  } else {
    formatOutput(inspection, verbose);
  }
}

// Run the CLI
main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});