import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(repositoryRoot, 'tests', 'root-test-role-registry.json');

export const ROOT_TEST_ROLES = Object.freeze([
  'CURRENT_HERMETIC',
  'CURRENT_ENVIRONMENTAL',
  'MIGRATED_DUPLICATE',
  'HISTORICAL_EVIDENCE',
]);

function normalizePath(value) {
  return value.replaceAll('\\', '/');
}

export function loadRootTestRoleRegistry() {
  return JSON.parse(readFileSync(registryPath, 'utf8'));
}

export function listTrackedRootTests() {
  const result = spawnSync(
    'git',
    ['ls-files', 'tests/**/*.test.ts', 'tests/**/*.property.test.ts'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(`ROOT_TEST_GIT_LIST_FAILED: exit=${result.status}`);
  }
  return result.stdout
    .split(/\r?\n/u)
    .map((value) => normalizePath(value.trim()))
    .filter(Boolean)
    .sort();
}

export function flattenRootTestRoleRegistry(registry) {
  const roles = registry?.roles ?? {};
  return {
    CURRENT_HERMETIC: [...(roles.CURRENT_HERMETIC?.paths ?? [])],
    CURRENT_ENVIRONMENTAL: (roles.CURRENT_ENVIRONMENTAL?.entries ?? []).map((entry) => entry.path),
    MIGRATED_DUPLICATE: (roles.MIGRATED_DUPLICATE?.entries ?? []).map((entry) => entry.path),
    HISTORICAL_EVIDENCE: [...(roles.HISTORICAL_EVIDENCE?.paths ?? [])],
  };
}

export function validateRootTestRoleRegistry(registry, trackedPaths = listTrackedRootTests()) {
  if (registry?.schemaVersion !== 1) {
    throw new Error(`ROOT_TEST_REGISTRY_SCHEMA_UNSUPPORTED: ${registry?.schemaVersion ?? '<missing>'}`);
  }

  const byRole = flattenRootTestRoleRegistry(registry);
  const assigned = [];
  for (const role of ROOT_TEST_ROLES) {
    if (!registry.roles?.[role]) {
      throw new Error(`ROOT_TEST_REGISTRY_ROLE_MISSING: ${role}`);
    }
    for (const testPath of byRole[role]) {
      assigned.push({ path: normalizePath(testPath), role });
    }
  }

  const counts = new Map();
  for (const assignment of assigned) {
    counts.set(assignment.path, (counts.get(assignment.path) ?? 0) + 1);
  }
  const duplicates = [...counts.entries()].filter(([, count]) => count !== 1).map(([value]) => value);
  const tracked = new Set(trackedPaths.map(normalizePath));
  const missing = [...tracked].filter((value) => !counts.has(value));
  const unknown = [...counts.keys()].filter((value) => !tracked.has(value));
  const incompleteReplacements = (registry.roles.MIGRATED_DUPLICATE?.entries ?? [])
    .filter((entry) => !Array.isArray(entry.replacement) || entry.replacement.length === 0 || !entry.rationale)
    .map((entry) => entry.path);
  const incompleteEnvironmentRequirements = (registry.roles.CURRENT_ENVIRONMENTAL?.entries ?? [])
    .filter((entry) => !entry.platform || !entry.requirements)
    .map((entry) => entry.path);

  if (
    duplicates.length ||
    missing.length ||
    unknown.length ||
    incompleteReplacements.length ||
    incompleteEnvironmentRequirements.length
  ) {
    throw new Error(
      `ROOT_TEST_REGISTRY_INVALID: ${JSON.stringify({ duplicates, missing, unknown, incompleteReplacements, incompleteEnvironmentRequirements })}`,
    );
  }

  return Object.fromEntries(ROOT_TEST_ROLES.map((role) => [role, byRole[role].length]));
}

export function selectRootTests(registry, mode, platform = process.platform) {
  const byRole = flattenRootTestRoleRegistry(registry);
  if (mode === 'current') return byRole.CURRENT_HERMETIC;
  if (mode === 'environmental') {
    return registry.roles.CURRENT_ENVIRONMENTAL.entries
      .filter((entry) => entry.platform === platform)
      .map((entry) => entry.path);
  }
  throw new Error(`ROOT_TEST_MODE_UNKNOWN: ${mode}`);
}

function runVitest(testPaths, passthroughArguments) {
  const vitestEntry = path.join(repositoryRoot, 'node_modules', 'vitest', 'vitest.mjs');
  if (!existsSync(vitestEntry)) {
    throw new Error(`ROOT_VITEST_NOT_INSTALLED: ${vitestEntry}`);
  }
  const result = spawnSync(process.execPath, [vitestEntry, 'run', ...testPaths, ...passthroughArguments], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

function main() {
  const [mode = 'validate', ...passthroughArguments] = process.argv.slice(2);
  const registry = loadRootTestRoleRegistry();
  const counts = validateRootTestRoleRegistry(registry);
  console.log(`[root-test-registry] ${JSON.stringify(counts)}`);
  if (mode === 'validate') return;
  const selected = selectRootTests(registry, mode);
  console.log(`[root-test-registry] mode=${mode} selected=${selected.length}`);
  if (selected.length === 0) {
    throw new Error(`ROOT_TEST_MODE_UNAVAILABLE_ON_PLATFORM: mode=${mode} platform=${process.platform}`);
  }
  runVitest(selected, passthroughArguments);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
