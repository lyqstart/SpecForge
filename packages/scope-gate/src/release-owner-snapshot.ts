import { z } from 'zod';

export type ReleaseOwnerId =
  | 'daemon_tool_registry'
  | 'workflow_registry'
  | 'installer_registry';

export interface OwnerSnapshotSource {
  path: string;
  sha256: string;
}

export interface OwnerSnapshotItem {
  id: string;
  sourcePath: string;
  dependencies: readonly string[];
}

export interface OwnerReleaseSnapshotReport {
  schemaVersion: '1.0';
  releaseId: string;
  candidateId: string;
  owner: ReleaseOwnerId;
  producer: string;
  complete: boolean;
  sources: readonly OwnerSnapshotSource[];
  items: readonly OwnerSnapshotItem[];
}

export interface ReleaseOwnerSnapshotDocument {
  schemaVersion: '1.0';
  releaseId: string;
  candidateId: string;
  complete: true;
  owners: readonly OwnerReleaseSnapshotReport[];
}

export interface ReleaseOwnerSnapshotBuildResult {
  ok: boolean;
  document?: ReleaseOwnerSnapshotDocument;
  errors: readonly string[];
}

const OWNERS = [
  'daemon_tool_registry',
  'installer_registry',
  'workflow_registry',
] as const satisfies readonly ReleaseOwnerId[];

const OWNER_CONTRACT: Record<ReleaseOwnerId, {
  producer: string;
  prefixes: readonly string[];
}> = {
  daemon_tool_registry: {
    producer: 'daemon-tool-registry-owner-snapshot',
    prefixes: ['tool:'],
  },
  workflow_registry: {
    producer: 'workflow-runtime-owner-snapshot',
    prefixes: ['workflow:'],
  },
  installer_registry: {
    producer: 'installer-registry-owner-snapshot',
    prefixes: [
      'agent:',
      'agent-template:',
      'plugin:',
      'runtime:',
      'skill:',
      'thin-plugin:',
      'tool:',
      'workflow:',
    ],
  },
};

const sourceSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const itemSchema = z.object({
  id: z.string().min(1),
  sourcePath: z.string().min(1),
  dependencies: z.array(z.string().min(1)),
}).strict();

const reportSchema = z.object({
  schemaVersion: z.literal('1.0'),
  releaseId: z.string().min(1),
  candidateId: z.string().min(1),
  owner: z.enum(OWNERS),
  producer: z.string().min(1),
  complete: z.boolean(),
  sources: z.array(sourceSchema).min(1),
  items: z.array(itemSchema).min(1),
}).strict();

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isSafeRelativePath(value: string): boolean {
  if (!value || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) {
    return false;
  }
  const segments = value.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function normalizeReport(report: OwnerReleaseSnapshotReport): OwnerReleaseSnapshotReport {
  return {
    ...report,
    sources: [...report.sources].sort((left, right) => left.path.localeCompare(right.path)),
    items: [...report.items]
      .map((item) => ({
        ...item,
        dependencies: [...item.dependencies].sort((left, right) => left.localeCompare(right)),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

/**
 * Validates and normalizes snapshots emitted by the three release-set owners.
 * This consumer never enumerates registries itself and cannot upgrade a
 * caller-authored or incomplete report into owner evidence.
 */
export function buildReleaseOwnerSnapshot(
  inputs: readonly unknown[],
): ReleaseOwnerSnapshotBuildResult {
  const malformedErrors: string[] = [];
  const reports: OwnerReleaseSnapshotReport[] = [];

  inputs.forEach((input, index) => {
    const parsed = reportSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path.length > 0 ? issue.path.join('.') : '<root>';
        malformedErrors.push(`owner_snapshot_report:${index}:${field}:invalid`);
      }
      return;
    }
    reports.push(parsed.data);
  });

  if (malformedErrors.length > 0) {
    return { ok: false, errors: sortedUnique(malformedErrors) };
  }

  const errors: string[] = [];
  const byOwner = new Map<ReleaseOwnerId, OwnerReleaseSnapshotReport[]>();
  for (const report of reports) {
    const entries = byOwner.get(report.owner) ?? [];
    entries.push(report);
    byOwner.set(report.owner, entries);
  }

  for (const owner of OWNERS) {
    const count = byOwner.get(owner)?.length ?? 0;
    if (count === 0) {
      errors.push(`owner_snapshot:${owner}:producer_missing`);
    } else if (count > 1) {
      errors.push(`owner_snapshot:${owner}:producer_duplicate`);
    }
  }

  const reference = byOwner.get('daemon_tool_registry')?.[0]
    ?? [...reports].sort((left, right) => left.owner.localeCompare(right.owner))[0];
  const expectedReleaseId = reference?.releaseId ?? '';
  const expectedCandidateId = reference?.candidateId ?? '';

  for (const report of reports) {
    const contract = OWNER_CONTRACT[report.owner];
    if (!report.complete) {
      errors.push(`owner_snapshot:${report.owner}:producer_incomplete`);
    }
    if (report.producer !== contract.producer) {
      errors.push(
        `owner_snapshot:${report.owner}:producer:${report.producer}:expected:${contract.producer}`,
      );
    }
    if (report.releaseId !== expectedReleaseId) {
      errors.push(
        `owner_snapshot:${report.owner}:release_id:${report.releaseId}:expected:${expectedReleaseId}`,
      );
    }
    if (report.candidateId !== expectedCandidateId) {
      errors.push(
        `owner_snapshot:${report.owner}:candidate_id:${report.candidateId}:expected:${expectedCandidateId}`,
      );
    }

    const sourcePaths = new Set<string>();
    for (const source of report.sources) {
      if (!isSafeRelativePath(source.path)) {
        errors.push(`owner_snapshot:${report.owner}:source_path:${source.path}:unsafe`);
      }
      if (sourcePaths.has(source.path)) {
        errors.push(`owner_snapshot:${report.owner}:source_path:${source.path}:duplicate`);
      }
      sourcePaths.add(source.path);
    }

    const itemIds = new Set<string>();
    for (const item of report.items) {
      if (itemIds.has(item.id)) {
        errors.push(`owner_snapshot:${report.owner}:item_id:${item.id}:duplicate`);
      }
      itemIds.add(item.id);
      if (!contract.prefixes.some((prefix) => item.id.startsWith(prefix))) {
        errors.push(`owner_snapshot:${report.owner}:item_id:${item.id}:namespace_invalid`);
      }
      if (!sourcePaths.has(item.sourcePath)) {
        errors.push(
          `owner_snapshot:${report.owner}:item:${item.id}:source_unbound:${item.sourcePath}`,
        );
      }
      if (new Set(item.dependencies).size !== item.dependencies.length) {
        errors.push(`owner_snapshot:${report.owner}:item:${item.id}:dependencies_duplicate`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors: sortedUnique(errors) };
  }

  return {
    ok: true,
    document: {
      schemaVersion: '1.0',
      releaseId: expectedReleaseId,
      candidateId: expectedCandidateId,
      complete: true,
      owners: reports
        .map(normalizeReport)
        .sort((left, right) => left.owner.localeCompare(right.owner)),
    },
    errors: [],
  };
}
