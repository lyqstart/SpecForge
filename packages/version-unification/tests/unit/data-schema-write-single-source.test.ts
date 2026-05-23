/**
 * Unit Test: data_schema_version writer single source
 *
 * Validates: Requirement 7.1
 *
 *   THE SpecForge_System SHALL restrict writes to the `data_schema_version`
 *   field of any Project_Manifest to a single dedicated writer module.
 *
 * This test verifies that data_schema_version assignments exist ONLY in:
 *   - packages/version-unification/src/manifest/project-manifest-writer.ts
 *
 * Test files, spec files, and documentation are exempt from this rule
 * (they legitimately contain fixtures and prose about the field).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

// Compute repo root relative to this test file's location
// Use import.meta.url for ESM compatibility - works in vitest/bun
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const TEST_DIR = dirname(__filename);

// Path calculation:
// TEST_DIR = packages/version-unification/tests/unit
// We want to get to the repo root where package.json is
// The test is at: <repo>/packages/version-unification/tests/unit/<test>.test.ts
// So we need: TEST_DIR + ../../../../..
// But let's use a simpler approach - compute relative segments:
// - unit: 1 level up
// - tests: 2 levels up
// - version-unification: 3 levels up  
// - packages: 4 levels up
// - REPO_ROOT: 4 levels up from unit = packages/../../../.. = ../../..

// Hard-code for this specific location
const UP_TO_ROOT = join(TEST_DIR, '../../../../..');
// This should give us: packages/version-unification/tests/unit + ../../../../..
// = packages/version-unification/tests/unit/../../../..
// = packages/version-unification/tests/../../..
// = packages/version-unification/../..
// = packages/..
// = <repo_root>

// For safety, also try detecting SPECFORGE_REPO env or use process.cwd()
const envRoot = process.env.SPECFORGE_REPO || process.cwd();
const REPO_ROOT = existsSync(join(envRoot, 'package.json')) ? envRoot : UP_TO_ROOT;

const PACKAGES_DIR = join(REPO_ROOT, 'packages');
const SCRIPTS_DIR = join(REPO_ROOT, 'scripts');
const VERSION_UNIFICATION_DIR = join(PACKAGES_DIR, 'version-unification');

// Debug: verify paths
console.log('TEST_DIR:', TEST_DIR);
console.log('UP_TO_ROOT:', UP_TO_ROOT);
console.log('envRoot (cwd):', envRoot);
console.log('REPO_ROOT:', REPO_ROOT);
console.log('PACKAGES_DIR exists:', existsSync(PACKAGES_DIR));
console.log('SCRIPTS_DIR exists:', existsSync(SCRIPTS_DIR));
console.log('VERSION_UNIFICATION_DIR exists:', existsSync(VERSION_UNIFICATION_DIR));

// The only allowed source file for data_schema_version writes
// Relative to repo root
const DEDICATED_WRITER = 'packages/version-unification/src/manifest/project-manifest-writer.ts';

/**
 * Recursively find all TypeScript source files in given directories,
 * excluding test files and node_modules.
 */
function findSourceFiles(dirs: string[]): string[] {
  const files: string[] = [];

  function scan(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules, dist, .git
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
          continue;
        }
        // Recurse into subdirectories
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        // Skip test files
        if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) {
          continue;
        }
        // Skip files in __test__ directories (CI test fixtures)
        if (dir.includes('__test__')) {
          continue;
        }
        files.push(fullPath);
      }
    }
  }

  for (const dir of dirs) {
    scan(dir);
  }

  return files;
}

/**
 * Check if a file path is a test file ( exemptions per R7.1 spec).
 */
function isTestFile(path: string): boolean {
  return path.includes('/tests/') || path.endsWith('.test.ts') || path.endsWith('.test.tsx');
}

/**
 * Check if a file path is a spec/doc file (exemptions per R7.1 spec).
 */
function isSpecOrDocFile(path: string): boolean {
  return path.includes('.kiro/specs/') || path.endsWith('.md');
}

/**
 * Check if a file is the dedicated writer.
 * Extracts the relative path from the absolute path, then compares.
 */
