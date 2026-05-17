/**
 * End-to-End Tests for Scope Violation Detection and Reporting
 *
 * Validates that scope violations from BOTH paths produce structured,
 * JSON-serializable reports with the required fields:
 *
 *   1. Static violation: a fixture package containing code that imports
 *      a P1 capability without a feature-flag guard is detected by
 *      ScopeValidator and produces at least one violation entry with
 *      capabilityId / scopeTag / file / line.
 *   2. Runtime violation: invoking the RuntimeScopeChecker multiple
 *      times against several P1 capabilities triggers ScopeBoundary
 *      errors that AuditLogger records and queryScopeEvents can filter
 *      back exhaustively.
 *   3. Report format: every entry in the unified violation report (from
 *      static or runtime source) carries capabilityId, scopeTag (p1|p2),
 *      source ('static' | 'runtime'), a context with filename/line for
 *      static or stack for runtime, and a suggestion string of the form
 *      "启用 feature flag 'enable_<id>'".
 *   4. Zero-violation pass: a fixture package containing only P0
 *      imports (with feature-flag guards as needed) yields zero
 *      validation errors.
 *
 * The serialized report (JSON) round-trips losslessly so OpenClaw or
 * any other downstream consumer can parse it.
 *
 * Requirements: 3.5, 3.6
 * Task: 16.3 Scope violation detection and reporting
 *
 * Uses vitest pool: 'forks' for process isolation per
 * async-resource-coding-standards.md (T2/T4).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

import { ScopeRegistry } from '../../src/scope-registry.js';
import { ScopeValidator } from '../../src/scope-validator.js';
import { RuntimeScopeChecker } from '../../src/runtime-checker.js';
import { AuditLogger } from '../../src/audit-logger.js';
import {
  ScopeBoundaryViolationError,
  ScopeError,
} from '../../src/types.js';
import type {
  ScopeContext,
  ScopeViolationAttempt,
  ValidationResult,
  AgentIdentity,
  CapabilityDefinition,
  ScopeTag,
} from '../../src/types.js';

// --------------------------------------------------------------------
// Path setup — resolve repo root from this file so the suite runs the
// same whether `bun test` is invoked at the workspace root or in the
// scope-gate package.
// --------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const PARENT_SPEC_PATH = resolve(
  REPO_ROOT,
  '.kiro',
  'specs',
  'v6-architecture-overview',
);

const ACTOR: AgentIdentity = {
  id: 'violation-detection-e2e',
  name: 'Violation Detection E2E',
  type: 'system',
};

// --------------------------------------------------------------------
// Unified violation report — a single shape consumed by OpenClaw or
// any other downstream tool. The test layer is the only place that
// fuses static (ValidationResult) and runtime (ScopeViolationAttempt)
// signals into this shape, so the test owns its construction.
// --------------------------------------------------------------------

interface ScopeViolationReportEntry {
  capabilityId: string;
  scopeTag: 'p1' | 'p2';
  source: 'static' | 'runtime';
  context: {
    file?: string;
    line?: number;
    column?: number;
    stack?: string;
    releaseBranch?: string;
  };
  suggestion: string;
  message: string;
}

interface ScopeViolationReport {
  schema_version: '1.0';
  generatedAt: string;
  entries: ScopeViolationReportEntry[];
  summary: {
    total: number;
    static: number;
    runtime: number;
    byScopeTag: Record<'p1' | 'p2', number>;
  };
}

/**
 * Convert ScopeValidator.validateCodeDependencies output into entries
 * for the unified violation report. Only the p0_depends_on_p1 and
 * p0_depends_on_p2 codes are treated as scope violations here — other
 * codes (missing_scope_tag, etc.) are validation results, not
 * boundary violations.
 */
