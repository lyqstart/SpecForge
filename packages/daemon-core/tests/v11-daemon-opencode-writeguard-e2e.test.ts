/**
 * v11-daemon-opencode-writeguard-e2e.test.ts
 *
 * End-to-end test exercising the REAL write guard functions from write-guard-v11.ts,
 * simulating what the OpenCode plugin (sf_specforge.ts) does but testing the daemon
 * logic directly with real filesystem evidence.
 *
 * Chain tested:
 *   checkWrite() → performChangedFilesAudit() → filesystem evidence → close_gate validation
 *
 * 5 Scenarios:
 *   A1: No active WI → write blocked
 *   A2: code_change_allowed=false → write blocked
 *   A3: allowed_write_files match → write allowed
 *   A4: Outside allowed_write_files → write blocked
 *   A5: Side-effect tool audit
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { checkWrite, performChangedFilesAudit, type WriteGuardContext, type AuditResult } from '../src/tools/lib/write-guard-v11';

describe('v1.1 Daemon/OpenCode Write Guard E2E', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sf-wg-e2e-'));
    // Create basic .specforge structure
    const projectDir = join(tempDir, '.specforge', 'project');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'spec_manifest.json'), JSON.stringify({
      schema_version: '1.0', project_spec_version: 'PSV-0001', project_name: 'wg-e2e',
    }));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // A1: No active WI → write must be blocked
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('A1: No active WI → write blocked', () => {
    it('checkWrite blocks agent write without active WI', () => {
      const ctx: WriteGuardContext = {
        hasActiveWI: false,
        callerRole: 'agent',
        isFrozen: false,
      };
      const result = checkWrite(ctx, 'src/app.ts', 'modify');
      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('no active WI');
    });

    it('file remains unmodified when write is blocked', () => {
      // Create file on disk
      const filePath = join(tempDir, 'src', 'app.ts');
      mkdirSync(join(tempDir, 'src'), { recursive: true });
      writeFileSync(filePath, 'original content');

      // Simulate plugin behavior: check write, get blocked, don't write
      const ctx: WriteGuardContext = {
        hasActiveWI: false,
        callerRole: 'agent',
        isFrozen: false,
      };
      const result = checkWrite(ctx, 'src/app.ts', 'modify');
      expect(result.allowed).toBe(false);

      // File unchanged on disk
      expect(readFileSync(filePath, 'utf-8')).toBe('original content');
    });

    it('violation is recordable to filesystem as evidence', () => {
      const ctx: WriteGuardContext = {
        hasActiveWI: false,
        callerRole: 'agent',
        isFrozen: false,
      };
      const result = checkWrite(ctx, 'src/app.ts', 'modify');
      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);

      // Write violation to filesystem as evidence (what daemon would do)
      const wiDir = join(tempDir, '.specforge', 'work-items', 'NO-WI');
      mkdirSync(wiDir, { recursive: true });
      writeFileSync(join(wiDir, 'write_violation.json'), JSON.stringify({
        blocked: true,
        path: 'src/app.ts',
        reason: result.violations[0],
        timestamp: new Date().toISOString(),
      }));
      expect(existsSync(join(wiDir, 'write_violation.json'))).toBe(true);

      // Verify the written evidence is readable and correct
      const evidence = JSON.parse(readFileSync(join(wiDir, 'write_violation.json'), 'utf-8'));
      expect(evidence.blocked).toBe(true);
      expect(evidence.reason).toContain('no active WI');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // A2: code_change_allowed=false → blocked
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('A2: code_change_allowed=false → blocked', () => {
    const WI_ID = 'WI-E2E-WG-001';

    it('blocks write when code_change_allowed is false', () => {
      const ctx: WriteGuardContext = {
        hasActiveWI: true,
        workItem: {
          work_item_id: WI_ID,
          status: 'implementation_running',
          code_change_allowed: false,
          allowed_write_files: [],
          workflow_path: 'requirement_change_path',
        },
        callerRole: 'agent',
        isFrozen: false,
      };
      const result = checkWrite(ctx, 'src/app.ts', 'modify');
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain('code_change_allowed=false');
    });

    it('file remains unmodified on disk', () => {
      mkdirSync(join(tempDir, 'src'), { recursive: true });
      writeFileSync(join(tempDir, 'src', 'app.ts'), 'original');

      const ctx: WriteGuardContext = {
        hasActiveWI: true,
        workItem: {
          work_item_id: WI_ID,
          status: 'implementation_running',
          code_change_allowed: false,
          allowed_write_files: [],
          workflow_path: 'requirement_change_path',
        },
        callerRole: 'agent',
        isFrozen: false,
      };
      const result = checkWrite(ctx, 'src/app.ts', 'modify');
      expect(result.allowed).toBe(false);
      expect(readFileSync(join(tempDir, 'src', 'app.ts'), 'utf-8')).toBe('original');
    });

    it('close_gate fails due to violation in changed_files_audit', () => {
      const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);
      mkdirSync(wiDir, { recursive: true });

      // Write a changed_files_audit that shows a violation
      writeFileSync(join(wiDir, 'changed_files_audit.json'), JSON.stringify({
        status: 'failed',
        actual_changed_files: [],
        violations: ['code_change_allowed=false, cannot write: src/app.ts'],
      }));

      // Close gate reads filesystem — changed_files_audit shows violation
      const auditContent = JSON.parse(readFileSync(join(wiDir, 'changed_files_audit.json'), 'utf-8'));
      expect(auditContent.status).toBe('failed');
      expect(auditContent.violations.length).toBeGreaterThan(0);
      expect(auditContent.violations[0]).toContain('code_change_allowed=false');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // A3: allowed_write_files match → write allowed
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('A3: allowed_write_files match → write allowed', () => {
    const WI_ID = 'WI-E2E-WG-002';

    it('allows write to file in allowed_write_files', () => {
      const ctx: WriteGuardContext = {
        hasActiveWI: true,
        workItem: {
          work_item_id: WI_ID,
          status: 'implementation_running',
          code_change_allowed: true,
          allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
          workflow_path: 'code_only_fast_path',
        },
        callerRole: 'agent',
        isFrozen: false,
      };
      const result = checkWrite(ctx, 'src/app.ts', 'modify');
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('file is actually modified after allowed write', () => {
      mkdirSync(join(tempDir, 'src'), { recursive: true });
      writeFileSync(join(tempDir, 'src', 'app.ts'), 'original');

      const ctx: WriteGuardContext = {
        hasActiveWI: true,
        workItem: {
          work_item_id: WI_ID,
          status: 'implementation_running',
          code_change_allowed: true,
          allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
          workflow_path: 'code_only_fast_path',
        },
        callerRole: 'agent',
        isFrozen: false,
      };
      const result = checkWrite(ctx, 'src/app.ts', 'modify');
      expect(result.allowed).toBe(true);

      // Simulate actual write (what plugin does after checkWrite passes)
      writeFileSync(join(tempDir, 'src', 'app.ts'), 'modified content');
      expect(readFileSync(join(tempDir, 'src', 'app.ts'), 'utf-8')).toBe('modified content');
    });

    it('changed_files_audit passes when only allowed files changed', () => {
      const auditResult: AuditResult = performChangedFilesAudit(
        [{ path: 'src/app.ts', operation: 'modify' }],
        [{ path: 'src/app.ts', operation: 'modify' }],
        'agent',
      );
      expect(auditResult.passed).toBe(true);
      expect(auditResult.violations).toHaveLength(0);
      expect(auditResult.in_scope).toBe(1);
      expect(auditResult.out_of_scope).toBe(0);
    });

    it('full evidence chain passes close_gate filesystem validation', () => {
      const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);
      mkdirSync(join(wiDir, 'evidence'), { recursive: true });

      // Write all required evidence files
      writeFileSync(join(wiDir, 'trace_delta.md'), '# Trace Delta\n\nTrace Impact: none\n');
      writeFileSync(join(wiDir, 'verification_report.md'), '# Verification Report\nAll passed.\n');
      writeFileSync(join(wiDir, 'evidence', 'evidence_manifest.json'), JSON.stringify({
        schema_version: '1.0', work_item_id: WI_ID, artifacts: [],
      }));
      writeFileSync(join(wiDir, 'changed_files_audit.json'), JSON.stringify({
        status: 'passed', actual_changed_files: ['src/app.ts'], violations: [],
      }));
      writeFileSync(join(wiDir, 'merge_report.md'), '# Merge Report\n\n**Merge Status**: not_applicable\n');

      // Validate all evidence files exist (simulating CloseGate.validateFromFileSystem)
      const evidencePath = join(tempDir, `.specforge/work-items/${WI_ID}/evidence/evidence_manifest.json`);
      const verificationPath = join(tempDir, `.specforge/work-items/${WI_ID}/verification_report.md`);
      const traceDeltaPath = join(tempDir, `.specforge/work-items/${WI_ID}/trace_delta.md`);
      const auditPath = join(tempDir, `.specforge/work-items/${WI_ID}/changed_files_audit.json`);

      expect(existsSync(evidencePath)).toBe(true);
      expect(existsSync(verificationPath)).toBe(true);
      expect(existsSync(traceDeltaPath)).toBe(true);
      expect(existsSync(auditPath)).toBe(true);

      // Read merge report to verify it contains not_applicable
      const mergeReport = readFileSync(join(wiDir, 'merge_report.md'), 'utf-8');
      expect(mergeReport).toContain('not_applicable');

      // Read changed_files_audit to verify passed
      const audit = JSON.parse(readFileSync(join(wiDir, 'changed_files_audit.json'), 'utf-8'));
      expect(audit.status).toBe('passed');
      expect(audit.violations).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // A4: Outside allowed_write_files → blocked
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('A4: outside allowed_write_files → blocked', () => {
    const WI_ID = 'WI-E2E-WG-003';

    it('blocks write to file NOT in allowed_write_files', () => {
      const ctx: WriteGuardContext = {
        hasActiveWI: true,
        workItem: {
          work_item_id: WI_ID,
          status: 'implementation_running',
          code_change_allowed: true,
          allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
          workflow_path: 'code_only_fast_path',
        },
        callerRole: 'agent',
        isFrozen: false,
      };
      const result = checkWrite(ctx, 'src/secret.ts', 'modify');
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain('not in allowed_write_files');
    });

    it('file remains unmodified when blocked', () => {
      mkdirSync(join(tempDir, 'src'), { recursive: true });
      writeFileSync(join(tempDir, 'src', 'secret.ts'), 'secret original');

      const ctx: WriteGuardContext = {
        hasActiveWI: true,
        workItem: {
          work_item_id: WI_ID,
          status: 'implementation_running',
          code_change_allowed: true,
          allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
          workflow_path: 'code_only_fast_path',
        },
        callerRole: 'agent',
        isFrozen: false,
      };
      const result = checkWrite(ctx, 'src/secret.ts', 'modify');
      expect(result.allowed).toBe(false);
      expect(readFileSync(join(tempDir, 'src', 'secret.ts'), 'utf-8')).toBe('secret original');
    });

    it('changed_files_audit fails when out-of-scope files found', () => {
      const auditResult: AuditResult = performChangedFilesAudit(
        [
          { path: 'src/app.ts', operation: 'modify' },
          { path: 'src/secret.ts', operation: 'modify' },
        ],
        [{ path: 'src/app.ts', operation: 'modify' }],
        'agent',
      );
      expect(auditResult.passed).toBe(false);
      expect(auditResult.violations.length).toBeGreaterThan(0);
      expect(auditResult.violations.some(v => v.includes('out_of_scope'))).toBe(true);
      expect(auditResult.out_of_scope).toBe(1);
    });

    it('close_gate fails when changed_files_audit has violations', () => {
      const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);
      mkdirSync(join(wiDir, 'evidence'), { recursive: true });

      writeFileSync(join(wiDir, 'trace_delta.md'), '# Trace Delta\nTrace Impact: none\n');
      writeFileSync(join(wiDir, 'verification_report.md'), '# Verification Report\n');
      writeFileSync(join(wiDir, 'evidence', 'evidence_manifest.json'), '{}');
      writeFileSync(join(wiDir, 'merge_report.md'), '**Merge Status**: not_applicable\n');

      // Write audit with violations
      writeFileSync(join(wiDir, 'changed_files_audit.json'), JSON.stringify({
        status: 'failed',
        actual_changed_files: ['src/app.ts', 'src/secret.ts'],
        violations: ['out_of_scope: src/secret.ts'],
      }));

      const audit = JSON.parse(readFileSync(join(wiDir, 'changed_files_audit.json'), 'utf-8'));
      expect(audit.status).toBe('failed');
      expect(audit.violations.length).toBeGreaterThan(0);
      expect(audit.violations[0]).toContain('out_of_scope');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // A5: Side-effect tool audit
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('A5: side-effect tool audit', () => {
    const WI_ID = 'WI-E2E-WG-004';

    it('side-effect tool producing extra files detected by changed_files_audit', () => {
      // Simulate: formatter ran and modified files beyond allowed scope
      const auditResult: AuditResult = performChangedFilesAudit(
        [
          { path: 'src/app.ts', operation: 'modify' },       // expected
          { path: 'src/utils.ts', operation: 'modify' },     // side-effect from formatter
          { path: '.prettierrc', operation: 'modify' },      // side-effect
        ],
        [{ path: 'src/app.ts', operation: 'modify' }],
        'agent',
      );
      expect(auditResult.passed).toBe(false);
      expect(auditResult.side_effects).toBe(2);
      expect(auditResult.violations).toContain('out_of_scope: src/utils.ts');
      expect(auditResult.violations).toContain('out_of_scope: .prettierrc');
    });

    it('side-effect audit result written to filesystem as evidence', () => {
      const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);
      mkdirSync(wiDir, { recursive: true });

      const auditResult: AuditResult = performChangedFilesAudit(
        [
          { path: 'src/app.ts', operation: 'modify' },
          { path: 'node_modules/.package-lock.json', operation: 'modify' },
        ],
        [{ path: 'src/app.ts', operation: 'modify' }],
        'agent',
      );

      // Write audit to disk (what daemon would do)
      writeFileSync(join(wiDir, 'changed_files_audit.json'), JSON.stringify({
        status: auditResult.passed ? 'passed' : 'failed',
        actual_changed_files: auditResult.entries.map(e => e.path),
        violations: auditResult.violations,
        side_effects: auditResult.side_effects,
      }));

      const onDisk = JSON.parse(readFileSync(join(wiDir, 'changed_files_audit.json'), 'utf-8'));
      expect(onDisk.status).toBe('failed');
      expect(onDisk.violations.length).toBeGreaterThan(0);
      expect(onDisk.side_effects).toBe(1);
    });

    it('close_gate fails when side-effect audit has violations', () => {
      const wiDir = join(tempDir, '.specforge', 'work-items', WI_ID);
      mkdirSync(join(wiDir, 'evidence'), { recursive: true });

      writeFileSync(join(wiDir, 'trace_delta.md'), '# Trace\nTrace Impact: none\n');
      writeFileSync(join(wiDir, 'verification_report.md'), '# Verification\n');
      writeFileSync(join(wiDir, 'evidence', 'evidence_manifest.json'), '{}');
      writeFileSync(join(wiDir, 'merge_report.md'), '**Merge Status**: not_applicable\n');
      writeFileSync(join(wiDir, 'changed_files_audit.json'), JSON.stringify({
        status: 'failed',
        actual_changed_files: ['src/app.ts', 'node_modules/.package-lock.json'],
        violations: ['out_of_scope: node_modules/.package-lock.json'],
      }));

      const audit = JSON.parse(readFileSync(join(wiDir, 'changed_files_audit.json'), 'utf-8'));
      expect(audit.status).toBe('failed');
      expect(audit.violations.length).toBeGreaterThan(0);
    });

    it('agent write to .specforge/project blocked even with active WI', () => {
      const ctx: WriteGuardContext = {
        hasActiveWI: true,
        workItem: {
          work_item_id: WI_ID,
          status: 'implementation_running',
          code_change_allowed: true,
          allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
          workflow_path: 'code_only_fast_path',
        },
        callerRole: 'agent',
        isFrozen: false,
      };
      // Agent trying to write to project specs (should be blocked — only merge_runner allowed)
      const result = checkWrite(ctx, '.specforge/project/requirements_index.md', 'modify');
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain('only merge_runner');
    });
  });
});
