#!/usr/bin/env bun

import {
  produceReleaseManifest,
  produceRuntimeEntrySurfaceReport,
} from './lib/release-manifest-producer';
import { readCliOption } from './lib/cli-option';
import { loadProductIdentity } from './lib/product-identity';

const args = process.argv.slice(2);
const candidateId = readCliOption(args, '--candidate-id');
if (!candidateId) {
  throw new Error('RELEASE_CANDIDATE_ID_REQUIRED: pass --candidate-id <immutable-candidate-id>');
}

const identity = await loadProductIdentity(process.cwd());
const requestedReleaseId = readCliOption(args, '--release-id');
if (requestedReleaseId && requestedReleaseId !== identity.releaseId) {
  throw new Error(
    `RELEASE_ID_MISMATCH:requested:${requestedReleaseId}:authoritative:${identity.releaseId}`,
  );
}
const releaseId = identity.releaseId;
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
