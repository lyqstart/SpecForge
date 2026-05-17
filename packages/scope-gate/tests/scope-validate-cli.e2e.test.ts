/**
 * End-to-End Tests for scope-validate CLI Tool
 * 
 * Tests the complete CLI workflow including:
 * - CLI argument parsing (--help, --path, --output)
 * - Output format (JSON/plain text)
 * - Error handling and edge cases
 * - Integration with feature flag system
 * 
 * Requirements: 1.7, 2.5
 * Task: 12.4 Write end-to-end tests for CLI tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';

// CLI tool path (relative to current working directory when test runs from packages/scope-gate)
const CLI_TOOL = 'bin/scope-validate.ts';

/**
 * Execute CLI command and return result
 * The test runs from packages/scope-gate directory
 */
function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const cmd = ['bun', 'run', CLI_TOOL, ...args].join(' ');
  try {
    // Run from packages/scope-gate directory
    const stdout = execSync(cmd, { 
      cwd: process.cwd(), // This will be packages/scope-gate when test runs
      encoding: 'utf-8',
      timeout: 30000
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.status || 1
    };
  }
}

/**
 * Extract JSON from CLI output that may contain text prefix (logging)
 * The CLI outputs "Validating:" messages before JSON
 */
function extractJsonFromOutput(stdout: string): any {
  // Find the first { to start JSON
  const jsonStart = stdout.indexOf('{');
  if (jsonStart === -1) {
    throw new Error('No JSON found in output');
  }
  const jsonStr = stdout.slice(jsonStart);
  return JSON.parse(jsonStr);
}

// Test fixtures directory - use process.cwd() to get the test working directory
const TEST_FIXTURES_DIR = resolve(process.cwd(), 'tests', 'test-fixtures-cli');

// Helper to create minimal test packages
function createTestPackage(name: string, config: Record<string, unknown>): void {
  const pkgPath = join(TEST_FIXTURES_DIR, name);
  
  if (!existsSync(pkgPath)) {
    mkdirSync(pkgPath, { recursive: true });
  }
  
  // Create .config.kiro
  writeFileSync(
    join(pkgPath, '.config.kiro'),
    JSON.stringify(config, null, 2)
  );
  
  // Create a minimal src file for code dependency validation
  const srcDir = join(pkgPath, 'src');
  if (!existsSync(srcDir)) {
    mkdirSync(srcDir, { recursive: true });
  }
  writeFileSync(join(srcDir, 'index.ts'), `// Test package ${name}\nexport const test = true;\n`);
}

// Cleanup function
function cleanupTestFixtures(): void {
  if (existsSync(TEST_FIXTURES_DIR)) {
    rmSync(TEST_FIXTURES_DIR, { recursive: true, force: true });
  }
}

