import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { checkContractIntegrity } from './contract-integrity.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

async function makeFixture(contract: Record<string, unknown>): Promise<{
  projectRoot: string;
  workItemDir: string;
}> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'specforge-contract-integrity-'));
  roots.push(projectRoot);
  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0001');
  const candidateRel = 'candidates/project/modules/CORE/contracts.candidate.json';
  const candidatePath = path.join(workItemDir, candidateRel);
  await fs.mkdir(path.dirname(candidatePath), { recursive: true });
  await fs.writeFile(candidatePath, JSON.stringify(contract, null, 2) + '\n', 'utf-8');
  await fs.writeFile(
    path.join(workItemDir, 'candidate_manifest.json'),
    JSON.stringify(
      {
        schema_version: '1.0',
        workflow_path: 'requirement_change_path',
        entries: [
          {
            candidate_path: candidateRel,
            target_path: '.specforge/project/modules/CORE/contracts.json',
            operation: 'replace',
            type: 'module_contract',
          },
        ],
      },
      null,
      2
    ) + '\n',
    'utf-8'
  );
  return { projectRoot, workItemDir };
}

function validModuleContract(): Record<string, unknown> {
  return {
    schema_version: '1.0',
    owner_module: 'CORE',
    contracts: {
      shared_enums: [
        {
          id: 'MCON-CORE-001',
          owner_module: 'CORE',
          values: ['ready', 'blocked'],
          source_refs: ['DD-CORE-001'],
          enforcement: 'unit_test',
        },
      ],
      invariants: [],
      public_interfaces: [],
      extension_points: [],
    },
  };
}

describe('contract integrity - Module Contract candidates', () => {
  test('accepts a same-module contract with DD provenance and enforcement', async () => {
    const fixture = await makeFixture(validModuleContract());
    const result = await checkContractIntegrity(fixture);

    expect(result.registryTargeted).toBe(false);
    expect(result.checks.every(check => check.passed)).toBe(true);
    expect(result.checks.some(check => check.check_id === 'module_contract_core_candidate_integrity')).toBe(
      true
    );
  });

  test('rejects missing source_refs and enforcement before merge', async () => {
    const contract = validModuleContract();
    const sharedEnum = (contract.contracts as any).shared_enums[0];
    delete sharedEnum.source_refs;
    delete sharedEnum.enforcement;
    const fixture = await makeFixture(contract);
    const result = await checkContractIntegrity(fixture);
    const check = result.checks.find(
      item => item.check_id === 'module_contract_core_candidate_integrity'
    );

    expect(check?.passed).toBe(false);
    expect(check?.details).toContain('source_refs');
    expect(check?.details).toContain('enforcement');
  });

  test('rejects owner_module and DD provenance from another module', async () => {
    const contract = validModuleContract();
    contract.owner_module = 'OTHER';
    const sharedEnum = (contract.contracts as any).shared_enums[0];
    sharedEnum.owner_module = 'OTHER';
    sharedEnum.source_refs = ['DD-OTHER-001'];
    const fixture = await makeFixture(contract);
    const result = await checkContractIntegrity(fixture);
    const check = result.checks.find(
      item => item.check_id === 'module_contract_core_candidate_integrity'
    );

    expect(check?.passed).toBe(false);
    expect(check?.details).toContain('owner_module must equal target module CORE');
    expect(check?.details).toContain('expected CORE');
  });
});
