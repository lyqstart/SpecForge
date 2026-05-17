#!/usr/bin/env bun
/**
 * sync-task-status — CLI for Kiro task state, workaround for
 * the `task_update` EPERM bug on Windows.
 *
 * Commands:
 *   set <spec> <taskId> <status>         Update a single task.
 *   batch <file.json>                    Apply many updates atomically.
 *   sync <spec> [--from=meta|tasksmd]    Reconcile tasks.md ↔ meta.json.
 *   verify <spec|--all>                  Report drift without writing.
 *   list                                 Summary of all active specs.
 *
 * Status values (public): completed | in_progress | queued | failed | aborted | not_started
 *
 * Exit codes:
 *   0 success
 *   1 bad arguments
 *   2 file not found / spec does not exist
 *   3 data inconsistency / lock timeout
 *
 * schema_version: 1.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { KiroPaths } from './lib/paths';
import {
  readMetaFile,
  setTaskStatus,
  setPbtResult,
  updateMetaFile,
  atomicWriteWindowsSafe,
} from './lib/meta-store';
import {
  findCheckboxLines,
  statusToMark,
  shouldUpgrade,
  syncTasksMd,
} from './lib/checkbox-sync';
import {
  BatchFileSchema,
  PublicStatusSchema,
  PublicStatus,
  PbtPublicStatusSchema,
  publicToInternal,
  internalToPublic,
  ExecutionStatus,
} from './lib/types';

const REPO_ROOT = process.cwd();
const paths = new KiroPaths(REPO_ROOT);

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'set':
      return cmdSet(rest);
    case 'set-pbt':
      return cmdSetPbt(rest);
    case 'batch':
      return cmdBatch(rest);
    case 'sync':
      return cmdSync(rest);
    case 'verify':
      return cmdVerify(rest);
    case 'list':
      return cmdList();
    case '-h':
    case '--help':
    case undefined:
      printHelp();
      return cmd === undefined ? 1 : 0;
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      return 1;
  }
}

// ---------------------------------------------------------------------------
// set
// ---------------------------------------------------------------------------

async function cmdSet(args: string[]): Promise<number> {
  if (args.length < 3) {
    console.error('Usage: set <spec> <taskId> <status>');
    return 1;
  }
  const [spec, taskId, statusRaw] = args as [string, string, string];
  const statusResult = PublicStatusSchema.safeParse(statusRaw);
  if (!statusResult.success) {
    console.error(`Invalid status "${statusRaw}". Allowed: ${PublicStatusSchema.options.join(', ')}`);
    return 1;
  }
  const status = statusResult.data;

  const ws = await paths.findWorkspace();
  const metaPath = paths.metaPathFor(ws, spec);
  const tasksMdPath = paths.tasksMdPathFor(spec);

  try {
    await fs.access(tasksMdPath);
  } catch {
    console.error(`Spec not found: ${tasksMdPath}`);
    return 2;
  }

  const executionStatus = publicToInternal(status);
  const specUri = pathToFileURL(tasksMdPath).toString();
  const fullTaskId = await resolveFullTaskId(spec, taskId);

  await setTaskStatus(metaPath, fullTaskId, {
    taskId: fullTaskId,
    specUri,
    executionStatus,
  });

  const mark = statusToMark(executionStatus);
  // `set` is explicit user intent: always sync the checkbox, even downward.
  const changed = await syncTasksMd(
    tasksMdPath,
    new Map([[fullTaskId, mark]]),
  );

  console.log(
    `ok  spec=${spec}  task="${fullTaskId}"  status=${status}  checkbox=${mark}  tasks.md lines changed=${changed}`,
  );
  return 0;
}

// ---------------------------------------------------------------------------
// set-pbt — write PBT result to <repo>/.kiro/specs/<spec>/tasks.meta.json
// Bypasses Kiro's `update_pbt_status` tool, which fails with EPERM on
// Windows because the VS Code extension host watcher holds the file
// handle. Writes in Kiro's exact shape so the UI still picks up the
// result.
// ---------------------------------------------------------------------------

async function cmdSetPbt(args: string[]): Promise<number> {
  if (args.length < 3) {
    console.error(
      'Usage: set-pbt <spec> <taskId> <status> [--failing=<example>]\n' +
        '  status: passed | failed | unexpected_pass',
    );
    return 1;
  }
  const [spec, taskId, statusRaw] = args as [string, string, string];
  const statusResult = PbtPublicStatusSchema.safeParse(statusRaw);
  if (!statusResult.success) {
    console.error(
      `Invalid PBT status "${statusRaw}". Allowed: ${PbtPublicStatusSchema.options.join(', ')}`,
    );
    return 1;
  }
  const status = statusResult.data;

  const failingFlag = args.find((a) => a.startsWith('--failing='));
  const failingExample = failingFlag ? failingFlag.slice('--failing='.length) : undefined;

  const tasksMdPath = paths.tasksMdPathFor(spec);
  try {
    await fs.access(tasksMdPath);
  } catch {
    console.error(`Spec not found: ${tasksMdPath}`);
    return 2;
  }

  const tasksMetaPath = paths.tasksMetaPathFor(spec);
  const fullTaskId = await resolveFullTaskId(spec, taskId);

  await setPbtResult(tasksMetaPath, fullTaskId, { status, failingExample });

  console.log(
    `ok  spec=${spec}  task="${fullTaskId}"  pbt=${status}${failingExample ? `  failingExample=yes` : ''}  file=${path.relative(REPO_ROOT, tasksMetaPath)}`,
  );
  return 0;
}

// ---------------------------------------------------------------------------
// batch
// ---------------------------------------------------------------------------

async function cmdBatch(args: string[]): Promise<number> {
  if (args.length < 1) {
    console.error('Usage: batch <file.json>');
    return 1;
  }
  const [file] = args as [string];
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf-8');
  } catch (err: any) {
    console.error(`Cannot read batch file ${file}: ${err.message}`);
    return 2;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    console.error(`Batch file is not valid JSON: ${err.message}`);
    return 1;
  }
  const batch = BatchFileSchema.safeParse(parsed);
  if (!batch.success) {
    console.error(`Batch file schema invalid:\n${batch.error.message}`);
    return 1;
  }

  const ws = await paths.findWorkspace();

  // Group by spec so we only take each lock once.
  const bySpec = new Map<string, { taskId: string; status: PublicStatus }[]>();
  for (const entry of batch.data.entries) {
    const arr = bySpec.get(entry.spec) ?? [];
    arr.push({ taskId: entry.taskId, status: entry.status });
    bySpec.set(entry.spec, arr);
  }

  let ok = 0;
  let failed = 0;
  for (const [spec, items] of bySpec) {
    const metaPath = paths.metaPathFor(ws, spec);
    const tasksMdPath = paths.tasksMdPathFor(spec);
    try {
      await fs.access(tasksMdPath);
    } catch {
      console.error(`spec not found: ${tasksMdPath}`);
      failed += items.length;
      continue;
    }
    const specUri = pathToFileURL(tasksMdPath).toString();

    // Resolve abbreviated task ids (e.g. "4.3" → full id) up front.
    const resolved: { fullId: string; status: PublicStatus }[] = [];
    for (const { taskId, status } of items) {
      resolved.push({
        fullId: await resolveFullTaskId(spec, taskId),
        status,
      });
    }

    await updateMetaFile(metaPath, (current) => {
      const now = Date.now();
      const tasks = { ...current.tasks };
      for (const { fullId, status } of resolved) {
        const executionStatus = publicToInternal(status);
        const existing = tasks[fullId];
        tasks[fullId] = {
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          taskId: fullId,
          specUri,
          executionHistory: existing?.executionHistory ?? [],
          executionStatus,
        };
      }
      return { tasks };
    });

    const checkboxUpdates = new Map<string, ReturnType<typeof statusToMark>>();
    for (const { fullId, status } of resolved) {
      checkboxUpdates.set(fullId, statusToMark(publicToInternal(status)));
    }
    const changed = await syncTasksMd(tasksMdPath, checkboxUpdates);

    ok += resolved.length;
    console.log(`ok  spec=${spec}  updated=${resolved.length}  tasks.md lines changed=${changed}`);
  }

  if (failed > 0) {
    console.error(`done with errors: ok=${ok} failed=${failed}`);
    return 3;
  }
  console.log(`done: ok=${ok}`);
  return 0;
}

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------

async function cmdSync(args: string[]): Promise<number> {
  if (args.length < 1) {
    console.error(
      'Usage: sync <spec|--all> [--from=meta|tasksmd] [--apply] [--force]\n' +
        '  --force   allow demoting [x] back to [-] or [ ] when meta disagrees',
    );
    return 1;
  }
  const target = args[0]!;
  const from = (args.find((a) => a.startsWith('--from='))?.slice('--from='.length) ?? 'meta') as
    | 'meta'
    | 'tasksmd';
  const apply = args.includes('--apply');
  const force = args.includes('--force');

  const ws = await paths.findWorkspace();
  const specs = target === '--all' ? await paths.listActiveSpecs() : [target];

  let totalChanged = 0;
  for (const spec of specs) {
    const metaPath = paths.metaPathFor(ws, spec);
    const tasksMdPath = paths.tasksMdPathFor(spec);
    try {
      await fs.access(tasksMdPath);
    } catch {
      console.log(`skip ${spec}: no tasks.md`);
      continue;
    }
    const meta = await readMetaFile(metaPath);
    const mdRaw = await fs.readFile(tasksMdPath, 'utf-8');
    const mdLines = findCheckboxLines(mdRaw);

    if (from === 'meta') {
      // meta.json → tasks.md checkbox
      const updates = new Map<string, ReturnType<typeof statusToMark>>();
      for (const line of mdLines) {
        const fullId = await resolveFullTaskId(spec, line.taskPrefix);
        const entry = meta.tasks[fullId];
        const desired = statusToMark(entry?.executionStatus);
        if (line.mark === desired) continue;
        if (!force && !shouldUpgrade(line.mark, desired)) continue;
        updates.set(fullId, desired);
      }
      if (apply) {
        const n = await syncTasksMd(tasksMdPath, updates);
        totalChanged += n;
        console.log(`sync ${spec}: meta → tasks.md  changed=${n}  (force=${force})`);
      } else {
        console.log(
          `[dry] sync ${spec}: meta → tasks.md would-change=${updates.size}  (force=${force})`,
        );
      }
    } else {
      // tasks.md → meta.json (less common, but useful when manually checking a box)
      if (!apply) {
        let drift = 0;
        for (const line of mdLines) {
          const fullId = await resolveFullTaskId(spec, line.taskPrefix);
          const entry = meta.tasks[fullId];
          const mark = statusToMark(entry?.executionStatus);
          if (mark !== line.mark) drift++;
        }
        console.log(`[dry] sync ${spec}: tasks.md → meta would-change=${drift}`);
      } else {
        const specUri = pathToFileURL(tasksMdPath).toString();
        let specChanged = 0;
        await updateMetaFile(metaPath, (current) => {
          const now = Date.now();
          const tasks = { ...current.tasks };
          specChanged = 0;
          for (const line of mdLines) {
            const fullId = findFullIdForPrefix(
              tasks,
              line.taskPrefix,
              line.taskPrefix + line.textAfter,
            );
            const markToStatus = (m: string): ExecutionStatus | undefined =>
              m === 'x' ? 'succeed' : m === '-' ? 'running' : undefined;
            const existing = tasks[fullId];
            const next: ExecutionStatus | undefined = markToStatus(line.mark);
            if ((existing?.executionStatus ?? undefined) === next) continue;
            tasks[fullId] = {
              createdAt: existing?.createdAt ?? now,
              updatedAt: now,
              taskId: fullId,
              specUri,
              executionHistory: existing?.executionHistory ?? [],
              executionStatus: next,
            };
            specChanged++;
          }
          return { tasks };
        });
        totalChanged += specChanged;
        console.log(`sync ${spec}: tasks.md → meta  changed=${specChanged}`);
      }
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

async function cmdVerify(args: string[]): Promise<number> {
  const target = args[0] ?? '--all';
  const ws = await paths.findWorkspace();
  const specs = target === '--all' ? await paths.listActiveSpecs() : [target];

  let drift = 0;
  let upgradable = 0;
  for (const spec of specs) {
    const metaPath = paths.metaPathFor(ws, spec);
    const tasksMdPath = paths.tasksMdPathFor(spec);
    try {
      await fs.access(tasksMdPath);
    } catch {
      continue;
    }
    const meta = await readMetaFile(metaPath);
    const mdRaw = await fs.readFile(tasksMdPath, 'utf-8');
    const mdLines = findCheckboxLines(mdRaw);

    for (const line of mdLines) {
      const fullId = await resolveFullTaskId(spec, line.taskPrefix);
      const entry = meta.tasks[fullId];
      const desired = statusToMark(entry?.executionStatus);
      if (desired === line.mark) continue;
      drift++;
      const upgrade = shouldUpgrade(line.mark, desired);
      if (upgrade) upgradable++;
      const tag = upgrade ? 'upgrade' : 'mismatch';
      console.log(
        `${tag.padEnd(9)} ${spec}  task=${line.taskPrefix}  meta=${internalToPublic(entry?.executionStatus)}  checkbox=[${line.mark}]  expected=[${desired}]`,
      );
    }
  }
  console.log(`drift total=${drift}  upgradable=${upgradable}  mismatch=${drift - upgradable}`);
  return drift === 0 ? 0 : 3;
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

async function cmdList(): Promise<number> {
  const ws = await paths.findWorkspace();
  const specs = await paths.listActiveSpecs();
  console.log(`workspace hash: ${ws.hash}`);
  console.log(`tasks dir:      ${ws.tasksDir}`);
  console.log('');
  console.log('spec                         total  done  running  queued  failed  none');
  for (const spec of specs) {
    const metaPath = paths.metaPathFor(ws, spec);
    const meta = await readMetaFile(metaPath);
    const entries = Object.values(meta.tasks);
    const buckets = { done: 0, running: 0, queued: 0, failed: 0, none: 0 };
    for (const e of entries) {
      switch (e.executionStatus) {
        case 'succeed':
          buckets.done++;
          break;
        case 'running':
          buckets.running++;
          break;
        case 'queued':
          buckets.queued++;
          break;
        case 'failed':
        case 'aborted':
          buckets.failed++;
          break;
        default:
          buckets.none++;
      }
    }
    console.log(
      `${spec.padEnd(28)} ${String(entries.length).padStart(5)}  ${String(buckets.done).padStart(4)}  ${String(buckets.running).padStart(7)}  ${String(buckets.queued).padStart(6)}  ${String(buckets.failed).padStart(6)}  ${String(buckets.none).padStart(4)}`,
    );
  }
  return 0;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Task ids in Kiro meta files include the full text (e.g.
 * "4.3 Implement event schema" or "2. 实现架构文档静态 lint 规则").
 * Users prefer to pass the short prefix ("4.3" or "2"). This helper
 * promotes a short prefix by matching it against the first line of
 * the matching `- [ ] N.M ...` in tasks.md.
 *
 * If the input already looks like a full id, returns it unchanged.
 */
