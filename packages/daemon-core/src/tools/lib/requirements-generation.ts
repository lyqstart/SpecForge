import { isValidRequirementId } from '@specforge/types';

export type RequirementDocument = { path: string; content: string; moduleCode?: string };
export type RequirementRole = 'requirements' | 'reference_context';
export type RequirementDefinition = { id: string; body: string; path: string };

/** D28: recognize tokens for diagnostics; validity remains owned by types/id-rules. */
export function requirementTokens(content: string): string[] {
  return [...new Set(content.match(/\bREQ-[A-Z0-9][A-Z0-9_-]*\b/gi) ?? [])].sort();
}

export function parseRequirementDocument(document: RequirementDocument): {
  role: RequirementRole;
  definitions: RequirementDefinition[];
  references: string[];
  errors: string[];
} {
  const { content } = document;
  const errors: string[] = [];
  const frontmatter = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  const declarations = [...content.matchAll(/^\s*requirements_role\s*:\s*(.*?)\s*$/gm)];
  const roles = [...(frontmatter?.[1] ?? '').matchAll(/^requirements_role:\s*(.*?)\s*$/gm)];
  let role: RequirementRole = 'requirements';
  if (declarations.length > 0) {
    if (declarations.length !== 1 || roles.length !== 1) {
      errors.push('REQUIREMENTS_ROLE_INVALID: one top-level frontmatter declaration required');
    } else if (roles[0][1] === 'reference_context' || roles[0][1] === 'requirements') {
      role = roles[0][1];
    } else {
      errors.push('REQUIREMENTS_ROLE_INVALID: expected requirements or reference_context');
    }
  }
  const headings = [...content.matchAll(/^(#{1,6})\s+([^\r\n]*)$/gm)].map(match => ({
    level: match[1].length,
    title: match[2],
    start: match.index,
    bodyStart: match.index + match[0].length,
  }));
  const definitions: RequirementDefinition[] = [];
  for (const heading of headings) {
    const id = /^(?:Requirement\s+)?(REQ-[A-Z0-9][A-Z0-9_-]*)\b/i.exec(heading.title)?.[1];
    if (!id || heading.level < 2) continue;
    const next = headings.find(item => item.start > heading.start && item.level <= heading.level);
    const body = content.slice(heading.bodyStart, next?.start ?? content.length).trim();
    definitions.push({ id, body, path: document.path });
    if (document.moduleCode !== undefined && id.split('-')[1] !== document.moduleCode) {
      errors.push(`${id}: REQUIREMENT_DEFINITION_WRONG_OWNER: expected ${document.moduleCode}`);
    }
    const semanticBody = body
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^#{1,6}\s+.*$/gm, '')
      .replace(/^\s*(?:[-*]\s*)?(?:验收标准|Acceptance Criteria)\s*[:：]?\s*$/gim, '')
      .trim();
    if (!semanticBody) errors.push(`${id}: formal requirement body is empty`);
    if (!/(?:验收标准|Acceptance Criteria)/i.test(body)) {
      errors.push(`${id}: acceptance criteria missing from formal requirement body`);
    }
  }
  if (role === 'reference_context') {
    if (definitions.length > 0) errors.push('REFERENCE_CONTEXT_DEFINITION_FORBIDDEN');
    if (
      /^(?:#{1,6}\s+(?:验收标准|Acceptance\s+Criteria)(?:\s|[:：（(]|$)|\s*(?:[-*]\s*)?(?:\*\*)?(?:验收标准|Acceptance\s+Criteria|verification_strategy)(?:\s*[（(][^）)\r\n]*[）)])?(?:\*\*)?\s*(?:[:：]|$))/im.test(
        content
      ) ||
      /^#{1,6}\s+AC-[A-Z0-9_-]+\b/im.test(content)
    ) {
      errors.push('REFERENCE_CONTEXT_ACCEPTANCE_OR_STRATEGY_FORBIDDEN');
    }
    // Definitions never contribute coverage even when the document is rejected.
  }
  const references = requirementTokens(content);
  for (const id of references) {
    if (!isValidRequirementId(id)) {
      errors.push(`${id}: requirement ID must use canonical REQ-<MODULE_CODE>-<NNN> format`);
    }
  }
  return { role, definitions: role === 'reference_context' ? [] : definitions, references, errors };
}

/** A reference can resolve only to one substantive definition in the supplied authority set. */
export function inspectRequirementsGeneration(documents: RequirementDocument[]): {
  errors: string[];
  declaredIds: string[];
  documents: Array<RequirementDocument & ReturnType<typeof parseRequirementDocument>>;
} {
  const parsed = documents.map(document => ({
    ...document,
    ...parseRequirementDocument(document),
  }));
  const errors = parsed.flatMap(document =>
    document.errors.map(error => `${document.path}: ${error}`)
  );
  const owners = new Map<string, RequirementDefinition[]>();
  for (const document of parsed) {
    for (const definition of document.definitions) {
      const matches = owners.get(definition.id) ?? [];
      matches.push(definition);
      owners.set(definition.id, matches);
    }
  }
  for (const [id, definitions] of owners) {
    if (definitions.length > 1) {
      errors.push(
        `${id}: formal requirement body must be unique, found ${definitions.length}; files=${definitions.map(d => d.path).join(',')}`
      );
    }
  }
  for (const document of parsed) {
    for (const id of document.references) {
      if (!owners.has(id)) errors.push(`${document.path}: ${id}: formal requirement body missing`);
    }
  }
  return {
    errors: [...new Set(errors)],
    declaredIds: [...owners.keys()].filter(isValidRequirementId).sort(),
    documents: parsed,
  };
}

/** Parse roles before concatenating files: context references cannot create strategies. */
export function requirementDefinitionContent(documents: RequirementDocument[]): string {
  return documents
    .filter(document => {
      const parsed = parseRequirementDocument(document);
      const roleErrors = parsed.errors.filter(
        error => error.startsWith('REQUIREMENTS_ROLE_') || error.startsWith('REFERENCE_CONTEXT_')
      );
      if (roleErrors.length > 0) throw new Error(roleErrors.join('; '));
      return parsed.role === 'requirements';
    })
    .map(document => document.content)
    .join('\n\n');
}
