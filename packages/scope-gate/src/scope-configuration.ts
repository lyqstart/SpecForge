/**
 * Scope Configuration Module
 * 
 * Provides configuration loading and management for the Scope Gate module.
 * Supports loading from configuration files, environment variables, and feature flag synchronization.
 */

import { promises as fs } from 'fs';
import * as crypto from 'crypto';
import type { 
  ScopeConfiguration, 
  ScopeContext,
  FeatureFlagChange
} from './types.js';

/**
 * Configuration loader options
 */
export interface ConfigLoaderOptions {
  /** Path to configuration file */
  configPath?: string;
  
  /** Override default context */
  defaultContext?: Partial<ScopeContext>;
  
  /** Feature flag sync interval in ms */
  syncIntervalMs?: number;
  
  /** Function to fetch feature flags from external source */
  featureFlagFetcher?: (() => Promise<Record<string, boolean>>) | undefined;
}

/**
 * Environment-specific defaults for each environment type
 */
const ENVIRONMENT_DEFAULTS: ScopeConfiguration['environmentDefaults'] = {
  production: {
    enforcementMode: "strict",
    allowP1: false,
    allowP2: false,
    defaultFeatureFlags: {}
  },
  staging: {
    enforcementMode: "warning",
    allowP1: false,
    allowP2: false,
    defaultFeatureFlags: {}
  },
  development: {
    enforcementMode: "warning",
    allowP1: true,
    allowP2: true,
    defaultFeatureFlags: {}
  },
  test: {
    enforcementMode: "disabled",
    allowP1: true,
    allowP2: true,
    defaultFeatureFlags: {}
  }
};

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: ScopeConfiguration = {
  schema_version: "1.0",
  enforcementMode: "strict",
  defaultContext: {
    releaseBranch: "v6.0",
    environment: "production"
  },
  environmentDefaults: ENVIRONMENT_DEFAULTS,
  featureFlags: {},
  overrides: []
};

/**
 * Environment variable prefix for feature flags
 */
const FEATURE_FLAG_PREFIX = "SCOPEGATE_FLAG_";

/**
 * ScopeConfigurationLoader
 * 
 * Loads and manages scope configuration from various sources:
 * - Configuration file (JSON)
 * - Environment variables
 * - External feature flag service
 */
export class ScopeConfigurationLoader {
  private config: ScopeConfiguration;
  private configPath: string | null;
  private syncIntervalMs: number;
  private featureFlagFetcher: (() => Promise<Record<string, boolean>>) | undefined;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private featureFlagListeners: Set<(flags: Record<string, boolean>) => void> = new Set();
  private cachedFeatureFlags: Record<string, boolean> = {};

  constructor(options: ConfigLoaderOptions = {}) {
    // Deep clone the default config to avoid sharing state between instances
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    this.configPath = options.configPath ?? null;
    this.syncIntervalMs = options.syncIntervalMs ?? 60000; // 1 minute default
    this.featureFlagFetcher = options.featureFlagFetcher;
    
    // Apply any context overrides from options
    if (options.defaultContext) {
      this.config.defaultContext = {
        ...this.config.defaultContext,
        ...options.defaultContext
      };
    }
  }

  /**
   * Load configuration from file and environment
   */
  async load(): Promise<ScopeConfiguration> {
    // Load from file if path provided
    if (this.configPath) {
      await this.loadFromFile(this.configPath);
    }
    
    // Override with environment variables
    this.loadFromEnvironment();
    
    // Fetch external feature flags if configured
    if (this.featureFlagFetcher) {
      await this.syncFeatureFlags();
    }
    
    return this.config;
  }

  /**
   * Load configuration from a JSON file
   */
  async loadFromFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      
      // Validate schema version
      if (!parsed.schema_version) {
        console.warn(`Configuration file ${filePath} missing schema_version, assuming 1.0`);
        parsed.schema_version = "1.0";
      }
      
