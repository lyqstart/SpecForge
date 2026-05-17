/**
 * Unit tests for version-checker.ts (functional API)
 *
 * Covers parsing, range matching for ^/~/x-range/composite/exact, the
 * `checkCompatibility` contract `{ compatible, reason? }`, and the
 * `adapter.version_mismatch` event payload shape.
 *
 * Validates: Requirements 2.1, 2.2, 2.3
 */

import { describe, it, expect } from 'vitest';
import {
  parseVersion,
  parseRange,
  compareVersions,
  satisfies,
  checkCompatibility,
  suggestAction,
  buildVersionMismatchEvent,
} from '../src/version-checker';

describe('version-checker / parseVersion', () => {
  it('parses a simple release version', () => {
    const v = parseVersion('1.2.3');
    expect(v).not.toBeNull();
    expect(v!.major).toBe(1);
    expect(v!.minor).toBe(2);
    expect(v!.patch).toBe(3);
    expect(v!.prerelease).toEqual([]);
    expect(v!.build).toEqual([]);
    expect(v!.raw).toBe('1.2.3');
  });

  it('parses a version with a numeric prerelease identifier', () => {
    const v = parseVersion('1.2.3-beta.1');
    expect(v).not.toBeNull();
    expect(v!.prerelease).toEqual(['beta', 1]);
  });

  it('parses a version with build metadata', () => {
    const v = parseVersion('1.2.3+build.42');
    expect(v).not.toBeNull();
    expect(v!.build).toEqual(['build', '42']);
  });

  it('parses a version with both prerelease and build metadata', () => {
    const v = parseVersion('1.2.3-rc.1+build.42');
    expect(v).not.toBeNull();
    expect(v!.prerelease).toEqual(['rc', 1]);
    expect(v!.build).toEqual(['build', '42']);
  });

  it('rejects empty strings', () => {
    expect(parseVersion('')).toBeNull();
  });

  it('rejects whitespace-only strings', () => {
    expect(parseVersion('   ')).toBeNull();
  });

  it('rejects strings with leading zeros in any segment', () => {
    expect(parseVersion('01.2.3')).toBeNull();
    expect(parseVersion('1.02.3')).toBeNull();
    expect(parseVersion('1.2.03')).toBeNull();
  });

  it('rejects partial versions like "1.2"', () => {
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('1')).toBeNull();
  });

  it('rejects garbage strings', () => {
    expect(parseVersion('not-a-version')).toBeNull();
    expect(parseVersion('v1.2.3')).toBeNull(); // npm convention forbids 'v' prefix in pure semver
  });

  it('trims surrounding whitespace before parsing', () => {
    const v = parseVersion('  1.2.3  ');
    expect(v).not.toBeNull();
    expect(v!.raw).toBe('1.2.3');
  });
});

describe('version-checker / compareVersions', () => {
  it('orders by major then minor then patch', () => {
    const a = parseVersion('1.2.3')!;
    const b = parseVersion('1.2.4')!;
    expect(compareVersions(a, b)).toBeLessThan(0);
    expect(compareVersions(b, a)).toBeGreaterThan(0);
    expect(compareVersions(a, a)).toBe(0);
  });

  it('ranks a prerelease lower than the same release', () => {
    const release = parseVersion('1.2.3')!;
    const pre = parseVersion('1.2.3-beta')!;
    expect(compareVersions(pre, release)).toBeLessThan(0);
    expect(compareVersions(release, pre)).toBeGreaterThan(0);
  });

  it('orders prerelease identifiers numerically when both numeric', () => {
    const a = parseVersion('1.2.3-rc.1')!;
    const b = parseVersion('1.2.3-rc.2')!;
    expect(compareVersions(a, b)).toBeLessThan(0);
  });

  it('treats numeric prerelease identifiers as lower than alphanumeric', () => {
    const numeric = parseVersion('1.2.3-1')!;
    const alpha = parseVersion('1.2.3-alpha')!;
    expect(compareVersions(numeric, alpha)).toBeLessThan(0);
  });
});

describe('version-checker / parseRange', () => {
  it('returns isEmpty=true for an empty string', () => {
    const r = parseRange('');
    expect(r).not.toBeNull();
    expect(r!.isEmpty).toBe(true);
  });

  it('parses an exact version', () => {
    const r = parseRange('1.2.3');
    expect(r).not.toBeNull();
    expect(r!.isEmpty).toBe(false);
  });

  it('parses a caret range', () => {
    const r = parseRange('^1.2.3');
    expect(r).not.toBeNull();
  });

  it('parses a composite range', () => {
    const r = parseRange('>=1.2.3 <2.0.0');
    expect(r).not.toBeNull();
  });

  it('parses an x-range like 1.x', () => {
    const r = parseRange('1.x');
    expect(r).not.toBeNull();
  });

  it('returns null for completely malformed tokens', () => {
    expect(parseRange('not-a-range')).toBeNull();
    expect(parseRange('>=garbage')).toBeNull();
  });
});

