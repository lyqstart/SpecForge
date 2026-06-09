/**
 * MergeRunner.ts — SpecForge v1.1 Merge Runner
 *
 * Executes candidate merges according to candidate manifest with:
 * - Precondition validation (user decision, hash verification)
 * - Merge execution (read candidate, write to target)
 * - Merge report generation
 *
 * Requirements: 3.15-3.24
 */

import { JsonParser } from './JsonParser.js';
import type { UserDecisionRecord } from './UserDecisionRecorder.js';

// ---- v1.1 Standard Types ----

/** v1.1 Candidate Manifest entry (standard structure) */
export interface V11ManifestEntry {
  candidate_path: string;
  target_path: string;
  operation: 'replace';
  candidate_hash: string;
  target_base_hash: string;
}

/** v1.1 Candidate Manifest (standard structure) */
export interface V11CandidateManifest {
  schema_version: '1.0';
  work_item_id: string;
  workflow_path: string;
  base_spec_version: string;
  merge_required: boolean;
  entries: V11ManifestEntry[];
  manifest_hash: string;
  generated_at?: string;
}

// ---- Legacy Types (backward compat) ----

export interface CandidateEntry {
  candidate_path: string;
  target_path: string;
  operation: 'create' | 'update' | 'delete';
  description?: string;
}

export interface CandidateManifest {
  schema_version: '1.0';
  work_item_id: string;
  base_spec_version: string;
  target_spec_version: string;
  candidates: CandidateEntry[];
  generated_at: string;
}

export interface MergedFile {
  candidatePath: string;
  targetPath: string;
  operation: 'create' | 'update';
  preHash: string;
  postHash: string;
  success: boolean;
  error?: string;
}

export interface MergeResult {
  success: boolean;
  mergedFiles: MergedFile[];
  errors: string[];
}

export interface MergePreconditionResult {
  valid: boolean;
  errors: string[];
}

// ---- v1.1 Merge Execution Types ----

export interface V11MergeParams {
  manifest: V11CandidateManifest;
  readCandidate: (path: string) => string | null;
  readTarget: (path: string) => string | null;
  writeTarget: (path: string, content: string) => boolean;
  calculateHash: (content: string) => string;
}

export interface V11MergeResult {
  success: boolean;
  mergedFiles: V11MergedFile[];
  errors: string[];
  newSpecVersion: string;
}

export interface V11MergedFile {
  candidatePath: string;
  targetPath: string;
  operation: 'replace';
  candidateHash: string;
  targetBaseHash: string;
  postMergeHash: string;
  success: boolean;
  error?: string;
}

export interface V11MergeReportParams {
  workItemId: string;
  baseSpecVersion: string;
  newSpecVersion: string;
  manifestHash: string;
  mergedFiles: V11MergedFile[];
  executedAt: string;
}

/**
 * MergeRunner — executes candidate merges with precondition validation.
 *
 * Requirements: 3.15-3.24
 */
