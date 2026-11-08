// Applies only after frozen03 tests finish and their exact input manifest is checked.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript'),changes=[],sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const name of ['0235','0238']){const file=path.join(__dirname,'commands',name+'.result.json');assert(fs.existsSync(file),'FULL_RUN_STILL_ACTIVE:'+name);assert(Number.isInteger(JSON.parse(fs.readFileSync(file)).inner_exit_code));}
const frozen=JSON.parse(fs.readFileSync(path.join(__dirname,'acceptance-source-03.json')));for(const m of frozen.members)assert.equal(sha(fs.readFileSync(m.path)),m.sha256,'FROZEN_INPUT_CHANGED:'+m.path);
function once(s,a,b){assert.equal(s.split(a).length,2,a);return s.replace(a,b);}
function plan(file,fn){const before=fs.readFileSync(file),after=Buffer.from(fn(before.toString('utf8')));if(file.endsWith('.ts'))assert.equal(ts.createSourceFile(file,after.toString(),ts.ScriptTarget.Latest,true).parseDiagnostics.length,0,file);changes.push({file,before,after});}
const validator=`/** Current knowledge-store contract uses its existing independent version=1.0. */
export function validateKnowledgeStore(value: unknown): asserts value is GlobalKnowledgeStore {
  const object=(v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!object(value) || value.version !== '1.0') throw new Error('KNOWLEDGE_STORE_SCHEMA_UNSUPPORTED: explicit version=1.0 required; existing data preserved, no automatic conversion');
  const strings=(v: unknown) => Array.isArray(v) && v.every(x=>typeof x==='string');
  const counter=(v: unknown) => Number.isSafeInteger(v) && Number(v)>=0;
  const date=(v: unknown) => typeof v==='string' && Number.isFinite(Date.parse(v));
  if (!Array.isArray(value.categories) || !value.categories.every(c=>object(c)&&['id','name','description'].every(k=>typeof c[k]==='string')) ||
      !Array.isArray(value.entries) || !object(value.metadata) || !counter(value.metadata.total_entries) || !date(value.metadata.last_updated)) throw new Error('KNOWLEDGE_STORE_SCHEMA_INVALID: categories, entries and metadata must satisfy the current contract');
  for (const entry of value.entries) {
    if (!object(entry) || !['id','title','content','category','source_project','source_work_item','applicability','normalized_key'].every(k=>typeof entry[k]==='string') ||
        !['tags','applicable_file_patterns','anti_conditions'].every(k=>strings(entry[k])) ||
        !['high','medium','low'].includes(entry.confidence) || !['active','candidate','archived'].includes(entry.status) ||
        !['verified','unverified','disproved'].includes(entry.verification_status) ||
        !['usage_count','helpful_count','rejected_count'].every(k=>counter(entry[k])) || !counter(entry.version) || entry.version<1 ||
        !date(entry.created_at) || !date(entry.updated_at) || !(entry.last_used_at===null || date(entry.last_used_at)) ||
        !(entry.workflow_type===undefined || typeof entry.workflow_type==='string')) throw new Error('KNOWLEDGE_STORE_SCHEMA_INVALID: entry does not satisfy the current contract');
  }
}

`;
for(const file of ['packages/daemon-core/src/tools/lib/sf_knowledge_base_core.ts','setup/userlevel-opencode/tools/lib/sf_knowledge_base_core.ts'])plan(file,s=>{
 s=once(s,'export async function loadStore(): Promise<GlobalKnowledgeStore> {',validator+'export async function loadStore(): Promise<GlobalKnowledgeStore> {');
 s=once(s,'await writeFile(storePath, JSON.stringify(emptyStore, null, 2), "utf-8")','await writeFile(storePath, JSON.stringify(emptyStore, null, 2), {encoding:"utf-8",flag:"wx"})');
 s=once(s,'    // JSON 解析失败时抛出错误\n    try {\n      const store = JSON.parse(content) as GlobalKnowledgeStore\n      return store\n    } catch {\n      throw new Error(\n        "insights.json is corrupted: JSON parse failed. File preserved for manual recovery."\n      )\n    }',`    let store: unknown
    try { store=JSON.parse(content) } catch { throw new Error('KNOWLEDGE_STORE_JSON_INVALID: file preserved; do not edit or delete outside the knowledge owner') }
    validateKnowledgeStore(store)
    return store`);
 return once(s,'export async function saveStore(store: GlobalKnowledgeStore): Promise<void> {\n  try {\n    const storePath = getGlobalStorePath()',`export async function saveStore(store: GlobalKnowledgeStore): Promise<void> {
  try {
    validateKnowledgeStore(store)
    const storePath = getGlobalStorePath()
    // A valid new value cannot silently convert an existing unsupported store.
    try { const existing=JSON.parse(await readFile(storePath,"utf-8")); validateKnowledgeStore(existing) }
    catch(error) { if((error as NodeJS.ErrnoException).code!=="ENOENT") throw error }`);
});
plan('packages/daemon-core/src/tools/handlers/sf-state-transition.ts',s=>{const guard='  if(args["workflow_type"]!==undefined&&args["workflow_type"]!==CURRENT_RELEASE_WORKFLOW_TYPE)return {success:false,error:"UNSUPPORTED_CURRENT_RELEASE_WORKFLOW",code:"UNSUPPORTED_CURRENT_RELEASE_WORKFLOW"};\n';s=once(s,guard,'');s=once(s,'  if (!workItemId) {',guard+'\n  if (!workItemId) {');return once(s,'`项目尚未初始化，请在项目根目录运行 SpecForge 初始化流程以创建 ${SPEC_DIR_NAME}/project/spec_manifest.json`','"项目尚未初始化；请由 sf-orchestrator 调用受控 sf_project_init。不要手工创建或修复 Project Spec、Manifest 或 Runtime 状态。"');});
plan('packages/daemon-core/tests/unit/governance-closure-e2e.test.ts',s=>once(s,"    schema_version: '1.1',\n    work_item_id: workItemId,","    schema_version: '1.1',\n    work_item_id: workItemId,\n    workflow_type: 'feature_spec',"));
plan('packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts',s=>once(s,'For investigation/review/spec_migration no-code Work Items, call sf_changed_files_audit with mode="no_code_change". ','For the current feature_spec pre-approval specification-only phase, call sf_changed_files_audit with mode="no_code_change" only when no business code changed. '));
plan('packages/service-management/src/service-manager/systemd-service-manager.ts',s=>once(s,"console.error('Rollback failed, manual cleanup may be required');","console.error('Rollback failed; preserve logs and inspect the owning service installation/recovery operation. Do not manually delete runtime state or unknown service files.');"));
plan('setup/userlevel-opencode/tools/sf_semantic_closure_run.ts',s=>once(s,'    "首选直接传 semantic_closure 结构化对象；兼容来源为 verification_report fenced JSON、" +','    "Manifest 必须显式使用独立 schema_version=1.0；未知、缺失或损坏版本保持阻断，force 不能自动转换。" +\n    "首选直接传 semantic_closure 结构化对象；兼容来源为 verification_report fenced JSON、" +'));
for(const c of changes){const dest=path.join(__dirname,'storage-and-guidance-before',c.file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,c.before,{flag:'wx'});}
fs.writeFileSync(path.join(__dirname,'storage-and-guidance-plan.json'),JSON.stringify(changes.map(c=>({path:c.file,before_sha256:sha(c.before),after_sha256:sha(c.after)})),null,2)+'\n',{flag:'wx'});for(const c of changes){assert.equal(sha(fs.readFileSync(c.file)),sha(c.before));fs.writeFileSync(c.file,c.after);}console.log(JSON.stringify({changed:changes.length}));
