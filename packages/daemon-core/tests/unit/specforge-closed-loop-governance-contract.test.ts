import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const authorityPath = resolve(repoRoot, 'docs/design/SpecForge架构一致性治理最终实施方案.md');

function between(text: string, start: string, end: string): string {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex <= startIndex) {
    throw new Error(`invalid structural boundary: ${start} -> ${end}`);
  }
  return text.slice(startIndex, endIndex);
}

function prompt(text: string): string {
  return between(
    text,
    '<!-- SPECFORGE_NEW_SESSION_PROMPT:START -->',
    '<!-- SPECFORGE_NEW_SESSION_PROMPT:END -->',
  );
}

describe('SpecForge closed-loop governance contract', () => {
  it('defines one canonical closed-loop rule in pre-change governance', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    expect(authority.split('**GOV-CLOSELOOP-001：**').length - 1).toBe(1);
    const section = between(authority, '**GOV-CLOSELOOP-001：**', '### 2.3 架构变化必须在同一任务/WI闭环');
    for (const token of [
      '业务 / 治理目标',
      'canonical semantic source / Contract / Schema',
      'Producer',
      'Parser / Normalizer',
      'direct Consumer',
      'Gate / Runtime enforcement',
      'downstream Consumer',
      '具体代码 / Schema / Agent guidance / Template / Doc 落点',
      '真实 Producer 原始输出回归',
      'GOAL_ID | GUARANTEE | CANONICAL_SOURCE',
      'MODIFICATION_COMPLETE=NO',
    ]) {
      expect(section, token).toContain(token);
    }
  });

  it('requires complete preconclusion and re-freezes scope when the chain grows', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    const pre = between(authority, '**GOV-PRE-001：**', '**GOV-CLOSELOOP-001：**');
    for (const token of [
      '最终治理目标（必须可逐项判定 PASS / FAIL）',
      '当前确认根因',
      '完整 producer-consumer 链',
      'canonical semantic source / Contract / Schema',
      '各治理要求的具体实现落点',
      '各治理目标的验证方法',
      '修改后反向验收矩阵',
    ]) {
      expect(pre, token).toContain(token);
    }
    const scope = between(authority, '**GOV-SCOPE-001：**', '### 2.5 修改后治理闭环');
    for (const token of [
      'Producer',
      'Parser / Normalizer',
      'direct Consumer',
      'downstream Consumer',
      'Agent guidance',
      'Template',
      'Test',
      '重新执行 `GOV-PRE-001 + GOV-CLOSELOOP-001`',
      '重新冻结允许范围',
    ]) {
      expect(scope, token).toContain(token);
    }
  });

  it('requires goal-by-goal reverse acceptance after modification', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    const post = between(authority, '**GOV-POST-001：**', '### 2.6 Fail Closed 与证据不足');
    for (const token of [
      'POST_CHANGE_GOAL_RECONCILIATION',
      'CANONICAL_SEMANTIC_SOURCE_RECONCILIATION=PASS|FAIL|INSUFFICIENT_EVIDENCE',
      'PRODUCER_RECONCILIATION=PASS|FAIL|INSUFFICIENT_EVIDENCE',
      'PARSER_NORMALIZER_RECONCILIATION=PASS|FAIL|INSUFFICIENT_EVIDENCE',
      'DIRECT_CONSUMER_RECONCILIATION=PASS|FAIL|INSUFFICIENT_EVIDENCE',
      'DOWNSTREAM_CONSUMER_RECONCILIATION=PASS|FAIL|INSUFFICIENT_EVIDENCE',
      'REAL_PRODUCER_REGRESSION=PASS|FAIL|NOT_APPLICABLE|INSUFFICIENT_EVIDENCE',
      'PARALLEL_SEMANTIC_SOURCE_AUDIT=PASS|FAIL|INSUFFICIENT_EVIDENCE',
      'MODIFICATION_COMPLETE=YES',
      '不能替代治理目标反向验收',
    ]) {
      expect(post, token).toContain(token);
    }
  });

  it('loads closed-loop governance from the fixed new-session prompt and Rule index', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    const fixedPrompt = prompt(authority);
    for (const token of [
      'GOVERNANCE_PRECONCLUSION_CLOSED_LOOP_REQUIRED=YES',
      'GOVERNANCE_CLOSED_LOOP_RULE=GOV-CLOSELOOP-001',
      'GOVERNANCE_CLOSED_LOOP_CHAIN=GOAL>FACTS>ROOT_CAUSE>CANONICAL_SOURCE>PRODUCER>NORMALIZER>DIRECT_CONSUMER>GATE_RUNTIME>DOWNSTREAM_CONSUMER>IMPLEMENTATION_LOCATIONS>TESTS>POST_ACCEPTANCE',
      'GOVERNANCE_PARALLEL_SEMANTIC_SOURCE_ALLOWED=NO',
      'GOVERNANCE_REQUIREMENT_TO_IMPLEMENTATION_MAPPING_REQUIRED=YES',
      'GOVERNANCE_WRITE_SCOPE_FREEZE_REQUIRED=YES',
      'REAL_PRODUCER_REGRESSION_WHEN_APPLICABLE=REQUIRED',
      'POST_CHANGE_GOAL_RECONCILIATION_REQUIRED=YES',
      'ORDINARY_TEST_PASS_SUBSTITUTES_GOVERNANCE_ACCEPTANCE=NO',
      '`GOV-PRE-001 + GOV-CLOSELOOP-001 + GOV-SCOPE-001`',
      '`GOV-POST-001 + GOV-EVID-001`',
    ]) {
      expect(fixedPrompt, token).toContain(token);
    }
    expect(authority.split('| `GOV-CLOSELOOP-001` | 2.2 SpecForge 自身开发：修改前治理 |').length - 1).toBe(1);
  });
});
