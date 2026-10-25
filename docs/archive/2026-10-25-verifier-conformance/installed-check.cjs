const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const mode=process.argv[2];assert.ok(['before','after'].includes(mode));
const root='C:/Users/lyq/.config/opencode';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'specforge-manifest.json')));
const release=JSON.parse(fs.readFileSync('release/release-manifest.json'));
const entries=release.installFiles.map(e=>{const target=path.join(root,e.targetPath),bytes=fs.readFileSync(target),sha256=hash(bytes),s=fs.statSync(target);return {...e,installed_sha256:sha256,manifest_sha256:manifest.files[e.targetPath]?.sha256,source_sha256:hash(fs.readFileSync(e.sourcePath)),mtimeMs:s.mtimeMs,manifest_matches:sha256===manifest.files[e.targetPath]?.sha256,source_matches:sha256===e.sha256}});
const result={utc:new Date().toISOString(),root,mode,release_candidate:release.candidateId,version:manifest.shared_version,entries,changes:entries.filter(e=>!e.source_matches).map(e=>e.targetPath)};
if(mode==='after'){const before=JSON.parse(fs.readFileSync(path.join(__dirname,'installed-before.json')));result.binary_unchanged=entries.filter(e=>e.type==='runtime').every(e=>before.entries.some(b=>b.targetPath===e.targetPath&&b.installed_sha256===e.installed_sha256&&b.mtimeMs===e.mtimeMs));}
fs.writeFileSync(path.join(__dirname,`installed-${process.argv[3]||mode}.json`),JSON.stringify(result,null,2),{flag:'wx'});
assert.ok(entries.every(e=>e.manifest_matches&&e.source_sha256===e.sha256));
if(mode==='before')assert.deepEqual(result.changes.sort(),['agents/_AGENT_BASE.md','agents/sf-orchestrator.md','agents/sf-verifier.md','skills/sf-workflow-feature-spec/SKILL.md','skills/superpowers-verification-before-completion/SKILL.md'].sort());
else {assert.equal(result.changes.length,0);assert.ok(result.binary_unchanged);}
console.log(JSON.stringify({mode,count:entries.length,changes:result.changes,binary_unchanged:result.binary_unchanged}));
