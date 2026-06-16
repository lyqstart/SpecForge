/**
 * merge-runner-v11.ts - v1.1 Spec Merge Runner
 *
 * v20 repair:
 * - Non-code-only workflows must not silently merge 0 entries.
 * - Supports legacy candidate_manifest.candidates by normalizing it into entries.
 * - Infers project-level merge targets for requirements/design/trace_delta.
 * - Updates candidate_manifest.json with normalized entries before merge.
 * - Updates .specforge/project/spec_manifest.json only after real successful merges.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

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
    return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
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

function normalizeSlash(value: string): string {
  return String(value ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function isCodeOnlyFastPathNoMerge(manifest: any, entries: ManifestEntry[]): boolean {
  return (
    manifest.workflow_path === 'code_only_fast_path' &&
    Array.isArray(entries) &&
    entries.length === 0
  );
}

function targetPathForCandidate(type: string, candidatePath: string): string | null {
  const t = String(type ?? '').toLowerCase();
  const p = normalizeSlash(candidatePath).toLowerCase();

  if (t === 'requirements' || p.endsWith('/requirements.md') || p === 'requirements.md') {
    return '.specforge/project/requirements_index.md';
  }
  if (t === 'design' || p.endsWith('/design.md') || p === 'design.md') {
    return '.specforge/project/design_index.md';
  }
  if (t === 'trace' || t === 'trace_delta' || p.endsWith('/trace_delta.md') || p === 'trace_delta.md') {
    return '.specforge/project/trace_matrix.md';
  }
  if (t === 'architecture' || p.endsWith('/architecture.md') || p === 'architecture.md') {
    return '.specforge/project/architecture.md';
  }
  if (t === 'glossary' || p.endsWith('/glossary.md') || p === 'glossary.md') {
    return '.specforge/project/glossary.md';
  }
  if (t === 'decisions' || p.endsWith('/decisions.md') || p === 'decisions.md') {
    return '.specforge/project/decisions.md';
  }

  // tasks.md is an execution plan, not a project-level spec artifact in v1.1.
  return null;
}

function normalizeManifestEntries(manifest: any, workItemDir: string): ManifestEntry[] {
  const rawEntries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const normalized: ManifestEntry[] = [];

  for (const entry of rawEntries) {
    if (!entry || typeof entry !== 'object') continue;
    const candidatePath = entry.candidate_path ?? entry.path;
    const targetPath = entry.target_path;
    if (!candidatePath || !targetPath) continue;
    normalized.push({
      candidate_path: normalizeSlash(candidatePath),
      target_path: normalizeSlash(targetPath),
      operation: entry.operation ?? 'replace',
      type: entry.type,
      inferred: Boolean(entry.inferred),
    });
  }

  if (normalized.length === 0 && Array.isArray(manifest.candidates)) {
    for (const candidate of manifest.candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const candidatePath = normalizeSlash(candidate.candidate_path ?? candidate.path ?? '');
      if (!candidatePath) continue;
      const targetPath = targetPathForCandidate(candidate.type, candidatePath);
      if (!targetPath) continue;
      normalized.push({
        candidate_path: candidatePath,
        target_path: targetPath,
        operation: candidate.operation ?? 'replace',
        type: candidate.type,
        inferred: true,
      });
    }
  }

  const traceDeltaExists = require('node:fs').existsSync(path.join(workItemDir, 'trace_delta.md'));
  const alreadyHasTrace = normalized.some((entry) => normalizeSlash(entry.target_path).endsWith('trace_matrix.md'));
  if (traceDeltaExists && !alreadyHasTrace && manifest.workflow_path !== 'code_only_fast_path') {
    normalized.push({
      candidate_path: 'trace_delta.md',
      target_path: '.specforge/project/trace_matrix.md',
      operation: 'replace',
      type: 'trace_delta',
      inferred: true,
    });
  }

  const seen = new Set<string>();
  return normalized.filter((entry) => {
    const key = `${entry.candidate_path}=>${entry.target_path}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function persistNormalizedManifest(input: MergeInput, manifest: any, entries: ManifestEntry[]): Promise<void> {
  const nextManifest = {
    schema_version: manifest.schema_version ?? '1.1',
    work_item_id: manifest.work_item_id ?? input.workItemId,
    workflow_path: manifest.workflow_path,
    workflow_type: manifest.workflow_type,
    candidates: manifest.candidates,
    trace_delta: manifest.trace_delta ?? 'trace_delta.md',
    entries,
    merge_required: manifest.workflow_path === 'code_only_fast_path' ? false : entries.length > 0,
    normalized_by: 'merge-runner-v11',
    normalized_at: new Date().toISOString(),
  };
  await fs.writeFile(input.candidateManifestPath, JSON.stringify(nextManifest, null, 2) + '\n', 'utf-8');
}

function isSubPath(child: string, parent: string): boolean {
  const c = path.resolve(child).toLowerCase();
  const p = path.resolve(parent).toLowerCase();
  return c === p || c.startsWith(p + path.sep.toLowerCase()) || c.startsWith(p + '/');
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
    return { ...result, success: false, status: 'failed', errors: [`Cannot read candidate_manifest.json: ${err.message}`] };
  }

  const entries = normalizeManifestEntries(manifest, input.workItemDir);
  result.project_spec_version = await readCurrentProjectSpecVersion(input.projectRoot);

  await persistNormalizedManifest(input, manifest, entries);

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
      errors: ['Non-code-only workflow requires at least one merge entry. candidate_manifest.entries is empty and no mergeable candidates could be inferred.'],
    };
    await generateMergeReport(input, failed);
    return failed;
  }

  try {
    const decision = await readJsonFile(input.userDecisionPath);
    if (!['approved', 'waived'].includes(decision.decision_status)) {
      const failed: MergeResult = {
        ...result,
        success: false,
        status: 'failed',
        errors: [`User Decision status is "${decision.decision_status}", not approved/waived`],
      };
      await generateMergeReport(input, failed);
      return failed;
    }
  } catch (err: any) {
    const failed: MergeResult = {
      ...result,
      success: false,
      status: 'failed',
      errors: [`Cannot read user_decision.json: ${err.message}`],
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
      result.errors.push(`Security: candidate_path outside WI: ${entry.candidate_path}`);
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
      result.errors.push(`Security: target_path outside .specforge/project/: ${entry.target_path}`);
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
      result.errors.push(`Candidate file does not exist: ${entry.candidate_path}`);
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
      const newVersion = `PSV-${String(versionNum + 1).padStart(4, '0')}`;
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
      await fs.writeFile(projectSpecManifestPath, JSON.stringify(specManifest, null, 2) + '\n', 'utf-8');
      result.spec_manifest_updated = true;
    } catch (err: any) {
      result.errors.push(`Failed to update spec_manifest.json: ${err.message}`);
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
    `Work Item: ${input.workItemId}`,
    `Status: ${status}`,
    `Timestamp: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `- Total entries: ${result.merged_files.length}`,
    `- Successful: ${result.merged_files.filter((e) => e.status === 'success').length}`,
    `- Failed: ${result.merged_files.filter((e) => e.status === 'failed').length}`,
    `- Spec Manifest Updated: ${result.spec_manifest_updated}`,
    `- Project Spec Version: ${result.project_spec_version || 'N/A'}`,
  ];

  if (status === 'not_applicable') {
    lines.push('', '## Not Applicable', '', result.reason ?? 'No Candidate artifacts need to be merged.');
  }

  lines.push('', '## Inputs', '', `- candidate_manifest: ${input.candidateManifestPath}`, `- user_decision: ${input.userDecisionPath}`, '', '## Merged Files', '');

  if (result.merged_files.length === 0) {
    lines.push('No files merged.');
  } else {
    lines.push('| Status | Operation | Candidate | Target | Hash Match |');
    lines.push('|--------|-----------|-----------|--------|------------|');
    for (const entry of result.merged_files) {
      lines.push(`| ${entry.status} | ${entry.operation} | ${entry.candidate_path} | ${entry.target_path} | ${entry.hash_match} |`);
      if (entry.error) lines.push(`- Error: ${entry.error}`);
    }
  }

  if (result.errors.length > 0) {
    lines.push('', '## Errors', '', ...result.errors.map((err) => `- ${err}`));
  }

  lines.push('', '## Evidence', '', '- merge_runner_execution_log');
  await fs.writeFile(path.join(input.workItemDir, 'merge_report.md'), lines.join('\n'), 'utf-8');
}