async function resolveFullTaskId(spec: string, input: string): Promise<string> {
  // If input has a space, assume it is already full.
  if (/\s/.test(input)) return input;
  const normalisedInput = input.replace(/\.+$/, '');
  const tasksMdPath = paths.tasksMdPathFor(spec);
  const mdRaw = await fs.readFile(tasksMdPath, 'utf-8').catch(() => '');
  const lines = findCheckboxLines(mdRaw);
  for (const line of lines) {
    if (line.taskPrefix === normalisedInput) {
      // Reconstruct the id exactly as it appears in tasks.md so the
      // key matches whatever Kiro wrote into meta.json.
      const text = line.textAfter;
      const raw = `${line.taskPrefix}${text}`.trimEnd();
      // textAfter in our parser includes the trailing dot + the tail
      // (e.g. ". 实现..."). Strip the leading space from the tail for
      // a clean join.
      const normalised = raw.replace(/\s+/g, ' ').trim();
      return normalised || input;
    }
  }
  // Last resort: input as-is.
  return input;
}

function findFullIdForPrefix(
  tasks: Record<string, unknown>,
  prefix: string,
  fallback: string,
): string {
  for (const key of Object.keys(tasks)) {
    if (key === prefix || key.startsWith(prefix + ' ')) return key;
  }
  return fallback;
}

function printHelp(): void {
  console.log(`sync-task-status — Kiro task state CLI

Commands:
  set     <spec> <taskId> <status>      Update a single task status.
  set-pbt <spec> <taskId> <pbt-status> [--failing=<example>]
                                        Record a property-based-test result.
                                        pbt-status: passed | failed | unexpected_pass
  batch   <file.json>                   Apply many updates. File: { "entries": [{spec,taskId,status},...] }
  sync    <spec|--all> [--from=meta|tasksmd] [--apply]
                                        Reconcile meta.json ↔ tasks.md. Dry-run unless --apply.
  verify  <spec|--all>                  Report drift (exit 3 if drift).
  list                                  Summary of all active specs.

Statuses (for set/batch): completed | in_progress | queued | failed | aborted | not_started

Examples:
  bun run scripts/sync-task-status.ts set daemon-core 4.3 completed
  bun run scripts/sync-task-status.ts set-pbt configuration 5.1 passed
  bun run scripts/sync-task-status.ts set-pbt daemon-core 4.2 failed --failing="seed=42 n=7"
  bun run scripts/sync-task-status.ts sync --all --from=meta --apply
  bun run scripts/sync-task-status.ts list
`);
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('fatal:', err?.stack ?? err);
    process.exit(1);
  });
