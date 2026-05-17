/**
 * feature-flag CLI Tool
 * 
 * Manages feature flags for the Scope Gate module.
 * Supports enabling/disabling flags, batch operations, viewing status, and persistence.
 * 
 * Usage:
 *   # View all flags
 *   bun run packages/scope-gate/bin/feature-flag.ts list
 *   
 *   # Enable a flag
 *   bun run packages/scope-gate/bin/feature-flag.ts enable <flag-name>
 *   
 *   # Disable a flag
 *   bun run packages/scope-gate/bin/feature-flag.ts disable <flag-name>
 *   
 *   # Batch enable/disable by scope
 *   bun run packages/scope-gate/bin/feature-flag.ts enable --scope p1
 *   bun run packages/scope-gate/bin/feature-flag.ts disable --scope p2
 *   
 *   # Save/load configuration
 *   bun run packages/scope-gate/bin/feature-flag.ts save
 *   bun run packages/scope-gate/bin/feature-flag.ts load
 *   
 *   # View history
 *   bun run packages/scope-gate/bin/feature-flag.ts history
 */

import { resolve } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { ScopeRegistry } from '../src/scope-registry.js';
import { FeatureFlagManager, type FeatureFlag, type FeatureFlagChangeLog } from '../src/feature-flag-manager.js';
import { Req25Loader } from '../src/req25-loader.js';
import type { ScopeTag, ScopeContext, CapabilityDefinition } from '../src/types.js';

/**
 * CLI command type
 */
type Command = 'list' | 'enable' | 'disable' | 'toggle' | 'save' | 'load' | 'history' | 'reset' | 'stats' | 'register';

/**
 * Parse command line arguments
 */
function parseArgs(): {
  command: Command;
  flagName: string | null;
  scope: ScopeTag | null;
  output: 'text' | 'json';
  configPath: string | null;
  reason: string | null;
  userId: string | null;
  help: boolean;
  verbose: boolean;
} {
  const args = process.argv.slice(2);
  let command: Command = 'list';
  let flagName: string | null = null;
  let scope: ScopeTag | null = null;
  let output: 'text' | 'json' = 'text';
  let configPath: string | null = null;
  let reason: string | null = null;
  let userId: string | null = null;
  let help = false;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--output' || arg === '-o') {
      const value = args[++i]?.toLowerCase();
      if (value === 'json') {
        output = 'json';
      }
    } else if (arg === '--scope' || arg === '-s') {
      const value = args[++i]?.toLowerCase();
      if (value === 'p0' || value === 'p1' || value === 'p2') {
        scope = value as ScopeTag;
      }
    } else if (arg === '--config' || arg === '-c') {
      configPath = args[++i] || null;
    } else if (arg === '--reason' || arg === '-r') {
      reason = args[++i] || null;
    } else if (arg === '--user' || arg === '-u') {
      userId = args[++i] || null;
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (!arg.startsWith('-')) {
      // Command or flag name
      if (arg === 'list' || arg === 'enable' || arg === 'disable' || arg === 'toggle' ||
          arg === 'save' || arg === 'load' || arg === 'history' || arg === 'reset' || 
          arg === 'stats' || arg === 'register') {
        command = arg as Command;
      } else {
        // Assume it's a flag name
        flagName = arg;
      }
    }
  }

  return { command, flagName, scope, output, configPath, reason, userId, help, verbose };
}

/**
 * Print usage information
 */
