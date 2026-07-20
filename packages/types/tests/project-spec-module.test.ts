import { describe, expect, it } from 'vitest';
import {
  canonicalProjectSpecModuleEntry,
  moduleCodeFromProjectSpecPath,
  normalizeModuleCodeReference,
  resolveSpecModuleIdentity,
} from '../src/project-spec-module';

describe('Project Spec canonical module identity', () => {
  it('normalizes only explicit compatible legacy references', () => {
    expect(normalizeModuleCodeReference('CORE')).toBe('CORE');
    expect(normalizeModuleCodeReference('core')).toBe('CORE');
    expect(normalizeModuleCodeReference('MOD-CORE')).toBe('CORE');
    expect(normalizeModuleCodeReference('core-module')).toBeNull();
  });

  it('fails closed when identity fields conflict', () => {
    const result = resolveSpecModuleIdentity({ module_code: 'CORE', module_id: 'MOD-AUTH' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Conflicting module identity fields: module_code=CORE, module_id=MOD-AUTH'
    );
  });

  it('reads a legacy entry while identifying that migration is required', () => {
    const result = resolveSpecModuleIdentity({ module_id: 'MOD-CORE', name: 'core' });
    expect(result).toMatchObject({ valid: true, moduleCode: 'CORE', legacy: true });
  });

  it('extracts identity from Project Spec paths without inventing separators', () => {
    expect(moduleCodeFromProjectSpecPath('.specforge/project/modules/AUTH/design.md')).toBe('AUTH');
    expect(moduleCodeFromProjectSpecPath('.specforge/project/modules/core/design.md')).toBe('CORE');
    expect(moduleCodeFromProjectSpecPath('.specforge/project/modules/core-module/design.md')).toBeNull();
  });

  it('creates the canonical registry entry', () => {
    expect(canonicalProjectSpecModuleEntry('auth')).toEqual({
      module_code: 'AUTH',
      path: '.specforge/project/modules/AUTH',
      module_file: '.specforge/project/modules/AUTH/module.json',
      requirements: '.specforge/project/modules/AUTH/requirements.md',
      design: '.specforge/project/modules/AUTH/design.md',
      trace: '.specforge/project/modules/AUTH/trace.md',
    });
  });
});