export class MergeRunner {
  /**
   * Validate merge preconditions.
   * Requirements: 3.15, 3.16, 3.17, 3.18, 3.19
   */
  validateMergePreconditions(params: {
    userDecision: UserDecisionRecord;
    currentManifestContent: string;
    currentGateSummaryContent: string;
    currentSpecVersion: string;
    calculateHash: (content: string) => string;
  }): MergePreconditionResult {
    const errors: string[] = [];

    // Requirement 3.15: Verify user_decision exists (already passed as param)

    // Requirement 3.16: Verify candidate manifest hash matches
    const currentManifestHash = params.calculateHash(params.currentManifestContent);
    if (currentManifestHash !== params.userDecision.candidate_manifest_hash) {
      errors.push(`Candidate manifest hash mismatch: current=${currentManifestHash}, decision=${params.userDecision.candidate_manifest_hash}`);
    }

    // Requirement 3.17: Verify gate summary hash matches
    const currentGateHash = params.calculateHash(params.currentGateSummaryContent);
    if (currentGateHash !== params.userDecision.gate_summary_hash) {
      errors.push(`Gate summary hash mismatch: current=${currentGateHash}, decision=${params.userDecision.gate_summary_hash}`);
    }

    // Requirement 3.18: Verify base_spec_version matches
    if (params.currentSpecVersion !== params.userDecision.base_spec_version) {
      errors.push(`Spec version mismatch: current=${params.currentSpecVersion}, decision=${params.userDecision.base_spec_version}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Parse candidate manifest from JSON.
   * Requirements: 3.3, 3.4, 6.7, 6.8
   */
  parseCandidateManifest(jsonString: string): { success: boolean; data?: CandidateManifest | undefined; error?: string | undefined } {
    const result = JsonParser.parse<CandidateManifest>(jsonString);
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }

    // Validate candidate paths
    for (const entry of result.data.candidates) {
      if (!entry.candidate_path.includes('candidates/')) {
        return {
          success: false,
          error: `Invalid candidate_path: '${entry.candidate_path}' must point to candidates/ directory`,
        };
      }
      if (!entry.target_path.startsWith('.specforge/project/')) {
        return {
          success: false,
          error: `Invalid target_path: '${entry.target_path}' must point to .specforge/project/`,
        };
      }
    }

    return { success: true, data: result.data };
  }

  /**
   * Validate a v1.1 candidate manifest.
   * Rejects old structures (candidates array, operation:'update', missing hashes).
   */
  validateV11Manifest(manifest: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const m = manifest as Record<string, unknown>;

    if (!m || typeof m !== 'object') {
      return { valid: false, errors: ['Manifest must be an object'] };
    }

    // Must have entries, not candidates
    if ('candidates' in m && !('entries' in m)) {
      errors.push('v1.1 manifest must use "entries", not "candidates"');
    }
    if (!Array.isArray(m.entries)) {
      errors.push('Missing or invalid "entries" array');
    }

    // Must have manifest_hash
    if (!m.manifest_hash || typeof m.manifest_hash !== 'string') {
      errors.push('Missing "manifest_hash"');
    }

    // Must have merge_required
    if (typeof m.merge_required !== 'boolean') {
      errors.push('Missing "merge_required" boolean');
    }

    // Must have workflow_path
    if (!m.workflow_path || typeof m.workflow_path !== 'string') {
      errors.push('Missing "workflow_path"');
    }

    // Validate each entry
    if (Array.isArray(m.entries)) {
      const workItemId = m.work_item_id as string;
      for (let i = 0; i < m.entries.length; i++) {
        const entry = m.entries[i] as Record<string, unknown>;

        if (entry.operation !== 'replace') {
          errors.push(`entries[${i}].operation must be "replace", got "${entry.operation}"`);
        }
        if (!entry.candidate_hash || typeof entry.candidate_hash !== 'string') {
          errors.push(`entries[${i}] missing "candidate_hash"`);
        }
        if (!entry.target_base_hash || typeof entry.target_base_hash !== 'string') {
          errors.push(`entries[${i}] missing "target_base_hash"`);
        }
        if (!entry.target_path || !(entry.target_path as string).startsWith('.specforge/project/')) {
          errors.push(`entries[${i}].target_path must start with ".specforge/project/", got "${entry.target_path}"`);
        }
        if (workItemId && entry.candidate_path && !(entry.candidate_path as string).includes(`work-items/${workItemId}/candidates/`)) {
          errors.push(`entries[${i}].candidate_path must be in current WI candidates/ directory`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate candidate format (complete files only, no patches/diffs).
   * Requirements: 3.1, 3.2
   */
  validateCandidateFormat(content: string): { valid: boolean; reason?: string } {
    const trimmed = content.trim();

    // Reject patch-like content
    if (trimmed.startsWith('--- ') || trimmed.startsWith('diff --git')) {
      return { valid: false, reason: 'Patch/diff format not allowed — candidates must be complete file contents' };
    }

    // Reject content that looks like hunks
    if (/^@@ -\d+,?\d* \+\d+,?\d* @@/m.test(trimmed)) {
      return { valid: false, reason: 'Patch hunks detected — candidates must be complete file contents' };
    }

    // Reject unified diff format
    if (/^[-+]{3}\s/m.test(trimmed) && trimmed.includes('===')) {
      return { valid: false, reason: 'Diff format detected — candidates must be complete file contents' };
    }

    return { valid: true };
  }

  /**
   * Simulate merge execution (in-memory).
   * In production, this would read candidate files and write to target paths.
   * Requirements: 3.20, 3.21, 3.22, 3.23, 3.24
   */
  executeMerge(params: {
    manifest: CandidateManifest;
    readCandidate: (path: string) => string | null;
    writeTarget: (path: string, content: string) => boolean;
    calculateHash: (content: string) => string;
  }): MergeResult {
    const mergedFiles: MergedFile[] = [];
    const errors: string[] = [];

    for (const entry of params.manifest.candidates) {
      // Requirement 3.20: Only merge what's in the manifest
      // Requirement 3.21: Do NOT scan candidates/ directory

      const candidateContent = params.readCandidate(entry.candidate_path);
      if (candidateContent === null) {
        errors.push(`Failed to read candidate: ${entry.candidate_path}`);
        mergedFiles.push({
          candidatePath: entry.candidate_path,
          targetPath: entry.target_path,
          operation: entry.operation as 'create' | 'update',
          preHash: '',
          postHash: '',
          success: false,
          error: 'Candidate file not found',
        });
        continue;
      }

      // Validate candidate format
      const formatCheck = this.validateCandidateFormat(candidateContent);
      if (!formatCheck.valid) {
        errors.push(`Invalid candidate format for ${entry.candidate_path}: ${formatCheck.reason}`);
        continue;
      }

      const preHash = params.calculateHash(''); // Empty = target doesn't exist yet

      const writeSuccess = params.writeTarget(entry.target_path, candidateContent);
      if (!writeSuccess) {
        errors.push(`Failed to write target: ${entry.target_path}`);
        mergedFiles.push({
          candidatePath: entry.candidate_path,
          targetPath: entry.target_path,
          operation: entry.operation as 'create' | 'update',
          preHash,
          postHash: '',
          success: false,
          error: 'Write failed',
        });
        continue;
      }

      const postHash = params.calculateHash(candidateContent);

      mergedFiles.push({
        candidatePath: entry.candidate_path,
        targetPath: entry.target_path,
        operation: entry.operation as 'create' | 'update',
        preHash,
        postHash,
        success: true,
      });
    }

    return {
      success: errors.length === 0,
      mergedFiles,
      errors,
    };
  }

  /**
   * Generate merge_report.md content.
   * Requirements: 3.22, 3.23, 3.24
   */
  generateMergeReport(params: {
    workItemId: string;
    mergedFiles: MergedFile[];
    executedAt: string;
  }): string {
    const lines: string[] = [
      '# Merge Report',
      '',
      `**Work Item**: ${params.workItemId}`,
      `**Executed At**: ${params.executedAt}`,
      `**Executor**: merge_runner`,
      '',
      '## Merge Operations',
      '',
    ];

    let opIndex = 0;
    let successCount = 0;
    let failCount = 0;

    for (const file of params.mergedFiles) {
      opIndex++;
      const statusIcon = file.success ? '✅' : '❌';
      lines.push(`### ${opIndex}. ${file.targetPath}`);
      lines.push(`- **Source**: ${file.candidatePath}`);
      lines.push(`- **Target**: ${file.targetPath}`);
      lines.push(`- **Operation**: ${file.operation}`);
      lines.push(`- **Pre-merge Hash**: ${file.preHash || 'N/A'}`);
      lines.push(`- **Post-merge Hash**: ${file.postHash || 'N/A'}`);
      lines.push(`- **Status**: ${statusIcon} ${file.success ? 'Success' : 'Failed'}`);
      if (file.error) {
        lines.push(`- **Error**: ${file.error}`);
      }
      lines.push('');

      if (file.success) successCount++;
      else failCount++;
    }

    lines.push('## Summary');
    lines.push(`- Total operations: ${params.mergedFiles.length}`);
    lines.push(`- Successful: ${successCount}`);
    lines.push(`- Failed: ${failCount}`);

    return lines.join('\n');
  }

  /**
   * Execute a v1.1 merge directly from a V11CandidateManifest.
   * Accepts ONLY v1.1 structures (entries[], not candidates[]).
   * Validates manifest, verifies hashes, writes targets.
   */
  executeV11Merge(params: V11MergeParams): V11MergeResult {
    const { manifest, readCandidate, readTarget, writeTarget, calculateHash } = params;

    // First: validate v1.1 manifest structure
    const validation = this.validateV11Manifest(manifest);
    if (!validation.valid) {
      return {
        success: false,
        mergedFiles: [],
        errors: validation.errors,
        newSpecVersion: manifest.base_spec_version,
      };
    }

    // Reject manifests that only have candidates[] (legacy)
    if ((manifest as any).candidates && !manifest.entries) {
      return {
        success: false,
        mergedFiles: [],
        errors: ['Legacy manifest with candidates[] is not accepted by executeV11Merge. Use entries[].'],
        newSpecVersion: manifest.base_spec_version,
      };
    }

    const mergedFiles: V11MergedFile[] = [];
    const errors: string[] = [];

    // Compute new spec version (increment last digit)
    const baseVersion = manifest.base_spec_version;
    const versionNum = parseInt(baseVersion.replace('PSV-', ''), 10);
    const newSpecVersion = `PSV-${String(versionNum + 1).padStart(4, '0')}`;

    for (const entry of manifest.entries) {
      // Validate candidate_path contains candidates/ for the work item
      if (!entry.candidate_path.includes('candidates/')) {
        const err = `candidate_path "${entry.candidate_path}" must contain "candidates/"`;
        errors.push(err);
        mergedFiles.push({
          candidatePath: entry.candidate_path,
          targetPath: entry.target_path,
          operation: 'replace',
          candidateHash: entry.candidate_hash,
          targetBaseHash: entry.target_base_hash,
          postMergeHash: '',
          success: false,
          error: err,
        });
        continue;
      }

      // Validate target_path starts with .specforge/project/
      if (!entry.target_path.startsWith('.specforge/project/')) {
        const err = `target_path "${entry.target_path}" must start with ".specforge/project/"`;
        errors.push(err);
        mergedFiles.push({
          candidatePath: entry.candidate_path,
          targetPath: entry.target_path,
          operation: 'replace',
          candidateHash: entry.candidate_hash,
          targetBaseHash: entry.target_base_hash,
          postMergeHash: '',
          success: false,
          error: err,
        });
        continue;
      }

      // Validate operation is 'replace'
      if (entry.operation !== 'replace') {
        const err = `operation must be "replace", got "${entry.operation}"`;
        errors.push(err);
        mergedFiles.push({
          candidatePath: entry.candidate_path,
          targetPath: entry.target_path,
          operation: 'replace',
          candidateHash: entry.candidate_hash,
          targetBaseHash: entry.target_base_hash,
          postMergeHash: '',
          success: false,
          error: err,
        });
        continue;
      }

      // Read candidate content
      const candidateContent = readCandidate(entry.candidate_path);
      if (candidateContent === null) {
        const err = `Failed to read candidate: ${entry.candidate_path}`;
        errors.push(err);
        mergedFiles.push({
          candidatePath: entry.candidate_path,
          targetPath: entry.target_path,
          operation: 'replace',
          candidateHash: entry.candidate_hash,
          targetBaseHash: entry.target_base_hash,
          postMergeHash: '',
          success: false,
          error: err,
        });
        continue;
      }

      // Verify candidate_hash matches actual file hash
      const actualCandidateHash = calculateHash(candidateContent);
      if (actualCandidateHash !== entry.candidate_hash) {
        const err = `candidate_hash mismatch for ${entry.candidate_path}: manifest="${entry.candidate_hash}", actual="${actualCandidateHash}"`;
        errors.push(err);
        mergedFiles.push({
          candidatePath: entry.candidate_path,
          targetPath: entry.target_path,
          operation: 'replace',
          candidateHash: entry.candidate_hash,
          targetBaseHash: entry.target_base_hash,
          postMergeHash: '',
          success: false,
          error: err,
        });
        continue;
      }

      // Verify target_base_hash matches target file's hash before write
      const targetContent = readTarget(entry.target_path);
      const actualTargetHash = targetContent !== null ? calculateHash(targetContent) : calculateHash('');
      if (actualTargetHash !== entry.target_base_hash) {
        const err = `target_base_hash mismatch for ${entry.target_path}: manifest="${entry.target_base_hash}", actual="${actualTargetHash}"`;
        errors.push(err);
        mergedFiles.push({
          candidatePath: entry.candidate_path,
          targetPath: entry.target_path,
          operation: 'replace',
          candidateHash: entry.candidate_hash,
          targetBaseHash: entry.target_base_hash,
          postMergeHash: '',
          success: false,
          error: err,
        });
        continue;
      }

      // Validate candidate format (complete files only, no patches/diffs)
      const formatCheck = this.validateCandidateFormat(candidateContent);
      if (!formatCheck.valid) {
        const err = `Invalid candidate format for ${entry.candidate_path}: ${formatCheck.reason}`;
        errors.push(err);
        mergedFiles.push({
          candidatePath: entry.candidate_path,
          targetPath: entry.target_path,
          operation: 'replace',
          candidateHash: entry.candidate_hash,
          targetBaseHash: entry.target_base_hash,
          postMergeHash: '',
          success: false,
          error: err,
        });
        continue;
      }

      // Write to target
      const writeSuccess = writeTarget(entry.target_path, candidateContent);
      if (!writeSuccess) {
        const err = `Failed to write target: ${entry.target_path}`;
        errors.push(err);
        mergedFiles.push({
          candidatePath: entry.candidate_path,
          targetPath: entry.target_path,
          operation: 'replace',
          candidateHash: entry.candidate_hash,
          targetBaseHash: entry.target_base_hash,
          postMergeHash: '',
          success: false,
          error: err,
        });
        continue;
      }

      const postMergeHash = calculateHash(candidateContent);
      mergedFiles.push({
        candidatePath: entry.candidate_path,
        targetPath: entry.target_path,
        operation: 'replace',
        candidateHash: entry.candidate_hash,
        targetBaseHash: entry.target_base_hash,
        postMergeHash,
        success: true,
      });
    }

    return {
      success: errors.length === 0,
      mergedFiles,
      errors,
      newSpecVersion,
    };
  }

  /**
   * Generate v1.1 merge_report.md content with standard fields.
   */
  generateV11MergeReport(params: V11MergeReportParams): string {
    const lines: string[] = [
      '# Merge Report',
      '',
      `**Merge Status**: merged`,
      `**Work Item**: ${params.workItemId}`,
      `**Base Spec Version**: ${params.baseSpecVersion}`,
      `**New Spec Version**: ${params.newSpecVersion}`,
      `**Manifest Hash**: ${params.manifestHash}`,
      `**Executed At**: ${params.executedAt}`,
      `**Executor**: merge_runner`,
      '',
      '## Merged Files',
      '',
    ];

    let opIndex = 0;
    let successCount = 0;
    let failCount = 0;

    for (const file of params.mergedFiles) {
      opIndex++;
      const statusIcon = file.success ? '✅' : '❌';
      lines.push(`### ${opIndex}. ${file.targetPath}`);
      lines.push(`- **Source**: ${file.candidatePath}`);
      lines.push(`- **Target**: ${file.targetPath}`);
      lines.push(`- **Operation**: ${file.operation}`);
      lines.push(`- **Candidate Hash**: ${file.candidateHash}`);
      lines.push(`- **Target Base Hash**: ${file.targetBaseHash}`);
      lines.push(`- **Post-Merge Hash**: ${file.postMergeHash || 'N/A'}`);
      lines.push(`- **Status**: ${statusIcon} ${file.success ? 'Success' : 'Failed'}`);
      if (file.error) {
        lines.push(`- **Error**: ${file.error}`);
      }
      lines.push('');

      if (file.success) successCount++;
      else failCount++;
    }

    lines.push('## Summary');
    lines.push(`- Total operations: ${params.mergedFiles.length}`);
    lines.push(`- Successful: ${successCount}`);
    lines.push(`- Failed: ${failCount}`);

    return lines.join('\n');
  }

  /**
   * Validate post-merge conditions.
   * Requirements: 3.25, 3.26, 3.27, 3.28
   */
  validatePostMerge(params: {
    mergedFiles: MergedFile[];
    specVersionBefore: string;
    specVersionAfter: string;
    manifestExists: boolean;
  }): { passed: boolean; errors: string[] } {
    const errors: string[] = [];

    // Requirement 3.25: All target files correctly written
    const failedFiles = params.mergedFiles.filter((f) => !f.success);
    if (failedFiles.length > 0) {
      errors.push(`Failed merge operations: ${failedFiles.map((f) => f.targetPath).join(', ')}`);
    }

    // Requirement 3.26: Project spec version incremented
    if (params.specVersionBefore === params.specVersionAfter) {
      errors.push(`Project spec version not incremented: still ${params.specVersionBefore}`);
    }

    // Requirement 3.27: spec_manifest.json updated
    if (!params.manifestExists) {
      errors.push('spec_manifest.json not found after merge');
    }

    // Requirement 3.28: Transition to merged state on success
    // (state transition handled by caller)

    return {
      passed: errors.length === 0,
      errors,
    };
  }
}
