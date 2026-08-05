import { spawnSync } from 'node:child_process';
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

describe('ERR-125—ERR-126 build output and generated workflow documentation governance', () => {
  it('records both failures and their class-level prevention rules', () => {
    const ledger = read('docs/rule/specforge-development-error-ledger-and-experience.md');
    const handoff = read('docs/implementation/architecture-consistency/current-handoff.md');
    const p0 = read('docs/implementation/architecture-consistency/P0-contract-consumer-closure.md');

    expect(ledger).toContain('### ERR-125：V74全仓构建生成范围外Skill，但验证器在提交前未执行完整修改集合审计');
    expect(ledger).toContain('## EXP-102：每个有文件副作用的验证动作后必须立即重算精确修改集合');
    expect(ledger).toContain('### ERR-126：architecture-change自动生成阶段矩阵与workflow JSON不同步');
    expect(ledger).toContain('## EXP-103：自动生成区段只能由正式源定义生成，提交前必须执行只读一致性检查');
    expect(ledger).toContain('ERR-125=CLOSED');
    expect(ledger).toContain('ERR-126=CLOSED');

    expect(handoff).toContain('## V74真实提交部署、最终状态失败与V75构建生成物闭包（2026-08-05）');
    expect(handoff).toContain('V74_COMMIT_SHA=58d507821d2ae78c8a77b2b949514086ce1f7510');
    expect(handoff).toContain('NEXT_ACTION=RESTART_DAEMON_OPENCODE_AND_RESUME_EXISTING_WI0001_GATE_ONCE_AFTER_V75_SUCCESS');

    expect(p0).toContain('### 25.60 V74真实部署与ERR-125—ERR-126构建生成物闭包');
    expect(p0).toContain('V75_PRODUCT_RUNTIME_CHANGE=NONE');
    expect(p0).toContain('V75_WI0001_ACTION=NONE');
  });

  it('keeps the architecture-change generated blocks synchronized with workflow JSON', () => {
    const skill = read('setup/userlevel-opencode/skills/sf-workflow-architecture-change/SKILL.md');

    expect(skill).toContain(
      '| candidate_preparing | sf-design | — | tasks.md,trace_delta.md,candidate_manifest.json |'
    );
    expect(skill).not.toContain(
      '| candidate_preparing | sf-design + sf-task-planner + Runtime |'
    );

    const result = spawnSync(
      process.execPath,
      ['scripts/render-workflow-docs.ts', '--check'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, BUN_DISABLE_TRANSPILER_CACHE: '1' },
      }
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain('MISMATCH:');
  });
});
