import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Developer-test environment only; product link/path guards remain unchanged. */
export function qualifyTemporaryEnvironment(requested = os.tmpdir()) {
  if (!path.isAbsolute(requested)) throw new Error('QUALIFICATION_TEMP_NOT_ABSOLUTE');
  const absolute = path.resolve(requested);
  const ancestors = [];
  for (let current = absolute; ; current = path.dirname(current)) {
    const stat = fs.lstatSync(current);
    const kind = stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : 'other';
    ancestors.unshift({ path: current, kind, ...(kind === 'symlink' ? { target: fs.readlinkSync(current) } : {}) });
    if (path.dirname(current) === current) break;
  }
  const canonical = fs.realpathSync.native(absolute);
  if (!fs.lstatSync(canonical).isDirectory()) throw new Error('QUALIFICATION_TEMP_NOT_DIRECTORY');
  return { requested: absolute, canonical, ancestors, environment: { TMPDIR: canonical, TEMP: canonical, TMP: canonical } };
}