describe('version-checker / satisfies — exact ranges', () => {
  it('matches the exact same version', () => {
    const v = parseVersion('1.2.3')!;
    const r = parseRange('1.2.3')!;
    expect(satisfies(v, r)).toBe(true);
  });

  it('rejects a different patch for an exact range', () => {
    const v = parseVersion('1.2.4')!;
    const r = parseRange('1.2.3')!;
    expect(satisfies(v, r)).toBe(false);
  });

  it('matches with the explicit "=" operator', () => {
    const v = parseVersion('1.2.3')!;
    const r = parseRange('=1.2.3')!;
    expect(satisfies(v, r)).toBe(true);
  });
});

describe('version-checker / satisfies — caret ranges', () => {
  it('^1.2.3 accepts 1.2.3, 1.2.4, 1.9.0', () => {
    const r = parseRange('^1.2.3')!;
    expect(satisfies(parseVersion('1.2.3')!, r)).toBe(true);
    expect(satisfies(parseVersion('1.2.4')!, r)).toBe(true);
    expect(satisfies(parseVersion('1.9.0')!, r)).toBe(true);
  });

  it('^1.2.3 rejects 1.2.2 and 2.0.0', () => {
    const r = parseRange('^1.2.3')!;
    expect(satisfies(parseVersion('1.2.2')!, r)).toBe(false);
    expect(satisfies(parseVersion('2.0.0')!, r)).toBe(false);
  });

  it('^0.2.3 accepts 0.2.3 and 0.2.4 but rejects 0.3.0', () => {
    const r = parseRange('^0.2.3')!;
    expect(satisfies(parseVersion('0.2.3')!, r)).toBe(true);
    expect(satisfies(parseVersion('0.2.4')!, r)).toBe(true);
    expect(satisfies(parseVersion('0.3.0')!, r)).toBe(false);
  });

  it('^0.0.3 accepts only 0.0.3 (caret on 0.0.x is exact)', () => {
    const r = parseRange('^0.0.3')!;
    expect(satisfies(parseVersion('0.0.3')!, r)).toBe(true);
    expect(satisfies(parseVersion('0.0.4')!, r)).toBe(false);
  });
});

describe('version-checker / satisfies — tilde ranges', () => {
  it('~1.2.3 accepts patch bumps but not minor bumps', () => {
    const r = parseRange('~1.2.3')!;
    expect(satisfies(parseVersion('1.2.3')!, r)).toBe(true);
    expect(satisfies(parseVersion('1.2.99')!, r)).toBe(true);
    expect(satisfies(parseVersion('1.3.0')!, r)).toBe(false);
  });

  it('~1.2.3 rejects versions below 1.2.3', () => {
    const r = parseRange('~1.2.3')!;
    expect(satisfies(parseVersion('1.2.2')!, r)).toBe(false);
  });
});

describe('version-checker / satisfies — composite ranges', () => {
  it('>=1.2.3 <2.0.0 accepts 1.2.3 and 1.99.99', () => {
    const r = parseRange('>=1.2.3 <2.0.0')!;
    expect(satisfies(parseVersion('1.2.3')!, r)).toBe(true);
    expect(satisfies(parseVersion('1.99.99')!, r)).toBe(true);
  });

  it('>=1.2.3 <2.0.0 rejects boundary upper and below lower', () => {
    const r = parseRange('>=1.2.3 <2.0.0')!;
    expect(satisfies(parseVersion('2.0.0')!, r)).toBe(false);
    expect(satisfies(parseVersion('1.2.2')!, r)).toBe(false);
  });
});

describe('version-checker / satisfies — x-ranges', () => {
  it('1.x matches all 1.y.z but not 2.0.0', () => {
    const r = parseRange('1.x')!;
    expect(satisfies(parseVersion('1.0.0')!, r)).toBe(true);
    expect(satisfies(parseVersion('1.99.99')!, r)).toBe(true);
    expect(satisfies(parseVersion('2.0.0')!, r)).toBe(false);
    expect(satisfies(parseVersion('0.9.9')!, r)).toBe(false);
  });

  it('1.2.x matches 1.2.y but not 1.3.0', () => {
    const r = parseRange('1.2.x')!;
    expect(satisfies(parseVersion('1.2.0')!, r)).toBe(true);
    expect(satisfies(parseVersion('1.2.99')!, r)).toBe(true);
    expect(satisfies(parseVersion('1.3.0')!, r)).toBe(false);
  });

  it('* matches any release version', () => {
    const r = parseRange('*')!;
    expect(satisfies(parseVersion('0.0.1')!, r)).toBe(true);
    expect(satisfies(parseVersion('99.99.99')!, r)).toBe(true);
  });
});

describe('version-checker / satisfies — pre-release handling', () => {
  it('rejects prerelease versions for shorthand ranges', () => {
    const r = parseRange('^1.2.3')!;
    expect(satisfies(parseVersion('1.2.4-beta')!, r)).toBe(false);
  });

  it('accepts an exact prerelease match for an explicit "=" range', () => {
    const r = parseRange('=1.2.3-beta.1')!;
    expect(satisfies(parseVersion('1.2.3-beta.1')!, r)).toBe(true);
  });

  it('accepts a release version for a shorthand range that allows it', () => {
    const r = parseRange('^1.2.3')!;
    expect(satisfies(parseVersion('1.5.0')!, r)).toBe(true);
  });
});

