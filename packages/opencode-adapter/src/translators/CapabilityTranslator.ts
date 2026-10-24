/**
 * Capability Translator
 *
 * Maps OpenCode model capabilities to Daemon ModelCapabilities.
 * Handles capability discovery and reporting, supports capability versioning.
 */

import { ModelCapabilities, OutputFormat, OpenCodeModelCapabilities, ICapabilityTranslator } from '../types';

/**
 * Default capabilities for OpenCode
 */
const DEFAULT_CAPABILITIES: ModelCapabilities = {
  streaming: null,
  maxContextLength: null,
  tools: null,
  vision: null,
  functionCalling: null,
  jsonOutput: null,
  outputFormats: [],
};

/**
 * Capability version info
 * Used to track capability schema versions for compatibility
 */
export interface CapabilityVersionInfo {
  /** Version of the capability schema */
  schemaVersion: string;
  /** OpenCode version these capabilities apply to */
  openCodeVersion: string;
  /** Timestamp when capabilities were discovered */
  discoveredAt: Date;
}

/**
 * Capability discovery result
 */
export interface CapabilityDiscoveryResult {
  /** Whether discovery was successful */
  success: boolean;
  /** Discovered capabilities */
  capabilities?: ModelCapabilities;
  /** Version info */
  versionInfo?: CapabilityVersionInfo;
  /** Error message if discovery failed */
  error?: string;
}

/**
 * Capability Translator
 *
 * Maps OpenCode model capabilities to Daemon ModelCapabilities.
 * Handles capability discovery and reporting, supports capability versioning.
 */
export class CapabilityTranslator implements ICapabilityTranslator {
  /**
   * Current capability schema version
   */
  private readonly schemaVersion = '1.0';

  /**
   * Cached capabilities per model
   */
  private capabilityCache: Map<string, { capabilities: ModelCapabilities; timestamp: number }> = new Map();

  /**
   * Cache TTL in milliseconds (5 minutes)
   */
  private readonly cacheTTL = 5 * 60 * 1000;

  /**
   * Translate OpenCode capabilities to Daemon capabilities
   *
   * @param ocCapabilities - OpenCode model capabilities
   * @returns Daemon ModelCapabilities
   */
  translate(ocCapabilities: OpenCodeModelCapabilities): ModelCapabilities {
    if (!ocCapabilities) {
      return this.getDefaultCapabilities();
    }

    const capabilities: ModelCapabilities = {
      streaming: this.feature(ocCapabilities.features?.streaming),
      maxContextLength: ocCapabilities.context_window ?? DEFAULT_CAPABILITIES.maxContextLength,
      tools: ocCapabilities.tools === undefined ? null : ocCapabilities.tools.length > 0,
      vision: this.feature(ocCapabilities.features?.vision),
      functionCalling:
        this.feature(ocCapabilities.features?.function_calling),
      jsonOutput: this.feature(ocCapabilities.features?.json_output),
      outputFormats: this.getOutputFormats(ocCapabilities),
    };

    return capabilities;
  }

  private feature(value: unknown): boolean | null {
    if (value === undefined) return null;
    if (typeof value !== 'boolean') throw new Error('CAPABILITY_RESPONSE_INVALID');
    return value;
  }

  /**
   * Get output formats from OpenCode capabilities
   *
   * @param ocCapabilities - OpenCode capabilities
   * @returns Array of supported output formats
   */
  private getOutputFormats(ocCapabilities: OpenCodeModelCapabilities): OutputFormat[] {
    const formats: OutputFormat[] = ['text'];

    if (ocCapabilities.features?.json_output) {
      formats.push('json');
    }

    // Check if markdown is supported (OpenCode typically supports it)
    formats.push('markdown');

    return formats;
  }

  /**
   * Get default capabilities
   *
   * @returns Default ModelCapabilities
   */
  getDefaultCapabilities(): ModelCapabilities {
    return { ...DEFAULT_CAPABILITIES, outputFormats: [] };
  }

