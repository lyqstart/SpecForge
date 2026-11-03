const fs = require('node:fs'), path = require('node:path');
const prior = path.join(__dirname, '../2026-11-03-original-wi-archive-restore');
for (const name of ['check-publishable-evidence.cjs', 'seal-final-evidence.cjs', 'verify-final-publication.cjs']) {
  let text = fs.readFileSync(path.join(prior, name), 'utf8');
  text = text.replace("path.join(__dirname, 'commands/0048.stdout.txt')", "path.join(__dirname, '../2026-11-03-original-wi-archive-restore/commands/0048.stdout.txt')");
  text = text.replaceAll('CODEX-SF-20261103-ORIGINAL-WI-ARCHIVE-RESTORE-A01', 'CODEX-SF-20261103-ORIGINAL-WI-APPROVED-IMPLEMENTATION-A01');
  fs.writeFileSync(path.join(__dirname, name), text, { flag: 'wx' });
}
let driver = fs.readFileSync(path.join(__dirname, 'resume-approval.cjs'), 'utf8');
driver = driver.replace("'native-resume-approval'", "'native-resume-implementation'");
driver = driver.replace(/const prompt = [\s\S]*?;\nsave\('request'/, "const prompt = fs.readFileSync(path.join(__dirname, 'implementation-prompt.txt'), 'utf8');\nsave('request'");
driver = driver.replace('OpenCode storage/logs plus actual approved decision and owned Spec Merge/post-merge artifacts; read-only Git preflight/plan; no branch create, Code Permission or implementation until required branch decision', 'OpenCode storage/logs; formal approved detached Git bootstrap, Code Permission and five allowed implementation files; no D18 command execution or false verification/Close');
fs.writeFileSync(path.join(__dirname, 'resume-implementation.cjs'), driver, { flag: 'wx' });
let inspector = fs.readFileSync(path.join(__dirname, 'inspect-native.cjs'), 'utf8').replace("'native-resume-approval'", "'native-resume-implementation'");
fs.writeFileSync(path.join(__dirname, 'inspect-implementation.cjs'), inspector, { flag: 'wx' });
console.log(JSON.stringify({ utc: new Date().toISOString(), prepared: true, inner_exit_code: 0 }));
