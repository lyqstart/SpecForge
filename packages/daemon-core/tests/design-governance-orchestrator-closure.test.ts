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

  it('uses one Chinese governance chain to cover all five Orchestrator responsibilities', () => {
    const contractPath = path.join(
      repoRoot(),
      'setup',
      'userlevel-opencode',
      'agents',
      'sf-orchestrator.md'
    );
    const contract = readFileSync(contractPath, 'utf8').replace(/\r\n/g, '\n');

    expect(contract.split('\n').length).toBeLessThan(320);
    expect(contract).toContain('## SpecForge v1.1 最终治理契约');
    expect(contract).not.toContain('## SpecForge v1.1 Final Governance Contract');
    expect(contract).toContain('# 角色使命');
    expect(contract).toContain('# 从用户请求到工作项关闭的治理主链');
    expect(contract).toContain('## 一、建立并维护可信的治理上下文');
    expect(contract).toContain('## 二、理解真实问题并形成可执行路由');
    expect(contract).toContain('## 三、组织专业代理并维护产物生命周期');
    expect(contract).toContain('## 四、使用权威工具守住每个继续条件');
    expect(contract).toContain('## 五、保持流程连续并对用户负责');
    expect(contract).toContain('# 职责边界');
    expect(contract).toContain('# 注意事项');

    expect(contract).toContain('`.specforge/manifest.json` 是当前运行时要求的项目初始化标记');
    expect(contract).toContain(
      '`.specforge/project/spec_manifest.json` 是正式项目规格和模块归属清单'
    );
    expect(contract).toContain('已有活动工作项时优先恢复');
    expect(contract).toContain('纯咨询、状态查询和 SpecForge 使用说明不创建业务工作项');
    expect(contract).toContain('分类对象描述的是**用户目标实现后的预期最终语义影响**');
    expect(contract).toContain('运行证据推翻原判断时，必须重新调度 `sf-design`');
    expect(contract).toContain('专业代理不得彼此直接启动下一代理');
    expect(contract).toContain('运行时权威产物，只能由各自工具生成');
    expect(contract).toContain('门禁失败后必须先判定根因');
    expect(contract).toContain('执行失败先基于同一证据进行一次有边界的修复');
    expect(contract).toContain('硬停止是绝对停止点');
    expect(contract).toContain(
      '工作项未由关闭门禁进入 `closed` 时，不得向用户宣称整个工作项已完成'
    );
  });

  it('aligns the Orchestrator route table with current Runtime pairs and registered Workflow Skills', () => {
    const root = repoRoot();
    const contract = readFileSync(
      path.join(root, 'setup', 'userlevel-opencode', 'agents', 'sf-orchestrator.md'),
      'utf8'
    ).replace(/\r\n/g, '\n');
    const stateMachine = readFileSync(
      path.join(root, 'packages', 'daemon-core', 'src', 'tools', 'lib', 'state_machine.ts'),
      'utf8'
    );

    const currentPairs = [
      ['feature_spec', 'requirement_change_path', 'sf-workflow-feature-spec'],
      ['bugfix_spec', 'requirement_change_path', 'sf-workflow-bugfix-spec'],
      ['change_request', 'requirement_change_path', 'sf-workflow-change-request'],
      ['investigation', 'requirement_change_path', 'sf-workflow-investigation'],
      ['feature_spec_design_first', 'design_change_path', 'sf-workflow-design-first'],
      ['refactor', 'task_change_path', 'sf-workflow-refactor'],
      ['ops_task', 'task_change_path', 'sf-workflow-ops-task'],
      ['quick_change', 'code_only_fast_path', 'sf-workflow-quick-change'],
    ] as const;

    for (const [workflowType, workflowPath, skillName] of currentPairs) {
      expect(stateMachine).toContain(`${workflowType}: "${workflowPath}"`);
      const routeRow = contract
        .split('\n')
        .find(
          line =>
            line.trimStart().startsWith('|') &&
            line.includes(`\`${workflowType}\``) &&
            line.includes(`\`${skillName}\``)
        );
      expect(routeRow).toBeDefined();
      expect(routeRow).toContain(`\`${workflowPath}\``);
      expect(
        existsSync(path.join(root, 'setup', 'userlevel-opencode', 'skills', skillName, 'SKILL.md')),
        `missing registered Workflow Skill ${skillName}`
      ).toBe(true);
    }

    expect(contract).not.toContain('| `bugfix_spec` | `task_change_path` |');
    expect(contract).not.toContain('| `refactor` | `design_change_path` |');
    for (const reservedPath of [
      'architecture_change_path',
      'spec_migration_path',
      'rollback_path',
    ]) {
      expect(stateMachine).toContain(`"${reservedPath}"`);
      expect(contract).toContain(reservedPath);
    }
    expect(contract).toContain('当前没有完整的用户级工作流身份和技能映射');
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
