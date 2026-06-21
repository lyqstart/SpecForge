/**
 * merge-runner-v11.ts - v1.1 Spec Merge Runner
 *
 * P0 governance:
 * - Merge must use the same manifest normalization rules as approval.
 * - Merge must not infer or mutate candidate_manifest.json after approval.
 * - Non-code-only workflows must merge at least one project-level spec artifact.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  validateApprovedUserDecisionForMerge,
  entriesSemanticallyEqual,
  inferManifestEntries,
  normalizeSlash,
} from './governance-invariants-v11.js';

export interface MergeInput {
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  candidateManifestPath: string;
  userDecisionPath: string;
}

export interface MergeEntryResult {
  candidate_path: string;
  target_path: string;
  operation: string;
  status: 'success' | 'skipped' | 'failed' | 'not_applicable';
  hash_match: boolean;
  error?: string;
}

export interface MergeResult {
  success: boolean;
  merged_files: MergeEntryResult[];
  spec_manifest_updated: boolean;
  project_spec_version: string;
  errors: string[];
  status?: 'success' | 'failed' | 'not_applicable';
  reason?: string;
}

type ManifestEntry = {
  candidate_path: string;
  target_path: string;
  operation: string;
  type?: string;
  inferred?: boolean;
  normalized?: boolean;
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function computeFileHash(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath);
    return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}

async function readJsonFile(filePath: string): Promise<any> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

async function readCurrentProjectSpecVersion(projectRoot: string): Promise<string> {
  const projectSpecManifestPath = path.join(projectRoot, '.specforge', 'project', 'spec_manifest.json');
  try {
    const specManifest = await readJsonFile(projectSpecManifestPath);
    return specManifest.project_spec_version ?? 'PSV-0000';
  } catch {
    return 'PSV-0000';
  }
}

function isCodeOnlyFastPathNoMerge(manifest: any, entries: ManifestEntry[]): boolean {
  return manifest.workflow_path === 'code_only_fast_path' && Array.isArray(entries) && entries.length === 0;
}

function isSubPath(child: string, parent: string): boolean {
  const c = path.resolve(child).toLowerCase();
  const p = path.resolve(parent).toLowerCase();
  return c === p || c.startsWith(p + path.sep.toLowerCase()) || c.startsWith(p + '/');
}

function normalizeEntryForMerge(entry: ManifestEntry): ManifestEntry {
  return {
    candidate_path: normalizeSlash(entry.candidate_path),
    target_path: normalizeSlash(entry.target_path),
    operation: entry.operation ?? 'replace',
    type: entry.type,
    inferred: Boolean(entry.inferred),
    normalized: Boolean(entry.normalized),
  };
}

function normalizeProjectTargetPathV12(value: unknown): string {
  return String(value ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
}
function inferModuleNameFromProjectTargetV12(value: unknown): string | null {
  const normalized = normalizeProjectTargetPathV12(value);
  const match = /(?:^|\/)\.specforge\/project\/modules\/([^/]+)\//.exec(normalized) ??
    /(?:^|\/)project\/modules\/([^/]+)\//.exec(normalized);
  const moduleName = match?.[1]?.trim();
  if (!moduleName || moduleName === 'core') return null;
  return moduleName;
}
function modulePrefixFromNameV12(moduleName: string): string {
  const prefix = String(moduleName ?? '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join('');
  return prefix || 'MOD';
}
function moduleIdFromNameV12(moduleName: string): string {
  const normalized = String(moduleName ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return 'MOD-' + (normalized || 'MODULE');
}
function hasRegisteredModuleV12(modules: any[], moduleName: string): boolean {
  const expectedId = moduleIdFromNameV12(moduleName);
  return modules.some((entry) => {
    if (typeof entry === 'string') return entry === moduleName;
    return entry?.name === moduleName || entry?.module === moduleName || entry?.module_id === expectedId;
  });
}
function registerMergedProjectModulesV12(specManifest: any): void {
  if (!specManifest || typeof specManifest !== 'object') return;
  const targets = Array.isArray(specManifest.last_merged_targets) ? specManifest.last_merged_targets : [];
  const moduleNames = Array.from(new Set(targets.map(inferModuleNameFromProjectTargetV12).filter(Boolean))) as string[];
  if (moduleNames.length === 0) {
    specManifest.modules = Array.isArray(specManifest.modules) ? specManifest.modules : [];
    return;
  }
  const modules = Array.isArray(specManifest.modules) ? [...specManifest.modules] : [];
  for (const moduleName of moduleNames) {
    if (hasRegisteredModuleV12(modules, moduleName)) continue;
    modules.push({
      module_id: moduleIdFromNameV12(moduleName),
      name: moduleName,
      prefix: modulePrefixFromNameV12(moduleName),
      requirements_file: 'project/modules/' + moduleName + '/requirements.md',
      design_file: 'project/modules/' + moduleName + '/design.md',
      trace_file: 'project/trace_matrix.md',
      tasks_file: 'project/modules/' + moduleName + '/tasks.md',
      status: 'active',
    });
  }
  specManifest.modules = modules;
}
export async function executeMerge(input: MergeInput): Promise<MergeResult> {
  const result: MergeResult = {
    success: true,
    merged_files: [],
    spec_manifest_updated: false,
    project_spec_version: '',
    errors: [],
    status: 'success',
  };

  let manifest: any;
  try {
    manifest = await readJsonFile(input.candidateManifestPath);
  } catch (err: any) {
    return {
      ...result,
      success: false,
      status: 'failed',
      errors: ['Cannot read candidate_manifest.json: ' + err.message],
    };
  }

  const manifestEntries = Array.isArray(manifest.entries)
    ? manifest.entries.map((entry: ManifestEntry) => normalizeEntryForMerge(entry))
    : [];
  const normalizedEntries = inferManifestEntries(manifest, input.workItemDir).map(normalizeEntryForMerge);
  const entries = normalizedEntries;

  result.project_spec_version = await readCurrentProjectSpecVersion(input.projectRoot);

  if (manifest.workflow_path !== 'code_only_fast_path' && !entriesSemanticallyEqual(manifestEntries, normalizedEntries)) {
    const failed: MergeResult = {
      ...result,
      success: false,
      status: 'failed',
      errors: [
        'candidate_manifest.entries must be normalized before user approval; merge_runner uses the same inferManifestEntries() rules as approval and will not infer or mutate entries after approval.',
      ],
    };
    await generateMergeReport(input, failed);
    return failed;
  }

  if (isCodeOnlyFastPathNoMerge(manifest, entries)) {
    const notApplicable: MergeResult = {
      ...result,
      success: true,
      status: 'not_applicable',
      reason: 'code_only_fast_path has no candidate spec artifacts to merge; candidate_manifest.entries is empty.',
      merged_files: [],
      spec_manifest_updated: false,
    };
    await generateMergeReport(input, notApplicable);
    return notApplicable;
  }

  if (entries.length === 0) {
    const failed: MergeResult = {
      ...result,
      success: false,
      status: 'failed',
      errors: [
        'Non-code-only workflow requires at least one merge entry. candidate_manifest.entries is empty.',
      ],
    };
    await generateMergeReport(input, failed);
    return failed;
  }

  const approvalValidation = await validateApprovedUserDecisionForMerge({
    projectRoot: input.projectRoot,
    workItemDir: input.workItemDir,
    workItemId: input.workItemId,
    candidateManifestPath: input.candidateManifestPath,
    userDecisionPath: input.userDecisionPath,
  });

  if (!approvalValidation.valid) {
    const failed: MergeResult = {
      ...result,
      success: false,
      status: 'failed',
      errors: approvalValidation.errors,
    };
    await generateMergeReport(input, failed);
    return failed;
  }

  const workItemRoot = path.resolve(input.workItemDir);
  const projectSpecRoot = path.resolve(input.projectRoot, '.specforge', 'project');

  for (const entry of entries) {
    const candidateFullPath = path.resolve(input.workItemDir, entry.candidate_path);
    const targetFullPath = path.resolve(input.projectRoot, entry.target_path);

    if (!isSubPath(candidateFullPath, workItemRoot)) {
      result.errors.push('Security: candidate_path outside WI: ' + entry.candidate_path);
      result.merged_files.push({
        candidate_path: entry.candidate_path,
        target_path: entry.target_path,
        operation: entry.operation,
        status: 'failed',
        hash_match: false,
        error: 'candidate_path outside WI directory',
      });
      result.success = false;
      continue;
    }

    if (!isSubPath(targetFullPath, projectSpecRoot)) {
      result.errors.push('Security: target_path outside .specforge/project/: ' + entry.target_path);
      result.merged_files.push({
        candidate_path: entry.candidate_path,
        target_path: entry.target_path,
        operation: entry.operation,
        status: 'failed',
        hash_match: false,
        error: 'target_path outside .specforge/project/',
      });
      result.success = false;
      continue;
    }

    if (!(await fileExists(candidateFullPath))) {
      result.errors.push('Candidate file does not exist: ' + entry.candidate_path);
      result.merged_files.push({
        candidate_path: entry.candidate_path,
        target_path: entry.target_path,
        operation: entry.operation,
        status: 'failed',
        hash_match: false,
        error: 'candidate file does not exist',
      });
      result.success = false;
      continue;
    }

    try {
      if (entry.operation === 'delete') {
        try {
          await fs.unlink(targetFullPath);
        } catch {
          // Missing file is idempotent for delete.
        }
        result.merged_files.push({
          candidate_path: entry.candidate_path,
          target_path: entry.target_path,
          operation: 'delete',
          status: 'success',
          hash_match: true,
        });
      } else {
        await fs.mkdir(path.dirname(targetFullPath), { recursive: true });
        await fs.copyFile(candidateFullPath, targetFullPath);
        const candidateHash = await computeFileHash(candidateFullPath);
        const targetHash = await computeFileHash(targetFullPath);
        const hashMatch = candidateHash === targetHash;
        result.merged_files.push({
          candidate_path: entry.candidate_path,
          target_path: entry.target_path,
          operation: entry.operation,
          status: hashMatch ? 'success' : 'failed',
          hash_match: hashMatch,
          error: hashMatch ? undefined : 'Hash mismatch after copy',
        });
        if (!hashMatch) result.success = false;
      }
    } catch (err: any) {
      result.merged_files.push({
        candidate_path: entry.candidate_path,
        target_path: entry.target_path,
        operation: entry.operation,
        status: 'failed',
        hash_match: false,
        error: err.message,
      });
      result.success = false;
    }
  }

  const projectSpecManifestPath = path.join(input.projectRoot, '.specforge', 'project', 'spec_manifest.json');
  if (result.success && entries.length > 0) {
    try {
      const versionNum = parseInt(result.project_spec_version.replace('PSV-', ''), 10) || 0;
      const newVersion = 'PSV-' + String(versionNum + 1).padStart(4, '0');
      result.project_spec_version = newVersion;

      let specManifest: any = {};
      try {
        specManifest = await readJsonFile(projectSpecManifestPath);
      } catch {
        // First spec merge.
      }

      specManifest.schema_version = specManifest.schema_version ?? '1.0';
      specManifest.project_spec_version = newVersion;
      specManifest.last_merged_work_item = input.workItemId;
      specManifest.last_merged_at = new Date().toISOString();
      specManifest.last_merged_targets = result.merged_files
        .filter((entry) => entry.status === 'success')
        .map((entry) => entry.target_path);

      await fs.mkdir(path.dirname(projectSpecManifestPath), { recursive: true });
      registerMergedProjectModulesV12(specManifest); await fs.writeFile(projectSpecManifestPath, JSON.stringify(specManifest, null, 2) + '\n', 'utf-8');
      result.spec_manifest_updated = true;
    } catch (err: any) {
      result.errors.push('Failed to update spec_manifest.json: ' + err.message);
      result.success = false;
    }
  }

  result.status = result.success ? 'success' : 'failed';
  await generateMergeReport(input, result);
  return result;
}

async function generateMergeReport(input: MergeInput, result: MergeResult): Promise<void> {
  const status = result.status ?? (result.success ? 'success' : 'failed');
  const lines: string[] = [
    '# Merge Report',
    '',
    'Work Item: ' + input.workItemId,
    'Status: ' + status,
    'Timestamp: ' + new Date().toISOString(),
    '',
    '## Summary',
    '',
    '- Total entries: ' + result.merged_files.length,
    '- Successful: ' + result.merged_files.filter((e) => e.status === 'success').length,
    '- Failed: ' + result.merged_files.filter((e) => e.status === 'failed').length,
    '- Spec Manifest Updated: ' + result.spec_manifest_updated,
    '- Project Spec Version: ' + (result.project_spec_version || 'N/A'),
  ];

  if (status === 'not_applicable') {
    lines.push('', '## Not Applicable', '', result.reason ?? 'No Candidate artifacts need to be merged.');
  }

  lines.push('', '## Inputs', '', '- candidate_manifest: ' + input.candidateManifestPath, '- user_decision: ' + input.userDecisionPath, '', '## Merged Files', '');

  if (result.merged_files.length === 0) {
    lines.push('No files merged.');
  } else {
    lines.push('| Status | Operation | Candidate | Target | Hash Match |');
    lines.push('|--------|-----------|-----------|--------|------------|');
    for (const entry of result.merged_files) {
      lines.push('| ' + entry.status + ' | ' + entry.operation + ' | ' + entry.candidate_path + ' | ' + entry.target_path + ' | ' + entry.hash_match + ' |');
      if (entry.error) lines.push('- Error: ' + entry.error);
    }
  }

  if (result.errors.length > 0) {
    lines.push('', '## Errors', '', ...result.errors.map((err) => '- ' + err));
  }

  lines.push('', '## Evidence', '', '- merge_runner_execution_log');
  await fs.writeFile(path.join(input.workItemDir, 'merge_report.md'), lines.join('\n'), 'utf-8');
}
