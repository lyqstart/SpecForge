import type {
  ApprovedReleaseItem,
  ArtifactInventory,
  ArtifactItem,
  ArtifactSurface,
  ReleaseClassification,
} from './release-set-validator';
import { z } from 'zod';

export type ReleaseAuthorityRole =
  | 'v6_requirements'
  | 'v6_design'
  | 'module_disposition_matrix';

export interface ReleaseAuthoritySource {
  role: ReleaseAuthorityRole;
  path: string;
  sha256: string;
}

export interface ReleaseAuthorityDocument {
  schemaVersion: '1.0';
  releaseId: string;
  complete: boolean;
  sources: readonly ReleaseAuthoritySource[];
  items: readonly ApprovedReleaseItem[];
}

export interface NormalizedReleaseAuthority {
  ok: boolean;
  releaseId: string;
  sources: readonly ReleaseAuthoritySource[];
  items: readonly ApprovedReleaseItem[];
  errors: readonly string[];
}

export interface ArtifactInventoryDocument extends ArtifactInventory {
  schemaVersion: '1.0';
  releaseId: string;
  candidateId: string;
  producer: string;
}

export interface NormalizedArtifactInventory {
  ok: boolean;
  releaseId: string;
  candidateId: string;
  producer: string;
  inventory: ArtifactInventory;
  errors: readonly string[];
}

const AUTHORITY_ROLES = [
  'module_disposition_matrix',
  'v6_design',
  'v6_requirements',
] as const satisfies readonly ReleaseAuthorityRole[];

const RELEASE_CLASSIFICATIONS = [
  'BUILT_NOT_ENABLED',
  'CURRENT_RELEASE_CORE',
  'CURRENT_RELEASE_SUPPORTING',
  'HISTORICAL_EVIDENCE_ONLY',
  'LEGACY_ONLY',
] as const satisfies readonly ReleaseClassification[];

const ARTIFACT_SURFACES = [
  'clean_build',
  'dynamic_registry',
  'installer_asset',
  'package_export',
  'release_manifest',
  'runtime_entry',
] as const satisfies readonly ArtifactSurface[];

const CURRENT_CLASSIFICATIONS = new Set<ReleaseClassification>([
  'CURRENT_RELEASE_CORE',
  'CURRENT_RELEASE_SUPPORTING',
]);

const RELEASE_CLASSIFICATION_SET = new Set<ReleaseClassification>(RELEASE_CLASSIFICATIONS);
const ARTIFACT_SURFACE_SET = new Set<ArtifactSurface>(ARTIFACT_SURFACES);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const authoritySourceSchema = z.object({
  role: z.enum(AUTHORITY_ROLES),
  path: z.string(),
  sha256: z.string(),
}).strict();

const approvedReleaseItemSchema = z.object({
  id: z.string(),
  classification: z.enum(RELEASE_CLASSIFICATIONS),
  requiredSurfaces: z.array(z.enum(ARTIFACT_SURFACES)),
  dependencies: z.array(z.string()),
  authoritySources: z.array(z.string()),
}).strict();

const releaseAuthorityDocumentSchema = z.object({
  schemaVersion: z.literal('1.0'),
  releaseId: z.string(),
  complete: z.boolean(),
  sources: z.array(authoritySourceSchema),
  items: z.array(approvedReleaseItemSchema),
}).strict();

const artifactItemSchema = z.object({
  id: z.string(),
  surface: z.enum(ARTIFACT_SURFACES),
  path: z.string(),
  sha256: z.string().optional(),
  dependencies: z.array(z.string()),
}).strict();

const artifactInventoryDocumentSchema = z.object({
  schemaVersion: z.literal('1.0'),
  releaseId: z.string(),
  candidateId: z.string(),
  producer: z.string(),
  complete: z.boolean(),
  enumeratedSurfaces: z.array(z.enum(ARTIFACT_SURFACES)),
  items: z.array(artifactItemSchema),
}).strict();

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isCandidateRelativePath(value: string): boolean {
  const normalized = value.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) {
    return false;
  }
  return !normalized.split('/').includes('..');
}

function normalizeStrings(values: readonly string[]): string[] {
  return sortedUnique(values.map((value) => value.trim()).filter(Boolean));
}

function malformedDocumentErrors(
  prefix: 'authority_document' | 'inventory_document',
  issues: readonly z.core.$ZodIssue[],
): string[] {
  return sortedUnique(issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    return `${prefix}:${field}:invalid`;
  }));
}

