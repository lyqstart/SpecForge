import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { lintPackageProfile } from './lib/lint-workspace-policy.mjs';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function packageLintFiles(name) {
  const profile = lintPackageProfile(name);
  const files = [];
  for (const dir of profile.directories) {
    const start = path.join(repositoryRoot, 'packages', name, dir);
    if (!fs.existsSync(start)) throw new Error(`LINT_REQUIRED_DIRECTORY_MISSING: ${name}/${dir}`);
    function walk(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`LINT_INPUT_LINK_REFUSED: ${full}`);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && entry.name.endsWith('.ts') &&
          !(profile.excludeDeclarations && entry.name.endsWith('.d.ts'))) files.push(full);
      }
    }
    walk(start);
  }
  if (!files.length) throw new Error(`LINT_EMPTY_CURRENT_PACKAGE: ${name}`);
  return files.sort();
}

export async function lintPackage(name, options = {}) {
  const files = packageLintFiles(name);
  const eslint = new ESLint({ cwd: repositoryRoot, overrideConfigFile: path.join(repositoryRoot, 'eslint.config.mjs'), fix: options.fix === true });
  const results = await eslint.lintFiles(files);
  if (options.fix) await ESLint.outputFixes(results);
  const reported = new Set(results.map(result => result.filePath));
  if (reported.size !== files.length || files.some(file => !reported.has(file))) {
    throw new Error(`LINT_FILE_COVERAGE_MISMATCH: ${name}`);
  }
  const errors = results.reduce((n, r) => n + r.errorCount, 0);
  const warnings = results.reduce((n, r) => n + r.warningCount, 0);
  return { name, files: files.length, errors, warnings, results };
}

async function main() {
  const [name, ...args] = process.argv.slice(2);
  if (args.some(arg => arg !== '--fix' && arg !== '--json')) throw new Error('LINT_UNKNOWN_ARGUMENT');
  const report = await lintPackage(name, { fix: args.includes('--fix') });
  if (args.includes('--json')) console.log(JSON.stringify(report));
  else {
    const eslint = new ESLint({ cwd: repositoryRoot, overrideConfigFile: path.join(repositoryRoot, 'eslint.config.mjs') });
    const formatter = await eslint.loadFormatter('stylish');
    const output = formatter.format(report.results);
    if (output) console.log(output);
    console.log(`[lint-package] ${name}: files=${report.files} errors=${report.errors} warnings=${report.warnings}`);
  }
  process.exitCode = report.errors || report.warnings ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
