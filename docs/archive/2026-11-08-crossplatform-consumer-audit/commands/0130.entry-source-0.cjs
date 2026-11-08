const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');const out=__dirname,sha=b=>crypto.createHash('sha256').update(b).digest('hex'),changes=[];
function plan(file,next){const before=fs.readFileSync(file),after=Buffer.from(typeof next==='function'?next(before.toString('utf8')):next);if(!before.equals(after))changes.push({file,before,after});}
plan('package.json',text=>{const value=JSON.parse(text);value.scripts.clean='bun scripts/clean-workspace.ts';value.scripts['test:project-bootstrap']='bun run --cwd packages/daemon-core test -- tests/unit/project-session-bootstrap.test.ts';return JSON.stringify(value,null,2)+'\n';});
for(const name of ['types','version-unification','configuration','service-management','host-profile','observability','permission-engine','opencode-adapter','scope-gate','workflow-runtime','cli','daemon-core'])plan('packages/'+name+'/package.json',text=>{const value=JSON.parse(text);value.scripts.clean='bun ../../scripts/clean-workspace.ts --package '+name;return JSON.stringify(value,null,2)+'\n';});
plan('packages/permission-engine/README.md',`# @specforge/permission-engine

当前发布的内部权限库；生产部署通过仓库官方发布和安装器完成，不单独安装本包。产品边界由 SPS 与 Authority Registry 定义。

\x60src/index.ts\x60 导出 \x60PermissionEngine\x60、规则求值、策略加载、事件记录与插件加载校验。\x60src/write-decision.ts\x60 提供 Work Item 写入判定和受控产物写入边界。包运行依赖为共享 types、YAML 与 Zod，不反向依赖 daemon-core。

通用策略求值器不是产品执行授权入口。实际工具调用仍由 Daemon 的真实角色、Runtime 状态、受控 Tool Handler、Write Guard、HardStop 与审计共同约束；调用本库不能替代批准、Code Permission、Gate 或 Close。D18 \x60sf_safe_bash\x60 保持只读；D23 受控验证只在已批准的平台与 profile 内运行，由 \x60sf-orchestrator\x60 调用 \x60sf_verification_plan\x60、\x60sf-verifier\x60 调用 \x60sf_verification_run\x60。

从仓库根完成 \x60bun install --frozen-lockfile\x60 和 \x60bun scripts/build-workspace.ts\x60 后，在本包目录运行 \x60bun run test\x60。正式全量回归入口是根目录的 \x60bun scripts/test-workspace.ts\x60。其他开发脚本以本包 \x60package.json\x60 为准。\x60PROJECT_STRUCTURE.md\x60 是历史实施报告。
`);
for(const c of changes){const dest=path.join(out,'portable-entrypoints-before',c.file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,c.before,{flag:'wx'});}
fs.writeFileSync(path.join(out,'portable-entrypoints-plan.json'),JSON.stringify(changes.map(c=>({path:c.file,before_sha256:sha(c.before),after_sha256:sha(c.after)})),null,2)+'\n',{flag:'wx'});
for(const c of changes){assert.equal(sha(fs.readFileSync(c.file)),sha(c.before));fs.writeFileSync(c.file,c.after);}console.log(JSON.stringify({changed:changes.length}));
