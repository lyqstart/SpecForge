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

describe('SpecForge closed-loop governance contract', () => {
  it('defines one canonical pre-change and closed-loop sequence', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    const pre = between(authority, '**GOV-PRE-001：**', '### 2.3 完整闭环');
    const closedLoop = between(authority, '**GOV-CLOSELOOP-001：**', '### 2.4 范围变化');

    for (const token of [
      '目标与逐项完成标准',
      '实际架构和完整 producer-consumer 链',
      '首次偏离点与治理归属',
      '最小完整方案、允许写入范围、测试计划和恢复点',
      'CONFIRMED',
      'INSUFFICIENT_EVIDENCE',
    ]) {
      expect(pre, token).toContain(token);
    }

    for (const token of [
      '业务 / 治理目标',
      'canonical semantic source / Contract / Schema',
      'Producer',
      'Parser / Normalizer',
      'direct Consumer',
      'Gate / Runtime enforcement',
      'downstream Consumer',
      '自动化测试与真实 Producer 回归',
      'GOAL_ID | GUARANTEE | CANONICAL_SOURCE',
      'MODIFICATION_COMPLETE=NO',
    ]) {
      expect(closedLoop, token).toContain(token);
    }
  });

  it('re-freezes scope when the discovered consumer chain grows', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    const scope = between(authority, '**GOV-SCOPE-001：**', '### 2.5 修改后验收');

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
    const post = between(authority, '**GOV-POST-001：**', '### 2.6 Fail closed 与证据');

    for (const token of [
      'POST_CHANGE_GOAL_RECONCILIATION',
      'CANONICAL_SEMANTIC_SOURCE_RECONCILIATION=PASS|FAIL|INSUFFICIENT_EVIDENCE',
      'PRODUCER_RECONCILIATION=PASS|FAIL|INSUFFICIENT_EVIDENCE',
      'PARSER_NORMALIZER_RECONCILIATION=PASS|FAIL|INSUFFICIENT_EVIDENCE',
      'DIRECT_CONSUMER_RECONCILIATION=PASS|FAIL|INSUFFICIENT_EVIDENCE',
      'DOWNSTREAM_CONSUMER_RECONCILIATION=PASS|FAIL|INSUFFICIENT_EVIDENCE',
      'REAL_PRODUCER_REGRESSION=PASS|FAIL|NOT_APPLICABLE|INSUFFICIENT_EVIDENCE',
      'PARALLEL_SEMANTIC_SOURCE_AUDIT=PASS|FAIL|INSUFFICIENT_EVIDENCE',
      'MODIFICATION_COMPLETE=YES|NO',
    ]) {
      expect(post, token).toContain(token);
    }
    expect(post).toContain('普通测试通过不能替代治理目标验收');
  });

  it('loads continuity from AGENTS, Bootstrap and project-status instead of a fixed prompt', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    const continuity = between(authority, '**GOV-CONT-001：**', '### 1.3 执行模式与经验规则');

    for (const token of [
      'AGENTS.md',
      'node scripts/project-session-bootstrap.mjs',
      'REQUIRED_RULES',
      'docs/project-status.md 的 NEXT_LEGAL_ACTION',
      'BOOTSTRAP_STATUS=BLOCKED',
      'fail closed',
    ]) {
      expect(continuity, token).toContain(token);
    }
    expect(authority).not.toContain('SPECFORGE_NEW_SESSION_PROMPT:START');
  });
});
