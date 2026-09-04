import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  LAYOUT,
  resolveProjectPath,
  workItemCandidateDesign,
  workItemCandidateRequirements,
  workItemCandidateTasks,
  workItemCandidateTraceDelta,
  workItemSpecArtifactReadCandidates,
} from '../../types/src/directory-layout';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');

describe('current release shared directory layout', () => {
  it('classifies project config as a current layout surface', () => {
    const projectRoot = path.resolve('current-project');
    expect(LAYOUT.config).toBe('config');
    expect(LAYOUT.configFiles.project).toBe('config/project.json');
    expect(LAYOUT.configFiles.projectRules).toBe('config/project-rules.md');
    expect(LAYOUT.configFiles.prodEnv).toBe('config/prod-environment.md');
    expect(resolveProjectPath(projectRoot, 'config')).toBe(
      path.join(projectRoot, '.specforge', 'config')
    );
  });

  it('does not expose the P1 Knowledge Graph as a current layout surface', () => {
    expect('knowledge' in LAYOUT).toBe(false);
    expect('knowledgeFiles' in LAYOUT).toBe(false);
    const projectInit = fs.readFileSync(
      path.join(repositoryRoot, 'packages/daemon-core/src/tools/lib/sf_project_init_core.ts'),
      'utf8'
    );
    expect(projectInit).not.toContain("'specs/README.md'");
    expect(projectInit).not.toContain('Object.values(LAYOUT.knowledgeFiles)');
    expect(projectInit).not.toContain("'knowledge/graph.json'");

    const layoutSource = fs.readFileSync(
      path.join(repositoryRoot, 'packages/types/src/directory-layout.ts'),
      'utf8'
    );
    expect(layoutSource).not.toMatch(/legacyPaths\s*=\s*\{[\s\S]*?knowledgeGraph:/);
  });

  it('does not export the retired user-layout compatibility dictionary', () => {
    const source = fs.readFileSync(
      path.join(repositoryRoot, 'packages/types/src/directory-layout.ts'),
      'utf8'
    );
    const indexSource = fs.readFileSync(
      path.join(repositoryRoot, 'packages/types/src/index.ts'),
      'utf8'
    );

    expect(source).not.toContain('legacyUserLayoutReadOnly');
    expect(indexSource).not.toContain('legacyUserLayoutReadOnly');
    expect(indexSource).not.toContain('isLegacySpecPath');
  });

  it('makes current Daemon config consumers use LAYOUT.configFiles', () => {
    for (const relativePath of [
      'packages/daemon-core/src/tools/lib/sf_project_init_core.ts',
      'packages/daemon-core/src/tools/lib/sf_doctor_core.ts',
    ]) {
      const source = fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
      expect(source).toContain('LAYOUT.configFiles');
      expect(source).not.toContain('legacyPaths.configFiles');
    }

    const layoutSource = fs.readFileSync(
      path.join(repositoryRoot, 'packages/types/src/directory-layout.ts'),
      'utf8'
    );
    expect(layoutSource).not.toMatch(/legacyPaths\s*=\s*\{[\s\S]*?configFiles:/);
  });

  it('uses canonical Candidate artifacts without old-project read fallbacks', () => {
    const projectRoot = path.resolve('current-project');
    const workItemId = 'WI-0001';

    expect(
      workItemSpecArtifactReadCandidates(projectRoot, workItemId, 'requirements', 'AUTH')
    ).toEqual([workItemCandidateRequirements(projectRoot, workItemId, 'AUTH')]);
    expect(
      workItemSpecArtifactReadCandidates(projectRoot, workItemId, 'design', 'AUTH')
    ).toEqual([workItemCandidateDesign(projectRoot, workItemId, 'AUTH')]);
    expect(workItemSpecArtifactReadCandidates(projectRoot, workItemId, 'tasks')).toEqual([
      workItemCandidateTasks(projectRoot, workItemId),
    ]);
    expect(workItemSpecArtifactReadCandidates(projectRoot, workItemId, 'trace_delta')).toEqual([
      workItemCandidateTraceDelta(projectRoot, workItemId),
    ]);

    const layoutSource = fs.readFileSync(
      path.join(repositoryRoot, 'packages/types/src/directory-layout.ts'),
      'utf8'
    );
    expect(layoutSource).not.toContain('legacyWorkItemSpecArtifact');
    expect(layoutSource).not.toContain('specsReadOnly');
  });

  it('removes old specs tooling and current-flow documentation fallbacks', () => {
    expect(fs.existsSync(path.join(repositoryRoot, 'scripts/render-specs-readme.ts'))).toBe(false);

    const orchestrator = fs.readFileSync(
      path.join(repositoryRoot, 'setup/userlevel-opencode/agents/sf-orchestrator.md'),
      'utf8'
    );
    const intake = fs.readFileSync(
      path.join(repositoryRoot, 'setup/userlevel-opencode/skills/sf-intake/SKILL.md'),
      'utf8'
    );
    expect(orchestrator).not.toContain('`.specforge/manifest.json` 是当前运行时要求的项目初始化标记');
    expect(orchestrator).not.toContain('顶层同名文件仅用于历史数据的只读兼容回退');
    expect(intake).not.toContain('读取 manifest.json 中的 schema_version');
    expect(intake).not.toContain('请先运行迁移工具');
  });

  it('removes installer cross-root manifest fallback and old-project cleanup entry points', () => {
    expect(fs.existsSync(path.join(repositoryRoot, 'scripts/cleanup-project-runtime.ts'))).toBe(false);

    const atomicSource = fs.readFileSync(
      path.join(repositoryRoot, 'scripts/lib/atomic.ts'),
      'utf8'
    );
    expect(atomicSource).not.toContain('mayReadHomeLegacyManifest');
    expect(atomicSource).not.toContain('legacyHomeManifestPath');
    expect(atomicSource).not.toContain('getConfiguredUserLevelDirectory');
    expect(atomicSource).not.toContain('迁移兼容来源');

    const rendererSource = fs.readFileSync(
      path.join(repositoryRoot, 'scripts/render-layout.ts'),
      'utf8'
    );
    const generatedLayout = fs.readFileSync(
      path.join(repositoryRoot, 'docs/conventions/directory-layout.md'),
      'utf8'
    );
    expect(rendererSource).not.toContain('legacyPaths');
    expect(generatedLayout).not.toContain('## Legacy Paths');
  });

  it('removes old specs path constructors while retaining fail-closed path rejection', () => {
    expect(
      fs.existsSync(
        path.join(repositoryRoot, 'packages/daemon-core/src/tools/lib/path-service.ts')
      )
    ).toBe(false);

    const workflowPathService = fs.readFileSync(
      path.join(repositoryRoot, 'packages/workflow-runtime/src/v11/runtime/PathService.ts'),
      'utf8'
    );
    const protectedFileMatcher = fs.readFileSync(
      path.join(repositoryRoot, 'packages/workflow-runtime/src/rbac/ProtectedFileMatcher.ts'),
      'utf8'
    );

    expect(workflowPathService).not.toContain('legacySpecsDir(');
    expect(workflowPathService).toContain('isLegacySpecPath(');
    expect(protectedFileMatcher).not.toContain('.specforge/specs');
  });
});
