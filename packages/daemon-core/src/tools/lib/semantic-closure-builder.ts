/**
 * semantic-closure-builder.ts — builds .semantic_closure.json from explicit WI artifacts.
 *
 * This builder is intentionally conservative:
 * - It accepts a curated semantic closure manifest from a fenced JSON block or evidence manifest.
 * - Otherwise it only derives links from explicit trace chains such as
 *   OUT-1 -> REQ-1 -> DD-1 -> TASK-1 -> EV-1.
 * - It does not infer user outcomes from prose. Missing explicit links produce a failing manifest.
 */

import {
  validateSemanticClosure,
  type SemanticClosureManifest,
  type SemanticClosureValidationResult,
  type SemanticEvidence,
} from './semantic-closure-core.js';

export interface SemanticClosureBuildInput {
  workItemId: string;
  workItem?: Record<string, any> | null;
  curatedSemanticClosure?: unknown;
  traceDeltaMd?: string;
  verificationReportMd?: string;
  evidenceManifest?: Record<string, any> | null;
  mergeReportMd?: string;
}

export interface SemanticClosureBuildResult {
  manifest: SemanticClosureManifest;
  validation: SemanticClosureValidationResult;
  source:
    | 'existing_semantic_closure'
    | 'tool_argument'
    | 'verification_report_json'
    | 'evidence_manifest_semantic_closure'
    | 'evidence_manifest_sections'
    | 'trace_delta_chain'
    | 'insufficient_artifacts';
  diagnostics: string[];
}

