import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

export const KNOWLEDGE_GRAPH_WRITE_PROVENANCE_SCHEMA =
  'knowledge_graph_controlled_writes.v1';

export const KNOWLEDGE_GRAPH_PROJECT_PATH = '.specforge/knowledge/graph.json';

export interface TrustedKnowledgeGraphWrite {
  path: string;
  producer: 'sf_knowledge_graph_core';
  sha256: string;
  recorded_at: string;
}

interface KnowledgeGraphWriteProvenance {
  schema_version: string;
  updated_at: string;
  writes: TrustedKnowledgeGraphWrite[];
}

function normalizeRelative(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .toLowerCase();
}

function provenancePath(projectRoot: string): string {
  return path.join(
    projectRoot,
    SPEC_DIR_NAME,
    'runtime',
    'knowledge_graph_controlled_writes.json',
  );
}

function graphPath(projectRoot: string): string {
  return path.join(projectRoot, ...KNOWLEDGE_GRAPH_PROJECT_PATH.split('/'));
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function emptyProvenance(): KnowledgeGraphWriteProvenance {
  return {
    schema_version: KNOWLEDGE_GRAPH_WRITE_PROVENANCE_SCHEMA,
    updated_at: new Date(0).toISOString(),
    writes: [],
  };
}

function readProvenance(projectRoot: string): KnowledgeGraphWriteProvenance {
  try {
    const parsed = JSON.parse(fs.readFileSync(provenancePath(projectRoot), 'utf-8'));
    if (
      parsed?.schema_version !== KNOWLEDGE_GRAPH_WRITE_PROVENANCE_SCHEMA ||
      !Array.isArray(parsed?.writes)
    ) {
      return emptyProvenance();
    }
    return parsed as KnowledgeGraphWriteProvenance;
  } catch {
    return emptyProvenance();
  }
}

function writeAtomically(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, content, 'utf-8');
  fs.renameSync(temp, filePath);
}

export function recordKnowledgeGraphProjectWrite(
  projectRoot: string,
): TrustedKnowledgeGraphWrite {
  const absolute = graphPath(projectRoot);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(`KNOWLEDGE_GRAPH_PROVENANCE_TARGET_MISSING: ${KNOWLEDGE_GRAPH_PROJECT_PATH}`);
  }

  const now = new Date().toISOString();
  const entry: TrustedKnowledgeGraphWrite = {
    path: KNOWLEDGE_GRAPH_PROJECT_PATH,
    producer: 'sf_knowledge_graph_core',
    sha256: sha256File(absolute),
    recorded_at: now,
  };
  const next: KnowledgeGraphWriteProvenance = {
    schema_version: KNOWLEDGE_GRAPH_WRITE_PROVENANCE_SCHEMA,
    updated_at: now,
    writes: [entry],
  };
  writeAtomically(provenancePath(projectRoot), JSON.stringify(next, null, 2) + '\n');
  return entry;
}

export function readTrustedKnowledgeGraphProjectWrites(
  projectRoot: string,
): TrustedKnowledgeGraphWrite[] {
  const absolute = graphPath(projectRoot);
  return readProvenance(projectRoot).writes.filter(entry => {
    if (normalizeRelative(entry?.path) !== KNOWLEDGE_GRAPH_PROJECT_PATH) return false;
    if (entry?.producer !== 'sf_knowledge_graph_core') return false;
    if (!/^[a-f0-9]{64}$/i.test(String(entry?.sha256 ?? ''))) return false;
    if (Number.isNaN(Date.parse(String(entry?.recorded_at ?? '')))) return false;
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return false;
    return sha256File(absolute) === String(entry.sha256).toLowerCase();
  });
}