function staticResultsToReportEntries(
  results: ValidationResult[],
): ScopeViolationReportEntry[] {
  const entries: ScopeViolationReportEntry[] = [];

  for (const r of results) {
    if (r.code !== 'p0_depends_on_p1' && r.code !== 'p0_depends_on_p2') {
      continue;
    }

    const ctx = (r.context ?? {}) as Record<string, unknown>;
    const capabilityId = String(ctx.capabilityId ?? '');
    const scopeTag = (ctx.capabilityScope ?? (r.code === 'p0_depends_on_p1' ? 'p1' : 'p2')) as 'p1' | 'p2';

    if (!capabilityId) continue;

    entries.push({
      capabilityId,
      scopeTag,
      source: 'static',
      context: {
        file: r.location?.file ?? (typeof ctx.file === 'string' ? ctx.file : undefined),
        line: r.location?.line,
        column: r.location?.column,
      },
      suggestion: `启用 feature flag 'enable_${capabilityId}'`,
      message: r.message,
    });
  }

  return entries;
}

/**
 * Convert a runtime ScopeBoundaryViolationError + the context that
 * triggered it into a unified report entry.
 */
function runtimeErrorToReportEntry(
  err: ScopeBoundaryViolationError,
  context: ScopeContext,
): ScopeViolationReportEntry {
  return {
    capabilityId: err.capabilityId,
    scopeTag: err.scopeTag === 'p1' || err.scopeTag === 'p2' ? err.scopeTag : 'p1',
    source: 'runtime',
    context: {
      stack: err.stack ?? '',
      releaseBranch: context.releaseBranch,
    },
    suggestion: `启用 feature flag '${err.requiredFlag ?? `enable_${err.capabilityId}`}'`,
    message: err.message,
  };
}

/**
 * Build a complete report from a list of entries.
 */
function buildReport(entries: ScopeViolationReportEntry[]): ScopeViolationReport {
  const summary = {
    total: entries.length,
    static: entries.filter((e) => e.source === 'static').length,
    runtime: entries.filter((e) => e.source === 'runtime').length,
    byScopeTag: {
      p1: entries.filter((e) => e.scopeTag === 'p1').length,
      p2: entries.filter((e) => e.scopeTag === 'p2').length,
    },
  };

  return {
    schema_version: '1.0',
    generatedAt: new Date().toISOString(),
    entries,
    summary,
  };
}

// --------------------------------------------------------------------
// Test capability fixture — defined explicitly so the validator and
// runtime checker share the exact same set, regardless of what REQ-25
// happens to ship today.
// --------------------------------------------------------------------

function makeCap(
  id: string,
  scopeTag: ScopeTag,
  dependencies: string[] = [],
): CapabilityDefinition {
  return {
    id,
    displayName: `Capability ${id}`,
    scopeTag,
    entryPoints: [],
    dependencies,
    description: `Description for ${id}`,
  };
}

const FIXTURE_CAPS: CapabilityDefinition[] = [
  makeCap('test-p0-core', 'p0'),
  makeCap('test-p0-utils', 'p0'),
  makeCap('test-p1-bugfix', 'p1'),
  makeCap('test-p1-design', 'p1'),
  makeCap('test-p2-webui', 'p2'),
];

// --------------------------------------------------------------------
// Test suite
// --------------------------------------------------------------------

