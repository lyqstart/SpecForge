import { createHash } from 'node:crypto';
import {
  normalizeReleaseAuthority,
  type ReleaseAuthorityDocument,
  type ReleaseAuthoritySource,
} from './release-evidence-normalizer';

export interface AuthoritySourceBytes {
  path: string;
  content: string;
}

export interface ReleaseAuthorityProjectionInput {
  releaseId: string;
  requirements: AuthoritySourceBytes;
  design: AuthoritySourceBytes;
  matrix: AuthoritySourceBytes;
}

export interface ReleaseAuthorityProjectionResult {
  ok: boolean;
  document?: ReleaseAuthorityDocument;
  errors: readonly string[];
}

const START_MARKER = '<!-- SPECFORGE_RELEASE_AUTHORITY_ITEMS:START -->';
const END_MARKER = '<!-- SPECFORGE_RELEASE_AUTHORITY_ITEMS:END -->';

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function occurrenceCount(content: string, marker: string): number {
  return content.split(marker).length - 1;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function extractPayload(matrixContent: string): { payload?: unknown; errors: string[] } {
  const startCount = occurrenceCount(matrixContent, START_MARKER);
  const endCount = occurrenceCount(matrixContent, END_MARKER);
  if (startCount === 0 && endCount === 0) {
    return { errors: ['authority_projection:marker_pair_missing'] };
  }
  if (startCount !== 1 || endCount !== 1) {
    return { errors: ['authority_projection:marker_pair_not_unique'] };
  }

  const start = matrixContent.indexOf(START_MARKER) + START_MARKER.length;
  const end = matrixContent.indexOf(END_MARKER);
  if (end <= start) {
    return { errors: ['authority_projection:marker_order_invalid'] };
  }

  const block = matrixContent.slice(start, end).trim();
  const lines = block.split(/\r?\n/);
  if (lines[0]?.trim() !== '```json' || lines.at(-1)?.trim() !== '```') {
    return { errors: ['authority_projection:json_fence_invalid'] };
  }

  const json = lines.slice(1, -1).join('\n');
  try {
    return { payload: JSON.parse(json) as unknown, errors: [] };
  } catch {
    return { errors: ['authority_projection:json_invalid'] };
  }
}

/**
 * Creates a hash-bound derivative from the matrix-owned machine block. The
 * projection contains no independently maintained classification source.
 */
export function projectReleaseAuthority(
  input: ReleaseAuthorityProjectionInput,
): ReleaseAuthorityProjectionResult {
  const extracted = extractPayload(input.matrix.content);
  if (extracted.errors.length > 0) {
    return { ok: false, errors: extracted.errors };
  }

  if (typeof extracted.payload !== 'object' || extracted.payload === null || Array.isArray(extracted.payload)) {
    return { ok: false, errors: ['authority_projection:payload_not_object'] };
  }
  const payload = extracted.payload as Record<string, unknown>;
  if ('sources' in payload) {
    return { ok: false, errors: ['authority_projection:payload_sources_forbidden'] };
  }

  const projectedReleaseId = typeof payload.releaseId === 'string' ? payload.releaseId : '';
  if (projectedReleaseId && projectedReleaseId !== input.releaseId) {
    return {
      ok: false,
      errors: [
        `authority_projection:release_id:${projectedReleaseId}:expected:${input.releaseId}`,
      ],
    };
  }

  const sources: ReleaseAuthoritySource[] = [
    {
      role: 'module_disposition_matrix',
      path: input.matrix.path,
      sha256: sha256(input.matrix.content),
    },
    {
      role: 'v6_design',
      path: input.design.path,
      sha256: sha256(input.design.content),
    },
    {
      role: 'v6_requirements',
      path: input.requirements.path,
      sha256: sha256(input.requirements.content),
    },
  ];

  const hasItems = Array.isArray(payload.items);
  const hasItemGroups = Array.isArray(payload.itemGroups);
  if (hasItems && hasItemGroups) {
    return { ok: false, errors: ['authority_projection:item_encoding_ambiguous'] };
  }

  let projectedItems: unknown = payload.items;
  if (hasItemGroups) {
    const expanded: unknown[] = [];
    const groupErrors: string[] = [];
    (payload.itemGroups as unknown[]).forEach((rawGroup, index) => {
      if (typeof rawGroup !== 'object' || rawGroup === null || Array.isArray(rawGroup)) {
        groupErrors.push(`authority_projection:item_group:${index}:invalid`);
        return;
      }
      const group = rawGroup as Record<string, unknown>;
      if (!Array.isArray(group.ids)) {
        groupErrors.push(`authority_projection:item_group:${index}:ids_invalid`);
        return;
      }
      if (group.ids.length === 0) {
        groupErrors.push(`authority_projection:item_group:${index}:ids_empty`);
        return;
      }
      for (const id of group.ids) {
        expanded.push({
          id,
          classification: group.classification,
          requiredSurfaces: group.requiredSurfaces,
          dependencies: group.dependencies,
          authoritySources: group.authoritySources,
        });
      }
    });
    if (groupErrors.length > 0) {
      return { ok: false, errors: sortedUnique(groupErrors) };
    }
    projectedItems = expanded;
  }

  const candidate = {
    schemaVersion: payload.schemaVersion,
    releaseId: payload.releaseId,
    complete: payload.complete,
    items: projectedItems,
    sources,
  };
  const normalized = normalizeReleaseAuthority(candidate);
  if (!normalized.ok) {
    return { ok: false, errors: sortedUnique(normalized.errors) };
  }

  return {
    ok: true,
    document: {
      schemaVersion: '1.0',
      releaseId: normalized.releaseId,
      complete: true,
      sources: normalized.sources,
      items: normalized.items,
    },
    errors: [],
  };
}
