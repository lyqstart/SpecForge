#!/usr/bin/env bun

import { runCurrentReleasePrecheck } from './lib/current-release-precheck';

const args = process.argv.slice(2);
const candidateArg = args.find((arg) => arg.startsWith('--candidate-id='));
const releaseArg = args.find((arg) => arg.startsWith('--release-id='));
const candidateId = candidateArg?.slice('--candidate-id='.length).trim() ?? '';
const releaseId = releaseArg?.slice('--release-id='.length).trim() || 'specforge-v6-current';

if (!candidateId) {
  console.error('CURRENT_RELEASE_PRECHECK_CANDIDATE_ID_REQUIRED');
  process.exit(1);
}

const outcome = await runCurrentReleasePrecheck({
  candidateRoot: process.cwd(),
  releaseId,
  candidateId,
});
console.log(JSON.stringify(outcome, null, 2));
process.exit(outcome.passed ? 0 : 1);
