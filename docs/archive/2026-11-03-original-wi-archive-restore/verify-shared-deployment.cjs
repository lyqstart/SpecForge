const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const installed = 'C:/Users/lyq/.config/opencode/sf-user/bin/';
const oldAudit = JSON.parse(fs.readFileSync(path.join(__dirname, 'original-audit-a02-final.json')));
const newAudit = JSON.parse(fs.readFileSync(path.join(__dirname, 'original-audit-shared-deployed.json')));
const wal = audit => audit.files.find(file => file.path === '.specforge/runtime/events.jsonl').sha256;
const health = cp.spawnSync(installed + 'specforge.exe', ['daemon', 'status', '--json'], { encoding: 'utf8', windowsHide: true });
const result = { utc: new Date().toISOString(), candidate: 'e51ee1eb42d85aea0e2a4290dcad6937f4ade3a1',
  daemon_sha256: hash(installed + 'specforged.exe'), cli_sha256: hash(installed + 'specforge.exe'),
  wal_before: wal(oldAudit), wal_after: wal(newAudit), health_exit_code: health.status, health: JSON.parse(health.stdout),
  observer_effects: 'Daemon startup and formal state loading may append runtime audit logs and rebuild the derived projection; business WAL must remain identical.' };
if (result.daemon_sha256 !== '8acdd0400b826df9267f78561b57ded3a58f9ebb676a05fe6fea1916012ff6b0'
  || result.cli_sha256 !== '791f41665965ea9b1aba24de57b31f62d696c5697021ad68ef37a47610be6b56'
  || result.wal_before !== result.wal_after || health.status !== 0) throw Error('DEPLOYMENT_VERIFICATION_FAILED');
result.inner_exit_code = 0;
fs.writeFileSync(path.join(__dirname, 'shared-deployment-verification.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result));
