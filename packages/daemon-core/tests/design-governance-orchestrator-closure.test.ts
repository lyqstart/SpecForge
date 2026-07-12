import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/tools/handlers/sf-safe-bash.js';
import '../src/tools/handlers/sf-hard-stop-resolve.js';
import '../src/tools/handlers/sf-changed-files-audit.js';
import { getHandler, registerHandler, ToolDispatcher } from '../src/tools/ToolDispatcher.js';
import { setHardStop } from '../src/tools/lib/hard-stop-latch.js';
import { ensureProjectInit } from '../src/tools/lib/sf_project_init_core.js';

function repoRoot(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, 'setup', 'userlevel-opencode', 'agents'))) return cwd;
  return path.resolve(cwd, '..', '..');
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

function auditDeps(state = 'approval_required'): any {
  return {
    projectManager: {
      async getProjectStateManager() {
        return {
          async rebuildFromEventsFile() {},
          async getState() {
            return { current_state: state };
          },
        };
      },
    },
  };
}

describe('Orchestrator governance execution closure', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'sf-orchestrator-closure-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('keeps the Orchestrator contract compact, flow-oriented, and explicit about boundaries', () => {
    const contractPath = path.join(
      repoRoot(),
      'setup',
      'userlevel-opencode',
      'agents',
      'sf-orchestrator.md'
    );
    const contract = readFileSync(contractPath, 'utf8').replace(/\r\n/g, '\n');

    expect(contract.split('\n').length).toBeLessThan(380);
    expect(contract).toContain('# SpecForge 治理主链');
    expect(contract).toContain('# 产物与 Tool 边界');
    expect(contract).toContain('# HardStop 边界');
    expect(contract).toContain('# 注意事项');
    expect(contract).toContain('`.specforge/project/**` 对 Orchestrator 只读');
    expect(contract).toContain('已有项目 `modules=[]` 或无法唯一确定模块时，状态为 `blocked`');
    expect(contract).toContain('运行中出现新的治理证据时，Orchestrator 必须重新调度 `sf-design`');
  });

  it('declares core for a new project but never rewrites an existing empty module registry', async () => {
    const initialized = await ensureProjectInit(projectRoot, 'orchestrator-fixture');
    expect(initialized.success).toBe(true);

    const manifestPath = path.join(projectRoot, '.specforge', 'project', 'spec_manifest.json');
    const initialManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(initialManifest.default_module).toBe('core');
    expect(initialManifest.modules).toContainEqual(expect.objectContaining({ name: 'CORE' }));

    const legacyManifest = {
      ...initialManifest,
      default_module: undefined,
      modules: [],
      project_spec_version: 'PSV-0042',
    };
    delete legacyManifest.default_module;
    await writeJson(manifestPath, legacyManifest);

    const repaired = await ensureProjectInit(projectRoot, 'orchestrator-fixture');
    expect(repaired.success).toBe(true);
    const preserved = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(preserved.project_spec_version).toBe('PSV-0042');
    expect(preserved.modules).toEqual([]);
  });

  it('blocks every non-read tool at dispatcher level after a Work Item HardStop', async () => {
    const workItemId = 'WI-0001';
    const handler = vi.fn().mockResolvedValue({ success: true });
    registerHandler('sf_test_governance_write', handler);
    await writeJson(path.join(projectRoot, '.specforge', 'runtime', 'state.json'), {
      workItems: [{ work_item_id: workItemId, current_state: 'candidate_preparing' }],
    });
    setHardStop(projectRoot, workItemId, 'TEST_HARD_STOP', 'test');

    const dispatcher = new ToolDispatcher({} as any);
    const result = (await dispatcher.dispatch({
      tool: 'sf_test_governance_write',
      args: {},
      context: { directory: projectRoot },
    })) as any;

    expect(result.success).toBe(false);
    expect(result.hard_stop).toBe(true);
    expect(result.error).toContain('HARD_STOP_ACTIVE');
    expect(handler).not.toHaveBeenCalled();
  });

  it('persists shell governance HardStop, preserves blocked-write history, and audits it after resolution', async () => {
    const workItemId = 'WI-0001';
    const wiDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
    await writeJson(path.join(projectRoot, '.specforge', 'runtime', 'state.json'), {
      workItems: [{ work_item_id: workItemId, current_state: 'candidate_preparing' }],
    });
    await writeJson(path.join(wiDir, 'work_item.json'), {
      schema_version: '1.1',
      work_item_id: workItemId,
      workflow_type: 'feature_spec_design_first',
      workflow_path: 'design_change_path',
      code_change_allowed: false,
      allowed_write_files: [],
    });
    await writeJson(path.join(wiDir, 'trigger_result.json'), {
      work_item_id: workItemId,
      workflow_type: 'feature_spec_design_first',
      workflow_path: 'design_change_path',
    });
    await writeJson(path.join(wiDir, 'candidate_manifest.json'), {
      work_item_id: workItemId,
      workflow_type: 'feature_spec_design_first',
      workflow_path: 'design_change_path',
      candidate_phase: 'design',
      entries: [],
    });

    const blocked = (await getHandler('sf_safe_bash')!(
      {
        command: 'Set-Content .specforge/project/spec_manifest.json "{}"',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {} as any
    )) as any;

    expect(blocked.success).toBe(false);
    expect(blocked.hard_stop).toBe(true);
    expect(blocked.work_item_id).toBe(workItemId);
    expect(existsSync(path.join(wiDir, 'hard_stop.json'))).toBe(true);

    const logEntry = JSON.parse(
      (await readFile(path.join(wiDir, 'write_guard_log.jsonl'), 'utf8')).trim()
    );
    expect(logEntry.allowed).toBe(false);
    expect(logEntry.hard_stop_id).toBe(blocked.hard_stop_record.hard_stop_id);

    const activeAudit = (await getHandler('sf_changed_files_audit')!(
      { work_item_id: workItemId, mode: 'no_code_change' },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      auditDeps()
    )) as any;
    expect(activeAudit.success).toBe(false);
    expect(activeAudit.error).toContain('HARD_STOP_ACTIVE');

    const resolved = (await getHandler('sf_hard_stop_resolve')!(
      {
        work_item_id: workItemId,
        hard_stop_id: blocked.hard_stop_record.hard_stop_id,
        resolution_type: 'repaired',
        user_response_quote: '已确认修复治理链并保留历史阻断记录',
        reason: 'The protected-path bypass was blocked and the orchestration defect was repaired.',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {} as any
    )) as any;
    expect(resolved.success).toBe(true);

    const finalAudit = (await getHandler('sf_changed_files_audit')!(
      { work_item_id: workItemId, mode: 'no_code_change' },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      auditDeps()
    )) as any;

    expect(finalAudit.passed).toBe(true);
    expect(finalAudit.blocked_write_attempts).toBe(1);
    expect(finalAudit.unresolved_blocked_write_attempts).toBe(0);
    expect(await readFile(path.join(wiDir, 'changed_files_audit.md'), 'utf8')).toContain(
      'Blocked write attempts: 1'
    );
  });
});
