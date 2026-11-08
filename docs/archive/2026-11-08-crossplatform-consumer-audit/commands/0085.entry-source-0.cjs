const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),report=JSON.parse(fs.readFileSync(path.join(__dirname,'commands/0082.stdout.txt'))),files=[...new Set(report.findings.map(f=>f.file))],members=[];
for(const file of files){
 const raw=fs.readFileSync(file),text=raw.toString('utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),edits=[],values=[];
 const module=file.startsWith('packages/types/src/')?'./'+path.relative(path.dirname(file),'packages/types/src/directory-layout').replace(/\\/g,'/'):'@specforge/types/directory-layout';
 let hasImport=false;
 for(const statement of ast.statements)if(ts.isImportDeclaration(statement)&&statement.importClause?.namedBindings&&ts.isNamedImports(statement.importClause.namedBindings))hasImport ||= statement.importClause.namedBindings.elements.some(e=>e.name.text==='SPEC_DIR_NAME');
 const visit=node=>{
  if(ts.isVariableStatement(node)&&node.declarationList.declarations.length===1){const d=node.declarationList.declarations[0];if(ts.isIdentifier(d.name)&&d.name.text==='SPEC_DIR_NAME'&&d.initializer&&ts.isStringLiteralLike(d.initializer)&&d.initializer.text==='.specforge'){edits.push({start:node.getStart(ast),end:node.end,replacement:'export { SPEC_DIR_NAME };'});return;}}
  if(ts.isStringLiteralLike(node)&&(node.text==='.specforge'||/^\.specforge[/\\]/.test(node.text))){
   assert.ok(!ts.isLiteralTypeNode(node.parent),'TYPE_LITERAL_REQUIRES_OWNER_REVIEW:'+file);
   const suffix=node.text.slice('.specforge'.length);let replacement=suffix?'(SPEC_DIR_NAME + '+JSON.stringify(suffix)+')':'SPEC_DIR_NAME';
   if((ts.isPropertyAssignment(node.parent)||ts.isMethodDeclaration(node.parent))&&node.parent.name===node)replacement='['+replacement+']';
   edits.push({start:node.getStart(ast),end:node.end,replacement});values.push({old_value:node.text,prefix:'.specforge',suffix,reconstructed:'.specforge'+suffix});
  }
  ts.forEachChild(node,visit);
 };visit(ast);
 if(!edits.length)throw Error('NO_CURRENT_PREFIX_EDIT:'+file);
 let next=text;for(const e of edits.sort((a,b)=>b.start-a.start))next=next.slice(0,e.start)+e.replacement+next.slice(e.end);
 if(!hasImport){const statement='import { SPEC_DIR_NAME } from '+JSON.stringify(module)+';\n';if(next.startsWith('#!')){const line=next.indexOf('\n')+1;next=next.slice(0,line)+statement+next.slice(line);}else next=statement+next;}
 assert.ok(values.every(v=>v.old_value===v.reconstructed));const snapshot=path.join(__dirname,'path-prefix-before',file);fs.mkdirSync(path.dirname(snapshot),{recursive:true});fs.writeFileSync(snapshot,raw,{flag:'wx'});fs.writeFileSync(file,next);members.push({path:file,before_sha256:sha(raw),after_sha256:sha(Buffer.from(next)),edits:edits.length,unchanged_runtime_string_values:values});
}
fs.writeFileSync(path.join(__dirname,'path-prefix-repair.json'),JSON.stringify({utc:new Date().toISOString(),members,meaning:'Current-source string prefixes derive from canonical SPEC_DIR_NAME; all reconstructed runtime string bytes are unchanged. Build/tests still required.'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({files:members.length,edits:members.reduce((n,m)=>n+m.edits,0)}));
