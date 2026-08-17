import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadGraphStore,
  saveGraphStore,
  type GraphStore,
} from '../src/tools/lib/sf_knowledge_graph_core';
import {
  KNOWLEDGE_GRAPH_PROJECT_PATH,
  readTrustedKnowledgeGraphProjectWrites,
} from '../src/tools/lib/knowledge-graph-write-provenance';
import { readTrustedChangedFilesAuditControlPlaneWrites } from '../src/tools/lib/changed-files-audit-trusted-writes';
import { runChangedFilesAudit } from '../src/tools/lib/changed-files-audit';

describe('Phase12 Knowledge Graph Changed Files Audit provenance', () => {
  const roots: string[] = [];

  async function createRoot(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), 'sf-kg-provenance-'));
    roots.push(root);
    return root;
  }

  async function writeGraphWithoutProvenance(root: string): Promise<void> {
    const absolute = path.join(root, ...KNOWLEDGE_GRAPH_PROJECT_PATH.split('/'));
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, JSON.stringify({ version: '1.0', nodes: [], edges: [] }, null, 2), 'utf-8');
  }

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  });

  it('records provenance on initial graph creation and lets the canonical audit resolver trust it', async () => {
    const root = await createRoot();
    const loaded = await loadGraphStore(root);
    expect(loaded.success).toBe(true);

    const direct = readTrustedKnowledgeGraphProjectWrites(root);
    expect(direct).toHaveLength(1);
    expect(direct[0]).toMatchObject({
      path: KNOWLEDGE_GRAPH_PROJECT_PATH,
      producer: 'sf_knowledge_graph_core',
    });

    const canonical = readTrustedChangedFilesAuditControlPlaneWrites(root);
    expect(canonical.some(entry => entry.path === KNOWLEDGE_GRAPH_PROJECT_PATH)).toBe(true);

    const audit = runChangedFilesAudit(
      [{ path: KNOWLEDGE_GRAPH_PROJECT_PATH, operation: 'create' }],
      [],
      'agent',
      canonical,
    );
    expect(audit.passed).toBe(true);
    expect(audit.trusted_control_plane_files).toBe(1);
    expect(audit.entries[0]?.trusted_control_plane_write).toBe(true);
    expect(audit.entries[0]?.actor).toBe('sf_knowledge_graph_core');
  });

  it('fails closed when graph.json exists without structured provenance', async () => {
    const root = await createRoot();
    await writeGraphWithoutProvenance(root);
    const trusted = readTrustedChangedFilesAuditControlPlaneWrites(root);
    expect(trusted.some(entry => entry.path === KNOWLEDGE_GRAPH_PROJECT_PATH)).toBe(false);

    const audit = runChangedFilesAudit(
      [{ path: KNOWLEDGE_GRAPH_PROJECT_PATH, operation: 'create' }],
      [],
      'agent',
      trusted,
    );
    expect(audit.passed).toBe(false);
    expect(audit.violations).toContain(`out_of_scope: ${KNOWLEDGE_GRAPH_PROJECT_PATH}`);
  });

  it('fails closed when graph.json hash drifts after a trusted Runtime save', async () => {
    const root = await createRoot();
    const store: GraphStore = { version: '1.0', nodes: [], edges: [] };
    await saveGraphStore(store, root);
    expect(readTrustedKnowledgeGraphProjectWrites(root)).toHaveLength(1);

    const absolute = path.join(root, ...KNOWLEDGE_GRAPH_PROJECT_PATH.split('/'));
    await writeFile(
      absolute,
      JSON.stringify({ version: '1.0', nodes: [{ tampered: true }], edges: [] }, null, 2),
      'utf-8',
    );

    const trusted = readTrustedChangedFilesAuditControlPlaneWrites(root);
    expect(trusted.some(entry => entry.path === KNOWLEDGE_GRAPH_PROJECT_PATH)).toBe(false);
    const audit = runChangedFilesAudit(
      [{ path: KNOWLEDGE_GRAPH_PROJECT_PATH, operation: 'modify' }],
      [],
      'agent',
      trusted,
    );
    expect(audit.passed).toBe(false);
    expect(audit.violations).toContain(`out_of_scope: ${KNOWLEDGE_GRAPH_PROJECT_PATH}`);
  });

  it('does not turn the knowledge directory into a path whitelist', async () => {
    const root = await createRoot();
    const store: GraphStore = { version: '1.0', nodes: [], edges: [] };
    await saveGraphStore(store, root);
    const unrelated = '.specforge/knowledge/evil.json';
    const unrelatedAbsolute = path.join(root, ...unrelated.split('/'));
    await writeFile(unrelatedAbsolute, '{}', 'utf-8');

    const trusted = readTrustedChangedFilesAuditControlPlaneWrites(root);
    expect(trusted.some(entry => entry.path === unrelated)).toBe(false);
    const audit = runChangedFilesAudit(
      [{ path: unrelated, operation: 'create' }],
      [],
      'agent',
      trusted,
    );
    expect(audit.passed).toBe(false);
    expect(audit.violations).toContain(`out_of_scope: ${unrelated}`);
  });
});
