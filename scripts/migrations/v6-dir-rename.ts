/**
 * v6-dir-rename.ts — 将项目根下旧 `specforge/` 目录重命名为 `.specforge/`
 *
 * 用途：执行从无点 `specforge/` 到带点 `.specforge/`（ADR-006 决策）的
 * 物理目录重命名。**默认先调用 v6-dir-backup 做全量快照**，再做 rename。
 *
 * 设计要点：
 * - 目标命名 `.specforge` 来自 `packages/types/src/directory-layout.ts`
 *   的 `SPEC_DIR_NAME`（单一真相源，不在此处硬编码带点形式）
 * - **唯一**允许的硬编码字符串字面量路径是 `'specforge'`（旧路径，
 *   方案 A §8.1 `scripts/migrations/**` 白名单合法用例）
 * - 完全支持 `--dry-run`，仅打印计划不写盘
 * - 默认行为：dry-run 模式下先调用 backup 的 dry-run；execute 模式下先
 *   实际执行 backup，再 rename（可通过 `--skip-backup` 解耦）
 *
 * 命令行接口：
 *   bun run scripts/migrations/v6-dir-rename.ts [--dry-run] [--skip-backup]
 *                                               [--project <path>]
 *
 * 退出码：
 *   0 — 成功（含 dry-run 成功；目标目录已存在且源不存在视为已迁移，也返回 0）
 *   1 — 失败（源与目标都不存在 / rename 失败 / 参数错误）
 *
 * P0 阶段承诺：本脚本在 P0 阶段不被实际执行（仅 dry-run 验证可调用），
 * 首次执行发生在 P1 数据迁移任务中。
 *
 * 关联：
 * - refactor_plan.md T5
 * - 方案 A §6.4（迁移与回滚策略）
 * - ADR-006（docs/adr/ADR-006-specforge-dir-naming.md）
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import process from 'node:process';

import { SPEC_DIR_NAME } from '../../packages/types/src/directory-layout';
import { main as backupMain } from './v6-dir-backup';

// ---------------------------------------------------------------------------
// CLI 参数解析
// ---------------------------------------------------------------------------

interface CliArgs {
  dryRun: boolean;
  skipBackup: boolean;
  project: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    dryRun: false,
    skipBackup: false,
    project: process.cwd(),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') {
      out.dryRun = true;
    } else if (a === '--skip-backup') {
      out.skipBackup = true;
    } else if (a === '--project') {
      const v = argv[++i];
      if (!v) throw new Error('--project requires a path argument');
      out.project = path.resolve(v);
    } else if (a.startsWith('--project=')) {
      out.project = path.resolve(a.slice('--project='.length));
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return out;
}

function printHelp(): void {
  console.log(
    [
      'Usage: bun run scripts/migrations/v6-dir-rename.ts [options]',
      '',
      'Options:',
      '  --dry-run              Print rename plan without modifying disk',
      '  --skip-backup          Skip the implicit backup step (assumes already backed up)',
      '  --project <path>       Project root (default: current working dir)',
      '  -h, --help             Show this help',
    ].join('\n'),
  );
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

interface RenamePlan {
  src: string;
  dst: string;
  srcExists: boolean;
  dstExists: boolean;
  action: 'rename' | 'skip-already-migrated' | 'skip-no-source' | 'conflict';
  reason: string;
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return false;
    throw e;
  }
}

async function buildPlan(projectRoot: string): Promise<RenamePlan> {
  // 唯一硬编码：'specforge'（旧路径，方案 A §8.1 白名单合法用例）
  const src = path.join(projectRoot, 'specforge');
  const dst = path.join(projectRoot, SPEC_DIR_NAME);

  const srcExists = await dirExists(src);
  const dstExists = await dirExists(dst);

  let action: RenamePlan['action'];
  let reason: string;
  if (srcExists && !dstExists) {
    action = 'rename';
    reason = 'source exists, destination does not — safe to rename';
  } else if (!srcExists && dstExists) {
    action = 'skip-already-migrated';
    reason = 'destination already exists and source is gone — already migrated';
  } else if (!srcExists && !dstExists) {
    action = 'skip-no-source';
    reason = 'neither source nor destination exists — nothing to do';
  } else {
    action = 'conflict';
    reason =
      'both source and destination exist — manual merge required, refusing to overwrite';
  }
  return { src, dst, srcExists, dstExists, action, reason };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`[v6-dir-rename] argument error: ${(e as Error).message}`);
    return 1;
  }

  console.log(`[v6-dir-rename] mode    = ${args.dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
  console.log(`[v6-dir-rename] project = ${args.project}`);
  console.log(`[v6-dir-rename] target  = ${SPEC_DIR_NAME}`);

  const plan = await buildPlan(args.project);
  console.log(`[v6-dir-rename] plan:`);
  console.log(`  src        = ${plan.src} (exists=${plan.srcExists})`);
  console.log(`  dst        = ${plan.dst} (exists=${plan.dstExists})`);
  console.log(`  action     = ${plan.action}`);
  console.log(`  reason     = ${plan.reason}`);

  if (plan.action === 'conflict') {
    console.error('[v6-dir-rename] CONFLICT — refusing to overwrite. Aborting.');
    return 1;
  }

  if (plan.action !== 'rename') {
    console.log('[v6-dir-rename] nothing to rename.');
    return 0;
  }

  // 备份步骤：dry-run 模式下做 dry-run 备份；execute 模式下做实际备份。
  if (!args.skipBackup) {
    const backupArgs: string[] = ['--source', plan.src];
    if (args.dryRun) backupArgs.push('--dry-run');
    console.log(
      `[v6-dir-rename] invoking backup: v6-dir-backup ${backupArgs.join(' ')}`,
    );
    const backupCode = await backupMain(backupArgs);
    if (backupCode !== 0) {
      console.error(
        `[v6-dir-rename] backup failed (exit=${backupCode}); aborting rename.`,
      );
      return backupCode;
    }
  } else {
    console.log('[v6-dir-rename] --skip-backup: skipping backup step');
  }

  if (args.dryRun) {
    console.log(`[v6-dir-rename] DRY-RUN: would rename ${plan.src} -> ${plan.dst}`);
    console.log('[v6-dir-rename] DRY-RUN complete; no changes on disk.');
    return 0;
  }

  // 实际执行 rename
  console.log(`[v6-dir-rename] renaming ${plan.src} -> ${plan.dst}`);
  await fs.rename(plan.src, plan.dst);
  console.log('[v6-dir-rename] rename complete.');
  return 0;
}

// CLI 入口：仅当作为脚本直接运行时才执行 main。
if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error('[v6-dir-rename] fatal:', err);
      process.exit(1);
    },
  );
}
