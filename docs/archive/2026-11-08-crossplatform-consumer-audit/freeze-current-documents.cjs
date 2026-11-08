const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=__dirname,scope=JSON.parse(fs.readFileSync(path.join(root,'document-review-scope.json'))),members=[];
for(const doc of scope.documents.filter(d=>/^(CURRENT_|ADR_REVIEW|SETUP_REFERENCE_REVIEW|PACKAGE_HISTORY_REVIEW)/.test(d.classification))){
 const bytes=fs.readFileSync(doc.path),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const target=path.join(root,'original-documents',doc.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});assert.equal(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),sha256);members.push({path:doc.path,classification:doc.classification,sha256,bytes:bytes.length});
}
fs.writeFileSync(path.join(root,'original-documents.json'),JSON.stringify({utc:new Date().toISOString(),members,meaning:'Raw pre-document-repair bytes; not current authority. Earlier source fixes are separately preserved in their receipts.'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({frozen:members.length}));
