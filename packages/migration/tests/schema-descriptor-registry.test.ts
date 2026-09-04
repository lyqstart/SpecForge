import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  precheckSchemaDescriptors,
  type PersistentFileSchemaDescriptor,
} from '../src/schema-descriptor-registry'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function projectRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), 'specforge-schema-registry-'))
  roots.push(root)
  return root
}

function descriptor(
  overrides: Partial<PersistentFileSchemaDescriptor> = {},
): PersistentFileSchemaDescriptor {
  return {
    id: 'project-spec-manifest',
    owner: '@specforge/daemon-core/project-spec',
    relativePath: '.specforge/project/spec_manifest.json',
    format: 'json',
    required: true,
    currentSchemaId: '1.0',
    validateCurrent: (value) =>
      typeof value === 'object' && value !== null && 'project_spec_version' in value,
    transitions: [],
    ...overrides,
  }
}

describe('per-file schema descriptor registry', () => {
  it('accepts heterogeneous exact schema ids without global semver comparison', async () => {
    const root = await projectRoot()
    await mkdir(resolve(root, '.specforge/project'), { recursive: true })
    await writeFile(
      resolve(root, '.specforge/project/spec_manifest.json'),
      JSON.stringify({ schema_version: '1.0', project_spec_version: 'PSV-0001' }),
    )
    await writeFile(
      resolve(root, '.specforge/project/git_plan.json'),
      JSON.stringify({ schema_version: 'git_pr_plan.v1', branches: [] }),
    )

    const result = await precheckSchemaDescriptors(root, [
      descriptor(),
      descriptor({
        id: 'git-pr-plan',
        relativePath: '.specforge/project/git_plan.json',
        currentSchemaId: 'git_pr_plan.v1',
        validateCurrent: (value) =>
          typeof value === 'object' && value !== null && 'branches' in value,
      }),
    ])

    expect(result.ok).toBe(true)
    expect(result.needsMigration).toBe(false)
    expect(result.checks.map((check) => check.status)).toEqual(['current', 'current'])
  })

  it('selects only an explicit complete directed transition chain', async () => {
    const root = await projectRoot()
    await mkdir(resolve(root, '.specforge/project'), { recursive: true })
    await writeFile(
      resolve(root, '.specforge/project/spec_manifest.json'),
      JSON.stringify({ schema_version: '1.0', project_spec_version: 'PSV-0001' }),
    )

    const result = await precheckSchemaDescriptors(root, [
      descriptor({
        currentSchemaId: '1.2',
        transitions: [
          { fromSchemaId: '1.0', toSchemaId: '1.1', assetId: 'migration:spec:1.0:1.1' },
          { fromSchemaId: '1.1', toSchemaId: '1.2', assetId: 'migration:spec:1.1:1.2' },
        ],
      }),
    ])

    expect(result.ok).toBe(true)
    expect(result.needsMigration).toBe(true)
    expect(result.checks[0]).toMatchObject({
      status: 'migration_required',
      observedSchemaId: '1.0',
      transitionAssetIds: ['migration:spec:1.0:1.1', 'migration:spec:1.1:1.2'],
    })
  })

  it('fails closed for a chain gap, invalid current content, or a missing required file', async () => {
    const root = await projectRoot()
    await mkdir(resolve(root, '.specforge/project'), { recursive: true })
    await writeFile(
      resolve(root, '.specforge/project/spec_manifest.json'),
      JSON.stringify({ schema_version: '0.9', project_spec_version: 'PSV-0001' }),
    )

    const gap = await precheckSchemaDescriptors(root, [descriptor()])
    expect(gap.ok).toBe(false)
    expect(gap.checks[0]).toMatchObject({ status: 'blocked', errorCode: 'CHAIN_GAP' })

    await writeFile(
      resolve(root, '.specforge/project/spec_manifest.json'),
      JSON.stringify({ schema_version: '1.0' }),
    )
    const invalid = await precheckSchemaDescriptors(root, [descriptor()])
    expect(invalid.ok).toBe(false)
    expect(invalid.checks[0]).toMatchObject({ status: 'blocked', errorCode: 'VALIDATION_FAILED' })

    await rm(resolve(root, '.specforge/project/spec_manifest.json'))
    const missing = await precheckSchemaDescriptors(root, [descriptor()])
    expect(missing.ok).toBe(false)
    expect(missing.checks[0]).toMatchObject({ status: 'blocked', errorCode: 'FILE_REQUIRED' })
  })

  it('skips a missing optional file and rejects paths outside the supplied root', async () => {
    const root = await projectRoot()
    const optional = await precheckSchemaDescriptors(root, [
      descriptor({ required: false }),
    ])
    expect(optional.ok).toBe(true)
    expect(optional.checks[0].status).toBe('missing_optional')

    const escaping = await precheckSchemaDescriptors(root, [
      descriptor({ relativePath: '../outside.json' }),
    ])
    expect(escaping.ok).toBe(false)
    expect(escaping.checks[0]).toMatchObject({ status: 'blocked', errorCode: 'PATH_OUTSIDE_ROOT' })
  })
})
