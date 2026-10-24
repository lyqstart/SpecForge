const fs=require('fs'),path=require('path'),crypto=require('crypto'),zlib=require('zlib'),assert=require('assert/strict');
const repo='D:/code/SpecForge',out=__dirname,dest=path.join(repo,'docs/archive/2026-10-24-final-six-acceptance'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(fs.existsSync(dest),false);fs.mkdirSync(dest,{recursive:true});
const review=JSON.parse(fs.readFileSync(path.join(out,'final-independent-review.json')));assert.equal(review.status,'FAIL_CONFIRMED_SHELL_WRITE_BOUNDARY_GAP');
const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else {const rel=path.relative(out,f).replace(/\\/g,'/');if(rel.startsWith('021-seal.'))continue;const b=fs.readFileSync(f);files.push({path:rel,size:b.length,sha256:hash(b),base64:b.toString('base64')});}}}walk(out);
fs.writeFileSync(path.join(dest,'raw-files.json.gz'),zlib.gzipSync(Buffer.from(JSON.stringify(files)),{level:9}));
fs.writeFileSync(path.join(dest,'raw-index.json'),JSON.stringify(files.map(({base64,...r})=>r),null,2));
for(const e of files.filter(r=>!r.path.includes('/')&&!r.path.endsWith('.gz')))fs.copyFileSync(path.join(out,e.path),path.join(dest,e.path));
const sourceFiles=['packages/daemon-core/src/tools/lib/write-guard-runtime-v12.ts','packages/daemon-core/src/tools/handlers/sf-safe-bash.ts','packages/daemon-core/src/tools/lib/sf_safe_bash_core.ts','packages/daemon-core/src/tools/lib/bash-guard.ts'];
fs.writeFileSync(path.join(dest,'reviewed-source.json'),JSON.stringify(sourceFiles.map(f=>{const b=fs.readFileSync(path.join(repo,f));return{path:f,sha256:hash(b),base64:b.toString('base64')}}),null,2));
fs.writeFileSync(path.join(dest,'验收结论.txt'),`最终整体验收：不通过，发现一项高优先级遗漏。
执行模式 CODEX_DIRECT；RUN_ID CODEX-SF-20261024-FINAL-SIX-A01。
基线 85307a8d859d7c92c8303809c86985eb74d34427；实际安装版 1.0.19；重启前 PID39496，重启后 PID36648。

一、已确认的遗漏（CONFIRMED，FINAL-SIX-001）
隔离副本保留原 WI-0001 关闭状态。重启后的真实安装版接受 sf_safe_bash 请求：普通重定向写入被拦截，Node 内联程序写入却成功，退出码0且哨兵内容真实落盘。写后 WI 仍关闭。
证据：shell-probe-result.json 保存完整请求、响应、时间、PID、目标路径、写前不存在及写后字节；019-shell-probe.* 保存执行四件套。独立核验 020-final-independent-review.* 和 final-independent-review.json 再次读取实际文件及原项目，对照前后状态，确认反例成立。
根因：write-guard-runtime-v12.ts 的 extractShellWriteTargets 仅识别部分命令语法；enforceRuntimeWriteGuardForShell 在没有识别到目标时直接 allowed=true、checked=false。sf-safe-bash.ts 只在 checked 且不允许时阻断，其后进入真实执行器；通用危险命令检查不阻止这一条 Node 写文件命令。责任在 Tool Handler / Permission / Write Guard，不是任务关闭状态丢失。
业务含义：任务关闭的状态是正确的，但“关闭后禁止改文件”仍可从命令入口绕过。修好了原生编辑入口，并不代表所有入口都受保护。

二、六项结果
1 写入权限：原生硬链接修复已有真实拒绝和正常允许证据；命令入口仍漏拦。整体未通过。
2 关闭后禁止写入：旧缓存、历史轮转、真实重启均不改变关闭事实；但命令内写入仍成功。整体未通过。
3 配置生效和恢复：缺激活记录、历史丢失/损坏、配置损坏在重启前后均拒绝正常消费与原生写入；合法配置读取消费正确，2秒超时与10秒成功的差异由真实执行证明；配置通过官方 owner 修复/恢复。已覆盖范围未见新缺陷。历史/激活恢复只是隔离夹具回放原字节，不证明产品可自动重建丢失历史。
4 模型能力：真实本地 provider 元数据逐字段对照；未声明 streaming/JSON 保持未知，未知模型及服务关闭不伪造能力；明确 true/false、缓存等回归已核查。不是实际模型推理能力测试。
5 接口真实性：未知接口404、不支持CAS501、非法状态迁移409，状态历史未被非法推进；已覆盖范围未见新缺陷。命令漏拦属于实际权限失败，不能用它返回成功来证明授权正确。
6 配置日志隐私：真实安装链路的正常、非法字段、异常JSON和嵌套密钥输入；扫描15个非空日志文件，daemon与用户侧各21条配置记录，合成秘密未泄漏；已覆盖范围未见新缺陷。

三、恢复、相互影响和原项目保护
同一个原验收项目 D:/code/sf-acceptance-six 及其隔离副本；原业务31项测试通过。异常仅注入证据目录下副本。
实际停止/启动daemon，离线钩子拒绝写入；5次历史轮转后仍正确识别关闭；配置变更不重新授予原生写权限；审计恢复与历史关闭绑定测试已执行。新命令反例正是最后补查替代入口与关闭状态组合时发现。
最终比对原项目1526个基线文件，业务、正式产物及事件历史不变；允许变化仅读取日志、重放缓存版本和等价路径格式。3012个历史证据成员哈希一致，112个安装文件身份一致。实际服务保持1.0.19运行。
本轮没有重新完整操作浏览器/OpenCode业务工作流；旧浏览器和宿主原始记录已逐成员核验，不能冒称本轮重新跑过。没有进行外部模型推理请求。

四、失败记录与结论版本
009比较器误要求有效历史重放不增加缓存版本；010载体生成命令引号失败、运行文件缺失；017比较器未接受同一真实路径的斜杠规范化。所有失败原件保留；011和018补正比较范围，不删除权威状态、历史或文件副作用断言。019退出0表示取证成功，不代表产品通过。
independent-review.json 是发现 shell 反例前的中间结论，已被 final-independent-review.json 明确取代；最终为 FAIL_CONFIRMED_SHELL_WRITE_BOUNDARY_GAP。
本次仅验收与封存，没有修改产品代码或发布新版本。下一步应修复命令执行边界，再补解释器、脚本/子进程及允许正常只读命令的对照测试，复核关闭状态与权限范围组合；不能仅增加一个 Node 字符串匹配就宣布闭环。

五、原始记录
根目录保留命令、stdout/stderr、数字退出码和主要JSON。raw-files.json.gz 是完整相对路径、字节base64及SHA256的打包记录（含夹具和原项目基线）；raw-index.json 可定位成员；manifest.json 校验封存成员。原.tmp记录仍保留。记录含合成测试秘密，不含握手认证token。
结论：目前不能把 SpecForge 的权限边界当作可靠保护，不能宣称六项彻底修复或放心无人值守使用；第3至6项只是本次已覆盖范围未发现新反例。
`);
const packed=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dest,'raw-files.json.gz'))));for(const e of packed){const b=Buffer.from(e.base64,'base64');assert.equal(b.length,e.size);assert.equal(hash(b),e.sha256);assert.equal(hash(fs.readFileSync(path.join(out,e.path))),e.sha256);}
fs.writeFileSync(path.join(dest,'seal-verification.json'),JSON.stringify({utc:new Date().toISOString(),rawMembersVerified:packed.length,status:'SEALED_FINAL_ACCEPTANCE_FAILED',originalTmpPreserved:true},null,2));
const manifest=fs.readdirSync(dest).map(p=>{const b=fs.readFileSync(path.join(dest,p));return{path:p,size:b.length,sha256:hash(b)}});fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify(manifest,null,2));
let status=fs.readFileSync(path.join(repo,'docs/project-status.md'),'utf8');const fields={CURRENT_PHASE:'FINAL_ACCEPTANCE_COMPLETE_WITH_CONFIRMED_GAP',EXECUTION_STATE:'STOPPED',EXECUTION_EVIDENCE_ROOT:'D:/code/SpecForge/docs/archive/2026-10-24-final-six-acceptance',LAST_EXECUTION_CHECKPOINT:'Final independent review confirms installed shell-write bypass on closed isolated project; raw evidence sealed.',LAST_COMPLETED_CHECKPOINT:'Six-item integrated acceptance with real daemon restart and recovery completed; final verdict FAIL due to FINAL-SIX-001.',CURRENT_BLOCKER:'FINAL-SIX-001: sf_safe_bash permits unrecognized inline program writes on closed work item.',NEXT_LEGAL_ACTION:'Review confirmed shell write boundary defect; obtain implementation instruction before product repair. Do not claim all six fully fixed.'};for(const[k,v]of Object.entries(fields))status=status.replace(new RegExp('^'+k+'=.*$','m'),k+'='+v);fs.writeFileSync(path.join(repo,'docs/project-status.md'),status);
fs.appendFileSync(path.join(repo,'docs/rule/specforge-development-error-ledger-and-experience.md'),`\n### ERR-1876：最终验收载体比较误差与中间结论撤回（2026-10-24）\n\n- 009把有效历史重放的缓存版本变化误判为失败；010生成脚本引号失败后运行缺失文件；017未规范化同一真实路径的斜杠。原始失败保留，011/018补正比较器，权威历史和业务字节仍严格比较。\n- 中间independent-review.json早于替代命令入口补测，不再作为最终结论；最终final-independent-review.json独立复核反例并判定不通过。封存docs/archive/2026-10-24-final-six-acceptance。复用EXP-004/006/007/031/282/284。\n\n### ERR-1877：未知命令写入被当作无写入，关闭状态不能阻断（2026-10-24）\n\n- CONFIRMED：安装1.0.19真实重启后，原验收项目隔离副本WI-0001为closed；sf_safe_bash重定向被拒绝，但Node内联写入新哨兵成功，退出码0，前后状态均closed。019原始HTTP/文件证据和020独立比对支持；未改原业务项目。\n- 根因是extractShellWriteTargets未识别程序内部写入，enforceRuntimeWriteGuardForShell对空targets返回unchecked/allowed，Handler随后真实执行。责任Tool Handler / Permission / Write Guard；影响六项验收中的1与2。\n- 当前为RUNTIME_DEFECT，未修复；不能用扩大正则匹配某个反例替代完整执行边界。下一阶段需按权限/执行契约确定可验证的闭环，并验证解释器、脚本/子进程和合法只读命令；本轮仅审查，无源码修改。证据同上封存目录。复用EXP-004/006/007/031/282/284。\n`);
fs.appendFileSync(path.join(repo,'.gitattributes'),'\n/docs/archive/2026-10-24-final-six-acceptance/** -text -diff\n');
console.log(JSON.stringify({dest,rawMembers:packed.length,manifestMembers:manifest.length,verdict:review.status}));