describe('Scope Violation Detection and Reporting - End-to-End', () => {
  let testRoot: string;
  let codeFixtureDir: string;
  let cleanCodeFixtureDir: string;
  let logDir: string;

  beforeEach(() => {
    testRoot = resolve(
      REPO_ROOT,
      'packages',
      'scope-gate',
      'tests',
      'test-logs',
      `violation-${randomUUID()}`,
    );
    codeFixtureDir = join(testRoot, 'code-fixture-violating');
    cleanCodeFixtureDir = join(testRoot, 'code-fixture-clean');
    logDir = join(testRoot, 'logs');

    mkdirSync(codeFixtureDir, { recursive: true });
    mkdirSync(cleanCodeFixtureDir, { recursive: true });
    mkdirSync(logDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  // ----------------------------------------------------------------
  // Scenario A: static violation detection
  // ----------------------------------------------------------------

  it('A. ScopeValidator detects a static P1 import violation with capabilityId / scopeTag / file / line', () => {
    // Fixture: a single .ts file that imports a P1 capability without
    // any feature-flag guard. This is exactly the pattern the static
    // analyzer is meant to flag.
    const violatingFile = join(codeFixtureDir, 'src', 'uses-p1.ts');
    mkdirSync(dirname(violatingFile), { recursive: true });
    writeFileSync(
      violatingFile,
      [
        '// fixture: P0 module that pulls in a P1 capability without a guard',
        "import { runBugfix } from 'test-p1-bugfix';",
        '',
        'export function entry() {',
        '  return runBugfix();',
        '}',
        '',
      ].join('\n'),
    );

    const validator = new ScopeValidator();
    validator.setCapabilities(FIXTURE_CAPS);

    const results = validator.validateCodeDependencies(codeFixtureDir);

    // At least one violation must be reported.
    const p1Violations = results.filter((r) => r.code === 'p0_depends_on_p1');
    expect(p1Violations.length).toBeGreaterThanOrEqual(1);

    // The first violation must carry the four required fields.
    const v = p1Violations[0];
    expect(v.type).toBe('error');
    const ctx = v.context as Record<string, unknown>;
    expect(ctx.capabilityId).toBe('test-p1-bugfix');
    expect(ctx.capabilityScope).toBe('p1');
    expect(v.location).toBeDefined();
    expect(typeof v.location?.file).toBe('string');
    expect(v.location?.file).toContain('uses-p1.ts');
    expect(typeof v.location?.line).toBe('number');
    expect(v.location?.line).toBeGreaterThan(0);
  });

  // ----------------------------------------------------------------
  // Scenario B: runtime violation detection + audit
  // ----------------------------------------------------------------

  it('B. RuntimeScopeChecker + AuditLogger record every P1 violation and queryScopeEvents returns them all', async () => {
    const registry = new ScopeRegistry();
    for (const cap of FIXTURE_CAPS) {
      registry.registerCapability(cap);
    }

    const v60Context: ScopeContext = {
      releaseBranch: 'v6.0',
      featureFlags: new Set<string>(),
      environment: 'production',
    };
    const checker = new RuntimeScopeChecker(registry, v60Context);
    const audit = new AuditLogger(logDir, ACTOR);

    try {
      const targets = ['test-p1-bugfix', 'test-p1-design', 'test-p2-webui'];

      // Trigger one violation per target. Each should throw and be
      // logged.
      for (const id of targets) {
        let caught: ScopeBoundaryViolationError | undefined;
        try {
          checker.checkCapability(id, v60Context);
        } catch (err) {
          if (err instanceof ScopeBoundaryViolationError) {
            caught = err;
          } else if (err instanceof ScopeError) {
            // For p2 with a non-v6.0 branch this would not be a boundary
            // violation, but in this test the branch is fixed to v6.0
            // so the type is guaranteed.
            throw err;
          } else {
            throw err;
          }
        }
        expect(caught).toBeInstanceOf(ScopeBoundaryViolationError);
        const violation: ScopeViolationAttempt = {
          capabilityId: caught!.capabilityId,
          scopeTag: caught!.scopeTag,
          context: v60Context,
          timestamp: new Date(),
        };
        await audit.logViolationAttempt(violation);
      }

      // queryScopeEvents must return every recorded violation, filtered
      // by event type.
      const all = await audit.queryScopeEvents({
        eventType: 'scope_violation',
      });
      expect(all.length).toBe(targets.length);
      const recordedIds = all
        .map((e) => (e.payload as ScopeViolationAttempt).capabilityId)
        .sort();
      expect(recordedIds).toEqual([...targets].sort());

      // Filtering by capabilityId should isolate a single record.
      const onlyBugfix = await audit.queryScopeEvents({
        capabilityId: 'test-p1-bugfix',
      });
      expect(onlyBugfix.length).toBe(1);
      expect((onlyBugfix[0]!.payload as ScopeViolationAttempt).capabilityId).toBe(
        'test-p1-bugfix',
      );

      // Filtering by actor should match every event we wrote.
      const byActor = await audit.queryScopeEvents({ actorId: ACTOR.id });
      expect(byActor.length).toBe(targets.length);
    } finally {
      // 异步资源四问 #4：try/finally 确保即使断言失败也 dispose
      await audit.dispose();
      expect(audit.getActiveTimerCount()).toBe(0);
    }
  });

  // ----------------------------------------------------------------
  // Scenario C: unified report format & JSON serialization
  // ----------------------------------------------------------------

  it('C. Unified report contains capabilityId / scopeTag / source / context / suggestion and round-trips through JSON', async () => {
    // -- Static side --
    const violatingFile = join(codeFixtureDir, 'src', 'uses-p1.ts');
    mkdirSync(dirname(violatingFile), { recursive: true });
    writeFileSync(
      violatingFile,
      [
        "import { x } from 'test-p1-bugfix';",
        'export const _ = x;',
        '',
      ].join('\n'),
    );

    const validator = new ScopeValidator();
    validator.setCapabilities(FIXTURE_CAPS);
    const staticResults = validator.validateCodeDependencies(codeFixtureDir);
    const staticEntries = staticResultsToReportEntries(staticResults);

    expect(staticEntries.length).toBeGreaterThanOrEqual(1);

    // -- Runtime side --
    const registry = new ScopeRegistry();
    for (const cap of FIXTURE_CAPS) {
      registry.registerCapability(cap);
    }
    const v60Context: ScopeContext = {
      releaseBranch: 'v6.0',
      featureFlags: new Set<string>(),
      environment: 'production',
    };
    const checker = new RuntimeScopeChecker(registry, v60Context);

    const runtimeEntries: ScopeViolationReportEntry[] = [];
    for (const id of ['test-p1-design', 'test-p2-webui']) {
      try {
        checker.checkCapability(id, v60Context);
      } catch (err) {
        expect(err).toBeInstanceOf(ScopeBoundaryViolationError);
        runtimeEntries.push(
          runtimeErrorToReportEntry(
            err as ScopeBoundaryViolationError,
            v60Context,
          ),
        );
      }
    }
    expect(runtimeEntries.length).toBe(2);

    // -- Build & validate the unified report --
    const report = buildReport([...staticEntries, ...runtimeEntries]);

    expect(report.schema_version).toBe('1.0');
    expect(report.entries.length).toBe(staticEntries.length + runtimeEntries.length);
    expect(report.summary.total).toBe(report.entries.length);
    expect(report.summary.static).toBe(staticEntries.length);
    expect(report.summary.runtime).toBe(runtimeEntries.length);

    // Every entry must carry the five required fields.
    for (const entry of report.entries) {
      expect(typeof entry.capabilityId).toBe('string');
      expect(entry.capabilityId.length).toBeGreaterThan(0);
      expect(['p1', 'p2']).toContain(entry.scopeTag);
      expect(['static', 'runtime']).toContain(entry.source);
      expect(entry.context).toBeDefined();
      expect(typeof entry.suggestion).toBe('string');
      expect(entry.suggestion).toMatch(
        /^启用 feature flag 'enable_[a-zA-Z0-9_-]+'$/,
      );

      if (entry.source === 'static') {
        expect(typeof entry.context.file).toBe('string');
        expect(entry.context.file!.length).toBeGreaterThan(0);
        expect(typeof entry.context.line).toBe('number');
        expect(entry.context.line!).toBeGreaterThan(0);
      } else {
        expect(typeof entry.context.stack).toBe('string');
        expect(entry.context.stack!.length).toBeGreaterThan(0);
        expect(entry.context.releaseBranch).toBe('v6.0');
      }
    }

    // -- JSON serialize & write to disk so this is a true e2e flow --
    const reportPath = join(logDir, 'violation-report.json');
    const serialized = JSON.stringify(report, null, 2);
    await fs.writeFile(reportPath, serialized, 'utf-8');

    const reread = JSON.parse(await fs.readFile(reportPath, 'utf-8')) as
      ScopeViolationReport;

    // Schema and counts survive round-trip.
    expect(reread.schema_version).toBe('1.0');
    expect(reread.entries.length).toBe(report.entries.length);
    expect(reread.summary.total).toBe(report.summary.total);
    expect(reread.summary.static).toBe(report.summary.static);
    expect(reread.summary.runtime).toBe(report.summary.runtime);
    // Per-entry round-trip.
    for (let i = 0; i < report.entries.length; i++) {
      const orig = report.entries[i]!;
      const back = reread.entries[i]!;
      expect(back.capabilityId).toBe(orig.capabilityId);
      expect(back.scopeTag).toBe(orig.scopeTag);
      expect(back.source).toBe(orig.source);
      expect(back.suggestion).toBe(orig.suggestion);
    }
  });

  // ----------------------------------------------------------------
  // Scenario D: pure P0 code passes with zero violations
  // ----------------------------------------------------------------

  it('D. ScopeValidator reports zero violations on a fixture that only imports P0 capabilities', () => {
    const cleanFile = join(cleanCodeFixtureDir, 'src', 'uses-p0.ts');
    mkdirSync(dirname(cleanFile), { recursive: true });
    writeFileSync(
      cleanFile,
      [
        '// fixture: P0-only code, no scope violation expected',
        "import { core } from 'test-p0-core';",
        "import { utils } from 'test-p0-utils';",
        '',
        'export function entry() {',
        '  return core() + utils();',
        '}',
        '',
      ].join('\n'),
    );

    const validator = new ScopeValidator();
    validator.setCapabilities(FIXTURE_CAPS);

    const results = validator.validateCodeDependencies(cleanCodeFixtureDir);

    // None of the boundary-violation codes should fire.
    const violations = results.filter(
      (r) => r.code === 'p0_depends_on_p1' || r.code === 'p0_depends_on_p2',
    );
    expect(violations.length).toBe(0);

    // The unified report layer should agree: zero entries.
    const entries = staticResultsToReportEntries(results);
    expect(entries.length).toBe(0);

    const report = buildReport(entries);
    expect(report.summary.total).toBe(0);
    expect(report.summary.static).toBe(0);
    expect(report.summary.runtime).toBe(0);
  });

  // ----------------------------------------------------------------
  // Scenario E: parent spec capabilities also pass through the report
  // pipeline cleanly (sanity check that the test isn't relying on
  // the synthetic FIXTURE_CAPS alone — it works against the real
  // REQ-25 list too).
  // ----------------------------------------------------------------

  it('E. Real REQ-25 P1 capabilities raise runtime violations and serialize through the report pipeline', async () => {
    const registry = new ScopeRegistry();
    registry.loadFromParentSpecSync(PARENT_SPEC_PATH);
    const allP1 = registry.getCapabilitiesByScope('p1');
    expect(allP1.length).toBeGreaterThan(0);

    const v60Context: ScopeContext = {
      releaseBranch: 'v6.0',
      featureFlags: new Set<string>(),
      environment: 'production',
    };
    const checker = new RuntimeScopeChecker(registry, v60Context);

    const entries: ScopeViolationReportEntry[] = [];
    // Sample first three P1 capabilities to keep the test fast.
    for (const cap of allP1.slice(0, 3)) {
      try {
        checker.checkCapability(cap.id, v60Context);
      } catch (err) {
        if (err instanceof ScopeBoundaryViolationError) {
          entries.push(runtimeErrorToReportEntry(err, v60Context));
        }
      }
    }

    expect(entries.length).toBe(Math.min(3, allP1.length));

    const report = buildReport(entries);
    const json = JSON.stringify(report);
    const reread = JSON.parse(json) as ScopeViolationReport;
    expect(reread.entries.length).toBe(entries.length);
    for (const e of reread.entries) {
      expect(e.source).toBe('runtime');
      expect(e.suggestion).toMatch(/^启用 feature flag 'enable_/);
    }
  });
});
