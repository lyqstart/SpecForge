import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/tools/handlers/sf-artifact-write.js';
import { getHandler } from '../src/tools/ToolDispatcher.js';
import { checkRequirementsGate } from '../src/tools/lib/sf_requirements_gate_core.js';
import { checkDesignGate } from '../src/tools/lib/sf_design_gate_core.js';

function validPlan(): string {
  return `# Investigation Plan

## 调查问题与完成标准
### 调查目标
定位 Gate 找不到正式调查产物的根因。

### 完成标准
以合法 Agent 写入后 Gate 通过作为完成标准。

## 当前状态与调用链
### 真实调用链
入口 sf_workflow_investigation → sf_artifact_write → Artifact Handler → Requirements Gate。

### 状态权威
状态权威为 StateManager/events.jsonl。

## 调查范围
### 范围内
覆盖 Agent Contract、Artifact 映射、Path Service、Gate Runner 和状态推进。

### 范围外
不修改业务代码。

## 已知事实与未知项
### 已确认事实
- CODE_OBSERVED: Gate 要求 investigation_plan.md。
- RUNTIME_OBSERVED: 当前调用返回 File not found。

### 未验证项
- ASSUMPTION: Artifact 类型映射缺失可能是原因之一。
- UNKNOWN: 后续 Close Gate 是否还存在独立阻断。

## 问题前提与观察者影响
PREMISE: PREMISE_REPRODUCED
OBSERVER_EFFECT: OBSERVER_EFFECT_NONE

通过只读 Gate 调用稳定复现，创建测试 WI 不改变“Gate 找不到正式调查产物”的现场。

## 原始证据来源
- 一级原始证据 EV-1：源码 \`packages/daemon-core/src/tools/handlers/sf-artifact-write.ts\`。
- 一级原始证据 EV-2：sf_requirements_gate 原始命令输出与 StateManager events.jsonl 状态记录。
- 其他 Agent 的说明仅标记为 INVESTIGATION_LEAD，不作为事实。

## 候选假设
- H1: Artifact Writer 没有正式调查产物映射。
- H2: Writer 与 Gate 使用不同权威路径。

## 验证与反证方法
- H1 验证：检查 file_type 和 owner map；反证：若存在映射且合法写入成功则推翻 H1。
- H2 验证：比较 Writer 目标路径和 Gate 读取路径；反证：若二者完全一致则排除 H2。

## 证据计划
- EV-1: 读取 packages/daemon-core/src/tools/handlers/sf-artifact-write.ts。
- EV-2: 执行 Gate 并保存日志、命令输出和状态快照。

## 根因判定标准
只有前提状态为 PREMISE_REPRODUCED 或 PREMISE_HISTORICALLY_EVIDENCED，且定位首次偏离点、排除主要竞争假设、形成完整因果链且不存在关键 UNKNOWN 时，才使用 ROOT_CAUSE_CONFIRMED。

## 预期产出
形成 findings_report.md，列明事实、实验、根因状态、影响和后续验证。
`;
}

function validFindings(): string {
  return `# Findings Report

## 调查结论
原始调查问题：为什么合法 sf-investigator 无法生成 Gate 所需正式调查产物？
直接回答：ROOT_CAUSE_CONFIRMED，调查产物没有接入现有 Artifact Ownership 映射，导致合法责任 Agent 无法生成 Gate 所需文件。

## 事实与证据
- CODE_OBSERVED EV-1: \`packages/daemon-core/src/tools/handlers/sf-artifact-write.ts\` 原映射缺少 investigation_plan。
- RUNTIME_OBSERVED EV-2: 命令 sf_requirements_gate(mode=investigation) 返回 File not found。

## 问题前提与证据完整性
PREMISE: PREMISE_REPRODUCED
OBSERVER_EFFECT: OBSERVER_EFFECT_NONE

通过隔离临时目录稳定复现，取证前现场未被写入动作改变；EV-1 与 EV-2 均为独立读取的一级原始证据。AGENT_CLAIM 未作为事实使用。

## 调用链与首次偏离点
入口 → sf_artifact_write → Artifact Handler → Gate。预期由 sf-investigator 写入正式文件；实际在 Artifact Handler 参数映射处拒绝。首次偏离点是 Artifact Handler 未识别调查类型。

## 假设验证结果
- H1 confirmed：实验结果 EV-1 显示 owner map 缺少调查类型，补齐后合法写入和 Gate 均通过。
- H2 rejected：实验结果 EV-2 与路径对照证明 Path Service 与 Gate 的现代 work-items 路径一致，因此路径不是首要根因。

## 根因判定
根本缺陷是 Standard、Contract 和 Runtime 未把调查产物纳入单一所有权映射；直接原因是 Gate 找不到文件。

## 因果链
根本缺陷 → 触发条件：Investigation 进入计划 Gate → 合法 Agent 无可用 file_type → 正式文件不存在 → Gate 报错。

## 影响范围
影响所有使用 Investigation 正式计划和结论 Gate 的工作项，不影响普通设计 Candidate。

## 修复方向
扩展现有 sf_artifact_write、所有权映射和既有 Gate，不新增 Tool、Skill、Agent 或状态机。

## 限制与未知项
不存在会推翻当前根因结论的关键 UNKNOWN；后续状态闭环作为独立影响项继续验证。

## 后续验证计划
运行 Artifact 所有权负向测试、两个专业 Gate、no-code audit、Verification 和 Close Gate 回归。
`;
}

