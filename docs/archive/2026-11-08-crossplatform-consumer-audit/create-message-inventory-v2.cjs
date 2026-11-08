const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const src=path.join(__dirname,'inventory-message-surfaces.cjs');let text=fs.readFileSync(src,'utf8');
text=text.replace("'message-surfaces-inventory.json'","'message-surfaces-inventory-v2.json'");
const needle='ts.forEachChild(node,visit);};visit(source);';assert.equal(text.split(needle).length,2);
text=text.replace(needle,"if((ts.isStringLiteralLike(node)||ts.isTemplateExpression(node))&&interesting.test(node.getText(source))&&!ts.isImportDeclaration(node.parent)&&!ts.isExportDeclaration(node.parent))add(node,'LITERAL_REVIEW_CANDIDATE');"+needle);
text=text.replace("disposition:'PENDING_SEMANTIC_OWNER_REVIEW'","disposition:'SYNTACTIC_CANDIDATE_REQUIRES_OWNER_REVIEW'");
fs.writeFileSync(path.join(__dirname,'inventory-message-surfaces-v2.cjs'),text,{flag:'wx'});console.log(JSON.stringify({extraction:'Original selected message nodes plus matching string/template expressions, including array suggestions; no semantic pass assigned.'}));
