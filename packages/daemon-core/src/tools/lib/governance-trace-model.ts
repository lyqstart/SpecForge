/**
 * Canonical Architecture/Data/Design/Contract trace semantics.
 *
 * This module is pure: it parses, validates, projects and renders the existing
 * Project Trace truth source. Filesystem ownership remains with the Runtime,
 * Gate and Merge layers.
 */

export type GovernanceTraceRelation = 'constrained_by' | 'enforces';

export type GovernanceTraceEdge = {
  from: string;
  relation: GovernanceTraceRelation;
  to: string;
  source: string;
};

export type GovernanceTraceDeltaOperation = {
  operation: 'ADD' | 'REMOVE';
  edge: GovernanceTraceEdge;
  source: string;
  line?: number;
};

export type GovernanceTraceIssue = {
  code: string;
  message: string;
  source?: string;
  line?: number;
  edge?: GovernanceTraceEdge;
};

export type GovernanceContractDescriptor = {
  id: string;
  owner_module: string;
  module_internal: boolean;
};

export type GovernanceTraceSemanticContext = {
  architecture_ids: Iterable<string>;
  data_model_ids: Iterable<string>;
  design_owners: ReadonlyMap<string, string> | Record<string, string>;
  contracts: Iterable<GovernanceContractDescriptor>;
};

export type GovernanceContractConsumer = {
  contract_id: string;
  design_id: string;
  module_code: string;
  edge: GovernanceTraceEdge;
};

export type GovernanceTraceProjection = {
  current: GovernanceTraceEdge[];
  operations: GovernanceTraceDeltaOperation[];
  prospective: GovernanceTraceEdge[];
  issues: GovernanceTraceIssue[];
};

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function edgeKey(edge: Pick<GovernanceTraceEdge, 'from' | 'relation' | 'to'>): string {
  return `${edge.from}\u0000${edge.relation}\u0000${edge.to}`;
}

function normalizeId(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeRelation(value: unknown): GovernanceTraceRelation | null {
  return value === 'constrained_by' || value === 'enforces' ? value : null;
}

export const GOVERNANCE_RELATIONS_START = '<!-- SPECFORGE_GOVERNANCE_RELATIONS_START -->';
export const GOVERNANCE_RELATIONS_END = '<!-- SPECFORGE_GOVERNANCE_RELATIONS_END -->';
export const GOVERNANCE_DELTA_START = '<!-- SPECFORGE_GOVERNANCE_DELTA_START -->';
export const GOVERNANCE_DELTA_END = '<!-- SPECFORGE_GOVERNANCE_DELTA_END -->';

type MarkedSection = {
  found: boolean;
  content: string;
  contentStartLine: number;
  stripped: string;
  issues: GovernanceTraceIssue[];
};

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function lineNumberAt(text: string, index: number): number {
  return normalizeNewlines(text.slice(0, index)).split('\n').length;
}

function allIndexes(text: string, marker: string): number[] {
  const indexes: number[] = [];
  let offset = 0;
  while (offset <= text.length) {
    const found = text.indexOf(marker, offset);
    if (found < 0) break;
    indexes.push(found);
    offset = found + marker.length;
  }
  return indexes;
}

function extractMarkedSection(input: {
  text: string;
  source: string;
  startMarker: string;
  endMarker: string;
  codePrefix: string;
}): MarkedSection {
  const text = normalizeNewlines(input.text);
  const starts = allIndexes(text, input.startMarker);
  const ends = allIndexes(text, input.endMarker);
  const issues: GovernanceTraceIssue[] = [];

  if (starts.length === 0 && ends.length === 0) {
    return { found: false, content: '', contentStartLine: 1, stripped: text, issues };
  }
  if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) {
    issues.push({
      code: `${input.codePrefix}_SECTION_MARKERS_INVALID`,
      message: `${input.codePrefix.replace(/_/g, ' ')} section must contain exactly one ordered start/end marker`,
      source: input.source,
    });
  }
  if (starts.length === 0 || ends.length === 0 || ends[0] < starts[0]) {
    return { found: true, content: '', contentStartLine: 1, stripped: text, issues };
  }

  const start = starts[0];
  const contentStart = start + input.startMarker.length;
  const end = ends[0];
  const content = text.slice(contentStart, end).replace(/^\n/, '').replace(/\n$/, '');
  const before = text.slice(0, start).replace(/\n+$/, '');
  const after = text.slice(end + input.endMarker.length).replace(/^\n+/, '');
  const stripped = [before, after].filter(part => part.length > 0).join('\n\n');
  return {
    found: true,
    content,
    contentStartLine: lineNumberAt(text, contentStart) + (text[contentStart] === '\n' ? 1 : 0),
    stripped,
    issues,
  };
}

