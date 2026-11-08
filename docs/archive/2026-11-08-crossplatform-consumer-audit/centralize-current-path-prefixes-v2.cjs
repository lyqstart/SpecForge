const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),report=JSON.parse(fs.readFileSync(path.join(__dirname,'commands/0082.stdout.txt'))),files=[...new Set(report.findings.map(f=>f.file))];
function transform(file,text,version){
 const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),edits=[],values=[];let hasImport=false;
 const module=file.startsWith('packages/types/src/')?'./'+path.relative(path.dirname(file),'packages/types/src/directory-layout').replace(/\\/g,'/'):'@specforge/types/directory-layout';
 for(const s of ast.statements)if(ts.isImportDeclaration(s)&&s.importClause?.namedBindings&&ts.isNamedImports(s.importClause.namedBindings))hasImport ||= s.importClause.namedBindings.elements.some(e=>e.name.text==='SPEC_DIR_NAME');
 const visit=node=>{
  if(ts.isVariableStatement(node)&&node.declarationList.declarations.length===1){const d=node.declarationList.declarations[0];if(ts.isIdentifier(d.name)&&d.name.text==='SPEC_DIR_NAME'&&d.initializer&&ts.isStringLiteralLike(d.initializer)&&d.initializer.text==='.specforge'){edits.push({start:node.getStart(ast),end:node.end,replacement:'export { SPEC_DIR_NAME };'});return;}}
  if(ts.isStringLiteralLike(node)&&(node.text==='.specforge'||/^\.specforge[/\\]/.test(node.text))){
   const suffix=node.text.slice('.specforge'.length),escaped=suffix.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$/g,'\\$');let replacement;
   if(ts.isLiteralTypeNode(node.parent)){assert.equal(version,2);replacement=suffix?'`${typeof SPEC_DIR_NAME}'+escaped+'`':'typeof SPEC_DIR_NAME';}
   else if(version===1)replacement=suffix?'(SPEC_DIR_NAME + '+JSON.stringify(suffix)+')':'SPEC_DIR_NAME';
   else replacement=suffix?'(`${SPEC_DIR_NAME}'+escaped+'` as const)':'SPEC_DIR_NAME';
   if((ts.isPropertyAssignment(node.parent)||ts.isMethodDeclaration(node.parent))&&node.parent.name===node)replacement='['+replacement+']';
   edits.push({start:node.getStart(ast),end:node.end,replacement});values.push({old_value:node.text,prefix:'.specforge',suffix,reconstructed:'.specforge'+suffix,domain:ts.isLiteralTypeNode(node.parent)?'TYPE':'RUNTIME'});
  }ts.forEachChild(node,visit);
 };visit(ast);assert.ok(edits.length,'NO_EDIT:'+file);let next=text;for(const e of edits.sort((a,b)=>b.start-a.start))next=next.slice(0,e.start)+e.replacement+next.slice(e.end);
 if(!hasImport){const statement='import { SPEC_DIR_NAME } from '+JSON.stringify(module)+';\n';if(next.startsWith('#!')){const line=next.indexOf('\n')+1;next=next.slice(0,line)+statement+next.slice(line);}else next=statement+next;}
 assert.equal(ts.createSourceFile(file,next,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0,'OUTPUT_PARSE_ERROR:'+file);assert.ok(values.every(v=>v.old_value===v.reconstructed));return {next,edits:edits.length,values};
}
// Validate the entire plan before any mutation. Previously completed v1 members
// are accepted only if their bytes exactly match deterministic v1 output.
const plans=files.map(file=>{const snapshot=path.join(__dirname,'path-prefix-before',file),current=fs.readFileSync(file),raw=fs.existsSync(snapshot)?fs.readFileSync(snapshot):current;let permitted=sha(raw)===sha(current);if(!permitted){const earlier=transform(file,raw.toString('utf8'),1);permitted=sha(Buffer.from(earlier.next))===sha(current);}assert.ok(permitted,'CURRENT_SOURCE_DRIFT:'+file);return {file,snapshot,current,raw,...transform(file,raw.toString('utf8'),2)};});
const members=plans.map(p=>({path:p.file,before_sha256:sha(p.raw),observed_sha256:sha(p.current),after_sha256:sha(Buffer.from(p.next)),edits:p.edits,unchanged_values:p.values}));
fs.writeFileSync(path.join(__dirname,'path-prefix-repair-v2-plan.json'),JSON.stringify({utc:new Date().toISOString(),members,qualification:'Type and runtime values preserved; complete plan parsed and checked before writes; build and behavioral regression still required.'},null,2)+'\n',{flag:'wx'});
for(const p of plans){if(!fs.existsSync(p.snapshot)){fs.mkdirSync(path.dirname(p.snapshot),{recursive:true});fs.writeFileSync(p.snapshot,p.raw,{flag:'wx'});}assert.equal(sha(fs.readFileSync(p.file)),sha(p.current));fs.writeFileSync(p.file,p.next);assert.equal(sha(fs.readFileSync(p.file)),sha(Buffer.from(p.next)));}
fs.writeFileSync(path.join(__dirname,'path-prefix-repair-v2-result.json'),JSON.stringify({utc:new Date().toISOString(),files:plans.length,edits:members.reduce((n,m)=>n+m.edits,0),plan_sha256:sha(fs.readFileSync(path.join(__dirname,'path-prefix-repair-v2-plan.json')))},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({files:plans.length}));
