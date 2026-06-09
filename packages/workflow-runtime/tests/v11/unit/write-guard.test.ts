/**
 * Feature: specforge-v1-1-compliance-remediation
 * Unit tests for Write Guard, Code Permission Service, and Changed Files Audit
 *
 * Requirements: 4.1-4.29
 */

import { describe, it, expect } from 'vitest';
import { WriteGuard, CodePermissionService, ChangedFilesAudit } from '@/v11/runtime/WriteGuard';

describe('WriteGuard', () => {
  const guard = new WriteGuard();

  const defaultContext = {
    workItemId: 'WI-0001',
    codeChangeAllowed: true,
    allowedWriteFiles: ['src/index.ts', 'src/utils.ts'],
    frozenFiles: [],
    isWorkItemClosed: false,
  };

  describe('Block writes when no active work item', () => {
    it('should block agent writes when no work item', () => {
      const result = guard.checkWrite({
        filePath: 'src/index.ts',
        caller: 'agent',
        context: { ...defaultContext, workItemId: undefined },
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No active work item');
    });
  });

  describe('Block writes when code_change_allowed is false', () => {
    it('should block agent writes when code_change_allowed = false', () => {
      const result = guard.checkWrite({
        filePath: 'src/index.ts',
        caller: 'agent',
        context: { ...defaultContext, codeChangeAllowed: false },
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('code_change_allowed');
    });
  });

  describe('Block writes to files not in allowed_write_files', () => {
    it('should block writes to unauthorized files', () => {
      const result = guard.checkWrite({
        filePath: 'src/unauthorized.ts',
        caller: 'agent',
        context: defaultContext,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not in allowed_write_files');
    });

    it('should allow writes to authorized files', () => {
      const result = guard.checkWrite({
        filePath: 'src/index.ts',
        caller: 'agent',
        context: defaultContext,
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('Protected path blocking', () => {
    it('should block agent writes to .specforge/project/**', () => {
      const result = guard.checkWrite({
        filePath: '.specforge/project/requirements.md',
        caller: 'agent',
        context: defaultContext,
      });
      expect(result.allowed).toBe(false);
    });

    it('should block agent writes to user_decision.json', () => {
      const result = guard.checkWrite({
        filePath: '.specforge/work-items/WI-0001/user_decision.json',
        caller: 'agent',
        context: defaultContext,
      });
      expect(result.allowed).toBe(false);
    });

    it('should block agent writes to gates/**', () => {
      const result = guard.checkWrite({
        filePath: '.specforge/work-items/WI-0001/gates/entry_gate.json',
        caller: 'agent',
        context: defaultContext,
      });
      expect(result.allowed).toBe(false);
    });

    it('should block agent writes to gate_summary.md', () => {
      const result = guard.checkWrite({
        filePath: '.specforge/work-items/WI-0001/gate_summary.md',
        caller: 'agent',
        context: defaultContext,
      });
      expect(result.allowed).toBe(false);
    });

    it('should block agent writes to merge_report.md', () => {
      const result = guard.checkWrite({
        filePath: '.specforge/work-items/WI-0001/merge_report.md',
        caller: 'agent',
        context: defaultContext,
      });
      expect(result.allowed).toBe(false);
    });
  });

  describe('Frozen file protection', () => {
    it('should block writes to frozen files', () => {
      const g = new WriteGuard();
      g.freezeFile('.specforge/work-items/WI-0001/candidate_manifest.json');
      const result = g.checkWrite({
        filePath: '.specforge/work-items/WI-0001/candidate_manifest.json',
        caller: 'agent',
        context: defaultContext,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('frozen');
    });
  });

  describe('Closed work item protection', () => {
    it('should block all writes when work item is closed', () => {
      const result = guard.checkWrite({
        filePath: 'src/index.ts',
        caller: 'agent',
        context: { ...defaultContext, isWorkItemClosed: true },
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('closed');
    });
  });

  describe('Tool interception', () => {
    const toolTypes = ['edit', 'custom_write', 'bash', 'code_formatter', 'code_generator', 'package_manager', 'snapshot_update', 'git_operation'] as const;

    for (const tool of toolTypes) {
      it(`should intercept ${tool} tool writes`, () => {
        const result = guard.interceptToolWrite({
          toolType: tool,
          filePath: 'src/unauthorized.ts',
          caller: 'agent',
          context: defaultContext,
        });
        expect(result.allowed).toBe(false);
      });
    }
  });

  describe('Escaped write incidents', () => {
    it('should record and track escaped write incidents', () => {
      const g = new WriteGuard();
      g.recordEscapedWriteIncident({
        workItemId: 'WI-0001',
        command: 'npm install',
        expectedFiles: ['package.json'],
        actualChangedFiles: ['package.json', 'package-lock.json'],
        escapedWrites: ['package-lock.json'],
        timestamp: new Date().toISOString(),
      });

      expect(g.hasEscapedWriteIncidents('WI-0001')).toBe(true);
      expect(g.hasEscapedWriteIncidents('WI-0002')).toBe(false);

      const incidents = g.getEscapedWriteIncidents('WI-0001');
      expect(incidents).toHaveLength(1);
      expect(incidents[0].escapedWrites).toContain('package-lock.json');
    });

    it('should clear incidents for a work item', () => {
      const g = new WriteGuard();
      g.recordEscapedWriteIncident({
        workItemId: 'WI-0001',
        command: 'npm install',
        expectedFiles: [],
        actualChangedFiles: ['package.json'],
        escapedWrites: ['package.json'],
        timestamp: new Date().toISOString(),
      });

      g.clearEscapedWriteIncidents('WI-0001');
      expect(g.hasEscapedWriteIncidents('WI-0001')).toBe(false);
    });
  });
});

describe('CodePermissionService', () => {
  it('should enable code changes with allowed files', () => {
    const service = new CodePermissionService();
    service.enableCodeChanges('WI-0001', ['src/a.ts', 'src/b.ts']);

    expect(service.isCodeChangeAllowed()).toBe(true);
    expect(service.getAllowedFiles()).toEqual(['src/a.ts', 'src/b.ts']);
    expect(service.getActiveWorkItemId()).toBe('WI-0001');
  });

  it('should disable code changes', () => {
    const service = new CodePermissionService();
    service.enableCodeChanges('WI-0001', ['src/a.ts']);
    service.disableCodeChanges();

    expect(service.isCodeChangeAllowed()).toBe(false);
    expect(service.getAllowedFiles()).toEqual([]);
  });

  it('should add and remove allowed files', () => {
    const service = new CodePermissionService();
    service.enableCodeChanges('WI-0001', ['src/a.ts']);

    service.addAllowedFile('src/b.ts');
    expect(service.getAllowedFiles()).toContain('src/b.ts');

    service.removeAllowedFile('src/a.ts');
    expect(service.getAllowedFiles()).not.toContain('src/a.ts');
  });
});

describe('ChangedFilesAudit', () => {
  const audit = new ChangedFilesAudit();

  it('should return null when actual matches expected', () => {
    const incident = audit.auditFileChanges({
      expectedFiles: ['src/a.ts', 'src/b.ts'],
      actualChangedFiles: ['src/a.ts', 'src/b.ts'],
      command: 'npm test',
      workItemId: 'WI-0001',
    });
    expect(incident).toBeNull();
  });

  it('should detect escaped writes', () => {
    const incident = audit.auditFileChanges({
      expectedFiles: ['src/a.ts'],
      actualChangedFiles: ['src/a.ts', 'src/c.ts'],
      command: 'npm test',
      workItemId: 'WI-0001',
    });
    expect(incident).not.toBeNull();
    expect(incident!.escapedWrites).toEqual(['src/c.ts']);
    expect(incident!.workItemId).toBe('WI-0001');
  });

  it('should detect all unexpected files as escaped', () => {
    const incident = audit.auditFileChanges({
      expectedFiles: [],
      actualChangedFiles: ['src/a.ts', 'src/b.ts'],
      command: 'npm install',
      workItemId: 'WI-0001',
    });
    expect(incident).not.toBeNull();
    expect(incident!.escapedWrites).toHaveLength(2);
  });
});