function printHelp(): void {
  console.log(`
feature-flag - Manage feature flags for Scope Gate

Usage:
  bun run packages/scope-gate/bin/feature-flag.ts <command> [options]

Commands:
  list                    List all feature flags and their status
  enable <flag-name>      Enable a specific feature flag
  disable <flag-name>     Disable a specific feature flag
  toggle <flag-name>      Toggle a feature flag on/off
  save [path]             Save current flags to a config file
  load [path]             Load flags from a config file
  history                 Show flag change history
  reset                   Reset all flags to default state
  stats                   Show flag statistics
  register <cap-id>       Register a capability with its scope tag

Options:
  --scope, -s <scope>     Scope tag: p0, p1, or p2 (for batch operations)
  --output, -o <format>   Output format: text or json (default: text)
  --config, -c <path>     Path to config file for save/load
  --reason, -r <reason>   Reason for the change
  --user, -u <userId>     User performing the action
  --verbose, -v           Show detailed information
  --help, -h              Show this help message

Examples:
  # List all flags
  bun run packages/scope-gate/bin/feature-flag.ts list
  
  # List flags as JSON
  bun run packages/scope-gate/bin/feature-flag.ts list --output json
  
  # Enable a specific flag
  bun run packages/scope-gate/bin/feature-flag.ts enable enable_workflow_runtime
  
  # Enable all P1 capabilities
  bun run packages/scope-gate/bin/feature-flag.ts enable --scope p1
  
  # Disable all P2 capabilities
  bun run packages/scope-gate/bin/feature-flag.ts disable --scope p2
  
  # Toggle a flag
  bun run packages/scope-gate/bin/feature-flag.ts toggle enable_all_p1p2
  
  # Save flags to file
  bun run packages/scope-gate/bin/feature-flag.ts save --config ./feature-flags.json
  
  # Load flags from file
  bun run packages/scope-gate/bin/feature-flag.ts load --config ./feature-flags.json
  
  # View change history
  bun run packages/scope-gate/bin/feature-flag.ts history
  
  # View statistics
  bun run packages/scope-gate/bin/feature-flag.ts stats
  
  # Register a capability
  bun run packages/scope-gate/bin/feature-flag.ts register workflow_runtime --scope p1

Notes:
  - Flag names are case-insensitive (stored as lowercase)
  - Master flags: enable_all_p1p2, enable_all_p1, enable_all_p2
  - Per-capability: enable_<capabilityId>
  - Default config path: ./scope-gate-flags.json (in repo root)
`);
}

/**
 * Determine the default config path
 */
function getDefaultConfigPath(): string {
  const cwd = process.cwd();
  
  // Check if we're in scope-gate package
  if (cwd.includes('packages/scope-gate') || cwd.includes('packages\\scope-gate')) {
    return resolve(cwd, '..', '..', 'scope-gate-flags.json');
  }
  
  // Assume we're in repo root
  return resolve(cwd, 'scope-gate-flags.json');
}

/**
 * Load capabilities and initialize managers
 */
function initializeManagers(): {
  registry: ScopeRegistry;
  flagManager: FeatureFlagManager;
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
  
  return { registry, flagManager, capabilitiesLoaded };
}

/**
 * Format flag for display
 */
function formatFlag(flag: FeatureFlag, verbose: boolean): string {
  const status = flag.enabled ? '✓ enabled' : '✗ disabled';
  let result = `  ${flag.name}: ${status}`;
  
  if (verbose) {
    if (flag.scopeTag) {
      result += ` [${flag.scopeTag.toUpperCase()}]`;
    }
    if (flag.updatedBy) {
      result += ` (by ${flag.updatedBy})`;
    }
    if (flag.description) {
      result += `\n    Description: ${flag.description}`;
    }
    result += `\n    Updated: ${flag.updatedAt.toISOString()}`;
  }
  
  return result;
}

/**
 * Command: list - Show all feature flags
 */
