/**
 * Version Compatibility Checker (functional API)
 *
 * Pure utility module for parsing OpenCode version strings and validating them
 * against an adapter's `compatibleKernelRange` declaration.
 *
 * This module is intentionally framework-free: it never emits events, never
 * touches I/O. It only **shapes** an `adapter.version_mismatch` event payload
 * so callers (e.g. `OpenCodeAdapter`) can hand it to the event bus.
 *
 * Supported range syntaxes (subset of npm semver):
 *   - exact:        "1.2.3"          or "=1.2.3"
 *   - caret:        "^1.2.3"         (compat within same major; 0.x is special)
 *   - tilde:        "~1.2.3"         (compat within same minor)
 *   - x-range:      "1.x", "1.2.x", "*", ""
 *   - composite:    ">=1.2.3 <2.0.0"
 *
 * Pre-release handling follows npm semver semantics:
 *   - A version with a pre-release tag (e.g. "1.2.3-beta") only satisfies a
 *     range if a comparator in the range includes a pre-release at the same
 *     [major, minor, patch] tuple.
 *
 * Validates: Requirements 2.1, 2.2, 2.3
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Compatibility check result.
 *
 * `reason` is populated when `compatible` is `false` and contains a
 * user-facing actionable message (suitable for logs / UI).
 */
export interface CompatibilityResult {
  compatible: boolean;
  reason?: string;
}

/**
 * Parsed semantic version.
 *
 * `prerelease` and `build` arrays are split on '.' per the SemVer 2.0.0 spec.
 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: ReadonlyArray<string | number>;
  build: ReadonlyArray<string>;
  raw: string;
}

/**
 * `adapter.version_mismatch` event payload shape.
 *
 * This module returns the shape; emission is the caller's responsibility.
 */
export interface AdapterVersionMismatchEvent {
  /** Always the literal string "adapter.version_mismatch". */
  type: 'adapter.version_mismatch';
  payload: {
    /** The OpenCode version string that was observed at startup. */
    detectedVersion: string;
    /** The adapter's declared `compatibleKernelRange`. */
    requiredRange: string;
    /** Human-readable explanation suitable for surfacing to the user. */
    reason: string;
    /** Suggested remediation (upgrade adapter, downgrade kernel, etc.). */
    suggestedAction: 'upgrade_adapter' | 'downgrade_kernel' | 'check_versions';
    /** ISO-8601 timestamp when the mismatch was detected. */
    detectedAt: string;
  };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const SEMVER_RE =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/**
 * Parse a SemVer 2.0.0 version string.
 *
 * Returns `null` for any non-conforming input (empty string, missing patch,
 * negative numbers, leading zeros, etc.). Callers MUST treat `null` as an
 * invalid input - we never silently coerce to `0.0.0`.
 */
export function parseVersion(input: string): ParsedVersion | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const match = SEMVER_RE.exec(trimmed);
  if (!match) return null;

  const [, majorStr, minorStr, patchStr, prereleaseStr, buildStr] = match;
  // Guard against leading zeros like "01.2.3" which SemVer disallows.
  if (
    /^0\d/.test(majorStr!) ||
    /^0\d/.test(minorStr!) ||
    /^0\d/.test(patchStr!)
  ) {
    return null;
  }

  const prerelease = prereleaseStr
    ? prereleaseStr.split('.').map(coercePrereleaseIdent)
    : [];
  const build = buildStr ? buildStr.split('.') : [];

  return {
    major: Number(majorStr),
    minor: Number(minorStr),
    patch: Number(patchStr),
    prerelease,
    build,
    raw: trimmed,
  };
}

function coercePrereleaseIdent(part: string): string | number {
  // SemVer: numeric identifiers MUST NOT have leading zeros.
  if (/^(0|[1-9]\d*)$/.test(part)) return Number(part);
  return part;
}

