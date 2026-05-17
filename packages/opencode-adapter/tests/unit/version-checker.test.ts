/**
 * Comprehensive Unit Tests: Version Compatibility Checker
 *
 * Covers both the class-based VersionChecker (src/version/VersionChecker.ts)
 * and the functional API (src/version-checker.ts).
 *
 * Tests:
 *   - Version string parsing (valid, invalid, edge cases)
 *   - SemVer range operators: =, >=, <=, >, <, ^, ~
 *   - Composite ranges (AND / OR)
 *   - Compatibility result structure
 *   - buildVersionMismatchEvent payload shape (Property 4)
 *   - suggestAction heuristics
 *
 * Requirements: 2.1, 2.2, 2.3
 */

import { describe, it, expect } from 'vitest';
import { VersionChecker } from '../../src/version/VersionChecker';
import {
  parseVersion,
  parseRange,
  satisfies,
  checkCompatibility,
  suggestAction,
  buildVersionMismatchEvent,
} from '../../src/version-checker';

// ===========================================================================
// VersionChecker (class-based)
// ===========================================================================

describe('VersionChecker (class)', () => {

  // ── parseVersion ──────────────────────────────────────────────────────

  describe('parseVersion', () => {
    it('parses basic semver', () => {
      const vc = new VersionChecker('>=1.0.0');
      const v = vc.parseVersion('1.2.3');
      expect(v.major).toBe(1);
      expect(v.minor).toBe(2);
      expect(v.patch).toBe(3);
      expect(v.raw).toBe('1.2.3');
    });

    it('parses prerelease identifiers', () => {
      const vc = new VersionChecker('>=1.0.0');
      const v = vc.parseVersion('1.2.3-beta.1');
      expect(v.prerelease).toEqual(['beta', '1']);
    });

    it('parses build metadata', () => {
      const vc = new VersionChecker('>=1.0.0');
      const v = vc.parseVersion('1.2.3+build.42');
      expect(v.build).toEqual(['build', '42']);
    });

    it('returns 0.0.0 for invalid strings', () => {
      const vc = new VersionChecker('>=1.0.0');
      const v = vc.parseVersion('not-a-version');
      expect(v.major).toBe(0);
      expect(v.minor).toBe(0);
      expect(v.patch).toBe(0);
    });
  });

  // ── satisfies ─────────────────────────────────────────────────────────

  describe('satisfies', () => {
    it('exact match (=)', () => {
      const vc = new VersionChecker('=1.2.3');
      expect(vc.satisfies('1.2.3')).toBe(true);
      expect(vc.satisfies('1.2.4')).toBe(false);
    });

    it('>= operator', () => {
      const vc = new VersionChecker('>=1.2.3');
      expect(vc.satisfies('1.2.3')).toBe(true);
      expect(vc.satisfies('2.0.0')).toBe(true);
      expect(vc.satisfies('1.2.2')).toBe(false);
    });

    it('< operator', () => {
      const vc = new VersionChecker('<2.0.0');
      expect(vc.satisfies('1.9.9')).toBe(true);
      expect(vc.satisfies('2.0.0')).toBe(false);
    });

    it('composite range (>= AND <)', () => {
      const vc = new VersionChecker('>=1.0.0 <2.0.0');
      expect(vc.satisfies('1.5.0')).toBe(true);
      expect(vc.satisfies('1.0.0')).toBe(true);
      expect(vc.satisfies('2.0.0')).toBe(false);
      expect(vc.satisfies('0.9.9')).toBe(false);
    });

    it('caret (^) – minor flexibility', () => {
      const vc = new VersionChecker('^1.2.3');
      expect(vc.satisfies('1.2.3')).toBe(true);
      expect(vc.satisfies('1.9.9')).toBe(true);
      expect(vc.satisfies('2.0.0')).toBe(false);
    });

    it('caret (^) – 0.x special case', () => {
      const vc = new VersionChecker('^0.2.3');
      expect(vc.satisfies('0.2.3')).toBe(true);
      expect(vc.satisfies('0.2.9')).toBe(true);
      expect(vc.satisfies('0.3.0')).toBe(false);
    });

    it('tilde (~) – patch flexibility', () => {
      const vc = new VersionChecker('~1.2.3');
      expect(vc.satisfies('1.2.3')).toBe(true);
      expect(vc.satisfies('1.2.99')).toBe(true);
      expect(vc.satisfies('1.3.0')).toBe(false);
    });

    it('empty range satisfies nothing', () => {
      const vc = new VersionChecker('');
      expect(vc.satisfies('1.0.0')).toBe(false);
    });

    it('handles extra whitespace in range', () => {
      const vc = new VersionChecker('>=1.0.0   <2.0.0');
      expect(vc.satisfies('1.5.0')).toBe(true);
    });
  });

  // ── check ─────────────────────────────────────────────────────────────

  describe('check', () => {
    it('returns compatible=true for version in range', () => {
      const vc = new VersionChecker('>=1.0.0 <2.0.0');
      const r = vc.check('1.5.0');
      expect(r.compatible).toBe(true);
      expect(r.version).toBe('1.5.0');
      expect(r.requiredRange).toBe('>=1.0.0 <2.0.0');
      expect(r.error).toBeUndefined();
    });

    it('returns compatible=false with error for version below range', () => {
      const vc = new VersionChecker('>=1.0.0 <2.0.0');
      const r = vc.check('0.9.0');
      expect(r.compatible).toBe(false);
      expect(r.error).toContain('0.9.0');
    });

    it('returns compatible=false for version above range', () => {
      const vc = new VersionChecker('>=1.0.0 <2.0.0');
      const r = vc.check('2.0.0');
      expect(r.compatible).toBe(false);
    });

    it('handles the OpenCode-specific range >=1.14.0 <2.0.0', () => {
      const vc = new VersionChecker('>=1.14.0 <2.0.0');
      expect(vc.check('1.14.0').compatible).toBe(true);
      expect(vc.check('1.99.99').compatible).toBe(true);
      expect(vc.check('1.13.9').compatible).toBe(false);
      expect(vc.check('2.0.0').compatible).toBe(false);
    });
  });

  // ── getRangeString ────────────────────────────────────────────────────

  describe('getRangeString', () => {
    it('returns the original range string', () => {
      const range = '>=1.0.0 <2.0.0';
      expect(new VersionChecker(range).getRangeString()).toBe(range);
    });
  });
});

