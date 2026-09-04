import type { PersistentFileSchemaDescriptor } from '@specforge/migration'
import { precheckSchemaDescriptors, type SchemaDescriptorPrecheckResult } from '@specforge/migration'
import { PROJECT_CONFIG_SCHEMA_DESCRIPTOR } from '@specforge/configuration'
import { OBSERVABILITY_CONFIG_SCHEMA_DESCRIPTOR } from '@specforge/observability'
import { MODULE_CODE_PATTERN } from '@specforge/types'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const PROJECT_SPEC_MANIFEST_SCHEMA_VERSION = '1.0' as const
const PROJECT_REGISTRY_SCHEMA_VERSION = '1.0' as const
const PROJECT_MODULE_SCHEMA_VERSION = '1.0' as const
const LEGACY_MODULE_IDENTITY_FIELDS = ['name', 'module_id', 'module', 'id'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCanonicalModuleCode(value: unknown): value is string {
  return typeof value === 'string' && MODULE_CODE_PATTERN.test(value)
}

function canonicalModuleRoot(moduleCode: string): string {
  return `.specforge/project/modules/${moduleCode}`
}

function isCanonicalModuleManifestEntry(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !isCanonicalModuleCode(value.module_code)) return false
  if (LEGACY_MODULE_IDENTITY_FIELDS.some((field) => field in value)) return false
  const root = canonicalModuleRoot(value.module_code)
  return (
    value.path === root
    && value.module_file === `${root}/module.json`
    && value.requirements === `${root}/requirements.md`
    && value.design === `${root}/design.md`
    && value.trace === `${root}/trace.md`
  )
}

function isCurrentProjectSpecManifest(value: unknown): value is Record<string, unknown> & {
  default_module: string
  modules: Record<string, unknown>[]
} {
  if (!isRecord(value) || !isRecord(value.project)) return false
  if (
    typeof value.project_spec_version !== 'string'
    || value.project_spec_version.length === 0
    || typeof value.project_name !== 'string'
    || value.project_name.length === 0
    || !isCanonicalModuleCode(value.default_module)
    || !Array.isArray(value.modules)
    || value.modules.length === 0
    || !value.modules.every(isCanonicalModuleManifestEntry)
  ) return false
  const moduleCodes = value.modules.map((module) => module.module_code as string)
  return new Set(moduleCodes).size === moduleCodes.length && moduleCodes.includes(value.default_module)
}

export const PROJECT_REGISTRATION_SCHEMA_DESCRIPTORS: readonly PersistentFileSchemaDescriptor[] = [
  {
    id: 'project-spec-manifest',
    owner: '@specforge/daemon-core/project-spec',
    relativePath: '.specforge/project/spec_manifest.json',
    format: 'json',
    required: true,
    currentSchemaId: PROJECT_SPEC_MANIFEST_SCHEMA_VERSION,
    validateCurrent: isCurrentProjectSpecManifest,
    transitions: [],
  },
  PROJECT_CONFIG_SCHEMA_DESCRIPTOR,
  OBSERVABILITY_CONFIG_SCHEMA_DESCRIPTOR,
  {
    id: 'project-extension-registry',
    owner: '@specforge/daemon-core/project-spec-merge',
    relativePath: '.specforge/project/extension_registry.json',
    format: 'json',
    required: true,
    currentSchemaId: PROJECT_REGISTRY_SCHEMA_VERSION,
    validateCurrent: (value: unknown): boolean => {
      if (!isRecord(value)) return false
      return (
        typeof value.project_spec_version === 'string'
        && value.project_spec_version.length > 0
        && isRecord(value.namespaces)
        && isRecord(value.contracts)
      )
    },
    transitions: [],
  },
]

export function createProjectModuleSchemaDescriptors(
  manifest: unknown,
): readonly PersistentFileSchemaDescriptor[] {
  if (!isCurrentProjectSpecManifest(manifest)) return []
  return manifest.modules.map((entry) => {
    const moduleCode = entry.module_code as string
    return {
      id: `project-module-${moduleCode}`,
      owner: '@specforge/daemon-core/project-module',
      relativePath: `${canonicalModuleRoot(moduleCode)}/module.json`,
      format: 'json',
      required: true,
      currentSchemaId: PROJECT_MODULE_SCHEMA_VERSION,
      validateCurrent: (value: unknown): boolean => (
        isRecord(value)
        && value.module_code === moduleCode
        && !LEGACY_MODULE_IDENTITY_FIELDS.some((field) => field in value)
      ),
      transitions: [],
    }
  })
}

export async function precheckProjectRegistrationSchemas(
  projectPath: string,
): Promise<SchemaDescriptorPrecheckResult> {
  const staticResult = await precheckSchemaDescriptors(
    projectPath,
    PROJECT_REGISTRATION_SCHEMA_DESCRIPTORS,
  )
  if (!staticResult.ok || staticResult.needsMigration) return staticResult

  const manifest = JSON.parse(await readFile(
    join(projectPath, '.specforge', 'project', 'spec_manifest.json'),
    'utf8',
  )) as unknown
  const moduleResult = await precheckSchemaDescriptors(
    projectPath,
    createProjectModuleSchemaDescriptors(manifest),
  )
  return {
    ok: moduleResult.ok,
    needsMigration: moduleResult.needsMigration,
    checks: [...staticResult.checks, ...moduleResult.checks],
  }
}