/**
 * Compare two parsed versions per SemVer 2.0.0 ordering.
 *
 * @returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  // Pre-release precedence: a version with a prerelease has LOWER precedence
  // than the same version without one.
  const aPre = a.prerelease.length > 0;
  const bPre = b.prerelease.length > 0;
  if (aPre && !bPre) return -1;
  if (!aPre && bPre) return 1;
  if (!aPre && !bPre) return 0;

  // Both have prereleases - compare identifier by identifier.
  const len = Math.min(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i++) {
    const ai = a.prerelease[i]!;
    const bi = b.prerelease[i]!;
    const aNum = typeof ai === 'number';
    const bNum = typeof bi === 'number';
    if (aNum && bNum) {
      if (ai !== bi) return (ai as number) - (bi as number);
    } else if (aNum && !bNum) {
      return -1; // numeric < alphanumeric
    } else if (!aNum && bNum) {
      return 1;
    } else if (ai !== bi) {
      return (ai as string) < (bi as string) ? -1 : 1;
    }
  }
  return a.prerelease.length - b.prerelease.length;
}

// ---------------------------------------------------------------------------
// Range parsing
// ---------------------------------------------------------------------------

type Operator = '<' | '<=' | '>' | '>=' | '=';

interface Comparator {
  operator: Operator;
  /** A pseudo-version used purely for numeric comparison. */
  version: ParsedVersion;
  /**
   * If true, this comparator was synthesised from a caret/tilde/x-range and
   * therefore should NOT permit pre-release versions to satisfy it (npm
   * semver behaviour).
   */
  derivedFromShorthand: boolean;
}

interface ComparatorSet {
  comparators: Comparator[];
}

interface ParsedRange {
  /** OR'd together: the version satisfies the range if ANY set is satisfied. */
  sets: ComparatorSet[];
  raw: string;
  /** True if the range was empty/whitespace - matches no version. */
  isEmpty: boolean;
}

function isXSegment(seg: string | undefined): boolean {
  return seg === undefined || seg === '' || seg === 'x' || seg === 'X' || seg === '*';
}

/**
 * Parse a single token like "^1.2.3", ">=1.2.3", "1.x", "*" into a list of
 * comparators (an x-range expands to two: lower-bound and upper-bound).
 */
function parseToken(token: string): Comparator[] | null {
  const t = token.trim();
  if (t.length === 0) return null;

  // Pure wildcard - matches everything that is a valid release.
  if (t === '*' || t === 'x' || t === 'X') {
    return [
      {
        operator: '>=',
        version: { major: 0, minor: 0, patch: 0, prerelease: [], build: [], raw: '0.0.0' },
        derivedFromShorthand: true,
      },
    ];
  }

  // Explicit operator?
  const opMatch = t.match(/^(<=|>=|<|>|=)(.+)$/);
  if (opMatch) {
    const op = opMatch[1] as Operator;
    const rest = opMatch[2]!.trim();
    const v = parseVersion(rest);
    if (!v) return null;
    return [{ operator: op, version: v, derivedFromShorthand: false }];
  }

  // Caret range: ^a.b.c
  if (t.startsWith('^')) {
    const v = parseVersion(t.slice(1));
    if (!v) return null;
    return caretComparators(v);
  }

  // Tilde range: ~a.b.c
  if (t.startsWith('~')) {
    const v = parseVersion(t.slice(1));
    if (!v) return null;
    return tildeComparators(v);
  }

  // X-range: "1.x", "1.2.x", "1.x.x"
  const parts = t.split('.');
  if (parts.length >= 1 && parts.length <= 3) {
    const hasX = parts.some(isXSegment);
    if (hasX) {
      return xRangeComparators(parts);
    }
  }

  // Bare exact version.
  const exact = parseVersion(t);
  if (!exact) return null;
  return [{ operator: '=', version: exact, derivedFromShorthand: false }];
}

function caretComparators(v: ParsedVersion): Comparator[] {
  let upper: ParsedVersion;
  if (v.major > 0) {
    upper = synth(v.major + 1, 0, 0);
  } else if (v.minor > 0) {
    // ^0.2.3 -> >=0.2.3 <0.3.0
    upper = synth(0, v.minor + 1, 0);
  } else {
    // ^0.0.3 -> >=0.0.3 <0.0.4
    upper = synth(0, 0, v.patch + 1);
  }
  return [
    { operator: '>=', version: v, derivedFromShorthand: true },
    { operator: '<', version: upper, derivedFromShorthand: true },
  ];
}

function tildeComparators(v: ParsedVersion): Comparator[] {
  // ~1.2.3 -> >=1.2.3 <1.3.0
  const upper = synth(v.major, v.minor + 1, 0);
  return [
    { operator: '>=', version: v, derivedFromShorthand: true },
    { operator: '<', version: upper, derivedFromShorthand: true },
  ];
}

