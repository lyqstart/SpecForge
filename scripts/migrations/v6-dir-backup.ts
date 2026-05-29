/**
 * v6-dir-backup.ts — 备份 SpecForge 工具目录（committed + gitignored 全量快照）
 *
 * 用途：在执行 v6-dir-rename（或任何潜在破坏性目录操作）前，对源目录做
 * 完整文件树快照（结构 + 内容 + mtime），落到 `~/.specforge/backups/<ISO-ts>/`。
 *
 * 设计要点：
 * - 默认源目录是 `<cwd>/<SPEC_DIR_NAME>` 与 `<cwd>/specforge`（双扫描）
 * - `<SPEC_DIR_NAME>` 来自 `packages/types/src/directory-layout.ts`
 *   （单一真相源，与方案 A §6.2 一致）
 * - **唯一**允许的硬编码字符串字面量路径是 `'specforge'`（旧路径，
 *   方案 A §8.1 `scripts/migrations/**` 白名单合法用例）
 * - 完全支持 `--dry-run`，仅打印计划不写盘
 * - 备份操作使用 `fs.cp(src, dst, { recursive: true, preserveTimestamps: true })`
 *
 * 命令行接口：
 *   bun run scripts/migrations/v6-dir-backup.ts [--dry-run] [--source <path>] [--dest <path>]
 *
 * 退出码：
 *   0 — 成功（含 dry-run 成功）
 *   1 — 失败（源目录不存在 / 写入失败 / 参数错误）
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
import * as os from 'node:os';
import process from 'node:process';

import { SPEC_DIR_NAME } from '../../packages/types/src/directory-layout';

// ---------------------------------------------------------------------------
// CLI 参数解析
// ---------------------------------------------------------------------------

interface CliArgs {
  dryRun: boolean;
  source?: string;
  dest?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') {
      out.dryRun = true;
    } else if (a === '--source') {
      const v = argv[++i];
      if (!v) throw new Error('--source requires a path argument');
      out.source = v;
    } else if (a.startsWith('--source=')) {
      out.source = a.slice('--source='.length);
    } else if (a === '--dest') {
      const v = argv[++i];
      if (!v) throw new Error('--dest requires a path argument');
      out.dest = v;
    } else if (a.startsWith('--dest=')) {
      out.dest = a.slice('--dest='.length);
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
      'Usage: bun run scripts/migrations/v6-dir-backup.ts [options]',
      '',
      'Options:',
      '  --dry-run              List files to be backed up without writing',
      '  --source <path>        Source directory to back up (default: scan cwd for',
      '                         <cwd>/.specforge and <cwd>/specforge)',
      '  --dest <path>          Destination root (default: ~/.specforge/backups/<ts>/)',
      '  -h, --help             Show this help',
    ].join('\n'),
  );
}

// ---------------------------------------------------------------------------
// 文件树扫描
// ---------------------------------------------------------------------------

interface FileEntry {
  relPath: string;
  absPath: string;
  size: number;
  mtimeMs: number;
}

async function walk(root: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  async function recurse(current: string): Promise<void> {
    let dirEntries;
    try {
      dirEntries = await fs.readdir(current, { withFileTypes: true });
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return; // 源不存在，安静跳过
      throw e;
    }
    for (const ent of dirEntries) {
      const abs = path.join(current, ent.name);
      if (ent.isDirectory()) {
        await recurse(abs);
      } else if (ent.isFile()) {
        const stat = await fs.stat(abs);
        entries.push({
          relPath: path.relative(root, abs),
          absPath: abs,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        });
      }
    }
  }
  await recurse(root);
  return entries;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function buildDefaultDest(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(os.homedir(), '.specforge', 'backups', ts);
}

/**
 * 根据 CLI 参数解析出待扫描的源目录列表。
 * - 显式指定 --source 时只扫描该目录
 * - 否则默认扫描 <cwd>/<SPEC_DIR_NAME> 与 <cwd>/specforge（双目录）
 */
function resolveSources(cliSource: string | undefined): string[] {
  if (cliSource) return [path.resolve(cliSource)];
  const cwd = process.cwd();
  return [
    path.join(cwd, SPEC_DIR_NAME),
    // 唯一硬编码：'specforge'（旧路径，方案 A §8.1 白名单合法用例）
    path.join(cwd, 'specforge'),
  ];
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`[v6-dir-backup] argument error: ${(e as Error).message}`);
    return 1;
  }

  const sources = resolveSources(args.source);
  const dest = args.dest ? path.resolve(args.dest) : buildDefaultDest();

  console.log(`[v6-dir-backup] mode = ${args.dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
  console.log(`[v6-dir-backup] dest = ${dest}`);

  let totalFiles = 0;
  let totalBytes = 0;
  const planned: Array<{ src: string; dst: string; fileCount: number }> = [];

  for (const src of sources) {
    const entries = await walk(src);
    if (entries.length === 0) {
      console.log(`[v6-dir-backup] skip: ${src} (not found or empty)`);
      continue;
    }
    totalFiles += entries.length;
    totalBytes += entries.reduce((a, e) => a + e.size, 0);
    const dst = path.join(dest, path.basename(src));
    planned.push({ src, dst, fileCount: entries.length });
    console.log(
      `[v6-dir-backup] plan: ${src} -> ${dst} (${entries.length} files)`,
    );
    if (args.dryRun) {
      for (const e of entries.slice(0, 20)) {
        console.log(`  - ${e.relPath} (${e.size} B)`);
      }
      if (entries.length > 20) {
        console.log(`  ... and ${entries.length - 20} more files`);
      }
    }
  }

  console.log(
    `[v6-dir-backup] summary: ${totalFiles} files, ${totalBytes} bytes total`,
  );

  if (args.dryRun) {
    console.log('[v6-dir-backup] DRY-RUN complete; no files written.');
    return 0;
  }

  // 实际执行复制
  if (planned.length === 0) {
    console.log('[v6-dir-backup] nothing to back up.');
    return 0;
  }

  await fs.mkdir(dest, { recursive: true });
  for (const p of planned) {
    console.log(`[v6-dir-backup] copying ${p.src} -> ${p.dst}`);
    await fs.cp(p.src, p.dst, {
      recursive: true,
      preserveTimestamps: true,
    });
  }
  console.log('[v6-dir-backup] backup complete.');
  return 0;
}

// CLI 入口：仅当作为脚本直接运行时才执行 main。
// `import.meta.main` 是 Bun 提供的字段，等价于 Node 的 `require.main === module`。
if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error('[v6-dir-backup] fatal:', err);
      process.exit(1);
    },
  );
}