function markdownCells(line: string): string[] {
  if (!line.trim().startsWith('|')) return [];
  return line
    .split('|')
    .slice(1, -1)
    .map(cell => cell.trim());
}

function pipeCells(line: string): string[] {
  const markdown = markdownCells(line);
  if (markdown.length > 0) return markdown;
  return line
    .split('|')
    .map(cell => cell.trim())
    .filter(Boolean);
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function isRelationHeader(cells: string[]): boolean {
  const lower = cells.map(cell => cell.toLowerCase());
  return lower.length >= 3 && lower[0] === 'from' && lower[1] === 'relation' && lower[2] === 'to';
}

function isDeltaHeader(cells: string[]): boolean {
  const lower = cells.map(cell => cell.toLowerCase());
  return (
    lower.length >= 4 &&
    lower[0] === 'operation' &&
    lower[1] === 'from' &&
    lower[2] === 'relation' &&
    lower[3] === 'to'
  );
}

function parseStructuredObject(
  parsed: unknown,
  source: string,
  operation: 'ADD' | 'REMOVE' | null,
): { edges: GovernanceTraceEdge[]; operations: GovernanceTraceDeltaOperation[] } {
  const edges: GovernanceTraceEdge[] = [];
  const operations: GovernanceTraceDeltaOperation[] = [];
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { edges, operations };
  const value = parsed as Record<string, unknown>;

  const append = (edge: GovernanceTraceEdge, requestedOperation = operation): void => {
    if (requestedOperation) {
      operations.push({ operation: requestedOperation, edge, source });
    } else {
      edges.push(edge);
    }
  };

  for (const field of ['data_designs', 'module_designs']) {
    const entries = Array.isArray(value[field]) ? (value[field] as unknown[]) : [];
    for (const raw of entries) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const entry = raw as Record<string, unknown>;
      const from = normalizeId(entry.id);
      const targets = Array.isArray(entry.constrained_by) ? entry.constrained_by : [];
      for (const rawTarget of targets) {
        const to = normalizeId(rawTarget);
        if (from && to) append({ from, relation: 'constrained_by', to, source });
      }
    }
  }

  const enforcements = Array.isArray(value.contract_enforcements)
    ? (value.contract_enforcements as unknown[])
    : [];
  for (const raw of enforcements) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const from = normalizeId(entry.id ?? entry.contract_id);
    const targets = Array.isArray(entry.enforces)
      ? entry.enforces
      : Array.isArray(entry.source_refs)
        ? entry.source_refs
        : [];
    for (const rawTarget of targets) {
      const to = normalizeId(rawTarget);
      if (from && to) append({ from, relation: 'enforces', to, source });
    }
  }

  const explicitOperations = Array.isArray(value.operations) ? (value.operations as unknown[]) : [];
  for (const raw of explicitOperations) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const op = entry.operation === 'ADD' || entry.operation === 'REMOVE' ? entry.operation : null;
    const relation = normalizeRelation(entry.relation);
    const from = normalizeId(entry.from);
    const to = normalizeId(entry.to);
    if (op && relation && from && to) {
      operations.push({
        operation: op,
        edge: { from, relation, to, source },
        source,
      });
    }
  }

  return { edges, operations };
}

