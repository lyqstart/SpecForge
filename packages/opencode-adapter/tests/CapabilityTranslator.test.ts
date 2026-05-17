/**
 * CapabilityTranslator Unit Tests
 *
 * Tests for the CapabilityTranslator class which maps OpenCode model capabilities
 * to Daemon ModelCapabilities.
 *
 * Requirements: 3.1, 3.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityTranslator, CapabilityDiscoveryResult, CapabilityVersionInfo } from '../src/translators/CapabilityTranslator';
import type { ModelCapabilities, OpenCodeModelCapabilities } from '../src/types';

describe('CapabilityTranslator', () => {
  let translator: CapabilityTranslator;

  beforeEach(() => {
    translator = new CapabilityTranslator();
  });

  // ============================================================
  // translate() Tests
  // ============================================================

  describe('translate - valid capabilities', () => {
    it('should translate minimal OpenCode capabilities', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        features: {},
        context_window: 200000,
        tools: ['tool1', 'tool2'],
      };

      const result = translator.translate(ocCapabilities);

      expect(result.streaming).toBe(true); // default
      expect(result.maxContextLength).toBe(200000);
      expect(result.tools).toBe(true); // has tools
      expect(result.vision).toBe(true); // default
      expect(result.functionCalling).toBe(true); // default
      expect(result.outputFormats).toContain('text');
    });

    it('should translate full OpenCode capabilities with all features', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'openai',
        model: 'gpt-4',
        features: {
          streaming: false,
          vision: false,
          function_calling: true,
          json_output: true,
        },
        context_window: 128000,
        tools: ['sf_tool1', 'sf_tool2'],
      };

      const result = translator.translate(ocCapabilities);

      expect(result.streaming).toBe(false);
      expect(result.maxContextLength).toBe(128000);
      expect(result.tools).toBe(true);
      expect(result.vision).toBe(false);
      expect(result.functionCalling).toBe(true);
      expect(result.outputFormats).toContain('json');
    });

    it('should use defaults when features are undefined', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'test-model',
        features: undefined,
        context_window: undefined,
        tools: undefined,
      };

      const result = translator.translate(ocCapabilities);

      expect(result.streaming).toBe(true);
      expect(result.maxContextLength).toBe(128000);
      expect(result.tools).toBe(false); // no tools = false
      expect(result.vision).toBe(true);
      expect(result.functionCalling).toBe(true);
    });

    it('should handle empty features object', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'test-model',
        features: {},
        context_window: 100000,
        tools: [],
      };

      const result = translator.translate(ocCapabilities);

      expect(result.streaming).toBe(true); // default
      expect(result.maxContextLength).toBe(100000);
      expect(result.tools).toBe(false); // empty tools array = false
      expect(result.vision).toBe(true); // default
    });
  });

  describe('translate - null/undefined input', () => {
    it('should return default capabilities when input is null', () => {
      const result = translator.translate(null as unknown as OpenCodeModelCapabilities);
      const defaults = translator.getDefaultCapabilities();

      expect(result).toEqual(defaults);
    });

    it('should return default capabilities when input is undefined', () => {
      const result = translator.translate(undefined as unknown as OpenCodeModelCapabilities);
      const defaults = translator.getDefaultCapabilities();

      expect(result).toEqual(defaults);
    });
  });

  describe('translate - output formats', () => {
    it('should include text and markdown by default', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'test-model',
        features: {},
        context_window: 100000,
        tools: [],
      };

      const result = translator.translate(ocCapabilities);

      expect(result.outputFormats).toContain('text');
      expect(result.outputFormats).toContain('markdown');
      expect(result.outputFormats).toHaveLength(2);
    });

    it('should include json when json_output is true', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'test-model',
        features: { json_output: true },
        context_window: 100000,
        tools: [],
      };

      const result = translator.translate(ocCapabilities);

      expect(result.outputFormats).toContain('text');
      expect(result.outputFormats).toContain('json');
      expect(result.outputFormats).toContain('markdown');
      expect(result.outputFormats).toHaveLength(3);
    });

    it('should not include json when json_output is false', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'test-model',
        features: { json_output: false },
        context_window: 100000,
        tools: [],
      };

      const result = translator.translate(ocCapabilities);

      expect(result.outputFormats).toContain('text');
      expect(result.outputFormats).toContain('markdown');
      expect(result.outputFormats).not.toContain('json');
      expect(result.outputFormats).toHaveLength(2);
    });
  });

  // ============================================================
  // getDefaultCapabilities() Tests
  // ============================================================

  describe('getDefaultCapabilities', () => {
    it('should return default capabilities', () => {
      const defaults = translator.getDefaultCapabilities();

      expect(defaults.streaming).toBe(true);
      expect(defaults.maxContextLength).toBe(128000);
      expect(defaults.tools).toBe(true);
      expect(defaults.vision).toBe(true);
      expect(defaults.functionCalling).toBe(true);
      expect(defaults.outputFormats).toEqual(['text', 'json', 'markdown']);
    });

    it('should return a copy, not the original', () => {
      const defaults = translator.getDefaultCapabilities();
      defaults.streaming = false;

      // Get again should still be true
      const defaults2 = translator.getDefaultCapabilities();
      expect(defaults2.streaming).toBe(true);
    });
  });

  // ============================================================
  // hasCapability() Tests
  // ============================================================

  describe('hasCapability', () => {
    it('should return true for supported capabilities', () => {
      const caps: ModelCapabilities = {
        streaming: true,
        maxContextLength: 128000,
        tools: true,
        vision: true,
        functionCalling: true,
        outputFormats: ['text'],
      };

      expect(translator.hasCapability('streaming', caps)).toBe(true);
      expect(translator.hasCapability('maxContextLength', caps)).toBe(true);
      expect(translator.hasCapability('tools', caps)).toBe(true);
      expect(translator.hasCapability('vision', caps)).toBe(true);
      expect(translator.hasCapability('functionCalling', caps)).toBe(true);
      expect(translator.hasCapability('outputFormats', caps)).toBe(true);
    });

    it('should return false for undefined capabilities', () => {
      const caps: ModelCapabilities = {
        streaming: true,
        maxContextLength: 128000,
        tools: true,
        vision: true,
        functionCalling: true,
        outputFormats: ['text'],
      } as ModelCapabilities;

      // All keys are defined, so it returns truthy values
      expect(translator.hasCapability('streaming', caps)).toBe(true);
    });

    it('should return false for non-existent capabilities', () => {
      const caps: ModelCapabilities = {
        streaming: true,
        maxContextLength: 128000,
        tools: true,
        vision: true,
        functionCalling: true,
        outputFormats: ['text'],
      };

      expect(translator.hasCapability('nonexistent' as keyof ModelCapabilities, caps)).toBe(false);
    });
  });

  // ============================================================
  // getSchemaVersion() Tests
  // ============================================================

  describe('getSchemaVersion', () => {
    it('should return current schema version', () => {
      expect(translator.getSchemaVersion()).toBe('1.0');
    });
  });

  // ============================================================
  // discoverCapabilities() Tests
  // ============================================================

  describe('discoverCapabilities', () => {
    it('should discover capabilities for a model', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        features: { streaming: true, vision: true },
        context_window: 200000,
        tools: ['tool1'],
      };

      const result = translator.discoverCapabilities('claude-3-5-sonnet', ocCapabilities);

      expect(result.success).toBe(true);
      expect(result.capabilities).toBeDefined();
      expect(result.capabilities?.maxContextLength).toBe(200000);
      expect(result.versionInfo).toBeDefined();
      expect(result.versionInfo?.schemaVersion).toBe('1.0');
    });

    it('should use defaults when no capabilities provided', () => {
      const result = translator.discoverCapabilities('test-model');

      expect(result.success).toBe(true);
      expect(result.capabilities).toEqual(translator.getDefaultCapabilities());
    });

    it('should fail when model is empty', () => {
      const result = translator.discoverCapabilities('');

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should cache discovered capabilities', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'cached-model',
        features: {},
        context_window: 50000,
        tools: [],
      };

      // First discovery
      const result1 = translator.discoverCapabilities('cached-model', ocCapabilities);
      expect(result1.success).toBe(true);

      // Second discovery should return cached
      const result2 = translator.discoverCapabilities('cached-model');
      expect(result2.success).toBe(true);
      expect(result2.capabilities?.maxContextLength).toBe(50000);
    });

    it('should include version info in discovery result', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'version-test-model',
        features: {},
        context_window: 100000,
        tools: [],
      };

      const result = translator.discoverCapabilities('version-test-model', ocCapabilities);

      expect(result.versionInfo).toBeDefined();
      expect(result.versionInfo?.schemaVersion).toBe('1.0');
      expect(result.versionInfo?.discoveredAt).toBeInstanceOf(Date);
    });
  });

  // ============================================================
  // Cache Management Tests
  // ============================================================

  describe('clearCache', () => {
    it('should clear specific model from cache', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'clear-test',
        features: {},
        context_window: 100000,
        tools: [],
      };

      // Populate cache
      translator.discoverCapabilities('model-a', ocCapabilities);
      translator.discoverCapabilities('model-b', ocCapabilities);

      expect(translator.getCachedModels()).toContain('model-a');
      expect(translator.getCachedModels()).toContain('model-b');

      // Clear specific model
      translator.clearCache('model-a');

      expect(translator.getCachedModels()).not.toContain('model-a');
      expect(translator.getCachedModels()).toContain('model-b');
    });

    it('should clear all models when no model specified', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'clear-all',
        features: {},
        context_window: 100000,
        tools: [],
      };

      // Populate cache
      translator.discoverCapabilities('model-a', ocCapabilities);
      translator.discoverCapabilities('model-b', ocCapabilities);

      // Clear all
      translator.clearCache();

      expect(translator.getCachedModels()).toHaveLength(0);
    });
  });

  describe('getCachedCapabilities', () => {
    it('should return cached capabilities', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'get-cache-test',
        features: {},
        context_window: 75000,
        tools: [],
      };

      translator.discoverCapabilities('cached-model', ocCapabilities);

      const cached = translator.getCachedCapabilities('cached-model');
      expect(cached).toBeDefined();
      expect(cached?.maxContextLength).toBe(75000);
    });

    it('should return null for non-cached model', () => {
      const cached = translator.getCachedCapabilities('nonexistent-model');
      expect(cached).toBeNull();
    });
  });

  describe('getCachedModels', () => {
    it('should return empty array when cache is empty', () => {
      expect(translator.getCachedModels()).toEqual([]);
    });

    it('should return all cached model identifiers', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'test',
        features: {},
        context_window: 100000,
        tools: [],
      };

      translator.discoverCapabilities('model-1', ocCapabilities);
      translator.discoverCapabilities('model-2', ocCapabilities);
      translator.discoverCapabilities('model-3', ocCapabilities);

      const models = translator.getCachedModels();
      expect(models).toHaveLength(3);
      expect(models).toContain('model-1');
      expect(models).toContain('model-2');
      expect(models).toContain('model-3');
    });
  });

  // ============================================================
  // mergeCapabilities() Tests
  // ============================================================

  describe('mergeCapabilities', () => {
    it('should return default when given empty array', () => {
      const result = translator.mergeCapabilities([]);
      expect(result).toEqual(translator.getDefaultCapabilities());
    });

    it('should return single capability as-is', () => {
      const caps: ModelCapabilities = {
        streaming: true,
        maxContextLength: 100000,
        tools: true,
        vision: false,
        functionCalling: true,
        outputFormats: ['text'],
      };

      const result = translator.mergeCapabilities([caps]);
      expect(result).toEqual(caps);
    });

    it('should merge multiple capabilities with OR logic', () => {
      const caps1: ModelCapabilities = {
        streaming: true,
        maxContextLength: 100000,
        tools: false,
        vision: false,
        functionCalling: true,
        outputFormats: ['text'],
      };

      const caps2: ModelCapabilities = {
        streaming: false,
        maxContextLength: 200000,
        tools: true,
        vision: true,
        functionCalling: false,
        outputFormats: ['json'],
      };

      const result = translator.mergeCapabilities([caps1, caps2]);

      expect(result.streaming).toBe(true);
      expect(result.maxContextLength).toBe(200000);
      expect(result.tools).toBe(true);
      expect(result.vision).toBe(true);
      expect(result.functionCalling).toBe(true);
      expect(result.outputFormats).toContain('text');
      expect(result.outputFormats).toContain('json');
    });

    it('should handle duplicate output formats', () => {
      const caps1: ModelCapabilities = {
        streaming: true,
        maxContextLength: 100000,
        tools: true,
        vision: true,
        functionCalling: true,
        outputFormats: ['text', 'json'],
      };

      const caps2: ModelCapabilities = {
        streaming: true,
        maxContextLength: 100000,
        tools: true,
        vision: true,
        functionCalling: true,
        outputFormats: ['text', 'markdown'],
      };

      const result = translator.mergeCapabilities([caps1, caps2]);

      expect(result.outputFormats).toHaveLength(3);
      expect(result.outputFormats).toContain('text');
      expect(result.outputFormats).toContain('json');
      expect(result.outputFormats).toContain('markdown');
    });
  });

  // ============================================================
  // Edge Cases Tests
  // ============================================================

  describe('edge cases', () => {
    it('should handle very large context window', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'large-context',
        features: {},
        context_window: 1000000,
        tools: [],
      };

      const result = translator.translate(ocCapabilities);
      expect(result.maxContextLength).toBe(1000000);
    });

    it('should handle zero context window', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'zero-context',
        features: {},
        context_window: 0,
        tools: [],
      };

      const result = translator.translate(ocCapabilities);
      expect(result.maxContextLength).toBe(0);
    });

    it('should handle many tools', () => {
      const tools = Array.from({ length: 100 }, (_, i) => `tool-${i}`);
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'many-tools',
        features: {},
        context_window: 100000,
        tools,
      };

      const result = translator.translate(ocCapabilities);
      expect(result.tools).toBe(true);
    });

    it('should handle all feature flags set to false', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'no-features',
        features: {
          streaming: false,
          vision: false,
          function_calling: false,
          json_output: false,
        },
        context_window: 8000,
        tools: [],
      };

      const result = translator.translate(ocCapabilities);

      expect(result.streaming).toBe(false);
      expect(result.vision).toBe(false);
      expect(result.functionCalling).toBe(false);
      expect(result.outputFormats).not.toContain('json');
    });
  });

  // ============================================================
  // Round-trip / Integration Tests
  // ============================================================

  describe('round-trip translation', () => {
    it('should preserve core capabilities through translate', () => {
      const original: OpenCodeModelCapabilities = {
        provider: 'anthropic',
        model: 'claude-3-opus',
        features: {
          streaming: true,
          vision: true,
          function_calling: true,
          json_output: true,
        },
        context_window: 200000,
        tools: ['tool1', 'tool2', 'tool3'],
      };

      const translated = translator.translate(original);

      expect(translated.streaming).toBe(true);
      expect(translated.vision).toBe(true);
      expect(translated.functionCalling).toBe(true);
      expect(translated.maxContextLength).toBe(200000);
      expect(translated.tools).toBe(true);
      expect(translated.outputFormats).toContain('json');
    });

    it('should maintain capability consistency across multiple translations', () => {
      const ocCapabilities: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'consistency-test',
        features: { streaming: false },
        context_window: 128000,
        tools: ['tool1'],
      };

      const result1 = translator.translate(ocCapabilities);
      const result2 = translator.translate(ocCapabilities);
      const result3 = translator.translate(ocCapabilities);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });
  });

  // ============================================================
  // Multiple Models Test
  // ============================================================

  describe('multiple models', () => {
    it('should handle different models with different capabilities', () => {
      const claudeCaps: OpenCodeModelCapabilities = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        features: { vision: true, streaming: true },
        context_window: 200000,
        tools: ['sf_tool'],
      };

      const gptCaps: OpenCodeModelCapabilities = {
        provider: 'openai',
        model: 'gpt-4',
        features: { vision: false, streaming: false },
        context_window: 128000,
        tools: ['sf_tool'],
      };

      const claudeResult = translator.translate(claudeCaps);
      const gptResult = translator.translate(gptCaps);

      expect(claudeResult.vision).toBe(true);
      expect(claudeResult.maxContextLength).toBe(200000);
      
      expect(gptResult.vision).toBe(false);
      expect(gptResult.maxContextLength).toBe(128000);
    });

    it('should cache each model independently', () => {
      const caps1: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'model-1',
        features: {},
        context_window: 100000,
        tools: [],
      };

      const caps2: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'model-2',
        features: {},
        context_window: 200000,
        tools: [],
      };

      translator.discoverCapabilities('model-1', caps1);
      translator.discoverCapabilities('model-2', caps2);

      const cached1 = translator.getCachedCapabilities('model-1');
      const cached2 = translator.getCachedCapabilities('model-2');

      expect(cached1?.maxContextLength).toBe(100000);
      expect(cached2?.maxContextLength).toBe(200000);
    });
  });
});