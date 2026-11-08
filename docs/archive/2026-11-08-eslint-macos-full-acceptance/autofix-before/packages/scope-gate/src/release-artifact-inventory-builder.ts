import { z } from 'zod';
import {
  normalizeArtifactInventory,
  type ArtifactInventoryDocument,
} from './release-evidence-normalizer';
import type { ArtifactItem, ArtifactSurface } from './release-set-validator';

export interface ArtifactSurfaceReport {
  schemaVersion: '1.0';
  releaseId: string;
  candidateId: string;
  surface: ArtifactSurface;
  producer: string;
  complete: boolean;
  items: readonly ArtifactItem[];
}

export interface ReleaseArtifactInventoryBuildResult {
  ok: boolean;
  document?: ArtifactInventoryDocument;
  errors: readonly string[];
}

const SURFACES = [
  'clean_build',
  'dynamic_registry',
  'installer_asset',
  'package_export',
  'release_manifest',
  'runtime_entry',
] as const satisfies readonly ArtifactSurface[];

const artifactItemSchema = z.object({
  id: z.string(),
  surface: z.enum(SURFACES),
  path: z.string(),
  sha256: z.string().optional(),
  dependencies: z.array(z.string()),
}).strict();

const surfaceReportSchema = z.object({
  schemaVersion: z.literal('1.0'),
  releaseId: z.string(),
  candidateId: z.string(),
  surface: z.enum(SURFACES),
  producer: z.string(),
  complete: z.boolean(),
  items: z.array(artifactItemSchema),
}).strict();

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

/**
 * Assembles independently produced evidence for all six release surfaces.
 * It does not enumerate source files itself and cannot upgrade an incomplete
 * producer report to complete evidence.
 */
export function buildReleaseArtifactInventory(
  inputs: readonly unknown[],
): ReleaseArtifactInventoryBuildResult {
  const malformedErrors: string[] = [];
  const reports: ArtifactSurfaceReport[] = [];
  inputs.forEach((input, index) => {
    const parsed = surfaceReportSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path.length > 0 ? issue.path.join('.') : '<root>';
        malformedErrors.push(`artifact_surface_report:${index}:${field}:invalid`);
      }
      return;
    }
    reports.push(parsed.data);
  });
  if (malformedErrors.length > 0) {
    return { ok: false, errors: sortedUnique(malformedErrors) };
  }

  const errors: string[] = [];
  const releaseIds = sortedUnique(reports.map((report) => report.releaseId));
  const candidateIds = sortedUnique(reports.map((report) => report.candidateId));
  const expectedReleaseId = releaseIds[0] ?? '';
  const expectedCandidateId = candidateIds[0] ?? '';

  const bySurface = new Map<ArtifactSurface, ArtifactSurfaceReport[]>();
  for (const report of reports) {
    const entries = bySurface.get(report.surface) ?? [];
    entries.push(report);
    bySurface.set(report.surface, entries);

    if (!report.complete) {
      errors.push(`artifact_surface:${report.surface}:producer_incomplete`);
    }
    if (!report.producer.trim()) {
      errors.push(`artifact_surface:${report.surface}:producer_name_missing`);
    }
    if (report.releaseId !== expectedReleaseId) {
      errors.push(
        `artifact_surface:${report.surface}:release_id:${report.releaseId}:expected:${expectedReleaseId}`,
      );
    }
    if (report.candidateId !== expectedCandidateId) {
      errors.push(
        `artifact_surface:${report.surface}:candidate_id:${report.candidateId}:expected:${expectedCandidateId}`,
      );
    }
    for (const item of report.items) {
      if (item.surface !== report.surface) {
        errors.push(
          `artifact_surface:${report.surface}:item_surface_mismatch:${item.surface}`,
        );
      }
    }
  }

  for (const surface of SURFACES) {
    const count = bySurface.get(surface)?.length ?? 0;
    if (count === 0) {
      errors.push(`artifact_surface:${surface}:producer_missing`);
    } else if (count > 1) {
      errors.push(`artifact_surface:${surface}:producer_duplicate`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors: sortedUnique(errors) };
  }

  const candidate: ArtifactInventoryDocument = {
    schemaVersion: '1.0',
    releaseId: expectedReleaseId,
    candidateId: expectedCandidateId,
    producer: 'six-surface-release-candidate-evidence-builder',
    complete: true,
    enumeratedSurfaces: [...SURFACES],
    items: reports.flatMap((report) => report.items),
  };
  const normalized = normalizeArtifactInventory(candidate, expectedReleaseId);
  if (!normalized.ok) {
    return { ok: false, errors: normalized.errors };
  }

  return {
    ok: true,
    document: {
      schemaVersion: '1.0',
      releaseId: normalized.releaseId,
      candidateId: normalized.candidateId,
      producer: normalized.producer,
      complete: true,
      enumeratedSurfaces: normalized.inventory.enumeratedSurfaces,
      items: normalized.inventory.items,
    },
    errors: [],
  };
}
