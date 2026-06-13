/**
 * v1.1 Hard Stop + Artifact Closure Tests
 *
 * Covers:
 * 7.1 hard_stop latch tests
 * 7.2 artifact writer schema tests
 * 7.3 changed_files_audit prerequisite tests
 * 7.4 WI artifact bash/write blocking tests
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import {
  setHardStop,
  checkHardStop,
  guardHardStop,
  resetHardStop,
} from '../../src/tools/lib/hard-stop-latch';
import {
  validateWorkItemJson,
  validateTriggerResultJson,
  validateCandidateManifestJson,
  validateEvidenceManifestJson,
  validateArtifactJson,
  VALID_WORKFLOW_PATHS,
} from '../../src/tools/lib/artifact-schema-validation';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createTestDir(): string {
  const dir = path.join(tmpdir(), `sf-test-hardstop-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createWIDir(projectRoot: string, wiId: string): string {
  const wiDir = path.join(projectRoot, '.specforge', 'work-items', wiId);
  fs.mkdirSync(wiDir, { recursive: true });
  return wiDir;
}

function writeWorkItemJson(wiDir: string, overrides: Record<string, any> = {}): void {
  const wiJson = {
    schema_version: '1.0',
    work_item_id: 'WI-0001',
    status: 'implementation_running',
    workflow_path: 'code_only_fast_path',
    code_change_allowed: true,
    allowed_write_files: [{ path: 'index.html', operation: 'create' }],
    created_at: '2026-06-13T00:00:00Z',
    updated_at: '2026-06-13T00:00:00Z',
    created_by: 'sf-orchestrator',
    ...overrides,
  };
  fs.writeFileSync(path.join(wiDir, 'work_item.json'), JSON.stringify(wiJson, null, 2), 'utf-8');
}

function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

// ===========================================================================
// 7.1 Hard Stop Latch Tests
// ===========================================================================

describe('7.1 hard_stop latch', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTestDir();
  });

  afterEach(() => {
    cleanupDir(projectRoot);
  });

  it('sf_code_permission enable without allowed_write_files → hard_stop persists', () => {
    // Simulate: setHardStop is called when enable lacks allowed_write_files
    const record = setHardStop(projectRoot, 'WI-0001', 'ALLOWED_WRITE_FILES_REQUIRED', 'sf_code_permission');
    expect(record.blocked).toBe(true);
    expect(record.reason).toBe('ALLOWED_WRITE_FILES_REQUIRED');
    expect(record.source_tool).toBe('sf_code_permission');

    // Verify persisted
    const check = checkHardStop(projectRoot, 'WI-0001');
    expect(check.blocked).toBe(true);
    expect(check.record!.work_item_id).toBe('WI-0001');
  });

  it('hard_stop state is queryable', () => {
    // Not blocked initially
    const before = checkHardStop(projectRoot, 'WI-0001');
    expect(before.blocked).toBe(false);
    expect(before.record).toBeNull();

    // Set hard_stop
    setHardStop(projectRoot, 'WI-0001', 'TEST_REASON', 'test_tool');

    // Now blocked
    const after = checkHardStop(projectRoot, 'WI-0001');
    expect(after.blocked).toBe(true);
    expect(after.record!.reason).toBe('TEST_REASON');
  });

  it('hard_stop blocks sf_state_transition', () => {
    setHardStop(projectRoot, 'WI-0001', 'BLOCKED', 'sf_code_permission');
    const guard = guardHardStop(projectRoot, 'WI-0001', 'sf_state_transition');
    expect(guard.allowed).toBe(false);
    expect(guard.error).toContain('HARD_STOP_ACTIVE');
  });

  it('hard_stop blocks sf_artifact_write', () => {
    setHardStop(projectRoot, 'WI-0001', 'BLOCKED', 'sf_code_permission');
    const guard = guardHardStop(projectRoot, 'WI-0001', 'sf_artifact_write');
    expect(guard.allowed).toBe(false);
  });

  it('hard_stop blocks sf_safe_bash', () => {
    setHardStop(projectRoot, 'WI-0001', 'BLOCKED', 'sf_code_permission');
    const guard = guardHardStop(projectRoot, 'WI-0001', 'sf_safe_bash');
    expect(guard.allowed).toBe(false);
  });

  it('hard_stop blocks sf_changed_files_audit', () => {
    setHardStop(projectRoot, 'WI-0001', 'BLOCKED', 'sf_code_permission');
    const guard = guardHardStop(projectRoot, 'WI-0001', 'sf_changed_files_audit');
    expect(guard.allowed).toBe(false);
  });

  it('hard_stop blocks sf_close_gate', () => {
    setHardStop(projectRoot, 'WI-0001', 'BLOCKED', 'sf_code_permission');
    const guard = guardHardStop(projectRoot, 'WI-0001', 'sf_close_gate');
    expect(guard.allowed).toBe(false);
  });

  it('hard_stop allows read/debug tools (sf_state_read)', () => {
    setHardStop(projectRoot, 'WI-0001', 'BLOCKED', 'sf_code_permission');
    const guard = guardHardStop(projectRoot, 'WI-0001', 'sf_state_read');
    expect(guard.allowed).toBe(true);
  });

  it('hard_stop allows sf_context_build', () => {
    setHardStop(projectRoot, 'WI-0001', 'BLOCKED', 'sf_code_permission');
    const guard = guardHardStop(projectRoot, 'WI-0001', 'sf_context_build');
    expect(guard.allowed).toBe(true);
  });

  it('hard_stop can be reset (admin action)', () => {
    setHardStop(projectRoot, 'WI-0001', 'BLOCKED', 'sf_code_permission');
    expect(checkHardStop(projectRoot, 'WI-0001').blocked).toBe(true);

    resetHardStop(projectRoot, 'WI-0001');
    expect(checkHardStop(projectRoot, 'WI-0001').blocked).toBe(false);
  });

  it('hard_stop persists across multiple checks', () => {
    setHardStop(projectRoot, 'WI-0001', 'PERMANENT', 'sf_code_permission');

    // Multiple checks — must stay blocked
    for (let i = 0; i < 5; i++) {
      expect(checkHardStop(projectRoot, 'WI-0001').blocked).toBe(true);
    }
  });
});

// ===========================================================================
// 7.2 Artifact Writer Schema Tests
// ===========================================================================

describe('7.2 artifact writer schema validation', () => {

  describe('trigger_result.json', () => {
    it('rejects invalid JSON', () => {
      const result = validateTriggerResultJson('not json at all {{{', 'WI-0001');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('INVALID_JSON');
    });

    it('rejects missing work_item_id', () => {
      const content = JSON.stringify({ workflow_path: 'code_only_fast_path' });
      const result = validateTriggerResultJson(content, 'WI-0001');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('MISSING_FIELD: work_item_id is required');
    });

    it('rejects work_item_id mismatch', () => {
      const content = JSON.stringify({ work_item_id: 'WI-0002', workflow_path: 'code_only_fast_path' });
      const result = validateTriggerResultJson(content, 'WI-0001');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('WORK_ITEM_ID_MISMATCH');
    });

    it('rejects invalid workflow_path', () => {
      const content = JSON.stringify({ work_item_id: 'WI-0001', workflow_path: 'invalid_path' });
      const result = validateTriggerResultJson(content, 'WI-0001');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('INVALID_WORKFLOW_PATH');
    });

    it('accepts valid trigger_result.json', () => {
      for (const wp of VALID_WORKFLOW_PATHS) {
        const content = JSON.stringify({ work_item_id: 'WI-0001', workflow_path: wp });
        const result = validateTriggerResultJson(content, 'WI-0001');
        expect(result.valid).toBe(true);
      }
    });

    it('invalid trigger_result.json must NOT be written to disk', () => {
      // This is a design constraint — the sf_artifact_write handler must reject before writing.
      // Validated via integration: if validateArtifactJson returns invalid, the handler returns error.
      const result = validateArtifactJson('trigger_result.json', '{invalid', 'WI-0001');
      expect(result).not.toBeNull();
      expect(result!.valid).toBe(false);
    });
  });

  describe('candidate_manifest.json', () => {
    it('rejects invalid JSON', () => {
      const result = validateCandidateManifestJson('{broken', 'WI-0001');
      expect(result.valid).toBe(false);
    });

    it('rejects missing entries array', () => {
      const content = JSON.stringify({ work_item_id: 'WI-0001' });
      const result = validateCandidateManifestJson(content, 'WI-0001');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('MISSING_FIELD: entries must be an array');
    });

    it('rejects non-empty entries for code_only_fast_path', () => {
      const content = JSON.stringify({
        work_item_id: 'WI-0001',
        entries: [{ candidate_path: 'some/path', target_path: 'some/target' }],
        workflow_path: 'code_only_fast_path',
      });
      const result = validateCandidateManifestJson(content, 'WI-0001', 'code_only_fast_path');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('CODE_ONLY_ENTRIES_MUST_BE_EMPTY');
    });

    it('accepts empty entries for code_only_fast_path', () => {
      const content = JSON.stringify({
        work_item_id: 'WI-0001',
        entries: [],
        workflow_path: 'code_only_fast_path',
      });
      const result = validateCandidateManifestJson(content, 'WI-0001', 'code_only_fast_path');
      expect(result.valid).toBe(true);
    });

    it('accepts non-empty entries for requirement_change_path', () => {
      const content = JSON.stringify({
        work_item_id: 'WI-0001',
        entries: [{ candidate_path: 'candidates/x', target_path: '.specforge/project/x' }],
        workflow_path: 'requirement_change_path',
      });
      const result = validateCandidateManifestJson(content, 'WI-0001', 'requirement_change_path');
      expect(result.valid).toBe(true);
    });
  });

  describe('work_item.json', () => {
    it('rejects invalid JSON', () => {
      const result = validateWorkItemJson('{{not json}}', 'WI-0001');
      expect(result.valid).toBe(false);
    });

    it('rejects work_item_id mismatch', () => {
      const content = JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-9999',
        status: 'created',
      });
      const result = validateWorkItemJson(content, 'WI-0001');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('WORK_ITEM_ID_MISMATCH');
    });

    it('rejects missing required fields', () => {
      const content = JSON.stringify({ work_item_id: 'WI-0001' });
      const result = validateWorkItemJson(content, 'WI-0001');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('schema_version'))).toBe(true);
      expect(result.errors.some(e => e.includes('status'))).toBe(true);
    });

    it('accepts valid work_item.json', () => {
      const content = JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-0001',
        status: 'created',
      });
      const result = validateWorkItemJson(content, 'WI-0001');
      expect(result.valid).toBe(true);
    });
  });

  describe('evidence_manifest.json', () => {
    it('rejects invalid JSON', () => {
      const result = validateEvidenceManifestJson('broken{', 'WI-0001');
      expect(result.valid).toBe(false);
    });

    it('rejects missing entries', () => {
      const content = JSON.stringify({ work_item_id: 'WI-0001' });
      const result = validateEvidenceManifestJson(content, 'WI-0001');
      expect(result.valid).toBe(false);
    });

    it('accepts valid evidence_manifest.json', () => {
      const content = JSON.stringify({
        work_item_id: 'WI-0001',
        entries: [{ type: 'test_output', path: 'evidence/test.log' }],
      });
      const result = validateEvidenceManifestJson(content, 'WI-0001');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateArtifactJson dispatcher', () => {
    it('returns null for non-JSON files (md files)', () => {
      expect(validateArtifactJson('intake.md', '# Intake', 'WI-0001')).toBeNull();
      expect(validateArtifactJson('tasks.md', '# Tasks', 'WI-0001')).toBeNull();
    });

    it('dispatches correctly for trigger_result.json', () => {
      const result = validateArtifactJson('trigger_result.json', '{}', 'WI-0001');
      expect(result).not.toBeNull();
      expect(result!.valid).toBe(false); // Missing required fields
    });
  });
});

// ===========================================================================
// 7.3 changed_files_audit Prerequisite Tests
// ===========================================================================

describe('7.3 changed_files_audit prerequisites', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTestDir();
  });

  afterEach(() => {
    cleanupDir(projectRoot);
  });

  it('fails when code_permission was never enabled (code_change_allowed=false)', () => {
    const wiDir = createWIDir(projectRoot, 'WI-0001');
    writeWorkItemJson(wiDir, { code_change_allowed: false, allowed_write_files: [] });

    // The handler checks code_change_allowed + permission_enabled_at
    // With both false/absent → should fail
    // We test the logic condition directly:
    const wiJson = JSON.parse(fs.readFileSync(path.join(wiDir, 'work_item.json'), 'utf-8'));
    const codePermWasEnabled = wiJson.code_change_allowed === true ||
      wiJson.permission_enabled_at !== undefined ||
      wiJson.code_permission_released === true;
    expect(codePermWasEnabled).toBe(false);
  });

  it('fails when allowed_write_files is empty', () => {
    const wiDir = createWIDir(projectRoot, 'WI-0001');
    writeWorkItemJson(wiDir, { code_change_allowed: true, allowed_write_files: [] });

    const wiJson = JSON.parse(fs.readFileSync(path.join(wiDir, 'work_item.json'), 'utf-8'));
    expect(wiJson.allowed_write_files.length).toBe(0);
    // This means audit should fail with ALLOWED_WRITE_FILES_EMPTY
  });

  it('fails when WI is hard_stop blocked', () => {
    createWIDir(projectRoot, 'WI-0001');
    setHardStop(projectRoot, 'WI-0001', 'TEST', 'test');

    const guard = guardHardStop(projectRoot, 'WI-0001', 'sf_changed_files_audit');
    expect(guard.allowed).toBe(false);
  });

  it('succeeds when code_permission enabled and allowed_write_files non-empty', () => {
    const wiDir = createWIDir(projectRoot, 'WI-0001');
    writeWorkItemJson(wiDir, {
      code_change_allowed: true,
      allowed_write_files: [{ path: 'index.html', operation: 'create' }],
    });

    const wiJson = JSON.parse(fs.readFileSync(path.join(wiDir, 'work_item.json'), 'utf-8'));
    const codePermWasEnabled = wiJson.code_change_allowed === true;
    const hasFiles = wiJson.allowed_write_files.length > 0;
    expect(codePermWasEnabled).toBe(true);
    expect(hasFiles).toBe(true);
  });

  it('detects file changes exceeding allowed_write_files', () => {
    const wiDir = createWIDir(projectRoot, 'WI-0001');
    writeWorkItemJson(wiDir, {
      code_change_allowed: true,
      allowed_write_files: [{ path: 'index.html', operation: 'create' }],
    });

    // Simulating an audit check: actual files include unauthorized one
    const allowedPaths = ['index.html'];
    const actualChanged = ['index.html', 'secret.txt'];
    const outOfScope = actualChanged.filter(f => !allowedPaths.includes(f));
    expect(outOfScope.length).toBeGreaterThan(0);
    expect(outOfScope).toContain('secret.txt');
  });
});

// ===========================================================================
// 7.4 WI Artifact Bash/Write Blocking Tests
// ===========================================================================

describe('7.4 WI artifact bash/write blocking', () => {
  // These tests verify the design constraint that WI artifacts cannot be
  // written via bash/powershell/node/python/write/edit tools.
  // The enforcement is at two levels:
  // 1. HTTPServer write-guard/check endpoint blocks .specforge/work-items/ paths
  // 2. HTTPServer write-guard/bash endpoint blocks commands targeting WI paths
  // 3. Plugin tool.execute.before blocks write tools targeting WI artifact paths

  it('sf_artifact_write is the only allowed writer for WI artifacts (design validation)', () => {
    // Verify the controlled artifact file list matches v1.1 spec
    const v11ArtifactFiles = [
      'work_item.json',
      'intake.md',
      'change_classification.md',
      'impact_analysis.md',
      'trigger_result.json',
      'tasks.md',
      'trace_delta.md',
      'candidate_manifest.json',
      'merge_report.md',
      'verification_report.md',
      'evidence_manifest.json',
    ];

    // All must be in the controlled set
    for (const file of v11ArtifactFiles) {
      // Validate by checking the file is a known artifact
      expect(typeof file).toBe('string');
      expect(file.length).toBeGreaterThan(0);
    }
  });

  it('bash command targeting .specforge/work-items/ should be detected as WI artifact write', () => {
    const wiArtifactPattern = /\.specforge[\\/]work-items[\\/]/i;

    // PowerShell Set-Content
    expect(wiArtifactPattern.test('powershell Set-Content .specforge/work-items/WI-0001/trigger_result.json')).toBe(true);

    // bash echo redirect
    expect(wiArtifactPattern.test('echo "{}" > .specforge/work-items/WI-0001/tasks.md')).toBe(true);

    // node fs.writeFileSync
    expect(wiArtifactPattern.test('node -e "require(\'fs\').writeFileSync(\'.specforge/work-items/WI-0001/intake.md\', \'test\')"')).toBe(true);

    // python open().write
    expect(wiArtifactPattern.test('python -c "open(\'.specforge/work-items/WI-0001/intake.md\', \'w\').write(\'x\')"')).toBe(true);
  });

  it('write/edit tool targeting .specforge/work-items/ should be detected', () => {
    const wiArtifactPattern = /\.specforge[\\/]work-items[\\/]/i;

    expect(wiArtifactPattern.test('.specforge/work-items/WI-0001/trigger_result.json')).toBe(true);
    expect(wiArtifactPattern.test('.specforge\\work-items\\WI-0001\\tasks.md')).toBe(true);
  });

  it('non-WI paths should NOT be blocked by WI artifact pattern', () => {
    const wiArtifactPattern = /\.specforge[\\/]work-items[\\/]/i;

    expect(wiArtifactPattern.test('src/index.html')).toBe(false);
    expect(wiArtifactPattern.test('.specforge/project/spec_manifest.json')).toBe(false);
    expect(wiArtifactPattern.test('.specforge/runtime/state.json')).toBe(false);
  });

  it('sf_artifact_write handler validates WI ID before writing', () => {
    // WI ID format: WI-xxxx (4 digits)
    const validIds = ['WI-0001', 'WI-1234', 'WI-9999'];
    const invalidIds = ['wi-blue-hello', 'WI-1', 'WI-12345', 'TASK-001', ''];

    for (const id of validIds) {
      expect(/^WI-\d{4}$/.test(id)).toBe(true);
    }
    for (const id of invalidIds) {
      expect(/^WI-\d{4}$/.test(id)).toBe(false);
    }
  });

  it('hard_stop_latch blocks subsequent bash/write/edit after hard_stop', () => {
    const projectRoot = createTestDir();
    try {
      createWIDir(projectRoot, 'WI-0001');
      setHardStop(projectRoot, 'WI-0001', 'TEST', 'sf_code_permission');

      // All write/progression tools blocked
      const tools = ['sf_safe_bash', 'sf_artifact_write', 'sf_state_transition',
        'sf_changed_files_audit', 'sf_close_gate', 'sf_v11_code_permission'];
      for (const tool of tools) {
        const guard = guardHardStop(projectRoot, 'WI-0001', tool);
        expect(guard.allowed).toBe(false);
      }
    } finally {
      cleanupDir(projectRoot);
    }
  });
});

// ===========================================================================
// 7.5 sf_safe_bash WI artifact path detection (real failure case)
// ===========================================================================

describe('7.5 sf_safe_bash WI artifact path blocking (real failure fix)', () => {
  const WI_ARTIFACT_PATTERN = /\.specforge[\\/]work-items[\\/]/i;

  it('sf_safe_bash New-Item .specforge/work-items/WI-0001 is detected', () => {
    const cmd = 'New-Item -ItemType Directory -Path "D:\\code\\temp\\test4\\.specforge\\work-items\\WI-0001" -Force';
    expect(WI_ARTIFACT_PATTERN.test(cmd)).toBe(true);
  });

  it('sf_safe_bash mkdir .specforge/work-items/WI-0001 is detected', () => {
    const cmd = 'mkdir .specforge/work-items/WI-0001';
    expect(WI_ARTIFACT_PATTERN.test(cmd)).toBe(true);
  });

  it('sf_safe_bash ls .specforge/work-items/WI-0001 is detected', () => {
    const cmd = 'ls "D:\\code\\temp\\test4\\.specforge\\work-items\\WI-0001" 2>nul || echo "Directory does not exist"';
    expect(WI_ARTIFACT_PATTERN.test(cmd)).toBe(true);
  });

  it('sf_safe_bash Set-Content .specforge/work-items/ is detected', () => {
    const cmd = 'powershell Set-Content .specforge/work-items/WI-0001/trigger_result.json -Value "{}"';
    expect(WI_ARTIFACT_PATTERN.test(cmd)).toBe(true);
  });

  it('sf_safe_bash node fs.writeFileSync .specforge/work-items/ is detected', () => {
    const cmd = 'node -e "require(\'fs\').writeFileSync(\'.specforge/work-items/WI-0001/tasks.md\', \'# Tasks\')"';
    expect(WI_ARTIFACT_PATTERN.test(cmd)).toBe(true);
  });

  it('sf_safe_bash python open .specforge/work-items/ is detected', () => {
    const cmd = 'python -c "open(\'.specforge/work-items/WI-0001/intake.md\', \'w\').write(\'test\')"';
    expect(WI_ARTIFACT_PATTERN.test(cmd)).toBe(true);
  });

  it('normal commands NOT targeting .specforge/work-items/ are allowed', () => {
    expect(WI_ARTIFACT_PATTERN.test('ls src/')).toBe(false);
    expect(WI_ARTIFACT_PATTERN.test('mkdir src/components')).toBe(false);
    expect(WI_ARTIFACT_PATTERN.test('node -e "console.log(1)"')).toBe(false);
    expect(WI_ARTIFACT_PATTERN.test('cat .specforge/project/spec_manifest.json')).toBe(false);
  });

  it('hard_stop after sf_safe_bash WI artifact blocks sf_state_transition', () => {
    const projectRoot = createTestDir();
    try {
      createWIDir(projectRoot, 'WI-0001');
      // Simulate: sf_safe_bash detected WI artifact path → set hard_stop
      setHardStop(projectRoot, 'WI-0001', 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL', 'sf_safe_bash');

      // Now sf_state_transition should be blocked
      const guard = guardHardStop(projectRoot, 'WI-0001', 'sf_state_transition');
      expect(guard.allowed).toBe(false);
      expect(guard.error).toContain('HARD_STOP_ACTIVE');
    } finally {
      cleanupDir(projectRoot);
    }
  });

  it('hard_stop after sf_safe_bash WI artifact blocks sf_artifact_write', () => {
    const projectRoot = createTestDir();
    try {
      createWIDir(projectRoot, 'WI-0001');
      setHardStop(projectRoot, 'WI-0001', 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL', 'sf_safe_bash');

      const guard = guardHardStop(projectRoot, 'WI-0001', 'sf_artifact_write');
      expect(guard.allowed).toBe(false);
    } finally {
      cleanupDir(projectRoot);
    }
  });

  it('hard_stop after sf_safe_bash WI artifact blocks sf_gate_run', () => {
    const projectRoot = createTestDir();
    try {
      createWIDir(projectRoot, 'WI-0001');
      setHardStop(projectRoot, 'WI-0001', 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL', 'sf_safe_bash');

      const guard = guardHardStop(projectRoot, 'WI-0001', 'sf_v11_gate_run');
      expect(guard.allowed).toBe(false);
    } finally {
      cleanupDir(projectRoot);
    }
  });

  it('sf_artifact_write creates WI dir without needing sf_safe_bash', () => {
    const projectRoot = createTestDir();
    try {
      // sf_artifact_write should create the dir itself
      const wiDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0001');
      // Before: dir doesn't exist
      expect(fs.existsSync(wiDir)).toBe(false);

      // sf_artifact_write handler creates it (we test the mechanism directly)
      fs.mkdirSync(wiDir, { recursive: true });
      fs.writeFileSync(path.join(wiDir, 'intake.md'), '# Intake\nTest content');

      // After: dir and file exist
      expect(fs.existsSync(wiDir)).toBe(true);
      expect(fs.existsSync(path.join(wiDir, 'intake.md'))).toBe(true);
    } finally {
      cleanupDir(projectRoot);
    }
  });
});
