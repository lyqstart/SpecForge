const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const git = args => cp.execFileSync('git', args, { windowsHide: true, maxBuffer: 32 * 1024 * 1024, stdio: ['pipe','pipe','pipe'] });
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const base = git(['rev-parse','HEAD']).toString().trim();
const names = [...new Set(Buffer.concat([git(['diff','--name-only','-z']),git(['ls-files','--others','--exclude-standard','-z'])]).toString().split('\0').filter(file => file && !file.startsWith('docs/archive/')))];
const entries = names.sort().map(file => { const current = fs.readFileSync(file); let prior = null; try { prior = git(['show',`${base}:${file}`]); } catch {} return { file, current_sha256: sha(current), current_base64: current.toString('base64'), baseline_sha256: prior && sha(prior), baseline_base64: prior && prior.toString('base64') }; });
const result = { utc: new Date().toISOString(), base, entries, inner_exit_code: 0 };
fs.writeFileSync(path.join(__dirname,'source-before-milestone.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({ files: entries.length, base, inner_exit_code: 0 }));
