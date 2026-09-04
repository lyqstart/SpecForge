import { readFile } from 'fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export interface SchemaTransitionDescriptor {
  fromSchemaId: string
  toSchemaId: string
  assetId: string
}

export interface PersistentFileSchemaDescriptor {
  id: string
  owner: string
  relativePath: string
  format: 'json' | 'jsonl'
  required: boolean
  currentSchemaId: string
  validateCurrent: (value: unknown) => boolean
  transitions: readonly SchemaTransitionDescriptor[]
}

export type SchemaDescriptorCheckStatus =
  | 'current'
  | 'migration_required'
  | 'missing_optional'
  | 'blocked'

export type SchemaDescriptorErrorCode =
  | 'DESCRIPTOR_INVALID'
  | 'DESCRIPTOR_DUPLICATE'
  | 'PATH_OUTSIDE_ROOT'
  | 'FILE_REQUIRED'
  | 'FILE_READ_FAILED'
  | 'FILE_PARSE_FAILED'
  | 'SCHEMA_ID_MISSING'
  | 'SCHEMA_ID_INCONSISTENT'
  | 'VALIDATION_FAILED'
  | 'CHAIN_AMBIGUOUS'
  | 'CHAIN_CYCLE'
  | 'CHAIN_GAP'

export interface SchemaDescriptorCheck {
  descriptorId: string
  owner: string
  relativePath: string
  status: SchemaDescriptorCheckStatus
  observedSchemaId?: string
  currentSchemaId: string
  transitionAssetIds: string[]
  errorCode?: SchemaDescriptorErrorCode
  error?: string
}

export interface SchemaDescriptorPrecheckResult {
  ok: boolean
  needsMigration: boolean
  checks: SchemaDescriptorCheck[]
}

function blocked(
  descriptor: PersistentFileSchemaDescriptor,
  errorCode: SchemaDescriptorErrorCode,
  error: string,
): SchemaDescriptorCheck {
  return {
    descriptorId: descriptor.id,
    owner: descriptor.owner,
    relativePath: descriptor.relativePath,
    status: 'blocked',
    currentSchemaId: descriptor.currentSchemaId,
    transitionAssetIds: [],
    errorCode,
    error,
  }
}

function descriptorError(descriptor: PersistentFileSchemaDescriptor): string | undefined {
  if (!descriptor.id.trim()) return 'descriptor id is empty'
  if (!descriptor.owner.trim()) return 'descriptor owner is empty'
  if (!descriptor.relativePath.trim()) return 'descriptor relativePath is empty'
  if (!descriptor.currentSchemaId.trim()) return 'descriptor currentSchemaId is empty'
  if (descriptor.format !== 'json' && descriptor.format !== 'jsonl') {
    return `unsupported descriptor format: ${String(descriptor.format)}`
  }
  return undefined
}

function resolveWithinRoot(root: string, relativePath: string): string | undefined {
  if (isAbsolute(relativePath)) return undefined
  const absoluteRoot = resolve(root)
  const absolutePath = resolve(absoluteRoot, ...relativePath.replace(/\\/g, '/').split('/'))
  const fromRoot = relative(absoluteRoot, absolutePath)
  if (
    !fromRoot
    || fromRoot === '..'
    || fromRoot.startsWith(`..${sep}`)
    || isAbsolute(fromRoot)
  ) return undefined
  return absolutePath
}

function parseVersionedValues(
  content: string,
  format: PersistentFileSchemaDescriptor['format'],
): { values?: unknown[]; error?: string } {
  try {
    if (format === 'json') return { values: [JSON.parse(content) as unknown] }
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)
    if (lines.length === 0) return { error: 'JSONL file is empty' }
    return { values: lines.map((line) => JSON.parse(line) as unknown) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

function readSchemaIds(values: readonly unknown[]): { schemaId?: string; errorCode?: SchemaDescriptorErrorCode } {
  const ids: string[] = []
  for (const value of values) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { errorCode: 'SCHEMA_ID_MISSING' }
    }
    const schemaId = (value as Record<string, unknown>).schema_version
    if (typeof schemaId !== 'string' || !schemaId.trim()) {
      return { errorCode: 'SCHEMA_ID_MISSING' }
    }
    ids.push(schemaId)
  }
  if (new Set(ids).size !== 1) return { errorCode: 'SCHEMA_ID_INCONSISTENT' }
  return { schemaId: ids[0] }
}

