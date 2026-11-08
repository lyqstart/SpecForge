import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { isValidRequirementId } from '@specforge/types';

export type RequirementReferenceIntegrityResult = {
  valid: boolean;
  errors: string[];
  declared_requirement_ids: string[];
  input_files: string[];
};

const REQUIREMENT_TOKEN = /\bREQ-[A-Z][A-Z0-9]{1,11}-[0-9]+\b/g;

function requirementTokens(content: string): string[] {
  return Array.from(new Set((content.toUpperCase().match(REQUIREMENT_TOKEN) ?? []))).sort();
}

function requirementDefinitions(content: string): string[] {
  const definitions: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const heading = /^#{2,6}\s+(?:Requirement\s+)?(REQ-[A-Z][A-Z0-9]{1,11}-[0-9]+)\b/i.exec(line);
    if (heading) definitions.push(heading[1].toUpperCase());
  }
  return definitions;
}

async function walkConsumerFiles(root: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const result: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await walkConsumerFiles(absolute));
    else if (
      entry.isFile() &&
      /\.(?:md|json)$/i.test(entry.name) &&
      !/^requirements(?:\.candidate)?\.md$/i.test(entry.name)
    ) {
      result.push(absolute);
    }
  }
  return result;
}

export async function validateCandidateRequirementReferences(input: {
  workItemDir: string;
  requirementArtifacts: Array<{ path: string; content: string }>;
}): Promise<RequirementReferenceIntegrityResult> {
  const errors: string[] = [];
  const definitionOwners = new Map<string, string[]>();
  for (const artifact of input.requirementArtifacts) {
    for (const id of requirementDefinitions(artifact.content)) {
      const owners = definitionOwners.get(id) ?? [];
      owners.push(artifact.path);
      definitionOwners.set(id, owners);
      if (!isValidRequirementId(id)) {
        errors.push(
          `REQUIREMENT_ID_NONCANONICAL: ${artifact.path}: ${id}; expected REQ-<MODULE_CODE>-<NNN>`,
        );
      }
    }
  }
  for (const [id, owners] of definitionOwners) {
    if (owners.length > 1) {
      errors.push(`REQUIREMENT_DEFINITION_DUPLICATE: ${id}; files=${owners.join(',')}`);
    }
  }
  const declaredIds = [...definitionOwners.keys()].filter(isValidRequirementId).sort();
  const declared = new Set(declaredIds);

  const candidatesRoot = path.join(input.workItemDir, 'candidates');
  const consumerFiles = await walkConsumerFiles(candidatesRoot);
  for (const filename of ['tasks.md', 'trace_delta.md', 'design_delta.md', 'requirements_delta.md']) {
    const absolute = path.join(input.workItemDir, filename);
    try {
      const stat = await fs.stat(absolute);
      if (stat.isFile()) consumerFiles.push(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  for (const filePath of Array.from(new Set(consumerFiles)).sort()) {
    const content = await fs.readFile(filePath, 'utf-8');
    for (const reference of requirementTokens(content)) {
      if (!isValidRequirementId(reference)) {
        errors.push(
          `REQUIREMENT_REFERENCE_NONCANONICAL: ${filePath}: ${reference}; expected REQ-<MODULE_CODE>-<NNN>`,
        );
      } else if (!declared.has(reference)) {
        errors.push(
          `REQUIREMENT_REFERENCE_UNRESOLVED: ${filePath}: ${reference} is not defined by the current authoritative Requirements set`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: Array.from(new Set(errors)),
    declared_requirement_ids: declaredIds,
    input_files: Array.from(new Set([
      ...input.requirementArtifacts.map(artifact => artifact.path),
      ...consumerFiles,
    ])).sort(),
  };
}
