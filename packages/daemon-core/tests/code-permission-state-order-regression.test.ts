import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';

describe('code permission state ordering regression', () => {
  test('does not enter implementation_running until permission release succeeds', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'tools', 'handlers', 'sf-v11-code-permission.ts'),
      'utf8',
    );
    const helperStart = source.indexOf('async function advanceImplementationStateBeforeCode');
    const helperEnd = source.indexOf("type NormalizedWriteOperation", helperStart);
    const helper = source.slice(helperStart, helperEnd);
    expect(helper).not.toContain("toState: 'implementation_running'");

    const handlerStart = source.indexOf("registerHandler('sf_v11_code_permission'");
    const handler = source.slice(handlerStart);
    const prepareIndex = handler.indexOf('const preparedPermission = await prepareCodePermissionRelease');
    const statePreflightIndex = handler.indexOf('const preCommitState = await readAuthoritativeState');
    const commitIndex = handler.indexOf('const state = await commitPreparedCodePermissionRelease');
    const statePreparationIndex = handler.indexOf('statePreparation = await advanceImplementationStateBeforeCode');
    const runningIndex = handler.indexOf("toState: 'implementation_running'", statePreparationIndex);
    expect(prepareIndex).toBeGreaterThan(-1);
    expect(statePreflightIndex).toBeGreaterThan(prepareIndex);
    expect(commitIndex).toBeGreaterThan(statePreflightIndex);
    expect(commitIndex).toBeGreaterThan(prepareIndex);
    expect(statePreparationIndex).toBeGreaterThan(commitIndex);
    expect(runningIndex).toBeGreaterThan(statePreparationIndex);
    const revokeIndex = handler.indexOf('await revokeCodePermission', runningIndex);
    expect(revokeIndex).toBeGreaterThan(runningIndex);
  });

  test('preserves the original filesystem baseline across a recovery release', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'tools', 'handlers', 'sf-v11-code-permission.ts'),
      'utf8',
    );
    const baselineSectionStart = source.indexOf(
      "await fs.access(path.join(workItemDir, 'filesystem_baseline.json'))",
    );
    const snapshotIndex = source.indexOf('const baseline = takeSnapshot(projectRoot)', baselineSectionStart);
    const saveIndex = source.indexOf('saveBaseline(workItemDir, baseline)', snapshotIndex);

    expect(baselineSectionStart).toBeGreaterThan(-1);
    expect(snapshotIndex).toBeGreaterThan(baselineSectionStart);
    expect(saveIndex).toBeGreaterThan(snapshotIndex);
    const permissionCommitIndex = source.indexOf(
      'const state = await commitPreparedCodePermissionRelease',
      saveIndex,
    );
    expect(permissionCommitIndex).toBeGreaterThan(saveIndex);
  });
});