function xRangeComparators(parts: string[]): Comparator[] | null {
  const major = parts[0];
  const minor = parts[1];
  const patch = parts[2];

  if (isXSegment(major)) {
    // "*" / "x" / "x.x.x" - matches any version >= 0.0.0
    return [
      {
        operator: '>=',
        version: synth(0, 0, 0),
        derivedFromShorthand: true,
      },
    ];
  }

  const majorNum = Number(major);
  if (!Number.isFinite(majorNum) || majorNum < 0) return null;

  if (isXSegment(minor)) {
    // "1.x" -> >=1.0.0 <2.0.0
    return [
      { operator: '>=', version: synth(majorNum, 0, 0), derivedFromShorthand: true },
      { operator: '<', version: synth(majorNum + 1, 0, 0), derivedFromShorthand: true },
    ];
  }

  const minorNum = Number(minor);
  if (!Number.isFinite(minorNum) || minorNum < 0) return null;

  if (isXSegment(patch)) {
    // "1.2.x" -> >=1.2.0 <1.3.0
    return [
      { operator: '>=', version: synth(majorNum, minorNum, 0), derivedFromShorthand: true },
      { operator: '<', version: synth(majorNum, minorNum + 1, 0), derivedFromShorthand: true },
    ];
  }

  // No x found - shouldn't reach here because caller checks `hasX`.
  return null;
}

function synth(major: number, minor: number, patch: number): ParsedVersion {
  return {
    major,
    minor,
    patch,
    prerelease: [],
    build: [],
    raw: `${major}.${minor}.${patch}`,
  };
}

/**
 * Parse a range string into one or more comparator sets.
 *
 * `||` separates OR sets, whitespace separates AND comparators within a set.
 * Returns `null` if any token is malformed.
 */
export function parseRange(rangeString: string): ParsedRange | null {
  if (typeof rangeString !== 'string') return null;
  const trimmed = rangeString.trim();
  if (trimmed.length === 0) {
    // Empty range - by contract matches NOTHING. (Different from npm semver
    // where "" means "*"; here we want strict declarations only.)
    return { sets: [], raw: rangeString, isEmpty: true };
  }

  const orParts = trimmed.split('||').map(s => s.trim()).filter(s => s.length > 0);
  const sets: ComparatorSet[] = [];

  for (const part of orParts) {
    const tokens = part.split(/\s+/).filter(t => t.length > 0);
    const comparators: Comparator[] = [];
    for (const tok of tokens) {
      const cs = parseToken(tok);
      if (!cs) return null;
      comparators.push(...cs);
    }
    if (comparators.length === 0) return null;
    sets.push({ comparators });
  }

  return { sets, raw: rangeString, isEmpty: false };
}

// ---------------------------------------------------------------------------
// Satisfaction
// ---------------------------------------------------------------------------

function compareToOperator(cmp: number, op: Operator): boolean {
  switch (op) {
    case '<':
      return cmp < 0;
    case '<=':
      return cmp <= 0;
    case '>':
      return cmp > 0;
    case '>=':
      return cmp >= 0;
    case '=':
      return cmp === 0;
  }
}

/**
 * `version` satisfies `range` iff at least one set's comparators all hold.
 *
 * Pre-release rule: if `version` has a pre-release tag and no comparator in
 * the matching set explicitly mentions a pre-release at the same
 * [major, minor, patch], the version is rejected. This mirrors npm semver.
 */
