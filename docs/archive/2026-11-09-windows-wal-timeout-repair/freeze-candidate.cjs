const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const dir = __dirname;
const root = path.resolve(dir, '../../..');
const repo = path.join(root, '.wal-patched-a01');
const base = '48fc9057014413bd712c33f710b794f8bf6f273a';
const branch = 'codex/windows-wal-candidate';
const files = JSON.parse(fs.readFileSync(path.join(dir, 'implementation-scope.json'))).files;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const out = path.join(dir, 'candidate-freeze');
fs.mkdirSync(out);
const commands = [];
function git(args) {
  const r = cp.spawnSync('git', ['-c', 'core.longpaths=true', ...args], { cwd: repo, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  commands.push({ utc: new Date().toISOString(), cwd: repo, executable: 'git', args, exit: r.status, stdout_base64: r.stdout.toString('base64'), stderr_base64: r.stderr.toString('base64') });
  fs.writeFileSync(path.join(out, 'commands.json'), JSON.stringify(commands, null, 2) + '\n');
  assert.equal(r.status, 0, r.stderr.toString());
  return r.stdout;
}
assert.equal(git(['rev-parse', 'HEAD']).toString().trim(), base);
assert.equal(git(['branch', '--show-current']).toString().trim(), branch);
const originalStatus = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
assert.deepEqual(originalStatus.toString().split('\0').filter(Boolean).map(s => s.slice(3)).sort(), [...files].sort());
fs.writeFileSync(path.join(out, 'status-before.nul'), originalStatus, { flag: 'wx' });
for (const file of files) {
  const target = path.join(repo, file);
  fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n'));
}
const ts = require(path.join(repo, 'node_modules/typescript'));
function runtimeAst(file) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, removeComments: true } }).outputText;
  const source = ts.createSourceFile('runtime.js', js, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function canonical(n) {
    const children = [];
    ts.forEachChild(n, c => { children.push(canonical(c)); });
    return { kind: n.kind, text: ts.isIdentifier(n) ? n.text : ts.isLiteralExpression(n) ? n.text : undefined, children };
  }
  const imports = source.statements.filter(ts.isImportDeclaration).map(canonical).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { imports, body: source.statements.filter(n => !ts.isImportDeclaration(n)).map(canonical) };
}
const test = files[1];
assert.deepEqual(runtimeAst(path.join(dir, 'ci-runner-temporary-root.test.ts')), runtimeAst(path.join(repo, test)), 'RED_GREEN_RUNTIME_ASSERTION_AST_DRIFT');
fs.writeFileSync(path.join(out, 'red-green-runtime-equivalence.json'), JSON.stringify({ utc: new Date().toISOString(), method: 'TypeScript transpile erases types; parse AST with identifier/literal text; compare complete executable body and sorted runtime imports', equal: true, red_source_sha256: sha(fs.readFileSync(path.join(dir, 'ci-runner-temporary-root.test.ts'))), final_source_sha256: sha(fs.readFileSync(path.join(repo, test))) }, null, 2) + '\n', { flag: 'wx' });
const plan = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json')));
const unchanged = plan.source_files.filter(m => m.file !== files[0]).map(m => {
  assert.equal(sha(fs.readFileSync(path.join(repo, m.file))), m.sha256, m.file);
  return { file: m.file, sha256: m.sha256, unchanged: true };
});
const state = 'packages/daemon-core/src/state/StateManager.ts';
assert.deepEqual(fs.readFileSync(path.join(repo, state)), git(['show', base + ':' + state]));
const check = cp.spawnSync(process.execPath, ['--check', path.join(repo, files[2])], { windowsHide: true });
assert.equal(check.status, 0, check.stderr.toString());
git(['diff', '--check']);
git(['add', '--', ...files]);
assert.deepEqual(git(['diff', '--cached', '--name-only', '-z']).toString().split('\0').filter(Boolean).sort(), [...files].sort());
const members = files.map(file => {
  const raw = fs.readFileSync(path.join(repo, file));
  assert.deepEqual(raw, git(['show', ':' + file]), 'INDEX_RAW_BYTES_DRIFT:' + file);
  const destination = path.join(out, 'source', file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, raw, { flag: 'wx' });
  return { file, sha256: sha(raw), bytes: raw.length };
});
fs.writeFileSync(path.join(out, 'candidate.diff'), git(['diff', '--cached', '--binary']), { flag: 'wx' });
git(['commit', '-m', 'fix(ci): qualify runner temporary storage before full regression']);
const commit = git(['rev-parse', 'HEAD']).toString().trim();
assert.equal(git(['status', '--porcelain=v1', '-z', '--untracked-files=all']).length, 0);
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ utc: new Date().toISOString(), base, commit, branch, members, unchanged, state_manager_unchanged: true, original_test_budgets_sampling_fsync_unchanged: true, root_worktree_not_adopted_yet: true }, null, 2) + '\n', { flag: 'wx' });
git(['push', 'origin', 'refs/heads/' + branch + ':refs/heads/' + branch]);
assert.equal(git(['ls-remote', '--exit-code', 'origin', 'refs/heads/' + branch]).toString().split(/\s/)[0], commit);
fs.writeFileSync(path.join(out, 'published.json'), JSON.stringify({ utc: new Date().toISOString(), commit, pushed: true }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ commit, branch, files: members.length, pushed: true }));
