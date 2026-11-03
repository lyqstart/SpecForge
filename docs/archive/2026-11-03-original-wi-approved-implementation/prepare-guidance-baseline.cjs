const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const root = path.resolve('.tmp', 'sf-detached-guidance-baseline-' + crypto.randomUUID()); fs.mkdirSync(root, { recursive: true });
const archive = path.join(root, 'baseline.tar'), receipts = [];
function run(exe, args, cwd = process.cwd()) {
  const started = new Date().toISOString(), r = cp.spawnSync(exe, args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  receipts.push({ exe, args, cwd, started_utc: started, finished_utc: new Date().toISOString(), inner_exit_code: Number.isInteger(r.status) ? r.status : 1, stdout: r.stdout, stderr: r.stderr });
  if (r.status !== 0) throw Error('BASELINE_PREPARATION_FAILED:' + r.stderr); return r.stdout;
}
run('git', ['archive', '--format=tar', '--output=' + archive, 'b09edc268494b81aa437812cc86f98be747c306d', '--',
  'package.json', 'packages/daemon-core/package.json', 'packages/daemon-core/vitest.config.ts', 'packages/daemon-core/tests/v11-agent-skill-contract-alignment.test.ts',
  'packages/daemon-core/src/tools', 'packages/types/src', 'setup/userlevel-opencode']);
run('tar', ['-xf', archive, '-C', root]);
const result = { utc: new Date().toISOString(), baseline: 'b09edc268494b81aa437812cc86f98be747c306d', root,
  cwd: path.join(root, 'packages/daemon-core'), test: 'tests/v11-agent-skill-contract-alignment.test.ts',
  config: path.join(root, 'packages/daemon-core/vitest.config.ts'), purpose: 'Same static contract test and exact baseline files; no product imports or build required; same installed runner/environment', receipts };
fs.writeFileSync(path.join(__dirname, 'guidance-baseline-location.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result));
