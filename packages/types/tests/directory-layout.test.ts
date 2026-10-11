import { describe, expect, it } from 'vitest';
import * as path from 'node:path';

import {
  SPEC_DIR_NAME,
  LAYOUT,
  legacyPaths,
  resolveProjectPath,
  projectSpecManifest,
  projectExtensionRegistry,
  workItemRoot,
  workItemCandidateManifest,
  workItemGateSummary,
  workItemUserDecision,
  workItemVerificationReport,
  workItemMergeReport,
} from '../src/directory-layout';
import {
  resolveOpenCodeConfigRoot,
  resolveSpecForgeHandshakePath,
  resolveSpecForgeManifestPath,
  resolveSpecForgeUserRoot,
} from '../src/user-level-paths';

const normalize = (value: string): string => path.normalize(value);

describe('current directory contracts', () => {
  const projectRoot = path.resolve('/repo/project');
  const workItemId = 'WI-0001';

  it('separates the project root from the user-level root', () => {
    const options = {
      env: { OPENCODE_CONFIG_DIR: path.resolve('/config/opencode') },
      homeDir: path.resolve('/home/user'),
    };
    expect(SPEC_DIR_NAME).toBe('.specforge');
    expect(resolveOpenCodeConfigRoot(options)).toBe(path.resolve('/config/opencode'));
    expect(resolveSpecForgeUserRoot(options)).toBe(
      path.join(path.resolve('/config/opencode'), 'sf-user'),
    );
    expect(resolveSpecForgeManifestPath(options)).toBe(
      path.join(path.resolve('/config/opencode'), 'specforge-manifest.json'),
    );
    expect(resolveSpecForgeHandshakePath(options)).toBe(
      path.join(path.resolve('/config/opencode'), 'sf-user', 'runtime', 'handshake.json'),
    );
  });

  it('exposes current project, Work Item and runtime paths but not old specs/knowledge surfaces', () => {
    expect(LAYOUT.project).toBe('project');
    expect(LAYOUT.workItems).toBe('work-items');
    expect(LAYOUT.runtimeFiles.events).toBe('runtime/events.jsonl');
    expect('specs' in LAYOUT).toBe(false);
    expect('knowledge' in LAYOUT).toBe(false);
    expect(legacyPaths).toEqual({ manifest: 'manifest.json' });
  });

  it('resolves current project and Work Item paths through canonical helpers', () => {
    const wiRoot = path.join(projectRoot, '.specforge', 'work-items', workItemId);
    expect(normalize(resolveProjectPath(projectRoot, 'project'))).toBe(
      normalize(path.join(projectRoot, '.specforge', 'project')),
    );
    expect(normalize(projectSpecManifest(projectRoot))).toBe(
      normalize(path.join(projectRoot, '.specforge', 'project', 'spec_manifest.json')),
    );
    expect(normalize(projectExtensionRegistry(projectRoot))).toBe(
      normalize(path.join(projectRoot, '.specforge', 'project', 'extension_registry.json')),
    );
    expect(normalize(workItemRoot(projectRoot, workItemId))).toBe(normalize(wiRoot));
    expect(normalize(workItemCandidateManifest(projectRoot, workItemId))).toBe(
      normalize(path.join(wiRoot, 'candidate_manifest.json')),
    );
    expect(normalize(workItemGateSummary(projectRoot, workItemId))).toBe(
      normalize(path.join(wiRoot, 'gate_summary.md')),
    );
    expect(normalize(workItemUserDecision(projectRoot, workItemId))).toBe(
      normalize(path.join(wiRoot, 'user_decision.json')),
    );
    expect(normalize(workItemVerificationReport(projectRoot, workItemId))).toBe(
      normalize(path.join(wiRoot, 'verification_report.md')),
    );
    expect(normalize(workItemMergeReport(projectRoot, workItemId))).toBe(
      normalize(path.join(wiRoot, 'merge_report.md')),
    );
  });
});
