import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import {
  SPEC_DIR_NAME,
  SPEC_USER_DIR_NAME,
  LAYOUT,
  legacyPaths,
  legacyUserLayoutReadOnly,
  resolveProjectPath,
  projectSpecManifest,
  projectExtensionRegistry,
  projectRequirementsIndex,
  workItemRoot,
  workItemJson,
  workItemCandidateManifest,
  workItemGateSummary,
  workItemUserDecision,
  workItemVerificationReport,
  workItemMergeReport,
} from '../../packages/types/src/directory-layout';

function np(value: string): string {
  return path.normalize(value);
}

describe('SpecForge v1.1 directory layout contract', () => {
  const projectRoot = path.resolve('/repo/project');
  const workItemId = 'WI-0001';

  it('keeps the project-level .specforge directory name stable', () => {
    expect(SPEC_DIR_NAME).toBe('.specforge');
    expect(SPEC_USER_DIR_NAME).toBe('.specforge');
  });

  it('declares the v1.1 project and work item layout keys', () => {
    expect(LAYOUT).toHaveProperty('project');
    expect(LAYOUT).toHaveProperty('projectFiles');
    expect(LAYOUT).toHaveProperty('workItems');
    expect(LAYOUT).toHaveProperty('runtime');

    expect((LAYOUT as any).project).toBe('project');
    expect((LAYOUT as any).workItems).toBe('work-items');
    expect((LAYOUT as any).projectFiles.specManifest).toBe('project/spec_manifest.json');
    expect((LAYOUT as any).projectFiles.extensionRegistry).toBe('project/extension_registry.json');
  });

  it('keeps old project paths only under legacyPaths', () => {
    expect(legacyPaths.specsReadOnly).toBe('specs');
    expect(legacyPaths.manifest).toBe('manifest.json');
    expect(legacyPaths.config).toBe('config');
    expect(Object.prototype.hasOwnProperty.call(LAYOUT, 'specs')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(LAYOUT, 'manifest')).toBe(false);
  });

  it('keeps old user-level ~/.specforge paths read-only under legacyUserLayoutReadOnly', () => {
    expect(legacyUserLayoutReadOnly.runtimeHandshake).toBe('runtime/handshake.json');
    expect(legacyUserLayoutReadOnly.runtimeState).toBe('runtime/state.json');
    expect(legacyUserLayoutReadOnly.hostProfile).toBe('host-profile.json');
  });

  it('resolves v1.1 project-level paths through the canonical Path Service', () => {
    expect(np(resolveProjectPath(projectRoot, 'project'))).toBe(np(path.join(projectRoot, '.specforge', 'project')));
    expect(np(projectSpecManifest(projectRoot))).toBe(np(path.join(projectRoot, '.specforge', 'project', 'spec_manifest.json')));
    expect(np(projectExtensionRegistry(projectRoot))).toBe(np(path.join(projectRoot, '.specforge', 'project', 'extension_registry.json')));
    expect(np(projectRequirementsIndex(projectRoot))).toBe(np(path.join(projectRoot, '.specforge', 'project', 'requirements_index.md')));
  });

  it('resolves v1.1 Work Item transaction paths through canonical helpers', () => {
    const wiRoot = path.join(projectRoot, '.specforge', 'work-items', workItemId);

    expect(np(workItemRoot(projectRoot, workItemId))).toBe(np(wiRoot));
    expect(np(workItemJson(projectRoot, workItemId))).toBe(np(path.join(wiRoot, 'work_item.json')));
    expect(np(workItemCandidateManifest(projectRoot, workItemId))).toBe(np(path.join(wiRoot, 'candidate_manifest.json')));
    expect(np(workItemGateSummary(projectRoot, workItemId))).toBe(np(path.join(wiRoot, 'gate_summary.md')));
    expect(np(workItemUserDecision(projectRoot, workItemId))).toBe(np(path.join(wiRoot, 'user_decision.json')));
    expect(np(workItemVerificationReport(projectRoot, workItemId))).toBe(np(path.join(wiRoot, 'verification_report.md')));
    expect(np(workItemMergeReport(projectRoot, workItemId))).toBe(np(path.join(wiRoot, 'merge_report.md')));
  });
});