function handleList(flagManager: FeatureFlagManager, scope: ScopeTag | null, output: 'text' | 'json', verbose: boolean): void {
  let flags = flagManager.getAll();
  
  // Filter by scope if specified
  if (scope) {
    flags = flags.filter(f => f.scopeTag === scope);
  }
  
  if (output === 'json') {
    console.log(JSON.stringify(flags, null, 2));
    return;
  }
  
  if (flags.length === 0) {
    console.log('No feature flags found.');
    return;
  }
  
  console.log('\n=== Feature Flags ===\n');
  
  // Group by scope
  const p0Flags = flags.filter(f => f.scopeTag === 'p0');
  const p1Flags = flags.filter(f => f.scopeTag === 'p1');
  const p2Flags = flags.filter(f => f.scopeTag === 'p2');
  const masterFlags = flags.filter(f => f.name.startsWith('enable_all_'));
  const otherFlags = flags.filter(f => !f.scopeTag && !f.name.startsWith('enable_all_'));
  
  if (masterFlags.length > 0) {
    console.log('Master Flags:');
    for (const flag of masterFlags) {
      console.log(formatFlag(flag, verbose));
    }
    console.log('');
  }
  
  if (p0Flags.length > 0) {
    console.log('P0 Flags:');
    for (const flag of p0Flags) {
      console.log(formatFlag(flag, verbose));
    }
    console.log('');
  }
  
  if (p1Flags.length > 0) {
    console.log('P1 Flags:');
    for (const flag of p1Flags) {
      console.log(formatFlag(flag, verbose));
    }
    console.log('');
  }
  
  if (p2Flags.length > 0) {
    console.log('P2 Flags:');
    for (const flag of p2Flags) {
      console.log(formatFlag(flag, verbose));
    }
    console.log('');
  }
  
  if (otherFlags.length > 0) {
    console.log('Other Flags:');
    for (const flag of otherFlags) {
      console.log(formatFlag(flag, verbose));
    }
    console.log('');
  }
  
  // Summary
  const enabled = flags.filter(f => f.enabled).length;
  console.log(`Summary: ${flags.length} flags (${enabled} enabled, ${flags.length - enabled} disabled)`);
}

/**
 * Command: enable - Enable a feature flag
 */
function handleEnable(
  flagManager: FeatureFlagManager,
  flagName: string | null,
  scope: ScopeTag | null,
  reason: string | null,
  userId: string | null,
  output: 'text' | 'json'
): void {
  if (!flagName && !scope) {
    console.error('Error: Please specify a flag name or use --scope for batch operation');
    process.exit(1);
  }
  
  let count = 0;
  
  if (scope) {
    // Batch enable by scope
    count = flagManager.enableByScope(scope, reason ?? `Batch enable via CLI`, userId ?? 'cli-user');
  } else if (flagName) {
    // Enable single flag
    const success = flagManager.enable(flagName, reason ?? `Enabled via CLI`, userId ?? 'cli-user');
    if (success) {
      count = 1;
    } else {
      console.error(`Error: Failed to enable flag '${flagName}'`);
      process.exit(1);
    }
  }
  
  if (output === 'json') {
    console.log(JSON.stringify({ success: true, count, flagName, scope, action: 'enable' }, null, 2));
  } else {
    console.log(`✓ Enabled ${count} flag(s)`);
  }
}

/**
 * Command: disable - Disable a feature flag
 */
function handleDisable(
  flagManager: FeatureFlagManager,
  flagName: string | null,
  scope: ScopeTag | null,
  reason: string | null,
  userId: string | null,
  output: 'text' | 'json'
): void {
  if (!flagName && !scope) {
    console.error('Error: Please specify a flag name or use --scope for batch operation');
    process.exit(1);
  }
  
  let count = 0;
  
  if (scope) {
    // Batch disable by scope
    count = flagManager.disableByScope(scope, reason ?? `Batch disable via CLI`, userId ?? 'cli-user');
  } else if (flagName) {
    // Disable single flag
    const success = flagManager.disable(flagName, reason ?? `Disabled via CLI`, userId ?? 'cli-user');
    if (success) {
      count = 1;
    } else {
      console.error(`Error: Failed to disable flag '${flagName}'`);
      process.exit(1);
    }
  }
  
  if (output === 'json') {
    console.log(JSON.stringify({ success: true, count, flagName, scope, action: 'disable' }, null, 2));
  } else {
    console.log(`✓ Disabled ${count} flag(s)`);
  }
}

