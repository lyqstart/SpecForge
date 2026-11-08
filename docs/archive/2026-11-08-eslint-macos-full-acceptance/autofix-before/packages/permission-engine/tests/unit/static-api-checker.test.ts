/**
 * Static API Checker Unit Tests
 * 
 * @specforge/permission-engine
 */

import { describe, it, expect } from 'vitest';
import {
  StaticApiChecker,
  createRestrictiveStaticApiChecker,
  createStaticApiCheckerWithFilesystem,
  createStaticApiCheckerWithNetwork,
  ProhibitedApiType,
  ProhibitedApiCategory
} from '../../src/services/static-api-checker';

describe('StaticApiChecker', () => {
  describe('child_process.exec detection', () => {
    it('should detect child_process.exec', () => {
      const checker = createRestrictiveStaticApiChecker();
      const result = checker.check(
        `const child_process = require('child_process');
child_process.exec('ls -la', (err, stdout) => { });`,
        'test-plugin',
        'Test Plugin'
      );
      
      expect(result.valid).toBe(false);
      expect(result.detectedApis.length).toBeGreaterThan(0);
      expect(result.detectedApis.some(api => api.type === ProhibitedApiType.CHILD_PROCESS_EXEC)).toBe(true);
    });

    it('should detect child_process.spawn', () => {
      const checker = createRestrictiveStaticApiChecker();
      const result = checker.check(
        `const child_process = require('child_process');
child_process.spawn('npm', ['install']);`,
        'test-plugin',
        'Test Plugin'
      );
      
      expect(result.valid).toBe(false);
      expect(result.detectedApis.some(api => api.type === ProhibitedApiType.CHILD_PROCESS_SPAWN)).toBe(true);
    });

    it('should allow when child_process is explicitly allowed', () => {
      const checker = new StaticApiChecker({ allowChildProcess: true });
      const result = checker.check(
        `child_process.exec('ls -la');`,
        'test-plugin',
        'Test Plugin'
      );
      
      expect(result.valid).toBe(true);
    });
  });

  describe('filesystem access detection', () => {
    it('should detect fs.readFile when no allowed paths', () => {
      const checker = createRestrictiveStaticApiChecker();
      const result = checker.check(
        `const fs = require('fs');
fs.readFile('/etc/passwd', 'utf8', callback);`,
        'test-plugin',
        'Test Plugin'
      );
      
      expect(result.valid).toBe(false);
      expect(result.detectedApis.some(api => api.category === ProhibitedApiCategory.FILESYSTEM)).toBe(true);
    });

    it('should detect fs.writeFile when no allowed paths', () => {
      const checker = createRestrictiveStaticApiChecker();
      const result = checker.check(
        `fs.writeFile('/root/.ssh/authorized_keys', data);`,
        'test-plugin',
        'Test Plugin'
      );
      
      expect(result.valid).toBe(false);
    });

    it('should allow filesystem access within allowed paths', () => {
      const checker = createStaticApiCheckerWithFilesystem(['/home/user/project']);
      const result = checker.check(
        `fs.readFile('/home/user/project/config.json', callback);`,
        'test-plugin',
        'Test Plugin'
      );
      
      // With filesystem allowed and path in whitelist, should be valid
      expect(result.valid).toBe(true);
    });
  });

  describe('network access detection', () => {
    it('should detect http.request when no allowed hosts', () => {
      const checker = createRestrictiveStaticApiChecker();
      const result = checker.check(
        `const http = require('http');
http.request('http://evil.com/api', callback);`,
        'test-plugin',
        'Test Plugin'
      );
      
      expect(result.valid).toBe(false);
      expect(result.detectedApis.some(api => api.category === ProhibitedApiCategory.NETWORK)).toBe(true);
    });

    it('should detect https.request when no allowed hosts', () => {
      const checker = createRestrictiveStaticApiChecker();
      const result = checker.check(
        `const https = require('https');
https.get('https://api.malicious.com/data');`,
        'test-plugin',
        'Test Plugin'
      );
      
      expect(result.valid).toBe(false);
    });

    it('should allow network access to allowed hosts', () => {
      const checker = createStaticApiCheckerWithNetwork(['api.example.com', '*.trusted.com']);
      const result = checker.check(
        `https.get('https://api.example.com/users');`,
        'test-plugin',
        'Test Plugin'
      );
      
      expect(result.valid).toBe(true);
    });
  });

  describe('code injection detection', () => {
    it('should detect eval()', () => {
      const checker = createRestrictiveStaticApiChecker();
      const result = checker.check(
        `eval('console.log("xss")');`,
        'test-plugin',
        'Test Plugin'
      );
      
      expect(result.valid).toBe(false);
      expect(result.detectedApis.some(api => api.type === ProhibitedApiType.DANGEROUS_EVAL)).toBe(true);
    });

    it('should detect Function constructor', () => {
      const checker = createRestrictiveStaticApiChecker();
      const result = checker.check(
        `new Function('return "injected"')();`,
        'test-plugin',
        'Test Plugin'
      );
      
      expect(result.valid).toBe(false);
      expect(result.detectedApis.some(api => api.type === ProhibitedApiType.DANGEROUS_FUNCTION)).toBe(true);
    });
  });

  describe('process access detection', () => {
    it('should detect process.env access', () => {
      const checker = createRestrictiveStaticApiChecker();
      const result = checker.check(
        `const apiKey = process.env.API_KEY;`,
        'test-plugin',
        'Test Plugin'
      );
      
      expect(result.hasWarnings).toBe(true);
      expect(result.detectedApis.some(api => api.type === ProhibitedApiType.PROCESS_ENV)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty source code', () => {
      const checker = createRestrictiveStaticApiChecker();
      const result = checker.check('', 'test-plugin', 'Test Plugin');
      
      expect(result.valid).toBe(true);
      expect(result.detectedApis.length).toBe(0);
    });

    it('should handle whitespace-only source code', () => {
      const checker = createRestrictiveStaticApiChecker();
      const result = checker.check('   \n\n   ', 'test-plugin', 'Test Plugin');
      
      expect(result.valid).toBe(true);
      expect(result.detectedApis.length).toBe(0);
    });

    it('should check multiple files', () => {
      const checker = createRestrictiveStaticApiChecker();
      const result = checker.checkMultipleFiles([
        { filename: 'index.js', content: 'exec("ls")' },
        { filename: 'utils.js', content: 'eval("xss")' }
      ], 'test-plugin', 'Test Plugin');
      
      expect(result.valid).toBe(false);
      expect(result.scannedFiles).toContain('index.js');
      expect(result.scannedFiles).toContain('utils.js');
      expect(result.totalLines).toBeGreaterThan(0);
    });
  });

  describe('getProhibitedApiTypes', () => {
    it('should return all prohibited API types', () => {
      const types = StaticApiChecker.getProhibitedApiTypes();
      
      expect(types.length).toBeGreaterThan(0);
      expect(types.some(t => t.category === ProhibitedApiCategory.CHILD_PROCESS)).toBe(true);
      expect(types.some(t => t.category === ProhibitedApiCategory.FILESYSTEM)).toBe(true);
      expect(types.some(t => t.category === ProhibitedApiCategory.NETWORK)).toBe(true);
    });
  });
});