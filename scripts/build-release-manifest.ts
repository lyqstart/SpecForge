#!/usr/bin/env bun

import {
  produceReleaseManifest,
  produceRuntimeEntrySurfaceReport,
} from './lib/release-manifest-producer';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : undefined;
  return value || undefined;
}

const candidateId = option('--candidate-id');
if (!candidateId) {
  throw new Error('RELEASE_CANDIDATE_ID_REQUIRED: pass --candidate-id <immutable-candidate-id>');
}

const releaseId = option('--release-id') ?? 'specforge-v6-current';
const manifest = await produceReleaseManifest({
  candidateRoot: process.cwd(),
  releaseId,
  candidateId,
});
const runtimeEntry = await produceRuntimeEntrySurfaceReport({
  candidateRoot: process.cwd(),
  releaseId,
  candidateId,
  manifestPath: manifest.manifestPath,
});
const errors = [...manifest.errors, ...runtimeEntry.errors];
if (errors.length > 0) {
  throw new Error(`RELEASE_MANIFEST_PRODUCTION_FAILED:\n${errors.join('\n')}`);
}

console.log(JSON.stringify({
  schemaVersion: '1.0',
  releaseId,
  candidateId,
  manifestPath: manifest.manifestPath,
  releaseManifestReport: manifest.report,
  runtimeEntryReport: runtimeEntry.report,
}, null, 2));