export function satisfies(version: ParsedVersion, range: ParsedRange): boolean {
  if (range.isEmpty || range.sets.length === 0) return false;

  const versionHasPre = version.prerelease.length > 0;

  for (const set of range.sets) {
    let allHold = true;
    let setMentionsMatchingPre = false;

    for (const c of set.comparators) {
      const cmp = compareVersions(version, c.version);
      if (!compareToOperator(cmp, c.operator)) {
        allHold = false;
        break;
      }
      if (
        c.version.prerelease.length > 0 &&
        c.version.major === version.major &&
        c.version.minor === version.minor &&
        c.version.patch === version.patch
      ) {
        setMentionsMatchingPre = true;
      }
    }

    if (!allHold) continue;

    if (versionHasPre && !setMentionsMatchingPre) {
      // npm semver: prerelease only allowed if explicitly opted in.
      // EXCEPT when every comparator in the set is an exact "=" against the
      // same prerelease version (handled above by setMentionsMatchingPre).
      // For ranges built purely from carets/tildes/x-ranges this rejects
      // prerelease versions.
      const allDerived = set.comparators.every(c => c.derivedFromShorthand);
      if (allDerived) continue;
      // For explicit operators (>=, <, etc.), npm requires the operator's
      // version itself to share [M.m.p] with a prerelease. Conservative: reject.
      continue;
    }

    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// High-level API
// ---------------------------------------------------------------------------

/**
 * Check whether a detected OpenCode version satisfies an adapter's
 * `compatibleKernelRange`.
 *
 * Always returns a structured result; never throws.
 */
export function checkCompatibility(
  detectedVersion: string,
  requiredRange: string
): CompatibilityResult {
  const parsedRange = parseRange(requiredRange);
  if (!parsedRange) {
    return {
      compatible: false,
      reason: `Invalid version range '${requiredRange}': cannot parse as SemVer range`,
    };
  }
  if (parsedRange.isEmpty) {
    return {
      compatible: false,
      reason: `Empty version range: adapter declared no compatible OpenCode versions`,
    };
  }

  const parsedVersion = parseVersion(detectedVersion);
  if (!parsedVersion) {
    return {
      compatible: false,
      reason: `Invalid version string '${detectedVersion}': not a SemVer 2.0.0 release`,
    };
  }

  if (!satisfies(parsedVersion, parsedRange)) {
    return {
      compatible: false,
      reason: `OpenCode version ${detectedVersion} is outside the adapter's compatible range '${requiredRange}'`,
    };
  }

  return { compatible: true };
}

/**
 * Suggest a remediation based on whether the detected version is below or
 * above the declared range. Best-effort; falls back to `check_versions`.
 */
export function suggestAction(
  detectedVersion: string,
  requiredRange: string
): 'upgrade_adapter' | 'downgrade_kernel' | 'check_versions' {
  const parsedVersion = parseVersion(detectedVersion);
  const parsedRange = parseRange(requiredRange);
  if (!parsedVersion || !parsedRange || parsedRange.isEmpty) {
    return 'check_versions';
  }

  // Inspect the first set; collect numeric bounds.
  const firstSet = parsedRange.sets[0];
  if (!firstSet) return 'check_versions';

  let lowerBound: ParsedVersion | null = null;
  let upperBound: ParsedVersion | null = null;
  for (const c of firstSet.comparators) {
    if (c.operator === '>=' || c.operator === '>') {
      if (!lowerBound || compareVersions(c.version, lowerBound) > 0) {
        lowerBound = c.version;
      }
    } else if (c.operator === '<=' || c.operator === '<') {
      if (!upperBound || compareVersions(c.version, upperBound) < 0) {
        upperBound = c.version;
      }
    } else if (c.operator === '=') {
      lowerBound = c.version;
      upperBound = c.version;
    }
  }

  if (lowerBound && compareVersions(parsedVersion, lowerBound) < 0) {
    // Detected version is too OLD - the kernel needs to be upgraded, OR
    // the adapter needs to be downgraded. We recommend upgrading the
    // adapter only when the detected version is too NEW; here we flag
    // "downgrade_kernel" as misleading - prefer "check_versions" so the
    // operator decides. But the explicit user-facing recommendation in
    // requirements 2.4 is "upgrade adapter or downgrade OpenCode" - so
    // for too-old we suggest downgrade_kernel feels wrong; instead we
    // recommend the user check (the kernel needs to be NEWER, i.e. user
    // upgrades the kernel which isn't one of our enums). Use upgrade_adapter
    // as the closest remediation that brings the adapter back in line.
    return 'upgrade_adapter';
  }

  if (upperBound && compareVersions(parsedVersion, upperBound) >= 0) {
    return 'upgrade_adapter';
  }

  return 'check_versions';
}

/**
 * Build the payload for an `adapter.version_mismatch` event. The caller is
 * responsible for emitting it (e.g. via the daemon's event bus).
 *
 * The shape is intentionally Daemon-neutral - it contains no OpenCode
 * internal types (Property 4: Adapter Encapsulation).
 */
export function buildVersionMismatchEvent(
  detectedVersion: string,
  requiredRange: string,
  reason?: string,
  now: () => Date = () => new Date()
): AdapterVersionMismatchEvent {
  const finalReason =
    reason ??
    checkCompatibility(detectedVersion, requiredRange).reason ??
    `Version ${detectedVersion} not in range ${requiredRange}`;

  return {
    type: 'adapter.version_mismatch',
    payload: {
      detectedVersion,
      requiredRange,
      reason: finalReason,
      suggestedAction: suggestAction(detectedVersion, requiredRange),
      detectedAt: now().toISOString(),
    },
  };
}
