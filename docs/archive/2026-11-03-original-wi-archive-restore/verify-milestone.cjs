const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const directory = path.join(__dirname, 'commands'), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let manifests = 0, members = 0;
for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.manifest.sha256')).sort()) {
  for (const line of fs.readFileSync(path.join(directory, file), 'utf8').trimEnd().split('\n')) {
    if (sha(fs.readFileSync(path.join(directory, line.slice(66)))) !== line.slice(0, 64)) throw Error('MANIFEST_DRIFT:' + file);
    members++;
  }
  manifests++;
}
const git = args => cp.execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
const head = git(['rev-parse', 'HEAD']), remote = git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0];
if (head !== remote) throw Error('MILESTONE_REMOTE_DRIFT');
const result = { utc: new Date().toISOString(), head, remote_main: remote, manifests, verified_members: members,
  pending_commands: fs.readdirSync(directory).filter(file => file.endsWith('.command.txt') && !fs.existsSync(path.join(directory, file.replace('.command.txt', '.result.json')))),
  interpretation: 'Completed receipt bytes survived Git main merge; pending native execution is not acceptance coverage.', inner_exit_code: 0 };
fs.writeFileSync(path.join(__dirname, 'milestone-integrity.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(JSON.stringify(result));