// ===========================================================================
// Functional API (version-checker.ts)
// ===========================================================================

describe('version-checker functional API', () => {

  // ── parseVersion ──────────────────────────────────────────────────────

  describe('parseVersion', () => {
    it('parses valid semver', () => {
      const v = parseVersion('2.3.4');
      expect(v).not.toBeNull();
      expect(v?.major).toBe(2);
      expect(v?.minor).toBe(3);
      expect(v?.patch).toBe(4);
    });

    it('parses prerelease', () => {
      const v = parseVersion('1.0.0-alpha.1');
      expect(v?.prerelease).toEqual(['alpha', 1]);
    });

    it('returns null for invalid input', () => {
      expect(parseVersion('')).toBeNull();
      expect(parseVersion('not-semver')).toBeNull();
      expect(parseVersion('1.2')).toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(parseVersion(null as any)).toBeNull();
    });

    it('rejects leading zeros', () => {
      expect(parseVersion('01.2.3')).toBeNull();
      expect(parseVersion('1.02.3')).toBeNull();
    });
  });

  // ── parseRange ────────────────────────────────────────────────────────

  describe('parseRange', () => {
    it('parses composite range', () => {
      const r = parseRange('>=1.0.0 <2.0.0');
      expect(r).not.toBeNull();
      expect(r?.isEmpty).toBe(false);
      expect(r?.sets.length).toBeGreaterThan(0);
    });

    it('returns isEmpty=true for empty string', () => {
      const r = parseRange('');
      expect(r?.isEmpty).toBe(true);
    });

    it('returns null for invalid range', () => {
      expect(parseRange('totally-bogus')).toBeNull();
    });

    it('parses caret range', () => {
      const r = parseRange('^1.2.3');
      expect(r).not.toBeNull();
      expect(r?.isEmpty).toBe(false);
    });

    it('parses tilde range', () => {
      const r = parseRange('~1.2.3');
      expect(r).not.toBeNull();
    });

    it('parses x-range', () => {
      const r = parseRange('1.x');
      expect(r).not.toBeNull();
    });

    it('parses OR range (||)', () => {
      const r = parseRange('>=1.0.0 <1.5.0 || >=2.0.0 <3.0.0');
      expect(r).not.toBeNull();
      expect(r?.sets.length).toBe(2);
    });
  });

  // ── satisfies ─────────────────────────────────────────────────────────

  describe('satisfies', () => {
    it('returns false for empty range', () => {
      const v = parseVersion('1.0.0')!;
      const r = parseRange('')!;
      expect(satisfies(v, r)).toBe(false);
    });

    it('returns true for version in range', () => {
      const v = parseVersion('1.5.0')!;
      const r = parseRange('>=1.0.0 <2.0.0')!;
      expect(satisfies(v, r)).toBe(true);
    });

    it('returns false for version outside range', () => {
      const v = parseVersion('2.0.0')!;
      const r = parseRange('>=1.0.0 <2.0.0')!;
      expect(satisfies(v, r)).toBe(false);
    });

    it('handles OR ranges correctly', () => {
      const r = parseRange('>=1.0.0 <1.5.0 || >=2.0.0 <3.0.0')!;
      expect(satisfies(parseVersion('1.2.0')!, r)).toBe(true);
      expect(satisfies(parseVersion('2.5.0')!, r)).toBe(true);
      expect(satisfies(parseVersion('1.7.0')!, r)).toBe(false);
    });
  });

  // ── checkCompatibility ────────────────────────────────────────────────

  describe('checkCompatibility', () => {
    it('returns compatible=true for version in range', () => {
      const r = checkCompatibility('1.14.0', '>=1.14.0 <2.0.0');
      expect(r.compatible).toBe(true);
      expect(r.reason).toBeUndefined();
    });

    it('returns compatible=false with reason for version below range', () => {
      const r = checkCompatibility('1.0.0', '>=1.14.0 <2.0.0');
      expect(r.compatible).toBe(false);
      expect(typeof r.reason).toBe('string');
      expect(r.reason!.length).toBeGreaterThan(0);
    });

    it('returns compatible=false for version above range', () => {
      const r = checkCompatibility('2.0.0', '>=1.0.0 <2.0.0');
      expect(r.compatible).toBe(false);
    });

    it('returns compatible=false for invalid version string', () => {
      const r = checkCompatibility('not-a-version', '>=1.0.0 <2.0.0');
      expect(r.compatible).toBe(false);
      expect(r.reason).toContain('not-a-version');
    });

    it('returns compatible=false for invalid range string', () => {
      const r = checkCompatibility('1.0.0', 'totally-bogus');
      expect(r.compatible).toBe(false);
      expect(r.reason).toBeDefined();
    });

    it('returns compatible=false for empty range', () => {
      const r = checkCompatibility('1.0.0', '');
      expect(r.compatible).toBe(false);
    });

    it('handles caret range', () => {
      expect(checkCompatibility('1.14.5', '^1.14.0').compatible).toBe(true);
      expect(checkCompatibility('2.0.0', '^1.14.0').compatible).toBe(false);
    });

    it('handles tilde range', () => {
      expect(checkCompatibility('1.14.5', '~1.14.0').compatible).toBe(true);
      expect(checkCompatibility('1.15.0', '~1.14.0').compatible).toBe(false);
    });
  });

  // ── suggestAction ─────────────────────────────────────────────────────

  describe('suggestAction', () => {
    it('returns a valid action string', () => {
      const valid = ['upgrade_adapter', 'downgrade_kernel', 'check_versions'];
      const action = suggestAction('2.0.0', '>=1.0.0 <2.0.0');
      expect(valid).toContain(action);
    });

    it('returns check_versions for invalid inputs', () => {
      expect(suggestAction('bad', 'bad')).toBe('check_versions');
      expect(suggestAction('', '')).toBe('check_versions');
    });
  });

  // ── buildVersionMismatchEvent ─────────────────────────────────────────

  describe('buildVersionMismatchEvent', () => {
    it('returns correct event type', () => {
      const ev = buildVersionMismatchEvent('2.0.0', '^1.14.0');
      expect(ev.type).toBe('adapter.version_mismatch');
    });

    it('payload contains required fields', () => {
      const ev = buildVersionMismatchEvent('2.0.0', '^1.14.0');
      expect(ev.payload.detectedVersion).toBe('2.0.0');
      expect(ev.payload.requiredRange).toBe('^1.14.0');
      expect(typeof ev.payload.reason).toBe('string');
      expect(ev.payload.reason.length).toBeGreaterThan(0);
      expect(['upgrade_adapter', 'downgrade_kernel', 'check_versions']).toContain(ev.payload.suggestedAction);
      expect(typeof ev.payload.detectedAt).toBe('string');
    });

    it('payload contains no OpenCode-internal tokens (Property 4)', () => {
      const ev = buildVersionMismatchEvent('2.0.0', '^1.14.0');
      const INTERNAL_TOKENS = ['callID', 'plugin_hook', 'pluginHook', 'oc_internal', 'opencode_ctx'];
      const str = JSON.stringify(ev);
      for (const token of INTERNAL_TOKENS) {
        expect(str.includes(token), `leaked "${token}"`).toBe(false);
      }
    });

    it('payload keys are all in the allowed set', () => {
      const ev = buildVersionMismatchEvent('2.0.0', '^1.14.0');
      const allowed = new Set(['detectedVersion', 'requiredRange', 'reason', 'suggestedAction', 'detectedAt']);
      for (const key of Object.keys(ev.payload)) {
        expect(allowed.has(key), `unexpected key "${key}"`).toBe(true);
      }
    });

    it('accepts custom reason', () => {
      const ev = buildVersionMismatchEvent('2.0.0', '^1.14.0', 'custom reason');
      expect(ev.payload.reason).toBe('custom reason');
    });

    it('uses provided now() function for detectedAt', () => {
      const fixedDate = new Date('2024-01-01T00:00:00Z');
      const ev = buildVersionMismatchEvent('2.0.0', '^1.14.0', undefined, () => fixedDate);
      expect(ev.payload.detectedAt).toBe(fixedDate.toISOString());
    });
  });

  // ── Boundary / edge cases ─────────────────────────────────────────────

  describe('boundary cases', () => {
    it('0.0.0 is a valid version', () => {
      const v = parseVersion('0.0.0');
      expect(v).not.toBeNull();
      expect(v?.major).toBe(0);
    });

    it('very large version numbers', () => {
      const v = parseVersion('999.999.999');
      expect(v).not.toBeNull();
      expect(v?.major).toBe(999);
    });

    it('exact boundary: version equals lower bound', () => {
      expect(checkCompatibility('1.14.0', '>=1.14.0 <2.0.0').compatible).toBe(true);
    });

    it('exact boundary: version equals upper bound (exclusive)', () => {
      expect(checkCompatibility('2.0.0', '>=1.14.0 <2.0.0').compatible).toBe(false);
    });

    it('patch version within range', () => {
      expect(checkCompatibility('1.14.5', '>=1.14.0 <2.0.0').compatible).toBe(true);
    });
  });
});