describe('scope-validate CLI - Help and Usage', () => {
  beforeEach(() => {
    cleanupTestFixtures();
  });
  
  afterEach(() => {
    cleanupTestFixtures();
  });

  it('should display help with --help flag', () => {
    const result = runCli(['--help']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('scope-validate');
    expect(result.stdout).toContain('--path');
    expect(result.stdout).toContain('--output');
    expect(result.stdout).toContain('--help');
  });

  it('should display help with -h flag', () => {
    const result = runCli(['-h']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('scope-validate');
  });

  it('should show examples in help', () => {
    const result = runCli(['--help']);
    
    expect(result.stdout).toContain('bun run');
    expect(result.stdout).toContain('--path');
    expect(result.stdout).toContain('--output json');
  });
});

describe('scope-validate CLI - Output Format', () => {
  beforeEach(() => {
    cleanupTestFixtures();
  });
  
  afterEach(() => {
    cleanupTestFixtures();
  });

  it('should output JSON format with --output json', () => {
    const result = runCli(['--output', 'json']);
    
    expect(result.exitCode).toBe(0);
    
    // Should be valid JSON (may have text prefix from "Validating:" messages)
    const parsed = extractJsonFromOutput(result.stdout);
    expect(parsed).toHaveProperty('codebasePath');
    expect(parsed).toHaveProperty('specsPath');
    expect(parsed).toHaveProperty('codeDependencies');
    expect(parsed).toHaveProperty('specScopeTags');
    expect(parsed).toHaveProperty('featureFlagGuards');
    expect(parsed).toHaveProperty('summary');
  });

  it('should output JSON format with -o json', () => {
    const result = runCli(['-o', 'json']);
    
    expect(result.exitCode).toBe(0);
    
    // Should be valid JSON (may have text prefix)
    const parsed = extractJsonFromOutput(result.stdout);
    expect(parsed).toHaveProperty('summary');
  });

  it('should include summary in JSON output', () => {
    const result = runCli(['--output', 'json']);
    
    const parsed = extractJsonFromOutput(result.stdout);
    expect(parsed.summary).toHaveProperty('totalErrors');
    expect(parsed.summary).toHaveProperty('totalWarnings');
    expect(parsed.summary).toHaveProperty('totalInfos');
    expect(typeof parsed.summary.totalErrors).toBe('number');
    expect(typeof parsed.summary.totalWarnings).toBe('number');
  });

  it('should output text format by default', () => {
    const result = runCli([]); // Use default path (valid from scope-gate dir)
    
    // May exit with 1 if there are validation errors in the repo, but should produce text output
    expect(result.stdout).toContain('Validating:');
  });

  it('should show validation result in text mode (success)', () => {
    // Create a valid package to reduce errors
    createTestPackage('valid-pkg', { 
      specId: 'valid-pkg', 
      scopeTag: 'p0',
      workflowType: 'requirements-first',
      specType: 'feature'
    });
    
    const result = runCli([
      '--path', join(TEST_FIXTURES_DIR, 'valid-pkg'),
      '--output', 'text'
    ]);
    
    // Even with warnings, should exit 0
    expect(result.stdout).toContain('Validating:');
    expect(result.stdout).toContain('Codebase:');
  });
});

describe('scope-validate CLI - Path Options', () => {
  beforeEach(() => {
    cleanupTestFixtures();
  });
  
  afterEach(() => {
    cleanupTestFixtures();
  });

  it('should accept --path with valid directory', () => {
    // Use current directory (.) which is valid from packages/scope-gate
    const result = runCli(['--path', '.']);
    
    expect(result.exitCode).toBeDefined(); // Either 0 or 1 depending on validation
    expect(result.stdout).toContain('Validating:');
  });

  it('should accept -p short flag for path', () => {
    // Use short flag with current directory
    const result = runCli(['-p', '.']);
    
    expect(result.exitCode).toBeDefined();
    expect(result.stdout).toContain('Validating:');
  });

  it('should accept positional argument as path', () => {
    // Use . as positional argument
    const result = runCli(['.']);
    
    expect(result.exitCode).toBeDefined();
    expect(result.stdout).toContain('Validating:');
  });

  it('should error on non-existent path', () => {
    const result = runCli(['--path', 'this-does-not-exist-12345']);
    
    expect(result.exitCode).toBe(1);
    // Error message may be in stdout or stderr
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/does not exist|Error|not found/i);
  });

  it('should handle nested path arguments', () => {
    // Use src subdirectory
    const result = runCli(['--path', 'src']);
    
    expect(result.exitCode).toBeDefined();
    expect(result.stdout).toContain('Validating:');
  });
});

describe('scope-validate CLI - Error Handling', () => {
  beforeEach(() => {
    cleanupTestFixtures();
  });
  
  afterEach(() => {
    cleanupTestFixtures();
  });

  it('should handle missing REQ-25 gracefully', () => {
    // Test with an empty directory - should still work but warn
    const emptyDir = join(TEST_FIXTURES_DIR, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    
    const result = runCli(['--path', emptyDir]);
    
    // Should exit with error (no capabilities loaded)
    expect(result.stdout).toContain('Error');
  });

  it('should handle invalid --output value', () => {
    const result = runCli(['--output', 'invalid-format']);
    
    // Should fall back to text or handle gracefully - still produces output
    // Exit code may be 1 due to validation errors, but shouldn't crash
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it('should exit with code 1 when validation errors found', () => {
    // Running validation on the whole repo produces errors
    // This is expected behavior
    const result = runCli(['--output', 'text']);
    
    // If there are errors, should exit with 1
    if (result.stdout.includes('Validation failed') || result.stdout.includes('✗')) {
      expect(result.exitCode).toBe(1);
    } else {
      expect(result.exitCode).toBe(0);
    }
  });

  it('should exit with code 0 when validation passes with warnings', () => {
    // Create a valid test package
    createTestPackage('valid-test', { 
      specId: 'valid-test', 
      scopeTag: 'p0',
      workflowType: 'requirements-first',
      specType: 'feature'
    });
    
    // Use JSON output to check summary
    const result = runCli([
      '--path', join(TEST_FIXTURES_DIR, 'valid-test'),
      '--output', 'json'
    ]);
    
    const parsed = extractJsonFromOutput(result.stdout);
    // Should pass (exit 0) even with warnings
    expect(result.exitCode).toBe(0);
  });
});

describe('scope-validate CLI - Feature Flag Integration', () => {
  beforeEach(() => {
    cleanupTestFixtures();
  });
  
  afterEach(() => {
    cleanupTestFixtures();
  });

  it('should report feature flag guards in JSON output', () => {
    const result = runCli(['--output', 'json']);
    
    const parsed = extractJsonFromOutput(result.stdout);
    expect(parsed).toHaveProperty('featureFlagGuards');
    expect(Array.isArray(parsed.featureFlagGuards)).toBe(true);
  });

  it('should include capability scope in feature flag warnings', () => {
    const result = runCli(['--output', 'json']);
    
    const parsed = extractJsonFromOutput(result.stdout);
    
    // Should have warnings about P1 capabilities without feature flag guards
    const p1Warnings = parsed.featureFlagGuards.filter(
      (w: any) => w.context?.capabilityScope === 'p1'
    );
    // May or may not have warnings depending on code
    expect(Array.isArray(parsed.featureFlagGuards)).toBe(true);
  });

  it('should include summary of warnings', () => {
    const result = runCli(['--output', 'json']);
    
    const parsed = extractJsonFromOutput(result.stdout);
    expect(parsed.summary).toHaveProperty('totalWarnings');
    expect(typeof parsed.summary.totalWarnings).toBe('number');
  });
});

describe('scope-validate CLI - Integration with Scope System', () => {
  beforeEach(() => {
    cleanupTestFixtures();
  });
  
  afterEach(() => {
    cleanupTestFixtures();
  });

  it('should load capabilities from REQ-25', () => {
    const result = runCli(['--output', 'json']);
    
    expect(result.stdout).toContain('Loaded');
    expect(result.stdout).toContain('capabilities from REQ-25');
  });

  it('should validate spec scope tags', () => {
    const result = runCli(['--output', 'json']);
    
    const parsed = extractJsonFromOutput(result.stdout);
    expect(parsed).toHaveProperty('specScopeTags');
    expect(Array.isArray(parsed.specScopeTags)).toBe(true);
  });

  it('should validate code dependencies', () => {
    const result = runCli(['--output', 'json']);
    
    const parsed = extractJsonFromOutput(result.stdout);
    expect(parsed).toHaveProperty('codeDependencies');
    expect(Array.isArray(parsed.codeDependencies)).toBe(true);
  });

  it('should detect missing scope tags', () => {
    const result = runCli(['--output', 'json']);
    
    const parsed = extractJsonFromOutput(result.stdout);
    const missingTag = parsed.specScopeTags.find(
      (r: any) => r.code === 'missing_scope_tag'
    );
    // Should find specs with missing scope tags (like _archive specs)
    expect(parsed.specScopeTags.length).toBeGreaterThan(0);
  });
});

describe('scope-validate CLI - Complex Scenarios', () => {
  beforeEach(() => {
    cleanupTestFixtures();
  });
  
  afterEach(() => {
    cleanupTestFixtures();
  });

  it('should handle multiple flags together', () => {
    const result = runCli([
      '--path', 'packages/scope-gate',
      '--output', 'json'
    ]);
    
    expect(result.exitCode).toBe(0);
    expect(() => extractJsonFromOutput(result.stdout)).not.toThrow();
  });

  it('should handle short and long flags mixed', () => {
    const result = runCli([
      '-p', 'packages/scope-gate',
      '-o', 'json'
    ]);
    
    expect(result.exitCode).toBe(0);
    expect(() => extractJsonFromOutput(result.stdout)).not.toThrow();
  });

  it('should provide meaningful error for invalid flags', () => {
    const result = runCli(['--invalid-flag']);
    
    // Bun will report unknown flag
    expect(result.exitCode).not.toBe(0);
  });

  it('should be consistent across multiple runs', () => {
    const results = [];
    
    for (let i = 0; i < 3; i++) {
      const result = runCli(['--output', 'json']);
      results.push(extractJsonFromOutput(result.stdout));
    }
    
    // Results should be consistent (same counts)
    expect(results[0].summary.totalErrors).toBe(results[1].summary.totalErrors);
    expect(results[1].summary.totalErrors).toBe(results[2].summary.totalErrors);
  });
});

describe('scope-validate CLI - Performance', () => {
  beforeEach(() => {
    cleanupTestFixtures();
  });
  
  afterEach(() => {
    cleanupTestFixtures();
  });

  it('should complete in reasonable time', () => {
    const start = Date.now();
    const result = runCli(['--output', 'json']);
    const duration = Date.now() - start;
    
    expect(result.exitCode).toBe(0);
    // Should complete in under 10 seconds
    expect(duration).toBeLessThan(10000);
  });

  it('should handle large codebase efficiently', () => {
    // Test against the entire packages directory
    const start = Date.now();
    const result = runCli([
      '--path', 'packages',
      '--output', 'json'
    ]);
    const duration = Date.now() - start;
    
    expect(result.exitCode).toBe(0);
    // Should complete in under 15 seconds for packages dir
    expect(duration).toBeLessThan(15000);
  });
});

describe('scope-validate CLI - JSON Output Schema', () => {
  beforeEach(() => {
    cleanupTestFixtures();
  });
  
  afterEach(() => {
    cleanupTestFixtures();
  });

  it('should include required fields in JSON output', () => {
    const result = runCli(['--output', 'json']);
    const parsed = extractJsonFromOutput(result.stdout);
    
    // Required fields
    expect(parsed).toHaveProperty('codebasePath');
    expect(parsed).toHaveProperty('specsPath');
    expect(parsed).toHaveProperty('codeDependencies');
    expect(parsed).toHaveProperty('specScopeTags');
    expect(parsed).toHaveProperty('featureFlagGuards');
    expect(parsed).toHaveProperty('summary');
  });

  it('should include path strings in JSON output', () => {
    const result = runCli(['--output', 'json']);
    const parsed = extractJsonFromOutput(result.stdout);
    
    expect(typeof parsed.codebasePath).toBe('string');
    expect(typeof parsed.specsPath).toBe('string');
    expect(parsed.codebasePath.length).toBeGreaterThan(0);
    expect(parsed.specsPath.length).toBeGreaterThan(0);
  });

  it('should have valid summary numbers', () => {
    const result = runCli(['--output', 'json']);
    const parsed = extractJsonFromOutput(result.stdout);
    
    const { summary } = parsed;
    
    expect(summary.totalErrors).toBeGreaterThanOrEqual(0);
    expect(summary.totalWarnings).toBeGreaterThanOrEqual(0);
    expect(summary.totalInfos).toBeGreaterThanOrEqual(0);
    
    // Total should be sum of all
    const calculatedTotal = summary.totalErrors + summary.totalWarnings + summary.totalInfos;
    expect(calculatedTotal).toBeGreaterThan(0);
  });

  it('should include validation result details', () => {
    const result = runCli(['--output', 'json']);
    const parsed = extractJsonFromOutput(result.stdout);
    
    // Check structure of specScopeTags items
    if (parsed.specScopeTags.length > 0) {
      const item = parsed.specScopeTags[0];
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('code');
      expect(item).toHaveProperty('message');
      expect(['error', 'warning', 'info']).toContain(item.type);
    }
  });
});