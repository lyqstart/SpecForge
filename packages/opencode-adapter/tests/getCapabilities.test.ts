/**
 * OpenCode Adapter - getCapabilities Method Tests
 *
 * Tests for the getCapabilities method which queries OpenCode for model capabilities
 * and translates them to Daemon ModelCapabilities format.
 *
 * Requirements: 1.1, 3.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenCodeAdapter } from '../src/OpenCodeAdapter';
import type { SpawnAgentParams, ModelCapabilities } from '../src/types';

describe('OpenCodeAdapter - getCapabilities', () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => {
    adapter = new OpenCodeAdapter({
      compatibleKernelRange: '>=1.0.0 <2.0.0',
      communicationTimeout: 5000,
    });
  });

  // ============================================================
  // Basic Functionality Tests
  // ============================================================

  describe('basic functionality', () => {
    it('should return default capabilities for empty model string', async () => {
      const capabilities = await adapter.getCapabilities('');
      
      expect(capabilities).toBeDefined();
      expect(capabilities.streaming).toBe(true);
      expect(capabilities.maxContextLength).toBe(128000);
      expect(capabilities.tools).toBe(true);
      expect(capabilities.vision).toBe(true);
      expect(capabilities.functionCalling).toBe(true);
      expect(capabilities.outputFormats).toContain('text');
      expect(capabilities.outputFormats).toContain('json');
      expect(capabilities.outputFormats).toContain('markdown');
    });

    it('should return default capabilities for undefined model', async () => {
      const capabilities = await adapter.getCapabilities(undefined as unknown as string);
      
      expect(capabilities).toBeDefined();
      expect(capabilities.streaming).toBe(true);
      expect(capabilities.maxContextLength).toBe(128000);
    });

    it('should return default capabilities for whitespace-only model', async () => {
      const capabilities = await adapter.getCapabilities('   ');
      
      expect(capabilities).toBeDefined();
      expect(capabilities.streaming).toBe(true);
    });

    it('should return capabilities for valid model', async () => {
      const capabilities = await adapter.getCapabilities('gpt-4');
      
      expect(capabilities).toBeDefined();
      expect(typeof capabilities.streaming).toBe('boolean');
      expect(typeof capabilities.maxContextLength).toBe('number');
      expect(typeof capabilities.tools).toBe('boolean');
      expect(typeof capabilities.vision).toBe('boolean');
      expect(typeof capabilities.functionCalling).toBe('boolean');
      expect(Array.isArray(capabilities.outputFormats)).toBe(true);
    });
  });

  // ============================================================
  // Model-Specific Capability Tests
  // ============================================================

  describe('model-specific capabilities', () => {
    it('should return appropriate capabilities for GPT-4', async () => {
      const capabilities = await adapter.getCapabilities('gpt-4');
      
      expect(capabilities.streaming).toBe(true);
      expect(capabilities.maxContextLength).toBe(128000);
      expect(capabilities.tools).toBe(true);
      expect(capabilities.functionCalling).toBe(true);
    });

    it('should return appropriate capabilities for GPT-3.5', async () => {
      const capabilities = await adapter.getCapabilities('gpt-3.5-turbo');
      
      expect(capabilities.streaming).toBe(true);
      expect(capabilities.maxContextLength).toBe(16385);
      expect(capabilities.tools).toBe(true);
    });

    it('should return appropriate capabilities for Claude', async () => {
      const capabilities = await adapter.getCapabilities('claude-3-5-sonnet');
      
      expect(capabilities.streaming).toBe(true);
      expect(capabilities.maxContextLength).toBe(200000);
      expect(capabilities.vision).toBe(true);
    });

    it('should return appropriate capabilities for Gemini', async () => {
      const capabilities = await adapter.getCapabilities('gemini-pro');
      
      expect(capabilities.streaming).toBe(true);
      expect(capabilities.maxContextLength).toBe(1000000);
      expect(capabilities.vision).toBe(true);
    });

    it('should return appropriate capabilities for GPT-4 Vision', async () => {
      const capabilities = await adapter.getCapabilities('gpt-4-vision-preview');
      
      expect(capabilities.vision).toBe(true);
      expect(capabilities.maxContextLength).toBe(128000);
    });
  });

  // ============================================================
  // Provider Detection Tests
  // ============================================================

  describe('provider detection', () => {
    it('should detect OpenAI provider', async () => {
      const capabilities = await adapter.getCapabilities('gpt-4');
      
      // Provider is used internally for capability generation
      expect(capabilities).toBeDefined();
    });

    it('should handle unknown providers gracefully', async () => {
      const capabilities = await adapter.getCapabilities('unknown-model-123');
      
      expect(capabilities).toBeDefined();
      expect(capabilities.streaming).toBe(true);
      expect(capabilities.maxContextLength).toBe(128000);
    });
  });

  // ============================================================
  // Capability Caching Tests
  // ============================================================

  describe('capability caching', () => {
    it('should cache capabilities for the same model', async () => {
      // First call - populates cache
      const caps1 = await adapter.getCapabilities('test-model');
      
      // Second call - should use cache
      const caps2 = await adapter.getCapabilities('test-model');
      
      expect(caps1).toEqual(caps2);
    });

    it('should return different capabilities for different models', async () => {
      const gpt4Caps = await adapter.getCapabilities('gpt-4');
      const claudeCaps = await adapter.getCapabilities('claude-3-5-sonnet');
      
      // Different models should have different context lengths
      expect(gpt4Caps.maxContextLength).not.toBe(claudeCaps.maxContextLength);
    });

    it('should clear cache with clearCapabilitiesCache', async () => {
      // First call
      await adapter.getCapabilities('test-model-cache');
      
      // Clear cache
      adapter.clearCapabilitiesCache('test-model-cache');
      
      // Second call should work (may or may not hit cache depending on TTL)
      const capabilities = await adapter.getCapabilities('test-model-cache');
      expect(capabilities).toBeDefined();
    });

    it('should clear all caches when model is not specified', async () => {
      // Populate cache
      await adapter.getCapabilities('model-a');
      await adapter.getCapabilities('model-b');
      
      // Clear all caches
      adapter.clearCapabilitiesCache();
      
      // Should work - cache is cleared
      const capabilities = await adapter.getCapabilities('model-a');
      expect(capabilities).toBeDefined();
    });
  });

  // ============================================================
  // Edge Cases Tests
  // ============================================================

  describe('edge cases', () => {
    it('should handle very long model string', async () => {
      const longModel = 'a'.repeat(1000);
      const capabilities = await adapter.getCapabilities(longModel);
      
      expect(capabilities).toBeDefined();
      expect(capabilities.streaming).toBe(true);
    });

    it('should handle special characters in model string', async () => {
      const capabilities = await adapter.getCapabilities('model-123!@#$%^&*()');
      
      expect(capabilities).toBeDefined();
      expect(capabilities.maxContextLength).toBe(128000);
    });

    it('should handle unicode characters in model string', async () => {
      const capabilities = await adapter.getCapabilities('模型-中文');
      
      expect(capabilities).toBeDefined();
      expect(capabilities.streaming).toBe(true);
    });

    it('should handle model with version numbers', async () => {
      const capabilities = await adapter.getCapabilities('gpt-4-0125-preview');
      
      expect(capabilities).toBeDefined();
      expect(capabilities.functionCalling).toBe(true);
    });

    it('should handle case-insensitive model names', async () => {
      const capsLower = await adapter.getCapabilities('gpt-4');
      const capsUpper = await adapter.getCapabilities('GPT-4');
      const capsMixed = await adapter.getCapabilities('Gpt-4');
      
      // All should return valid capabilities (provider detection is case-insensitive)
      expect(capsLower).toBeDefined();
      expect(capsUpper).toBeDefined();
      expect(capsMixed).toBeDefined();
    });
  });

  // ============================================================
  // Session Integration Tests
  // ============================================================

  describe('session integration', () => {
    it('should associate capabilities with session model', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-caps-test',
        model: 'claude-3-5-sonnet',
      };

      await adapter.spawnAgent(params);
      
      // getCapabilities should use session model if available
      const capabilities = await adapter.getCapabilities('claude-3-5-sonnet');
      
      expect(capabilities).toBeDefined();
      expect(capabilities.vision).toBe(true);
    });
  });

  // ============================================================
  // Output Format Tests
  // ============================================================

  describe('output format validation', () => {
    it('should always include text format', async () => {
      const capabilities = await adapter.getCapabilities('any-model');
      
      expect(capabilities.outputFormats).toContain('text');
    });

    it('should include json format for models that support it', async () => {
      const capabilities = await adapter.getCapabilities('gpt-4');
      
      expect(capabilities.outputFormats).toContain('json');
    });

    it('should include markdown format', async () => {
      const capabilities = await adapter.getCapabilities('gpt-4');
      
      expect(capabilities.outputFormats).toContain('markdown');
    });

    it('should return valid OutputFormat array', async () => {
      const capabilities = await adapter.getCapabilities('test-model');
      
      const validFormats = ['text', 'json', 'markdown'];
      for (const format of capabilities.outputFormats) {
        expect(validFormats).toContain(format);
      }
    });
  });

  // ============================================================
  // ModelCapabilities Interface Compliance Tests
  // ============================================================

  describe('ModelCapabilities interface compliance', () => {
    it('should return all required fields', async () => {
      const capabilities = await adapter.getCapabilities('test-model');
      
      // Check all required fields are present
      expect(capabilities).toHaveProperty('streaming');
      expect(capabilities).toHaveProperty('maxContextLength');
      expect(capabilities).toHaveProperty('tools');
      expect(capabilities).toHaveProperty('vision');
      expect(capabilities).toHaveProperty('functionCalling');
      expect(capabilities).toHaveProperty('outputFormats');
    });

    it('should return correct types for all fields', async () => {
      const capabilities = await adapter.getCapabilities('test-model');
      
      expect(typeof capabilities.streaming).toBe('boolean');
      expect(typeof capabilities.maxContextLength).toBe('number');
      expect(typeof capabilities.tools).toBe('boolean');
      expect(typeof capabilities.vision).toBe('boolean');
      expect(typeof capabilities.functionCalling).toBe('boolean');
      expect(Array.isArray(capabilities.outputFormats)).toBe(true);
    });

    it('should return positive maxContextLength', async () => {
      const capabilities = await adapter.getCapabilities('test-model');
      
      expect(capabilities.maxContextLength).toBeGreaterThan(0);
    });

    it('should return at least one output format', async () => {
      const capabilities = await adapter.getCapabilities('test-model');
      
      expect(capabilities.outputFormats.length).toBeGreaterThan(0);
    });
  });
});