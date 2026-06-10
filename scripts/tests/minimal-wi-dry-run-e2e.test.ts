/**
 * minimal-wi-dry-run-e2e.test.ts
 *
 * End-to-end test that verifies the complete v1.1 Work Item creation
 * chain via the Daemon API:
 *
 * 1. Start full Daemon (with ProjectManager, StateManager, etc.)
 * 2. Call POST /api/v1/project/ensure to initialize project structure
 * 3. Call POST /api/v1/v11/work-item/create to create a minimal WI
 * 4. Verify all required files exist
 * 5. Verify no writes to HOME/.specforge
 * 6. Verify spec_manifest.json registers extension_registry
 *
 * This test uses REAL daemon startup (not mocks) and validates the
 * full path governance: handshake under OpenCode config root, WI under
 * project .specforge/work-items/, project init under .specforge/project/.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PersonalPathResolver } from '../../packages/daemon-core/src/daemon/path-resolver';

describe('Minimal WI Dry-Run E2E', () => {
  let tmpDir: string;
  let projectDir: string;
  let port: number;
  let token: string;
  let daemonProcess: any;
  let originalEnv: Record<string, string | undefined>;
  let originalCwd: string;

  beforeAll(async () => {
    // Save env and cwd
    originalEnv = {
      HOME: process.env.HOME,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      OPENCODE_CONFIG_DIR: process.env.OPENCODE_CONFIG_DIR,
    };
    originalCwd = process.cwd();

    // Create clean temp dirs
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-wi-dry-run-'));
    projectDir = path.join(tmpDir, 'project');
    const homeDir = path.join(tmpDir, 'home');
    const xdgDir = path.join(tmpDir, 'xdg');

    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(xdgDir, { recursive: true });

    // Set env to use clean dirs
    process.env.HOME = homeDir;
    process.env.XDG_CONFIG_HOME = xdgDir;
    delete process.env.OPENCODE_CONFIG_DIR;

    // Verify path resolver points to XDG
    const resolver = new PersonalPathResolver();
    const runtimeDir = resolver.resolveDaemonRuntimeDir();
    expect(runtimeDir).toContain('xdg');
    expect(runtimeDir).not.toContain('.specforge');

    // Ensure runtime dir exists for handshake
    fs.mkdirSync(runtimeDir, { recursive: true });

    // Set cwd to project dir so daemon uses correct project path
    process.chdir(projectDir);

    // Start full Daemon programmatically
    const { Daemon } = await import('../../packages/daemon-core/src/daemon/Daemon');
    const daemon = new Daemon();
    await daemon.start();

    // Read handshake
    const handshakePath = resolver.resolveHandshakePath();
    const hs = JSON.parse(fs.readFileSync(handshakePath, 'utf-8'));
    port = hs.port;
    token = hs.token;

    daemonProcess = daemon;
  }, 30000);

  afterAll(async () => {
    // Stop daemon
    if (daemonProcess && typeof daemonProcess.stop === 'function') {
      await daemonProcess.stop().catch(() => {});
    }

    // Restore env and cwd
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    process.chdir(originalCwd);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function daemonPost(endpoint: string, body: Record<string, unknown>): Promise<any> {
    const resp = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    return resp.json();
  }

  it('daemon health should pass', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/health`);
    const data = await resp.json() as any;
    expect(data.data.status).toBe('ok');
  });

  it('HOME/.specforge should NOT exist', () => {
    const homeDir = path.join(tmpDir, 'home');
    expect(fs.existsSync(path.join(homeDir, '.specforge'))).toBe(false);
  });

  it('handshake should be under XDG config root, not ~/.specforge', () => {
    const resolver = new PersonalPathResolver();
    const hp = resolver.resolveHandshakePath();
    expect(hp).not.toContain('.specforge');
    expect(hp).toContain('xdg');
    expect(fs.existsSync(hp)).toBe(true);
  });

  describe('POST /api/v1/project/ensure', () => {
    it('should initialize project structure', async () => {
      const result = await daemonPost('/api/v1/project/ensure', {
        projectPath: projectDir,
        projectName: 'wi-dry-run-test',
      });
      expect(result.success).toBe(true);
    });

    it('should create .specforge/project/ with required files', () => {
      const projectSpecDir = path.join(projectDir, '.specforge', 'project');
      expect(fs.existsSync(projectSpecDir)).toBe(true);
      expect(fs.existsSync(path.join(projectSpecDir, 'spec_manifest.json'))).toBe(true);
      expect(fs.existsSync(path.join(projectSpecDir, 'extension_registry.json'))).toBe(true);
      expect(fs.existsSync(path.join(projectSpecDir, 'requirements_index.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectSpecDir, 'design_index.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectSpecDir, 'architecture.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectSpecDir, 'glossary.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectSpecDir, 'decisions.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectSpecDir, 'trace_matrix.md'))).toBe(true);
    });

    it('spec_manifest.json should register extension_registry', () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(projectDir, '.specforge', 'project', 'spec_manifest.json'), 'utf-8')
      );
      expect(manifest.project.extension_registry).toBe('.specforge/project/extension_registry.json');
    });

    it('extension_registry.json should have correct minimal structure', () => {
      const reg = JSON.parse(
        fs.readFileSync(path.join(projectDir, '.specforge', 'project', 'extension_registry.json'), 'utf-8')
      );
      expect(reg.schema_version).toBe('1.0');
      expect(reg).toHaveProperty('namespaces');
    });

    it('should NOT create forbidden directories', () => {
      const specforgeRoot = path.join(projectDir, '.specforge');
      expect(fs.existsSync(path.join(specforgeRoot, 'standards'))).toBe(false);
      expect(fs.existsSync(path.join(specforgeRoot, 'archive'))).toBe(false);
      expect(fs.existsSync(path.join(specforgeRoot, 'state'))).toBe(false);
      expect(fs.existsSync(path.join(specforgeRoot, 'gates'))).toBe(false);
      expect(fs.existsSync(path.join(specforgeRoot, 'reports'))).toBe(false);
      expect(fs.existsSync(path.join(specforgeRoot, 'snapshots'))).toBe(false);
    });
  });

  describe('POST /api/v1/v11/work-item/create', () => {
    const WI_ID = 'WI-0001';

    it('should create minimal WI with code_only_fast_path', async () => {
      const result = await daemonPost('/api/v1/v11/work-item/create', {
        work_item_id: WI_ID,
        user_request: '给订单增加"已归档"状态（dry-run 测试，不修改正式规格）',
        classification: {
          requirement_changed: false,
          acceptance_criteria_changed: false,
          business_rule_changed: false,
          user_visible_behavior_changed: false,
          data_semantics_changed: false,
          design_changed: false,
          module_boundary_changed: false,
          api_contract_changed: false,
          unknowns: [],
        },
      });
      expect(result.success).toBe(true);
      expect(result.data?.work_item_id || result.work_item_id).toBe(WI_ID);
    });

    it('WI directory should exist under .specforge/work-items/', () => {
      const wiDir = path.join(projectDir, '.specforge', 'work-items', WI_ID);
      expect(fs.existsSync(wiDir)).toBe(true);
    });

    it('should NOT write to .specforge/specs/', () => {
      expect(fs.existsSync(path.join(projectDir, '.specforge', 'specs'))).toBe(false);
    });

    it('all required WI files should exist', () => {
      const wiDir = path.join(projectDir, '.specforge', 'work-items', WI_ID);
      expect(fs.existsSync(path.join(wiDir, 'work_item.json'))).toBe(true);
      expect(fs.existsSync(path.join(wiDir, 'intake.md'))).toBe(true);
      expect(fs.existsSync(path.join(wiDir, 'change_classification.md'))).toBe(true);
      expect(fs.existsSync(path.join(wiDir, 'impact_analysis.md'))).toBe(true);
      expect(fs.existsSync(path.join(wiDir, 'trigger_result.json'))).toBe(true);
      expect(fs.existsSync(path.join(wiDir, 'tasks.md'))).toBe(true);
      expect(fs.existsSync(path.join(wiDir, 'trace_delta.md'))).toBe(true);
      expect(fs.existsSync(path.join(wiDir, 'candidate_manifest.json'))).toBe(true);
      expect(fs.existsSync(path.join(wiDir, 'gate_summary.md'))).toBe(true);
      expect(fs.existsSync(path.join(wiDir, 'verification_report.md'))).toBe(true);
      expect(fs.existsSync(path.join(wiDir, 'merge_report.md'))).toBe(true);
      expect(fs.existsSync(path.join(wiDir, 'evidence', 'evidence_manifest.json'))).toBe(true);
    });

    it('candidate_manifest.json entries should be [] for code_only_fast_path', () => {
      const wiDir = path.join(projectDir, '.specforge', 'work-items', WI_ID);
      const cm = JSON.parse(fs.readFileSync(path.join(wiDir, 'candidate_manifest.json'), 'utf-8'));
      expect(cm.entries).toEqual([]);
      expect(cm.workflow_path).toBe('code_only_fast_path');
    });

    it('merge_report.md should indicate not_applicable', () => {
      const wiDir = path.join(projectDir, '.specforge', 'work-items', WI_ID);
      const content = fs.readFileSync(path.join(wiDir, 'merge_report.md'), 'utf-8');
      expect(content).toContain('not_applicable');
    });

    it('work_item.json should have valid structure', () => {
      const wiDir = path.join(projectDir, '.specforge', 'work-items', WI_ID);
      const wi = JSON.parse(fs.readFileSync(path.join(wiDir, 'work_item.json'), 'utf-8'));
      expect(wi.work_item_id).toBe(WI_ID);
      expect(wi.schema_version).toBe('1.0');
      expect(['created', 'intake_ready']).toContain(wi.status);
    });

    it('HOME/.specforge should still NOT exist after WI creation', () => {
      const homeDir = path.join(tmpDir, 'home');
      expect(fs.existsSync(path.join(homeDir, '.specforge'))).toBe(false);
    });
  });
});
