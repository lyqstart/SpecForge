import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  candidateSealInputPaths,
  readCurrentProjectSpecBinding,
} from '../../src/tools/lib/candidate-generation-integrity';
import { buildGateAttemptInputSnapshot } from '../../src/tools/lib/gate-chain';
import type { GateReportV11 } from '../../src/tools/lib/gate-runner-v11';
import { recordUserDecision } from '../../src/tools/lib/user-decision-recorder-v11';

function sha256(bytes: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

async function ensureFile(filePath: string, content: string): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.isFile()) return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

function candidateManifestReport(
  workItemId: string,
  projectSpecManifestPath: string,
): GateReportV11 {
  return {
    schema_version: '1.0',
    work_item_id: workItemId,
    gate_id: 'candidate_manifest_gate',
    gate_type: 'hard_gate',
    required: true,
    status: 'passed',
    input_files: [projectSpecManifestPath],
    checks: [{ check_id: 'candidate_generation_fixture', description: 'fixture seal', passed: true }],
    blocking_issues: [],
    warnings: [],
    waiver_allowed: false,
    waiver_required: false,
    waiver_ids: [],
    started_at: '2026-10-15T00:00:00.000Z',
    finished_at: '2026-10-15T00:00:01.000Z',
    runner: 'gate_runner',
  };
}

export async function sealPassingCandidateAttemptFixture(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
}): Promise<{ attemptId: string; baseSpecVersion: string; gateSummaryHash: string }> {
  const binding = await readCurrentProjectSpecBinding(input.projectRoot);
  const manifestPath = path.join(input.workItemDir, 'candidate_manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as Record<string, unknown>;
  manifest.base_spec_version = binding.version;
  manifest.project_spec_precondition_sha256 = binding.sha256;
  await writeJson(manifestPath, manifest);

  await ensureFile(
    path.join(input.workItemDir, 'change_classification.md'),
    '# Change Classification\n\nFixture classification.\n',
  );
  await ensureFile(
    path.join(input.workItemDir, 'impact_analysis.md'),
    '# Impact Analysis\n\nFixture impact.\n',
  );
  await ensureFile(
    path.join(input.workItemDir, 'trigger_result.json'),
    JSON.stringify({ work_item_id: input.workItemId }) + '\n',
  );

  const attemptsRoot = path.join(input.workItemDir, 'gate_attempts');
  let existing: string[] = [];
  try {
    existing = (await fs.readdir(attemptsRoot, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && /^attempt-\d{4}$/.test(entry.name))
      .map(entry => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const attemptId = `attempt-${String(existing.length + 1).padStart(4, '0')}`;
  const attemptPath = path.join(attemptsRoot, attemptId);
  await fs.mkdir(path.join(attemptPath, 'gates'), { recursive: true });

  const report = candidateManifestReport(input.workItemId, binding.manifestPath);
  const summary = [
    '# Gate Summary',
    '',
    `Work Item: ${input.workItemId}`,
    'Overall Status: passed',
    'Generated: 2026-10-15T00:00:01.000Z',
    '',
    '## Gate Reports',
    '',
    '### candidate_manifest_gate',
    '- Type: hard_gate',
    '- Status: passed',
    '- Required: true',
    '',
    '## User Decision Required',
    '',
    'All required gates passed. Non-blocking warnings do not require a waiver.',
  ].join('\n');
  await fs.writeFile(path.join(input.workItemDir, 'gate_summary.md'), summary, 'utf-8');
  await fs.writeFile(path.join(attemptPath, 'gate_summary.md'), summary, 'utf-8');
  await writeJson(path.join(attemptPath, 'gates', 'candidate_manifest_gate.json'), report);

  const startedAt = '2026-10-15T00:00:00.000Z';
  const completedAt = '2026-10-15T00:00:01.000Z';
  await writeJson(path.join(attemptPath, 'attempt-start.json'), {
    schema_version: '1.0',
    attempt_id: attemptId,
    work_item_id: input.workItemId,
    source: 'gate_run',
    started_at: startedAt,
    requested_gate_ids: ['candidate_manifest_gate'],
  });
  const inputs = await buildGateAttemptInputSnapshot(
    input.projectRoot,
    [report],
    process.platform,
    await candidateSealInputPaths(input.workItemDir),
  );
  await writeJson(path.join(attemptPath, 'input-snapshot.json'), {
    schema_version: '1.0',
    attempt_id: attemptId,
    work_item_id: input.workItemId,
    captured_at: completedAt,
    inputs,
  });
  await writeJson(path.join(attemptPath, 'attempt-result.json'), {
    schema_version: '1.0',
    attempt_id: attemptId,
    work_item_id: input.workItemId,
    source: 'gate_run',
    started_at: startedAt,
    completed_at: completedAt,
    requested_gate_ids: ['candidate_manifest_gate'],
    current_report_gate_ids: ['candidate_manifest_gate'],
    summary_report_gate_ids: ['candidate_manifest_gate'],
    summary_status: 'passed',
    input_snapshot: 'input-snapshot.json',
  });
  return {
    attemptId,
    baseSpecVersion: binding.version,
    gateSummaryHash: sha256(summary),
  };
}

export async function approveSealedCandidateFixture(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
  workflowPath: string;
}): Promise<void> {
  const sealed = await sealPassingCandidateAttemptFixture(input);
  await recordUserDecision({
    workItemDir: input.workItemDir,
    workItemId: input.workItemId,
    workflowPath: input.workflowPath,
    baseSpecVersion: sealed.baseSpecVersion,
    candidateManifestPath: 'candidate_manifest.json',
    gateSummaryPath: 'gate_summary.md',
    decisionStatus: 'approved',
    decisionType: 'user_approved',
    decidedBy: 'human user',
    decisionScope: 'full',
    userResponseQuote: '批准',
  });
}