  /**
   * Check if a specific capability is supported
   *
   * @param capability - Capability name
   * @param capabilities - Capabilities to check
   * @returns Whether the capability is supported
   */
  hasCapability(capability: keyof ModelCapabilities, capabilities: ModelCapabilities): boolean {
    const value = capabilities[capability];
    return Array.isArray(value) ? value.length > 0 : typeof value === 'number' ? value > 0 : value === true;
  }

  /**
   * Get capability schema version
   *
   * @returns Schema version string
   */
  getSchemaVersion(): string {
    return this.schemaVersion;
  }

  /**
   * Discover capabilities for a model
   * Includes caching for performance
   *
   * @param model - Model identifier
   * @param ocCapabilities - OpenCode capabilities (optional, for testing)
   * @returns Capability discovery result
   */
  discoverCapabilities(model: string, ocCapabilities?: OpenCodeModelCapabilities): CapabilityDiscoveryResult {
    if (!model) {
      return {
        success: false,
        error: 'Model identifier is required',
      };
    }

    // Check cache first
    const cached = this.capabilityCache.get(model);
    if (!ocCapabilities && cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return {
        success: true,
        capabilities: cached.capabilities,
        versionInfo: {
          schemaVersion: this.schemaVersion,
          openCodeVersion: 'unknown',
          discoveredAt: new Date(cached.timestamp),
        },
      };
    }

    if (!ocCapabilities) return { success: false, error: 'CAPABILITY_DISCOVERY_UNAVAILABLE' };
    const capabilities = this.translate(ocCapabilities);

    // Cache the result
    this.capabilityCache.set(model, {
      capabilities,
      timestamp: Date.now(),
    });

    return {
      success: true,
      capabilities,
      versionInfo: {
        schemaVersion: this.schemaVersion,
        openCodeVersion: ocCapabilities?.model || 'default',
        discoveredAt: new Date(),
      },
    };
  }

  /**
   * Clear capability cache
   *
   * @param model - Optional model to clear from cache. If not provided, clears all.
   */
  clearCache(model?: string): void {
    if (model) {
      this.capabilityCache.delete(model);
    } else {
      this.capabilityCache.clear();
    }
  }

  /**
   * Get cached capability for a model
   *
   * @param model - Model identifier
   * @returns Cached capabilities or null if not cached
   */
  getCachedCapabilities(model: string): ModelCapabilities | null {
    const cached = this.capabilityCache.get(model);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.capabilities;
    }
    return null;
  }

  /**
   * Get all cached models
   *
   * @returns Array of cached model identifiers
   */
  getCachedModels(): string[] {
    return Array.from(this.capabilityCache.keys());
  }

  /**
   * Merge capabilities from multiple sources
   * Takes the union of capabilities, preferring true values
   *
   * @param capabilitiesList - Array of capabilities to merge
   * @returns Merged capabilities
   */
  mergeCapabilities(capabilitiesList: ModelCapabilities[]): ModelCapabilities {
    if (capabilitiesList.length === 0) {
      return this.getDefaultCapabilities();
    }

    if (capabilitiesList.length === 1) {
      const single = capabilitiesList[0];
      return single !== undefined ? single : this.getDefaultCapabilities();
    }

    const merged: ModelCapabilities = this.getDefaultCapabilities();
    const union = (values: Array<boolean | null | undefined>): boolean | null =>
      values.some(value => value === true) ? true : values.every(value => value === false) ? false : null;
    for (const key of ['streaming', 'tools', 'vision', 'functionCalling', 'jsonOutput'] as const) {
      merged[key] = union(capabilitiesList.map(caps => caps[key]));
    }
    const contexts = capabilitiesList.map(caps => caps.maxContextLength);
    merged.maxContextLength = contexts.every((value): value is number => value !== null) ? Math.max(...contexts) : null;

    for (const caps of capabilitiesList) {
      // Merge output formats (union)
      for (const format of caps.outputFormats) {
        if (!merged.outputFormats.includes(format)) {
          merged.outputFormats.push(format);
        }
      }
    }

    return merged;
  }
}
