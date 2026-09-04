import * as fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import {
  createWorkItemMetadataSchemaDescriptor,
  precheckSchemaDescriptors,
  type SchemaDescriptorPrecheckResult,
} from '@specforge/migration';

import { validateWorkItemJson } from './artifact-schema-validation';

export type WorkItemMetadata = Record<string, unknown> & {
  schema_version: '1.1';
  work_item_id: string;
};

export { createWorkItemMetadataSchemaDescriptor } from '@specforge/migration';

export async function precheckWorkItemMetadataSchema(
  workItemDir: string,
  workItemId: string,
): Promise<SchemaDescriptorPrecheckResult> {
  return precheckSchemaDescriptors(workItemDir, [
    createWorkItemMetadataSchemaDescriptor(workItemId),
  ]);
}

function validationError(workItemId: string, errors: readonly string[]): Error {
  return new Error(`WORK_ITEM_METADATA_INVALID: ${workItemId}: ${errors.join('; ')}`);
}

export async function readWorkItemMetadata(
  workItemDir: string,
  workItemId: string,
): Promise<WorkItemMetadata> {
  const schemaPrecheck = await precheckWorkItemMetadataSchema(workItemDir, workItemId);
  const schemaCheck = schemaPrecheck.checks[0];
  if (!schemaPrecheck.ok || schemaPrecheck.needsMigration) {
    if (schemaCheck?.errorCode === 'FILE_REQUIRED') {
      throw new Error(`WORK_ITEM_NOT_FOUND: ${workItemId}`);
    }
    throw new Error(
      `WORK_ITEM_METADATA_INVALID: ${workItemId}: WORK_ITEM_METADATA_SCHEMA_BLOCKED: ${schemaCheck?.errorCode ?? 'MIGRATION_REQUIRED'}`,
    );
  }
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
  if (!createWorkItemMetadataSchemaDescriptor(workItemId).validateCurrent(metadata)) {
    throw new Error(`WORK_ITEM_METADATA_SCHEMA_BLOCKED: ${workItemId}: VALIDATION_FAILED`);
  }
  await fs.writeFile(path.join(workItemDir, 'work_item.json'), content, 'utf8');
}
