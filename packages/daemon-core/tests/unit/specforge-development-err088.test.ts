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

describe('ERR-088—ERR-092 real title and validation regression governance', () => {
  it('records every V43—V46 failure and its class-level prevention', () => {
    const ledger = read('docs/rule/specforge-development-error-ledger-and-experience.md');

    expect(ledger).toContain('### ERR-088：共享章节匹配器只支持直接括号后缀');
    expect(ledger).toContain('### ERR-089：V44标题后缀正则使用跨行空白');
    expect(ledger).toContain('### ERR-090：V44两个固定文本测试未与最终状态生产者原子同步');
    expect(ledger).toContain('### ERR-091：固定文本测试把字面量反斜杠t解释为真实制表符');
    expect(ledger).toContain('### ERR-092：Bun测试环境中的String.raw把中文模板内容暴露为Unicode转义字面量');
    expect(ledger).toContain('## EXP-066：解析器回归必须使用真实项目原始格式');
    expect(ledger).toContain('## EXP-067：Markdown标题匹配必须是物理单行语法');
    expect(ledger).toContain('## EXP-068：固定文本测试必须断言正式生产者字段');
    expect(ledger).toContain('## EXP-069：固定文本测试必须明确区分源文本转义与运行时字符');
    expect(ledger).toContain('## EXP-070：非ASCII固定文本不得默认使用String.raw');
    expect(ledger).toContain('ERR-078=CLOSED_WORKDESK_REAL_RETEST');
    expect(ledger).toContain(
      'ERR-075=FIXED_V50_COMMITTED_PUSHED_PENDING_USERLEVEL_UPGRADE_WORKDESK_RETEST'
    );
    expect(ledger).toContain('ERR-088=FIXED_V50_COMMITTED_PUSHED_PENDING_USERLEVEL_UPGRADE_WORKDESK_RETEST');
    expect(ledger).toContain('ERR-089=CLOSED_V50_COMMITTED_PUSHED');
    expect(ledger).toContain('ERR-090=CLOSED_V50_COMMITTED_PUSHED');
    expect(ledger).toContain('ERR-091=CLOSED_V50_COMMITTED_PUSHED');
    expect(ledger).toContain('ERR-092=CLOSED_V50_COMMITTED_PUSHED');
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
    expect(p0).toContain('提交文件=精确8个');
    expect(p0).toContain('标题内部空白全部使用[ \\t]');
    expect(p0).toContain('标题下一行首条证据不得被消费');
  });
});