function parseStructuredBlocks(
  text: string,
  source: string,
  operation: 'ADD' | 'REMOVE' | null,
): { edges: GovernanceTraceEdge[]; operations: GovernanceTraceDeltaOperation[] } {
  const edges: GovernanceTraceEdge[] = [];
  const operations: GovernanceTraceDeltaOperation[] = [];
  const fence = /```(?:json|trace|trace_delta)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(String(match[1] ?? '').trim());
      const result = parseStructuredObject(parsed, source, operation);
      edges.push(...result.edges);
      operations.push(...result.operations);
    } catch {
      // A non-JSON fence is not a trace declaration and is intentionally ignored.
    }
  }
  return { edges, operations };
}

function parseRelationTable(input: {
  text: string;
  source: string;
  lineOffset: number;
  requireHeader: boolean;
}): { edges: GovernanceTraceEdge[]; issues: GovernanceTraceIssue[] } {
  const edges: GovernanceTraceEdge[] = [];
  const issues: GovernanceTraceIssue[] = [];
  const lines = normalizeNewlines(input.text).split('\n');
  let inTable = false;

  for (let index = 0; index < lines.length; index += 1) {
    const cells = pipeCells(lines[index]);
    const line = input.lineOffset + index;
    if (cells.length === 0) {
      if (inTable) inTable = false;
      continue;
    }
    if (isRelationHeader(cells)) {
      inTable = true;
      continue;
    }
    if (inTable && isSeparatorRow(cells)) continue;

    const directRelation = normalizeRelation(cells[1]);
    const shouldParse = inTable || (!input.requireHeader && cells.length >= 3 && directRelation !== null);
    if (!shouldParse) continue;

    if (cells.length < 3) {
      issues.push({
        code: 'TRACE_ROW_INCOMPLETE',
        message: `Trace row must contain From, Relation and To at line ${line}`,
        source: input.source,
        line,
      });
      continue;
    }
    const relation = normalizeRelation(cells[1]);
    if (!relation) {
      issues.push({
        code: 'TRACE_RELATION_INVALID',
        message: `Trace relation must be constrained_by or enforces at line ${line}`,
        source: input.source,
        line,
      });
      continue;
    }
    const from = normalizeId(cells[0]);
    const to = normalizeId(cells[2]);
    if (!from || !to) {
      issues.push({
        code: 'TRACE_ROW_INCOMPLETE',
        message: `Trace row must declare non-empty From and To IDs at line ${line}`,
        source: input.source,
        line,
      });
      continue;
    }
    edges.push({ from, relation, to, source: input.source });
  }
  return { edges, issues };
}

function stripUnmarkedRelationTables(text: string): string {
  const lines = normalizeNewlines(text).split('\n');
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const cells = markdownCells(line);
    if (!skipping && isRelationHeader(cells)) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (markdownCells(line).length > 0 || line.trim() === '') continue;
      skipping = false;
    }
    kept.push(line);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

export function hasLegacyTracePayload(text: string): boolean {
  const normalized = normalizeNewlines(text);
  if (/^\s*##\s*(?:追溯矩阵|文件覆盖|覆盖统计|Trace Entries)(?:\s|$)/im.test(normalized)) {
    return true;
  }
  return normalized.split('\n').some(line => {
    const cells = markdownCells(line).map(cell => cell.toUpperCase());
    return (
      cells.some(cell => /^REQ(?:\s+ID)?$/.test(cell)) &&
      cells.some(cell => /^AC(?:\s+ID)?$/.test(cell)) &&
      cells.some(cell => /^DD(?:\s+ID)?$/.test(cell)) &&
      cells.some(cell => /^TASK(?:\s+ID)?$/.test(cell))
    );
  });
}

export function normalizeGovernanceTraceEdges(
  edges: Iterable<GovernanceTraceEdge>,
): GovernanceTraceEdge[] {
  const byKey = new Map<string, GovernanceTraceEdge>();
  for (const raw of edges) {
    const from = normalizeId(raw.from);
    const relation = normalizeRelation(raw.relation);
    const to = normalizeId(raw.to);
    if (!from || !relation || !to) continue;
    const edge = { from, relation, to, source: raw.source };
    if (!byKey.has(edgeKey(edge))) byKey.set(edgeKey(edge), edge);
  }
  return Array.from(byKey.values()).sort((left, right) =>
    edgeKey(left).localeCompare(edgeKey(right)),
  );
}

export function parseGovernanceTrace(
  text: string,
  source: string,
): {
  edges: GovernanceTraceEdge[];
  issues: GovernanceTraceIssue[];
  marked_section: boolean;
} {
  const section = extractMarkedSection({
    text,
    source,
    startMarker: GOVERNANCE_RELATIONS_START,
    endMarker: GOVERNANCE_RELATIONS_END,
    codePrefix: 'TRACE_GOVERNANCE_RELATIONS',
  });
  const parsed = parseRelationTable({
    text: section.found ? section.content : text,
    source,
    lineOffset: section.found ? section.contentStartLine : 1,
    requireHeader: !section.found,
  });
  const structured = parseStructuredBlocks(section.found ? section.content : text, source, null);
  const edges = [...parsed.edges, ...structured.edges];
  const issues = [...section.issues, ...parsed.issues];
  const seen = new Set<string>();
  for (const edge of edges) {
    const key = edgeKey(edge);
    if (seen.has(key)) {
      issues.push({
        code: 'TRACE_DUPLICATE_EDGE',
        message: `Duplicate formal Trace edge: ${edge.from} ${edge.relation} ${edge.to}`,
        source,
        edge,
      });
    }
    seen.add(key);
  }
  return {
    edges: normalizeGovernanceTraceEdges(edges),
    issues,
    marked_section: section.found,
  };
}

export function parseGovernanceTraceDelta(
  text: string,
  source: string,
): {
  operations: GovernanceTraceDeltaOperation[];
  issues: GovernanceTraceIssue[];
  marked_section: boolean;
  content_without_governance_delta: string;
  has_legacy_trace_payload: boolean;
} {
  const section = extractMarkedSection({
    text,
    source,
    startMarker: GOVERNANCE_DELTA_START,
    endMarker: GOVERNANCE_DELTA_END,
    codePrefix: 'TRACE_GOVERNANCE_DELTA',
  });
  const operations: GovernanceTraceDeltaOperation[] = [];
  const issues: GovernanceTraceIssue[] = [...section.issues];
  const parseText = section.found ? section.content : normalizeNewlines(text);
  const lines = parseText.split('\n');
  const lineOffset = section.found ? section.contentStartLine : 1;
  let inTable = false;

  for (let index = 0; index < lines.length; index += 1) {
    const cells = pipeCells(lines[index]);
    const line = lineOffset + index;
    if (cells.length === 0) {
      if (inTable) inTable = false;
      continue;
    }
    if (isDeltaHeader(cells)) {
      inTable = true;
      continue;
    }
    if (inTable && isSeparatorRow(cells)) continue;

    const startsWithOperation = cells[0] === 'ADD' || cells[0] === 'REMOVE';
    if (!inTable && !startsWithOperation) continue;
    if (inTable && !startsWithOperation) {
      issues.push({
        code: 'TRACE_DELTA_OPERATION_INVALID',
        message: `Trace Delta operation must be ADD or REMOVE at line ${line}`,
        source,
        line,
      });
      continue;
    }
    if (cells.length !== 4) {
      issues.push({
        code: cells.length < 4 ? 'TRACE_DELTA_ROW_INCOMPLETE' : 'TRACE_DELTA_ROW_INVALID',
        message: `Trace Delta row must contain exactly four columns (Operation, From, Relation, To) at line ${line}; got ${cells.length}`,
        source,
        line,
      });
      continue;
    }
    const rawRelation = normalizeId(cells[2]);
    const relation = normalizeRelation(rawRelation);
    const from = normalizeId(cells[1]);
    const to = normalizeId(cells[3]);
    if (!relation) {
      issues.push({
        code: 'TRACE_DELTA_ROW_INVALID',
        message: `Trace Delta relation must be constrained_by or enforces at line ${line}; got ${JSON.stringify(rawRelation)}`,
        source,
        line,
      });
      continue;
    }
    if (!from || !to) {
      issues.push({
        code: 'TRACE_DELTA_ROW_INVALID',
        message: `Trace Delta From and To must be non-empty formal object IDs at line ${line}`,
        source,
        line,
      });
      continue;
    }
    const edge = { from, relation, to, source };
    operations.push({ operation: cells[0] as 'ADD' | 'REMOVE', edge, source, line });
  }

  const structured = parseStructuredBlocks(parseText, source, 'ADD');
  operations.push(...structured.operations);

  const seen = new Set<string>();
  const opposite = new Map<string, 'ADD' | 'REMOVE'>();
  for (const operation of operations) {
    const key = `${operation.operation}\u0000${edgeKey(operation.edge)}`;
    if (seen.has(key)) {
      issues.push({
        code: `TRACE_DELTA_DUPLICATE_${operation.operation}`,
        message: `Duplicate ${operation.operation} operation: ${operation.edge.from} ${operation.edge.relation} ${operation.edge.to}`,
        source: operation.source,
        line: operation.line,
        edge: operation.edge,
      });
    }
    seen.add(key);
    const edgeIdentity = edgeKey(operation.edge);
    const prior = opposite.get(edgeIdentity);
    if (prior && prior !== operation.operation) {
      issues.push({
        code: 'TRACE_DELTA_CONFLICTING_OPERATIONS',
        message: `The same Trace edge cannot be both ADD and REMOVE in one Delta: ${operation.edge.from} ${operation.edge.relation} ${operation.edge.to}`,
        source: operation.source,
        line: operation.line,
        edge: operation.edge,
      });
    }
    opposite.set(edgeIdentity, operation.operation);
  }

  const contentWithoutDelta = section.found ? section.stripped : normalizeNewlines(text);
  return {
    operations,
    issues,
    marked_section: section.found,
    content_without_governance_delta: contentWithoutDelta,
    has_legacy_trace_payload: hasLegacyTracePayload(contentWithoutDelta),
  };
}

export function applyGovernanceTraceDelta(input: {
  current: Iterable<GovernanceTraceEdge>;
  operations: Iterable<GovernanceTraceDeltaOperation>;
  inheritedIssues?: Iterable<GovernanceTraceIssue>;
}): GovernanceTraceProjection {
  const current = normalizeGovernanceTraceEdges(input.current);
  const operations = Array.from(input.operations);
  const issues = Array.from(input.inheritedIssues ?? []);
  const state = new Map(current.map(edge => [edgeKey(edge), edge]));

  for (const operation of operations) {
    const key = edgeKey(operation.edge);
    if (operation.operation === 'REMOVE') {
      if (!state.has(key)) {
        issues.push({
          code: 'TRACE_DELTA_REMOVE_MISSING_EDGE',
          message: `REMOVE references a non-existing formal Trace edge: ${operation.edge.from} ${operation.edge.relation} ${operation.edge.to}`,
          source: operation.source,
          line: operation.line,
          edge: operation.edge,
        });
        continue;
      }
      state.delete(key);
      continue;
    }
    if (state.has(key)) {
      issues.push({
        code: 'TRACE_DELTA_ADD_EXISTING_EDGE',
        message: `ADD repeats an existing formal Trace edge: ${operation.edge.from} ${operation.edge.relation} ${operation.edge.to}`,
        source: operation.source,
        line: operation.line,
        edge: operation.edge,
      });
      continue;
    }
    state.set(key, operation.edge);
  }

  return {
    current,
    operations,
    prospective: normalizeGovernanceTraceEdges(state.values()),
    issues,
  };
}

function designOwnerMap(
  value: ReadonlyMap<string, string> | Record<string, string>,
): ReadonlyMap<string, string> {
  return value instanceof Map ? value : new Map(Object.entries(value));
}

export function validateGovernanceTraceSemantics(input: {
  edges: Iterable<GovernanceTraceEdge>;
  context: GovernanceTraceSemanticContext;
}): GovernanceTraceIssue[] {
  const issues: GovernanceTraceIssue[] = [];
  const architecture = new Set(input.context.architecture_ids);
  const data = new Set(input.context.data_model_ids);
  const owners = designOwnerMap(input.context.design_owners);
  const design = new Set(owners.keys());
  const contracts = new Map(Array.from(input.context.contracts, entry => [entry.id, entry]));
  const allIds = new Set([...architecture, ...data, ...design, ...contracts.keys()]);

  for (const edge of normalizeGovernanceTraceEdges(input.edges)) {
    if (!allIds.has(edge.from) || !allIds.has(edge.to)) {
      issues.push({
        code: 'TRACE_DANGLING_ENDPOINT',
        message: `Trace edge has a missing endpoint: ${edge.from} ${edge.relation} ${edge.to}`,
        source: edge.source,
        edge,
      });
      continue;
    }

    let legal = false;
    if (edge.relation === 'constrained_by') {
      legal =
        (data.has(edge.from) && architecture.has(edge.to)) ||
        (design.has(edge.from) &&
          (architecture.has(edge.to) || data.has(edge.to) || contracts.has(edge.to)));
      const contract = contracts.get(edge.to);
      if (legal && contract?.module_internal) {
        const consumerModule = owners.get(edge.from) ?? '';
        if (!consumerModule) {
          legal = false;
          issues.push({
            code: 'TRACE_CONSUMER_MODULE_UNRESOLVED',
            message: `Cannot resolve the Module owner of Contract consumer ${edge.from}`,
            source: edge.source,
            edge,
          });
        } else if (consumerModule !== contract.owner_module) {
          legal = false;
          issues.push({
            code: 'TRACE_INTERNAL_CONTRACT_CROSS_MODULE',
            message: `Internal Contract ${contract.id} owned by ${contract.owner_module} is consumed by ${edge.from} in ${consumerModule}`,
            source: edge.source,
            edge,
          });
        }
      }
    } else {
      legal =
        contracts.has(edge.from) &&
        (architecture.has(edge.to) || data.has(edge.to) || design.has(edge.to));
    }

    if (!legal && !issues.some(issue => issue.edge && edgeKey(issue.edge) === edgeKey(edge))) {
      issues.push({
        code: 'TRACE_ILLEGAL_RELATION',
        message: `Illegal Trace relation: ${edge.from} ${edge.relation} ${edge.to}`,
        source: edge.source,
        edge,
      });
    }
  }
  return issues;
}

export function getGovernanceContractConsumers(input: {
  edges: Iterable<GovernanceTraceEdge>;
  design_owners: ReadonlyMap<string, string> | Record<string, string>;
  contract_ids?: Iterable<string>;
}): GovernanceContractConsumer[] {
  const owners = designOwnerMap(input.design_owners);
  const filter = input.contract_ids ? new Set(input.contract_ids) : null;
  const result: GovernanceContractConsumer[] = [];
  for (const edge of normalizeGovernanceTraceEdges(input.edges)) {
    if (edge.relation !== 'constrained_by') continue;
    if (filter && !filter.has(edge.to)) continue;
    const moduleCode = owners.get(edge.from) ?? '';
    if (!moduleCode) continue;
    result.push({ contract_id: edge.to, design_id: edge.from, module_code: moduleCode, edge });
  }
  return result.sort((left, right) =>
    `${left.contract_id}\u0000${left.design_id}`.localeCompare(
      `${right.contract_id}\u0000${right.design_id}`,
    ),
  );
}

function renderGovernanceRelationsSection(edges: Iterable<GovernanceTraceEdge>): string {
  const normalized = normalizeGovernanceTraceEdges(edges);
  return [
    GOVERNANCE_RELATIONS_START,
    '## Governance Relations',
    '',
    '| From | Relation | To |',
    '|---|---|---|',
    ...normalized.map(edge => `| ${edge.from} | ${edge.relation} | ${edge.to} |`),
    GOVERNANCE_RELATIONS_END,
  ].join('\n');
}

export function renderGovernanceTraceDocument(
  baseText: string,
  edges: Iterable<GovernanceTraceEdge>,
): string {
  const source = 'trace_document';
  const section = extractMarkedSection({
    text: baseText,
    source,
    startMarker: GOVERNANCE_RELATIONS_START,
    endMarker: GOVERNANCE_RELATIONS_END,
    codePrefix: 'TRACE_GOVERNANCE_RELATIONS',
  });
  const withoutMarked = section.found ? section.stripped : normalizeNewlines(baseText);
  const preserved = stripUnmarkedRelationTables(withoutMarked).trimEnd();
  return [preserved, renderGovernanceRelationsSection(edges)]
    .filter(part => part.trim().length > 0)
    .join('\n\n') + '\n';
}

export function renderGovernanceTraceMatrix(edges: Iterable<GovernanceTraceEdge>): string {
  return renderGovernanceTraceDocument('# Project Trace Matrix\n', edges);
}

export function moduleTraceProjection(input: {
  edges: Iterable<GovernanceTraceEdge>;
  module_code: string;
  design_owners: ReadonlyMap<string, string> | Record<string, string>;
  contract_owners?: ReadonlyMap<string, string> | Record<string, string>;
}): GovernanceTraceEdge[] {
  const moduleCode = input.module_code.trim().toUpperCase();
  const designOwners = designOwnerMap(input.design_owners);
  const contractOwners = designOwnerMap(input.contract_owners ?? {});
  return normalizeGovernanceTraceEdges(input.edges).filter(edge => {
    if (designOwners.get(edge.from) === moduleCode) return true;
    if (designOwners.get(edge.to) === moduleCode) return true;
    if (contractOwners.get(edge.from) === moduleCode) return true;
    return edge.relation === 'constrained_by' && contractOwners.get(edge.to) === moduleCode;
  });
}

export function renderGovernanceModuleTrace(input: {
  edges: Iterable<GovernanceTraceEdge>;
  module_code: string;
  design_owners: ReadonlyMap<string, string> | Record<string, string>;
  contract_owners?: ReadonlyMap<string, string> | Record<string, string>;
}): string {
  const projected = moduleTraceProjection(input);
  return renderGovernanceTraceDocument(
    [
      `# ${input.module_code.trim().toUpperCase()} Governance Trace View`,
      '',
      '<!-- GENERATED_FROM_PROJECT_TRACE: module projection; do not edit independently -->',
      '',
    ].join('\n'),
    projected,
  );
}

export function compareGovernanceTraceEdges(
  expected: Iterable<GovernanceTraceEdge>,
  actual: Iterable<GovernanceTraceEdge>,
): { matches: boolean; missing: string[]; unexpected: string[] } {
  const expectedKeys = new Set(normalizeGovernanceTraceEdges(expected).map(edgeKey));
  const actualKeys = new Set(normalizeGovernanceTraceEdges(actual).map(edgeKey));
  return {
    matches:
      expectedKeys.size === actualKeys.size &&
      Array.from(expectedKeys).every(key => actualKeys.has(key)),
    missing: uniqueSorted(Array.from(expectedKeys).filter(key => !actualKeys.has(key))),
    unexpected: uniqueSorted(Array.from(actualKeys).filter(key => !expectedKeys.has(key))),
  };
}
