import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/tools/handlers/sf-safe-bash.js';
import '../src/tools/handlers/sf-hard-stop-resolve.js';
import '../src/tools/handlers/sf-changed-files-audit.js';
import '../src/tools/handlers/sf-state-transition.js';
import '../src/tools/handlers/sf-artifact-write.js';
import { getHandler, registerHandler, ToolDispatcher } from '../src/tools/ToolDispatcher.js';
import { setHardStop } from '../src/tools/lib/hard-stop-latch.js';
import { ensureProjectInit } from '../src/tools/lib/sf_project_init_core.js';
import { computeGateSummaryStatus } from '../src/tools/lib/gate-chain.js';
import { generateGateSummaryMd, runGate } from '../src/tools/lib/gate-runner-v11.js';
import { validateCandidateManifestJson } from '../src/tools/lib/artifact-schema-validation.js';
import { executeMerge } from '../src/tools/lib/merge-runner-v11.js';

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

function transitionDeps(): any {
  const states = new Map<string, string>();
  return {
    projectManager: {
      async getProjectStateManager() {
        return {
          async transition(workItemId: string, fromState: string, toState: string): Promise<void> {
            const current = states.get(workItemId) ?? '';
            expect(current).toBe(fromState);
            states.set(workItemId, toState);
          },
          async rebuildFromEventsFile() {},
          async getState(workItemId: string) {
            const currentState = states.get(workItemId);
            return currentState ? { current_state: currentState } : null;
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

    expect(contract).toContain('纯咨询、只读状态查询或 SpecForge 使用说明');
    expect(contract).toContain('不调用 `sf_project_init`、不创建业务工作项');
    expect(contract).toContain('`.specforge/manifest.json` 是当前运行时要求的项目初始化标记');
    expect(contract).toContain(
      '`.specforge/project/spec_manifest.json` 是正式项目规格和模块归属清单'
    );
    expect(contract).toContain('已有活动工作项时优先恢复');
    expect(contract).toContain('存在多个活动工作项时，必须先明确当前目标对应的 `work_item_id`');
    expect(contract).toContain('`sf_state_read` 只提供状态权威');
    expect(contract).toContain('`resume_check` 和 `resume_plan` 是快照中的检查与恢复计划内容');

    expect(contract).toContain('分类对象描述的是**用户目标实现后的预期最终语义影响**');
    expect(contract).toContain('运行证据推翻原判断时，必须重新调度 `sf-design`');
    expect(contract).toContain('专业代理不得彼此直接启动下一代理');
    expect(contract).toContain('专业候选产物具有固定所有权');
    expect(contract).toContain('主编排代理不得通过 `sf_artifact_write` 代写、补写或覆盖');
    expect(contract).toContain('按产物所有权重新调度责任代理');
    expect(contract).toContain('不得先推进状态再补产物');
    expect(contract).toContain('需要跨来源、可复核、可持久化证据时');
    expect(contract).toContain('运行时权威产物，只能由各自工具生成');
    expect(contract).toContain('门禁失败后必须先判定根因');
    expect(contract).toContain('执行失败先基于同一证据进行一次有边界的修复');
    expect(contract).toContain('HardStop 是可恢复安全锁存');
    expect(contract).toContain('只有 `sf-orchestrator` 可以调用 `sf_hard_stop_resolve`');
    expect(contract).toContain(
      '只有 `scope_expanded`、`user_authorized_retry`、`risk_accepted` 或安装新授权时才必须引用当前真实 `user_response_quote`'
    );
    expect(contract).toContain('改用合法受控工具不等于原阻断是 `false_positive`');

    expect(contract).toContain('`user_approved` 必须来自用户对当前候选的明确决定');
    expect(contract).toContain('`auto_approved` 只允许在当前有效策略明确授权时使用');
    expect(contract).toContain('原子失效旧决定并进入 `blocked`');
    expect(contract).not.toContain('只有用户在当前对话中的明确决定才能通过');
    expect(contract).toContain('直接修改 `.specforge/project/**`');
    expect(contract).toContain(
      '工作项未由关闭门禁进入 `closed` 时，不得向用户宣称整个工作项已完成'
    );
  });

  it('aligns the governing standard with the current state, consultation, and continuity contract', () => {
    const standard = readFileSync(
      path.join(repoRoot(), 'docs', 'standards', 'fused_standard.md'),
      'utf8'
    ).replace(/\r\n/g, '\n');

    expect(standard).toContain(
      '纯知识咨询、SpecForge 使用说明和不触发项目写入的只读状态查询不创建业务 WI'
    );
    expect(standard).toContain('所有需要读取项目真实状态并形成受治理分析产物');
    expect(standard).toContain('`StateManager/events.jsonl` 是工作流状态的唯一权威来源');
    expect(standard).toContain('其中 `StateManager/events.jsonl` 为状态权威');
    expect(standard).toContain('### 14.6 HardStop 角色所有权与恢复闭包');
    expect(standard).toContain('#### 8.2.1 专业候选产物所有权');
    expect(standard).toContain('`ARTIFACT_OWNER_MISMATCH`');
    expect(standard).toContain('`created → intake_ready` 必须校验 `intake.md` 非空');
    expect(standard).toContain('只有 `sf-orchestrator` 可以调用 `sf_hard_stop_resolve`');
    expect(standard).toContain('若两处存在同一 `hard_stop_id`，必须去重后计数');
    expect(standard).toContain('`.specforge/runtime/state.json` 只是可重建投影缓存');
    expect(standard).toContain('`work_item.json` 只保存工作项身份、分类、范围和权限等元数据');
    expect(standard).not.toContain('"status": "created"');
    expect(standard).toContain('中断恢复必须通过 `sf_continuity`');
    expect(standard).toContain('`resume_check` 与 `resume_plan` 是快照中的恢复检查和恢复计划内容');
    expect(standard).toContain('当前 Runtime 为兼容初始化和可观测性');
  });

  it('requires professional agents to hand HardStop evidence back to the Orchestrator', () => {
    const agentNames = ['sf-design', 'sf-requirements', 'sf-task-planner', 'sf-executor'];

    for (const agentName of agentNames) {
      const contract = readFileSync(
        path.join(repoRoot(), 'setup', 'userlevel-opencode', 'agents', `${agentName}.md`),
        'utf8'
      ).replace(/\r\n/g, '\n');

      expect(contract).toContain('## HardStop 交接边界');
      expect(contract).toContain('不得调用 `sf_hard_stop_resolve`');
      expect(contract).toContain('"action_type": "resolve_hard_stop"');
      expect(contract).toContain('只有 `sf-orchestrator` 可以');
    }
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
      ['spec_migration', 'spec_migration_path', 'sf-workflow-spec-migration'],
      ['architecture_change', 'architecture_change_path', 'sf-workflow-architecture-change'],
      ['contract_change', 'contract_change_path', 'sf-workflow-contract-change'],
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
      'rollback_path',
    ]) {
      expect(stateMachine).toContain(`"${reservedPath}"`);
      expect(contract).toContain(reservedPath);
    }
    expect(contract).toContain('当前没有完整的用户级工作流身份和技能映射');
    // Explicit governance-only workflows are registered identities.
    expect(stateMachine).toContain('spec_migration: "spec_migration_path"');
    expect(stateMachine).toContain('architecture_change: "architecture_change_path"');
    expect(stateMachine).toContain('contract_change: "contract_change_path"');
  });

  it('declares core for a new project and idempotently normalizes an empty CORE registry without bumping the version', async () => {
    const initialized = await ensureProjectInit(projectRoot, 'orchestrator-fixture');
    expect(initialized.success).toBe(true);
    // Fresh project is already canonical-healthy; normalization is a no-op.
    expect(initialized.moduleRegistry.status).toBe('unchanged');

    const manifestPath = path.join(projectRoot, '.specforge', 'project', 'spec_manifest.json');
    const initialManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(initialManifest.default_module).toBe('CORE');
    expect(initialManifest.modules).toContainEqual(
      expect.objectContaining({ module_code: 'CORE' })
    );

    // Simulate a legacy / upgraded / damaged project: empty module registry,
    // missing default_module, but the authoritative CORE definition still on
    // disk (init lays modules/CORE/module.json down). This is exactly the
    // MODULE_OWNERSHIP_UNRESOLVED deadlock precondition.
    const legacyManifest = {
      ...initialManifest,
      modules: [],
      project_spec_version: 'PSV-0042',
    };
    delete legacyManifest.default_module;
    await writeJson(manifestPath, legacyManifest);

    const repaired = await ensureProjectInit(projectRoot, 'orchestrator-fixture');
    expect(repaired.success).toBe(true);
    expect(repaired.moduleRegistry.status).toBe('normalized');
    expect(repaired.moduleRegistry.moduleCodes).toEqual(['CORE']);

    const preserved = JSON.parse(await readFile(manifestPath, 'utf8'));
    // Structural repair only: version and other user fields are untouched.
    expect(preserved.project_spec_version).toBe('PSV-0042');
    expect(preserved.default_module).toBe('CORE');
    expect(preserved.modules).toContainEqual(expect.objectContaining({ module_code: 'CORE' }));
    expect(preserved.modules).toHaveLength(1);

    // Idempotent: running init again leaves the now-canonical registry alone.
    const again = await ensureProjectInit(projectRoot, 'orchestrator-fixture');
    expect(again.moduleRegistry.status).toBe('unchanged');
    const stable = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(stable.modules).toEqual(preserved.modules);
    expect(stable.project_spec_version).toBe('PSV-0042');
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

  it('fails closed when multiple active Work Items make a scoped HardStop ambiguous', async () => {
    const handler = vi.fn().mockResolvedValue({ success: true });
    registerHandler('sf_test_multi_wi_write', handler);

    await writeJson(path.join(projectRoot, '.specforge', 'runtime', 'state.json'), {
      workItems: [
        { work_item_id: 'WI-0001', current_state: 'candidate_preparing' },
        { work_item_id: 'WI-0002', current_state: 'implementation_ready' },
      ],
    });
    setHardStop(projectRoot, 'WI-0001', 'TEST_MULTI_WI_HARD_STOP', 'test');

    const dispatcher = new ToolDispatcher({} as any);
    const ambiguous = (await dispatcher.dispatch({
      tool: 'sf_test_multi_wi_write',
      args: {},
      context: { directory: projectRoot },
    })) as any;

    expect(ambiguous.success).toBe(false);
    expect(ambiguous.hard_stop).toBe(true);
    expect(ambiguous.error).toContain('HARD_STOP_CONTEXT_AMBIGUOUS');
    expect(ambiguous.blocked_work_item_ids).toEqual(['WI-0001']);
    expect(handler).not.toHaveBeenCalled();

    const explicitUnblocked = (await dispatcher.dispatch({
      tool: 'sf_test_multi_wi_write',
      args: { work_item_id: 'WI-0002' },
      context: { directory: projectRoot },
    })) as any;

    expect(explicitUnblocked.success).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('enforces a project-scoped HardStop even when no Work Item can be inferred', async () => {
    const handler = vi.fn().mockResolvedValue({ success: true });
    registerHandler('sf_test_project_write', handler);
    setHardStop(projectRoot, 'PROJECT', 'TEST_PROJECT_HARD_STOP', 'test', 'project');

    const dispatcher = new ToolDispatcher({} as any);
    const result = (await dispatcher.dispatch({
      tool: 'sf_test_project_write',
      args: {},
      context: { directory: projectRoot },
    })) as any;

    expect(result.success).toBe(false);
    expect(result.hard_stop).toBe(true);
    expect(result.error).toContain('HARD_STOP_ACTIVE');
    expect(result.hard_stop_record.scope).toBe('project');
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps work_item.json metadata-only from creation through controlled rewrites', async () => {
    const initialized = await ensureProjectInit(projectRoot, 'orchestrator-fixture');
    expect(initialized.success).toBe(true);

    const created = (await getHandler('sf_state_transition')!(
      {
        from_state: '',
        to_state: 'created',
        workflow_type: 'feature_spec_design_first',
        workflow_path: 'design_change_path',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      transitionDeps()
    )) as any;

    expect(created.success).toBe(true);
    expect(created.work_item_id).toBe('WI-0001');

    const workItemPath = path.join(
      projectRoot,
      '.specforge',
      'work-items',
      created.work_item_id,
      'work_item.json'
    );
    const createdWorkItem = JSON.parse(await readFile(workItemPath, 'utf8'));
    expect(createdWorkItem.status).toBeUndefined();
    expect(createdWorkItem.workflow_type).toBe('feature_spec_design_first');
    expect(createdWorkItem.workflow_path).toBe('design_change_path');

    const rejected = (await getHandler('sf_artifact_write')!(
      {
        work_item_id: created.work_item_id,
        file_type: 'work_item',
        content: JSON.stringify({
          schema_version: '1.1',
          work_item_id: created.work_item_id,
          status: 'intake_ready',
          title: 'Forbidden status update',
        }),
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      auditDeps('candidate_preparing')
    )) as any;

    expect(rejected.success).toBe(false);
    expect(rejected.error).toBe('INVALID_ARTIFACT_JSON');
    expect(rejected.validation_errors).toContainEqual(
      expect.stringContaining('WORK_ITEM_STATUS_FORBIDDEN')
    );
    expect(JSON.parse(await readFile(workItemPath, 'utf8')).status).toBeUndefined();

    await writeJson(workItemPath, {
      ...createdWorkItem,
      status: 'created',
    });
    const cleaned = (await getHandler('sf_artifact_write')!(
      {
        work_item_id: created.work_item_id,
        file_type: 'work_item',
        content: JSON.stringify({
          schema_version: '1.1',
          work_item_id: created.work_item_id,
          title: 'Metadata rewrite',
          description: 'Remove legacy status while preserving metadata authority.',
        }),
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      auditDeps('candidate_preparing')
    )) as any;

    expect(cleaned.success).toBe(true);
    const cleanedWorkItem = JSON.parse(await readFile(workItemPath, 'utf8'));
    expect(cleanedWorkItem.status).toBeUndefined();
    expect(cleanedWorkItem.title).toBe('Metadata rewrite');
  });

  it('stores trigger_result unknowns only at classification.unknowns and rejects conflicts', async () => {
    const workItemId = 'WI-0001';
    const wiDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
    await writeJson(path.join(wiDir, 'work_item.json'), {
      schema_version: '1.1',
      work_item_id: workItemId,
      workflow_type: 'feature_spec_design_first',
      workflow_path: 'design_change_path',
    });

    const classification = {
      requirement_changed: true,
      acceptance_criteria_changed: true,
      business_rule_changed: true,
      user_visible_behavior_changed: true,
      data_semantics_changed: true,
      design_changed: true,
      module_boundary_changed: false,
      api_contract_changed: true,
      architecture_changed: true,
      unknowns: ['Runtime choice is not confirmed', 'Compatibility policy is not confirmed'],
    };

    const written = (await getHandler('sf_artifact_write')!(
      {
        work_item_id: workItemId,
        file_type: 'trigger_result',
        content: JSON.stringify({
          schema_version: '1.1',
          work_item_id: workItemId,
          workflow_type: 'feature_spec_design_first',
          workflow_path: 'design_change_path',
          classification,
        }),
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {} as any
    )) as any;

    expect(written.success).toBe(true);
    const triggerPath = path.join(wiDir, 'trigger_result.json');
    const trigger = JSON.parse(await readFile(triggerPath, 'utf8'));
    expect(Object.prototype.hasOwnProperty.call(trigger, 'unknowns')).toBe(false);
    expect(trigger.classification.unknowns).toEqual(classification.unknowns);

    const legacyClassification = { ...classification };
    delete (legacyClassification as Partial<typeof classification>).unknowns;
    const migrated = (await getHandler('sf_artifact_write')!(
      {
        work_item_id: workItemId,
        file_type: 'trigger_result',
        content: JSON.stringify({
          schema_version: '1.1',
          work_item_id: workItemId,
          workflow_type: 'feature_spec_design_first',
          workflow_path: 'design_change_path',
          unknowns: ['Legacy top-level unknown'],
          classification: legacyClassification,
        }),
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {} as any
    )) as any;

    expect(migrated.success).toBe(true);
    const migratedTrigger = JSON.parse(await readFile(triggerPath, 'utf8'));
    expect(Object.prototype.hasOwnProperty.call(migratedTrigger, 'unknowns')).toBe(false);
    expect(migratedTrigger.classification.unknowns).toEqual(['Legacy top-level unknown']);

    const conflict = (await getHandler('sf_artifact_write')!(
      {
        work_item_id: workItemId,
        file_type: 'trigger_result',
        content: JSON.stringify({
          schema_version: '1.1',
          work_item_id: workItemId,
          workflow_type: 'feature_spec_design_first',
          workflow_path: 'design_change_path',
          unknowns: ['Top-level value'],
          classification: {
            ...classification,
            unknowns: ['Classification value'],
          },
        }),
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {} as any
    )) as any;

    expect(conflict.success).toBe(false);
    expect(conflict.error).toContain('ARTIFACT_NORMALIZATION_FAILED');
    expect(conflict.error).toContain('TRIGGER_RESULT_UNKNOWNS_CONFLICT');
    expect(JSON.parse(await readFile(triggerPath, 'utf8')).classification.unknowns).toEqual([
      'Legacy top-level unknown',
    ]);
  });

  it('does not convert non-blocking warnings into a waiver requirement', () => {
    const warningOnlyReport = {
      gate_id: 'workflow_specific_gate',
      gate_type: 'hard_gate',
      required: true,
      status: 'passed',
      blocking_issues: [],
      warnings: ['Formatting suggestion only'],
      waiver_required: false,
    } as any;

    expect(computeGateSummaryStatus([warningOnlyReport])).toBe('passed');
    expect(generateGateSummaryMd('WI-0001', [warningOnlyReport], 'passed')).toContain(
      'Non-blocking warnings do not require a waiver'
    );

    const explicitWaiverReport = {
      ...warningOnlyReport,
      gate_type: 'soft_gate',
      required: false,
      waiver_required: true,
    } as any;
    expect(computeGateSummaryStatus([explicitWaiverReport])).toBe('passed_with_waiver_required');
  });

  it('keeps evidence-only artifacts out of Project Spec merge and rejects undeclared targets', async () => {
    const initialized = await ensureProjectInit(projectRoot, 'orchestrator-fixture');
    expect(initialized.success).toBe(true);

    const workItemId = 'WI-0001';
    const wiDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
    await writeJson(path.join(wiDir, 'work_item.json'), {
      schema_version: '1.1',
      work_item_id: workItemId,
      workflow_type: 'bugfix_spec',
      workflow_path: 'requirement_change_path',
    });
    await mkdir(path.join(wiDir, 'candidates', 'project', 'modules', 'core'), {
      recursive: true,
    });
    await writeFile(
      path.join(wiDir, 'candidates', 'project', 'modules', 'core', 'requirements.candidate.md'),
      '# Requirements evidence'
    );
    await writeFile(path.join(wiDir, 'candidates', 'tasks.md'), '# Task evidence');

    const normalizedWrite = (await getHandler('sf_artifact_write')!(
      {
        work_item_id: workItemId,
        file_type: 'candidate_manifest',
        content: JSON.stringify({
          schema_version: '1.1',
          work_item_id: workItemId,
          workflow_type: 'bugfix_spec',
          workflow_path: 'requirement_change_path',
          no_project_spec_change: true,
          project_integration_effect: 'evidence_only',
          merge_required: true,
          merge_applicable: true,
          candidate_artifacts: [
            'candidates/project/modules/core/requirements.candidate.md',
            'candidates/project/modules/core/tasks.candidate.md',
          ],
          entries: [
            {
              type: 'requirements',
              module_id: 'core',
              candidate_path: 'candidates/project/modules/core/requirements.candidate.md',
              target_path: 'project/modules/core/requirements.md',
              operation: 'replace',
            },
            {
              type: 'tasks',
              candidate_path: 'candidates/tasks.md',
              target_path: 'project/modules/core/tasks.md',
              operation: 'replace',
            },
          ],
        }),
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      auditDeps('candidate_preparing')
    )) as any;

    expect(normalizedWrite.success).toBe(true);
    const manifestPath = path.join(wiDir, 'candidate_manifest.json');
    const normalizedManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(normalizedManifest.no_project_spec_change).toBe(true);
    expect(normalizedManifest.project_integration_effect).toBe('evidence_only');
    expect(normalizedManifest.merge_required).toBe(false);
    expect(normalizedManifest.merge_applicable).toBe(false);
    expect(normalizedManifest.entries).toEqual([]);
    expect(normalizedManifest.candidates).toBeUndefined();
    expect(normalizedManifest.candidate_artifacts).toBeUndefined();
    expect(
      validateCandidateManifestJson(JSON.stringify(normalizedManifest), workItemId).valid
    ).toBe(true);

    const inconsistentValidation = validateCandidateManifestJson(
      JSON.stringify({
        ...normalizedManifest,
        merge_required: true,
        entries: [
          {
            candidate_path: 'candidates/tasks.md',
            target_path: 'project/modules/core/tasks.md',
          },
        ],
      }),
      workItemId
    );
    expect(inconsistentValidation.valid).toBe(false);
    expect(inconsistentValidation.errors).toContainEqual(
      expect.stringContaining('EVIDENCE_ONLY_ENTRIES_MUST_BE_EMPTY')
    );

    const duplicateEvidenceAuthorityValidation = validateCandidateManifestJson(
      JSON.stringify({
        ...normalizedManifest,
        candidate_artifacts: ['candidates/project/modules/core/tasks.candidate.md'],
      }),
      workItemId
    );
    expect(duplicateEvidenceAuthorityValidation.valid).toBe(false);
    expect(duplicateEvidenceAuthorityValidation.errors).toContainEqual(
      expect.stringContaining('EVIDENCE_ONLY_CANDIDATE_ARTIFACTS_FORBIDDEN')
    );

    const mergeResult = await executeMerge({
      projectRoot,
      workItemId,
      workItemDir: wiDir,
      candidateManifestPath: manifestPath,
      userDecisionPath: path.join(wiDir, 'user_decision.json'),
    });
    expect(mergeResult.success).toBe(true);
    expect(mergeResult.status).toBe('not_applicable');
    expect(mergeResult.merged_files).toEqual([]);

    await writeJson(manifestPath, {
      schema_version: '1.1',
      work_item_id: workItemId,
      workflow_type: 'bugfix_spec',
      workflow_path: 'requirement_change_path',
      merge_required: true,
      entries: [
        {
          type: 'tasks',
          candidate_path: 'candidates/tasks.md',
          target_path: 'project/modules/core/tasks.md',
          operation: 'replace',
        },
      ],
    });

    const gateReport = await runGate('candidate_manifest_gate', {
      projectRoot,
      workItemId,
      workItemDir: wiDir,
      workflowPath: 'requirement_change_path',
      workflowType: 'bugfix_spec',
    } as any);
    expect(gateReport.status).toBe('failed');
    expect(gateReport.checks).toContainEqual(
      expect.objectContaining({
        check_id: 'entry_0_target_declared',
        passed: false,
      })
    );
  });

  it('enforces professional ownership for candidate requirements, design, tasks, and trace artifacts', async () => {
    const initialized = await ensureProjectInit(projectRoot, 'orchestrator-fixture');
    expect(initialized.success).toBe(true);

    const workItemId = 'WI-0001';
    await writeJson(
      path.join(projectRoot, '.specforge', 'work-items', workItemId, 'trigger_result.json'),
      {
        schema_version: '1.1',
        work_item_id: workItemId,
        workflow_path: 'task_change_path',
        classification: {
          requirement_changed: false,
          acceptance_criteria_changed: false,
          business_rule_changed: false,
          user_visible_behavior_changed: false,
          data_semantics_changed: false,
          design_changed: false,
          module_boundary_changed: false,
          api_contract_changed: false,
          architecture_changed: false,
          unknowns: [],
        },
      }
    );
    const validOwnedContent: Record<string, string> = {
      candidate_requirements: '# Requirements\n\n### REQ-CORE-001 Core requirement\n',
      requirements_delta:
        '# Requirements Delta\n\n## 1. Change reason\n\nOwnership contract test.\n',
      candidate_design:
        '---\nmodule_id: core\nanalysis_scope: solution_design\n---\n\n# Design\n\nCore design.',
      design_delta:
        '---\nanalysis_scope: solution_design\n---\n\n# Design Delta\n\nOwnership contract test.',
      candidate_tasks: `### TASK-WI-0001-001 Core task

- **refs**: [REQ-CORE-001, DD-CORE-001]
- **verification_commands**:
  - unit:
    - \`node --test tests/core.test.mjs\`
`,
      trace_delta: '# Trace Delta\n\nTrace Impact: none\nReason: ownership contract test.',
    };
    const ownershipCases = [
      ['candidate_requirements', 'sf-requirements'],
      ['requirements_delta', 'sf-requirements'],
      ['candidate_design', 'sf-design'],
      ['design_delta', 'sf-design'],
      ['candidate_tasks', 'sf-task-planner'],
      ['trace_delta', 'sf-task-planner'],
    ] as const;

    for (const [fileType, requiredAgent] of ownershipCases) {
      const denied = (await getHandler('sf_artifact_write')!(
        {
          work_item_id: workItemId,
          file_type: fileType,
          content: validOwnedContent[fileType],
        },
        { directory: projectRoot, agent: 'sf-orchestrator' },
        auditDeps('candidate_preparing')
      )) as any;

      expect(denied.success).toBe(false);
      expect(denied.error).toBe('ARTIFACT_OWNER_MISMATCH');
      expect(denied.caller_agent).toBe('sf-orchestrator');
      expect(denied.required_agent).toBe(requiredAgent);

      const written = (await getHandler('sf_artifact_write')!(
        {
          work_item_id: workItemId,
          file_type: fileType,
          content: validOwnedContent[fileType],
        },
        { directory: projectRoot, agent: requiredAgent },
        auditDeps('candidate_preparing')
      )) as any;

      expect(written.success).toBe(true);
      expect(existsSync(path.join(projectRoot, written.path))).toBe(true);
    }

    const missingCaller = (await getHandler('sf_artifact_write')!(
      {
        work_item_id: workItemId,
        file_type: 'candidate_design',
        content: '# Design\n\nMissing caller context.',
      },
      { directory: projectRoot },
      {} as any
    )) as any;
    expect(missingCaller.success).toBe(false);
    expect(missingCaller.error).toBe('ARTIFACT_OWNER_MISMATCH');
    expect(missingCaller.caller_agent).toBe('unknown');
    expect(missingCaller.required_agent).toBe('sf-design');

    const inferredBypass = (await getHandler('sf_artifact_write')!(
      {
        work_item_id: workItemId,
        file_type: 'work_log',
        run_id: 'task-planning',
        agent_content: '# Tasks\n\nInferred task candidate.',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {} as any
    )) as any;
    expect(inferredBypass.success).toBe(false);
    expect(inferredBypass.error).toBe('ARTIFACT_OWNER_MISMATCH');
    expect(inferredBypass.required_agent).toBe('sf-task-planner');
  });

  it('requires a non-empty intake artifact before created can advance to intake_ready', async () => {
    const initialized = await ensureProjectInit(projectRoot, 'orchestrator-fixture');
    expect(initialized.success).toBe(true);

    const deps = transitionDeps();
    const created = (await getHandler('sf_state_transition')!(
      {
        from_state: '',
        to_state: 'created',
        workflow_type: 'bugfix_spec',
        workflow_path: 'requirement_change_path',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps
    )) as any;
    expect(created.success).toBe(true);

    const rejected = (await getHandler('sf_state_transition')!(
      {
        work_item_id: created.work_item_id,
        from_state: 'created',
        to_state: 'intake_ready',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps
    )) as any;
    expect(rejected.success).toBe(false);
    expect(rejected.error).toBe('STATE_PREREQUISITE_MISSING');
    expect(rejected.code).toBe('INTAKE_ARTIFACT_REQUIRED');
    expect(rejected.required_artifact).toBe('intake.md');

    const intakePath = path.join(
      projectRoot,
      '.specforge',
      'work-items',
      created.work_item_id,
      'intake.md'
    );
    await writeFile(intakePath, '   ');
    const emptyRejected = (await getHandler('sf_state_transition')!(
      {
        work_item_id: created.work_item_id,
        from_state: 'created',
        to_state: 'intake_ready',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps
    )) as any;
    expect(emptyRejected.success).toBe(false);
    expect(emptyRejected.error).toBe('STATE_PREREQUISITE_MISSING');

    await writeFile(intakePath, '# Intake\n\nOriginal User Request: fix formatLabel.');
    const advanced = (await getHandler('sf_state_transition')!(
      {
        work_item_id: created.work_item_id,
        from_state: 'created',
        to_state: 'intake_ready',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps
    )) as any;
    expect(advanced.success).toBe(true);
    expect(advanced.transition_result.currentState).toBe('intake_ready');
  });

  it('reserves HardStop resolution for sf-orchestrator at Dispatcher and Handler boundaries', async () => {
    const workItemId = 'WI-0001';
    const hardStop = setHardStop(
      projectRoot,
      workItemId,
      'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL',
      'sf_safe_bash'
    );

    const handlerDenied = (await getHandler('sf_hard_stop_resolve')!(
      {
        work_item_id: workItemId,
        hard_stop_id: hardStop.hard_stop_id,
        resolution_type: 'false_positive',
        user_response_quote: '任务提示要求继续写入设计产物',
      },
      { directory: projectRoot, agent: 'sf-design' },
      {} as any
    )) as any;
    expect(handlerDenied.success).toBe(false);
    expect(handlerDenied.error).toBe('HARD_STOP_RESOLVE_ORCHESTRATOR_ONLY');

    const dispatcher = new ToolDispatcher({} as any);
    const dispatcherDenied = (await dispatcher.dispatch({
      tool: 'sf_hard_stop_resolve',
      args: {
        work_item_id: workItemId,
        hard_stop_id: hardStop.hard_stop_id,
        resolution_type: 'false_positive',
        user_response_quote: '任务提示要求继续写入设计产物',
      },
      context: { directory: projectRoot, agent: 'sf-design' },
    })) as any;
    expect(dispatcherDenied.success).toBe(false);
    expect(dispatcherDenied.error).toBe('HARD_STOP_RESOLVE_ORCHESTRATOR_ONLY');
    expect(dispatcherDenied.required_agent).toBe('sf-orchestrator');

    const resolved = (await getHandler('sf_hard_stop_resolve')!(
      {
        work_item_id: workItemId,
        hard_stop_id: hardStop.hard_stop_id,
        resolution_type: 'repaired',
        user_response_quote: '同意保留本次阻断记录并改用受控工具继续',
        reason: 'The invalid shell write path was abandoned.',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {} as any
    )) as any;
    expect(resolved.success).toBe(true);

    const resolutionLog = await readFile(
      path.join(projectRoot, '.specforge', 'work-items', workItemId, 'hard_stop_resolution.jsonl'),
      'utf8'
    );
    const resolution = JSON.parse(resolutionLog.trim());
    expect(resolution.resolved_by).toBe('sf-orchestrator');
    expect(resolution.decision_source).toBe('sf-orchestrator_user_context');
  });

  it('audits resolution-only historical blocked writes and deduplicates by hard_stop_id', async () => {
    const workItemId = 'WI-0001';
    const wiDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);

    await writeJson(path.join(wiDir, 'work_item.json'), {
      schema_version: '1.1',
      work_item_id: workItemId,
      workflow_type: 'bugfix_spec',
      workflow_path: 'requirement_change_path',
      code_change_allowed: false,
      allowed_write_files: [],
    });
    await writeJson(path.join(wiDir, 'trigger_result.json'), {
      work_item_id: workItemId,
      workflow_type: 'bugfix_spec',
      workflow_path: 'requirement_change_path',
    });
    await writeJson(path.join(wiDir, 'candidate_manifest.json'), {
      work_item_id: workItemId,
      workflow_type: 'bugfix_spec',
      workflow_path: 'requirement_change_path',
      candidate_phase: 'tasks',
      no_project_spec_change: true,
      project_integration_effect: 'evidence_only',
      merge_required: false,
      merge_applicable: false,
      entries: [],
    });

    const hardStopId = 'HS-RESOLUTION-ONLY';
    await writeFile(
      path.join(wiDir, 'hard_stop_resolution.jsonl'),
      `${JSON.stringify({
        schema_version: '1.2.8',
        resolved_at: new Date().toISOString(),
        work_item_id: workItemId,
        hard_stop_id: hardStopId,
        resolution_type: 'repaired',
        user_response_quote: '同意保留历史阻断并改用受控写入工具继续',
        resolved_by: 'sf-orchestrator',
        decision_source: 'sf-orchestrator_user_context',
        original_hard_stop: {
          hard_stop_id: hardStopId,
          work_item_id: workItemId,
          blocked: true,
          reason: 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL',
          source_tool: 'sf_safe_bash',
        },
      })}\n`
    );

    const audit = (await getHandler('sf_changed_files_audit')!(
      { work_item_id: workItemId, mode: 'no_code_change' },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      auditDeps()
    )) as any;

    expect(audit.passed).toBe(true);
    expect(audit.blocked_write_attempts).toBe(1);
    expect(audit.resolved_blocked_write_attempts).toBe(1);
    expect(audit.unresolved_blocked_write_attempts).toBe(0);

    const report = await readFile(path.join(wiDir, 'changed_files_audit.md'), 'utf8');
    expect(report).toContain('Blocked write attempts: 1');
    expect(report).toContain('Historical/resolved blocked write attempts: 1');
    expect(report).toContain('Hard stop resolutions: 1');

    await writeFile(
      path.join(wiDir, 'write_guard_log.jsonl'),
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        path: `.specforge/work-items/${workItemId}/`,
        operation: 'modify',
        actor: 'sf-design',
        allowed: false,
        violations: ['WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL'],
        tool: 'sf_safe_bash',
        hard_stop_id: hardStopId,
      })}\n`
    );

    const deduplicatedAudit = (await getHandler('sf_changed_files_audit')!(
      { work_item_id: workItemId, mode: 'no_code_change' },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      auditDeps()
    )) as any;
    expect(deduplicatedAudit.blocked_write_attempts).toBe(1);
    expect(deduplicatedAudit.resolved_blocked_write_attempts).toBe(1);
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
      { command: 'Set-Content .specforge/project/spec_manifest.json "{}"' },
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