function isDedicatedWriter(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  // Extract the part after REPO_ROOT to get the relative path
  const relativePath = normalized.replace(REPO_ROOT.replace(/\\/g, '/'), '').replace(/^\//, '');
  return relativePath === DEDICATED_WRITER;
}

/**
 * Check if a line contains a data_schema_version write assignment.
 * Matches: data_schema_version: N or data_schema_version = N
 * Does NOT match:
 *   - Type definitions: readonly data_schema_version: number
 *   - Property access: obj.data_schema_version
 *   - Type queries: typeof x.data_schema_version
 *   - String templates: `data_schema_version: ${x}`
 *   - Type assertions: (parsed as { data_schema_version: number })
 *   - data_schema_version_history = [] (different identifier)
 */
function hasDataSchemaVersionWrite(line: string): boolean {
  // Remove single-line comments
  const codeLine = line.replace(/\/\/.*$/, '');
  
  // Skip lines that are clearly not assignments:
  
  // 1. String templates (backticks) - these are typically for display/output
  if (codeLine.includes('`') && codeLine.includes('data_schema_version')) {
    return false;
  }
  
  // 2. Type assertions (as) and type definitions (readonly)
  if (codeLine.includes('as') && codeLine.includes('data_schema_version')) {
    return false;
  }
  if (codeLine.includes('readonly') && codeLine.includes('data_schema_version')) {
    return false;
  }
  
  // 3. typeof expressions
  if (codeLine.includes('typeof') && codeLine.includes('data_schema_version')) {
    return false;
  }
  
  // 4. Property access (.data_schema_version)
  if (/\.\s*data_schema_version\s*[=)]/.test(codeLine)) {
    return false;
  }
  
  // 5. Interface/type definitions - typically at start of line or after {
  if (/^\s*(?:export\s+)?(?:interface|type|readonly)\s+.*data_schema_version/.test(codeLine)) {
    return false;
  }
  
  // Check for direct assignment: data_schema_version: value or data_schema_version = value
  // Must NOT be followed by underscore (which would be a longer identifier)
  // Must be preceded by { or , or ; or start of line or whitespace
  // Pattern: after { or , comes data_schema_version: value (object literal pattern)
  const writePattern = /(?:^|\{|\,)\s*data_schema_version\s*[:=](?!\s*_)/;
  return writePattern.test(codeLine);
}

describe('Requirement 7.1: data_schema_version single source', () => {
  it('should restrict data_schema_version writes to project-manifest-writer.ts only', () => {
    // Find all TypeScript source files in packages/ and scripts/
    const sourceFiles = findSourceFiles([PACKAGES_DIR, SCRIPTS_DIR]);

    const violations: Array<{ file: string; line: number; content: string }> = [];

    for (const file of sourceFiles) {
      const normalizedPath = file.replace(/\\/g, '/');

      // Skip the dedicated writer - it's allowed to have writes
      if (isDedicatedWriter(normalizedPath)) {
        continue;
      }

      // Skip test files - they legitimately contain fixtures
      if (isTestFile(normalizedPath)) {
        continue;
      }

      // Skip spec/doc files - they legitimately mention the field in prose
      if (isSpecOrDocFile(normalizedPath)) {
        continue;
      }

      // Read file content and check each line
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comment lines
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue;
        }

        if (hasDataSchemaVersionWrite(line)) {
          const relativePath = relative(REPO_ROOT, file);
          violations.push({
            file: relativePath,
            line: i + 1,
            content: line.trim(),
          });
        }
      }
    }

    // Assert no violations found
    if (violations.length > 0) {
      const details = violations
        .map((v) => `  - ${v.file}:${v.line}: ${v.content}`)
        .join('\n');
      throw new Error(
        `Found data_schema_version writes outside dedicated writer:\n${details}\n\n` +
        `Only ${DEDICATED_WRITER} is allowed to write data_schema_version.`
      );
    }
  });

  it('should have at least one data_schema_version write in the dedicated writer', () => {
    // The dedicated writer is at packages/version-unification/src/manifest/project-manifest-writer.ts
    const writerPath = resolve(VERSION_UNIFICATION_DIR, 'src/manifest/project-manifest-writer.ts');

    const content = readFileSync(writerPath, 'utf-8');
    const lines = content.split('\n');

    let foundWrite = false;
    for (const line of lines) {
      if (hasDataSchemaVersionWrite(line)) {
        foundWrite = true;
        break;
      }
    }

    expect(foundWrite).toBe(true);
  });
});