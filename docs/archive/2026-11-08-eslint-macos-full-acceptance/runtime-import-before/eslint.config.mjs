import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import tsParser from '@typescript-eslint/parser';
import { LINT_PACKAGE_PROFILES } from './scripts/lib/lint-workspace-policy.mjs';
import globals from 'globals';
import { runtimeReferenceRule } from './scripts/lib/eslint-runtime-reference-rule.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({
  baseDirectory: root,
  resolvePluginsRelativeTo: root,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});
const configs = [{ ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] }];
configs.push({ files: LINT_PACKAGE_PROFILES.flatMap(profile => profile.directories.map(dir => `packages/${profile.name}/${dir}/**/*.ts`)), languageOptions: { globals: { ...globals.node, ...globals.es2022, Bun: 'readonly' } }, plugins: { specforge: { rules: { 'no-unbound-runtime-reference': runtimeReferenceRule } } }, rules: { 'specforge/no-unbound-runtime-reference': 'error' } });
for (const profile of LINT_PACKAGE_PROFILES) {
  const packageRoot = path.join(root, 'packages', profile.name);
  const files = profile.directories.map(dir => `packages/${profile.name}/${dir}/**/*.ts`);
  let converted;
  if (profile.profile === 'eslint.config.js') {
    // Existing permission profile remains its sole rule source; tools are pinned together.
    converted = (await import('./packages/permission-engine/eslint.config.js')).default;
  } else {
    const legacy = profile.profile
      ? JSON.parse(fs.readFileSync(path.join(packageRoot, profile.profile), 'utf8'))
      : {
          parser: '@typescript-eslint/parser',
          plugins: ['@typescript-eslint'],
          extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
          env: { node: true, es2022: true },
          rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
          },
        };
    // Global ignores are owned here; scoped file enumeration retains the old declaration exceptions.
    const { root: _legacyRoot, ignorePatterns: _legacyIgnores, ...settings } = legacy;
    if (profile.typed) settings.parserOptions = {
      ...settings.parserOptions,
      project: [path.join(packageRoot, 'tsconfig.eslint.json'), path.join(packageRoot, 'tsconfig.eslint-declarations.json')],
      tsconfigRootDir: packageRoot,
    };
    converted = compat.config(settings);
  }
  for (const config of converted) {
    if (config.ignores) throw new Error(`UNEXPECTED_LEGACY_LINT_IGNORE: ${profile.name}`);
    configs.push({ ...config, files });
  }
  configs.push({
    files,
    languageOptions: {
      parser: tsParser,
      parserOptions: profile.typed ? {
        project: [path.join(packageRoot, 'tsconfig.eslint.json'), path.join(packageRoot, 'tsconfig.eslint-declarations.json')],
        tsconfigRootDir: packageRoot,
      } : {},
    },
    // TypeScript replaces these JS-only checks with its symbol/type checks and TS unused rule.
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off' },
    ...(profile.typed ? { settings: {
      'import/resolver': { typescript: { project: path.join(packageRoot, 'tsconfig.eslint.json') } },
    }} : {}),
  });
}
export default configs;
