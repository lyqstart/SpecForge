const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function createEditPlan(requestedRoot){
  const root=fs.realpathSync.native(path.resolve(requestedRoot)),plans=[],members=new Map();
  function resolve(file){
    file=file.replaceAll('\\','/');
    assert(!path.isAbsolute(file)&&!file.split('/').some(part=>['..','.git','.specforge','.agents','.codex','node_modules'].includes(part)),'EDIT_PATH_FORBIDDEN');
    const target=fs.realpathSync.native(path.resolve(root,file)),relative=path.relative(root,target);
    assert(relative&&!path.isAbsolute(relative)&&!relative.split(path.sep).includes('..'),'EDIT_OUTSIDE_SOURCE_ROOT');
    assert(fs.lstatSync(target).isFile(),'EDIT_SOURCE_NOT_FILE');
    return {file:relative.replaceAll('\\','/'),target,key:process.platform==='win32'?target.toLowerCase():target};
  }
  function edit(file,operation){
    const resolved=resolve(file),old=members.get(resolved.key),before=old?.before??fs.readFileSync(resolved.target),input=old?.after??before;
    const result=operation(input.toString('utf8').replace(/\r*\n/g,'\n'));assert.equal(typeof result,'string','EDIT_AFTER_MUST_BE_TEXT');const after=Buffer.from(result);
    if(input.equals(after))return;
    if(old)old.after=after;
    else {const member={file:resolved.file,before,after};members.set(resolved.key,member);plans.push(member);}
  }
  function validateCurrent(){
    assert.equal(plans.length,members.size,'EDIT_DUPLICATE_TARGET');
    for(const member of plans){const resolved=resolve(member.file);assert.equal(members.get(resolved.key),member,'EDIT_TARGET_IDENTITY_CHANGED');assert.equal(sha(fs.readFileSync(resolved.target)),sha(member.before),'EDIT_SOURCE_DRIFT');}
  }
  return {edit,plans,validateCurrent,helper_sha256:sha(fs.readFileSync(__filename))};
}
module.exports={createEditPlan};
