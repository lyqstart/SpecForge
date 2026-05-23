/**
 * Unit test for MIN_SUPPORTED_DATA_SCHEMA single source requirement.
 * 
 * Validates: Requirement 6.1
 * > THE SpecForge_System SHALL declare `min_supported_data_schema` exactly once in source code,
 * > in a constant named `MIN_SUPPORTED_DATA_SCHEMA` exported from a single dedicated module.
 * 
 * This test verifies that the assignment `MIN_SUPPORTED_DATA_SCHEMA = N` or `MIN_SUPPORTED_DATA_SCHEMA: N`
 * only appears in the designated constants.ts file.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repository root is three levels up from tests/unit/
// tests/unit -> tests -> version-unification (package root) -> packages -> repo root
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const EXPECTED_FILE = 'packages/version-unification/src/constants.ts';
const EXPECTED_FILE_ABSOLUTE = path.join(REPO_ROOT, EXPECTED_FILE);
const CONSTANT_NAME = 'MIN_SUPPORTED_DATA_SCHEMA';

// Directories to skip when searching
const SKIP_DIRS = [
  'node_modules',
  '.git',
  'dist',
  '.kiro',
];

/**
 * Recursively find all TypeScript/JavaScript source files in the repository
 * Limits search to key directories to improve performance
 */
async function findSourceFiles(dir: string, files: string[] = [], depth = 0): Promise<string[]> {
  // Limit recursion depth and skip certain directories
  if (depth > 4) return files;
  
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip certain directories
      if (SKIP_DIRS.includes(entry.name)) {
        continue;
      }
      // Skip .kiro directory entirely
      if (entry.name === '.kiro') {
        continue;
      }
      // Skip deep nested directories that are unlikely to have the constant
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      await findSourceFiles(fullPath, files, depth + 1);
    } else if (entry.isFile()) {
      // Only process .ts and .tsx files
      if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

/**
 * Check if a file should be skipped
 */
function shouldSkipFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  return SKIP_FILES.some(skip => filePath.includes(skip));
}

describe('MIN_SUPPORTED_DATA_SCHEMA single source (R6.1)', () => {
  const EXPECTED_FILE = 'packages/version-unification/src/constants.ts';
  const EXPECTED_FILE_ABSOLUTE = path.join(REPO_ROOT, EXPECTED_FILE);
  const CONSTANT_NAME = 'MIN_SUPPORTED_DATA_SCHEMA';

  // Files to skip (test files that generate sample code for testing purposes)
  const SKIP_FILES = [
    'min-schema-rule.test.ts',
    'schema-introduction-rule.test.ts',
    'version-unification-property-15.property.test.ts',
  ];

  /**
   * Check if a file should be skipped
   */
  function shouldSkipFile(filePath: string): boolean {
    return SKIP_FILES.some(skip => filePath.includes(skip));
  }

  it('should only be declared in constants.ts', async () => {
    // Search in specific directories that are likely to contain source code
    // This is more efficient than scanning the entire repository
    const searchDirs = [
      path.join(REPO_ROOT, 'packages'),
      path.join(REPO_ROOT, 'scripts'),
      path.join(REPO_ROOT, '.opencode'),
    ];
    
    const allFiles: string[] = [];
    
    for (const searchDir of searchDirs) {
      try {
        await findSourceFiles(searchDir, allFiles, 0);
      } catch {
        // Directory might not exist, skip it
      }
    }
    
    // Search for assignments to MIN_SUPPORTED_DATA_SCHEMA
    const assignmentOccurrences: Array<{ file: string; line: number; content: string }> = [];

    for (const filePath of allFiles) {
      // Skip files that should be excluded
      if (shouldSkipFile(filePath)) {
        continue;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Look for assignment pattern: MIN_SUPPORTED_DATA_SCHEMA = N or MIN_SUPPORTED_DATA_SCHEMA: N
        if (line.includes(CONSTANT_NAME)) {
          // Check for actual assignment (not just references)
          // Valid: export const MIN_SUPPORTED_DATA_SCHEMA: number = N
          //        const MIN_SUPPORTED_DATA_SCHEMA = N
          // Invalid: import { MIN_SUPPORTED_DATA_SCHEMA } from ...
          //          // comment about MIN_SUPPORTED_DATA_SCHEMA = N
          const isAssignment = /^(export\s+)?const\s+MIN_SUPPORTED_DATA_SCHEMA\s*[:=]\s*\d+/.test(line.trim());
          
          if (isAssignment) {
            // Skip the expected constants.ts file
            if (filePath === EXPECTED_FILE_ABSOLUTE) {
              continue;
            }
            
            assignmentOccurrences.push({
              file: filePath,
              line: i + 1, // 1-indexed
              content: line.trim(),
            });
          }
        }
      }
    }

    // Assert that no unexpected assignments were found
    expect(assignmentOccurrences, 
      `MIN_SUPPORTED_DATA_SCHEMA should only be declared in ${EXPECTED_FILE}. ` +
      `Found unexpected assignments in: ${assignmentOccurrences.map(o => `${path.relative(REPO_ROOT, o.file)}:${o.line}`).join(', ')}`
    ).toHaveLength(0);
  });

  it('should exist in constants.ts', async () => {
    // Verify that MIN_SUPPORTED_DATA_SCHEMA is actually defined in constants.ts
    const content = await fs.readFile(EXPECTED_FILE_ABSOLUTE, 'utf-8');
    
    const hasExport = content.includes(`export const ${CONSTANT_NAME}`);
    
    expect(hasExport, 
      `MIN_SUPPORTED_DATA_SCHEMA should be exported from ${EXPECTED_FILE}`
    ).toBe(true);
  });
});