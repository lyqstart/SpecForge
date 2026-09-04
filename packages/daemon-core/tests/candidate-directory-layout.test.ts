import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  SPEC_DIR_NAME,
  workItemCandidateDesign,
  workItemCandidateRequirements,
  workItemCandidateTasks,
  workItemCandidateTraceDelta,
  workItemSpecArtifactReadCandidates,
} from '@specforge/types/directory-layout';

const PROJECT_ROOT = path.join(path.sep, 'project');
const WORK_ITEM_ID = 'WI-0001';

function expected(...segments: string[]): string {
  return path.join(PROJECT_ROOT, SPEC_DIR_NAME, ...segments);
}

describe('Candidate Path Service', () => {
  it('builds canonical Candidate paths from the existing directory-layout authority', () => {
    expect(workItemCandidateRequirements(PROJECT_ROOT, WORK_ITEM_ID, 'AUTH')).toBe(
      expected(
        'work-items',
        WORK_ITEM_ID,
        'candidates',
        'project',
        'modules',
        'AUTH',
        'requirements.candidate.md'
      )
    );
    expect(workItemCandidateDesign(PROJECT_ROOT, WORK_ITEM_ID, 'AUTH')).toBe(
      expected(
        'work-items',
        WORK_ITEM_ID,
        'candidates',
        'project',
        'modules',
        'AUTH',
        'design.candidate.md'
      )
    );
    expect(workItemCandidateTasks(PROJECT_ROOT, WORK_ITEM_ID)).toBe(
      expected('work-items', WORK_ITEM_ID, 'candidates', 'tasks.md')
    );
    expect(workItemCandidateTraceDelta(PROJECT_ROOT, WORK_ITEM_ID)).toBe(
      expected('work-items', WORK_ITEM_ID, 'candidates', 'trace_delta.md')
    );
  });

  it('reads only canonical Candidate artifacts in the current release', () => {
    expect(
      workItemSpecArtifactReadCandidates(PROJECT_ROOT, WORK_ITEM_ID, 'requirements', 'AUTH')
    ).toEqual([workItemCandidateRequirements(PROJECT_ROOT, WORK_ITEM_ID, 'AUTH')]);
    expect(
      workItemSpecArtifactReadCandidates(PROJECT_ROOT, WORK_ITEM_ID, 'design', 'AUTH')
    ).toEqual([workItemCandidateDesign(PROJECT_ROOT, WORK_ITEM_ID, 'AUTH')]);
    expect(workItemSpecArtifactReadCandidates(PROJECT_ROOT, WORK_ITEM_ID, 'tasks')).toEqual([
      workItemCandidateTasks(PROJECT_ROOT, WORK_ITEM_ID),
    ]);
    expect(workItemSpecArtifactReadCandidates(PROJECT_ROOT, WORK_ITEM_ID, 'trace_delta')).toEqual([
      workItemCandidateTraceDelta(PROJECT_ROOT, WORK_ITEM_ID),
    ]);
  });
});
