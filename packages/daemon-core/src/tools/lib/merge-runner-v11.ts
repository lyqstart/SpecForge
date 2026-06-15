/**
 * merge-runner-v11.ts — v1.1 标准 Merge Runner（§11）
 *
 * R2 changes:
 * - code_only_fast_path with candidate_manifest.entries=[] is handled as not_applicable.
 * - merge_report.md is generated with Status: not_applicable without Agent hand-written repair.
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

function isCodeOnlyFastPathNoMerge(manifest: any): boolean {
  const entries = manifest.entries ?? [];
  return (
    manifest.workflow_path === 'code_only_fast_path' &&
    Array.isArray(entries) &&
    entries.length === 0
  ) || manifest.merge_required === false || manifest.merge_status === 'not_applicable' || manifest.merge_applicability === 'not_applicable';
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

  const entries = manifest.entries ?? [];
  result.project_spec_version = await readCurrentProjectSpecVersion(input.projectRoot);

  // code_only_fast_path has no Candidate → Spec merge. This is a valid terminal merge state.
  if (isCodeOnlyFastPathNoMerge(manifest)) {
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

  if (!Array.isArray(entries)) {
    const failed: MergeResult = {
      ...result,
      success: false,
      status: 'failed',
      errors: ['candidate_manifest.entries must be an array'],
    };
    await generateMergeReport(input, failed);
    return failed;
  }

  try {
    const decision = await readJsonFile(input.userDecisionPath);
    if (!['approved', 'waived'].includes(decision.decision_status)) {
      return {
        ...result,
        success: false,
        status: 'failed',
        errors: [`User Decision status is "${decision.decision_status}", not approved/waived`],
      };
    }
  } catch (err: any) {
    return { ...result, success: false, status: 'failed', errors: [`Cannot read user_decision.json: ${err.message}`] };
  }

  for (const entry of entries) {
    const candidateFullPath = path.resolve(input.workItemDir, entry.candidate_path);
    const targetFullPath = path.resolve(input.projectRoot, entry.target_path);

    if (!candidateFullPath.startsWith(path.resolve(input.workItemDir))) {
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

    const projectDir = path.resolve(input.projectRoot, '.specforge', 'project');
    if (!targetFullPath.startsWith(projectDir)) {
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
      specManifest.project_spec_version = newVersion;
      specManifest.last_merged_work_item = input.workItemId;
      specManifest.last_merged_at = new Date().toISOString();
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
    for (const entry of result.merged_files) {
      lines.push(`| ${entry.status} | ${entry.operation} | ${entry.target_path} | hash_match: ${entry.hash_match} |`);
      if (entry.error) lines.push(` Error: ${entry.error}`);
    }
  }

  if (result.errors.length > 0) {
    lines.push('', '## Errors', '', ...result.errors.map((err) => `- ${err}`));
  }

  lines.push('', '## Evidence', '', '- merge_runner_execution_log');
  await fs.writeFile(path.join(input.workItemDir, 'merge_report.md'), lines.join('\n'), 'utf-8');
}
