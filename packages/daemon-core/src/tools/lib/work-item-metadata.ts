import * as fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { validateWorkItemJson } from './artifact-schema-validation';

export type WorkItemMetadata = Record<string, unknown> & {
  schema_version: '1.1';
  work_item_id: string;
};

function validationError(workItemId: string, errors: readonly string[]): Error {
  return new Error(`WORK_ITEM_METADATA_INVALID: ${workItemId}: ${errors.join('; ')}`);
}

export async function readWorkItemMetadata(
  workItemDir: string,
  workItemId: string,
): Promise<WorkItemMetadata> {
  const metadataPath = path.join(workItemDir, 'work_item.json');
  let content: string;
  try {
    content = await fs.readFile(metadataPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`WORK_ITEM_NOT_FOUND: ${workItemId}`);
    }
    throw new Error(
      `WORK_ITEM_METADATA_READ_FAILED: ${workItemId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const validation = validateWorkItemJson(content, workItemId);
  if (!validation.valid) throw validationError(workItemId, validation.errors);
  return JSON.parse(content) as WorkItemMetadata;
}

export function readWorkItemMetadataSync(
  workItemDir: string,
  workItemId: string,
): WorkItemMetadata {
  const metadataPath = path.join(workItemDir, 'work_item.json');
  let content: string;
  try {
    content = readFileSync(metadataPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`WORK_ITEM_NOT_FOUND: ${workItemId}`);
    }
    throw new Error(
      `WORK_ITEM_METADATA_READ_FAILED: ${workItemId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const validation = validateWorkItemJson(content, workItemId);
  if (!validation.valid) throw validationError(workItemId, validation.errors);
  return JSON.parse(content) as WorkItemMetadata;
}

export async function writeWorkItemMetadata(
  workItemDir: string,
  workItemId: string,
  metadata: WorkItemMetadata,
): Promise<void> {
  const content = JSON.stringify(metadata, null, 2) + '\n';
  const validation = validateWorkItemJson(content, workItemId);
  if (!validation.valid) throw validationError(workItemId, validation.errors);
  await fs.writeFile(path.join(workItemDir, 'work_item.json'), content, 'utf8');
}
