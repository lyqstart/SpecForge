/**
 * OpenCode Adapter Configuration System
 *
 * Provides configuration loading from various sources:
 * - Default values
 * - Environment variables
 * - Config files
 *
 * Requirements: 2.1
 */

import type { AdapterConfig } from './types';

/**
 * Configuration source priority (lowest to highest)
 */
export const CONFIG_PRIORITY = {
  DEFAULT: 0,
  FILE: 1,
  ENVIRONMENT: 2,
  RUNTIME: 3,
} as const;

/**
 * Environment variable prefixes for configuration
 */
export const CONFIG_ENV_PREFIX = 'OPENCODE_ADAPTER_';

/**
 * Configuration loading options
 */
export interface LoadConfigOptions {
  /** Load from environment variables */
  useEnv?: boolean;
  /** Load from config file */
  useFile?: boolean;
  /** Config file path */
  configFilePath?: string;
  /** Runtime configuration (highest priority) */
  runtimeConfig?: Partial<AdapterConfig>;
  /** Schema version for validation */
  schemaVersion?: string;
}

/**
 * Loaded configuration result
 */
export interface LoadedConfig {
  config: AdapterConfig;
  sources: string[];
  schemaVersion: string;
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: AdapterConfig = {
  compatibleKernelRange: '>=1.0.0 <2.0.0',
  translationStrictness: 'lenient',
  communicationTimeout: 30000,
  verboseLogging: false,
  autoStartDaemon: true,
};

/**
 * Schema version for this configuration system
 */
export const CONFIG_SCHEMA_VERSION = '1.0';

/**
 * Load configuration from all sources
 *
 * Priority (lowest to highest):
 * 1. Default values
 * 2. Config file
 * 3. Environment variables
 * 4. Runtime config
 *
 * @param options - Configuration loading options
 * @returns Loaded configuration with metadata
 */
export function loadConfig(options: LoadConfigOptions = {}): LoadedConfig {
  const {
    useEnv = true,
    useFile = false,
    configFilePath = './opencode-adapter.config.json',
    runtimeConfig = {},
    schemaVersion = CONFIG_SCHEMA_VERSION,
  } = options;

  const sources: string[] = [];
  const config: AdapterConfig = { ...DEFAULT_CONFIG };

  // 1. Load from file if enabled
  if (useFile) {
    try {
      const fileConfig = loadConfigFromFile(configFilePath);
      if (fileConfig) {
        Object.assign(config, fileConfig);
        sources.push(`file:${configFilePath}`);
      }
    } catch {
      // File not found or invalid, continue with defaults
    }
  }

  // 2. Load from environment variables if enabled
  if (useEnv) {
    const envConfig = loadConfigFromEnv();
    if (envConfig) {
      Object.assign(config, envConfig);
      sources.push('environment');
    }
  }

  // 3. Apply runtime configuration (highest priority)
  if (runtimeConfig && Object.keys(runtimeConfig).length > 0) {
    Object.assign(config, runtimeConfig);
    sources.push('runtime');
  }

  return {
    config,
    sources,
    schemaVersion,
  };
}

/**
 * Load configuration from environment variables
 */
function loadConfigFromEnv(): Partial<AdapterConfig> | null {
  const envConfig: Partial<AdapterConfig> = {};
  let hasConfig = false;

  // Compatible kernel range
  const kernelRange = process.env[`${CONFIG_ENV_PREFIX}COMPATIBLE_KERNEL_RANGE`];
  if (kernelRange) {
    envConfig.compatibleKernelRange = kernelRange;
    hasConfig = true;
  }

  // Translation strictness
  const strictness = process.env[`${CONFIG_ENV_PREFIX}TRANSLATION_STRICTNESS`];
  if (strictness === 'strict' || strictness === 'lenient') {
    envConfig.translationStrictness = strictness;
    hasConfig = true;
  }

  // Integration timeout (communicationTimeout)
  const timeout = process.env[`${CONFIG_ENV_PREFIX}INTEGRATION_TIMEOUT_MS`];
  if (timeout) {
    const parsed = parseInt(timeout, 10);
    if (!isNaN(parsed) && parsed > 0) {
      envConfig.communicationTimeout = parsed;
      hasConfig = true;
    }
  }

  // Verbose logging
  const verbose = process.env[`${CONFIG_ENV_PREFIX}VERBOSE_LOGGING`];
  if (verbose !== undefined) {
    envConfig.verboseLogging = verbose === 'true' || verbose === '1';
    hasConfig = true;
  }

  // Auto-start daemon
  const autoStart = process.env[`${CONFIG_ENV_PREFIX}AUTO_START_DAEMON`];
  if (autoStart !== undefined) {
    envConfig.autoStartDaemon = autoStart === 'true' || autoStart === '1';
    hasConfig = true;
  }

  // Thin Plugin endpoint
  const endpoint = process.env[`${CONFIG_ENV_PREFIX}THIN_PLUGIN_ENDPOINT`];
  if (endpoint) {
    envConfig.thinPluginEndpoint = endpoint;
    hasConfig = true;
  }

  return hasConfig ? envConfig : null;
}

/**
 * Load configuration from a JSON file
 */
function loadConfigFromFile(filePath: string): Partial<AdapterConfig> | null {
  try {
    // Dynamic import for ESM compatibility
    const path = require('path');
    const fs = require('fs');

    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
      return null;
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Validate and extract known fields
    const fileConfig: Partial<AdapterConfig> = {};

    if (parsed.compatibleKernelRange && typeof parsed.compatibleKernelRange === 'string') {
      fileConfig.compatibleKernelRange = parsed.compatibleKernelRange;
    }

    if (parsed.translationStrictness === 'strict' || parsed.translationStrictness === 'lenient') {
      fileConfig.translationStrictness = parsed.translationStrictness;
    }

    if (typeof parsed.communicationTimeout === 'number' && parsed.communicationTimeout > 0) {
      fileConfig.communicationTimeout = parsed.communicationTimeout;
    }

    if (typeof parsed.verboseLogging === 'boolean') {
      fileConfig.verboseLogging = parsed.verboseLogging;
    }

    if (typeof parsed.autoStartDaemon === 'boolean') {
      fileConfig.autoStartDaemon = parsed.autoStartDaemon;
    }

    if (parsed.thinPluginEndpoint && typeof parsed.thinPluginEndpoint === 'string') {
      fileConfig.thinPluginEndpoint = parsed.thinPluginEndpoint;
    }

    return fileConfig;
  } catch {
    return null;
  }
}

/**
 * Validate configuration
 */
export function validateConfig(config: Partial<AdapterConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate compatibleKernelRange
  if (config.compatibleKernelRange !== undefined) {
    if (typeof config.compatibleKernelRange !== 'string') {
      errors.push('compatibleKernelRange must be a string');
    } else if (config.compatibleKernelRange.trim().length === 0) {
      errors.push('compatibleKernelRange cannot be empty');
    }
  }

  // Validate translationStrictness
  if (config.translationStrictness !== undefined) {
    if (config.translationStrictness !== 'strict' && config.translationStrictness !== 'lenient') {
      errors.push('translationStrictness must be "strict" or "lenient"');
    }
  }

  // Validate communicationTimeout
  if (config.communicationTimeout !== undefined) {
    if (typeof config.communicationTimeout !== 'number') {
      errors.push('communicationTimeout must be a number');
    } else if (config.communicationTimeout <= 0) {
      errors.push('communicationTimeout must be greater than 0');
    } else if (config.communicationTimeout > 600000) {
      // Max 10 minutes
      errors.push('communicationTimeout must be less than or equal to 600000ms (10 minutes)');
    }
  }

  // Validate verboseLogging
  if (config.verboseLogging !== undefined && typeof config.verboseLogging !== 'boolean') {
    errors.push('verboseLogging must be a boolean');
  }

  // Validate autoStartDaemon
  if (config.autoStartDaemon !== undefined && typeof config.autoStartDaemon !== 'boolean') {
    errors.push('autoStartDaemon must be a boolean');
  }

  // Validate thinPluginEndpoint
  if (config.thinPluginEndpoint !== undefined) {
    if (typeof config.thinPluginEndpoint !== 'string') {
      errors.push('thinPluginEndpoint must be a string');
    } else if (config.thinPluginEndpoint.trim().length === 0) {
      errors.push('thinPluginEndpoint cannot be empty');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Merge multiple configurations
 * Later configs override earlier ones
 */
export function mergeConfigs(...configs: Partial<AdapterConfig>[]): AdapterConfig {
  const result: AdapterConfig = { ...DEFAULT_CONFIG };

  for (const config of configs) {
    if (config) {
      Object.assign(result, config);
    }
  }

  return result;
}

/**
 * Get environment variable name for a config key
 */
export function getEnvVarName(configKey: keyof AdapterConfig): string {
  const mapping: Record<keyof AdapterConfig, string> = {
    compatibleKernelRange: 'COMPATIBLE_KERNEL_RANGE',
    translationStrictness: 'TRANSLATION_STRICTNESS',
    communicationTimeout: 'INTEGRATION_TIMEOUT_MS',
    verboseLogging: 'VERBOSE_LOGGING',
    autoStartDaemon: 'AUTO_START_DAEMON',
    thinPluginEndpoint: 'THIN_PLUGIN_ENDPOINT',
  };

  return `${CONFIG_ENV_PREFIX}${mapping[configKey]}`;
}

/**
 * Get all configuration environment variable names
 */
export function getAllEnvVarNames(): Record<keyof AdapterConfig, string> {
  return {
    compatibleKernelRange: getEnvVarName('compatibleKernelRange'),
    translationStrictness: getEnvVarName('translationStrictness'),
    communicationTimeout: getEnvVarName('communicationTimeout'),
    verboseLogging: getEnvVarName('verboseLogging'),
    autoStartDaemon: getEnvVarName('autoStartDaemon'),
    thinPluginEndpoint: getEnvVarName('thinPluginEndpoint'),
  };
}