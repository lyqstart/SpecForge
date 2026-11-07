#!/usr/bin/env bun

import { buildReleaseRuntimeArtifacts } from './lib/release-runtime-artifact-producer';
import { buildVerificationAssets } from './lib/verification-asset-producer';

const artifacts = await buildReleaseRuntimeArtifacts({
  candidateRoot: process.cwd(),
  bunExecutable: process.execPath,
});
const verificationAssets = await buildVerificationAssets({ candidateRoot:process.cwd() });

console.log(JSON.stringify({
  schema_version: '1.0',
  platform: `${process.platform}-${process.arch}`,
  artifacts,
  verification_assets:verificationAssets,
}, null, 2));
