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
  streaming: true,
  maxContextLength: 128000,
  tools: true,
  vision: true,
  functionCalling: true,
  outputFormats: ['text', 'json', 'markdown'],
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
      streaming: ocCapabilities.features?.streaming ?? DEFAULT_CAPABILITIES.streaming,
      maxContextLength: ocCapabilities.context_window ?? DEFAULT_CAPABILITIES.maxContextLength,
      tools: (ocCapabilities.tools?.length ?? 0) > 0,
      vision: ocCapabilities.features?.vision ?? DEFAULT_CAPABILITIES.vision,
      functionCalling:
        ocCapabilities.features?.function_calling ?? DEFAULT_CAPABILITIES.functionCalling,
      outputFormats: this.getOutputFormats(ocCapabilities),
    };

    return capabilities;
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
    return { ...DEFAULT_CAPABILITIES };
  }

  /**
   * Check if a specific capability is supported
   *
   * @param capability - Capability name
   * @param capabilities - Capabilities to check
   * @returns Whether the capability is supported
   */
  hasCapability(capability: keyof ModelCapabilities, capabilities: ModelCapabilities): boolean {
    return capabilities[capability] !== undefined;
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
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return {
        success: true,
        capabilities: cached.capabilities,
        versionInfo: {
          schemaVersion: this.schemaVersion,
          openCodeVersion: ocCapabilities?.model || 'unknown',
          discoveredAt: new Date(cached.timestamp),
        },
      };
    }

    // Use provided capabilities or default
    const capabilities = ocCapabilities 
      ? this.translate(ocCapabilities)
      : this.getDefaultCapabilities();

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

    // Start with defaults and merge
    const merged: ModelCapabilities = {
      streaming: false,
      maxContextLength: 0,
      tools: false,
      vision: false,
      functionCalling: false,
      outputFormats: [],
    };

    for (const caps of capabilitiesList) {
      merged.streaming = merged.streaming || caps.streaming;
      merged.maxContextLength = Math.max(merged.maxContextLength, caps.maxContextLength);
      merged.tools = merged.tools || caps.tools;
      merged.vision = merged.vision || caps.vision;
      merged.functionCalling = merged.functionCalling || caps.functionCalling;
      
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
