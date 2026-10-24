const fs=require('fs'),path=require('path'),crypto=require('crypto'),zlib=require('zlib'),assert=require('assert/strict');
const root=__dirname,repo='D:/code/SpecForge',dest=path.join(repo,'docs/archive/2026-10-24-shell-boundary-repair'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const review=JSON.parse(fs.readFileSync(path.join(root,'final-independent-review.json')));assert.equal(review.status,'PASS_APPROVED_READ_ONLY_CONTAINMENT');assert.equal(fs.existsSync(dest),false);fs.mkdirSync(dest,{recursive:true});
const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else{const rel=path.relative(root,f).replace(/\\/g,'/');if(rel.startsWith('057-seal.'))continue;const b=fs.readFileSync(f);files.push({path:rel,size:b.length,sha256:hash(b),base64:b.toString('base64')});}}}walk(root);
fs.writeFileSync(path.join(dest,'raw-files.json.gz'),zlib.gzipSync(Buffer.from(JSON.stringify(files)),{level:9}));fs.writeFileSync(path.join(dest,'raw-index.json'),JSON.stringify(files.map(({base64,...e})=>e),null,2));
for(const e of files.filter(e=>!e.path.includes('/')&&!e.path.endsWith('.gz')))fs.writeFileSync(path.join(dest,e.path),Buffer.from(e.base64,'base64'));
const packed=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dest,'raw-files.json.gz'))));for(const e of packed){const b=Buffer.from(e.base64,'base64');assert.equal(hash(b),e.sha256);assert.equal(b.length,e.size);assert.equal(hash(fs.readFileSync(path.join(root,e.path))),e.sha256);}
fs.writeFileSync(path.join(dest,'验收结论.txt'),`修复和六项独立复核完成：PASS_APPROVED_READ_ONLY_CONTAINMENT。
执行模式 CODEX_DIRECT；RUN_ID CODEX-SF-20261024-SHELL-BOUNDARY-A01。

用户已明确选择：先安全封堵，保留受控只读操作；无法隔离的脚本、构建和测试命令明确拒绝，不宣称这些执行功能可用。此决定已进入SPS §9.2与Authority Registry D18。

一、修复了什么
根因不是漏了Node关键词，而是把“没有从命令文字识别到写入”误当成“不会写入”，随后用宿主Shell执行。现在通用进程执行已撤下：受控只读操作在Runtime内部完成，不启动Shell、解释器、脚本或子进程。环境变量、stdin、复合语句、管道和重定向不允许进入外部执行。
正常读取、列目录、哈希、文字输出和内部等待保留；路径限于项目普通文件，治理路径需受控owner。角色、活动任务、代码授权和报告目录例外均不能恢复通用执行。历史验证器备用执行路径也已接到同一只读边界。Shell观察日志拒绝链接别名，避免观察日志写入波及业务文件。
源码、安装模板、工具说明、Agent提示、规格和版本消费者一起更新，正式安装1.0.20。旧PID已确认退出，升级及重启后文件身份核验通过。

二、实际反例和修复证明
001 baseline：真实旧安装版在关闭任务隔离副本中，内联Node、脚本文件、脚本启动子进程三条路径均落盘成功；不是仅依据Agent自述。
046与052：真实新安装版在两个不同PID上，每轮15项拒绝及4项只读正例；核对完整HTTP响应、目标不存在、输入字节不变和实际拒绝日志。解释器、脚本、子进程、构建/测试、未知程序、组合命令、报告路径及env/stdin均拒绝。
054：从原项目复制的隔离夹具新增测试任务并赋予真实测试代码范围；活动且授权时脚本/子进程仍拒绝。原生write/edit对内外硬链接4次拒绝且别名字节不变，普通单链接修改/新建2项允许。
033独立AST/源码核验：内部只读执行路径没有外部进程调用，源码/模板字节一致，历史验证器无child_process入口。056独立审查重新读取原始响应、实际文件、历史证据与安装身份，未发现新的反例。

三、六项结果
1 写入权限：通过本次批准的封堵范围。任意命令不再执行；原生授权编辑/新建仍可用，硬链接越权仍拒绝。
2 关闭后禁止修改：原事件保持closed，旧投影和真实重启不恢复权限；命令替代入口也不能写入。
3 配置：激活记录丢失、历史丢失/损坏、配置损坏在重启前后均拒绝。原始历史/激活字节只在隔离副本恢复；配置通过正式owner修复/恢复。2秒超时与10秒成功由内部Start-Sleep消费同一正式配置证明。没有声称产品可自动重建丢失历史。
4 模型：本地真实provider字段逐项比对，缺失streaming/JSON保持null；未知模型和断连失败，不伪造能力。没有发送推理请求，不宣称模型实际推理能力已测。
5 真实错误：未知404、不支持CAS501、非法状态迁移409；未执行命令返回失败，旧验证器不会把拒绝记录为通过。
6 日志：安装客户端到daemon的正常与异常配置输入，实际非空日志扫描未出现合成测试秘密；不是只测试日志格式。

四、验证完整性与限制
正式全仓021退出1：仅daemon的两项文档一致性失败，其他包均通过。文档修正不改变生产源码，034完整daemon重跑219文件2089测试全部通过；原失败保留。正式构建、三个类型检查、发布预检、安装器upgrade/verify均有原始记录。
原验收项目业务31项测试重新运行。最终比较${review.original.files}个基线文件，业务、正式产物和事件历史不变；变化仅为读取观察日志和等价缓存重放。${review.history.reduce((a,e)=>a+e.verified,0)}个历史证据成员哈希通过。
本轮没有重新完成浏览器端或OpenCode全自动业务工作流；旧原始记录已核验。也不声明操作系统级沙箱、外部并发替换的原子隔离或自动灾难恢复能力。

五、现在能不能放心用
可以按已说明的受控只读模式使用。已复现的命令写入漏洞在这个范围内完成封堵，六项本轮覆盖范围内没有剩余已确认缺陷。
不能把它当成已恢复完整自动开发能力：通过sf_safe_bash运行脚本、构建和测试目前就是不可用。要恢复这些功能，必须另行实现并验证真正的隔离执行环境。

原始证据：baseline-result.json、installed-shell-first.json、installed-shell-restart.json、integrated-before/after.json、installed-native-result.json、privacy-result.json、real-provider-result.json；最终审查final-independent-review.json。每个命令的command/stdout/stderr/result原件均保留。raw-files.json.gz保存完整路径、字节base64和SHA256；raw-index.json可索引。旧失败记录未删除或改写。\n`);
fs.writeFileSync(path.join(dest,'seal-verification.json'),JSON.stringify({utc:new Date().toISOString(),membersVerified:files.length,status:'PASS',finalVerdict:review.status},null,2));
const manifest=fs.readdirSync(dest).map(f=>{const b=fs.readFileSync(path.join(dest,f));return{path:f,size:b.length,sha256:hash(b)}});fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify(manifest,null,2));
let file=path.join(repo,'docs/project-status.md'),s=fs.readFileSync(file,'utf8');const fields={CURRENT_PHASE:'READ_ONLY_CONTAINMENT_DELIVERED_AND_INDEPENDENTLY_VERIFIED',EXECUTION_STATE:'STOPPED',EXECUTION_EVIDENCE_ROOT:'D:/code/SpecForge/docs/archive/2026-10-24-shell-boundary-repair',LAST_EXECUTION_CHECKPOINT:'Installed1.0.20; actual restart denial/read positives and independent raw-evidence six-item review passed within approved D18 scope.',LAST_COMPLETED_CHECKPOINT:'Closed command writes blocked by non-spawning internal read interpreter; source/template/verifier synced; raw baseline and corrected regression preserved.',CURRENT_BLOCKER:'NONE',NEXT_LEGAL_ACTION:'Use documented D18 restricted read-only mode. General scripts builds and tests remain unavailable until separately approved isolation architecture is implemented and verified.'};for(const[k,v]of Object.entries(fields))s=s.replace(new RegExp('^'+k+'=.*$','m'),k+'='+v);s=s.replace(/^(OWNER_DECISIONS=.*)$/m,'$1;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT');fs.writeFileSync(file,s);
fs.appendFileSync(path.join(repo,'docs/rule/specforge-development-error-ledger-and-experience.md'),'\n### ERR-1882：命令写入安全封堵的部署与独立复核\n\n- 034完整daemon219文件2089项通过，021其他包均通过且仅文档两项失败，来源差异经056证明为文档。039发布预检、042升级、043安装核验通过；旧进程退出和新安装112个文件哈希均经独立核验。\n- 046/052真实安装两个PID的命令拒绝与只读正例均成立；054活动且授权的脚本/子进程仍拒绝，硬链接四拒绝及正常编辑/新建均通过。047/051配置/历史异常跨重启仍拒绝，恢复及配置超时消费正确；053配置日志无测试秘密，031真实模型字段语义正确。\n- 056重新比较原项目1531个基线文件与3132个历史证据成员、源码/部署执行入口和实际文件效果，PASS_APPROVED_READ_ONLY_CONTAINMENT。用户明确选定D18，不能声称通用脚本/构建/测试或完整无人值守开发能力恢复；只读路径不是OS沙箱。封存docs/archive/2026-10-24-shell-boundary-repair。EXP-004/006/007/261/282/283/284/285。\n');
fs.appendFileSync(path.join(repo,'.gitattributes'),'\n/docs/archive/2026-10-24-shell-boundary-repair/** -text -diff\n');
console.log(JSON.stringify({dest,members:files.length,manifestMembers:manifest.length,verdict:review.status}));
