#!/usr/bin/env bun

import { buildReleaseRuntimeArtifacts } from './lib/release-runtime-artifact-producer';

const artifacts = await buildReleaseRuntimeArtifacts({
  candidateRoot: process.cwd(),
  bunExecutable: process.execPath,
});

console.log(JSON.stringify({
  schema_version: '1.0',
  platform: `${process.platform}-${process.arch}`,
  artifacts,
}, null, 2));
