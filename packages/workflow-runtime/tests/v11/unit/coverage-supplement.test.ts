/**
 * Feature: specforge-v1-1-compliance-remediation
 * Coverage supplement tests for low-coverage modules
 *
 * Targets: StateMachine, Runtime, RuntimeInit, PathPolicy, GateRunner,
 *          MergeRunner, UserDecisionRecorder, JsonParser
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { StateMachine, WORK_ITEM_STATES, isForbiddenTransition } from '@/v11/runtime/StateMachine';
import { Runtime } from '@/v11/runtime/Runtime';
import { RuntimeInit } from '@/v11/runtime/RuntimeInit';
import { PathPolicy } from '@/v11/runtime/PathPolicy';
import { GateRunner } from '@/v11/runtime/GateRunner';
import { MergeRunner } from '@/v11/runtime/MergeRunner';
import { UserDecisionRecorder } from '@/v11/runtime/UserDecisionRecorder';
import { JsonParser } from '@/v11/runtime/JsonParser';
import { WriteGuard } from '@/v11/runtime/WriteGuard';
import { ExtensionSubflowScheduler, ExtensionAgent, FlowResumption } from '@/v11/runtime/ExtensionSubflow';
import type { ExtensionRequestData, ExtensionRegistryData } from '@/v11/runtime/ExtensionRegistry';

// ---- StateMachine coverage (65.3% → target 90%+) ----

describe('StateMachine coverage supplement', () => {
  it('should identify terminal states', () => {
    const sm = new StateMachine('WI-0001');
    expect(sm.isTerminalState('closed')).toBe(true);
    expect(sm.isTerminalState('rejected')).toBe(true);
    expect(sm.isTerminalState('superseded')).toBe(true);
    expect(sm.isTerminalState('created')).toBe(false);
    expect(sm.isTerminalState('blocked')).toBe(false);
  });

  it('should serialize state machine state', () => {
    const sm = new StateMachine('WI-0001');
    sm.transition('intake_ready', 'state_machine');
    sm.transition('impact_analyzing', 'state_machine');

    const serialized = sm.serialize();
    expect(serialized.currentState).toBe('impact_analyzing');
    expect(serialized.history).toHaveLength(2);
    expect(serialized.history[0].from_state).toBe('created');
  });

  it('should parse valid metadata', () => {
    const metadata = {
      schema_version: '1.0',
      work_item_id: 'WI-0001',
      title: 'Test WI',
      description: 'Test',
      current_state: 'created',
      workflow_type: 'requirements-first',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      created_by: 'test',
      state_history: [],
    };

    const result = StateMachine.parseMetadata(JSON.stringify(metadata));
    expect(result.success).toBe(true);
    expect(result.data?.work_item_id).toBe('WI-0001');
  });

  it('should reject metadata with invalid state', () => {
    const metadata = {
      schema_version: '1.0',
      work_item_id: 'WI-0001',
      title: 'Test',
      description: 'Test',
      current_state: 'invalid_state',
      workflow_type: 'requirements-first',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      created_by: 'test',
      state_history: [],
    };

    const result = StateMachine.parseMetadata(JSON.stringify(metadata));
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid state');
  });

  it('should reject invalid JSON metadata', () => {
    const result = StateMachine.parseMetadata('not json');
    expect(result.success).toBe(false);
  });

  it('should serialize metadata', () => {
    const metadata = {
      schema_version: '1.0',
      work_item_id: 'WI-0001',
      title: 'Test',
      description: 'Test',
      current_state: 'created' as const,
      workflow_type: 'requirements-first' as const,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      created_by: 'test',
      state_history: [],
    };

    const result = StateMachine.serializeMetadata(metadata);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    const parsed = JSON.parse(result.data!);
    expect(parsed.work_item_id).toBe('WI-0001');
  });

  it('canTransition should check legal transitions', () => {
    const sm = new StateMachine('WI-0001');
    expect(sm.canTransition('intake_ready', 'state_machine').legal).toBe(true);
    expect(sm.canTransition('closed', 'state_machine').legal).toBe(false);
    expect(sm.canTransition('implementation_running', 'state_machine').legal).toBe(false);
  });

  it('canTransition should check caller authorization', () => {
    const sm = new StateMachine('WI-0001', 'gates_running');
    expect(sm.canTransition('gates_failed', 'state_machine').legal).toBe(true);
    expect(sm.canTransition('gates_failed', 'agent').legal).toBe(false);
  });

  it('isForbiddenTransition should detect forbidden transitions', () => {
    expect(isForbiddenTransition('created', 'implementation_running')).toBe(true);
    expect(isForbiddenTransition('closed', 'any')).toBe(true);
    expect(isForbiddenTransition('blocked', 'closed')).toBe(true);
    expect(isForbiddenTransition('created', 'intake_ready')).toBe(false);
  });

  it('should cover blocked → resume transitions', () => {
    const sm = new StateMachine('WI-0001', 'blocked');
    expect(sm.transition('intake_ready', 'state_machine').success).toBe(true);
  });

  it('should cover blocked → candidate_preparing', () => {
    const sm = new StateMachine('WI-0001', 'blocked');
    expect(sm.transition('candidate_preparing', 'state_machine').success).toBe(true);
  });

  it('should cover blocked → gates_running', () => {
    const sm = new StateMachine('WI-0001', 'blocked');
    expect(sm.transition('gates_running', 'state_machine').success).toBe(true);
  });

  it('should cover gates_failed → rejected', () => {
    const sm = new StateMachine('WI-0001', 'gates_failed');
    expect(sm.transition('rejected', 'state_machine').success).toBe(true);
  });

  it('should cover approval_required → superseded', () => {
    const sm = new StateMachine('WI-0001', 'approval_required');
    expect(sm.transition('superseded', 'state_machine').success).toBe(true);
  });

  it('should cover candidate_prepared → superseded', () => {
    const sm = new StateMachine('WI-0001', 'candidate_prepared');
    expect(sm.transition('superseded', 'state_machine').success).toBe(true);
  });
});

// ---- Runtime coverage (80.8% → target 90%+) ----

describe('Runtime coverage supplement', () => {
  it('should initialize runtime', () => {
    const runtime = new Runtime({
      projectRoot: '/tmp/test-project',
      projectName: 'test-project',
    });

    const result = runtime.initialize('test-project');
    // May fail due to fs access, but method is exercised
    expect(runtime.isInitialized()).toBe(result.success);
  });

  it('should create work item state machine with initial state', () => {
    const runtime = new Runtime({
      projectRoot: '/tmp/test-project',
      projectName: 'test-project',
    });

    const sm = runtime.createWorkItemStateMachine('WI-0001', 'created');
    expect(sm.getCurrentState()).toBe('created');
  });

  it('should enforce component boundaries for all components', () => {
    const runtime = new Runtime({
      projectRoot: '/tmp/test-project',
      projectName: 'test-project',
    });

    const boundaries = runtime.enforceComponentBoundaries();
    const keys = Object.keys(boundaries);
    expect(keys.length).toBe(10);
    for (const key of keys) {
      expect(boundaries[key as keyof typeof boundaries]).toHaveLength(1);
    }
  });
});

// ---- PathPolicy coverage ----

describe('PathPolicy coverage supplement', () => {
  const policy = new PathPolicy();

  it('should validate spec paths with valid prefix', () => {
    expect(policy.validateSpecPath('.specforge/project/requirements.md').valid).toBe(true);
  });

  it('should reject spec paths without .specforge/ prefix', () => {
    expect(policy.validateSpecPath('src/index.ts').valid).toBe(false);
  });

  it('should reject spec paths with other violations', () => {
    expect(policy.validateSpecPath('/absolute/.specforge/x').valid).toBe(false);
  });

  it('should check legacy spec paths', () => {
    expect(policy.isLegacySpecPath('.specforge/specs/req.md')).toBe(true);
    expect(policy.isLegacySpecPath('.specforge/specs')).toBe(true);
    expect(policy.isLegacySpecPath('.specforge/project/req.md')).toBe(false);
  });

  it('should check project spec paths', () => {
    expect(policy.isProjectSpecPath('.specforge/project/req.md')).toBe(true);
    expect(policy.isProjectSpecPath('.specforge/project')).toBe(true);
    expect(policy.isProjectSpecPath('.specforge/work-items/WI-0001')).toBe(false);
  });

  it('should check work item paths', () => {
    expect(policy.isWorkItemPath('.specforge/work-items/WI-0001')).toBe(true);
    expect(policy.isWorkItemPath('.specforge/work-items/')).toBe(true);
    expect(policy.isWorkItemPath('.specforge/project')).toBe(false);
  });

  it('should allow runtime callers to write to various paths', () => {
    expect(policy.canWriteToPath('src/index.ts', 'runtime').valid).toBe(true);
    expect(policy.canWriteToPath('.specforge/work-items/WI-0001/candidate.json', 'runtime').valid).toBe(true);
  });

  it('should block agent writes to extension_registry.json', () => {
    expect(policy.canWriteToPath('.specforge/project/extension_registry.json', 'agent').valid).toBe(false);
  });
});

// ---- GateRunner coverage ----

describe('GateRunner coverage supplement', () => {
  it('should handle async gate check functions', async () => {
    const runner = new GateRunner();
    runner.registerGate({
      gate_id: 'async-gate',
      gate_type: 'hard_gate',
      required: true,
      checkFn: async () => ({
        gate_id: 'async-gate',
        passed: true,
        status: 'passed' as const,
        reason: 'Async check passed',
        executed_at: new Date().toISOString(),
      }),
    });

    const result = await runner.runGates();
    expect(result.all_passed).toBe(true);
    expect(result.summary.passed).toBe(1);
  });
});

// ---- MergeRunner coverage ----

describe('MergeRunner coverage supplement', () => {
  const runner = new MergeRunner();

  it('should reject patch hunks', () => {
    const result = runner.validateCandidateFormat('some content\n@@ -1,3 +1,4 @@\ncontext');
    expect(result.valid).toBe(false);
  });

  it('should execute merge with failed read', () => {
    const result = runner.executeMerge({
      manifest: {
        schema_version: '1.0',
        work_item_id: 'WI-0001',
        base_spec_version: 'PSV-0001',
        target_spec_version: 'PSV-0002',
        candidates: [{
          candidate_path: '.specforge/work-items/WI-0001/candidates/req.md',
          target_path: '.specforge/project/requirements.md',
          operation: 'create',
        }],
        generated_at: new Date().toISOString(),
      },
      readCandidate: () => null,
      writeTarget: () => true,
      calculateHash: (s) => s.length.toString(),
    });

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Failed to read candidate');
  });

  it('should execute merge with failed write', () => {
    const result = runner.executeMerge({
      manifest: {
        schema_version: '1.0',
        work_item_id: 'WI-0001',
        base_spec_version: 'PSV-0001',
        target_spec_version: 'PSV-0002',
        candidates: [{
          candidate_path: '.specforge/work-items/WI-0001/candidates/req.md',
          target_path: '.specforge/project/requirements.md',
          operation: 'create',
        }],
        generated_at: new Date().toISOString(),
      },
      readCandidate: () => 'content',
      writeTarget: () => false,
      calculateHash: (s) => s.length.toString(),
    });

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Failed to write target');
  });

  it('should execute successful merge', () => {
    const result = runner.executeMerge({
      manifest: {
        schema_version: '1.0',
        work_item_id: 'WI-0001',
        base_spec_version: 'PSV-0001',
        target_spec_version: 'PSV-0002',
        candidates: [{
          candidate_path: '.specforge/work-items/WI-0001/candidates/req.md',
          target_path: '.specforge/project/requirements.md',
          operation: 'create',
        }],
        generated_at: new Date().toISOString(),
      },
      readCandidate: () => '# Requirements',
      writeTarget: () => true,
      calculateHash: (s) => s.length.toString(),
    });

    expect(result.success).toBe(true);
    expect(result.mergedFiles).toHaveLength(1);
    expect(result.mergedFiles[0].success).toBe(true);
  });

  it('should validate post-merge with multiple failures', () => {
    const result = runner.validatePostMerge({
      mergedFiles: [{
        candidatePath: 'c',
        targetPath: 't',
        operation: 'create',
        preHash: '',
        postHash: '',
        success: false,
        error: 'fail',
      }],
      specVersionBefore: 'PSV-0001',
      specVersionAfter: 'PSV-0001',
      manifestExists: false,
    });

    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ---- UserDecisionRecorder coverage ----

describe('UserDecisionRecorder coverage supplement', () => {
  const recorder = new UserDecisionRecorder();

  it('should serialize and parse decision', () => {
    const decision = recorder.recordApproval({
      workItemId: 'WI-0001',
      approved: true,
      baseSpecVersion: 'PSV-0001',
      candidateManifestContent: 'manifest',
      gateSummaryContent: 'summary',
      userId: 'user1',
      comments: 'LGTM',
    });

    const serialized = recorder.serializeDecision(decision);
    expect(serialized.success).toBe(true);

    const parsed = recorder.parseDecision(serialized.data!);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.user_id).toBe('user1');
    expect(parsed.data?.comments).toBe('LGTM');
  });

  it('should reject invalid JSON for decision parsing', () => {
    const result = recorder.parseDecision('not json');
    expect(result.success).toBe(false);
  });
});

// ---- JsonParser coverage ----

describe('JsonParser coverage supplement', () => {
  it('should handle non-string input', () => {
    // @ts-expect-error Testing runtime behavior
    const result = JsonParser.parse(123);
    expect(result.success).toBe(false);
    expect(result.error).toContain('expected string');
  });

  it('should handle empty string', () => {
    const result = JsonParser.parse('');
    expect(result.success).toBe(false);
    expect(result.error).toContain('empty string');
  });

  it('should handle undefined serialization', () => {
    const result = JsonParser.serialize(undefined);
    expect(result.success).toBe(false);
  });

  it('should handle round-trip failure', () => {
    // Circular reference
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    const result = JsonParser.roundTrip(obj);
    expect(result.success).toBe(false);
  });

  it('should do deep equal comparison', () => {
    expect(JsonParser.deepEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(JsonParser.deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(JsonParser.deepEqual(null, null)).toBe(true);
    expect(JsonParser.deepEqual(null, {})).toBe(false);
    expect(JsonParser.deepEqual(1, '1')).toBe(false);
    expect(JsonParser.deepEqual([1, 2], [1, 2])).toBe(true);
    expect(JsonParser.deepEqual([1, 2], [1, 3])).toBe(false);
  });
});

// ---- WriteGuard coverage ----

describe('WriteGuard coverage supplement', () => {
  it('should handle non-agent callers with closed work item', () => {
    const guard = new WriteGuard();
    const result = guard.checkWrite({
      filePath: 'src/index.ts',
      caller: 'state_machine',
      context: {
        workItemId: 'WI-0001',
        codeChangeAllowed: true,
        allowedWriteFiles: [],
        frozenFiles: [],
        isWorkItemClosed: true,
      },
    });
    expect(result.allowed).toBe(false);
  });
});

// ---- GateRunner branch coverage (50% → target 85%+) ----

describe('GateRunner branch coverage', () => {
  it('should handle skipped gate status', async () => {
    const runner = new GateRunner();
    runner.registerGate({
      gate_id: 'skipped-gate',
      gate_type: 'soft_gate',
      required: false,
      checkFn: () => ({
        gate_id: 'skipped-gate',
        passed: true,
        status: 'skipped' as const,
        reason: 'Skipped',
        executed_at: new Date().toISOString(),
      }),
    });

    const result = await runner.runGates();
    expect(result.summary.skipped).toBe(1);
    expect(result.summary.passed).toBe(0);
    expect(result.all_passed).toBe(true);
  });

  it('should handle waived gate status', async () => {
    const runner = new GateRunner();
    runner.registerGate({
      gate_id: 'waived-gate',
      gate_type: 'soft_gate',
      required: false,
      checkFn: () => ({
        gate_id: 'waived-gate',
        passed: true,
        status: 'waived' as const,
        reason: 'Waived',
        executed_at: new Date().toISOString(),
      }),
    });

    const result = await runner.runGates();
    expect(result.summary.waived).toBe(1);
    expect(result.all_passed).toBe(true);
  });

  it('should handle gate with details in markdown', async () => {
    const runner = new GateRunner();
    runner.registerGate({
      gate_id: 'detail-gate',
      gate_type: 'hard_gate',
      required: true,
      checkFn: () => ({
        gate_id: 'detail-gate',
        passed: true,
        status: 'passed' as const,
        reason: 'Passed with details',
        details: { score: 95, warnings: 0 },
        executed_at: new Date().toISOString(),
      }),
    });

    const execResult = await runner.runGates();
    const markdown = runner.generateGateSummaryMarkdown(execResult);
    expect(markdown).toContain('detail-gate');
    expect(markdown).toContain('score');
  });

  it('should handle gate without details in markdown', async () => {
    const runner = new GateRunner();
    runner.registerGate({
      gate_id: 'no-detail-gate',
      gate_type: 'hard_gate',
      required: true,
      checkFn: () => ({
        gate_id: 'no-detail-gate',
        passed: false,
        status: 'failed' as const,
        reason: 'Failed',
        executed_at: new Date().toISOString(),
      }),
    });

    const execResult = await runner.runGates();
    const markdown = runner.generateGateSummaryMarkdown(execResult);
    expect(markdown).toContain('no-detail-gate');
    expect(markdown).not.toContain('Details');
  });

  it('should determine approval_required on all pass', async () => {
    const runner = new GateRunner();
    runner.registerGate({
      gate_id: 'pass-gate',
      gate_type: 'hard_gate',
      required: true,
      checkFn: () => ({
        gate_id: 'pass-gate',
        passed: true,
        status: 'passed' as const,
        reason: 'OK',
        executed_at: new Date().toISOString(),
      }),
    });

    const result = await runner.runGates();
    expect(runner.determineNextState(result)).toBe('approval_required');
  });

  it('should determine gates_failed on any fail', async () => {
    const runner = new GateRunner();
    runner.registerGate({
      gate_id: 'fail-gate',
      gate_type: 'hard_gate',
      required: true,
      checkFn: () => ({
        gate_id: 'fail-gate',
        passed: false,
        status: 'failed' as const,
        reason: 'Nope',
        executed_at: new Date().toISOString(),
      }),
    });

    const result = await runner.runGates();
    expect(runner.determineNextState(result)).toBe('gates_failed');
  });
});

// ---- PathPolicy branch coverage (82.35% → target 85%+) ----

describe('PathPolicy branch coverage', () => {
  const policy = new PathPolicy();

  describe('validatePathDetailed', () => {
    it('should detect no violations for valid path', () => {
      const result = policy.validatePathDetailed('src/index.ts');
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect absolute unix path violation', () => {
      const result = policy.validatePathDetailed('/usr/local/bin');
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('absolute_path_not_allowed');
    });

    it('should detect absolute windows path violation', () => {
      const result = policy.validatePathDetailed('C:\\Users\\test');
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('backslash_not_allowed');
    });

    it('should detect backslash violation', () => {
      const result = policy.validatePathDetailed('src\\index.ts');
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('backslash_not_allowed');
    });

    it('should detect parent traversal violation', () => {
      const result = policy.validatePathDetailed('src/../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('parent_traversal_not_allowed');
    });

    it('should detect home expansion violation', () => {
      const result = policy.validatePathDetailed('~/Documents/file');
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('home_expansion_not_allowed');
    });

    it('should detect multiple violations simultaneously', () => {
      const result = policy.validatePathDetailed('/~/..\\path');
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
    });

    it('should detect windows drive letter absolute path', () => {
      const result = policy.validatePathDetailed('D:/code/project');
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('absolute_path_not_allowed');
    });
  });

  describe('canWriteToPath agent blocks', () => {
    it('should block agent writes to user_decision.json', () => {
      expect(policy.canWriteToPath('.specforge/work-items/WI-0001/user_decision.json', 'agent').valid).toBe(false);
    });

    it('should block agent writes to gates directory', () => {
      expect(policy.canWriteToPath('.specforge/work-items/WI-0001/gates/check.json', 'agent').valid).toBe(false);
    });

    it('should block agent writes to gates/ path ending', () => {
      expect(policy.canWriteToPath('.specforge/work-items/WI-0001/gates', 'agent').valid).toBe(false);
    });

    it('should block agent writes to gate_summary.md', () => {
      expect(policy.canWriteToPath('.specforge/work-items/WI-0001/gate_summary.md', 'agent').valid).toBe(false);
    });

    it('should block agent writes to merge_report.md', () => {
      expect(policy.canWriteToPath('.specforge/work-items/WI-0001/merge_report.md', 'agent').valid).toBe(false);
    });

    it('should allow agent writes to non-protected paths', () => {
      expect(policy.canWriteToPath('src/index.ts', 'agent').valid).toBe(true);
    });
  });

  describe('canWriteToPath specialized callers', () => {
    it('should allow merge_runner to write to project paths', () => {
      expect(policy.canWriteToPath('.specforge/project/requirements.md', 'merge_runner').valid).toBe(true);
    });

    it('should allow user_decision_recorder to write to user_decision.json', () => {
      expect(policy.canWriteToPath('.specforge/work-items/WI-0001/user_decision.json', 'user_decision_recorder').valid).toBe(true);
    });

    it('should allow gate_runner to write to gates directory', () => {
      expect(policy.canWriteToPath('.specforge/work-items/WI-0001/gates/check.json', 'gate_runner').valid).toBe(true);
    });

    it('should allow gate_runner to write to gate_summary.md', () => {
      expect(policy.canWriteToPath('.specforge/work-items/WI-0001/gate_summary.md', 'gate_runner').valid).toBe(true);
    });
  });

  describe('canCreateDirectory', () => {
    it('should block creation of .specforge/archive', () => {
      expect(policy.canCreateDirectory('.specforge/archive').valid).toBe(false);
    });

    it('should block creation of subdirectory under .specforge/archive', () => {
      expect(policy.canCreateDirectory('.specforge/archive/sub').valid).toBe(false);
    });

    it('should block creation of .specforge/state', () => {
      expect(policy.canCreateDirectory('.specforge/state').valid).toBe(false);
    });

    it('should block creation of .specforge/gates', () => {
      expect(policy.canCreateDirectory('.specforge/gates').valid).toBe(false);
    });

    it('should allow creation of .specforge/project', () => {
      expect(policy.canCreateDirectory('.specforge/project').valid).toBe(true);
    });
  });
});

// ---- RuntimeInit branch coverage (46.66% → target 85%+) ----

describe('RuntimeInit branch coverage', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should initialize successfully with real filesystem', () => {
    const init = new RuntimeInit(tempDir);
    const result = init.initialize('test-project');
    expect(result.success).toBe(true);
    expect(result.createdDirectories.length).toBeGreaterThan(0);
    expect(result.createdFiles).toHaveLength(2);

    // Verify files exist
    const manifestPath = path.join(tempDir, '.specforge', 'project', 'spec_manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.project_name).toBe('test-project');
  });

  it('should be idempotent on second initialize', () => {
    const init = new RuntimeInit(tempDir);
    const result1 = init.initialize('test-project');
    expect(result1.success).toBe(true);

    const result2 = init.initialize('test-project-v2');
    expect(result2.success).toBe(true);
    // Second run should not re-create directories
    expect(result2.createdDirectories).toHaveLength(0);
    // But should re-write files
    expect(result2.createdFiles).toHaveLength(2);
  });

  it('should block forbidden directory creation', () => {
    const init = new RuntimeInit(tempDir);
    expect(init.canCreateDirectory('.specforge/archive').allowed).toBe(false);
    expect(init.canCreateDirectory('.specforge/state').allowed).toBe(false);
    expect(init.canCreateDirectory('.specforge/gates').allowed).toBe(false);
  });

  it('should allow non-forbidden directory creation', () => {
    const init = new RuntimeInit(tempDir);
    expect(init.canCreateDirectory('.specforge/project').allowed).toBe(true);
    expect(init.canCreateDirectory('src/components').allowed).toBe(true);
  });

  it('should block legacy spec writes', () => {
    const init = new RuntimeInit(tempDir);
    expect(init.isLegacySpecWriteBlocked('.specforge/specs/req.md')).toBe(true);
    expect(init.isLegacySpecWriteBlocked('.specforge/specs')).toBe(true);
    expect(init.isLegacySpecWriteBlocked('.specforge/project/req.md')).toBe(false);
  });

  it('should allow legacy spec reads', () => {
    const init = new RuntimeInit(tempDir);
    expect(init.isLegacySpecReadAllowed('.specforge/specs/req.md')).toBe(true);
    expect(init.isLegacySpecReadAllowed('.specforge/project/req.md')).toBe(false);
  });
});

// ---- ExtensionSubflow branch coverage (72.5% → target 85%+) ----

describe('ExtensionSubflow branch coverage', () => {
  function makeRequest(): ExtensionRequestData {
    return {
      work_item_id: 'WI-0001',
      requested_types: [
        { type_id: 'custom_req', namespace: 'requirement_types', usage_context: 'test' },
      ],
    };
  }

  function makeRegistry(): ExtensionRegistryData {
    return {
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
  }

  describe('ExtensionSubflowScheduler', () => {
    it('should reject starting from non-not_started state', () => {
      const scheduler = new ExtensionSubflowScheduler('WI-0001');
      scheduler.startSubflow(makeRequest());
      // Now in 'requested' state
      const result = scheduler.startSubflow(makeRequest());
      expect(result.started).toBe(false);
      expect(result.error).toContain('already in state');
    });

    it('should reject request with mismatched work item id', () => {
      const scheduler = new ExtensionSubflowScheduler('WI-0001');
      const req = makeRequest();
      req.work_item_id = 'WI-0099';
      const result = scheduler.startSubflow(req);
      expect(result.started).toBe(false);
      expect(result.error).toContain('mismatch');
    });

    it('should reject request with empty types', () => {
      const scheduler = new ExtensionSubflowScheduler('WI-0001');
      const req = makeRequest();
      req.requested_types = [];
      const result = scheduler.startSubflow(req);
      expect(result.started).toBe(false);
      expect(result.error).toContain('no requested types');
    });

    it('should reject candidate with missing extension_delta_md', () => {
      const scheduler = new ExtensionSubflowScheduler('WI-0001');
      scheduler.startSubflow(makeRequest());
      scheduler.spawnAgent(makeRegistry());
      const result = scheduler.receiveCandidate({
        schema_version: '1.0',
        work_item_id: 'WI-0001',
        extension_delta_md: '',
        extension_registry_update: { namespaces: { requirement_types: ['custom_req'] } },
        generated_at: new Date().toISOString(),
      });
      expect(result.accepted).toBe(false);
      expect(result.error).toContain('missing extension_delta_md');
    });

    it('should reject candidate with missing extension_registry_update', () => {
      const scheduler = new ExtensionSubflowScheduler('WI-0001');
      scheduler.startSubflow(makeRequest());
      scheduler.spawnAgent(makeRegistry());
      const result = scheduler.receiveCandidate({
        schema_version: '1.0',
        work_item_id: 'WI-0001',
        extension_delta_md: 'some delta',
        extension_registry_update: {},
        generated_at: new Date().toISOString(),
      });
      expect(result.accepted).toBe(false);
      expect(result.error).toContain('missing extension_registry_update');
    });

    it('should throw when starting gate from wrong state', () => {
      const scheduler = new ExtensionSubflowScheduler('WI-0001');
      expect(() => scheduler.startGateValidation()).toThrow('Cannot start gate');
    });

    it('should throw when approving from wrong state', () => {
      const scheduler = new ExtensionSubflowScheduler('WI-0001');
      expect(() => scheduler.recordApproval()).toThrow('Cannot approve');
    });

    it('should throw when merging from wrong state', () => {
      const scheduler = new ExtensionSubflowScheduler('WI-0001');
      expect(() => scheduler.recordMerge()).toThrow('Cannot merge');
    });

    it('should complete full lifecycle', () => {
      const scheduler = new ExtensionSubflowScheduler('WI-0001');
      scheduler.startSubflow(makeRequest());
      scheduler.spawnAgent(makeRegistry());
      scheduler.receiveCandidate({
        schema_version: '1.0',
        work_item_id: 'WI-0001',
        extension_delta_md: 'delta content',
        extension_registry_update: {
          namespaces: { requirement_types: ['custom_req'] },
          updated_by_work_item: 'WI-0001',
          updated_at: new Date().toISOString(),
        },
        generated_at: new Date().toISOString(),
      });
      scheduler.startGateValidation();
      scheduler.recordGateResult(true);
      scheduler.recordApproval();
      scheduler.recordMerge();
      expect(scheduler.getState()).toBe('merged');
      scheduler.complete();
      expect(scheduler.getState()).toBe('completed');
    });

    it('should reject on gate failure', () => {
      const scheduler = new ExtensionSubflowScheduler('WI-0001');
      scheduler.startSubflow(makeRequest());
      scheduler.spawnAgent(makeRegistry());
      scheduler.receiveCandidate({
        schema_version: '1.0',
        work_item_id: 'WI-0001',
        extension_delta_md: 'delta content',
        extension_registry_update: {
          namespaces: { requirement_types: ['custom_req'] },
          updated_by_work_item: 'WI-0001',
          updated_at: new Date().toISOString(),
        },
        generated_at: new Date().toISOString(),
      });
      scheduler.startGateValidation();
      scheduler.recordGateResult(false);
      expect(scheduler.getState()).toBe('rejected');
    });
  });

  describe('FlowResumption', () => {
    it('should allow resume when types are registered', () => {
      const fr = new FlowResumption();
      const registry = makeRegistry();
      registry.namespaces.requirement_types = ['custom_req'];

      const result = fr.canResumeMainFlow({
        extensionSubflowState: 'completed',
        registry,
        previouslyUnknownTypes: [{ namespace: 'requirement_types', typeId: 'custom_req' }],
      });
      expect(result.canResume).toBe(true);
      expect(result.newTypesRegistered).toContain('custom_req');
    });

    it('should block resume when subflow not completed', () => {
      const fr = new FlowResumption();
      const result = fr.canResumeMainFlow({
        extensionSubflowState: 'gate_running',
        registry: makeRegistry(),
        previouslyUnknownTypes: [],
      });
      expect(result.canResume).toBe(false);
    });

    it('should block resume when types not registered', () => {
      const fr = new FlowResumption();
      const result = fr.canResumeMainFlow({
        extensionSubflowState: 'completed',
        registry: makeRegistry(),
        previouslyUnknownTypes: [{ namespace: 'requirement_types', typeId: 'custom_req' }],
      });
      expect(result.canResume).toBe(false);
    });

    it('should allow resume when subflow is merged', () => {
      const fr = new FlowResumption();
      const result = fr.canResumeMainFlow({
        extensionSubflowState: 'merged',
        registry: makeRegistry(),
        previouslyUnknownTypes: [],
      });
      expect(result.canResume).toBe(true);
    });

    it('should create regeneration request', () => {
      const fr = new FlowResumption();
      const req = fr.createRegenerationRequest({
        workItemId: 'WI-0001',
        newTypes: ['custom_req'],
        artifactTypes: ['requirements'],
      });
      expect(req.work_item_id).toBe('WI-0001');
      expect(req.types_to_use).toContain('custom_req');
      expect(req.target_artifacts).toContain('requirements');
    });
  });

  describe('ExtensionAgent', () => {
    it('should generate candidate for valid context', () => {
      const agent = new ExtensionAgent();
      const registry = makeRegistry();
      const candidate = agent.generateCandidate({
        work_item_id: 'WI-0001',
        requested_types: [
          { type_id: 'custom_req', namespace: 'requirement_types', usage_context: 'test' },
        ],
        current_registry: registry,
        usage_context: 'requirement_types: custom_req',
      });

      expect(candidate.schema_version).toBe('1.0');
      expect(candidate.extension_delta_md).toContain('custom_req');
      expect(candidate.extension_registry_update.namespaces?.requirement_types).toContain('custom_req');
    });

    it('should not duplicate existing types', () => {
      const agent = new ExtensionAgent();
      const registry = makeRegistry();
      registry.namespaces.requirement_types = ['custom_req'];

      const candidate = agent.generateCandidate({
        work_item_id: 'WI-0001',
        requested_types: [
          { type_id: 'custom_req', namespace: 'requirement_types', usage_context: 'test' },
        ],
        current_registry: registry,
        usage_context: 'requirement_types: custom_req',
      });

      // Should still only have one entry (no duplicate)
      const reqTypes = candidate.extension_registry_update.namespaces?.requirement_types;
      expect(reqTypes?.filter(t => t === 'custom_req')).toHaveLength(1);
    });
  });
});

// ---- MergeRunner branch coverage (79.16% → target 85%+) ----

describe('MergeRunner branch coverage', () => {
  const runner = new MergeRunner();

  it('should reject invalid candidate format during merge', () => {
    const result = runner.executeMerge({
      manifest: {
        schema_version: '1.0',
        work_item_id: 'WI-0001',
        base_spec_version: 'PSV-0001',
        target_spec_version: 'PSV-0002',
        candidates: [{
          candidate_path: '.specforge/work-items/WI-0001/candidates/req.md',
          target_path: '.specforge/project/requirements.md',
          operation: 'create',
        }],
        generated_at: new Date().toISOString(),
      },
      readCandidate: () => '--- a/file.ts\n+++ b/file.ts\ncontext',
      writeTarget: () => true,
      calculateHash: (s) => s.length.toString(),
    });

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Invalid candidate format');
  });

  it('should generate merge report with failures', () => {
    const report = runner.generateMergeReport({
      workItemId: 'WI-0001',
      mergedFiles: [{
        candidatePath: 'c1',
        targetPath: 't1',
        operation: 'create',
        preHash: 'h0',
        postHash: 'h1',
        success: true,
      }, {
        candidatePath: 'c2',
        targetPath: 't2',
        operation: 'update',
        preHash: 'h0',
        postHash: '',
        success: false,
        error: 'Write failed',
      }],
      executedAt: new Date().toISOString(),
    });

    expect(report).toContain('t1');
    expect(report).toContain('t2');
    expect(report).toContain('Write failed');
    expect(report).toContain('Successful: 1');
    expect(report).toContain('Failed: 1');
  });

  it('should validate post-merge with all conditions met', () => {
    const result = runner.validatePostMerge({
      mergedFiles: [{
        candidatePath: 'c',
        targetPath: 't',
        operation: 'create',
        preHash: 'h0',
        postHash: 'h1',
        success: true,
      }],
      specVersionBefore: 'PSV-0001',
      specVersionAfter: 'PSV-0002',
      manifestExists: true,
    });

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate post-merge with version not incremented', () => {
    const result = runner.validatePostMerge({
      mergedFiles: [{
        candidatePath: 'c',
        targetPath: 't',
        operation: 'create',
        preHash: 'h0',
        postHash: 'h1',
        success: true,
      }],
      specVersionBefore: 'PSV-0001',
      specVersionAfter: 'PSV-0001',
      manifestExists: true,
    });

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Project spec version not incremented: still PSV-0001');
  });
});

// ---- JsonParser branch coverage (78.37% → target 85%+) ----

describe('JsonParser branch coverage', () => {
  it('should handle successful round-trip', () => {
    const data = { name: 'test', value: 42 };
    const result = JsonParser.roundTrip(data);
    expect(result.success).toBe(true);
    expect(result.original).toEqual(data);
    expect(result.recovered).toEqual(data);
  });

  it('should handle deepEqual with different key counts', () => {
    expect(JsonParser.deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('should handle deepEqual with same keys different values', () => {
    expect(JsonParser.deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
  });

  it('should handle deepEqual with nested objects', () => {
    expect(JsonParser.deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(JsonParser.deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });
});