function findTransitionChain(
  descriptor: PersistentFileSchemaDescriptor,
  observedSchemaId: string,
): { assetIds?: string[]; errorCode?: SchemaDescriptorErrorCode } {
  const bySource = new Map<string, SchemaTransitionDescriptor>()
  for (const transition of descriptor.transitions) {
    if (
      !transition.fromSchemaId.trim()
      || !transition.toSchemaId.trim()
      || !transition.assetId.trim()
      || bySource.has(transition.fromSchemaId)
    ) return { errorCode: 'CHAIN_AMBIGUOUS' }
    bySource.set(transition.fromSchemaId, transition)
  }

  const visited = new Set<string>()
  const assetIds: string[] = []
  let current = observedSchemaId
  while (current !== descriptor.currentSchemaId) {
    if (visited.has(current)) return { errorCode: 'CHAIN_CYCLE' }
    visited.add(current)
    const transition = bySource.get(current)
    if (!transition) return { errorCode: 'CHAIN_GAP' }
    assetIds.push(transition.assetId)
    current = transition.toSchemaId
  }
  return { assetIds }
}

async function checkDescriptor(
  root: string,
  descriptor: PersistentFileSchemaDescriptor,
): Promise<SchemaDescriptorCheck> {
  const invalid = descriptorError(descriptor)
  if (invalid) return blocked(descriptor, 'DESCRIPTOR_INVALID', invalid)

  const filePath = resolveWithinRoot(root, descriptor.relativePath)
  if (!filePath) {
    return blocked(descriptor, 'PATH_OUTSIDE_ROOT', 'descriptor path escapes the supplied root')
  }

  let content: string
  try {
    content = await readFile(filePath, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' && !descriptor.required) {
      return {
        descriptorId: descriptor.id,
        owner: descriptor.owner,
        relativePath: descriptor.relativePath,
        status: 'missing_optional',
        currentSchemaId: descriptor.currentSchemaId,
        transitionAssetIds: [],
      }
    }
    return blocked(
      descriptor,
      code === 'ENOENT' ? 'FILE_REQUIRED' : 'FILE_READ_FAILED',
      code === 'ENOENT' ? 'required persistent file is missing' : 'persistent file could not be read',
    )
  }

  const parsed = parseVersionedValues(content, descriptor.format)
  if (!parsed.values) return blocked(descriptor, 'FILE_PARSE_FAILED', parsed.error ?? 'parse failed')
  const schema = readSchemaIds(parsed.values)
  if (!schema.schemaId) {
    return blocked(
      descriptor,
      schema.errorCode ?? 'SCHEMA_ID_MISSING',
      'schema_version is missing or inconsistent',
    )
  }

  if (schema.schemaId === descriptor.currentSchemaId) {
    if (!parsed.values.every((value) => descriptor.validateCurrent(value))) {
      return blocked(descriptor, 'VALIDATION_FAILED', 'current-schema validation failed')
    }
    return {
      descriptorId: descriptor.id,
      owner: descriptor.owner,
      relativePath: descriptor.relativePath,
      status: 'current',
      observedSchemaId: schema.schemaId,
      currentSchemaId: descriptor.currentSchemaId,
      transitionAssetIds: [],
    }
  }

  const chain = findTransitionChain(descriptor, schema.schemaId)
  if (!chain.assetIds) {
    return {
      ...blocked(descriptor, chain.errorCode ?? 'CHAIN_GAP', 'no complete explicit transition chain'),
      observedSchemaId: schema.schemaId,
    }
  }
  return {
    descriptorId: descriptor.id,
    owner: descriptor.owner,
    relativePath: descriptor.relativePath,
    status: 'migration_required',
    observedSchemaId: schema.schemaId,
    currentSchemaId: descriptor.currentSchemaId,
    transitionAssetIds: chain.assetIds,
  }
}

export async function precheckSchemaDescriptors(
  root: string,
  descriptors: readonly PersistentFileSchemaDescriptor[],
): Promise<SchemaDescriptorPrecheckResult> {
  const seen = new Set<string>()
  const checks: SchemaDescriptorCheck[] = []
  for (const descriptor of descriptors) {
    if (seen.has(descriptor.id)) {
      checks.push(blocked(descriptor, 'DESCRIPTOR_DUPLICATE', 'descriptor id is duplicated'))
      continue
    }
    seen.add(descriptor.id)
    checks.push(await checkDescriptor(root, descriptor))
  }
  return {
    ok: checks.every((check) => check.status !== 'blocked'),
    needsMigration: checks.some((check) => check.status === 'migration_required'),
    checks,
  }
}
