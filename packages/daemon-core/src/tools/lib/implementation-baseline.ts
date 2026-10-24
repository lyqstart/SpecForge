import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

export const IMPLEMENTATION_BASELINE_FILENAME = 'implementation_baseline.json';

export type ImplementationBaselineFile = {
  path: string;
  size: number;
  sha256: string;
};

export type ImplementationBaselineEntry = {
  scope_path: string;
  scope_kind: 'file' | 'directory' | 'glob';
  matched_files: ImplementationBaselineFile[];
};

export type ImplementationBaseline = {
  schema_version: '1.0';
  work_item_id: string;
  captured_at: string;
  snapshot_id: string;
  planned_code_paths: string[];
  current_file_count: number;
  all_planned_paths_missing: boolean;
  entries: ImplementationBaselineEntry[];
};

export type ImplementationBaselineWrite = {
  path: string;
  baseline: ImplementationBaseline;
  previous_text: string | null;
};

export type ImplementationTruthValidation = {
  valid: boolean;
  errors: string[];
  input_files: string[];
  baseline?: ImplementationBaseline;
};

function digest(bytes: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function normalizeRelativeScope(value: unknown): string {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
  if (
    !normalized ||
    path.isAbsolute(normalized) ||
    normalized.split('/').includes('..') ||
    normalized === SPEC_DIR_NAME ||
    normalized.startsWith(`${SPEC_DIR_NAME}/`) ||
    normalized === '.git' ||
    normalized.startsWith('.git/')
  ) {
    throw new Error(`IMPLEMENTATION_BASELINE_SCOPE_INVALID: ${String(value ?? '')}`);
  }
  return normalized;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegex(pattern: string): RegExp {
  let expression = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        index += 1;
        expression += '.*';
      } else {
        expression += '[^/]*';
      }
    } else if (char === '?') {
      expression += '[^/]';
    } else {
      expression += escapeRegex(char);
    }
  }
  return new RegExp(`${expression}$`);
}

function stablePayload(input: {
  work_item_id: string;
  planned_code_paths: string[];
  entries: ImplementationBaselineEntry[];
}): string {
  return JSON.stringify({
    schema_version: '1.0',
    work_item_id: input.work_item_id,
    planned_code_paths: input.planned_code_paths,
    entries: input.entries,
  });
}

