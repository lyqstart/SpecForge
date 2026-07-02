import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const pluginPath = path.resolve('setup/userlevel-opencode/plugins/sf_specforge.ts');

describe('v1.2.6 plugin hard_stop recovery pass-through', () => {
  test('user-level plugin allows sf_hard_stop_resolve to pass through active hard_stop guard', () => {
    const source = fs.readFileSync(pluginPath, 'utf-8');

    const functionStart = source.indexOf('function assertNoRelevantHardStop');
    expect(functionStart).toBeGreaterThanOrEqual(0);

    const functionEnd = source.indexOf('function assertCodePermissionEnableHasAllowedFiles', functionStart);
    expect(functionEnd).toBeGreaterThan(functionStart);

    const body = source.slice(functionStart, functionEnd);

    const exemptionIndex = body.indexOf('sf_hard_stop_resolve');
    const readRecordIndex = body.indexOf('readHardStopRecord(projectDir, argWorkItemId)');

    expect(exemptionIndex).toBeGreaterThanOrEqual(0);
    expect(readRecordIndex).toBeGreaterThanOrEqual(0);
    expect(exemptionIndex).toBeLessThan(readRecordIndex);

    expect(body).toContain('normalizeToolName(toolName)');
    expect(body).toContain('sfhardstopresolve');
    expect(body).toContain('structured recovery path');
  });

  test('plugin still blocks ordinary tools when active hard_stop exists', () => {
    const source = fs.readFileSync(pluginPath, 'utf-8');
    const functionStart = source.indexOf('function assertNoRelevantHardStop');
    const functionEnd = source.indexOf('function assertCodePermissionEnableHasAllowedFiles', functionStart);
    const body = source.slice(functionStart, functionEnd);

    expect(body).toContain('readHardStopRecord(projectDir, argWorkItemId)');
    expect(body).toContain('Tool "${toolName}" is not allowed');
    expect(body).toContain('Only read/debug tools are permitted for that work item.');
  });
});