/**
 * Command: toggle - Toggle a feature flag
 */
function handleToggle(
  flagManager: FeatureFlagManager,
  flagName: string,
  reason: string | null,
  userId: string | null,
  output: 'text' | 'json'
): void {
  const currentState = flagManager.isEnabled(flagName);
  const newState = !currentState;
  
  if (newState) {
    flagManager.enable(flagName, reason ?? `Toggled via CLI`, userId ?? 'cli-user');
  } else {
    flagManager.disable(flagName, reason ?? `Toggled via CLI`, userId ?? 'cli-user');
  }
  
  if (output === 'json') {
    console.log(JSON.stringify({ 
      success: true, 
      flagName, 
      previousState: currentState, 
      newState: newState,
      action: 'toggle' 
    }, null, 2));
  } else {
    console.log(`✓ Toggled '${flagName}': ${currentState ? 'enabled' : 'disabled'} → ${newState ? 'enabled' : 'disabled'}`);
  }
}

/**
 * Command: save - Save flags to file
 */
function handleSave(
  flagManager: FeatureFlagManager,
  configPath: string | null,
  output: 'text' | 'json'
): void {
  const flags = flagManager.export();
  const history = flagManager.getHistory();
  
  const data = {
    schema_version: '1.0',
    savedAt: new Date().toISOString(),
    flags,
    historyCount: history.length,
    // Only save last 100 history entries
    recentHistory: history.slice(-100).map(h => ({
      flag: h.flag,
      oldValue: h.oldValue,
      newValue: h.newValue,
      reason: h.reason,
      userId: h.userId,
      source: h.source,
      timestamp: h.timestamp.toISOString()
    }))
  };
  
  const savePath = configPath ?? getDefaultConfigPath();
  
  // Ensure directory exists
  const dir = resolve(savePath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  writeFileSync(savePath, JSON.stringify(data, null, 2));
  
  if (output === 'json') {
    console.log(JSON.stringify({ success: true, path: savePath, flagsCount: Object.keys(flags).length }, null, 2));
  } else {
    console.log(`✓ Saved ${Object.keys(flags).length} flags to ${savePath}`);
  }
}

/**
 * Command: load - Load flags from file
 */
function handleLoad(
  flagManager: FeatureFlagManager,
  configPath: string | null,
  reason: string | null,
  userId: string | null,
  output: 'text' | 'json'
): void {
  const loadPath = configPath ?? getDefaultConfigPath();
  
  if (!existsSync(loadPath)) {
    console.error(`Error: Config file not found: ${loadPath}`);
    process.exit(1);
  }
  
  try {
    const content = readFileSync(loadPath, 'utf-8');
    const data = JSON.parse(content);
    
    if (!data.flags) {
      console.error('Error: Invalid config file - missing flags');
      process.exit(1);
    }
    
    flagManager.import(data.flags, reason ?? `Loaded from ${loadPath}`, userId ?? 'cli-user');
    
    if (output === 'json') {
      console.log(JSON.stringify({ 
        success: true, 
        path: loadPath, 
        flagsLoaded: Object.keys(data.flags).length 
      }, null, 2));
    } else {
      console.log(`✓ Loaded ${Object.keys(data.flags).length} flags from ${loadPath}`);
    }
  } catch (error) {
    console.error(`Error: Failed to load config: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

/**
 * Command: history - Show flag change history
 */
function handleHistory(flagManager: FeatureFlagManager, output: 'text' | 'json'): void {
  const history = flagManager.getHistory();
  
  if (output === 'json') {
    console.log(JSON.stringify(history, null, 2));
    return;
  }
  
  if (history.length === 0) {
    console.log('No change history.');
    return;
  }
  
  console.log('\n=== Feature Flag Change History ===\n');
  
  // Show most recent first
  const reversed = [...history].reverse();
  
  for (const entry of reversed) {
    const change = entry.oldValue ? '→ disabled' : '→ enabled';
    console.log(`${entry.flag}: ${entry.oldValue} ${change}`);
    console.log(`  Reason: ${entry.reason}`);
    if (entry.userId) {
      console.log(`  User: ${entry.userId}`);
    }
    console.log(`  Time: ${entry.timestamp.toISOString()}`);
    console.log('');
  }
  
  console.log(`Total: ${history.length} changes`);
}

/**
 * Command: reset - Reset all flags
 */
function handleReset(
  flagManager: FeatureFlagManager,
  reason: string | null,
  userId: string | null,
  output: 'text' | 'json'
): void {
  flagManager.reset(reason ?? `Reset via CLI`, userId ?? 'cli-user');
  
  if (output === 'json') {
    console.log(JSON.stringify({ success: true, action: 'reset' }, null, 2));
  } else {
    console.log('✓ All flags reset to default state');
  }
}

/**
 * Command: stats - Show flag statistics
 */
function handleStats(flagManager: FeatureFlagManager, output: 'text' | 'json'): void {
  const stats = flagManager.getStats();
  
  if (output === 'json') {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }
  
  console.log('\n=== Feature Flag Statistics ===\n');
  console.log(`Total Flags:    ${stats.total}`);
  console.log(`Enabled:        ${stats.enabled}`);
  console.log(`Disabled:       ${stats.disabled}`);
  console.log(`P1 Flags:       ${stats.p1Count}`);
  console.log(`P2 Flags:       ${stats.p2Count}`);
  console.log(`History Size:   ${stats.historySize}`);
}

/**
 * Command: register - Register a capability
 */
function handleRegister(
  flagManager: FeatureFlagManager,
  capabilityId: string,
  scope: ScopeTag | null,
  output: 'text' | 'json'
): void {
  if (!scope) {
    console.error('Error: Please specify --scope p0, p1, or p2');
    process.exit(1);
  }
  
  flagManager.registerCapability(capabilityId, scope);
  
  if (output === 'json') {
    console.log(JSON.stringify({ 
      success: true, 
      capabilityId, 
      scopeTag: scope,
      action: 'register' 
    }, null, 2));
  } else {
    console.log(`✓ Registered capability '${capabilityId}' with scope '${scope}'`);
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const { command, flagName, scope, output, configPath, reason, userId, help, verbose } = parseArgs();

  if (help) {
    printHelp();
    return;
  }

  // Initialize managers
  const { flagManager } = initializeManagers();

  // Route to command handler
  switch (command) {
    case 'list':
      handleList(flagManager, scope, output, verbose);
      break;
      
    case 'enable':
      handleEnable(flagManager, flagName, scope, reason, userId, output);
      break;
      
    case 'disable':
      handleDisable(flagManager, flagName, scope, reason, userId, output);
      break;
      
    case 'toggle':
      if (!flagName) {
        console.error('Error: Please specify a flag name to toggle');
        process.exit(1);
      }
      handleToggle(flagManager, flagName, reason, userId, output);
      break;
      
    case 'save':
      handleSave(flagManager, configPath, output);
      break;
      
    case 'load':
      handleLoad(flagManager, configPath, reason, userId, output);
      break;
      
    case 'history':
      handleHistory(flagManager, output);
      break;
      
    case 'reset':
      handleReset(flagManager, reason, userId, output);
      break;
      
    case 'stats':
      handleStats(flagManager, output);
      break;
      
    case 'register':
      if (!flagName) {
        console.error('Error: Please specify a capability ID to register');
        process.exit(1);
      }
      handleRegister(flagManager, flagName, scope, output);
      break;
      
    default:
      console.error(`Error: Unknown command '${command}'`);
      printHelp();
      process.exit(1);
  }
}

// Run the CLI
main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});