import {
  sfWriteGuardPreflight,
  type V12WriteGuardPreflightInput,
} from '../../packages/daemon-core/src/tools/lib/write-guard-preflight-v12';

export default async function sf_write_guard_preflight(input: V12WriteGuardPreflightInput) {
  return sfWriteGuardPreflight(input);
}