async function readTriggerPlannedCodePaths(
  projectRoot: string,
  workItemId: string,
): Promise<string[]> {
  const triggerPath = path.join(
    projectRoot,
    SPEC_DIR_NAME,
    'work-items',
    workItemId,
    'trigger_result.json',
  );
  let parsed: any;
  try {
    parsed = JSON.parse(await fs.readFile(triggerPath, 'utf-8'));
  } catch (error) {
    throw new Error(
      `IMPLEMENTATION_BASELINE_TRIGGER_UNAVAILABLE: ${triggerPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const raw = parsed?.impact_scope?.planned_code_paths ?? parsed?.impact_summary?.planned_code_paths;
  if (!Array.isArray(raw)) {
    throw new Error('IMPLEMENTATION_BASELINE_SCOPE_MISSING: trigger_result.impact_scope.planned_code_paths');
  }
  return Array.from(new Set(raw.map(normalizeRelativeScope))).sort();
}

async function walkFiles(root: string, projectRoot: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (
      entry.isDirectory() &&
      ['.git', SPEC_DIR_NAME, 'node_modules'].includes(entry.name)
    ) {
      continue;
    }
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(absolute, projectRoot));
    else if (entry.isFile()) files.push(path.relative(projectRoot, absolute).replace(/\\/g, '/'));
  }
  return files;
}

async function matchingFiles(projectRoot: string, scopePath: string): Promise<{
  scopeKind: ImplementationBaselineEntry['scope_kind'];
  paths: string[];
}> {
  const hasGlob = /[*?]/.test(scopePath);
  const scopeKind: ImplementationBaselineEntry['scope_kind'] = hasGlob
    ? 'glob'
    : scopePath.endsWith('/')
      ? 'directory'
      : 'file';
  if (!hasGlob) {
    const absolute = path.resolve(projectRoot, scopePath);
    if (!absolute.startsWith(`${path.resolve(projectRoot)}${path.sep}`)) {
      throw new Error(`IMPLEMENTATION_BASELINE_SCOPE_ESCAPES_PROJECT: ${scopePath}`);
    }
    try {
      const stat = await fs.stat(absolute);
      if (stat.isFile()) return { scopeKind: 'file', paths: [scopePath.replace(/\/$/, '')] };
      if (stat.isDirectory()) {
        return {
          scopeKind: 'directory',
          paths: (await walkFiles(absolute, projectRoot)).sort(),
        };
      }
      return { scopeKind, paths: [] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { scopeKind, paths: [] };
      throw error;
    }
  }

  const wildcardAt = scopePath.search(/[*?]/);
  const prefix = scopePath.slice(0, wildcardAt);
  const rootPrefix = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/') + 1) : '';
  const searchRoot = path.resolve(projectRoot, rootPrefix || '.');
  if (
    searchRoot !== path.resolve(projectRoot) &&
    !searchRoot.startsWith(`${path.resolve(projectRoot)}${path.sep}`)
  ) {
    throw new Error(`IMPLEMENTATION_BASELINE_SCOPE_ESCAPES_PROJECT: ${scopePath}`);
  }
  const matcher = globToRegex(scopePath);
  const paths = (await walkFiles(searchRoot, projectRoot))
    .filter(candidate => matcher.test(candidate))
    .sort();
  return { scopeKind, paths };
}

export async function captureImplementationBaseline(
  projectRoot: string,
  workItemId: string,
): Promise<ImplementationBaseline> {
  const plannedCodePaths = await readTriggerPlannedCodePaths(projectRoot, workItemId);
  const entries: ImplementationBaselineEntry[] = [];
  for (const scopePath of plannedCodePaths) {
    const matches = await matchingFiles(projectRoot, scopePath);
    const matchedFiles: ImplementationBaselineFile[] = [];
    for (const relativePath of matches.paths) {
      const bytes = await fs.readFile(path.join(projectRoot, relativePath));
      matchedFiles.push({
        path: relativePath,
        size: bytes.byteLength,
        sha256: digest(bytes),
      });
    }
    entries.push({
      scope_path: scopePath,
      scope_kind: matches.scopeKind,
      matched_files: matchedFiles,
    });
  }
  const payload = { work_item_id: workItemId, planned_code_paths: plannedCodePaths, entries };
  const currentFileCount = new Set(entries.flatMap(entry => entry.matched_files.map(file => file.path))).size;
  return {
    schema_version: '1.0',
    work_item_id: workItemId,
    captured_at: new Date().toISOString(),
    snapshot_id: digest(stablePayload(payload)),
    planned_code_paths: plannedCodePaths,
    current_file_count: currentFileCount,
    all_planned_paths_missing: currentFileCount === 0,
    entries,
  };
}

export async function materializeImplementationBaseline(
  projectRoot: string,
  workItemId: string,
): Promise<ImplementationBaselineWrite> {
  const baseline = await captureImplementationBaseline(projectRoot, workItemId);
  const baselinePath = path.join(
    projectRoot,
    SPEC_DIR_NAME,
    'work-items',
    workItemId,
    IMPLEMENTATION_BASELINE_FILENAME,
  );
  let previousText: string | null = null;
  try {
    previousText = await fs.readFile(baselinePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const temporaryPath = `${baselinePath}.materializing-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(temporaryPath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
    await fs.rename(temporaryPath, baselinePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return { path: baselinePath, baseline, previous_text: previousText };
}

export async function restoreImplementationBaseline(write: ImplementationBaselineWrite): Promise<void> {
  if (write.previous_text === null) {
    await fs.rm(write.path, { force: true });
    return;
  }
  const temporaryPath = `${write.path}.rollback-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(temporaryPath, write.previous_text, 'utf-8');
    await fs.rename(temporaryPath, write.path);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function walkCandidateMarkdown(root: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walkCandidateMarkdown(absolute));
    else if (
      entry.isFile() &&
      ['architecture.candidate.md', 'design.candidate.md', 'tasks.md'].includes(entry.name)
    ) {
      files.push(absolute);
    }
  }
  return files.sort();
}

function contradictionLines(content: string, existingScopePaths: string[]): string[] {
  // Inspect individual assertions, not an entire paragraph. Negation applies
  // only to its own claim: a truthful sentence must not mask a later lie.
  const negated = (prefix: string) =>
    /(?:并非|并不是|不是|不属于|非|禁止|不得|不能|无需|没有|\bnot|\bnever|\bno)\s*(?:(?:一个|一次|a|an)\s*)?(?:[「“"']\s*)?$/i.test(prefix);
  const normalizedScopes = existingScopePaths.map(value => value.toLowerCase());
  return content.split(/\r?\n/).filter(line => {
    const plain = line.replace(/\*\*|`/g, '');
    return plain.split(/[，,；;。]/).some(clause => {
      if (/all_files_new\s*["']?\s*[:=]\s*true\b/i.test(clause)) return true;
      for (const match of clause.matchAll(/绿地(?:项目|新建)|\bgreenfield\b/gi)) {
        if (!negated(clause.slice(0, match.index))) return true;
      }
      // Keep the subject and predicate together; do not span unrelated prose
      // such as “以已知当前实现为差量基础，不存在「当前实现未知」”.
      const chinese = /(?:当前|现有|业务)\s*(?:业务)?\s*(?:源代码|代码|实现)\s*(?:目前|仍然|仍|尚|是|为|：|:|\s)*(不存在|缺失|为空|无(?:\s|$)|none\b)/gi;
      for (const match of clause.matchAll(chinese)) {
        if (!negated(clause.slice(0, match.index))) return true;
      }
      const english = /Current Implementation\s*(?::|：|\|)?\s*(?:is\s+)?(none\b|missing\b|absent\b|does not exist|不存在|无(?:\s|$))/gi;
      for (const match of clause.matchAll(english)) {
        if (!negated(clause.slice(0, match.index))) return true;
      }
      const lower = clause.toLowerCase();
      if (!normalizedScopes.some(scope => lower.includes(scope))) return false;
      if (/\|\s*(?:新建|create|new file)\s*\|/i.test(clause)) return true;
      // A file action must be a declaration, not a method name or a warning.
      return normalizedScopes.some(scope => {
        const action = new RegExp(`${escapeRegex(scope)}\\s*[:：]\\s*(?:new file|create|新建|目标文件不存在)(?:\\b|$)`, 'i');
        return action.test(clause);
      });
    });
  });
}

export async function validateImplementationTruthBeforeSeal(input: {
  projectRoot: string;
  workItemId: string;
}): Promise<ImplementationTruthValidation> {
  const workItemDir = path.join(
    input.projectRoot,
    SPEC_DIR_NAME,
    'work-items',
    input.workItemId,
  );
  const baselinePath = path.join(workItemDir, IMPLEMENTATION_BASELINE_FILENAME);
  const errors: string[] = [];
  let baseline: ImplementationBaseline;
  try {
    baseline = JSON.parse(await fs.readFile(baselinePath, 'utf-8')) as ImplementationBaseline;
  } catch (error) {
    return {
      valid: false,
      errors: [`IMPLEMENTATION_BASELINE_MISSING_OR_INVALID: ${baselinePath}: ${error instanceof Error ? error.message : String(error)}`],
      input_files: [baselinePath],
    };
  }
  const current = await captureImplementationBaseline(input.projectRoot, input.workItemId);
  if (baseline.snapshot_id !== current.snapshot_id) {
    errors.push(
      `IMPLEMENTATION_BASELINE_STALE: recorded=${String(baseline.snapshot_id ?? 'missing')}; current=${current.snapshot_id}`,
    );
  }

  const bindingFiles = await walkCandidateMarkdown(path.join(workItemDir, 'candidates'));
  const inputFiles = [baselinePath, ...bindingFiles];
  if (baseline.planned_code_paths.length > 0) {
    if (bindingFiles.length === 0) {
      errors.push('IMPLEMENTATION_BASELINE_BINDING_MISSING: no architecture/design/tasks Candidate document was found');
    }
    for (const filePath of bindingFiles) {
      const content = await fs.readFile(filePath, 'utf-8');
      const binding = /(?:^|\n)\s*implementation_baseline_id\s*:\s*(sha256:[0-9a-f]{64})\s*(?:\r?\n|$)/i.exec(content)?.[1];
      if (binding !== baseline.snapshot_id) {
        errors.push(
          `IMPLEMENTATION_BASELINE_BINDING_INVALID: ${filePath}; candidate=${binding ?? 'missing'}; current=${baseline.snapshot_id}`,
        );
      }
    }
  }

  const impactPath = path.join(workItemDir, 'impact_analysis.md');
  let impactContent = '';
  try {
    impactContent = await fs.readFile(impactPath, 'utf-8');
    inputFiles.push(impactPath);
  } catch {
    // Existing required-file gates own absence; this validator only owns truth contradictions.
  }
  const existingScopePaths = baseline.entries
    .filter(entry => entry.matched_files.length > 0)
    .map(entry => entry.scope_path);
  if (existingScopePaths.length > 0) {
    const truthFiles = [impactPath, ...bindingFiles];
    const truthContents = [impactContent, ...await Promise.all(bindingFiles.map(file => fs.readFile(file, 'utf-8')))];
    for (let index = 0; index < truthFiles.length; index += 1) {
      for (const line of contradictionLines(truthContents[index], existingScopePaths)) {
        errors.push(
          `IMPLEMENTATION_BASELINE_CONTRADICTION: ${truthFiles[index]}: ${line.trim()}`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: Array.from(new Set(errors)),
    input_files: Array.from(new Set(inputFiles)).sort(),
    baseline,
  };
}
