import { isValidRequirementId } from '@specforge/types';

export type AcceptanceDefinition = {
  id: string;
  parentId: string;
  path: string;
  body: string;
};

/** D29: a distinct AC type, never a shortened or aliased Requirement identity. */
export function parseAcceptanceReference(token: string): { id: string; parentId: string } | null {
  const match = /^(?:AC|REQ)-([A-Z0-9_]+)-(\d{3})-([1-9]\d*)$/.exec(token);
  if (!match) return null;
  const parentId = `REQ-${match[1]}-${match[2]}`;
  if (!isValidRequirementId(parentId)) return null;
  return { id: `AC-${match[1]}-${match[2]}-${match[3]}`, parentId };
}

export function typedReferenceTokens(content: string): string[] {
  return [...new Set(content.match(/\b(?:REQ|AC)-[A-Z0-9][A-Z0-9_-]*\b/gi) ?? [])].sort();
}

export function acceptanceDefinitionMarkers(content: string): RegExpMatchArray[] {
  return [
    ...content.matchAll(
      /^(?:[ \t]*[-*][ \t]+(AC-[A-Z0-9][A-Z0-9_-]*)[ \t]*[:：]|#{2,6}[ \t]+(AC-[A-Z0-9][A-Z0-9_-]*)\b)([^\r\n]*)/gm
    ),
  ];
}

export function parseAcceptanceDefinitions(parent: { id: string; body: string; path: string }): {
  definitions: AcceptanceDefinition[];
  errors: string[];
} {
  const definitions: AcceptanceDefinition[] = [];
  const errors: string[] = [];
  const markers = acceptanceDefinitionMarkers(parent.body);
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const start = marker.index!;
    const id = marker[1] ?? marker[2];
    const reference = parseAcceptanceReference(id);
    let end = markers[i + 1]?.index ?? parent.body.length;
    const level = /^#+/.exec(marker[0])?.[0].length;
    if (level !== undefined) {
      const tail = parent.body.slice(start + marker[0].length, end);
      const next = [...tail.matchAll(/^(#{1,6})\s+/gm)].find(h => h[1].length <= level);
      if (next) end = start + marker[0].length + next.index;
    }
    let continuation = parent.body.slice(start + marker[0].length, end);
    if (level === undefined) {
      const lines: string[] = [];
      for (const line of continuation.split('\n').slice(1)) {
        if (line.trim() && !/^[ \t]+/.test(line)) break;
        lines.push(line);
      }
      continuation = '\n' + lines.join('\n');
    }
    const body = (marker[3].replace(/^\s*[:：]\s*/, '') + continuation)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^#{1,6}\s+.*$/gm, '')
      .trim();
    if (!reference) errors.push(`AC_ID_NONCANONICAL: ${id}`);
    if (reference?.parentId !== parent.id)
      errors.push(`AC_PARENT_MISMATCH: ${id}; parent=${parent.id}`);
    if (!body) errors.push(`AC_BODY_EMPTY: ${id}`);
    definitions.push({ id, parentId: parent.id, path: parent.path, body });
  }
  return { definitions, errors };
}

export function validateTypedReferences(
  content: string,
  requirements: Array<{ id: string }>,
  acceptance: AcceptanceDefinition[]
): string[] {
  const errors: string[] = [];
  for (const token of typedReferenceTokens(content)) {
    const ac = parseAcceptanceReference(token);
    if (ac) {
      const parents = requirements.filter(r => r.id === ac.parentId);
      const definitions = acceptance.filter(a => a.id === ac.id);
      if (
        parents.length !== 1 ||
        definitions.length !== 1 ||
        definitions[0].parentId !== ac.parentId ||
        !definitions[0].body
      ) {
        errors.push(
          `AC_REFERENCE_UNRESOLVED_OR_AMBIGUOUS: ${token}; expected unique ${ac.id} in ${ac.parentId}`
        );
      }
    } else if (!isValidRequirementId(token)) {
      errors.push(
        `REQUIREMENT_REFERENCE_NONCANONICAL: ${token}; expected canonical REQ or typed AC reference`
      );
    } else if (requirements.filter(r => r.id === token).length !== 1) {
      errors.push(
        `REQUIREMENT_REFERENCE_UNRESOLVED: ${token}: formal requirement body missing or not unique`
      );
    }
  }
  return errors;
}
