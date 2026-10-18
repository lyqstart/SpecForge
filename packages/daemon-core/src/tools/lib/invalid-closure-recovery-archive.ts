import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const INPUTS = [
  'verification_report.md',
  'evidence/evidence_manifest.json',
  '.semantic_closure.json',
  'gates/verification_gate.json',
  'gates/formal_version_gate.json',
  'gates/close_gate.json',
  'formal_version_snapshot.json',
  'closure_recovery.json',
  'changed_files_audit.md',
  'write_guard_log.jsonl',
  'hard_stop_resolution.jsonl',
] as const;

export async function archiveInvalidClosureEvidence(workItemDir: string): Promise<{
  generation_id: string;
  manifest_path: string;
  manifest_sha256: string;
}> {
  const generationId = `invalid-closure-${randomUUID()}`;
  const root = path.join(workItemDir, 'recovery_generations');
  const temporary = path.join(root, `${generationId}.tmp`);
  const final = path.join(root, generationId);
  await fs.mkdir(temporary, { recursive: true });
  const files: Array<{ path: string; size: number; sha256: string }> = [];
  try {
    for (const relative of INPUTS) {
      const source = path.join(workItemDir, relative);
      let stat;
      try { stat = await fs.lstat(source); }
      catch (error: any) {
        if (error?.code === 'ENOENT') continue;
        throw error;
      }
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`INVALID_CLOSURE_ARCHIVE_SOURCE_NOT_REGULAR: ${relative}`);
      }
      const bytes = await fs.readFile(source);
      const destination = path.join(temporary, relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, bytes, { flag: 'wx' });
      files.push({
        path: relative,
        size: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    if (!files.some(file => file.path === 'gates/close_gate.json')) {
      throw new Error('INVALID_CLOSURE_ARCHIVE_CLOSE_EVIDENCE_MISSING');
    }
    const manifest = Buffer.from(JSON.stringify({
      schema_version: '1.0', generation_id: generationId, files,
    }, null, 2) + '\n');
    await fs.writeFile(path.join(temporary, 'manifest.json'), manifest, { flag: 'wx' });
    await fs.rename(temporary, final);
    return {
      generation_id: generationId,
      manifest_path: path.relative(workItemDir, path.join(final, 'manifest.json')).replace(/\\/g, '/'),
      manifest_sha256: createHash('sha256').update(manifest).digest('hex'),
    };
  } catch (error) {
    const relative = path.relative(path.resolve(root), path.resolve(temporary));
    if (relative === `${generationId}.tmp`) {
      await fs.rm(temporary, { recursive: true, force: true });
    }
    throw error;
  }
}
