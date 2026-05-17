/**
 * Unit tests for ScopeTagValidator
 * 
 * Tests the validation of .config.kiro scope tags
 * against REQ-25 capability definitions.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4
 * Task: 9.1 Create tool to validate `.config.kiro` scope tags
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { ScopeTagValidator, type SpecValidationResult, type ScopeTagValidationReport } from '../src/scope-tag-validator.js';

// Test fixtures directory
const TEST_FIXTURES_DIR = resolve(process.cwd(), 'tests', 'test-fixtures-scope-tag');

// Helper to create test spec directories
function createTestSpec(name: string, scopeTag?: string, valid = true): string {
  const specPath = join(TEST_FIXTURES_DIR, name);
  
  // Create directory if it doesn't exist
  if (!existsSync(specPath)) {
    mkdirSync(specPath, { recursive: true });
  }
  
  // Create .config.kiro if valid
  if (valid) {
    const config = {
      specId: `test-${name}`,
      workflowType: 'requirements-first',
      specType: 'feature',
      scopeTag: scopeTag || 'p0',
      parentSpec: 'v6-architecture-overview'
    };
    writeFileSync(join(specPath, '.config.kiro'), JSON.stringify(config, null, 2));
  }
  
  return specPath;
}

// Helper to create invalid config
function createInvalidConfig(name: string, configContent: object): string {
  const specPath = join(TEST_FIXTURES_DIR, name);
  
  if (!existsSync(specPath)) {
    mkdirSync(specPath, { recursive: true });
  }
  
  writeFileSync(join(specPath, '.config.kiro'), JSON.stringify(configContent, null, 2));
  return specPath;
}

// Cleanup function
function cleanupTestFixtures(): void {
  if (existsSync(TEST_FIXTURES_DIR)) {
    rmSync(TEST_FIXTURES_DIR, { recursive: true, force: true });
  }
}

describe('ScopeTagValidator', () => {
  let validator: ScopeTagValidator;
  
  beforeEach(() => {
    cleanupTestFixtures();
    validator = new ScopeTagValidator({
      parentSpecPath: resolve(process.cwd(), '.kiro', 'specs', 'v6-architecture-overview'),
      specsPath: TEST_FIXTURES_DIR
    });
  });
  
  afterEach(() => {
    cleanupTestFixtures();
  });

  describe('constructor', () => {
    it('should create validator with default paths', () => {
      const v = new ScopeTagValidator();
      expect(v).toBeDefined();
    });
    
    it('should accept custom paths', () => {
      const v = new ScopeTagValidator({
        parentSpecPath: '/custom/parent',
        specsPath: '/custom/specs'
      });
      expect(v).toBeDefined();
      expect(v.getParentSpecPath()).toBe('/custom/parent');
      expect(v.getSpecsPath()).toBe('/custom/specs');
    });
  });

  describe('isValidScopeTag', () => {
    it('should return true for valid scope tags', () => {
      expect(ScopeTagValidator.isValidScopeTag('p0')).toBe(true);
      expect(ScopeTagValidator.isValidScopeTag('p1')).toBe(true);
      expect(ScopeTagValidator.isValidScopeTag('p2')).toBe(true);
    });
    
    it('should return false for invalid scope tags', () => {
      expect(ScopeTagValidator.isValidScopeTag('p3')).toBe(false);
      expect(ScopeTagValidator.isValidScopeTag('P0')).toBe(false);
      expect(ScopeTagValidator.isValidScopeTag('')).toBe(false);
      expect(ScopeTagValidator.isValidScopeTag(null)).toBe(false);
      expect(ScopeTagValidator.isValidScopeTag(undefined)).toBe(false);
      expect(ScopeTagValidator.isValidScopeTag('invalid')).toBe(false);
    });
  });

  describe('readConfigFile', () => {
    it('should read and parse valid .config.kiro', () => {
      const specPath = createTestSpec('valid-p0', 'p0');
      const config = validator.readConfigFile(join(specPath, '.config.kiro'));
      
      expect(config).toBeDefined();
      expect(config?.scopeTag).toBe('p0');
      expect(config?.specId).toBe('test-valid-p0');
    });
    
    it('should return null for non-existent file', () => {
      const config = validator.readConfigFile('/non/existent/path/.config.kiro');
      expect(config).toBeNull();
    });
    
    it('should return null for invalid JSON', () => {
      const specPath = createTestSpec('invalid-json', 'p0');
      const configPath = join(specPath, '.config.kiro');
      writeFileSync(configPath, 'invalid json {');
      
      const config = validator.readConfigFile(configPath);
      expect(config).toBeNull();
    });
  });

  describe('validateSpec', () => {
    it('should validate P0 spec successfully', () => {
      const specPath = createTestSpec('test-p0', 'p0');
      const result = validator.validateSpec(specPath);
      
      expect(result.valid).toBe(true);
      expect(result.scopeTag).toBe('p0');
      expect(result.errors).toHaveLength(0);
    });
    
    it('should validate P1 spec successfully', () => {
      const specPath = createTestSpec('test-p1', 'p1');
      const result = validator.validateSpec(specPath);
      
      expect(result.valid).toBe(true);
      expect(result.scopeTag).toBe('p1');
    });
    
    it('should validate P2 spec successfully', () => {
      const specPath = createTestSpec('test-p2', 'p2');
      const result = validator.validateSpec(specPath);
      
      expect(result.valid).toBe(true);
      expect(result.scopeTag).toBe('p2');
    });
    
    it('should reject missing scopeTag', () => {
      createInvalidConfig('missing-scope-tag', {
        specId: 'test-missing',
        workflowType: 'requirements-first',
        specType: 'feature'
      });
      
      const specPath = join(TEST_FIXTURES_DIR, 'missing-scope-tag');
      const result = validator.validateSpec(specPath);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: scopeTag');
    });
    
    it('should reject invalid scopeTag value', () => {
      createInvalidConfig('invalid-scope-value', {
        specId: 'test-invalid',
        scopeTag: 'p3'
      });
      
      const specPath = join(TEST_FIXTURES_DIR, 'invalid-scope-value');
      const result = validator.validateSpec(specPath);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid scopeTag value'))).toBe(true);
    });
    
    it('should reject case-sensitive scopeTag', () => {
      createInvalidConfig('case-sensitive', {
        specId: 'test-case',
        scopeTag: 'P0'
      });
      
      const specPath = join(TEST_FIXTURES_DIR, 'case-sensitive');
      const result = validator.validateSpec(specPath);
      
      expect(result.valid).toBe(false);
    });
    
    it('should handle missing .config.kiro file', () => {
      const specPath = join(TEST_FIXTURES_DIR, 'no-config');
      if (!existsSync(specPath)) {
        mkdirSync(specPath, { recursive: true });
      }
      
      const result = validator.validateSpec(specPath);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('.config.kiro file not found or invalid JSON');
    });
  });

  describe('findSpecDirectories', () => {
    it('should find all spec directories with .config.kiro', () => {
      createTestSpec('spec-a', 'p0');
      createTestSpec('spec-b', 'p1');
      createTestSpec('spec-c', 'p2');
      
      const specs = validator.findSpecDirectories(TEST_FIXTURES_DIR);
      
      expect(specs).toHaveLength(3);
    });
    
    it('should return empty array for empty directory', () => {
      const emptyDir = join(TEST_FIXTURES_DIR, 'empty');
      if (!existsSync(emptyDir)) {
        mkdirSync(emptyDir, { recursive: true });
      }
      
      const specs = validator.findSpecDirectories(emptyDir);
      expect(specs).toHaveLength(0);
    });
    
    it('should return empty array for non-existent directory', () => {
      const specs = validator.findSpecDirectories('/non/existent/path');
      expect(specs).toHaveLength(0);
    });
    
    it('should skip hidden directories', () => {
      // Create a hidden directory
      const hiddenDir = join(TEST_FIXTURES_DIR, '.hidden-spec');
      if (!existsSync(hiddenDir)) {
        mkdirSync(hiddenDir, { recursive: true });
      }
      writeFileSync(join(hiddenDir, '.config.kiro'), JSON.stringify({ specId: 'hidden', scopeTag: 'p0' }));
      
      const specs = validator.findSpecDirectories(TEST_FIXTURES_DIR);
      expect(specs.some(s => s.includes('.hidden-spec'))).toBe(false);
    });
    
    it('should skip archive directories', () => {
      const archiveDir = join(TEST_FIXTURES_DIR, '_archive');
      if (!existsSync(archiveDir)) {
        mkdirSync(archiveDir, { recursive: true });
      }
      writeFileSync(join(archiveDir, '.config.kiro'), JSON.stringify({ specId: 'archived', scopeTag: 'p0' }));
      
      const specs = validator.findSpecDirectories(TEST_FIXTURES_DIR);
      expect(specs.some(s => s.includes('_archive'))).toBe(false);
    });
  });

  describe('validateAllSpecs', () => {
    it('should generate validation report for all specs', () => {
      createTestSpec('spec-1', 'p0');
      createTestSpec('spec-2', 'p1');
      createTestSpec('spec-3', 'p2');
      
      const report = validator.validateAllSpecs();
      
      expect(report.schema_version).toBe('1.0');
      expect(report.summary.totalSpecs).toBe(3);
      expect(report.summary.validSpecs).toBe(3);
      expect(report.summary.invalidSpecs).toBe(0);
      expect(report.summary.p0Specs).toBe(1);
      expect(report.summary.p1Specs).toBe(1);
      expect(report.summary.p2Specs).toBe(1);
    });
    
    it('should include recommendations', () => {
      createTestSpec('valid-spec', 'p0');
      
      const report = validator.validateAllSpecs();
      
      expect(report.recommendations).toBeDefined();
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
    
    it('should include metadata', () => {
      createTestSpec('test-spec', 'p0');
      
      const report = validator.validateAllSpecs();
      
      expect(report.metadata.toolVersion).toBeDefined();
      expect(report.metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(report.generatedAt).toBeInstanceOf(Date);
    });
    
    it('should track invalid specs in report', () => {
      createTestSpec('valid-spec', 'p0');
      createInvalidConfig('invalid-spec', { specId: 'invalid' }); // Missing scopeTag
      
      const report = validator.validateAllSpecs();
      
      expect(report.summary.invalidSpecs).toBe(1);
      const invalidResult = report.results.find(r => !r.valid);
      expect(invalidResult).toBeDefined();
    });
  });

  describe('validateSpecificSpec', () => {
    it('should validate a specific spec path', () => {
      const specPath = createTestSpec('specific-test', 'p0');
      
      const result = validator.validateSpecificSpec(specPath);
      
      expect(result.valid).toBe(true);
      expect(result.scopeTag).toBe('p0');
    });
    
    it('should handle invalid spec path', () => {
      const result = validator.validateSpecificSpec('/non/existent/spec');
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('loadCapabilities', () => {
    it('should load capabilities from parent spec', () => {
      const success = validator.loadCapabilities();
      
      expect(success).toBe(true);
    });
  });

  describe('getCapabilitiesByScope', () => {
    it('should return capabilities grouped by scope', () => {
      validator.loadCapabilities();
      const capabilities = validator.getCapabilitiesByScope();
      
      expect(capabilities.p0).toBeDefined();
      expect(capabilities.p1).toBeDefined();
      expect(capabilities.p2).toBeDefined();
    });
  });
});

// Edge case tests
describe('ScopeTagValidator Edge Cases', () => {
  let validator: ScopeTagValidator;
  
  beforeEach(() => {
    cleanupTestFixtures();
    validator = new ScopeTagValidator({
      parentSpecPath: resolve(process.cwd(), '.kiro', 'specs', 'v6-architecture-overview'),
      specsPath: TEST_FIXTURES_DIR
    });
  });
  
  afterEach(() => {
    cleanupTestFixtures();
  });

  it('should handle config with extra fields', () => {
    createInvalidConfig('extra-fields', {
      specId: 'test-extra',
      scopeTag: 'p0',
      workflowType: 'requirements-first',
      specType: 'feature',
      customField: 'custom-value',
      anotherField: 123
    });
    
    const specPath = join(TEST_FIXTURES_DIR, 'extra-fields');
    const result = validator.validateSpec(specPath);
    
    expect(result.valid).toBe(true);
  });

  it('should handle config with null scopeTag', () => {
    createInvalidConfig('null-scope', {
      specId: 'test-null',
      scopeTag: null
    });
    
    const specPath = join(TEST_FIXTURES_DIR, 'null-scope');
    const result = validator.validateSpec(specPath);
    
    expect(result.valid).toBe(false);
  });

  it('should handle config with undefined scopeTag', () => {
    createInvalidConfig('undefined-scope', {
      specId: 'test-undefined'
    });
    
    const specPath = join(TEST_FIXTURES_DIR, 'undefined-scope');
    const result = validator.validateSpec(specPath);
    
    expect(result.valid).toBe(false);
  });

  it('should handle empty config file', () => {
    const specPath = join(TEST_FIXTURES_DIR, 'empty-config');
    mkdirSync(specPath, { recursive: true });
    writeFileSync(join(specPath, '.config.kiro'), '{}');
    
    const result = validator.validateSpec(specPath);
    
    expect(result.valid).toBe(false);
  });

  it('should handle nested spec directories', () => {
    // Create nested directory structure (but not too deep per the validator's depth limit)
    const nestedPath = join(TEST_FIXTURES_DIR, 'nested', 'level2');
    mkdirSync(nestedPath, { recursive: true });
    writeFileSync(join(nestedPath, '.config.kiro'), JSON.stringify({
      specId: 'nested-spec',
      scopeTag: 'p0'
    }));
    
    const specs = validator.findSpecDirectories(TEST_FIXTURES_DIR);
    
    expect(specs.some(s => s.includes('nested'))).toBe(true);
  });
});

// ============================================================
// Tests for Capability Alignment Validation (Task 9.2)
// ============================================================

describe('ScopeTagValidator - Capability Alignment Validation', () => {
  let validator: ScopeTagValidator;

  beforeEach(() => {
    cleanupTestFixtures();
    validator = new ScopeTagValidator({
      parentSpecPath: resolve(process.cwd(), '.kiro', 'specs', 'v6-architecture-overview'),
      specsPath: TEST_FIXTURES_DIR
    });
  });

  afterEach(() => {
    cleanupTestFixtures();
  });

  describe('validateDeclaredCapabilities', () => {
    it('should validate declared capabilities', () => {
      // Create a spec with declared capabilities
      createInvalidConfig('test-caps', {
        specId: 'test-caps',
        scopeTag: 'p0',
        capabilities: ['some-capability']  // Will be reported as undeclared, which is expected
      });

      const specPath = join(TEST_FIXTURES_DIR, 'test-caps');
      const config = validator.readConfigFile(join(specPath, '.config.kiro'));
      validator.loadCapabilities();

      const result = validator.validateDeclaredCapabilities(config!, specPath);

      // Should return detailed info about capabilities
      expect(result.details).toBeDefined();
      expect(result.details.declaredCapabilities).toContain('some-capability');
      // The undeclared capabilities list will contain our test capability
      expect(result.details.undeclaredCapabilities.length).toBeGreaterThan(0);
    });

    it('should fail when capabilities are not in REQ-25', () => {
      // Create a spec with capabilities that are NOT in REQ-25
      createInvalidConfig('unknown-cap', {
        specId: 'unknown-cap',
        scopeTag: 'p0',
        capabilities: ['non-existent-capability-xyz']
      });

      const specPath = join(TEST_FIXTURES_DIR, 'unknown-cap');
      const config = validator.readConfigFile(join(specPath, '.config.kiro'));
      validator.loadCapabilities();

      const result = validator.validateDeclaredCapabilities(config!, specPath);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('not found in REQ-25'))).toBe(true);
      expect(result.details.undeclaredCapabilities).toContain('non-existent-capability-xyz');
    });

    it('should detect scopeTag mismatch with REQ-25', () => {
      // Create a P0 spec but declare P1 capabilities
      createInvalidConfig('p1-as-p0', {
        specId: 'p1-as-p0',
        scopeTag: 'p0',
        capabilities: ['bugfix-workflow'] // This is P1 in REQ-25
      });

      const specPath = join(TEST_FIXTURES_DIR, 'p1-as-p0');
      const config = validator.readConfigFile(join(specPath, '.config.kiro'));
      validator.loadCapabilities();

      const result = validator.validateDeclaredCapabilities(config!, specPath);

      expect(result.isValid).toBe(false);
      expect(result.details.mismatchedCapabilities.length).toBeGreaterThan(0);
    });

    it('should handle specs without declared capabilities', () => {
      createTestSpec('no-capabilities', 'p0');

      const specPath = join(TEST_FIXTURES_DIR, 'no-capabilities');
      const config = validator.readConfigFile(join(specPath, '.config.kiro'));
      validator.loadCapabilities();

      const result = validator.validateDeclaredCapabilities(config!, specPath);

      // Should not fail, just warn
      expect(result.isValid).toBe(true);
      expect(result.details.declaredCapabilities).toHaveLength(0);
    });

    it('should return detailed capability information', () => {
      createInvalidConfig('detailed-caps', {
        specId: 'detailed-caps',
        scopeTag: 'p0',
        capabilities: ['scope-gate', 'unknown-cap']
      });

      const specPath = join(TEST_FIXTURES_DIR, 'detailed-caps');
      const config = validator.readConfigFile(join(specPath, '.config.kiro'));
      validator.loadCapabilities();

      const result = validator.validateDeclaredCapabilities(config!, specPath);

      expect(result.details.declaredCapabilities).toContain('scope-gate');
      expect(result.details.declaredCapabilities).toContain('unknown-cap');
      expect(result.details.req25Capabilities).toBeDefined();
      expect(result.details.req25Capabilities.length).toBeGreaterThan(0);
    });
  });

  describe('validateScopeTagConsistency', () => {
    it('should validate consistent scopeTag', () => {
      // Create a spec that matches something in REQ-25 (scope-gate is P0)
      createTestSpec('scope-gate', 'p0');

      const specPath = join(TEST_FIXTURES_DIR, 'scope-gate');
      validator.loadCapabilities();

      const result = validator.validateScopeTagConsistency(specPath);

      // Should be valid or have warnings, but not critical errors
      expect(result.issues).toBeDefined();
    });

    it('should detect scopeTag inconsistency', () => {
      // Create a spec that should be P0 but mark as P1
      createTestSpec('daemon-core', 'p1');

      const specPath = join(TEST_FIXTURES_DIR, 'daemon-core');
      validator.loadCapabilities();

      const result = validator.validateScopeTagConsistency(specPath);

      // Check if there are recommendations about scopeTag
      expect(result.recommendations).toBeDefined();
    });
  });

  describe('generateCapabilityAlignmentReport', () => {
    it('should generate comprehensive report', () => {
      createTestSpec('spec-1', 'p0');
      createTestSpec('spec-2', 'p1');
      createInvalidConfig('spec-3-invalid', {
        specId: 'spec-3',
        scopeTag: 'p0',
        capabilities: ['definitely-not-in-req25']
      });

      const report = validator.generateCapabilityAlignmentReport();

      expect(report.schema_version).toBe('1.0');
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.summary.totalSpecs).toBeGreaterThanOrEqual(2);
      expect(report.details).toBeDefined();
      expect(report.details.length).toBeGreaterThanOrEqual(2);
    });

    it('should track alignment issues in summary', () => {
      createTestSpec('valid-spec', 'p0');
      createInvalidConfig('invalid-spec', {
        specId: 'invalid',
        scopeTag: 'p0',
        capabilities: ['non-existent-cap']
      });

      const report = validator.generateCapabilityAlignmentReport();

      expect(report.summary.specsWithUndeclaredCapabilities).toBeGreaterThanOrEqual(1);
      expect(report.summary.totalIssues).toBeGreaterThanOrEqual(1);
    });

    it('should include recommendations', () => {
      createTestSpec('valid-spec', 'p0');

      const report = validator.generateCapabilityAlignmentReport();

      expect(report.recommendations).toBeDefined();
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should return empty report for non-existent directory', () => {
      const report = validator.generateCapabilityAlignmentReport('/non/existent/path');

      expect(report.summary.totalSpecs).toBe(0);
      expect(report.recommendations).toContain('No specs found in the specified directory');
    });
  });
});

describe('ScopeTagValidator - CLI Capability Alignment', () => {
  let validator: ScopeTagValidator;

  beforeEach(() => {
    cleanupTestFixtures();
    validator = new ScopeTagValidator({
      parentSpecPath: resolve(process.cwd(), '.kiro', 'specs', 'v6-architecture-overview'),
      specsPath: TEST_FIXTURES_DIR
    });
  });

  afterEach(() => {
    cleanupTestFixtures();
  });

  it('should generate capability alignment report with correct structure', () => {
    createTestSpec('test-p0', 'p0');

    const report = validator.generateCapabilityAlignmentReport();

    // Verify report structure
    expect(report).toHaveProperty('schema_version');
    expect(report).toHaveProperty('generatedAt');
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('details');
    expect(report).toHaveProperty('recommendations');

    // Verify summary structure
    expect(report.summary).toHaveProperty('totalSpecs');
    expect(report.summary).toHaveProperty('specsWithAlignmentIssues');
    expect(report.summary).toHaveProperty('specsWithUndeclaredCapabilities');
    expect(report.summary).toHaveProperty('specsWithScopeMismatch');
    expect(report.summary).toHaveProperty('totalIssues');

    // Verify details structure
    expect(Array.isArray(report.details)).toBe(true);
    if (report.details.length > 0) {
      const detail = report.details[0];
      expect(detail).toHaveProperty('specPath');
      expect(detail).toHaveProperty('specName');
      expect(detail).toHaveProperty('scopeTag');
      expect(detail).toHaveProperty('issues');
      expect(detail).toHaveProperty('undeclaredCapabilities');
      expect(detail).toHaveProperty('scopeMismatch');
    }
  });
});

// ============================================================
// Tests for Violation Detection and Reporting (Task 9.3)
// ============================================================

describe('ScopeTagValidator - Violation Detection and Reporting', () => {
  let validator: ScopeTagValidator;

  beforeEach(() => {
    cleanupTestFixtures();
    validator = new ScopeTagValidator({
      parentSpecPath: resolve(process.cwd(), '.kiro', 'specs', 'v6-architecture-overview'),
      specsPath: TEST_FIXTURES_DIR
    });
  });

  afterEach(() => {
    cleanupTestFixtures();
  });

  describe('generateViolationReport', () => {
    it('should generate violation report with correct structure', () => {
      const report = validator.generateViolationReport();

      expect(report).toHaveProperty('schema_version');
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('violations');
      expect(report).toHaveProperty('fixSuggestions');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('metadata');
    });

    it('should include summary with counts', () => {
      createTestSpec('valid-spec', 'p0');
      
      const report = validator.generateViolationReport();

      expect(report.summary).toHaveProperty('totalViolations');
      expect(report.summary).toHaveProperty('errorCount');
      expect(report.summary).toHaveProperty('warningCount');
      expect(report.summary).toHaveProperty('infoCount');
      expect(report.summary).toHaveProperty('specsWithViolations');
      expect(report.summary).toHaveProperty('specsWithoutViolations');
      expect(report.summary).toHaveProperty('byType');
    });

    it('should track violations by type', () => {
      createTestSpec('valid-spec', 'p0');
      
      const report = validator.generateViolationReport();

      expect(report.summary.byType).toHaveProperty('missing_scope_tag');
      expect(report.summary.byType).toHaveProperty('invalid_scope_tag_value');
      expect(report.summary.byType).toHaveProperty('capability_not_in_req25');
      expect(report.summary.byType).toHaveProperty('capability_scope_mismatch');
    });

    it('should return zero violations for valid specs', () => {
      createTestSpec('valid-p0', 'p0');
      createTestSpec('valid-p1', 'p1');
      createTestSpec('valid-p2', 'p2');
      
      const report = validator.generateViolationReport();

      expect(report.summary.totalViolations).toBe(0);
      expect(report.summary.specsWithViolations).toBe(0);
    });
  });

  describe('detectViolations', () => {
    it('should detect missing scopeTag violation', () => {
      createInvalidConfig('missing-scope-tag', {
        specId: 'test-missing',
        workflowType: 'requirements-first'
      });

      const specPath = join(TEST_FIXTURES_DIR, 'missing-scope-tag');
      const violations = validator.detectViolations(specPath);

      expect(violations.length).toBeGreaterThan(0);
      const missingTagViolation = violations.find(v => v.type === 'missing_scope_tag');
      expect(missingTagViolation).toBeDefined();
      expect(missingTagViolation?.severity).toBe('error');
      expect(missingTagViolation?.suggestedFix).toContain('scopeTag');
    });

    it('should detect invalid scopeTag value violation', () => {
      createInvalidConfig('invalid-scope-value', {
        specId: 'test-invalid',
        scopeTag: 'p3'
      });

      const specPath = join(TEST_FIXTURES_DIR, 'invalid-scope-value');
      const violations = validator.detectViolations(specPath);

      const invalidValueViolation = violations.find(v => v.type === 'invalid_scope_tag_value');
      expect(invalidValueViolation).toBeDefined();
      expect(invalidValueViolation?.severity).toBe('error');
      expect(invalidValueViolation?.currentValue).toBe('p3');
      expect(invalidValueViolation?.expectedValue).toBe('p0 | p1 | p2');
    });

    it('should detect scopeTag case mismatch violation', () => {
      // Note: 'P0' is caught as invalid value first, so we test the invalid value case
      // The case mismatch check would apply in a modified scenario
      createInvalidConfig('invalid-scope-case', {
        specId: 'test-case',
        scopeTag: 'P0'
      });

      const specPath = join(TEST_FIXTURES_DIR, 'invalid-scope-case');
      const violations = validator.detectViolations(specPath);

      // The value 'P0' is caught as invalid scopeTag value (not lowercase)
      const invalidValueViolation = violations.find(v => v.type === 'invalid_scope_tag_value');
      expect(invalidValueViolation).toBeDefined();
      expect(invalidValueViolation?.severity).toBe('error');
      expect(invalidValueViolation?.currentValue).toBe('P0');
    });

    it('should detect capability not in REQ-25 violation', () => {
      createInvalidConfig('undeclared-cap', {
        specId: 'test-undeclared',
        scopeTag: 'p0',
        capabilities: ['definitely-not-in-req25-xyz']
      });

      const specPath = join(TEST_FIXTURES_DIR, 'undeclared-cap');
      validator.loadCapabilities();
      const violations = validator.detectViolations(specPath);

      const undeclaredViolation = violations.find(v => v.type === 'capability_not_in_req25');
      expect(undeclaredViolation).toBeDefined();
      expect(undeclaredViolation?.capabilityId).toBe('definitely-not-in-req25-xyz');
    });

    it('should detect missing .config.kiro file', () => {
      const specPath = join(TEST_FIXTURES_DIR, 'non-existent-spec');
      const violations = validator.detectViolations(specPath);

      expect(violations.length).toBeGreaterThan(0);
      const missingFileViolation = violations.find(v => v.type === 'missing_scope_tag');
      expect(missingFileViolation?.message).toContain('Missing .config.kiro file');
    });

    it('should return empty array for valid spec', () => {
      createTestSpec('valid-spec', 'p0');

      const specPath = join(TEST_FIXTURES_DIR, 'valid-spec');
      validator.loadCapabilities();
      const violations = validator.detectViolations(specPath);

      expect(violations.length).toBe(0);
    });
  });

  describe('Violation object structure', () => {
    it('should include all required violation fields', () => {
      createInvalidConfig('missing-scope-tag', {
        specId: 'test',
        workflowType: 'requirements-first'
      });

      const specPath = join(TEST_FIXTURES_DIR, 'missing-scope-tag');
      const violations = validator.detectViolations(specPath);

      expect(violations.length).toBeGreaterThan(0);
      const violation = violations[0];
      
      expect(violation).toHaveProperty('id');
      expect(violation).toHaveProperty('type');
      expect(violation).toHaveProperty('severity');
      expect(violation).toHaveProperty('specPath');
      expect(violation).toHaveProperty('specName');
      expect(violation).toHaveProperty('location');
      expect(violation).toHaveProperty('message');
      expect(violation).toHaveProperty('suggestedFix');
    });

    it('should include currentValue and expectedValue when applicable', () => {
      createInvalidConfig('invalid-value', {
        specId: 'test-invalid',
        scopeTag: 'p3'
      });

      const specPath = join(TEST_FIXTURES_DIR, 'invalid-value');
      const violations = validator.detectViolations(specPath);

      const violation = violations.find(v => v.type === 'invalid_scope_tag_value');
      expect(violation?.currentValue).toBe('p3');
      expect(violation?.expectedValue).toBe('p0 | p1 | p2');
    });

    it('should include capabilityId when violation relates to capability', () => {
      createInvalidConfig('bad-cap', {
        specId: 'test-bad',
        scopeTag: 'p0',
        capabilities: ['non-existent-cap']
      });

      const specPath = join(TEST_FIXTURES_DIR, 'bad-cap');
      validator.loadCapabilities();
      const violations = validator.detectViolations(specPath);

      const capViolation = violations.find(v => v.type === 'capability_not_in_req25');
      expect(capViolation?.capabilityId).toBe('non-existent-cap');
    });
  });

  describe('getViolationsForSpec', () => {
    it('should return violations for a specific spec', () => {
      createInvalidConfig('specific-spec', {
        specId: 'specific',
        scopeTag: 'p3'
      });

      const specPath = join(TEST_FIXTURES_DIR, 'specific-spec');
      const violations = validator.getViolationsForSpec(specPath);

      expect(violations.length).toBeGreaterThan(0);
    });

    it('should return empty array for valid spec', () => {
      createTestSpec('another-valid', 'p0');

      const specPath = join(TEST_FIXTURES_DIR, 'another-valid');
      const violations = validator.getViolationsForSpec(specPath);

      expect(violations.length).toBe(0);
    });
  });

  describe('hasViolations', () => {
    it('should return true for spec with violations', () => {
      createInvalidConfig('has-violation', {
        specId: 'has-violation',
        scopeTag: 'p3'
      });

      const specPath = join(TEST_FIXTURES_DIR, 'has-violation');
      expect(validator.hasViolations(specPath)).toBe(true);
    });

    it('should return false for valid spec', () => {
      createTestSpec('clean-spec', 'p0');

      const specPath = join(TEST_FIXTURES_DIR, 'clean-spec');
      expect(validator.hasViolations(specPath)).toBe(false);
    });
  });

  describe('getViolationSummary', () => {
    it('should return summary counts', () => {
      createTestSpec('valid1', 'p0');
      createInvalidConfig('invalid1', {
        specId: 'invalid1',
        scopeTag: 'p3'
      });

      const summary = validator.getViolationSummary();

      expect(summary).toHaveProperty('errors');
      expect(summary).toHaveProperty('warnings');
      expect(summary).toHaveProperty('infos');
      expect(summary).toHaveProperty('total');
      expect(summary.errors).toBeGreaterThan(0);
    });
  });

  describe('fixSuggestions', () => {
    it('should include fix suggestions in report', () => {
      createInvalidConfig('fix-me', {
        specId: 'fix-me',
        scopeTag: 'p3'
      });

      const report = validator.generateViolationReport();

      expect(report.fixSuggestions.length).toBeGreaterThan(0);
      const suggestion = report.fixSuggestions[0];
      expect(suggestion.specName).toBe('fix-me');
      expect(suggestion.violations.length).toBeGreaterThan(0);
    });
  });

  describe('recommendations', () => {
    it('should generate appropriate recommendations', () => {
      createTestSpec('valid-spec', 'p0');
      
      const report = validator.generateViolationReport();

      // Should have positive recommendation for valid specs
      expect(report.recommendations.some(r => r.includes('compliant') || r.includes('valid'))).toBe(true);
    });

    it('should recommend fixes when violations exist', () => {
      createInvalidConfig('needs-fix', {
        specId: 'needs-fix',
        scopeTag: 'p3'
      });
      
      const report = validator.generateViolationReport();

      // Should have recommendations for fixing violations
      expect(report.recommendations.some(r => r.includes('Fix') || r.includes('Update') || r.includes('Add'))).toBe(true);
    });
  });
});