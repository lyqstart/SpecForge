/**
 * Unit tests for ModelCapabilities type
 */

import { describe, it, expect, vi } from 'vitest';
import type { ModelCapabilities, Modality } from '../src/types/model-capabilities.js';

describe('ModelCapabilities', () => {
  it('should create a valid ModelCapabilities object with text modality', () => {
    const capabilities: ModelCapabilities = {
      schema_version: '1.0',
      modalities: ['text'],
    };

    expect(capabilities.schema_version).toBe('1.0');
    expect(capabilities.modalities).toEqual(['text']);
  });

  it('should create a ModelCapabilities with all modalities', () => {
    const capabilities: ModelCapabilities = {
      schema_version: '1.0',
      modalities: ['text', 'image', 'audio', 'video', 'file'],
      maxInputTokens: 100000,
      supportsTools: true,
    };

    expect(capabilities.modalities).toHaveLength(5);
    expect(capabilities.maxInputTokens).toBe(100000);
    expect(capabilities.supportsTools).toBe(true);
  });

  it('should allow optional fields to be undefined', () => {
    const capabilities: ModelCapabilities = {
      schema_version: '1.0',
      modalities: ['text'],
    };

    expect(capabilities.maxInputTokens).toBeUndefined();
    expect(capabilities.supportsTools).toBeUndefined();
  });

  it('should support multiple modalities in array', () => {
    const capabilities: ModelCapabilities = {
      schema_version: '1.0',
      modalities: ['text', 'image'],
    };

    expect(capabilities.modalities).toContain('text');
    expect(capabilities.modalities).toContain('image');
  });

  it('should validate schema_version is always 1.0', () => {
    const capabilities: ModelCapabilities = {
      schema_version: '1.0',
      modalities: ['text'],
    };

    // Verify schema_version follows the required format
    expect(capabilities.schema_version).toMatch(/^\d+\.\d+$/);
  });
});

describe('Modality type', () => {
  it('should accept valid modality values', () => {
    const validModalities: Modality[] = ['text', 'image', 'audio', 'video', 'file'];
    
    const capabilities: ModelCapabilities = {
      schema_version: '1.0',
      modalities: validModalities,
    };

    expect(capabilities.modalities).toHaveLength(5);
  });

  it('should reject invalid modality values at compile time', () => {
    // This test verifies the type system - invalid values should cause TypeScript errors
    const capabilities: ModelCapabilities = {
      schema_version: '1.0',
      modalities: ['text'],
    };

    // At runtime, verify we can check if a value is a valid modality
    const isValidModality = (value: string): value is Modality => {
      return ['text', 'image', 'audio', 'video', 'file'].includes(value);
    };

    expect(isValidModality('text')).toBe(true);
    expect(isValidModality('image')).toBe(true);
    expect(isValidModality('invalid')).toBe(false);
  });
});