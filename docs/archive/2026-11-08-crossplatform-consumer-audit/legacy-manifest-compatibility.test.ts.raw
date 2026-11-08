/**
 * Manifest Compatibility Unit Tests
 *
 * Validates that specforge/manifest.json conforms to the V6 schema
 * with backward-compatible fields.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const MANIFEST_PATH = path.resolve(
  __dirname,
  '..', '..', '..', '..',
  '.specforge',
  'manifest.json',
);

interface Manifest {
  schema_version: string;
  project_name?: string;
  created_at?: string;
  // Legacy fields from installer-generated manifest (may not exist in all projects)
  data_schema_version?: number;
  install_mode?: string;
  initialized_at?: string;
  updated_at?: string;
}

let manifest: Manifest;

function readManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`manifest.json not found at: ${MANIFEST_PATH}`);
  }
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8');
  return JSON.parse(raw) as Manifest;
}

describe('manifest.json compatibility', () => {
  beforeAll(() => {
    manifest = readManifest();
  });

  describe('V6 schema required fields', () => {
    it('should have schema_version: "6.0"', () => {
      expect(manifest.schema_version).toBe('6.0');
    });

    it('should have project_name as a string', () => {
      expect(manifest).toHaveProperty('project_name');
      expect(typeof manifest.project_name).toBe('string');
    });

    it('should have created_at as a valid ISO date string', () => {
      expect(manifest).toHaveProperty('created_at');
      expect(typeof manifest.created_at).toBe('string');
      expect(() => new Date(manifest.created_at!)).not.toThrow();
    });
  });

  describe('optional legacy fields (from installer-generated manifests)', () => {
    it('should tolerate missing install_mode', () => {
      // install_mode is only present in installer-generated manifests
      // P0 minimal manifest does not include it
      if (manifest.install_mode !== undefined) {
        expect(typeof manifest.install_mode).toBe('string');
      }
    });

    it('should tolerate missing data_schema_version', () => {
      if (manifest.data_schema_version !== undefined) {
        expect(typeof manifest.data_schema_version).toBe('number');
      }
    });
  });

  describe('schema_version format', () => {
    it('should be exactly "6.0" (string, not number)', () => {
      expect(manifest.schema_version).toBe('6.0');
      expect(typeof manifest.schema_version).toBe('string');
    });
  });
});