      // Merge with default, preserving nested defaults
      this.config = this.mergeConfig(DEFAULT_CONFIG, parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.warn(`Configuration file not found: ${filePath}, using defaults`);
      } else {
        throw new Error(`Failed to load configuration from ${filePath}: ${error}`);
      }
    }
  }

  /**
   * Load configuration from environment variables
   */
  private loadFromEnvironment(): void {
    // Load enforcement mode
    const enforcementMode = process.env['SCOPEGATE_ENFORCEMENT_MODE'];
    if (enforcementMode && ['strict', 'warning', 'disabled'].includes(enforcementMode)) {
      this.config.enforcementMode = enforcementMode as "strict" | "warning" | "disabled";
    }

    // Load default release branch
    const releaseBranch = process.env['SCOPEGATE_RELEASE_BRANCH'];
    if (releaseBranch && ['v6.0', 'v6.1', 'v6.x', 'development'].includes(releaseBranch)) {
      this.config.defaultContext.releaseBranch = releaseBranch as ScopeContext['releaseBranch'];
    }

    // Load default environment
    const environment = process.env['SCOPEGATE_ENVIRONMENT'];
    if (environment && ['production', 'staging', 'development', 'test'].includes(environment)) {
      this.config.defaultContext.environment = environment as ScopeContext['environment'];
    }

    // Load feature flags from environment
    this.loadFeatureFlagsFromEnvironment();
  }

  /**
   * Load feature flags from environment variables
   * Format: SCOPEGATE_FLAG_<FLAG_NAME>=true|false
   */
  private loadFeatureFlagsFromEnvironment(): void {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(FEATURE_FLAG_PREFIX)) {
        const flagName = key.substring(FEATURE_FLAG_PREFIX.length).toLowerCase();
        const flagValue = value === 'true' || value === '1';
        
        // Add to feature flags if not already defined
        if (!this.config.featureFlags[flagName]) {
          this.config.featureFlags[flagName] = {
            description: `Feature flag from environment: ${key}`,
            default: flagValue,
            capabilities: [],
            environments: ['production', 'staging', 'development', 'test']
          };
        }
        
        // Store in cached flags for quick lookup
        this.cachedFeatureFlags[flagName] = flagValue;
      }
    }
  }

  /**
   * Merge two configurations, preserving defaults for missing values
   */
  private mergeConfig(defaultConfig: ScopeConfiguration, userConfig: Partial<ScopeConfiguration>): ScopeConfiguration {
    const result: ScopeConfiguration = { ...defaultConfig };
    
    // Merge top-level fields
    if (userConfig.schema_version) result.schema_version = userConfig.schema_version;
    if (userConfig.enforcementMode) result.enforcementMode = userConfig.enforcementMode;
    if (userConfig.defaultContext) {
      result.defaultContext = {
        ...defaultConfig.defaultContext,
        ...userConfig.defaultContext
      };
    }
    
    // Merge environment defaults
    if (userConfig.environmentDefaults) {
      result.environmentDefaults = {
        ...defaultConfig.environmentDefaults,
        ...userConfig.environmentDefaults
      };
    }
    
    // Merge feature flags
    if (userConfig.featureFlags) {
      for (const [key, value] of Object.entries(userConfig.featureFlags)) {
        result.featureFlags[key] = {
          ...defaultConfig.featureFlags[key],
          ...value
        };
      }
    }
    
    // Merge overrides
    if (userConfig.overrides) {
      result.overrides = [...defaultConfig.overrides, ...userConfig.overrides];
    }
    
    return result;
  }

  /**
   * Get environment-specific defaults
   */
  getEnvironmentDefaults(env: ScopeContext['environment']) {
    return this.config.environmentDefaults[env];
  }

  /**
   * Check if P1 capabilities are allowed in current environment
   */
  isP1Allowed(): boolean {
    const envDefaults = this.config.environmentDefaults[this.config.defaultContext.environment];
    return envDefaults?.allowP1 ?? false;
  }

  /**
   * Check if P2 capabilities are allowed in current environment
   */
  isP2Allowed(): boolean {
    const envDefaults = this.config.environmentDefaults[this.config.defaultContext.environment];
    return envDefaults?.allowP2 ?? false;
  }

  /**
   * Check if a capability with given scope tag is allowed in current environment
   */
  isScopeTagAllowed(scopeTag: "p0" | "p1" | "p2"): boolean {
    if (scopeTag === "p0") return true;
    if (scopeTag === "p1") return this.isP1Allowed();
    if (scopeTag === "p2") return this.isP2Allowed();
    return false;
  }

  /**
   * Get effective enforcement mode for current environment
   */
  getEffectiveEnforcementMode(): "strict" | "warning" | "disabled" {
    // Check environment-specific defaults first
    const envDefaults = this.config.environmentDefaults[this.config.defaultContext.environment];
    return envDefaults?.enforcementMode ?? this.config.enforcementMode;
  }

  /**
   * Apply environment-specific defaults to configuration
   */
  applyEnvironmentDefaults(environment: ScopeContext['environment']): void {
    const envDefaults = this.config.environmentDefaults[environment];
    if (!envDefaults) {
      console.warn(`No defaults defined for environment: ${environment}`);
      return;
    }

    // Apply enforcement mode from environment defaults
    this.config.enforcementMode = envDefaults.enforcementMode;
    
    // Apply default feature flags for this environment
    for (const [flag, value] of Object.entries(envDefaults.defaultFeatureFlags)) {
      if (!(flag in this.cachedFeatureFlags)) {
        this.cachedFeatureFlags[flag] = value;
      }
    }

    // Update default environment
    this.config.defaultContext.environment = environment;
  }

  /**
   * Get default feature flags for an environment
   */
  getDefaultFeatureFlagsForEnvironment(env: ScopeContext['environment']): Record<string, boolean> {
    const envDefaults = this.config.environmentDefaults[env];
    return envDefaults?.defaultFeatureFlags ?? {};
  }

  /**
   * Update environment-specific defaults
   */
  setEnvironmentDefaults(
    env: ScopeContext['environment'], 
    defaults: Partial<ScopeConfiguration['environmentDefaults'][ScopeContext['environment']]>
  ): void {
    this.config.environmentDefaults[env] = {
      ...this.config.environmentDefaults[env],
      ...defaults
    };
  }

  /**
   * Check if a capability with given scope tag is allowed in a specific environment
   */
  isScopeTagAllowedInEnvironment(scopeTag: "p0" | "p1" | "p2", env: ScopeContext['environment']): boolean {
    if (scopeTag === "p0") return true;
    
    const envDefaults = this.config.environmentDefaults[env];
    if (!envDefaults) return false;
    
    if (scopeTag === "p1") return envDefaults.allowP1;
    if (scopeTag === "p2") return envDefaults.allowP2;
    return false;
  }

  /**
   * Get the current configuration
   */
  getConfig(): ScopeConfiguration {
    return { ...this.config };
  }

  /**
   * Get the default scope context
   */
  getDefaultContext(): ScopeContext {
    return {
      releaseBranch: this.config.defaultContext.releaseBranch,
      featureFlags: new Set(Object.keys(this.cachedFeatureFlags).filter(k => this.cachedFeatureFlags[k])),
      environment: this.config.defaultContext.environment
    };
  }

  /**
   * Get enforcement mode
   */
  getEnforcementMode(): "strict" | "warning" | "disabled" {
    return this.config.enforcementMode;
  }

  /**
   * Check if a feature flag is enabled
   */
  isFeatureFlagEnabled(flagName: string): boolean {
    // Check cached flags first
    if (flagName in this.cachedFeatureFlags) {
      return this.cachedFeatureFlags[flagName];
    }
    
    // Check config defaults
    const flagConfig = this.config.featureFlags[flagName];
    if (flagConfig) {
      return flagConfig.default;
    }
    
    return false;
  }

  /**
   * Get all enabled feature flags
   */
  getEnabledFeatureFlags(): string[] {
    return Object.keys(this.cachedFeatureFlags).filter(k => this.cachedFeatureFlags[k]);
  }

  /**
   * Get feature flag configuration
   */
  getFeatureFlagConfig(flagName: string): ScopeConfiguration['featureFlags'][string] | undefined {
    return this.config.featureFlags[flagName];
  }

  /**
   * Enable or disable a feature flag (runtime)
   */
  setFeatureFlag(flagName: string, enabled: boolean, reason?: string): FeatureFlagChange {
    const oldValue = this.isFeatureFlagEnabled(flagName);
    this.cachedFeatureFlags[flagName] = enabled;
    
    // Also update the config if it exists
    if (this.config.featureFlags[flagName]) {
      this.config.featureFlags[flagName].default = enabled;
    } else {
      // Create new feature flag entry
      this.config.featureFlags[flagName] = {
        description: reason ?? `Runtime feature flag: ${flagName}`,
        default: enabled,
        capabilities: [],
        environments: ['production', 'staging', 'development', 'test']
      };
    }
    
    const change: FeatureFlagChange = {
      flag: flagName,
      oldValue,
      newValue: enabled,
      reason: reason ?? `Runtime change`,
      timestamp: new Date()
    };
    
    // Notify listeners
    this.notifyFeatureFlagChange(change);
    
    return change;
  }

  /**
   * Check if a capability is available (considering overrides)
   */
  isCapabilityAvailable(capabilityId: string): boolean {
    // Check overrides first
    for (const override of this.config.overrides) {
      if (override.capabilityId === capabilityId) {
        // Check if override has expired
        if (override.expiresAt && new Date() > override.expiresAt) {
          continue; // Override expired, skip
        }
        return override.available;
      }
    }
    
    return true; // Default to available if no override
  }

  /**
   * Add a capability override
   */
  addOverride(
    capabilityId: string, 
    available: boolean, 
    reason: string, 
    expiresAt?: Date
  ): void {
    // Remove existing override for same capability
    this.config.overrides = this.config.overrides.filter(o => o.capabilityId !== capabilityId);
    
    // Add new override
    this.config.overrides.push({
      capabilityId,
      available,
      reason,
      expiresAt
    });
  }

  /**
   * Remove a capability override
   */
  removeOverride(capabilityId: string): boolean {
    const initialLength = this.config.overrides.length;
    this.config.overrides = this.config.overrides.filter(o => o.capabilityId !== capabilityId);
    return this.config.overrides.length < initialLength;
  }

  /**
   * Get all capability overrides
   */
  getOverrides(): ScopeConfiguration['overrides'] {
    return [...this.config.overrides];
  }

  /**
   * Start automatic feature flag synchronization
   */
  startFeatureFlagSync(): void {
    if (!this.featureFlagFetcher || this.syncTimer) {
      return; // Already running or no fetcher
    }

    this.syncTimer = setInterval(async () => {
      try {
        await this.syncFeatureFlags();
      } catch (error) {
        console.error('Feature flag sync failed:', error);
      }
    }, this.syncIntervalMs);
  }

  /**
   * Stop automatic feature flag synchronization
   */
  stopFeatureFlagSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Synchronize feature flags from external source
   */
  async syncFeatureFlags(): Promise<Record<string, boolean>> {
    if (!this.featureFlagFetcher) {
      return this.cachedFeatureFlags;
    }

    try {
      const externalFlags = await this.featureFlagFetcher();
      const changes: FeatureFlagChange[] = [];

      // Check for changes
      for (const [flag, value] of Object.entries(externalFlags)) {
        const oldValue = this.cachedFeatureFlags[flag];
        if (oldValue !== value) {
          changes.push({
            flag,
            oldValue: oldValue ?? false,
            newValue: value,
            reason: 'External sync',
            timestamp: new Date()
          });
        }
        this.cachedFeatureFlags[flag] = value;
      }

      // Notify listeners of all changes
      for (const change of changes) {
        this.notifyFeatureFlagChange(change);
      }

      return this.cachedFeatureFlags;
    } catch (error) {
      console.error('Failed to sync feature flags:', error);
      return this.cachedFeatureFlags;
    }
  }

  /**
   * Register a listener for feature flag changes
   */
  onFeatureFlagChange(listener: (flags: Record<string, boolean>) => void): () => void {
    this.featureFlagListeners.add(listener);
    return () => this.featureFlagListeners.delete(listener);
  }

  /**
   * Notify all listeners of feature flag changes
   */
  private notifyFeatureFlagChange(_change: FeatureFlagChange): void {
    // Convert Set to object for notification
    const flags = { ...this.cachedFeatureFlags };
    for (const listener of this.featureFlagListeners) {
      try {
        listener(flags);
      } catch (error) {
        console.error('Feature flag listener error:', error);
      }
    }
  }

  /**
   * Create a scope context from current configuration
   */
  createScopeContext(overrides?: Partial<ScopeContext>): ScopeContext {
    return {
      releaseBranch: overrides?.releaseBranch ?? this.config.defaultContext.releaseBranch,
      featureFlags: new Set(overrides?.featureFlags 
        ? Array.from(overrides.featureFlags) 
        : this.getEnabledFeatureFlags()),
      environment: overrides?.environment ?? this.config.defaultContext.environment
    };
  }

  /**
   * Validate configuration
   */
  validate(): string[] {
    const errors: string[] = [];

    // Validate schema version
    if (!this.config.schema_version) {
      errors.push('Missing schema_version');
    }

    // Validate enforcement mode
    if (!['strict', 'warning', 'disabled'].includes(this.config.enforcementMode)) {
      errors.push(`Invalid enforcement mode: ${this.config.enforcementMode}`);
    }

    // Validate default context
    if (!['v6.0', 'v6.1', 'v6.x', 'development'].includes(this.config.defaultContext.releaseBranch)) {
      errors.push(`Invalid release branch: ${this.config.defaultContext.releaseBranch}`);
    }

    if (!['production', 'staging', 'development', 'test'].includes(this.config.defaultContext.environment)) {
      errors.push(`Invalid environment: ${this.config.defaultContext.environment}`);
    }

    // Validate environment defaults
    const validEnvironments = ['production', 'staging', 'development', 'test'] as const;
    for (const env of validEnvironments) {
      const envDefaults = this.config.environmentDefaults[env];
      if (!envDefaults) {
        errors.push(`Missing environment defaults for: ${env}`);
        continue;
      }
      if (!['strict', 'warning', 'disabled'].includes(envDefaults.enforcementMode)) {
        errors.push(`Invalid enforcement mode for ${env}: ${envDefaults.enforcementMode}`);
      }
      if (typeof envDefaults.allowP1 !== 'boolean') {
        errors.push(`Invalid allowP1 for ${env}: expected boolean`);
      }
      if (typeof envDefaults.allowP2 !== 'boolean') {
        errors.push(`Invalid allowP2 for ${env}: expected boolean`);
      }
    }

    // Validate feature flags
    for (const [name, config] of Object.entries(this.config.featureFlags)) {
      if (config.environments && !config.environments.every(e => 
        ['production', 'staging', 'development', 'test'].includes(e)
      )) {
        errors.push(`Invalid environments for flag ${name}`);
      }
    }

    // Validate overrides
    for (const override of this.config.overrides) {
      if (!override.capabilityId) {
        errors.push('Override missing capabilityId');
      }
      if (override.expiresAt && new Date(override.expiresAt) < new Date()) {
        errors.push(`Override for ${override.capabilityId} has expired`);
      }
    }

    return errors;
  }

  /**
   * Generate configuration hash for change detection
   */
  getConfigHash(): string {
    const configString = JSON.stringify(this.config);
    return crypto.createHash('sha256').update(configString).digest('hex').substring(0, 8);
  }

  /**
   * Save configuration to file
   */
  async saveToFile(filePath: string): Promise<void> {
    const content = JSON.stringify(this.config, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stopFeatureFlagSync();
    this.featureFlagListeners.clear();
  }
}

/**
 * Create a configuration loader with default settings
 */
export function createDefaultConfigLoader(): ScopeConfigurationLoader {
  return new ScopeConfigurationLoader();
}

/**
 * Create a configuration loader from file
 */
export async function loadConfigFromFile(filePath: string): Promise<ScopeConfigurationLoader> {
  const loader = new ScopeConfigurationLoader({ configPath: filePath });
  await loader.load();
  return loader;
}

/**
 * Create a configuration loader with environment variable support
 */
export function createConfigLoader(options: ConfigLoaderOptions = {}): ScopeConfigurationLoader {
  return new ScopeConfigurationLoader(options);
}

// Re-export types for convenience
export type { ScopeConfiguration, ScopeContext, FeatureFlagChange };