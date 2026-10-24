const fs=require('fs'),assert=require('assert/strict'),ts=require('typescript'),path=require('path'),crypto=require('crypto');
const root='D:/code/SpecForge',source='packages/daemon-core/src/tools/lib/sf_safe_bash_executor.ts',template='setup/userlevel-opencode/tools/lib/sf_safe_bash_executor.ts';
const bytes=fs.readFileSync(source);assert.deepEqual(bytes,fs.readFileSync(template));
const parsed=ts.createSourceFile(source,bytes.toString(),ts.ScriptTarget.Latest,true),imports=parsed.statements.filter(ts.isImportDeclaration).filter(n=>!n.importClause?.isTypeOnly).map(n=>n.moduleSpecifier.text);
assert.deepEqual(imports,['node:fs','node:path','node:crypto']);
const calls=[];function visit(n){if(ts.isCallExpression(n))calls.push(n.expression.getText(parsed));ts.forEachChild(n,visit);}visit(parsed);
assert.ok(!calls.some(c=>/spawn|execFile|execSync|child_process|eval|Function/.test(c)));
for(const f of ['packages/daemon-core/src/tools/lib/sf_safe_bash_core.ts','setup/userlevel-opencode/tools/lib/sf_safe_bash_core.ts']){const s=fs.readFileSync(f,'utf8');assert.ok(s.includes('await executeCommand({'));assert.ok(!s.includes('await loadHostProfile()'));assert.ok(s.includes('appendShellAudit(baseDir'));}
const verifier=fs.readFileSync('setup/userlevel-opencode/tools/lib/sf_verifier_execution_core.ts','utf8');assert.ok(verifier.includes('await executeReadOnlyCommand('));assert.ok(!verifier.includes('node:child_process'));
const old=JSON.parse(fs.readFileSync(path.join(__dirname,'baseline-result.json')));assert.equal(old.records.filter(r=>r.actual?.startsWith('ISOLATED_')).length,3);
const hashes=[source,template,'packages/daemon-core/src/tools/handlers/sf-safe-bash.ts','packages/daemon-core/src/tools/lib/write-guard-runtime-v12.ts','setup/userlevel-opencode/tools/lib/sf_verifier_execution_core.ts'].map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
fs.writeFileSync(path.join(__dirname,'source-review.json'),JSON.stringify({utc:new Date().toISOString(),status:'PASS',imports,calls,hashes,scope:'Independent AST/source review of external command sinks and deployment byte equality. No external execution in the accepted internal-read path; no claim of OS isolation.'},null,2),{flag:'wx'});console.log(JSON.stringify({status:'PASS',sourceTemplateIdentical:true,externalProcessCalls:0,baselineWritesReconfirmed:3}));
