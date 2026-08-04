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
const p0ContractClosurePath = join(
  repoRoot,
  'docs/implementation/architecture-consistency/P0-contract-consumer-closure.md',
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
    expect(experienceRuleIds.length).toBeGreaterThanOrEqual(50);
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
    expect(experienceRuleIds).toContain('## EXP-038：');
    expect(experienceRuleIds).toContain('## EXP-039：');
    expect(experienceRuleIds).toContain('## EXP-040：');
    expect(experienceRuleIds).toContain('## EXP-041：');
    expect(experienceRuleIds).toContain('## EXP-042：');
    expect(experienceRuleIds).toContain('## EXP-043：');
    expect(experienceRuleIds).toContain('## EXP-044：');
    expect(experienceRuleIds).toContain('## EXP-045：');
    expect(experienceRuleIds).toContain('## EXP-046：');
    expect(experienceRuleIds).toContain('## EXP-047：');
    expect(experienceRuleIds).toContain('## EXP-048：');
    expect(experienceRuleIds).toContain('## EXP-049：');
    expect(experienceRuleIds).toContain('## EXP-050：');
    expect(experienceRuleIds).toContain('## EXP-051：');
    expect(experienceRuleIds).toContain('## EXP-052：');

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
    expect(checklist).toContain('daemon/OpenCode 进程检查命令已成功并可解析');
    expect(checklist).toContain('Git porcelain 等机器结构化输出使用原始 bytes 和协议分隔符解析');
    expect(checklist).toContain('引用审计已区分活跃权威依赖');
    expect(checklist).toContain('Git porcelain `M` 已通过规范化 blob');
    expect(checklist).toContain('修改脚本已在首次写入前验证进程');
    expect(checklist).toContain('实施文档重构已同步经验门禁');
    expect(checklist).toContain('每条验证断言已绑定真实生产者');
    expect(checklist).toContain('最终成功证据已与当前状态文档');
    expect(checklist).toContain('源码调用和依赖审计已区分可执行语法');
    expect(checklist).toContain('Runtime已在candidate_preparing→candidate_prepared边界按Classification物化完整Manifest');
    expect(checklist).toContain('Candidate文件和专业Gate要求已逐项绑定正式Classification');
    expect(checklist).toContain('状态名均来自正式状态枚举与迁移表');
    expect(checklist).toContain('专业Agent只通过受控Tool写治理Candidate');
    expect(checklist).toContain('HardStop活动锁与resolution历史已分层取证');
    expect(checklist).toContain('Monorepo单包TypeScript检查前已按正式拓扑生成内部依赖声明');
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
    expect(document).toContain('### ERR-057：进程存活检查命令执行失败仍被解释为 daemon 未运行');
    expect(document).toContain('## EXP-038：进程不存在结论必须建立在成功且可解析的进程快照上');
    expect(document).toContain('### ERR-058：Git porcelain 输出被整体裁剪后首个文件路径丢失首字符');
    expect(document).toContain('## EXP-039：机器结构化输出必须先解析，不能先做展示层空白规范化');
    expect(document).toContain('### ERR-059：历史观测日志命中被误判为 Work Item 的正式外部引用');
    expect(document).toContain('## EXP-040：引用审计必须区分活跃权威依赖与不可变历史证据');
    expect(document).toContain('### ERR-060：把内容中性的 Git `M` 状态当成必须通过 index 刷新清除的业务变更');
    expect(document).toContain('## EXP-041：Git 工作区状态必须区分正式内容差异与 stat/index 元数据差异');
    expect(document).toContain('## 22. 2026-08-04 真实环境关闭更新');
    expect(document).toContain('P0-PSV-BINDING-001：CLOSED');
    expect(document).toContain('ERR-060：CLOSED');
    expect(document).toContain('### ERR-061：运行边界前置条件在写入之后检查');
    expect(document).toContain('### ERR-062：精确目标状态在干净工作区要求之后识别，导致失败运行不可重入');
    expect(document).toContain('## EXP-042：可恢复脚本必须先验证零写入前置条件，再识别精确源/目标状态');
    expect(document).toContain('### ERR-063：实施状态文档重构后保留了已经失效的固定文本断言');
    expect(document).toContain('## EXP-043：实施文档重构必须同步全部固定文本消费者');
    expect(document).toContain('### ERR-064：验证器要求生产者契约中不存在的 `trigger_result.project_spec_version`');
    expect(document).toContain('## EXP-044：验证断言必须绑定真实生产者契约和文件职责');
    expect(document).toContain('### ERR-065：最终验证成功后当前交接仍停留在“待验证”状态');
    expect(document).toContain('## EXP-045：成功证据产生后必须执行提交前最终状态对账');
    expect(document).toContain('### ERR-066：源码审计把注释中的 `Bun.file` 文本误判为可执行持久化调用');
    expect(document).toContain('## EXP-046：源码调用证据必须区分可执行语法、注释和普通文本');
    expect(document).toContain('### ERR-067：混合 Candidate 生产者使 Runtime-owned `candidate_manifest` 只保留首个显式条目');
    expect(document).toContain('## EXP-047：多Tool Candidate生产必须在Runtime状态边界收口为完整冻结Manifest');
    expect(document).toContain('### ERR-068：`architecture_change` full Candidate Gate无条件要求未发生变化的 Requirement Candidate');
    expect(document).toContain('## EXP-048：Candidate和Gate要求必须由正式Classification决定');
    expect(document).toContain('### ERR-069：场景文档和提示词使用状态机中不存在的 `gates_passed`');
    expect(document).toContain('## EXP-049：状态名是生产者—消费者契约，文档和提示词不得发明描述性状态');
    expect(document).toContain('### ERR-070：专业设计Agent在受控Candidate写入阶段调用 `sf_safe_bash`');
    expect(document).toContain('## EXP-050：专业Agent的治理产物写入必须走精确受控Tool边界');
    expect(document).toContain('### ERR-071：把已恢复HardStop的活动锁文件当作永久历史证据');
    expect(document).toContain('## EXP-051：活动锁、恢复历史和独立修复前置条件必须分层');
    expect(document).toContain('### ERR-072：在内部依赖声明生成前执行daemon-core TypeScript检查，并遗漏可选工作流路径类型');
    expect(document).toContain('## EXP-052：Monorepo TypeScript验证必须先准备内部声明，并分离环境错误与代码错误');
    expect(readSection(document, '### ERR-067：', '### ERR-068：')).toContain('`FIXED_PENDING_WORKDESK_RETEST`');
    expect(readSection(document, '### ERR-068：', '### ERR-069：')).toContain('`FIXED_PENDING_WORKDESK_RETEST`');
    expect(readSection(document, '### ERR-069：', '### ERR-070：')).toContain('`FIXED_VALIDATED_V28`');
    expect(readSection(document, '### ERR-070：', '### ERR-071：')).toContain('`FIXED_PENDING_WORKDESK_RETEST`');
    expect(readSection(document, '### ERR-071：', '### ERR-072：')).toContain('`FIXED_VALIDATED_V28`');
    expect(readSection(document, '### ERR-072：', '# 第二部分：正确做法')).toContain('`FIXED_VALIDATED_V28`');
    expect(document).toContain('V28隔离验证：RESULT=SUCCESS');
    expect(document).toContain('ERR-064：CLOSED');
    expect(document).toContain('## EXP-032：最终证据必须使完整变更集可重建、可审查');
    expect(document).toContain('一个错误必须产生一个类防护');
  });

  it('requires every delivery round to use one complete downloadable bundle', () => {
    const handoff = readFileSync(currentHandoffPath, 'utf-8');
    const psvImplementation = readFileSync(psvImplementationPath, 'utf-8');
    const p0ContractClosure = readFileSync(p0ContractClosurePath, 'utf-8');
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
    expect(handoff).toContain('用户级安装升级：完成');
    expect(handoff).toContain('安装 Manifest、Tool、Skill、Agent 与源码一致性：119/119');
    expect(handoff).toContain('WI-0003 字面引用总数：109');
    expect(handoff).toContain('Project Spec / Module Design / Contract / Trace / 其他 WI 正式引用：0');
    expect(handoff).toContain('WI-0003 Runtime状态：workflow_selected');
    expect(handoff).toContain('当前分配器下一编号：WI-0004');
    expect(handoff).toContain('WI-0003：workflow_selected → superseded');
    expect(handoff).toContain('WI-0004 candidate_manifest.base_spec_version：PSV-0002');
    expect(handoff).toContain('P0-PSV-BINDING-001：CLOSED_REAL_PROJECT_VALIDATED');
    expect(handoff).toContain('V19 辅助脚本执行事实');
    expect(handoff).toContain('拒绝自身5文件精确目标状态');
    expect(handoff).toContain('V20 必须从精确V19目标状态继续验证');
    expect(handoff).toContain('V20 经验门禁失败事实');
    expect(handoff).toContain('V21 从精确V20目标状态继续');
    expect(handoff).toContain('V21 验证执行事实');
    expect(handoff).toContain('WI-0004 trigger_result：符合真实生产者skeleton');
    expect(handoff).toContain('V22 最终验证事实');
    expect(handoff).toContain('场景准备结论：READY_FOR_CONTRACT_CONSUMER_SCENARIO_DESIGN');
    expect(handoff).toContain('V23 提交前最终状态对账');
    expect(handoff).toContain('V24 WorkDesk源码与Contract基线审计事实');
    expect(handoff).toContain('辅助取证脚本误报');
    expect(handoff).toContain('场景名称：WorkItemStatus Project Contract同ID规范化与正式Trace激活');
    expect(handoff).toContain('WI-0005：WorkItemStatus破坏性变更/删除阻断');
    expect(handoff).toContain('WI-0006：ReportFormatter正式Module→Project Promotion');
    expect(handoff).toContain('WI-0004 Phase 1真实运行结果');
    expect(handoff).toContain('Runtime最终状态：gates_failed');
    expect(handoff).toContain('ERR-067：混合Candidate生产者导致Runtime Manifest缺项');
    expect(handoff).toContain('ERR-068：Candidate Gate不按Classification要求产物');
    expect(handoff).toContain('ERR-069：V25提示词和文档使用不存在的gates_passed状态');
    expect(handoff).toContain('ERR-070：sf-design仍调用sf_safe_bash写治理产物并触发可避免HardStop');
    expect(handoff).toContain('Runtime在candidate_preparing→candidate_prepared边界按Classification物化完整Manifest');
    expect(handoff).toContain('产品修复提交和用户级升级后的下一项完整工作');
    expect(handoff).toContain('## V26实际执行结果与V27隔离验证边界（2026-08-04）');
    expect(handoff).toContain('PATCH_FILES_APPLIED=0/13');
    expect(handoff).toContain('## V27失败结果与V28隔离验证边界（2026-08-04）');
    expect(handoff).toContain('V27定向测试：73/73通过');
    expect(handoff).toContain('## V28隔离验证成功与V29真实仓库应用边界（2026-08-04）');
    expect(handoff).toContain('TARGETED_TESTS=PASS（74/74）');
    expect(handoff).toContain('FINAL_SCOPE=PASS_EXACT_13_FILES');
    expect(handoff).toContain('V29成功证据复核前不得提交、推送、安装真实用户级组件或恢复WI-0004');
    expect(handoff).toContain('GOV-DEFECT-CONTRACT-CONSUMER-001 仍保持 IN_PROGRESS');
    expect(handoff).toContain('`STAT_ONLY_CONTENT_NEUTRAL`');
    expect(handoff).toContain('WorkDesk文件和index保持原状');
    expect(handoff).not.toContain('刷新 WorkDesk Git index 中4个字节未变文件的 stat 状态');
    expect(handoff).not.toContain('核对用户级 SpecForge 安装来源与当前版本');
    expect(handoff).not.toContain('用户暂存、提交并推送当前 19 文件变更');
    expect(handoff).not.toContain('完成当前状态文档同步并复跑同一验证集');
    expect(psvImplementation).toContain('`CLOSED_REAL_PROJECT_VALIDATED`');
    expect(psvImplementation).toContain('## WorkDesk Real-Project Validation Evidence');
    expect(psvImplementation).toContain('allocated as `WI-0004`;');
    expect(psvImplementation).toContain('defect `P0-PSV-BINDING-001` is closed');
    expect(psvImplementation).toContain('9. [x] Transition WI-0003');
    expect(psvImplementation).toContain('10. [x] Create the next Work Item');
    expect(psvImplementation).toContain('must not require a clean porcelain display');
    expect(psvImplementation).toContain('`95befe8b35812aeb09e4d9e68f4497e12b3ac2a9`');
    expect(psvImplementation).toContain('6. [x] Commit the validated change set');
    expect(psvImplementation).toContain('7. [x] Upgrade the user-level SpecForge runtime');
    expect(psvImplementation).not.toContain('remains uncommitted');
    expect(p0ContractClosure).toContain('> **状态**：IN_PROGRESS');
    expect(p0ContractClosure).toContain('### 25.5 WorkDesk 真实创建链验证');
    expect(p0ContractClosure).toContain('WI-0004 candidate_manifest.base_spec_version：PSV-0002');
    expect(p0ContractClosure).toContain('INSUFFICIENT_EVIDENCE：真实业务项目中的 Project Contract 新增和多个DD消费者尚未端到端验证');
    expect(p0ContractClosure).toContain('### 25.7 下一验证边界');
    expect(p0ContractClosure).toContain('### 25.8 V24 WorkDesk源码与Contract基线审计');
    expect(p0ContractClosure).toContain('### 25.9 WI-0004 第一阶段真实场景冻结');
    expect(p0ContractClosure).toContain('ADD DD-CLI-002 constrained_by WorkItemStatus');
    expect(p0ContractClosure).toContain('到 `approval_required` 必须停止');
    expect(p0ContractClosure).toContain('### 25.10 WI-0004 Phase 1真实运行结果');
    expect(p0ContractClosure).toContain('### 25.11 修复设计');
    expect(p0ContractClosure).toContain('### 25.12 修复后恢复边界');
    expect(p0ContractClosure).toContain('### 25.13 V26产品修复与工程验证边界');
    expect(p0ContractClosure).toContain('Runtime在candidate_preparing→candidate_prepared物化Manifest');
    expect(p0ContractClosure).toContain('### 25.14 V26零写入失败与V27隔离验证修正');
    expect(p0ContractClosure).toContain('WorkDesk只读审计不再作为源码修复的因果前置');
    expect(p0ContractClosure).toContain('### 25.15 V27类型检查失败与V28验证顺序修正');
    expect(p0ContractClosure).toContain('V27定向测试73/73通过');
    expect(p0ContractClosure).toContain('### 25.16 V28隔离验证成功与V29真实仓库应用边界');
    expect(p0ContractClosure).toContain('定向测试：74/74通过');
    expect(p0ContractClosure).toContain('ERR-067、ERR-068、ERR-070：FIXED_PENDING_WORKDESK_RETEST');
    expect(p0ContractClosure).not.toContain('到 `gates_passed` 必须停止');

    for (const entry of [rootAgents, userLevelAgents]) {
      expect(entry).toContain('docs/rule/specforge-development-error-ledger-and-experience.md');
      expect(entry).toContain('EXPERIENCE_FILE_READ=YES');
      expect(entry).toContain('APPLICABLE_EXPERIENCE_RULES');
      expect(entry).toContain('REPEATED_ERROR_CHECK=PASS');
    }
  });

});