describe('Investigation artifact ownership and professional gates', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'sf-investigation-artifact-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('allows only sf-investigator to write canonical plan and findings artifacts', async () => {
    const handler = getHandler('sf_artifact_write');
    expect(handler).toBeDefined();

    for (const fileType of ['investigation_plan', 'findings_report'] as const) {
      for (const agent of ['sf-design', 'sf-executor', 'sf-orchestrator']) {
        const denied = (await handler!(
          { work_item_id: 'WI-0001', file_type: fileType, content: '# denied' },
          { directory: projectRoot, agent },
          {} as any
        )) as any;
        expect(denied.success).toBe(false);
        expect(['ARTIFACT_OWNER_MISMATCH', 'EXECUTOR_CANNOT_WRITE_GOVERNANCE_ARTIFACTS']).toContain(
          denied.error
        );
        if (denied.error === 'ARTIFACT_OWNER_MISMATCH') {
          expect(denied.required_agent).toBe('sf-investigator');
        }
      }

      const missingContext = (await handler!(
        { work_item_id: 'WI-0001', file_type: fileType, content: '# denied' },
        { directory: projectRoot },
        {} as any
      )) as any;
      expect(missingContext.success).toBe(false);
      expect(missingContext.caller_agent).toBe('unknown');

      const written = (await handler!(
        {
          work_item_id: 'WI-0001',
          file_type: fileType,
          content: fileType === 'investigation_plan' ? validPlan() : validFindings(),
        },
        { directory: projectRoot, agent: 'sf-investigator' },
        {} as any
      )) as any;
      expect(written.success).toBe(true);
      expect(written.path.replace(/\\/g, '/')).toBe(`.specforge/work-items/WI-0001/${fileType}.md`);
      expect(existsSync(path.join(projectRoot, written.path))).toBe(true);
    }
  });

  it('fails the plan gate when the artifact is absent and passes a falsifiable plan', async () => {
    const absent = await checkRequirementsGate('WI-0001', projectRoot, { mode: 'investigation' });
    expect(absent.status).toBe('fail');
    expect(absent.blocking_issues).toContain('File not found: investigation_plan.md');

    const wiDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0001');
    await mkdir(wiDir, { recursive: true });
    await writeFile(path.join(wiDir, 'investigation_plan.md'), validPlan());
    const passed = await checkRequirementsGate('WI-0001', projectRoot, {
      mode: 'investigation',
    });
    expect(passed.status).toBe('pass');
    expect((passed.details as any).hypothesis_ids).toEqual(['H1', 'H2']);
  });

  it('rejects a shallow findings report and passes evidence-backed root cause proof', async () => {
    const wiDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0001');
    await mkdir(wiDir, { recursive: true });
    await writeFile(
      path.join(wiDir, 'findings_report.md'),
      '# Findings\n\n## 调查结论\n可能是配置问题。\n'
    );
    const shallow = await checkDesignGate('WI-0001', projectRoot, 'investigation', {
      mode: 'investigation',
    });
    expect(shallow.status).toBe('fail');

    await writeFile(path.join(wiDir, 'findings_report.md'), validFindings());
    const passed = await checkDesignGate('WI-0001', projectRoot, 'investigation', {
      mode: 'investigation',
    });
    expect(passed.status).toBe('pass');
    expect((passed.details as any).root_cause_status).toBe('ROOT_CAUSE_CONFIRMED');
  });

  it('rejects confirmed root cause when the premise was not reproduced or evidence is only an Agent claim', async () => {
    const wiDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0001');
    await mkdir(wiDir, { recursive: true });
    const invalid = validFindings()
      .replace('PREMISE_REPRODUCED', 'PREMISE_NOT_REPRODUCED')
      .replace(
        '- CODE_OBSERVED EV-1: `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts` 原映射缺少 investigation_plan。',
        '- AGENT_CLAIM: sf-orchestrator 说 owner map 缺少 investigation_plan。'
      );
    await writeFile(path.join(wiDir, 'findings_report.md'), invalid);

    const result = await checkDesignGate('WI-0001', projectRoot, 'investigation', {
      mode: 'investigation',
    });
    expect(result.status).toBe('fail');
    expect(result.blocking_issues.join('\n')).toContain('问题前提未复现');
    expect(result.blocking_issues.join('\n')).toContain('其他 Agent 的转述');
  });
});
