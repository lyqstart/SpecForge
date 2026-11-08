const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const changes=[],sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function once(s,a,b){assert.equal(s.split(a).length,2,a);return s.replace(a,b);}
function plan(file,fn){const before=fs.readFileSync(file),after=Buffer.from(fn(before.toString('utf8')));changes.push({file,before,after});}
plan('packages/daemon-core/src/tools/handlers/sf-artifact-write.ts',s=>once(s,"function rejectControlToolOwnedArtifact(fileType: string): any | null {",`function rejectControlToolOwnedArtifact(fileType: string): any | null {
  if (fileType === 'work_item' || fileType === 'work_item.json') {
    return {success:false,error:'WORK_ITEM_METADATA_OWNED_BY_RUNTIME',hard_stop:false,
      policy_violation:true,retry_allowed:false,file_type:fileType,
      message:'Work Item metadata is owned by Runtime control tools. Use sf_work_item_create for creation, sf_state_transition for state, and sf_code_permission for code permissions. Generic artifact writes cannot update or repair work_item.json.'};
  }`));
plan('setup/userlevel-opencode/tools/sf_artifact_write.ts',s=>{s=once(s,'    " file_type=work_item 时内容至少应包含 schema_version、work_item_id、status、workflow_type、workflow_path。",','    " work_item.json 由 Runtime 专用工具维护，禁止通用产物写入；创建用 sf_work_item_create，状态用 sf_state_transition，代码权限用 sf_code_permission。merge_report 仅由 Merge Runner 事务生成。",');s=once(s,'        "work_item",\n','');return once(s,'        "merge_report",\n','');});
plan('packages/daemon-core/tests/design-governance-orchestrator-closure.test.ts',s=>{s=once(s,"    expect(rejected.error).toBe('INVALID_ARTIFACT_JSON');\n    expect(rejected.validation_errors).toContainEqual(\n      expect.stringContaining('WORK_ITEM_STATUS_FORBIDDEN')\n    );","    expect(rejected.error).toBe('WORK_ITEM_METADATA_OWNED_BY_RUNTIME');");return once(s,"    expect(cleaned.error).toContain('WORK_ITEM_METADATA_INVALID');","    expect(cleaned.error).toBe('WORK_ITEM_METADATA_OWNED_BY_RUNTIME');");});
for(const c of changes){const dest=path.join(__dirname,'metadata-artifact-owner-before',c.file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,c.before,{flag:'wx'});}
fs.writeFileSync(path.join(__dirname,'metadata-artifact-owner-plan.json'),JSON.stringify(changes.map(c=>({path:c.file,before_sha256:sha(c.before),after_sha256:sha(c.after)})),null,2)+'\n',{flag:'wx'});
for(const c of changes){assert.equal(sha(fs.readFileSync(c.file)),sha(c.before));fs.writeFileSync(c.file,c.after);}console.log(JSON.stringify({changed:changes.length}));
