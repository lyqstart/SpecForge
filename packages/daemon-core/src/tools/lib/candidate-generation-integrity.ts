import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  validateCurrentGateAttemptInputSnapshotValue,
  validateCurrentGateAttemptResultValue,
} from '@specforge/types';

const PROJECT_SPEC_VERSION_PATTERN = /^PSV-[0-9]{4,}$/;

export type CurrentProjectSpecBinding = {
  manifestPath: string;
  version: string;
  sha256: string;
};

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function snapshotSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function readCurrentProjectSpecBinding(
  projectRoot: string,
): Promise<CurrentProjectSpecBinding> {
  const manifestPath = path.join(
    projectRoot,
    '.specforge',
    'project',
    'spec_manifest.json',
  );
  let bytes: Buffer;
  let parsed: unknown;
  try {
    bytes = await fs.readFile(manifestPath);
    parsed = JSON.parse(bytes.toString('utf-8')) as unknown;
  } catch (error) {
    throw new Error(
      `PROJECT_SPEC_BINDING_UNAVAILABLE: ${manifestPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const version =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).project_spec_version
      : undefined;
  if (typeof version !== 'string' || !PROJECT_SPEC_VERSION_PATTERN.test(version)) {
    throw new Error(
      `PROJECT_SPEC_BINDING_INVALID: ${manifestPath} must contain a valid project_spec_version`,
    );
  }
  return {
    manifestPath,
    version,
    sha256: sha256(bytes),
  };
}

export async function validateCandidateProjectSpecBinding(input: {
  projectRoot: string;
  manifest: Record<string, unknown> | null | undefined;
}): Promise<{ valid: boolean; errors: string[]; binding?: CurrentProjectSpecBinding }> {
  const errors: string[] = [];
  let binding: CurrentProjectSpecBinding | undefined;
  try {
    binding = await readCurrentProjectSpecBinding(input.projectRoot);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { valid: false, errors };
  }

  const baseSpecVersion = input.manifest?.base_spec_version;
  const precondition = input.manifest?.project_spec_precondition_sha256;
  if (baseSpecVersion !== binding.version) {
    errors.push(
      `CANDIDATE_BASE_SPEC_VERSION_STALE: candidate=${String(baseSpecVersion ?? 'missing')}; current=${binding.version}`,
    );
  }
  if (precondition !== binding.sha256) {
    errors.push(
      `PROJECT_SPEC_PRECONDITION_STALE: candidate=${String(precondition ?? 'missing')}; current=${binding.sha256}`,
    );
  }
  return { valid: errors.length === 0, errors, binding };
}

async function walkFiles(root: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

export async function candidateSealInputPaths(workItemDir: string): Promise<string[]> {
  const fixed = [
    'candidate_manifest.json',
    'change_classification.md',
    'impact_analysis.md',
    'trigger_result.json',
  ].map(name => path.join(workItemDir, name));
  const candidates = await walkFiles(path.join(workItemDir, 'candidates'));
  return Array.from(new Set([...fixed, ...candidates].map(value => path.resolve(value)))).sort();
}

function inputIdentity(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function resolveSnapshotPath(projectRoot: string, snapshotPath: string): string {
  return path.isAbsolute(snapshotPath)
    ? path.normalize(snapshotPath)
    : path.resolve(projectRoot, snapshotPath);
}

async function validateSnapshotEntry(input: {
  projectRoot: string;
  entry: {
    path: string;
    exists: boolean;
    kind: 'file' | 'directory' | 'other' | 'missing';
    sha256?: string;
  };
  errors: string[];
}): Promise<void> {
  const resolved = resolveSnapshotPath(input.projectRoot, input.entry.path);
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      if (input.entry.exists) {
        input.errors.push(`GATE_ATTEMPT_INPUT_MISSING: ${input.entry.path}`);
      }
      return;
    }
    input.errors.push(
      `GATE_ATTEMPT_INPUT_READ_FAILED: ${input.entry.path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  if (!input.entry.exists) {
    input.errors.push(`GATE_ATTEMPT_INPUT_APPEARED: ${input.entry.path}`);
    return;
  }
  const actualKind = stat.isFile()
    ? 'file'
    : stat.isDirectory()
      ? 'directory'
      : 'other';
  if (actualKind !== input.entry.kind) {
    input.errors.push(
      `GATE_ATTEMPT_INPUT_KIND_CHANGED: ${input.entry.path}; expected=${input.entry.kind}; actual=${actualKind}`,
    );
    return;
  }
  if (actualKind === 'file') {
    const expected = String(input.entry.sha256 ?? '');
    if (!/^[0-9a-f]{64}$/i.test(expected)) {
      input.errors.push(`GATE_ATTEMPT_INPUT_HASH_INVALID: ${input.entry.path}`);
      return;
    }
    const actual = snapshotSha256(await fs.readFile(resolved));
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      input.errors.push(
        `GATE_ATTEMPT_INPUT_HASH_CHANGED: ${input.entry.path}; expected=${expected}; actual=${actual}`,
      );
    }
  }
}

export async function validatePassingCandidateGateAttempt(input: {
  projectRoot: string;
  workItemDir: string;
  gateSummaryHash: string;
  requireLatestAttempt: boolean;
}): Promise<{ valid: boolean; errors: string[]; attemptId?: string }> {
  const errors: string[] = [];
  const attemptsRoot = path.join(input.workItemDir, 'gate_attempts');
  let attemptIds: string[];
  try {
    attemptIds = (await fs.readdir(attemptsRoot, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && /^attempt-\d{4}$/.test(entry.name))
      .map(entry => entry.name)
      .sort();
  } catch (error) {
    return {
      valid: false,
      errors: [`GATE_ATTEMPT_EVIDENCE_UNAVAILABLE: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  let matchedAttemptId: string | undefined;
  for (const attemptId of [...attemptIds].reverse()) {
    try {
      const summaryBytes = await fs.readFile(path.join(attemptsRoot, attemptId, 'gate_summary.md'));
      if (sha256(summaryBytes) === input.gateSummaryHash) {
        matchedAttemptId = attemptId;
        break;
      }
    } catch {
      // Invalid attempts are rejected below if no valid summary match exists.
    }
  }
  if (!matchedAttemptId) {
    return {
      valid: false,
      errors: ['GATE_ATTEMPT_SUMMARY_BINDING_MISSING: no immutable Attempt matches gate_summary hash'],
    };
  }
  if (input.requireLatestAttempt && matchedAttemptId !== attemptIds.at(-1)) {
    errors.push(
      `GATE_ATTEMPT_NOT_LATEST: matched=${matchedAttemptId}; latest=${attemptIds.at(-1) ?? 'none'}`,
    );
  }

  const attemptPath = path.join(attemptsRoot, matchedAttemptId);
  let resultRaw: unknown;
  let snapshotRaw: unknown;
  try {
    [resultRaw, snapshotRaw] = await Promise.all([
      fs.readFile(path.join(attemptPath, 'attempt-result.json'), 'utf-8').then(JSON.parse),
      fs.readFile(path.join(attemptPath, 'input-snapshot.json'), 'utf-8').then(JSON.parse),
    ]);
  } catch (error) {
    return {
      valid: false,
      errors: [`GATE_ATTEMPT_BINDING_EVIDENCE_INVALID: ${error instanceof Error ? error.message : String(error)}`],
      attemptId: matchedAttemptId,
    };
  }

  const resultValidation = validateCurrentGateAttemptResultValue(resultRaw);
  const snapshotValidation = validateCurrentGateAttemptInputSnapshotValue(snapshotRaw);
  const result = resultValidation.value;
  const snapshot = snapshotValidation.value;
  if (!result || !('summary_status' in result)) {
    errors.push(`GATE_ATTEMPT_RESULT_INVALID: ${resultValidation.errors.join('; ')}`);
  } else {
    if (result.attempt_id !== matchedAttemptId || result.summary_status !== 'passed') {
      errors.push(
        `GATE_ATTEMPT_NOT_PASSED: attempt=${matchedAttemptId}; status=${String(result.summary_status)}`,
      );
    }
    if (!result.current_report_gate_ids.includes('candidate_manifest_gate')) {
      errors.push(`GATE_ATTEMPT_CANDIDATE_GATE_MISSING: attempt=${matchedAttemptId}`);
    }
  }
  if (!snapshot || snapshot.attempt_id !== matchedAttemptId) {
    errors.push(`GATE_ATTEMPT_INPUT_SNAPSHOT_INVALID: ${snapshotValidation.errors.join('; ')}`);
    return { valid: false, errors, attemptId: matchedAttemptId };
  }

  const snapshotByIdentity = new Map(
    snapshot.inputs.map(entry => [
      inputIdentity(resolveSnapshotPath(input.projectRoot, entry.path)),
      entry,
    ]),
  );
  for (const entry of snapshot.inputs) {
    await validateSnapshotEntry({ projectRoot: input.projectRoot, entry, errors });
  }
  for (const sealPath of await candidateSealInputPaths(input.workItemDir)) {
    const entry = snapshotByIdentity.get(inputIdentity(sealPath));
    if (!entry || entry.exists !== true || entry.kind !== 'file') {
      errors.push(
        `GATE_ATTEMPT_CANDIDATE_SEAL_INPUT_MISSING: ${path.relative(input.projectRoot, sealPath).replace(/\\/g, '/')}`,
      );
    }
  }
  return { valid: errors.length === 0, errors, attemptId: matchedAttemptId };
}
