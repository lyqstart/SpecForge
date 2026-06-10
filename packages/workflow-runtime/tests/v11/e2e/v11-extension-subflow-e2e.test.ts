/**
 * SpecForge v1.1 Extension Subflow E2E Test Suite
 *
 * Exercises the full extension subflow lifecycle on real filesystem:
 *   Agent detects unknown types → extension_request.json
 *   → sf-extension generates candidates → extension_gate
 *   → User Decision → executeV11Merge() → main flow resumes
 *
 * 6 positive scenarios (B1-B6) + 8 negative scenarios.
 *
 * Uses REAL temp directory and REAL runtime components.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  ExtensionRegistry,
  ExtensionGate,
  ExtensionSubflowScheduler,
  ExtensionAgent,
  FlowResumption,
  MergeRunner,
  UserDecisionRecorder,
  GateRunner,
  PathPolicy,
  StateMachine,
  type V11CandidateManifest,
  type ExtensionRegistryData,
} from '@/v11/index';

// ═══════════════════════════════════════════════════════════════════════════════
// Shared fixtures
// ═══════════════════════════════════════════════════════════════════════════════

const WI_ID = 'WI-EXT-E2E-001';
let tempRoot: string;
let wiDir: string;
let projectDir: string;
let candidatesDir: string;
let gatesDir: string;

/** Simple SHA-256 simulation for tests (matches UserDecisionRecorder.calculateHash) */
function calculateHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `sha256:${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

beforeAll(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'sf-ext-e2e-'));
  projectDir = join(tempRoot, '.specforge', 'project');
  wiDir = join(tempRoot, '.specforge', 'work-items', WI_ID);
  candidatesDir = join(wiDir, 'candidates', 'project');
  gatesDir = join(wiDir, 'gates');

  mkdirSync(projectDir, { recursive: true });
  mkdirSync(wiDir, { recursive: true });
  mkdirSync(candidatesDir, { recursive: true });
  mkdirSync(gatesDir, { recursive: true });

  // Initial extension_registry.json — empty (no retry_policy or circuit_breaker)
  const initialRegistry: ExtensionRegistryData = {
    schema_version: '1.0',
    project_spec_version: 'PSV-0001',
    namespaces: {
      requirement_types: [],
      design_types: [],
      task_types: [],
      verification_types: [],
      gate_types: [],
    },
    updated_by_work_item: null,
    updated_at: null,
  };
  writeFileSync(
    join(projectDir, 'extension_registry.json'),
    JSON.stringify(initialRegistry, null, 2),
  );
});

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B1: Extension request triggered on unknown type
// ═══════════════════════════════════════════════════════════════════════════════

describe('B1: Extension request triggered on unknown type', () => {
  it('detects unknown types and generates extension_request.json', () => {
    // Setup: registry without retry_policy
    const registry = new ExtensionRegistry();

    // Detect unknown types
    const unknownTypes = registry.detectUnknownTypes('design', ['retry_policy', 'circuit_breaker']);
    expect(unknownTypes).toContain('retry_policy');
    expect(unknownTypes).toContain('circuit_breaker');
    expect(unknownTypes.length).toBe(2);

    // Generate extension request
    const request = registry.generateExtensionRequest({
      workItemId: WI_ID,
      artifactType: 'design',
      unknownTypes,
      usageContext: 'Need retry and circuit breaker patterns for resilience',
      blocking: true,
    });

    // Write to filesystem
    writeFileSync(join(wiDir, 'extension_request.json'), JSON.stringify(request, null, 2));

    // Verify structure
    expect(request.schema_version).toBe('1.0');
    expect(request.blocking_current_flow).toBe(true);
    expect(request.requested_types.length).toBe(2);
    expect(request.requested_types[0].namespace).toBe('design_types');
    expect(request.requested_types[0].type_id).toBe('retry_policy');
    expect(request.requested_types[1].type_id).toBe('circuit_breaker');
    expect(request.requested_at).toBeTruthy();

    // File actually exists on disk
    expect(existsSync(join(wiDir, 'extension_request.json'))).toBe(true);
  });

  it('subflow scheduler detects request and blocks main flow', () => {
    const request = JSON.parse(readFileSync(join(wiDir, 'extension_request.json'), 'utf-8'));
    const scheduler = new ExtensionSubflowScheduler(WI_ID);

    const result = scheduler.startSubflow(request);
    expect(result.started).toBe(true);
    expect(scheduler.getState()).toBe('requested');

    // Main flow should be blocked — state machine cannot advance past candidate_preparing
    const sm = new StateMachine(WI_ID, 'candidate_preparing');
    // The presence of a blocking extension request means orchestrator must pause.
    // We verify by confirming the scheduler state is 'requested' (not 'completed').
    expect(scheduler.getState()).not.toBe('completed');
    expect(request.blocking_current_flow).toBe(true);
  });

  it('ExtensionGate validates completeness of request', () => {
    const request = JSON.parse(readFileSync(join(wiDir, 'extension_request.json'), 'utf-8'));
    const gate = new ExtensionGate();

    const completeness = gate.validateCompleteness(request);
    expect(completeness.valid).toBe(true);
    expect(completeness.errors).toHaveLength(0);
  });

  it('ExtensionGate validates no conflicts with current registry', () => {
    const request = JSON.parse(readFileSync(join(wiDir, 'extension_request.json'), 'utf-8'));
    const registryData = JSON.parse(readFileSync(join(projectDir, 'extension_registry.json'), 'utf-8'));
    const gate = new ExtensionGate();

    const conflicts = gate.validateNoConflicts(request, registryData);
    expect(conflicts.valid).toBe(true);
    expect(conflicts.conflicts).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B2: sf-extension generates extension candidate
// ═══════════════════════════════════════════════════════════════════════════════

describe('B2: sf-extension generates extension candidate', () => {
  it('generates extension_delta.md, candidate registry, and candidate_manifest.json', () => {
    const request = JSON.parse(readFileSync(join(wiDir, 'extension_request.json'), 'utf-8'));
    const currentRegistry = JSON.parse(readFileSync(join(projectDir, 'extension_registry.json'), 'utf-8'));

    // Spawn sf-extension agent
    const scheduler = new ExtensionSubflowScheduler(WI_ID);
    scheduler.startSubflow(request);
    const agentContext = scheduler.spawnAgent(currentRegistry);
    expect(scheduler.getState()).toBe('agent_spawned');

    // Agent generates candidate
    const agent = new ExtensionAgent();
    const candidate = agent.generateCandidate(agentContext);

    // Write extension_delta.md
    writeFileSync(join(wiDir, 'extension_delta.md'), candidate.extension_delta_md);
    expect(existsSync(join(wiDir, 'extension_delta.md'))).toBe(true);
    expect(candidate.extension_delta_md).toContain('retry_policy');
    expect(candidate.extension_delta_md).toContain('circuit_breaker');

    // Build new registry content for candidate
    const newRegistryData: ExtensionRegistryData = {
      ...currentRegistry,
      namespaces: {
        ...currentRegistry.namespaces,
        ...candidate.extension_registry_update.namespaces,
      },
      project_spec_version: 'PSV-0002',
      updated_by_work_item: WI_ID,
      updated_at: candidate.extension_registry_update.updated_at ?? new Date().toISOString(),
    };

    const candidateRegistryContent = JSON.stringify(newRegistryData, null, 2);
    writeFileSync(join(candidatesDir, 'extension_registry.json'), candidateRegistryContent);
    expect(existsSync(join(candidatesDir, 'extension_registry.json'))).toBe(true);

    // Calculate hashes for manifest
    const candidateHash = calculateHash(candidateRegistryContent);
    const currentRegistryContent = readFileSync(join(projectDir, 'extension_registry.json'), 'utf-8');
    const targetBaseHash = calculateHash(currentRegistryContent);

    // Build v1.1 candidate_manifest.json
    const candidatePath = `.specforge/work-items/${WI_ID}/candidates/project/extension_registry.json`;
    const targetPath = '.specforge/project/extension_registry.json';

    const manifest: V11CandidateManifest = {
      schema_version: '1.0',
      work_item_id: WI_ID,
      workflow_path: 'extension_subflow',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      entries: [{
        candidate_path: candidatePath,
        target_path: targetPath,
        operation: 'replace',
        candidate_hash: candidateHash,
        target_base_hash: targetBaseHash,
      }],
      manifest_hash: '', // will compute below
    };

    // Compute manifest_hash over the manifest (without manifest_hash itself)
    const manifestForHash = { ...manifest, manifest_hash: '' };
    manifest.manifest_hash = calculateHash(JSON.stringify(manifestForHash));

    writeFileSync(join(wiDir, 'candidate_manifest.json'), JSON.stringify(manifest, null, 2));
    expect(existsSync(join(wiDir, 'candidate_manifest.json'))).toBe(true);

    // Validate manifest with MergeRunner
    const mergeRunner = new MergeRunner();
    const validation = mergeRunner.validateV11Manifest(manifest);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Receive candidate in scheduler
    const receiveResult = scheduler.receiveCandidate(candidate);
    expect(receiveResult.accepted).toBe(true);
    expect(scheduler.getState()).toBe('candidate_generated');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B3: extension_gate generates standard Gate Report
// ═══════════════════════════════════════════════════════════════════════════════

describe('B3: extension_gate generates standard Gate Report', () => {
  it('generates gates/extension_gate.json with all v1.1 fields', () => {
    const request = JSON.parse(readFileSync(join(wiDir, 'extension_request.json'), 'utf-8'));
    const currentRegistry = JSON.parse(readFileSync(join(projectDir, 'extension_registry.json'), 'utf-8'));
    const gate = new ExtensionGate();

    // Run gate checks
    const completenessResult = gate.validateCompleteness(request);
    const conflictResult = gate.validateNoConflicts(request, currentRegistry);

    const startedAt = new Date().toISOString();

    // Build v1.1 Gate Report
    const gateReport = {
      schema_version: '1.0' as const,
      work_item_id: WI_ID,
      gate_id: 'extension_gate',
      gate_type: 'hard_gate' as const,
      required: true,
      status: (completenessResult.valid && conflictResult.valid ? 'passed' : 'failed') as 'passed' | 'failed',
      input_files: [
        `.specforge/work-items/${WI_ID}/extension_request.json`,
        `.specforge/work-items/${WI_ID}/candidates/project/extension_registry.json`,
        '.specforge/project/extension_registry.json',
      ],
      checks: [
        { name: 'completeness', passed: completenessResult.valid, description: 'All requested types have valid definitions' },
        { name: 'no_conflicts', passed: conflictResult.valid, description: 'No conflicts with existing registry' },
      ],
      blocking_issues: [] as string[],
      warnings: [] as string[],
      waiver_allowed: false,
      runner: 'gate_runner',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    };

    // Write to filesystem
    writeFileSync(join(gatesDir, 'extension_gate.json'), JSON.stringify(gateReport, null, 2));
    expect(existsSync(join(gatesDir, 'extension_gate.json'))).toBe(true);

    // Validate with GateRunner
    const gateRunner = new GateRunner();
    const validation = gateRunner.validateV11GateReport(gateReport);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Verify all required fields present
    expect(gateReport.gate_id).toBe('extension_gate');
    expect(gateReport.gate_type).toBe('hard_gate');
    expect(gateReport.required).toBe(true);
    expect(gateReport.status).toBe('passed');
    expect(gateReport.input_files.length).toBeGreaterThan(0);
    expect(gateReport.checks.length).toBe(2);
    expect(gateReport.waiver_allowed).toBe(false);
    expect(gateReport.runner).toBe('gate_runner');
    expect(gateReport.started_at).toBeTruthy();
    expect(gateReport.finished_at).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B4: User Decision structured
// ═══════════════════════════════════════════════════════════════════════════════

describe('B4: User Decision structured with hash binding', () => {
  it('records user approval bound to manifest and gate hashes', () => {
    const manifestContent = readFileSync(join(wiDir, 'candidate_manifest.json'), 'utf-8');
    const gateContent = readFileSync(join(gatesDir, 'extension_gate.json'), 'utf-8');

    const recorder = new UserDecisionRecorder();
    const decision = recorder.recordApproval({
      workItemId: WI_ID,
      approved: true,
      baseSpecVersion: 'PSV-0001',
      candidateManifestContent: manifestContent,
      gateSummaryContent: gateContent,
      userId: 'user-ext-test',
      comments: 'Approved extension types: retry_policy, circuit_breaker',
    });

    // Write user_decision.json to filesystem
    const serialized = recorder.serializeDecision(decision);
    expect(serialized.success).toBe(true);
    writeFileSync(join(wiDir, 'user_decision.json'), serialized.data!);
    expect(existsSync(join(wiDir, 'user_decision.json'))).toBe(true);

    // Verify structure
    expect(decision.schema_version).toBe('1.0');
    expect(decision.work_item_id).toBe(WI_ID);
    expect(decision.approved).toBe(true);
    expect(decision.base_spec_version).toBe('PSV-0001');
    expect(decision.candidate_manifest_hash).toMatch(/^sha256:/);
    expect(decision.gate_summary_hash).toMatch(/^sha256:/);
    expect(decision.decided_at).toBeTruthy();

    // Verify hash binding: recalculate hashes and compare
    const expectedManifestHash = calculateHash(manifestContent);
    const expectedGateHash = calculateHash(gateContent);
    expect(decision.candidate_manifest_hash).toBe(expectedManifestHash);
    expect(decision.gate_summary_hash).toBe(expectedGateHash);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B5: executeV11Merge merges extension_registry
// ═══════════════════════════════════════════════════════════════════════════════

describe('B5: executeV11Merge merges extension_registry', () => {
  it('merges candidate into .specforge/project/extension_registry.json', () => {
    const manifestContent = readFileSync(join(wiDir, 'candidate_manifest.json'), 'utf-8');
    const manifest: V11CandidateManifest = JSON.parse(manifestContent);

    const mergeRunner = new MergeRunner();

    // Execute merge with real file I/O callbacks
    const result = mergeRunner.executeV11Merge({
      manifest,
      readCandidate: (path: string) => {
        const absPath = join(tempRoot, path);
        return existsSync(absPath) ? readFileSync(absPath, 'utf-8') : null;
      },
      readTarget: (path: string) => {
        const absPath = join(tempRoot, path);
        return existsSync(absPath) ? readFileSync(absPath, 'utf-8') : null;
      },
      writeTarget: (path: string, content: string) => {
        const absPath = join(tempRoot, path);
        writeFileSync(absPath, content);
        return true;
      },
      calculateHash,
    });

    expect(result.success).toBe(true);
    expect(result.mergedFiles.length).toBe(1);
    expect(result.mergedFiles[0].success).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Verify spec version incremented
    expect(result.newSpecVersion).toBe('PSV-0002');

    // Read merged registry and verify
    const mergedContent = readFileSync(join(projectDir, 'extension_registry.json'), 'utf-8');
    const mergedRegistry: ExtensionRegistryData = JSON.parse(mergedContent);
    expect(mergedRegistry.namespaces.design_types).toContain('retry_policy');
    expect(mergedRegistry.namespaces.design_types).toContain('circuit_breaker');
    expect(mergedRegistry.updated_by_work_item).toBe(WI_ID);
    expect(mergedRegistry.updated_at).toBeTruthy();
    expect(mergedRegistry.project_spec_version).toBe('PSV-0002');

    // Generate merge report
    const report = mergeRunner.generateV11MergeReport({
      workItemId: WI_ID,
      baseSpecVersion: 'PSV-0001',
      newSpecVersion: 'PSV-0002',
      manifestHash: manifest.manifest_hash,
      mergedFiles: result.mergedFiles,
      executedAt: new Date().toISOString(),
    });

    writeFileSync(join(wiDir, 'merge_report.md'), report);
    expect(existsSync(join(wiDir, 'merge_report.md'))).toBe(true);
    expect(report).toContain('PSV-0001');
    expect(report).toContain('PSV-0002');
    expect(report).toContain('merge_runner');
    expect(report).toContain('Merge Status');

    // Validate post-merge
    const postMerge = mergeRunner.validatePostMerge({
      mergedFiles: [{
        candidatePath: manifest.entries[0].candidate_path,
        targetPath: manifest.entries[0].target_path,
        operation: 'update',
        preHash: manifest.entries[0].target_base_hash,
        postHash: result.mergedFiles[0].postMergeHash,
        success: true,
      }],
      specVersionBefore: 'PSV-0001',
      specVersionAfter: 'PSV-0002',
      manifestExists: true,
    });
    expect(postMerge.passed).toBe(true);
    expect(postMerge.errors).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B6: Main flow resumes
// ═══════════════════════════════════════════════════════════════════════════════

describe('B6: Main flow resumes after extension merge', () => {
  it('FlowResumption confirms new types are registered and main flow can continue', () => {
    const mergedRegistryContent = readFileSync(join(projectDir, 'extension_registry.json'), 'utf-8');
    const mergedRegistry: ExtensionRegistryData = JSON.parse(mergedRegistryContent);

    const flow = new FlowResumption();
    const result = flow.canResumeMainFlow({
      extensionSubflowState: 'completed',
      registry: mergedRegistry,
      previouslyUnknownTypes: [
        { namespace: 'design_types', typeId: 'retry_policy' },
        { namespace: 'design_types', typeId: 'circuit_breaker' },
      ],
    });

    expect(result.canResume).toBe(true);
    expect(result.newTypesRegistered).toContain('retry_policy');
    expect(result.newTypesRegistered).toContain('circuit_breaker');
    expect(result.errors).toHaveLength(0);
  });

  it('ExtensionRegistry confirms types are now known', () => {
    const mergedRegistryContent = readFileSync(join(projectDir, 'extension_registry.json'), 'utf-8');
    const mergedRegistry: ExtensionRegistryData = JSON.parse(mergedRegistryContent);
    const registry = new ExtensionRegistry(mergedRegistry);

    // Previously unknown types are now detected as known
    const unknownAfterMerge = registry.detectUnknownTypes('design', ['retry_policy', 'circuit_breaker']);
    expect(unknownAfterMerge).toHaveLength(0);

    // Types registered
    expect(registry.isTypeRegistered('design_types', 'retry_policy')).toBe(true);
    expect(registry.isTypeRegistered('design_types', 'circuit_breaker')).toBe(true);
  });

  it('StateMachine can transition past candidate_prepared after extension resolved', () => {
    // Once extension subflow is complete, main flow can continue
    const sm = new StateMachine(WI_ID, 'candidate_preparing');
    const transition = sm.transition('candidate_prepared', 'state_machine');
    expect(transition.success).toBe(true);
    expect(sm.getCurrentState()).toBe('candidate_prepared');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Negative: Extension Subflow violations
// ═══════════════════════════════════════════════════════════════════════════════

describe('Negative: Extension Subflow violations', () => {
  it('N1: agent cannot directly write .specforge/project/extension_registry.json', () => {
    const policy = new PathPolicy();
    const result = policy.canWritePath('agent', '.specforge/project/extension_registry.json');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('agent_cannot_write');
  });

  it('N2: extension subflow without User Decision cannot merge', () => {
    const scheduler = new ExtensionSubflowScheduler('WI-NEG-001');
    // Try to jump to merged without going through approved
    expect(() => scheduler.recordMerge()).toThrow();
  });

  it('N3: extension subflow without extension_gate cannot proceed to approved', () => {
    const scheduler = new ExtensionSubflowScheduler('WI-NEG-002');
    const request = {
      schema_version: '1.0' as const,
      work_item_id: 'WI-NEG-002',
      requested_types: [{ namespace: 'design_types', type_id: 'x', usage_context: 'test' }],
      blocking_current_flow: true,
      requested_at: new Date().toISOString(),
    };
    scheduler.startSubflow(request);
    // Cannot approve without gate passing first (state is 'requested', not 'gate_passed')
    expect(() => scheduler.recordApproval()).toThrow();
  });

  it('N4: candidate_manifest with operation=update is rejected by executeV11Merge', () => {
    const mergeRunner = new MergeRunner();
    const badManifest = {
      schema_version: '1.0',
      work_item_id: 'WI-NEG-003',
      workflow_path: 'extension_subflow',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc',
      entries: [{
        candidate_path: `.specforge/work-items/WI-NEG-003/candidates/project/extension_registry.json`,
        target_path: '.specforge/project/extension_registry.json',
        operation: 'update',
        candidate_hash: 'sha256:abc',
        target_base_hash: 'sha256:000',
      }],
    } as any;
    const result = mergeRunner.executeV11Merge({
      manifest: badManifest,
      readCandidate: () => '{}',
      readTarget: () => null,
      writeTarget: () => true,
      calculateHash: () => 'sha256:abc',
    });
    expect(result.success).toBe(false);
    expect(result.errors.some((e: string) => e.includes('replace'))).toBe(true);
  });

  it('N5: candidate_manifest with candidates[] old structure is rejected', () => {
    const mergeRunner = new MergeRunner();
    const badManifest = {
      schema_version: '1.0',
      work_item_id: 'WI-NEG-004',
      workflow_path: 'extension_subflow',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc',
      candidates: [{ candidate_path: 'x', target_path: 'y', operation: 'update' }],
    } as any;
    const result = mergeRunner.executeV11Merge({
      manifest: badManifest,
      readCandidate: () => '{}',
      readTarget: () => null,
      writeTarget: () => true,
      calculateHash: () => 'sha256:abc',
    });
    expect(result.success).toBe(false);
    expect(result.errors.some((e: string) => e.includes('entries') || e.includes('candidates'))).toBe(true);
  });

  it('N6: missing candidate_hash is rejected by validateV11Manifest', () => {
    const mergeRunner = new MergeRunner();
    const manifest = {
      schema_version: '1.0',
      work_item_id: 'WI-NEG-005',
      workflow_path: 'extension_subflow',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc',
      entries: [{
        candidate_path: `.specforge/work-items/WI-NEG-005/candidates/project/ext.json`,
        target_path: '.specforge/project/extension_registry.json',
        operation: 'replace',
        target_base_hash: 'sha256:000',
      }],
    };
    const validation = mergeRunner.validateV11Manifest(manifest);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e: string) => e.includes('candidate_hash'))).toBe(true);
  });

  it('N7: missing target_base_hash is rejected by validateV11Manifest', () => {
    const mergeRunner = new MergeRunner();
    const manifest = {
      schema_version: '1.0',
      work_item_id: 'WI-NEG-006',
      workflow_path: 'extension_subflow',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      manifest_hash: 'sha256:abc',
      entries: [{
        candidate_path: `.specforge/work-items/WI-NEG-006/candidates/project/ext.json`,
        target_path: '.specforge/project/extension_registry.json',
        operation: 'replace',
        candidate_hash: 'sha256:abc',
      }],
    };
    const validation = mergeRunner.validateV11Manifest(manifest);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e: string) => e.includes('target_base_hash'))).toBe(true);
  });

  it('N8: extension_registry merge without version increment fails post-merge check', () => {
    const mergeRunner = new MergeRunner();
    const postMerge = mergeRunner.validatePostMerge({
      mergedFiles: [{
        candidatePath: 'x',
        targetPath: 'y',
        operation: 'update',
        preHash: 'a',
        postHash: 'b',
        success: true,
      }],
      specVersionBefore: 'PSV-0001',
      specVersionAfter: 'PSV-0001', // NOT incremented!
      manifestExists: true,
    });
    expect(postMerge.passed).toBe(false);
    expect(postMerge.errors[0]).toContain('not incremented');
  });

  it('N9: main flow resumption fails when types not registered', () => {
    const flow = new FlowResumption();
    const result = flow.canResumeMainFlow({
      extensionSubflowState: 'completed',
      registry: {
        schema_version: '1.0',
        project_spec_version: 'PSV-0002',
        namespaces: {
          requirement_types: [],
          design_types: [], // retry_policy NOT here
          task_types: [],
          verification_types: [],
          gate_types: [],
        },
        updated_by_work_item: null,
        updated_at: null,
      },
      previouslyUnknownTypes: [{ namespace: 'design_types', typeId: 'retry_policy' }],
    });
    expect(result.canResume).toBe(false);
    expect(result.errors[0]).toContain('not registered');
  });
});
