const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const out=__dirname,before=JSON.parse(fs.readFileSync(path.join(out,'after-observation-window-business-files.json')));
const selected=before.entries.filter(e=>e.path.includes('/candidates/')||e.path.includes('/handoffs/'));
const checks=selected.map(e=>{const f=path.join(before.project,e.path),actual=fs.existsSync(f)?crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'):null;return {path:e.path,before:e.sha256,after:actual,unchanged:actual===e.sha256};});
const record={utc:new Date().toISOString(),scope:'Existing successful candidates and handoffs across observer restart, before any legitimate later candidate revision',checks};
fs.writeFileSync(path.join(out,'recovery-preservation.json'),JSON.stringify(record,null,2),{flag:'wx'});
console.log(JSON.stringify({checked:checks.length,unchanged:checks.filter(c=>c.unchanged).length}));if(checks.some(c=>!c.unchanged))process.exitCode=1;
