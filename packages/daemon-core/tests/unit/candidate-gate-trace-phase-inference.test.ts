import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { inferCandidatePhase } from '../../src/tools/handlers/sf-v11-gate-run';
import { getRequiredGates } from '../../src/tools/lib/required-gates';

const roots: string[] = [];
const workItemId = 'WI-0004';

async function makeCandidate(input: {
  entries?: Array<Record<string, unknown>>;
  files?: Record<string, string>;
} = {}): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'specforge-err220-'));
  roots.push(projectRoot);
  const workItemRoot = join(projectRoot, '.specforge', 'work-items', workItemId);
  await mkdir(workItemRoot, { recursive: true });

  for (const [relativePath, content] of Object.entries(input.files ?? {})) {
    const absolutePath = join(workItemRoot, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, 'utf-8');
  }

  await writeFile(
    join(workItemRoot, 'candidate_manifest.json'),
    JSON.stringify(
      {
        schema_version: '1.1',
        work_item_id: workItemId,
        workflow_path: 'spec_migration_path',
        entries: input.entries ?? [],
      },
      null,
      2,
    ),
    'utf-8',
  );

  return projectRoot;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('ERR-220 Candidate Gate trace-aware phase inference', () => {
  it('promotes design + frozen trace_delta to full so spec_migration includes trace_gate', async () => {
    const projectRoot = await makeCandidate({
      entries: [
        {
          candidate_path: 'candidates/project/modules/REPORTING/design.candidate.md',
          target_path: '.specforge/project/modules/REPORTING/design.md',
          operation: 'replace',
          type: 'design',
          module_id: 'REPORTING',
        },
        {
          candidate_path: 'candidates/trace_delta.md',
          target_path: '.specforge/project/trace_matrix.md',
          operation: 'replace',
          type: 'trace_delta',
        },
      ],
      files: {
        'candidates/project/modules/REPORTING/design.candidate.md': '# REPORTING design\n',
        'candidates/trace_delta.md': '# Trace Delta\nADD DD-REPORTING-002 constrained_by ReportFormat\n',
      },
    });

    const phase = await inferCandidatePhase(projectRoot, workItemId);
    expect(phase).toBe('full');
    expect(
      getRequiredGates('spec_migration_path', 'candidate', phase, 'spec_migration'),
    ).toContain('trace_gate');
  });

  it('keeps design-only Candidate at design', async () => {
    const projectRoot = await makeCandidate({
      entries: [
        {
          candidate_path: 'candidates/project/modules/REPORTING/design.candidate.md',
          target_path: '.specforge/project/modules/REPORTING/design.md',
          operation: 'replace',
          type: 'design',
          module_id: 'REPORTING',
        },
      ],
      files: {
        'candidates/project/modules/REPORTING/design.candidate.md': '# REPORTING design\n',
      },
    });

    expect(await inferCandidatePhase(projectRoot, workItemId)).toBe('design');
  });

  it('keeps requirements-only Candidate at requirements', async () => {
    const projectRoot = await makeCandidate({
      entries: [
        {
          candidate_path: 'candidates/project/modules/REPORTING/requirements.candidate.md',
          target_path: '.specforge/project/modules/REPORTING/requirements.md',
          operation: 'replace',
          type: 'requirements',
          module_id: 'REPORTING',
        },
      ],
      files: {
        'candidates/project/modules/REPORTING/requirements.candidate.md': '# REPORTING requirements\n',
      },
    });

    expect(await inferCandidatePhase(projectRoot, workItemId)).toBe('requirements');
  });

  it('keeps tasks Candidate at full', async () => {
    const projectRoot = await makeCandidate({
      entries: [
        {
          candidate_path: 'candidates/tasks.md',
          target_path: '.specforge/project/tasks.md',
          operation: 'replace',
          type: 'tasks',
        },
      ],
      files: {
        'candidates/tasks.md': '# Tasks\n',
      },
    });

    expect(await inferCandidatePhase(projectRoot, workItemId)).toBe('full');
  });

  it('keeps the empty/unknown fallback fail-closed at full', async () => {
    const projectRoot = await makeCandidate();
    expect(await inferCandidatePhase(projectRoot, workItemId)).toBe('full');
  });

  it('does not promote an orphan trace_delta file excluded from the frozen manifest', async () => {
    const projectRoot = await makeCandidate({
      entries: [
        {
          candidate_path: 'candidates/project/modules/REPORTING/design.candidate.md',
          target_path: '.specforge/project/modules/REPORTING/design.md',
          operation: 'replace',
          type: 'design',
          module_id: 'REPORTING',
        },
      ],
      files: {
        'candidates/project/modules/REPORTING/design.candidate.md': '# REPORTING design\n',
        'candidates/trace_delta.md': '# Historical trace delta excluded by Classification\n',
      },
    });

    expect(await inferCandidatePhase(projectRoot, workItemId)).toBe('design');
  });

  it('fails closed when the frozen manifest claims trace_delta but its Candidate file is missing', async () => {
    const projectRoot = await makeCandidate({
      entries: [
        {
          candidate_path: 'candidates/trace_delta.md',
          target_path: '.specforge/project/trace_matrix.md',
          operation: 'replace',
          type: 'trace_delta',
        },
      ],
    });

    await expect(inferCandidatePhase(projectRoot, workItemId)).rejects.toThrow(
      'frozen Candidate file not found',
    );
  });

  it('pins the phase profiles used by the WI-0004 reproduction', () => {
    expect(
      getRequiredGates('spec_migration_path', 'candidate', 'design', 'spec_migration'),
    ).not.toContain('trace_gate');
    expect(
      getRequiredGates('spec_migration_path', 'candidate', 'full', 'spec_migration'),
    ).toContain('trace_gate');
  });
});
