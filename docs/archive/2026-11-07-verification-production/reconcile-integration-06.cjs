const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');const root=path.resolve(__dirname,'../../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),checkpoint=JSON.parse(fs.readFileSync(path.join(__dirname,'integration-checkpoint-06.json')));assert.equal(checkpoint.original_model_run_started,false);assert.equal(checkpoint.installed_user_version,'1.0.22');assert.equal(checkpoint.original_files_unchanged,1057);
const paths=['docs/project-status.md','docs/rule/specforge-development-error-ledger-and-experience.md'];const before={};for(const p of paths)before[p]=sha(fs.readFileSync(path.join(root,p)));
const file=path.join(root,paths[0]);let status=fs.readFileSync(file,'utf8');function set(k,v){const rx=new RegExp('^'+k+'=.*$','gm');assert.equal((status.match(rx)||[]).length,1,k);status=status.replace(rx,()=>k+'='+v);}
set('LAST_EXECUTION_CHECKPOINT','Source488cd34 and async source-Git/diagnostic fix a918b49 committed on codex/verification-production; local main6fc9 unchanged, no push yet. Current build0208 direct crash/restart/repeat recovery0213 passed; full types0206,17 regressions0207 and registered root740 tests0220 passed. Actual installed formal0224 and common Verification/FV/Close integrity projections0233 passed within seeded-fixture scope, without claiming full Gate acceptance. Actual transactional user1.0.22 installation0235 verified117 managed files; independent fresh Daemon14576/43540 and owned HardStop negative0239 passed. Independent0240 verified239 receipts,21 frozen sets,117 installed identities and complete1057-file original set unchanged. Real GLM launch was rejected before process start by automatic review for missing explicit external-data consent; no original model run exists. Read-only SPS8 audit confirmed legacy public persistence exports/build surface still conflict with Daemon-only persistence; no production Daemon caller found in inspected current source.');
set('CURRENT_BLOCKER','ORIGINAL_REAL_PROVIDER_AWAITING_EXPLICIT_MINIMUM_CONTEXT_EXTERNAL_DATA_CONSENT;SPS8_PUBLIC_LEGACY_PERSISTENCE_BOUNDARY_REPAIR_REQUIRED;PRODUCT_GIT_DELIVERY_PENDING');
set('NEXT_LEGAL_ACTION','Apply archived workflow-persistence-boundary-repair-plan within existing SPS8 authority: snapshot obsolete implementation/tests, prove current export/build mismatch, retire independent persistence from production module and migrate current acceptance to real Daemon owners; run targeted regression/types/build/precheck/current root tests. Preserve exact0208 deployment identity and all prior failures. Await explicit external-model consent without indirect retries; only after consent continue same original WI via real installed professional Agents/provider, preserving revoked code permission and separate concrete business-main merge confirmation.');
const scope=status.match(/^ALLOWED_SCOPE=(.*)$/m)[1];assert.ok(scope.includes('packages/workflow-runtime/src/types/state-machine.ts'));set('ALLOWED_SCOPE',scope.replace('packages/workflow-runtime/src/types/state-machine.ts','packages/workflow-runtime/src/**;packages/workflow-runtime/tsconfig.json;packages/workflow-runtime/examples/**;packages/workflow-runtime/vitest.config.ts'));
fs.writeFileSync(file,status.trimEnd()+'\n');
const ledger=path.join(root,paths[1]);let text=fs.readFileSync(ledger,'utf8');assert.equal(text.includes('### ERR-1986：'),false);text+=`
### ERR-1986：冷Kernel枚举超时和SDK初始化版本不能冒充产品执行失败或最终加载版本

- 0219在Agent枚举180秒超时，发生于Daemon/验证应用启动前；0224同安装配置预热后正式矩阵通过。具体冷启动机制仍INSUFFICIENT_EVIDENCE，未放宽应用预算或将超时行计通过。初始fixture的tool_sdk_version只说明复制版本1.18.16；Kernel实际初始化到1.18.35，后续载体记录真实before/after。0240独立比较global1.18.16与fixture1.18.35的dist/index.js和dist/tool.js两份入口原字节相同，仅证明这两文件兼容，不宣称包整体相同。EXP-001/007/008/016/298。

### ERR-1987：实际安装夹具被误套历史手工复制见证

- 0231在消费者启动前错误要求PRIOR_COPY_WITNESS_REQUIRED；实际夹具来自117文件正式安装。修复联测载体使用实际安装metadata、封存install proof和字节身份后0233通过，原失败保留；未删除产品HardStop或共同校验。EXP-004/007/022。

### ERR-1988：部署证据写入类别使用了协议未定义名称

- 0235实际授权安装成功，但其载体expected字段用了DEPLOYMENT_WRITES，协议仅有四分类。补充deployment-write-classification-0235.json明确逐项归入既有四类，未覆盖原回执或伪造安装结果。后续载体必须直接使用正式四分类。EXP-007/017/193。

### ERR-1989：联测误用前台Daemon启动及未等待握手就绪

- 0236用真实CLI默认前台daemon start后同步等待90秒造成载体超时；随后一度读取未被实际CLI入口采用的旧command文件，不据此归因。真实入口daemon-client.ts及文档要求detach。0237改--detach后启动退出0但立即status返回1；0238后续status0，0239等待新握手/健康PID/版本就绪、独立CIM创建时间/路径/hash及117文件后通过。确切内部握手竞态未证明，未宣称修复产品CLI。原WI载体同步采用相同就绪检查，尚未启动模型。EXP-001/007/008/038/298。

### ERR-1990：大文件检索、无界输出和猜测路径造成重复取证错误

- 多次把大量独立读取合到同一输出预算，active rules和含超长JSON行的历史账本结果被截断；这些调用不得计作全文读取。此前已完成的完整前置读取仍以原回执为据，不用本轮截断替代。另猜测daemon/services路径、checkpoint-05文件名及不存在README造成读取错误；均为载体/路径发现问题，未证明产品缺陷、未改变现场。
- 改为先rg --files定位，账本rg显式--max-columns并只返回标题/短投影，JSON用解析后指定字段，必要全文按连续行块各自返回。0240独立hash核验成功不冒充源码正文读取。截断或找不到路径即明确未完成该取证，不据此作事实结论。EXP-001/007/008/021/193。

### ERR-1991：当前测试仍把旧模块持久化当作SPS8验收依据

- 源码直接证明Workflow Runtime入口公开独立文件存储/恢复，当前tsconfig收录该实现，root CURRENT_HERMETIC feature-spec-e2e仍调用旧WorkflowPersistence。SPS8明令该模块不拥有独立workflow-state persistence；现有测试通过不是这条规格的正向证明。
- 当前daemon-core/cli/setup/scripts检索无旧类/工厂生产调用，ProjectManager使用真实Daemon StateManager；据此只确认公开模块/构建边界缺陷，不能声称当前Daemon实际双写。按workflow-persistence-boundary-repair-plan先封存旧字节，退出当前生产面，并把当前状态持久化/恢复验收放到Daemon真实owner；扩展唯一status的合法源范围，不新增产品能力或业务WI。EXP-004/007/017/022/031。
`;fs.writeFileSync(ledger,text.trimEnd()+'\n');
const value={utc:new Date().toISOString(),checkpoint:'integration-checkpoint-06.json',scope_basis:'SPS8 existing owner boundary; standing user repair instruction; archived workflow-persistence-boundary-repair-plan.md',before,after:Object.fromEntries(paths.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))])),external_model_consent_created:false,original_business_writes:false};fs.writeFileSync(path.join(__dirname,'integration-reconciliation-06.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status_updated:true,ledger_through:'ERR-1991',original_business_writes:false}));
