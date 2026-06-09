/**
 * Feature: specforge-v1-1-compliance-remediation
 * Integration tests: RuntimeInit, Write Scope Gate, Close Gate
 *
 * Tasks: 4.5, 22.2, 32.6
 * Requirements: 1.13-1.20, 4.18-4.19, 7.1-7.14
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { RuntimeInit } from '@/v11/runtime/RuntimeInit';
import { WriteGuard, ChangedFilesAudit } from '@/v11/runtime/WriteGuard';
import { CloseGate } from '@/v11/runtime/CloseGate';

describe('RuntimeInit Integration (Task 4.5)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-v11-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create complete directory structure', () => {
    const init = new RuntimeInit(tempDir);
    const result = init.initialize('test-project');

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Verify directories
    const specDir = path.join(tempDir, '.specforge');
    expect(fs.existsSync(path.join(specDir, 'project'))).toBe(true);
    expect(fs.existsSync(path.join(specDir, 'work-items'))).toBe(true);
    expect(fs.existsSync(path.join(specDir, 'runtime'))).toBe(true);
    expect(fs.existsSync(path.join(specDir, 'runtime', 'logs'))).toBe(true);
    expect(fs.existsSync(path.join(specDir, 'runtime', 'checkpoints'))).toBe(true);
  });

  it('should create manifest files with correct schema', () => {
    const init = new RuntimeInit(tempDir);
    const result = init.initialize('test-project');

    expect(result.success).toBe(true);

    // Verify spec_manifest.json
    const manifestPath = path.join(tempDir, '.specforge', 'project', 'spec_manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.schema_version).toBe('1.0');
    expect(manifest.project_name).toBe('test-project');
    expect(manifest.modules).toEqual([]);
    expect(manifest.project).toBeDefined();

    // Verify extension_registry.json
    const registryPath = path.join(tempDir, '.specforge', 'project', 'extension_registry.json');
    expect(fs.existsSync(registryPath)).toBe(true);
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    expect(registry.schema_version).toBe('1.0');
    expect(registry.namespaces).toBeDefined();
    expect(registry.namespaces.requirement_types).toEqual([]);
  });

  it('should block creation of forbidden directories', () => {
    const init = new RuntimeInit(tempDir);

    expect(init.canCreateDirectory('.specforge/archive').allowed).toBe(false);
    expect(init.canCreateDirectory('.specforge/state').allowed).toBe(false);
    expect(init.canCreateDirectory('.specforge/gates').allowed).toBe(false);
    expect(init.canCreateDirectory('.specforge/archive/sub').allowed).toBe(false);
  });

  it('should allow creation of valid directories', () => {
    const init = new RuntimeInit(tempDir);

    expect(init.canCreateDirectory('.specforge/project').allowed).toBe(true);
    expect(init.canCreateDirectory('.specforge/work-items').allowed).toBe(true);
    expect(init.canCreateDirectory('.specforge/work-items/WI-0001').allowed).toBe(true);
  });

  it('should be idempotent (second init succeeds)', () => {
    const init = new RuntimeInit(tempDir);
    const result1 = init.initialize('test-project');
    expect(result1.success).toBe(true);

    const result2 = init.initialize('test-project');
    expect(result2.success).toBe(true);
    // Second run should not create new directories
    expect(result2.createdDirectories).toHaveLength(0);
  });
});

describe('Write Scope Gate Integration (Task 22.2)', () => {
  it('should pass gate when no escaped write incidents exist', () => {
    const guard = new WriteGuard();
    expect(guard.hasEscapedWriteIncidents('WI-0001')).toBe(false);
  });

  it('should fail gate when escaped write incident exists', () => {
    const guard = new WriteGuard();
    guard.recordEscapedWriteIncident({
      workItemId: 'WI-0001',
      command: 'npm install',
      expectedFiles: ['package.json'],
      actualChangedFiles: ['package.json', 'package-lock.json'],
      escapedWrites: ['package-lock.json'],
      timestamp: new Date().toISOString(),
    });

    expect(guard.hasEscapedWriteIncidents('WI-0001')).toBe(true);
  });

  it('should block state progression when incident exists', () => {
    const guard = new WriteGuard();
    guard.recordEscapedWriteIncident({
      workItemId: 'WI-0001',
      command: 'npm install',
      expectedFiles: ['package.json'],
      actualChangedFiles: ['package.json', 'package-lock.json'],
      escapedWrites: ['package-lock.json'],
      timestamp: new Date().toISOString(),
    });

    // Close Gate should detect unresolved incidents
    const closeGate = new CloseGate();
    const result = closeGate.validateClose({
      currentState: 'verification_done',
      gatesAllPassed: true,
      userDecisionExists: true,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      hasUnprocessedExtensionRequest: false,
      hasUnresolvedEscapedWriteIncident: guard.hasEscapedWriteIncidents('WI-0001'),
    });

    expect(result.canClose).toBe(false);
    expect(result.failedChecks).toContain('write_audit_check');
  });

  it('should allow state progression after incidents cleared', () => {
    const guard = new WriteGuard();
    guard.recordEscapedWriteIncident({
      workItemId: 'WI-0001',
      command: 'npm install',
      expectedFiles: ['package.json'],
      actualChangedFiles: ['package.json', 'package-lock.json'],
      escapedWrites: ['package-lock.json'],
      timestamp: new Date().toISOString(),
    });

    guard.clearEscapedWriteIncidents('WI-0001');
    expect(guard.hasEscapedWriteIncidents('WI-0001')).toBe(false);
  });
});

describe('Close Gate Integration (Task 32.6)', () => {
  const closeGate = new CloseGate();

  it('should close successfully with all checks passing', () => {
    const result = closeGate.validateClose({
      currentState: 'verification_done',
      gatesAllPassed: true,
      userDecisionExists: true,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      evidenceManifestExists: true,
      verificationReportExists: true,
      traceMatrixUpdated: true,
      hasUnprocessedExtensionRequest: false,
      hasUnresolvedEscapedWriteIncident: false,
    });

    expect(result.canClose).toBe(true);
    expect(result.failedChecks).toHaveLength(0);
  });

  it('should reject close when state is not verification_done', () => {
    const result = closeGate.validateClose({
      currentState: 'implementation_running',
      gatesAllPassed: true,
      userDecisionExists: true,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      hasUnprocessedExtensionRequest: false,
      hasUnresolvedEscapedWriteIncident: false,
    });

    expect(result.canClose).toBe(false);
    expect(result.failedChecks).toContain('state_check');
  });

  it('should reject close when gates not all passed', () => {
    const result = closeGate.validateClose({
      currentState: 'verification_done',
      gatesAllPassed: false,
      userDecisionExists: true,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      hasUnprocessedExtensionRequest: false,
      hasUnresolvedEscapedWriteIncident: false,
    });

    expect(result.canClose).toBe(false);
    expect(result.failedChecks).toContain('gates_check');
  });

  it('should reject close when extension request exists', () => {
    const result = closeGate.validateClose({
      currentState: 'verification_done',
      gatesAllPassed: true,
      userDecisionExists: true,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      hasUnprocessedExtensionRequest: true,
      hasUnresolvedEscapedWriteIncident: false,
    });

    expect(result.canClose).toBe(false);
    expect(result.failedChecks).toContain('extension_check');
  });

  it('should skip checks with not_applicable flag', () => {
    const naFlags = new Set(['evidence_check', 'verification_check', 'trace_matrix_check']);
    const result = closeGate.validateClose({
      currentState: 'verification_done',
      gatesAllPassed: true,
      userDecisionExists: true,
      mergeReportExists: true,
      mergeReportAllSuccess: true,
      specVersionIncremented: true,
      evidenceManifestExists: false,
      verificationReportExists: false,
      traceMatrixUpdated: false,
      hasUnprocessedExtensionRequest: false,
      hasUnresolvedEscapedWriteIncident: false,
      notApplicableFlags: naFlags,
    });

    expect(result.canClose).toBe(true);
  });

  it('should support frozen file protection after close', () => {
    const guard = new WriteGuard();
    guard.freezeFile('src/merged-file.ts');

    const result = guard.checkWrite({
      filePath: 'src/merged-file.ts',
      caller: 'agent',
      context: {
        workItemId: 'WI-0001',
        codeChangeAllowed: true,
        allowedWriteFiles: ['src/merged-file.ts'],
        frozenFiles: [],
        isWorkItemClosed: true,
      },
    });

    expect(result.allowed).toBe(false);
  });

  it('should block all writes when work item is closed', () => {
    const guard = new WriteGuard();

    const result = guard.checkWrite({
      filePath: 'src/any-file.ts',
      caller: 'agent',
      context: {
        workItemId: 'WI-0001',
        codeChangeAllowed: true,
        allowedWriteFiles: ['src/any-file.ts'],
        frozenFiles: [],
        isWorkItemClosed: true,
      },
    });

    expect(result.allowed).toBe(false);
  });
});
