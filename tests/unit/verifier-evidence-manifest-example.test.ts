import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EvidenceManifestSchema, SchemaEvidenceManifestSchema } from '../../packages/types/src/index';

const document = readFileSync(resolve(import.meta.dirname, '../../setup/userlevel-opencode/agents/sf-verifier.md'), 'utf8');
const examples = [...document.matchAll(/```json\s*\n([\s\S]*?)\n```/g)]
  .map(match => JSON.parse(match[1]!))
  .filter(value => value && Array.isArray(value.entries) && value.schema_version === '1.0');

function instantiate(example: any) {
  const value = structuredClone(example);
  value.work_item_id = 'WI-9001';
  for (const [index, entry] of value.entries.entries()) {
    // Replace example placeholders only; never fill a required key omitted by the document.
    if (Object.hasOwn(entry, 'evidence_id')) entry.evidence_id = `EV-EXAMPLE-${index}`;
    if (Object.hasOwn(entry, 'id')) entry.id = `EV-EXAMPLE-${index}`;
    if (Object.hasOwn(entry, 'created_at')) entry.created_at = '2026-11-07T00:00:00.000Z';
    if (typeof entry.type === 'string') entry.type = entry.type.split(' | ')[0];
  }
  return value;
}

describe('Verifier Manifest examples consume the actual producer schemas', () => {
  it('keeps every documented Manifest compatible with both registered schema projections', () => {
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) for (const schema of [EvidenceManifestSchema, SchemaEvidenceManifestSchema]) {
      const result = schema.safeParse(instantiate(example));
      expect(result.success, JSON.stringify(result)).toBe(true);
    }
  });

  it('requires canonical keys even when semantic or legacy aliases remain present', () => {
    for (const example of examples) for (const key of ['evidence_id', 'type', 'path', 'description', 'created_at']) {
      const value = instantiate(example);
      value.entries[0].artifact_type = 'test_output';
      value.entries[0].evidence_type = 'behavioral';
      delete value.entries[0][key];
      for (const schema of [EvidenceManifestSchema, SchemaEvidenceManifestSchema]) {
        expect(schema.safeParse(value).success, key).toBe(false);
      }
    }
  });
});
