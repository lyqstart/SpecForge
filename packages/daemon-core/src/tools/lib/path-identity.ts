import * as path from 'node:path';

/**
 * Return the identity used when two resolved paths are compared on the target
 * platform. Windows path lookup is case-insensitive for the supported runtime,
 * while POSIX targets must retain case as part of the file identity.
 *
 * The optional platform argument is a deterministic test seam. Production
 * callers must rely on the default current target platform.
 */
export function resolvedPathIdentity(
  value: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const resolved = path.resolve(value);
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** Preserve the first resolved spelling while removing target-platform aliases. */
export function deduplicateResolvedPaths(
  values: Iterable<string>,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const resolved = path.resolve(value);
    const identity = resolvedPathIdentity(resolved, platform);
    if (seen.has(identity)) continue;
    seen.add(identity);
    unique.push(resolved);
  }
  return unique;
}

export function sameResolvedPath(
  left: string,
  right: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return resolvedPathIdentity(left, platform) === resolvedPathIdentity(right, platform);
}

export function isSameOrDescendantResolvedPath(
  child: string,
  parent: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const childIdentity = resolvedPathIdentity(child, platform);
  const parentIdentity = resolvedPathIdentity(parent, platform);
  return (
    childIdentity === parentIdentity ||
    childIdentity.startsWith(parentIdentity.endsWith(path.sep) ? parentIdentity : parentIdentity + path.sep)
  );
}
