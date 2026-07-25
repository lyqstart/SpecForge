import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SemanticClosureManifest } from '../../src/tools/lib/semantic-closure-core.js';
import {
  captureSemanticClosureProvenance,
  validateSemanticClosureProvenance,
} from '../../src/tools/lib/semantic-closure-provenance.js';

function manifest(): SemanticClosureManifest {
  return {
    schema_version: '1.0',
    work_item_id: 'WI-9201',
    outcomes: [{ id: 'OUT-1', requirement_refs: ['REQ-1'] }],
    requirements: [{ id: 'REQ-1', type: 'MUST', task_refs: ['TASK-1'] }],
    tasks: [{ id: 'TASK-1', requirement_refs: ['REQ-1'], evidence_refs: ['EV-1'] }],
    evidence: [
      {
        id: 'EV-1',
        status: 'passed',
        level: 'L5',
        evidence_type: 'behavioral_e2e',
        supports: ['REQ-1', 'TASK-1'],
      },
    ],
    project_integration: { status: 'not_applicable' },
  };
}

describe('semantic closure provenance', () => {
  let workItemDir: string;

  beforeEach(async () => {
    workItemDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-closure-provenance-'));
    await fs.mkdir(path.join(workItemDir, 'evidence'), { recursive: true });
    await fs.writeFile(path.join(workItemDir, 'work_item.json'), '{}\n');
    await fs.writeFile(path.join(workItemDir, 'verification_report.md'), '# Verification\n');
    await fs.writeFile(
      path.join(workItemDir, 'evidence', 'evidence_manifest.json'),
      '{"entries":[]}\n'
    );
    await fs.writeFile(path.join(workItemDir, 'changed_files_audit.md'), 'Result: PASS\n');
  });

  afterEach(async () => {
    await fs.rm(workItemDir, { recursive: true, force: true });
  });

  it('passes while payload and governed inputs are unchanged', async () => {
    const closure = manifest();
    closure.provenance = await captureSemanticClosureProvenance({
      workItemDir,
      source: 'tool_argument',
      manifest: closure,
    });

    await expect(validateSemanticClosureProvenance(workItemDir, closure)).resolves.toEqual({
      passed: true,
      errors: [],
    });
  });

  it('fails after an upstream verification input changes', async () => {
    const closure = manifest();
    closure.provenance = await captureSemanticClosureProvenance({
      workItemDir,
      source: 'tool_argument',
      manifest: closure,
    });
    await fs.writeFile(path.join(workItemDir, 'verification_report.md'), '# Changed\n');

    const result = await validateSemanticClosureProvenance(workItemDir, closure);
    expect(result.passed).toBe(false);
    expect(result.errors.join('\n')).toContain('verification_report.md changed');
  });

  it('does not bind mutable lifecycle metadata from work_item.json', async () => {
    const closure = manifest();
    closure.provenance = await captureSemanticClosureProvenance({
      workItemDir,
      source: 'tool_argument',
      manifest: closure,
    });
    await fs.writeFile(
      path.join(workItemDir, 'work_item.json'),
      '{"status":"verification_done","code_permission_revoked":true}\n'
    );

    await expect(validateSemanticClosureProvenance(workItemDir, closure)).resolves.toEqual({
      passed: true,
      errors: [],
    });
  });

  it('fails after the semantic payload is edited', async () => {
    const closure = manifest();
    closure.provenance = await captureSemanticClosureProvenance({
      workItemDir,
      source: 'tool_argument',
      manifest: closure,
    });
    closure.outcomes?.push({ id: 'OUT-TAMPERED' });

    const result = await validateSemanticClosureProvenance(workItemDir, closure);
    expect(result.passed).toBe(false);
    expect(result.errors.join('\n')).toContain('PAYLOAD_STALE');
  });
});
