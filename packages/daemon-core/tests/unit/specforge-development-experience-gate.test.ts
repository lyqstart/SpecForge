import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../../..');
const experiencePath = join(
  repoRoot,
  'docs/rule/specforge-development-error-ledger-and-experience.md',
);
const currentHandoffPath = join(
  repoRoot,
  'docs/implementation/architecture-consistency/current-handoff.md',
);
const psvImplementationPath = join(
  repoRoot,
  'docs/implementation/architecture-consistency/P0-project-spec-version-binding-defect.md',
);
const rootAgentsPath = join(repoRoot, 'AGENTS.md');
const userLevelAgentsPath = join(repoRoot, 'setup/userlevel-opencode/AGENTS.md');

function readSection(document: string, heading: string, nextHeading: string): string {
  const start = document.indexOf(heading);
  const end = document.indexOf(nextHeading);
  if (start < 0 || end <= start) return '';
  return document.slice(start, end);
}

describe('SpecForge development experience pre-read gate', () => {
  it('contains substantive experience rules and mandatory checks', () => {
    const document = readFileSync(experiencePath, 'utf-8');
    const experience = readSection(
      document,
      '# 第三部分：工程经验总则',
      '# 第四部分：修改前强制检查',
    );
    const checklist = readSection(
      document,
      '# 第四部分：修改前强制检查',
      '# 第五部分：错误台账维护规则',
    );

    const experienceRuleIds = experience.match(/^## EXP-\d{3}：/gm) ?? [];
    expect(experience.trim().length).toBeGreaterThan(500);
    expect(experienceRuleIds.length).toBeGreaterThanOrEqual(37);
    expect(experienceRuleIds).toContain('## EXP-021：');
    expect(experienceRuleIds).toContain('## EXP-022：');
    expect(experienceRuleIds).toContain('## EXP-023：');
    expect(experienceRuleIds).toContain('## EXP-024：');
    expect(experienceRuleIds).toContain('## EXP-025：');
    expect(experienceRuleIds).toContain('## EXP-026：');
    expect(experienceRuleIds).toContain('## EXP-027：');
    expect(experienceRuleIds).toContain('## EXP-028：');
    expect(experienceRuleIds).toContain('## EXP-029：');
    expect(experienceRuleIds).toContain('## EXP-030：');
    expect(experienceRuleIds).toContain('## EXP-031：');
    expect(experienceRuleIds).toContain('## EXP-032：');
    expect(experienceRuleIds).toContain('## EXP-033：');
    expect(experienceRuleIds).toContain('## EXP-034：');
    expect(experienceRuleIds).toContain('## EXP-035：');
    expect(experienceRuleIds).toContain('## EXP-036：');
    expect(experienceRuleIds).toContain('## EXP-037：');

    expect(checklist.trim().length).toBeGreaterThan(500);
    expect(checklist).toContain('APPLICABLE_EXPERIENCE_RULES');
    expect(checklist).toContain('NONE_FOUND');
    expect(checklist).toContain('fail closed');
    expect(checklist).toContain('多产物交付已先冻结主文件');
    expect(checklist).toContain('迁移脚本已分离 SOURCE_CONTRACT 与 TARGET_CONTRACT');
    expect(checklist).toContain('已执行重复错误检查');
    expect(checklist).toContain('生产错误信息、注释、帮助文本和示例已与当前唯一权威路径一致');
    expect(checklist).toContain('新生产写入和新测试夹具未使用 legacy/compatibility 只读路径');
    expect(checklist).toContain('包外 CMD 已覆盖下载文件检查、解压、入口定位和启动标记');
    expect(checklist).toContain('下载 ZIP 不存在、解压失败或 RUN.cmd 未启动时也会输出最小 FEEDBACK TO CHATGPT');
    expect(checklist).toContain('Candidate Gate → User Decision → Merge → Verification/Formal Version → Close');
    expect(checklist).toContain('正式 handler 或 runRequiredGates 执行');
    expect(checklist).toContain('Gate check_id、错误码、Schema 字段和状态枚举变更已同步全部过滤、聚合、豁免、报告和测试消费者');
    expect(checklist).toContain('业务规则已落在全部生产入口共同调用的责任层');
    expect(checklist).toContain('最终证据包已包含全部变化文件正文');
    expect(checklist).toContain('完整 tracked diff、全部 untracked 文件正文');
    expect(checklist).toContain('最终状态文档已根据同一份验证证据对账');
    expect(checklist).toContain('迁移/升级工具已先识别 SOURCE/TARGET 状态');
    expect(checklist).toContain('状态对账目标描述成功结束后的下一阶段');
    expect(checklist).toContain('强制经验门禁已同步仓库根 AGENTS.md');
    expect(checklist).toContain('提交依赖状态已在实现提交和推送成功后执行二次对账');
  });

  it('records every new error with a class-level prevention rule', () => {
    const document = readFileSync(experiencePath, 'utf-8');
    expect(document).toContain('### ERR-039：经验门禁解析器只读取标题仍报告通过');
    expect(document).toContain('### ERR-040：治理能力升级后历史测试夹具未同步权威契约');
    expect(document).toContain('close_formal_version_gate');
    expect(document).toContain('verification_gate → formal_version_gate');
    expect(document).toContain('verification_report_contract_valid');
    expect(document).toContain('formal_hard_gate_verification_gate_json');
    expect(document).toContain('### ERR-041：补丁包与配套应用脚本来自不同冻结时点');
    expect(document).toContain('### ERR-042：迁移脚本把目标状态要求错误地作为源状态前置条件');
    expect(document).toContain('### ERR-043：验证器把非权威反馈字段的字面值当成文档必备契约');
    expect(document).toContain('### ERR-044：生产错误信息和注释仍描述已废止的双状态权威路径');
    expect(document).toContain('### ERR-045：新测试夹具把兼容读取路径当作正式 Candidate 写入路径');
    expect(document).toContain('## EXP-027：兼容读取路径不能成为新写入捷径');
    expect(document).toContain('### ERR-046：外层一键 CMD 在启动包内脚本前失败但没有反馈');
    expect(document).toContain('## EXP-028：交付入口必须从第一步就可观察');
    expect(document).toContain('### ERR-047：统一测试夹具把审批前与合并后阶段折叠到同一个构造步骤');
    expect(document).toContain('### ERR-048：测试直接调用底层 runGate 绕过正式 Gate 编排与治理叠加');
    expect(document).toContain('## EXP-029：测试必须遵守真实阶段顺序并使用正式编排入口');
    expect(document).toContain('### ERR-049：Close Gate 检查项升级后快速路径豁免消费者仍使用旧 check_id');
    expect(document).toContain('## EXP-030：结构化检查标识是生产者—消费者契约');
    expect(document).toContain('### ERR-050：快速路径规则修复落在可绕过的 Gate Chain，正式 Close Handler 未消费');
    expect(document).toContain('## EXP-031：业务规则必须落在全部生产入口共同消费的责任层');
    expect(document).toContain('### ERR-051：最终验证证据包未包含完整变更内容');
    expect(document).toContain('## EXP-032：最终证据必须使完整变更集可重建、可审查');
    expect(document).toContain('### ERR-052：工程验证通过后当前状态文档仍保留验证前或互相冲突的阶段描述');
    expect(document).toContain('## EXP-033：当前状态文档必须与最终证据在同一阶段收口');
    expect(document).toContain('### ERR-053：状态迁移脚本在识别源状态前先执行目标状态语义门禁');
    expect(document).toContain('## EXP-034：先识别迁移状态，再执行状态专属门禁');
    expect(document).toContain('### ERR-054：状态对账包成功后交接文件仍把本包已完成动作列为下一步');
    expect(document).toContain('## EXP-035：状态对账目标必须描述成功后的下一阶段');
    expect(document).toContain('### ERR-055：经验前置门禁只同步到交接和用户级模板，遗漏仓库根 AGENTS 入口');
    expect(document).toContain('## EXP-036：强制治理规则必须覆盖全部实际入口消费者');
    expect(document).toContain('### ERR-056：包含“待提交”状态的当前文档在提交成功后没有执行提交后对账');
    expect(document).toContain('## EXP-037：提交依赖状态必须通过提交后对账闭环');
    expect(document).toContain('## EXP-032：最终证据必须使完整变更集可重建、可审查');
    expect(document).toContain('一个错误必须产生一个类防护');
  });

  it('requires every delivery round to use one complete downloadable bundle', () => {
    const handoff = readFileSync(currentHandoffPath, 'utf-8');
    const psvImplementation = readFileSync(psvImplementationPath, 'utf-8');
    const rootAgents = readFileSync(rootAgentsPath, 'utf-8');
    const userLevelAgents = readFileSync(userLevelAgentsPath, 'utf-8');

    expect(handoff).toContain('同一轮只允许一次下载');
    expect(handoff).toContain('用户只下载一个完整压缩包');
    expect(handoff).toContain('scripts/apply.py');
    expect(handoff).toContain('scripts/validate.py');
    expect(handoff).toContain('不得在应用成功后再要求用户第二次下载验证文件');
    expect(handoff).toContain('只能包含预期的仓库替换文件');
    expect(handoff).toContain('本轮已验证实现提交');
    expect(handoff).toContain('main@95befe8b35812aeb09e4d9e68f4497e12b3ac2a9');
    expect(handoff).toContain('当前远程 HEAD：每次新会话实时读取');
    expect(handoff).toContain('核对用户级 SpecForge 安装来源与当前版本');
    expect(handoff).not.toContain('用户暂存、提交并推送当前 19 文件变更');
    expect(handoff).not.toContain('完成当前状态文档同步并复跑同一验证集');
    expect(psvImplementation).toContain('`COMMITTED_AND_REMOTE_SYNCED_PENDING_INSTALL_AND_REAL_PROJECT_RETEST`');
    expect(psvImplementation).toContain('`95befe8b35812aeb09e4d9e68f4497e12b3ac2a9`');
    expect(psvImplementation).toContain('6. [x] Commit the validated change set');
    expect(psvImplementation).not.toContain('remains uncommitted');

    for (const entry of [rootAgents, userLevelAgents]) {
      expect(entry).toContain('docs/rule/specforge-development-error-ledger-and-experience.md');
      expect(entry).toContain('EXPERIENCE_FILE_READ=YES');
      expect(entry).toContain('APPLICABLE_EXPERIENCE_RULES');
      expect(entry).toContain('REPEATED_ERROR_CHECK=PASS');
    }
  });

});
