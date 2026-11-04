const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const draft=fs.readFileSync(path.join(__dirname,'registry-read-authority-delta.patch'),'utf8');
const d21=draft.split('\n').find(l=>l.startsWith('+| D21 |')).slice(1);
const specInsert=draft.slice(draft.indexOf('+### 9.2.2')).split('\n');const stop=specInsert.findIndex(l=>l=='+## 9.3 HardStop');if(stop<0)throw Error('DRAFT');
const addition=specInsert.slice(0,stop).map(l=>{if(!l.startsWith('+'))throw Error('DRAFT_PREFIX');return l.slice(1);});
let patch='';const identities=[];
for(const file of ['docs/product-specification/authority-registry.md','docs/product-specification/specforge-product-specification.md']){
 const raw=fs.readFileSync(file),text=raw.toString('utf8'),eol=text.includes('\r\n')?'\r\n':'\n',old=text.replaceAll('\r\n','\n').split('\n');if(old.at(-1)==='')old.pop();
 let edits;
 if(file.endsWith('authority-registry.md')){const version=old.indexOf('> Registry version: 1.11'),row=old.findIndex(l=>l.startsWith('| D20 |'));if(version<0||row<0)throw Error('BASELINE');edits=[{at:version,remove:1,insert:['> Registry version: 1.12']},{at:row+1,remove:0,insert:[d21]}];}
 else {const at=old.indexOf('## 9.3 HardStop');if(at<0)throw Error('BASELINE');edits=[{at,remove:0,insert:addition}];}
 let current=old.slice(),shift=0;patch+='--- a/'+file+'\n+++ b/'+file+'\n';
 for(const edit of edits){const start=Math.max(0,edit.at-3),end=Math.min(old.length,edit.at+edit.remove+3),delta=edit.insert.length-edit.remove;patch+='@@ -'+(start+1)+','+(end-start)+' +'+(start+shift+1)+','+(end-start+delta)+' @@\n';
  patch+=old.slice(start,edit.at).map(l=>' '+l+'\n').join('');patch+=old.slice(edit.at,edit.at+edit.remove).map(l=>'-'+l+'\n').join('');patch+=edit.insert.map(l=>'+'+l+'\n').join('');patch+=old.slice(edit.at+edit.remove,end).map(l=>' '+l+'\n').join('');current.splice(edit.at+shift,edit.remove,...edit.insert);shift+=delta;
 }
 const bytes=Buffer.from(current.join(eol)+eol),target=path.join(__dirname,'proposed-authority',path.basename(file));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});identities.push({file,baseline_sha256:sha(raw),proposed_sha256:sha(bytes),eol_domain:eol==='\r\n'?'CRLF':'LF'});
}
fs.writeFileSync(path.join(__dirname,'registry-read-authority-delta.patch'),patch);
fs.writeFileSync(path.join(__dirname,'proposed-authority','identity.json'),JSON.stringify({utc:new Date().toISOString(),status:'NOT_APPLIED_NOT_APPROVED',files:identities,patch_sha256:sha(Buffer.from(patch))},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({proposal:'exact hypothetical authority bytes only; actual authority unchanged',patch_sha256:sha(Buffer.from(patch)),files:identities,inner_exit_code:0}));
