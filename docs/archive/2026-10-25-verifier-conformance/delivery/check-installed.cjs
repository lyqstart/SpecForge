const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const out=__dirname,root='C:/Users/lyq/.config/opencode',hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const release=JSON.parse(fs.readFileSync('release/release-manifest.json')),manifest=JSON.parse(fs.readFileSync(path.join(root,'specforge-manifest.json'))),before=JSON.parse(fs.readFileSync(path.join(out,'../installed-before.json')));
const entries=release.installFiles.map(e=>({...e,source_sha256:hash(e.sourcePath),installed_sha256:hash(path.join(root,e.targetPath)),manifest_sha256:manifest.files[e.targetPath]?.sha256,mtimeMs:fs.statSync(path.join(root,e.targetPath)).mtimeMs}));
const drift=entries.filter(e=>[e.source_sha256,e.installed_sha256,e.manifest_sha256].some(h=>h!==e.sha256));
const binary_unchanged=entries.filter(e=>e.type==='runtime').every(e=>before.entries.some(b=>b.targetPath===e.targetPath&&b.installed_sha256===e.installed_sha256&&b.mtimeMs===e.mtimeMs));
fs.writeFileSync(path.join(out,process.argv[2]||'installed-identity.json'),JSON.stringify({utc:new Date().toISOString(),candidate:release.candidateId,entries,drift,binary_unchanged},null,2),{flag:'wx'});
console.log(JSON.stringify({count:entries.length,drift:drift.map(e=>e.targetPath),binary_unchanged}));if(drift.length||!binary_unchanged)process.exitCode=1;
