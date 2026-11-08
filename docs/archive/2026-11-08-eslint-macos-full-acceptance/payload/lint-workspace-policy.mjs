import { CURRENT_WORKSPACE_PACKAGES } from './workspace-packages.ts';

// Preserve the existing declared lint scopes. Missing current package owners gain src coverage.
const legacyProfiles = {
  configuration: '.eslintrc.json',
  observability: '.eslintrc.json',
  'permission-engine': 'eslint.config.js',
  'opencode-adapter': '.eslintrc.json',
  'scope-gate': '.eslintrc.json',
  'workflow-runtime': '.eslintrc.json',
  'daemon-core': '.eslintrc.json',
};
const testOwners = new Set(['observability', 'permission-engine', 'scope-gate', 'workflow-runtime']);
const typedOwners = new Set([
  'observability', 'permission-engine', 'scope-gate', 'workflow-runtime',
  'opencode-adapter', 'daemon-core',
]);

export const LINT_PACKAGE_PROFILES = Object.freeze(CURRENT_WORKSPACE_PACKAGES.map(name => Object.freeze({
  name,
  profile: legacyProfiles[name] ?? null,
  directories: Object.freeze(testOwners.has(name) ? ['src', 'tests'] : ['src']),
  typed: typedOwners.has(name),
  excludeDeclarations: name === 'daemon-core' || name === 'opencode-adapter',
})));

export function lintPackageProfile(name) {
  const profile = LINT_PACKAGE_PROFILES.find(item => item.name === name);
  if (!profile) throw new Error(`LINT_PACKAGE_NOT_CURRENT: ${name}`);
  return profile;
}