interface TraceChain {
  outcomeId: string;
  requirementId: string;
  designId: string;
  taskId: string;
  evidenceId: string;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSemanticManifestCandidate(value: unknown): value is SemanticClosureManifest {
  if (!isRecord(value)) return false;
  return (
    value.closure_profile === 'spec_migration' ||
    value.workflow_type === 'spec_migration' ||
    isRecord(value.spec_migration) ||
    value.closure_profile === 'investigation' ||
    value.workflow_type === 'investigation' ||
    Array.isArray(value.investigation_questions) ||
    Array.isArray(value.findings) ||
    Array.isArray(value.outcomes) ||
    Array.isArray(value.requirements) ||
    Array.isArray(value.design_decisions) ||
    Array.isArray(value.tasks) ||
    Array.isArray(value.evidence)
  );
}

function normalizeEvidenceStatus(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return 'unknown';
  return raw;
}

function normalizeProjectIntegrationStatus(
  workItem: Record<string, any> | null | undefined,
  mergeReportMd: string | undefined
): string {
  const lower = String(mergeReportMd ?? '').toLowerCase();
  if (lower.includes('not_applicable') || lower.includes('not applicable')) return 'not_applicable';
  if (lower.includes('merged') || lower.includes('success')) return 'merged';
  if (workItem?.workflow_path === 'code_only_fast_path') return 'not_applicable';
  return 'unknown';
}

function getEvidenceEntries(
  evidenceManifest: Record<string, any> | null | undefined
): Record<string, any>[] {
  if (!evidenceManifest) return [];
  if (Array.isArray(evidenceManifest.entries)) return evidenceManifest.entries.filter(isRecord);
  if (Array.isArray(evidenceManifest.evidence)) return evidenceManifest.evidence.filter(isRecord);
  return [];
}

function evidenceById(
  evidenceManifest: Record<string, any> | null | undefined
): Map<string, Record<string, any>> {
  const out = new Map<string, Record<string, any>>();
  for (const entry of getEvidenceEntries(evidenceManifest)) {
    const id = String(entry.id ?? entry.evidence_id ?? '').trim();
    if (id) out.set(id, entry);
  }
  return out;
}

function evidenceFromEntry(
  id: string,
  entry: Record<string, any> | undefined,
  supports: string[]
): SemanticEvidence {
  return {
    id,
    status: normalizeEvidenceStatus(entry?.status ?? entry?.result ?? entry?.passed_status),
    level: String(entry?.level ?? entry?.evidence_level ?? '').trim() || undefined,
    evidence_type: String(entry?.evidence_type ?? entry?.type ?? '').trim() || undefined,
    supports,
    outcome_refs: supports.filter(ref => ref.startsWith('OUT-')),
    requirement_refs: supports.filter(ref => ref.startsWith('REQ-')),
    design_refs: supports.filter(ref => ref.startsWith('DD-')),
    task_refs: supports.filter(ref => ref.startsWith('TASK-')),
  };
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function parseSemanticClosureManifest(value: unknown): SemanticClosureManifest | null {
  if (typeof value === 'string') {
    try {
      return parseSemanticClosureManifest(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) return null;
  if (isSemanticManifestCandidate(value.semantic_closure))
    return value.semantic_closure as SemanticClosureManifest;
  if (isSemanticManifestCandidate(value)) return value as SemanticClosureManifest;
  return null;
}

function extractSemanticClosureFromMarkdown(
  markdown: string | undefined
): SemanticClosureManifest | null {
  if (!markdown) return null;
  const fenceRe = /```(?:json|semantic_closure)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(markdown)) !== null) {
    const body = match[1]?.trim();
    if (!body) continue;
    try {
      const parsed = JSON.parse(body);
      const manifest = parseSemanticClosureManifest(parsed);
      if (manifest) return manifest;
    } catch {
      // ignore non-JSON fenced blocks
    }
  }
  return null;
}

function traceChains(markdown: string | undefined): TraceChain[] {
  if (!markdown) return [];
  const chains: TraceChain[] = [];
  const lineRe =
    /\b(OUT-[A-Za-z0-9_.-]+)\b[\s\S]{0,120}?\b(REQ-[A-Za-z0-9_.-]+)\b[\s\S]{0,120}?\b(DD-[A-Za-z0-9_.-]+)\b[\s\S]{0,120}?\b(TASK-[A-Za-z0-9_.-]+)\b[\s\S]{0,120}?\b(EV-[A-Za-z0-9_.-]+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(markdown)) !== null) {
    chains.push({
      outcomeId: match[1],
      requirementId: match[2],
      designId: match[3],
      taskId: match[4],
      evidenceId: match[5],
    });
  }
  return unique(chains.map(chain => JSON.stringify(chain))).map(
    item => JSON.parse(item) as TraceChain
  );
}

function manifestFromEvidenceManifestSections(
  input: SemanticClosureBuildInput
): SemanticClosureManifest | null {
  const em = input.evidenceManifest;
  if (!em) return null;
  const direct = parseSemanticClosureManifest(em.semantic_closure);
  if (direct) return { ...direct, work_item_id: direct.work_item_id ?? input.workItemId };

  if (
    Array.isArray(em.outcomes) ||
    Array.isArray(em.requirements) ||
    Array.isArray(em.design_decisions) ||
    Array.isArray(em.tasks)
  ) {
    const evidenceEntries = getEvidenceEntries(em);
    return {
      schema_version: String(em.schema_version ?? '1.0'),
      work_item_id: String(em.work_item_id ?? input.workItemId),
      outcomes: Array.isArray(em.outcomes) ? em.outcomes : [],
      requirements: Array.isArray(em.requirements) ? em.requirements : [],
      design_decisions: Array.isArray(em.design_decisions) ? em.design_decisions : [],
      tasks: Array.isArray(em.tasks) ? em.tasks : [],
      evidence: evidenceEntries.map(entry =>
        evidenceFromEntry(
          String(entry.id ?? entry.evidence_id),
          entry,
          Array.isArray(entry.supports) ? entry.supports : []
        )
      ),
      project_integration: isRecord(em.project_integration)
        ? em.project_integration
        : { status: normalizeProjectIntegrationStatus(input.workItem, input.mergeReportMd) },
    };
  }

  return null;
}

function manifestFromTraceChains(
  input: SemanticClosureBuildInput,
  chains: TraceChain[]
): SemanticClosureManifest {
  const entriesById = evidenceById(input.evidenceManifest);
  const outcomeIds = unique(chains.map(chain => chain.outcomeId));
  const requirementIds = unique(chains.map(chain => chain.requirementId));
  const designIds = unique(chains.map(chain => chain.designId));
  const taskIds = unique(chains.map(chain => chain.taskId));
  const evidenceIds = unique(chains.map(chain => chain.evidenceId));

  return {
    schema_version: '1.0',
    work_item_id: input.workItemId,
    outcomes: outcomeIds.map(id => ({
      id,
      requirement_refs: unique(
        chains.filter(chain => chain.outcomeId === id).map(chain => chain.requirementId)
      ),
      required_evidence_refs: unique(
        chains.filter(chain => chain.outcomeId === id).map(chain => chain.evidenceId)
      ),
    })),
    requirements: requirementIds.map(id => ({
      id,
      type: 'MUST',
      outcome_refs: unique(
        chains.filter(chain => chain.requirementId === id).map(chain => chain.outcomeId)
      ),
      design_refs: unique(
        chains.filter(chain => chain.requirementId === id).map(chain => chain.designId)
      ),
      task_refs: unique(
        chains.filter(chain => chain.requirementId === id).map(chain => chain.taskId)
      ),
      required_evidence_refs: unique(
        chains.filter(chain => chain.requirementId === id).map(chain => chain.evidenceId)
      ),
    })),
    design_decisions: designIds.map(id => ({
      id,
      requirement_refs: unique(
        chains.filter(chain => chain.designId === id).map(chain => chain.requirementId)
      ),
      task_refs: unique(chains.filter(chain => chain.designId === id).map(chain => chain.taskId)),
    })),
    tasks: taskIds.map(id => ({
      id,
      requirement_refs: unique(
        chains.filter(chain => chain.taskId === id).map(chain => chain.requirementId)
      ),
      design_refs: unique(chains.filter(chain => chain.taskId === id).map(chain => chain.designId)),
      evidence_refs: unique(
        chains.filter(chain => chain.taskId === id).map(chain => chain.evidenceId)
      ),
    })),
    evidence: evidenceIds.map(id => {
      const linkedChains = chains.filter(chain => chain.evidenceId === id);
      const supports = unique(
        linkedChains.flatMap(chain => [
          chain.outcomeId,
          chain.requirementId,
          chain.designId,
          chain.taskId,
        ])
      );
      return evidenceFromEntry(id, entriesById.get(id), supports);
    }),
    project_integration: {
      status: normalizeProjectIntegrationStatus(input.workItem, input.mergeReportMd),
    },
  };
}

function insufficientManifest(
  input: SemanticClosureBuildInput,
  diagnostics: string[]
): SemanticClosureManifest {
  const evidenceEntries = getEvidenceEntries(input.evidenceManifest);
  return {
    schema_version: '1.0',
    work_item_id: input.workItemId,
    outcomes: [],
    requirements: [],
    design_decisions: [],
    tasks: [],
    evidence: evidenceEntries.map(entry =>
      evidenceFromEntry(
        String(entry.id ?? entry.evidence_id ?? 'EV-UNKNOWN'),
        entry,
        Array.isArray(entry.supports) ? entry.supports : []
      )
    ),
    project_integration: {
      status: normalizeProjectIntegrationStatus(input.workItem, input.mergeReportMd),
    },
    // non-schema diagnostic field; validator ignores it, report preserves it.
    diagnostics,
  } as SemanticClosureManifest;
}

export function buildSemanticClosureFromArtifacts(
  input: SemanticClosureBuildInput
): SemanticClosureBuildResult {
  const diagnostics: string[] = [];

  if (input.curatedSemanticClosure !== undefined) {
    const supplied = parseSemanticClosureManifest(input.curatedSemanticClosure);
    if (supplied) {
      const manifest = {
        ...supplied,
        work_item_id: supplied.work_item_id ?? input.workItemId,
      };
      return {
        manifest,
        validation: validateSemanticClosure(manifest),
        source: 'tool_argument',
        diagnostics: [
          'Semantic closure was supplied through the typed sf_semantic_closure_run contract.',
        ],
      };
    }
    diagnostics.push(
      'INVALID_SEMANTIC_CLOSURE_ARGUMENT: semantic_closure must be a manifest object or a JSON string containing one.'
    );
    const manifest = insufficientManifest(input, diagnostics);
    return {
      manifest,
      validation: validateSemanticClosure(manifest),
      source: 'tool_argument',
      diagnostics,
    };
  }

  const fromVerificationReport = extractSemanticClosureFromMarkdown(input.verificationReportMd);
  if (fromVerificationReport) {
    const manifest = {
      ...fromVerificationReport,
      work_item_id: fromVerificationReport.work_item_id ?? input.workItemId,
    };
    return {
      manifest,
      validation: validateSemanticClosure(manifest),
      source: 'verification_report_json',
      diagnostics,
    };
  }

  const fromEvidenceSections = manifestFromEvidenceManifestSections(input);
  if (fromEvidenceSections) {
    const source = isSemanticManifestCandidate(input.evidenceManifest?.semantic_closure)
      ? 'evidence_manifest_semantic_closure'
      : 'evidence_manifest_sections';
    return {
      manifest: fromEvidenceSections,
      validation: validateSemanticClosure(fromEvidenceSections),
      source,
      diagnostics,
    };
  }

  const chains = traceChains(input.traceDeltaMd);
  if (chains.length > 0) {
    const manifest = manifestFromTraceChains(input, chains);
    return {
      manifest,
      validation: validateSemanticClosure(manifest),
      source: 'trace_delta_chain',
      diagnostics,
    };
  }

  diagnostics.push('No machine-readable semantic closure source was found.');
  diagnostics.push(
    'Preferred recovery: call sf_semantic_closure_run with the typed semantic_closure argument containing outcomes, requirements, design_decisions, tasks, evidence, and project_integration.'
  );
  diagnostics.push(
    'Backward-compatible sources: verification_report fenced JSON, evidence_manifest semantic sections, or explicit OUT -> REQ -> DD -> TASK -> EV trace chains.'
  );
  diagnostics.push(
    'Knowledge Graph is not a Semantic Closure data source; do not add KG nodes to recover this error.'
  );
  diagnostics.push(
    'The builder does not infer semantic completion from prose, file existence, or compile output.'
  );
  const manifest = insufficientManifest(input, diagnostics);
  return {
    manifest,
    validation: validateSemanticClosure(manifest),
    source: 'insufficient_artifacts',
    diagnostics,
  };
}
