/**
 * Unit tests for VersionChecker
 *
 * Tests version parsing, SemVer range checking, and compatibility results.
 * Validates: Requirements 2.1, 2.2, 2.3
 */

import { describe, it, expect, describe as _describe } from 'vitest';
import { VersionChecker } from '../../src/version/VersionChecker';

describe('VersionChecker', () => {
  // ============================================================
  // Version Parsing Tests (Requirement 2.2)
  // ============================================================

  describe('parseVersion', () => {
    it('should parse basic SemVer strings', () => {
      const checker = new VersionChecker('>=1.0.0');
      const version = checker.parseVersion('1.2.3');

      expect(version.major).toBe(1);
      expect(version.minor).toBe(2);
      expect(version.patch).toBe(3);
      expect(version.raw).toBe('1.2.3');
    });

    it('should parse version with prerelease', () => {
      const checker = new VersionChecker('>=1.0.0');
      const version = checker.parseVersion('1.2.3-beta.1');

      expect(version.major).toBe(1);
      expect(version.minor).toBe(2);
      expect(version.patch).toBe(3);
      expect(version.prerelease).toEqual(['beta', '1']);
    });

    it('should parse version with build metadata', () => {
      const checker = new VersionChecker('>=1.0.0');
      const version = checker.parseVersion('1.2.3+build.123');

      expect(version.major).toBe(1);
      expect(version.minor).toBe(2);
      expect(version.patch).toBe(3);
      expect(version.build).toEqual(['build', '123']);
    });

    it('should parse version with prerelease and build', () => {
      const checker = new VersionChecker('>=1.0.0');
      const version = checker.parseVersion('1.2.3-beta.1+build.123');

      expect(version.major).toBe(1);
      expect(version.minor).toBe(2);
      expect(version.patch).toBe(3);
      expect(version.prerelease).toEqual(['beta', '1']);
      expect(version.build).toEqual(['build', '123']);
    });

    it('should return default for invalid version strings', () => {
      const checker = new VersionChecker('>=1.0.0');
      const version = checker.parseVersion('invalid');

      expect(version.major).toBe(0);
      expect(version.minor).toBe(0);
      expect(version.patch).toBe(0);
    });
  });

  // ============================================================
  // SemVer Range Checking Tests (Requirement 2.1)
  // ============================================================

  describe('satisfies', () => {
    it('should satisfy exact version match', () => {
      const checker = new VersionChecker('=1.2.3');
      expect(checker.satisfies('1.2.3')).toBe(true);
      expect(checker.satisfies('1.2.4')).toBe(false);
    });

    it('should satisfy greater than or equal', () => {
      const checker = new VersionChecker('>=1.2.3');
      expect(checker.satisfies('1.2.3')).toBe(true);
      expect(checker.satisfies('1.2.4')).toBe(true);
      expect(checker.satisfies('2.0.0')).toBe(true);
      expect(checker.satisfies('1.2.2')).toBe(false);
    });

    it('should satisfy less than', () => {
      const checker = new VersionChecker('<2.0.0');
      expect(checker.satisfies('1.9.9')).toBe(true);
      expect(checker.satisfies('2.0.0')).toBe(false);
      expect(checker.satisfies('2.0.1')).toBe(false);
    });

    it('should satisfy range with both bounds', () => {
      const checker = new VersionChecker('>=1.0.0 <2.0.0');
      expect(checker.satisfies('1.5.0')).toBe(true);
      expect(checker.satisfies('1.0.0')).toBe(true);
      expect(checker.satisfies('2.0.0')).toBe(false);
      expect(checker.satisfies('0.9.9')).toBe(false);
    });

    describe('caret operator (^)', () => {
      it('should allow minor version flexibility with caret', () => {
        const checker = new VersionChecker('^1.2.3');
        expect(checker.satisfies('1.2.3')).toBe(true);
        expect(checker.satisfies('1.3.0')).toBe(true);
        expect(checker.satisfies('1.9.9')).toBe(true);
        expect(checker.satisfies('2.0.0')).toBe(false);
      });

      it('should handle 0.x versions differently with caret', () => {
        const checker = new VersionChecker('^0.2.3');
        expect(checker.satisfies('0.2.3')).toBe(true);
        expect(checker.satisfies('0.2.4')).toBe(true);
        expect(checker.satisfies('0.3.0')).toBe(false);
      });
    });

    describe('tilde operator (~)', () => {
      it('should allow patch version flexibility with tilde', () => {
        const checker = new VersionChecker('~1.2.3');
        expect(checker.satisfies('1.2.3')).toBe(true);
        expect(checker.satisfies('1.2.4')).toBe(true);
        expect(checker.satisfies('1.2.99')).toBe(true);
        expect(checker.satisfies('1.3.0')).toBe(false);
      });
    });
  });

  // ============================================================
  // Compatibility Results Tests (Requirement 2.3)
  // ============================================================

  describe('check', () => {
    it('should return compatible result for matching version', () => {
      const checker = new VersionChecker('>=1.0.0 <2.0.0');
      const result = checker.check('1.5.0');

      expect(result.compatible).toBe(true);
      expect(result.version).toBe('1.5.0');
      expect(result.requiredRange).toBe('>=1.0.0 <2.0.0');
      expect(result.error).toBeUndefined();
    });

    it('should return incompatible result for version below range', () => {
      const checker = new VersionChecker('>=1.0.0 <2.0.0');
      const result = checker.check('0.9.0');

      expect(result.compatible).toBe(false);
      expect(result.version).toBe('0.9.0');
      expect(result.requiredRange).toBe('>=1.0.0 <2.0.0');
      expect(result.error).toContain('not compatible');
      expect(result.error).toContain('0.9.0');
    });

    it('should return incompatible result for version above range', () => {
      const checker = new VersionChecker('>=1.0.0 <2.0.0');
      const result = checker.check('2.0.0');

      expect(result.compatible).toBe(false);
      expect(result.version).toBe('2.0.0');
      expect(result.requiredRange).toBe('>=1.0.0 <2.0.0');
      expect(result.error).toContain('not compatible');
      expect(result.error).toContain('2.0.0');
    });

    it('should handle complex ranges', () => {
      const checker = new VersionChecker('>=1.14.0 <2.0.0');

      // Should be compatible
      expect(checker.check('1.14.0').compatible).toBe(true);
      expect(checker.check('1.15.0').compatible).toBe(true);
      expect(checker.check('1.99.99').compatible).toBe(true);

      // Should be incompatible
      expect(checker.check('1.13.9').compatible).toBe(false);
      expect(checker.check('2.0.0').compatible).toBe(false);
      expect(checker.check('0.14.0').compatible).toBe(false);
    });
  });

  describe('getRangeString', () => {
    it('should return the original range string', () => {
      const range = '>=1.0.0 <2.0.0';
      const checker = new VersionChecker(range);
      expect(checker.getRangeString()).toBe(range);
    });
  });

  // ============================================================
  // Edge Cases
  // ============================================================

  describe('edge cases', () => {
    it('should handle empty range', () => {
      const checker = new VersionChecker('');
      // Empty range should not match any version (no segments to satisfy)
      expect(checker.satisfies('1.0.0')).toBe(false);
    });

    it('should handle whitespace in range', () => {
      const checker = new VersionChecker('>=1.0.0   <2.0.0');
      expect(checker.satisfies('1.5.0')).toBe(true);
      expect(checker.satisfies('2.0.0')).toBe(false);
    });

    it('should handle multiple spaces in range', () => {
      const checker = new VersionChecker('>=1.0.0   <2.0.0');
      expect(checker.satisfies('1.5.0')).toBe(true);
    });

    it('should handle prerelease versions correctly', () => {
      const checker = new VersionChecker('>=1.0.0');
      expect(checker.satisfies('1.0.0-beta')).toBe(true);
    });

    it('should handle zero versions', () => {
      const checker = new VersionChecker('>=0.1.0');
      expect(checker.satisfies('0.1.0')).toBe(true);
      expect(checker.satisfies('0.0.1')).toBe(false);
    });
  });
});