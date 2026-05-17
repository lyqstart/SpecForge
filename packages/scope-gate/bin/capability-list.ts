/**
 * capability-list CLI Tool
 * 
 * Lists all registered capabilities with their scope tags and feature flag status.
 * 
 * Usage:
 *   bun run packages/scope-gate/bin/capability-list.ts
 *   bun run packages/scope-gate/bin/capability-list.ts --scope p0
 *   bun run packages/scope-gate/bin/capability-list.ts --output json
 */

import { existsSync } from 'fs';
import { ScopeRegistry } from '../src/scope-registry.js';
import { FeatureFlagManager } from '../src/feature-flag-manager.js';
import { Req25Loader } from '../src/req25-loader.js';
import type { CapabilityDefinition, ScopeTag } from '../src/types.js';

/**
 * Parse command line arguments
 */
function parseArgs(): {
  scope: ScopeTag | null;
  output: 'text' | 'json';
  help: boolean;
} {
  const args = process.argv.slice(2);
  let scope: ScopeTag | null = null;
  let output: 'text' | 'json' = 'text';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--scope' || arg === '-s') {
      const value = args[++i]?.toLowerCase();
      if (value === 'p0' || value === 'p1' || value === 'p2') {
        scope = value as ScopeTag;
      }
    } else if (arg === '--output' || arg === '-o') {
      const value = args[++i]?.toLowerCase();
      if (value === 'json') {
        output = 'json';
      }
    }
  }

  return { scope, output, help };
}

/**
 * Print usage information
 */
function printHelp(): void {
  console.log(`
capability-list - List all registered capabilities

Usage:
  bun run packages/scope-gate/bin/capability-list.ts [options]

Options:
  --scope, -s <scope>   Filter by scope tag: p0, p1, or p2
  --output, -o <format> Output format: text or json (default: text)
  --help, -h            Show this help message

Examples:
  # List all capabilities
  bun run packages/scope-gate/bin/capability-list.ts

  # List only P0 capabilities
  bun run packages/scope-gate/bin/capability-list.ts --scope p0

  # Output as JSON
  bun run packages/scope-gate/bin/capability-list.ts --output json
`);
}

/**
 * Load capabilities from REQ-25
 */
function loadCapabilities(): { registry: ScopeRegistry; flagManager: FeatureFlagManager } {
  const registry = new ScopeRegistry();
  const flagManager = new FeatureFlagManager();
  
  // Load parent spec path
  const parentSpecPath = Req25Loader.getDefaultParentSpecPath();
  
  if (!existsSync(parentSpecPath)) {
    console.warn(`Warning: Parent spec not found at ${parentSpecPath}`);
    return { registry, flagManager };
  }
  
  // Load capabilities synchronously
  registry.loadFromParentSpecSync(parentSpecPath);
  
  // Register capabilities with feature flag manager
  const capabilities = registry.getAllCapabilities();
  for (const capability of capabilities) {
    flagManager.registerCapability(capability.id, capability.scopeTag);
  }
  
  return { registry, flagManager };
}

/**
 * Format capability for human-readable output
 */
function formatCapability(capability: CapabilityDefinition, flagEnabled: boolean): string {
  const scopeTag = capability.scopeTag.toUpperCase();
  const flagStatus = flagEnabled ? 'enabled' : 'disabled';
  
  return `${capability.id}
  Scope: ${scopeTag}
  Flag: ${flagStatus} (${`enable_${capability.id}`})
  ${capability.description ? `Description: ${capability.description}` : ''}`;
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const { scope, output, help } = parseArgs();

  if (help) {
    printHelp();
    return;
  }

  // Load capabilities
  const { registry, flagManager } = loadCapabilities();

  // Get all capabilities (or filter by scope)
  let capabilities: CapabilityDefinition[];
  if (scope) {
    capabilities = registry.getCapabilitiesByScope(scope);
  } else {
    capabilities = registry.getAllCapabilities();
  }

  if (capabilities.length === 0) {
    console.log('No capabilities found.');
    if (scope) {
      console.log(`Try removing the --scope filter or check if REQ-25 is loaded correctly.`);
    }
    return;
  }

  // Sort capabilities: P0 first, then P1, then P2
  capabilities.sort((a, b) => {
    const scopeOrder: Record<ScopeTag, number> = { p0: 0, p1: 1, p2: 2 };
    return scopeOrder[a.scopeTag] - scopeOrder[b.scopeTag];
  });

  // Prepare output
  if (output === 'json') {
    const jsonOutput = capabilities.map(capability => {
      const flagName = `enable_${capability.id}`;
      return {
        id: capability.id,
        displayName: capability.displayName,
        scopeTag: capability.scopeTag,
        flagName,
        flagEnabled: flagManager.isEnabled(flagName),
        description: capability.description,
        dependencies: capability.dependencies,
        entryPoints: capability.entryPoints
      };
    });
    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    // Text output
    console.log('\n=== Registered Capabilities ===\n');
    
    // Group by scope
    const p0Caps = capabilities.filter(c => c.scopeTag === 'p0');
    const p1Caps = capabilities.filter(c => c.scopeTag === 'p1');
    const p2Caps = capabilities.filter(c => c.scopeTag === 'p2');
    
    if (p0Caps.length > 0) {
      console.log('P0 Capabilities:');
      for (const capability of p0Caps) {
        const flagName = `enable_${capability.id}`;
        const flagEnabled = flagManager.isEnabled(flagName);
        console.log(`  ${capability.id} [${flagEnabled ? '✓ enabled' : '✗ disabled'}]`);
        if (capability.description) {
          console.log(`    ${capability.description}`);
        }
      }
      console.log('');
    }
    
    if (p1Caps.length > 0) {
      console.log('P1 Capabilities:');
      for (const capability of p1Caps) {
        const flagName = `enable_${capability.id}`;
        const flagEnabled = flagManager.isEnabled(flagName);
        console.log(`  ${capability.id} [${flagEnabled ? '✓ enabled' : '✗ disabled'}]`);
        if (capability.description) {
          console.log(`    ${capability.description}`);
        }
      }
      console.log('');
    }
    
    if (p2Caps.length > 0) {
      console.log('P2 Capabilities:');
      for (const capability of p2Caps) {
        const flagName = `enable_${capability.id}`;
        const flagEnabled = flagManager.isEnabled(flagName);
        console.log(`  ${capability.id} [${flagEnabled ? '✓ enabled' : '✗ disabled'}]`);
        if (capability.description) {
          console.log(`    ${capability.description}`);
        }
      }
      console.log('');
    }
    
    // Summary
    const enabledCount = capabilities.filter(c => flagManager.isEnabled(`enable_${c.id}`)).length;
    console.log(`Summary: ${capabilities.length} capabilities (${enabledCount} enabled, ${capabilities.length - enabledCount} disabled)`);
  }
}

// Run the CLI
main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});