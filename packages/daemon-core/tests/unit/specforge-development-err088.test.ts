import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function locateRepoRoot(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, 'docs', 'rule'))) return cwd;
  const fromPackage = path.resolve(cwd, '..', '..');
  if (existsSync(path.join(fromPackage, 'docs', 'rule'))) return fromPackage;
  throw new Error(`Cannot locate SpecForge repository root from cwd=${cwd}`);
}

const repoRoot = locateRepoRoot();

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

describe('ERR-088—ERR-107 real title and validation regression governance', () => {
  it('records every V43—V63 evidence failure and its class-level prevention', () => {
    const ledger = read('docs/rule/specforge-development-error-ledger-and-experience.md');

    expect(ledger).toContain('### ERR-088：共享章节匹配器只支持直接括号后缀');
    expect(ledger).toContain('### ERR-089：V44标题后缀正则使用跨行空白');
    expect(ledger).toContain('### ERR-090：V44两个固定文本测试未与最终状态生产者原子同步');
    expect(ledger).toContain('### ERR-091：固定文本测试把字面量反斜杠t解释为真实制表符');
    expect(ledger).toContain('### ERR-092：Bun测试环境中的String.raw把中文模板内容暴露为Unicode转义字面量');
    expect(ledger).toContain('### ERR-093：正式Gate重验提示要求文件哈希');
    expect(ledger).toContain('### ERR-094：远程源码调查首选git clone因执行环境DNS失败');
    expect(ledger).toContain('### ERR-095：V52验证器把HardStop语义事实绑定到一手日志中不存在的人工合成字段');
    expect(ledger).toContain('### ERR-096：旧HardStop测试仍把work_item.status当作必填字段，与当前元数据契约冲突');
    expect(ledger).toContain('### ERR-097：V54基线验证器写死无关通过数量49，正确的精确失败集合被再次误判');
    expect(ledger).toContain('### ERR-098：V55封包静态审计全文件禁止49 pass，误伤必须保留的V54失败对账证据');
    expect(ledger).toContain('### ERR-099：V55成功摘要仍使用V52旧常量，报告7文件和ERR-093/094但实际证据为8文件和ERR-093—098');
    expect(ledger).toContain('### ERR-100：V56证据对账函数使用re.findall但验证器没有模块级导入re');
    expect(ledger).toContain('### ERR-101：V57成功摘要的适用经验规则仍使用旧硬编码，遗漏EXP-077与EXP-078');
    expect(ledger).toContain('### ERR-102：V59最终ZIP包含运行时生成的pyc，包内文件与Manifest大小及SHA256不一致');
    expect(ledger).toContain('## EXP-066：解析器回归必须使用真实项目原始格式');
    expect(ledger).toContain('## EXP-067：Markdown标题匹配必须是物理单行语法');
    expect(ledger).toContain('## EXP-068：固定文本测试必须断言正式生产者字段');
    expect(ledger).toContain('## EXP-069：固定文本测试必须明确区分源文本转义与运行时字符');
    expect(ledger).toContain('## EXP-070：非ASCII固定文本不得默认使用String.raw');
    expect(ledger).toContain('## EXP-071：受限状态的只读证据不能通过sf_safe_bash补哈希');
    expect(ledger).toContain('## EXP-072：远程源码调查必须支持固定commit的官方直链回退');
    expect(ledger).toContain('## EXP-073：一手运行日志按语义事实组合验真，不得依赖后加汇总字段');
    expect(ledger).toContain('## EXP-074：基线测试失败必须区分产品回归与测试消费者漂移');
    expect(ledger).toContain('## EXP-075：已知失败验证必须比较失败集合，不得猜测无关pass数量');
    expect(ledger).toContain('## EXP-076：静态审计必须限定语义作用域，不能禁止历史证据中的同名字符串');
    expect(ledger).toContain('## EXP-077：验证结果摘要必须由Manifest和实际集合派生，禁止重复维护范围常量');
    expect(ledger).toContain('## EXP-078：验证器封包前必须执行关键函数，compile不能证明运行时依赖完整');
    expect(ledger).toContain('## EXP-079：prior_failure_reconciliation必须整体从Manifest派生，不能只修正部分字段');
    expect(ledger).toContain('## EXP-080：最终交付ZIP必须排除运行时缓存并在成包后重开核验');
    expect(ledger).toContain('ERR-078=CLOSED_WORKDESK_REAL_RETEST');
    expect(ledger).toContain(
      'ERR-075=CLOSED_V51_WORKDESK_REAL_RETEST'
    );
    expect(ledger).toContain('ERR-088=CLOSED_V51_WORKDESK_REAL_RETEST');
    expect(ledger).toContain('ERR-089=CLOSED_V50_COMMITTED_PUSHED');
    expect(ledger).toContain('ERR-090=CLOSED_V50_COMMITTED_PUSHED');
    expect(ledger).toContain('ERR-091=CLOSED_V50_COMMITTED_PUSHED');
    expect(ledger).toContain('ERR-092=CLOSED_V50_COMMITTED_PUSHED');
    expect(ledger).toContain('ERR-093=CLOSED');
    expect(ledger).toContain('ERR-094=CLOSED_V52_OFFICIAL_SOURCE_FALLBACK');
    expect(ledger).toContain('ERR-095=CLOSED');
    expect(ledger).toContain('ERR-096=CLOSED');
    expect(ledger).toContain('ERR-097=CLOSED');
    expect(ledger).toContain('ERR-098=CLOSED_V55_PACKAGE_PREFLIGHT_CORRECTED');
    expect(ledger).toContain('ERR-099=CLOSED');
    expect(ledger).toContain('ERR-100=CLOSED');
    expect(ledger).toContain('ERR-101=CLOSED');
    expect(ledger).toContain('ERR-102=CLOSED');
    expect(ledger).toContain('### ERR-103：V60已知失败集合解析未剥离Bun耗时后缀，正确ERR-096基线再次被误判');
    expect(ledger).toContain('## EXP-081：测试失败身份必须剥离非语义运行时装饰后再做精确集合比较');
    expect(ledger).toContain('ERR-103=CLOSED');
    expect(ledger).toContain('### ERR-104：V61远程HEAD预检因Windows Git schannel TLS握手失败而停止');
    expect(ledger).toContain('## EXP-082：远程Git TLS环境失败必须保留证据并使用官方独立入口回退');
    expect(ledger).toContain('ERR-104=CLOSED');
    expect(ledger).toContain('### ERR-105：V62封包前py_compile再次生成__pycache__并被Manifest预检阻断');
    expect(ledger).toContain('## EXP-083：封包期Python检查必须以零字节码产生为执行合同');
    expect(ledger).toContain('ERR-105=CLOSED');
    expect(ledger).toContain('### ERR-106：V63用户级验证器把Manifest的files对象误判为列表，成功升级被报告为files=None');
    expect(ledger).toContain('## EXP-084：Manifest集合形状必须由生产者Schema和真实产物确定');
    expect(ledger).toContain('ERR-106=CLOSED');
    expect(ledger).toContain('### ERR-107：V63升级成功后未立即记录动作状态，失败摘要误报REAL_INSTALL_ACTION=NOT_PERFORMED');
    expect(ledger).toContain('## EXP-085：有副作用动作成功后必须立即固化动作事实');
    expect(ledger).toContain('ERR-107=CLOSED');
  });

  it('keeps the WorkDesk evidence and no-second-run boundary exact', () => {
    const handoff = read('docs/implementation/architecture-consistency/current-handoff.md');
    const p0 = read(
      'docs/implementation/architecture-consistency/P0-contract-consumer-closure.md'
    );

    expect(handoff).toContain('## V43真实重验、V44失败与V45边界（2026-08-04）');
    expect(handoff).toContain('## V45唯一测试转义失败与V46边界（2026-08-04）');
    expect(handoff).toContain('## V46唯一String.raw非ASCII失败与V47边界（2026-08-04）');
    expect(handoff).toContain('## V47隔离成功与V48真实应用边界（2026-08-04）');
    expect(handoff).toContain('## V48真实应用成功与V49提交前状态闭包（2026-08-04）');
    expect(handoff).toContain('## V50提交推送闭包与下一阶段边界（2026-08-04）');
    expect(handoff).toContain('## V51用户级升级、WorkDesk重验成功与V52边界（2026-08-04）');
    expect(handoff).toContain('## V52证据消费者假阴性与V53边界（2026-08-05）');
    expect(handoff).toContain('## V53基线测试漂移与V54边界（2026-08-05）');
    expect(handoff).toContain('## V54通过数量硬编码假阴性与V55边界（2026-08-05）');
    expect(handoff).toContain('## V55封包静态审计作用域修正（2026-08-05）');
    expect(handoff).toContain('## V55实际8文件成功与摘要旧常量不一致、V56边界（2026-08-05）');
    expect(handoff).toContain('## V56验证器模块依赖失败与V57边界（2026-08-05）');
    expect(handoff).toContain('## V57实际成功与经验规则摘要遗漏、V58边界（2026-08-05）');
    expect(handoff).toContain('V57_SUMMARY_EXPERIENCE_RULES=EXP-004...EXP-076');
    expect(handoff).toContain('## 新会话接续与验证效率强制规则（2026-08-05）');
    expect(handoff).toContain('同一任务连续出现两个验证器、封包或结果摘要缺陷时');
    expect(handoff).toContain('Manifest单一事实源');
    expect(handoff).toContain('importlib实际加载最终脚本');
    expect(handoff).toContain('用户执行应是最后一步');
    expect(handoff).toContain('不得再次运行WorkDesk Gate');
    expect(handoff).toContain('V59_PACKAGE_INTEGRITY_AUDIT=ERR-102_CLOSED');
    expect(handoff).toContain('V60_FAILED_STAGE=ISOLATED_BASELINE_ERR096');
    expect(handoff).toContain('V60_FAILURE_CLASS=VALIDATOR_DEFECT');
    expect(handoff).toContain('V60_REAL_REPOSITORY_APPLY=NOT_PERFORMED');
    expect(handoff).toContain('V61_FAILED_STAGE=REMOTE_HEAD');
    expect(handoff).toContain('V61_FAILURE_CLASS=ENVIRONMENT_FAILURE');
    expect(handoff).toContain('V61_REAL_REPOSITORY_APPLY=NOT_PERFORMED');
    expect(handoff).toContain('V62_PACKAGE_GENERATION=FAILED');
    expect(handoff).toContain('V62_ERROR_ID=ERR-105');
    expect(handoff).toContain('V63_REMOTE_HEAD_CONTRACT=GIT_DEFAULT_THEN_GIT_OPENSSL_THEN_OFFICIAL_GITHUB_REF_API');
    expect(handoff).toContain('V63_PUSH_CONTRACT=EXPLICIT_FORCE_WITH_LEASE_AND_REMOTE_FACT_RECHECK');
    expect(handoff).toContain('V63_BYTECODE_CONTRACT=ZERO_PYC_AFTER_EVERY_PYTHON_STAGE');
    expect(handoff).toContain('CURRENT_TASK_STATUS=EXECUTION_CONTRACT_FROZEN');
    expect(handoff).toContain('## V63真实提交、用户级升级成功与ERR-106—ERR-107状态闭包（2026-08-05）');
    expect(handoff).toContain('V63_COMMIT_SHA=688cf64c6e190a707f9f0e7306db5cf474f0ae35');
    expect(handoff).toContain('V63_INSTALLER_VERIFY=PASS_119_FILES');
    expect(handoff).toContain('V63_VALIDATOR_EXPECTED_FILES_TYPE=list');
    expect(handoff).toContain('V63_ACTUAL_FILES_TYPE=object');
    expect(handoff).toContain('ERR106_STATUS=CLOSED');
    expect(handoff).toContain('ERR107_STATUS=CLOSED');
    expect(handoff).toContain('V63_USERLEVEL_UPGRADE=CONFIRMED_SUCCESS');
    expect(handoff).toContain('CURRENT_TASK_STATUS=CLOSED');
    expect(handoff).toContain("V56_ERROR=NameError: name 're' is not defined");
    expect(handoff).toContain('V55_TARGET_HASH_COUNT=8');
    expect(handoff).toContain('V55_SUMMARY_PATCH_SCOPE=7_FILES_INCORRECT');
    expect(handoff).toContain('V54_ONLY_MISSING_ASSERTION=49 pass');
    expect(handoff).toContain('V53_STALE_TESTS=2 FAILED');
    expect(handoff).toContain('V52_ONLY_MISSING_ASSERTION=HARD_STOP_ID=HS-1785858808264');
    expect(handoff).toContain('WORKDESK_STATE_AFTER=approval_required');
    expect(handoff).toContain('HARD_STOP_ID=HS-1785858808264');
    expect(handoff).toContain('COMMIT_ACTION=COMMITTED_EXACT_8_FILES');
    expect(handoff).toContain('PUSH_ACTION=PUSHED_MAIN');
    expect(handoff).toContain('WORKDESK_STATE=gates_failed');
    expect(handoff).toContain('CANDIDATE_CONTENT_CHANGED=NO');
    expect(handoff).toContain('INVESTIGATION_GATE_TESTS=3_FAILED');
    expect(handoff).toContain('FIXED_TEXT_CONSUMER_TESTS=2_FAILED');
    expect(handoff).toContain(
      'V45隔离验证、真实应用、提交、用户级升级完成前，不得修改Candidate、回退状态或再次运行Gate'
    );

    expect(p0).toContain('### 25.26 ERR-088—ERR-090真实标题解析与V45边界');
    expect(p0).toContain('### 25.27 ERR-091固定文本转义假阴性与V46边界');
    expect(p0).toContain('### 25.28 ERR-092 String.raw非ASCII运行时差异与V47边界');
    expect(p0).toContain('### 25.29 V47隔离验证成功与V48真实应用边界');
    expect(p0).toContain('### 25.30 V48真实应用成功与V49提交前状态闭包');
    expect(p0).toContain('### 25.31 V50提交推送闭包与用户级升级边界');
    expect(p0).toContain('### 25.32 V51 WorkDesk真实闭环与ERR-093只读证据工具边界');
    expect(p0).toContain('### 25.33 ERR-095一手日志语义证据消费边界');
    expect(p0).toContain('### 25.34 ERR-096 work_item元数据契约测试漂移');
    expect(p0).toContain('### 25.35 ERR-097已知失败集合验证边界');
    expect(p0).toContain('### 25.36 ERR-098静态审计作用域边界');
    expect(p0).toContain('### 25.37 ERR-099结果摘要与实际范围一致性边界');
    expect(p0).toContain('### 25.38 ERR-100验证器运行时依赖完整性边界');
    expect(p0).toContain('### 25.39 ERR-101经验治理摘要原子派生边界');
    expect(p0).toContain('### 25.40 ERR-102最终交付ZIP完整性边界');
    expect(p0).toContain('### 25.41 ERR-103 Bun失败名称运行时装饰解析边界');
    expect(p0).toContain('### 25.42 ERR-104远程HEAD TLS环境回退与安全推送边界');
    expect(p0).toContain('git push --force-with-lease=refs/heads/main:<baseline>');
    expect(p0).toContain('### 25.43 ERR-105封包期Python零字节码边界');
    expect(p0).toContain('### 25.44 ERR-106—ERR-107用户级Manifest Schema与动作证据闭包');
    expect(p0).toContain('specforge-manifest.json files对象精确119项');
    expect(p0).toContain('动作状态与后续验证状态分别报告');
    expect(p0).toContain('语法检查使用内存compile且禁止python -m py_compile');
    expect(p0).toContain('禁止__pycache__和*.pyc');
    expect(p0).toContain('正式Gate=10/10 passed');
    expect(p0).toContain('提交文件=精确8个');
    expect(p0).toContain('标题内部空白全部使用[ \\t]');
    expect(p0).toContain('标题下一行首条证据不得被消费');
  });
});