describe('version-checker / checkCompatibility', () => {
  it('returns compatible:true with no reason for a matching version', () => {
    const result = checkCompatibility('1.5.0', '^1.2.3');
    expect(result.compatible).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('returns compatible:false with a reason for a version below range', () => {
    const result = checkCompatibility('0.9.0', '>=1.0.0 <2.0.0');
    expect(result.compatible).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('0.9.0');
    expect(result.reason).toContain('>=1.0.0 <2.0.0');
  });

  it('returns compatible:false for a version above range', () => {
    const result = checkCompatibility('2.0.0', '^1.2.3');
    expect(result.compatible).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('returns compatible:false with a clear reason for an empty range', () => {
    const result = checkCompatibility('1.0.0', '');
    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/empty/i);
  });

  it('returns compatible:false with a clear reason for an invalid version', () => {
    const result = checkCompatibility('not-a-version', '^1.2.3');
    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/invalid version/i);
  });

  it('returns compatible:false for an invalid range string', () => {
    const result = checkCompatibility('1.0.0', 'totally-bogus');
    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/invalid version range/i);
  });

  it('handles the documented adapter range "^1.14.0"', () => {
    expect(checkCompatibility('1.14.0', '^1.14.0').compatible).toBe(true);
    expect(checkCompatibility('1.99.99', '^1.14.0').compatible).toBe(true);
    expect(checkCompatibility('1.13.99', '^1.14.0').compatible).toBe(false);
    expect(checkCompatibility('2.0.0', '^1.14.0').compatible).toBe(false);
  });
});

describe('version-checker / suggestAction', () => {
  it('suggests upgrade_adapter when detected version is above range', () => {
    expect(suggestAction('2.0.0', '^1.2.3')).toBe('upgrade_adapter');
  });

  it('suggests upgrade_adapter when detected version is below range', () => {
    // Per requirement 2.4 the user-facing instruction is "upgrade adapter or
    // downgrade kernel"; for a too-old kernel either option works, but
    // upgrading the adapter brings the declared range down to match.
    expect(suggestAction('0.9.0', '>=1.0.0 <2.0.0')).toBe('upgrade_adapter');
  });

  it('falls back to check_versions for unparseable inputs', () => {
    expect(suggestAction('garbage', '^1.2.3')).toBe('check_versions');
    expect(suggestAction('1.0.0', 'garbage')).toBe('check_versions');
  });
});

describe('version-checker / buildVersionMismatchEvent', () => {
  it('returns the adapter.version_mismatch shape', () => {
    const ev = buildVersionMismatchEvent('2.0.0', '^1.2.3');
    expect(ev.type).toBe('adapter.version_mismatch');
    expect(ev.payload.detectedVersion).toBe('2.0.0');
    expect(ev.payload.requiredRange).toBe('^1.2.3');
    expect(ev.payload.reason).toBeTruthy();
    expect(['upgrade_adapter', 'downgrade_kernel', 'check_versions']).toContain(
      ev.payload.suggestedAction
    );
  });

  it('uses an injected clock for deterministic timestamps', () => {
    const fixed = new Date('2026-01-01T00:00:00.000Z');
    const ev = buildVersionMismatchEvent('2.0.0', '^1.2.3', undefined, () => fixed);
    expect(ev.payload.detectedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('honours an explicitly supplied reason', () => {
    const ev = buildVersionMismatchEvent('2.0.0', '^1.2.3', 'kernel too new');
    expect(ev.payload.reason).toBe('kernel too new');
  });

  it('does not leak OpenCode-specific concepts in the payload', () => {
    // Adapter Encapsulation (Property 4): payload keys must be daemon-neutral.
    const ev = buildVersionMismatchEvent('1.99.0', '^2.0.0');
    const allowed = new Set([
      'detectedVersion',
      'requiredRange',
      'reason',
      'suggestedAction',
      'detectedAt',
    ]);
    for (const key of Object.keys(ev.payload)) {
      expect(allowed.has(key)).toBe(true);
    }
  });
});

describe('version-checker / boundary cases', () => {
  it('treats >=X <X as an empty range (no version satisfies)', () => {
    const r = parseRange('>=1.2.3 <1.2.3')!;
    expect(satisfies(parseVersion('1.2.3')!, r)).toBe(false);
  });

  it('handles inclusive upper bound <=', () => {
    const r = parseRange('>=1.0.0 <=2.0.0')!;
    expect(satisfies(parseVersion('2.0.0')!, r)).toBe(true);
    expect(satisfies(parseVersion('2.0.1')!, r)).toBe(false);
  });

  it('handles strict greater-than', () => {
    const r = parseRange('>1.2.3')!;
    expect(satisfies(parseVersion('1.2.3')!, r)).toBe(false);
    expect(satisfies(parseVersion('1.2.4')!, r)).toBe(true);
  });
});
