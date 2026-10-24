const fs=require('fs'),path=require('path'),crypto=require('crypto');
const repo='D:/code/SpecForge/.tmp/boundary-capability-worktree',dest=path.join(repo,'docs/archive/2026-10-24-boundary-capability-repair'),root=__dirname;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(fs.existsSync(dest))throw Error('ARCHIVE_EXISTS');fs.mkdirSync(dest,{recursive:true});
const members=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else{const relative=path.relative(root,full).replace(/\\/g,'/');if(relative.startsWith('038-'))continue;const bytes=fs.readFileSync(full),target=path.join(dest,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});members.push({path:relative,sha256:sha(bytes),size:bytes.length});}}}walk(root);
const report=`独立复核结论（2026-10-24）
模式 CODEX_DIRECT；RUN_ID CODEX-SF-20261024-BOUNDARY-CAPABILITY-A01。
候选提交 eac590c204fa75dcc6ef1d02f199742655fdc895；产品1.0.19。

第1项：已确认原生写入前置检查的硬链接越权修复。
旧原始复现：项目外直接路径被拒绝，但获准路径的硬链接被放行，外部文件从ORIGINAL变成CHANGED_THROUGH_APPROVED_PATH。
同一复现脚本改用新源码：返回WRITE_HARDLINK_FORBIDDEN，外部内容保持ORIGINAL。
安装版实际daemon、正式客户端和前置钩子：项目内外别名×edit/write四种情况均拒绝，保护文件仍为PROTECTED；普通修改和新建成功，守护日志四条拒绝、两条允许。两个客户端的HTTP集成用例还验证目录联接仍拒绝。
入口→HTTP native-check→权威任务状态与元数据→目标lstat链接数→既有权限引擎/守护日志。责任在native执行边界，未创建另一套业务权限规则。
证据：prior-audit-originals.json.gz，independent-after/hardlink-result.json，020-hardlink-final.*，installed-native-result.json。

第4项：已确认能力判定不再编造缺失数据，测试覆盖明确支持、明确不支持、未知、非法值、缓存更新、合并及JSON传输。
真实OpenCode 1.18.35 /provider中glm-5.3：context=1000000，toolcall=true，image=false；新适配器逐字段一致。streaming和结构化JSON没有声明，所以均为null（未知），不能说支持，也不能说不支持。未知模型与主机断连报错，不返回编造默认能力。
证据：real-provider-result.json及原始主机日志，005/007/008/011/019测试日志，新增capability-evidence-boundary测试源码快照。

验证与交付：正式全仓019退出1，唯一失败包scope-gate（发布清单缺失和过度依赖代码文本的断言）；生成提交绑定清单并修正AST断言后，028整包134项通过。其余完整套件均通过；最终各套件合计6889项，不能把019原始退出1改称0。完整构建、三个类型检查、发布预检及正式安装器verify均通过。
实际安装1.0.19，PID39496（原PID37500）；112个安装文件哈希一致，两个执行文件与验收候选逐字节相同。独立复核重新读取原始决策、前后文件内容及安装日志，不以通过数量代替效果检查。
025快照脚本超过默认缓冲区，026增大缓冲区后通过；036复核脚本将runtime:current-config误当二进制路径，037按两个精确运行文件ID核验通过。所有失败与重试均保留。

证据边界：此修复保护当前原生前置钩子路径，不能宣称是操作系统级原子文件隔离；外部进程在检查后并发替换路径仍不在该保证内。测试中的文件写动作由钩子通过后模拟执行，并非实际OpenCode生成工具调用。真实模型检查是读取本机元数据，没有向模型发送提示词、源码或测试记录，也不等同于实测生成能力。未改动或重开原业务验收Work Item。

判断：本次指定的两个问题已修复并完成源码、原始效果和安装版复核。正常受控使用可以继续；不能扩大为六项所有风险或任意并发恶意文件系统操作都已证明安全。
`;
fs.writeFileSync(path.join(dest,'审查结果.txt'),report);members.push({path:'审查结果.txt',sha256:sha(Buffer.from(report)),size:Buffer.byteLength(report)});
fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify(members,null,2));for(const e of members)if(sha(fs.readFileSync(path.join(dest,e.path)))!==e.sha256)throw Error(e.path);
console.log(JSON.stringify({archive:dest,members:members.length,verified:true}));
