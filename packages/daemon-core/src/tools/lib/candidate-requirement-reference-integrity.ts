import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { isValidRequirementId } from '@specforge/types';
import {
  inspectRequirementsGeneration,
  type RequirementDocument,
} from './requirements-generation.js';
import { validateTypedReferences } from './acceptance-reference.js';

export type RequirementReferenceIntegrityResult = {
  valid: boolean;
  errors: string[];
  declared_requirement_ids: string[];
  input_files: string[];
};

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
    if (entry.isDirectory()) result.push(...(await walkConsumerFiles(absolute)));
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
  requirementArtifacts: RequirementDocument[];
}): Promise<RequirementReferenceIntegrityResult> {
  const generation = inspectRequirementsGeneration(input.requirementArtifacts);
  const errors: string[] = [...generation.errors];
  const definitionOwners = new Map<string, string[]>();
  for (const artifact of generation.documents) {
    for (const { id } of artifact.definitions) {
      const owners = definitionOwners.get(id) ?? [];
      owners.push(artifact.path);
      definitionOwners.set(id, owners);
      if (!isValidRequirementId(id)) {
        errors.push(
          `REQUIREMENT_ID_NONCANONICAL: ${artifact.path}: ${id}; expected REQ-<MODULE_CODE>-<NNN>`
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

  const candidatesRoot = path.join(input.workItemDir, 'candidates');
  const consumerFiles = await walkConsumerFiles(candidatesRoot);
  for (const filename of [
    'tasks.md',
    'trace_delta.md',
    'design_delta.md',
    'requirements_delta.md',
  ]) {
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
    errors.push(
      ...validateTypedReferences(
        content,
        generation.documents.flatMap(document => document.definitions),
        generation.acceptanceDefinitions
      ).map(error => `${filePath}: ${error}`)
    );
  }

  return {
    valid: errors.length === 0,
    errors: Array.from(new Set(errors)),
    declared_requirement_ids: declaredIds,
    input_files: Array.from(
      new Set([...input.requirementArtifacts.map(artifact => artifact.path), ...consumerFiles])
    ).sort(),
  };
}