function normalizeAuthorityItem(item: ApprovedReleaseItem): ApprovedReleaseItem {
  return {
    id: item.id.trim(),
    classification: item.classification,
    requiredSurfaces: sortedUnique(item.requiredSurfaces) as ArtifactSurface[],
    dependencies: normalizeStrings(item.dependencies),
    authoritySources: normalizeStrings(item.authoritySources),
  };
}

/**
 * Validates the machine-readable projection of the three declared V6 release
 * authorities. It never infers scope from packages, tests, configuration,
 * feature flags, Git history, or a runtime registry.
 */
export function normalizeReleaseAuthority(
  input: unknown,
): NormalizedReleaseAuthority {
  const parsed = releaseAuthorityDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      releaseId: '',
      sources: [],
      items: [],
      errors: malformedDocumentErrors('authority_document', parsed.error.issues),
    };
  }
  const document: ReleaseAuthorityDocument = parsed.data;
  const errors: string[] = [];
  const releaseId = document.releaseId.trim();

  if (document.schemaVersion !== '1.0') {
    errors.push(`authority_schema:${String(document.schemaVersion)}:unsupported`);
  }
  if (!releaseId) {
    errors.push('authority_release_id:missing');
  }
  if (!document.complete) {
    errors.push('authority:producer_reported_incomplete');
  }

  const sourcesByRole = new Map<ReleaseAuthorityRole, ReleaseAuthoritySource>();
  const declaredPaths = new Set<string>();
  for (const source of document.sources) {
    const sourcePath = source.path.trim().replaceAll('\\', '/');
    if (!AUTHORITY_ROLES.includes(source.role)) {
      errors.push(`authority_role:${String(source.role)}:unsupported`);
      continue;
    }
    if (sourcesByRole.has(source.role)) {
      errors.push(`authority_role:${source.role}:duplicate`);
      continue;
    }
    if (!isCandidateRelativePath(sourcePath)) {
      errors.push(`authority_role:${source.role}:path_not_repository_relative`);
    }
    if (declaredPaths.has(sourcePath)) {
      errors.push(`authority_path:${sourcePath}:duplicate`);
    }
    if (!SHA256_PATTERN.test(source.sha256)) {
      errors.push(`authority_role:${source.role}:sha256_invalid`);
    }
    const normalizedSource = { ...source, path: sourcePath };
    sourcesByRole.set(source.role, normalizedSource);
    declaredPaths.add(sourcePath);
  }

  for (const role of AUTHORITY_ROLES) {
    if (!sourcesByRole.has(role)) {
      errors.push(`authority_role:${role}:missing`);
    }
  }

  const normalizedItems: ApprovedReleaseItem[] = [];
  const itemIds = new Set<string>();
  for (const rawItem of document.items) {
    const item = normalizeAuthorityItem(rawItem);
    const itemLabel = item.id || '<empty>';

    if (!item.id) {
      errors.push('authority_item:<empty>:id_missing');
      continue;
    }
    if (itemIds.has(item.id)) {
      errors.push(`authority_item:${item.id}:duplicate`);
      continue;
    }
    itemIds.add(item.id);

    if (!RELEASE_CLASSIFICATION_SET.has(item.classification)) {
      errors.push(`authority_item:${item.id}:classification_unsupported`);
    }
    for (const surface of item.requiredSurfaces) {
      if (!ARTIFACT_SURFACE_SET.has(surface)) {
        errors.push(`authority_item:${item.id}:surface_unsupported:${String(surface)}`);
      }
    }
    if (CURRENT_CLASSIFICATIONS.has(item.classification) && item.requiredSurfaces.length === 0) {
      errors.push(`authority_item:${item.id}:required_surfaces_missing`);
    }
    if (!CURRENT_CLASSIFICATIONS.has(item.classification) && item.requiredSurfaces.length > 0) {
      errors.push(`authority_item:${item.id}:excluded_item_has_required_surfaces`);
    }
    if (item.authoritySources.length === 0) {
      errors.push(`authority_item:${item.id}:authority_sources_missing`);
    }
    for (const sourcePath of item.authoritySources) {
      if (!declaredPaths.has(sourcePath)) {
        errors.push(`authority_item:${item.id}:undeclared_source:${sourcePath}`);
      }
    }
    for (const dependency of item.dependencies) {
      if (dependency === item.id) {
        errors.push(`authority_item:${itemLabel}:self_dependency`);
      }
    }

    normalizedItems.push(item);
  }

  for (const item of normalizedItems) {
    for (const dependency of item.dependencies) {
      if (!itemIds.has(dependency)) {
        errors.push(`authority_item:${item.id}:dependency_not_declared:${dependency}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    releaseId,
    sources: [...sourcesByRole.values()].sort((left, right) => left.role.localeCompare(right.role)),
    items: normalizedItems.sort((left, right) => left.id.localeCompare(right.id)),
    errors: sortedUnique(errors),
  };
}

function normalizeArtifactItem(item: ArtifactItem): ArtifactItem {
  const normalized: ArtifactItem = {
    id: item.id.trim(),
    surface: item.surface,
    path: item.path.trim().replaceAll('\\', '/'),
    dependencies: normalizeStrings(item.dependencies),
  };
  if (item.sha256 !== undefined) {
    normalized.sha256 = item.sha256.trim();
  }
  return normalized;
}

/**
 * Validates inventory evidence emitted by a clean release-candidate producer.
 * Source-tree absence alone is never converted into proof of artifact absence.
 */
export function normalizeArtifactInventory(
  input: unknown,
  expectedReleaseId: string,
): NormalizedArtifactInventory {
  const parsed = artifactInventoryDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      releaseId: '',
      candidateId: '',
      producer: '',
      inventory: {
        items: [],
        enumeratedSurfaces: [],
        complete: false,
      },
      errors: malformedDocumentErrors('inventory_document', parsed.error.issues),
    };
  }
  const document: ArtifactInventoryDocument = parsed.data;
  const errors: string[] = [];
  const releaseId = document.releaseId.trim();
  const candidateId = document.candidateId.trim();
  const producer = document.producer.trim();

  if (document.schemaVersion !== '1.0') {
    errors.push(`inventory_schema:${String(document.schemaVersion)}:unsupported`);
  }
  if (!releaseId) {
    errors.push('inventory_release_id:missing');
  } else if (releaseId !== expectedReleaseId) {
    errors.push(`inventory_release_id:${releaseId}:expected:${expectedReleaseId}`);
  }
  if (!candidateId) {
    errors.push('inventory_candidate_id:missing');
  }
  if (!producer) {
    errors.push('inventory_producer:missing');
  }
  if (!document.complete) {
    errors.push('inventory:producer_reported_incomplete');
  }

  const surfaceCounts = new Map<ArtifactSurface, number>();
  for (const surface of document.enumeratedSurfaces) {
    if (!ARTIFACT_SURFACE_SET.has(surface)) {
      errors.push(`inventory_surface:${String(surface)}:unsupported`);
      continue;
    }
    surfaceCounts.set(surface, (surfaceCounts.get(surface) ?? 0) + 1);
  }
  for (const surface of ARTIFACT_SURFACES) {
    const count = surfaceCounts.get(surface) ?? 0;
    if (count === 0) {
      errors.push(`inventory_surface:${surface}:not_enumerated`);
    } else if (count > 1) {
      errors.push(`inventory_surface:${surface}:duplicate_enumeration`);
    }
  }

  const normalizedItems: ArtifactItem[] = [];
  const itemKeys = new Set<string>();
  for (const rawItem of document.items) {
    const item = normalizeArtifactItem(rawItem);
    const itemLabel = item.id || '<empty>';
    const key = `${itemLabel}@${String(item.surface)}:${item.path}`;

    if (!item.id) {
      errors.push('inventory_item:<empty>:id_missing');
    }
    if (!ARTIFACT_SURFACE_SET.has(item.surface)) {
      errors.push(`inventory_item:${itemLabel}:surface_unsupported:${String(item.surface)}`);
    }
    if (!isCandidateRelativePath(item.path)) {
      errors.push(`inventory_item:${itemLabel}@${String(item.surface)}:path_not_candidate_relative`);
    }
    if (item.sha256 !== undefined && !SHA256_PATTERN.test(item.sha256)) {
      errors.push(`inventory_item:${itemLabel}@${String(item.surface)}:sha256_invalid`);
    }
    if (itemKeys.has(key)) {
      errors.push(`inventory_item:${key}:duplicate`);
    }
    itemKeys.add(key);
    normalizedItems.push(item);
  }

  normalizedItems.sort((left, right) => {
    const leftKey = `${left.id}@${left.surface}:${left.path}`;
    const rightKey = `${right.id}@${right.surface}:${right.path}`;
    return leftKey.localeCompare(rightKey);
  });

  return {
    ok: errors.length === 0,
    releaseId,
    candidateId,
    producer,
    inventory: {
      items: normalizedItems,
      enumeratedSurfaces: [...surfaceCounts.keys()].sort((left, right) => left.localeCompare(right)),
      complete: document.complete && errors.length === 0,
    },
    errors: sortedUnique(errors),
  };
}
