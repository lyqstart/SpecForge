import { afterEach, describe, expect, test } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  validateArtifactJson,
  validateModuleDefinitionCandidateJson,
} from '../../src/tools/lib/artifact-schema-validation.js';
import { validateFrozenModuleDefinitionCandidateSchemasForGate } from '../../src/tools/lib/gate-runner-v11.js';

const roots: string[] = [];
async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe('Phase 11 Module Definition Candidate canonical contract', () => {
  test('accepts one flat code_paths string array', () => {
    const result = validateModuleDefinitionCandidateJson(
      JSON.stringify({
        schema_version: '1.0',
        module_code: 'CORE',
        status: 'active',
        code_paths: ['src/**', 'test/**', 'package.json'],
      }),
      'CORE',
    );
    expect(result).toEqual({ valid: true, errors: [] });
  });

  test('rejects the Fresh-04 production/config/test grouped object', () => {
    const result = validateModuleDefinitionCandidateJson(
      JSON.stringify({
        schema_version: '1.0',
        module_code: 'CORE',
        code_paths: {
          production: ['src/domain/types.ts'],
          config: ['package.json'],
          test: ['test/domain/types.test.ts'],
        },
      }),
      'CORE',
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('MODULE_DEFINITION_CODE_PATHS_MUST_BE_ARRAY');
  });

  test('dispatches module.candidate.json validation at the controlled writer boundary', () => {
    const result = validateArtifactJson(
      'candidates/project/modules/CORE/module.candidate.json',
      JSON.stringify({
        module_code: 'CORE',
        code_paths: { production: ['src/**'], config: [], test: [] },
      }),
      'WI-0001',
      'requirement_change_path',
    );
    expect(result?.valid).toBe(false);
    expect(result?.errors.join('\n')).toContain('MODULE_DEFINITION_CODE_PATHS_MUST_BE_ARRAY');
  });

  test('rejects module identity mismatch and invalid path entries', () => {
    const result = validateModuleDefinitionCandidateJson(
      JSON.stringify({
        module_code: 'OTHER',
        code_paths: ['src/**', '  ', 'src/**'],
      }),
      'CORE',
    );
    expect(result.valid).toBe(false);
    const text = result.errors.join('\n');
    expect(text).toContain('MODULE_DEFINITION_MODULE_MISMATCH');
    expect(text).toContain('MODULE_DEFINITION_CODE_PATH_INVALID');
    expect(text).toContain('MODULE_DEFINITION_CODE_PATHS_DUPLICATE');
  });

  test('schema gate helper validates frozen Module Definition candidates', async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-module-schema-gate-'));
    roots.push(projectRoot);
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0001');
    await writeJson(path.join(workItemDir, 'candidate_manifest.json'), {
      schema_version: '1.1',
      work_item_id: 'WI-0001',
      workflow_path: 'requirement_change_path',
      entries: [{
        type: 'module_definition',
        module_id: 'CORE',
        candidate_path: 'candidates/project/modules/CORE/module.candidate.json',
        target_path: '.specforge/project/modules/CORE/module.json',
        operation: 'replace',
      }],
    });
    await writeJson(
      path.join(workItemDir, 'candidates', 'project', 'modules', 'CORE', 'module.candidate.json'),
      {
        module_code: 'CORE',
        code_paths: { production: ['src/**'], config: ['package.json'], test: [] },
      },
    );
    const result = await validateFrozenModuleDefinitionCandidateSchemasForGate({
      workItemId: 'WI-0001',
      workItemDir,
      projectRoot,
      workflowPath: 'requirement_change_path',
      workflowType: 'feature_spec',
      candidatePhase: 'full',
    });
    expect(result.inputFiles).toHaveLength(1);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]?.passed).toBe(false);
    expect(result.checks[0]?.details).toContain('MODULE_DEFINITION_CODE_PATHS_MUST_BE_ARRAY');
  });

  test('sf-design producer contract fixes code_paths to one flat array', async () => {
    const agentPath = path.resolve(
      process.cwd(),
      'setup/userlevel-opencode/agents/sf-design.md',
    );
    const content = await fs.readFile(agentPath, 'utf-8');
    expect(content).toContain('## Module Definition Candidate Canonical Producer Contract');
    expect(content).toContain('扁平字符串数组');
    expect(content).toContain('不得');
    expect(content).toContain('production: [...]');
    expect(content).toContain('sf_artifact_write(file_type=candidate_module_definition');
  });
});
