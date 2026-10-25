const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const out=__dirname, root=process.cwd(),spec='docs/product-specification/specforge-product-specification.md';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const catalog={
 authority:{sources:['docs/product-specification/authority-registry.md','scripts/project-session-bootstrap.mjs'],runs:['006-root-regression','011-scope-regression'],limit:'权威入口、当前状态检查和发布范围回归；不替代实际业务验收。'},
 release:{sources:['scripts/lib/current-release-precheck.ts','scripts/lib/release-manifest-producer.ts','scripts/lib/registry.ts'],runs:['021-release-precheck','011-scope-regression'],limit:'当前 Windows 发布/安装集合；声明存在不证明每个业务行为。'},
 state:{sources:['packages/daemon-core/src/wal/WAL.ts','packages/daemon-core/src/state/StateManager.ts','packages/daemon-core/src/tools/lib/work-item-metadata.ts'],runs:['005-daemon-regression'],limit:'事件重放、轮转完整性、metadata、状态转移及损坏拒绝的源码和自动回归；真实链进度另见 host01。'},
 paths:{sources:['packages/types/src/user-level-paths.ts','packages/daemon-core/src/daemon/path-resolver.ts','packages/types/src/directory-layout.ts'],runs:['005-daemon-regression','023-installer-verify'],limit:'路径解析和已安装112文件；没有对所有未来运行进行全盘写入监控。'},
 project:{sources:['packages/daemon-core/src/tools/lib/sf_project_init_core.ts','packages/daemon-core/src/tools/lib/project-governance-v2.ts'],runs:['005-daemon-regression'],limit:'Core 初始化与正式对象/版本校验；真实初始化结果在 OpenCode 工具记录中。'},
 config:{sources:['packages/daemon-core/src/project/ProjectManager.ts','packages/configuration/src/config-merge.ts','packages/configuration/src/config-loader.ts'],runs:['005-daemon-regression','audit-configuration'],limit:'四层合并、敏感字段、activation、CAS、恢复和日志脱敏自动回归；不证明任意未登记配置格式。'},
 candidate:{sources:['packages/daemon-core/src/tools/lib/candidate-generation-integrity.ts','packages/daemon-core/src/tools/lib/implementation-baseline.ts','packages/daemon-core/src/tools/lib/candidate-requirement-reference-integrity.ts','packages/daemon-core/src/tools/lib/user-decision-recorder-v11.ts'],runs:['005-daemon-regression'],limit:'候选封存、基线、逐字ID、Gate Attempt、Decision/Merge绑定的源码和回归；真实审批尚不能由测试替代。'},
 recovery:{sources:['packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts','packages/daemon-core/src/tools/lib/invalid-merged-spec-closure-recovery.ts','packages/daemon-core/src/tools/lib/verification-evidence-integrity.ts'],runs:['005-daemon-regression'],limit:'两类终态补偿、不可变归档、原Close时点与证据完整性自动回归；未破坏真实项目以重复实验。'},
 guard:{sources:['packages/daemon-core/src/tools/lib/native-write-boundary.ts','packages/daemon-core/src/tools/lib/write-guard-audit-binding.ts','packages/daemon-core/src/tools/lib/hard-stop-latch.ts','packages/daemon-core/src/tools/handlers/sf-hard-stop-resolve.ts'],runs:['005-daemon-regression','audit-permission-engine'],limit:'权限、原生写前、硬链接、HardStop、审计新鲜度源码/回归；不声明OS沙箱或所有宿主组合完备。'},
 plugin:{sources:['setup/userlevel-opencode/plugins/sf_specforge.ts','setup/userlevel-opencode/scripts/lib/sf_thin_plugin.ts'],runs:['011-scope-regression','005-daemon-regression'],limit:'唯一发现入口、等待Daemon裁决、无进程生命周期；host01有真实连接记录。'},
 adapter:{sources:['packages/opencode-adapter/src/OpenCodeAdapter.ts','packages/opencode-adapter/src/integration/OpenCodeHttpRuntimeClient.ts'],runs:['audit-opencode-adapter'],limit:'918项自动回归和实际provider元数据；真实新业务链及部署Daemon生产消费另列，不能仅由host直连API替代。'},
 installer:{sources:['scripts/sf-installer.ts','scripts/lib/upgrade-journal.ts'],runs:['011-scope-regression','022-deploy-supplement','023-installer-verify'],limit:'正式升级/verify与隔离install/upgrade/rollback；真实用户安装未执行uninstall。'},
 workflow:{sources:['packages/workflow-runtime/src/types/state-machine.ts','configs/workflows/builtin/feature_spec.json'],runs:['audit-workflow-runtime','005-daemon-regression'],limit:'workflow定义、状态和编排回归；包中历史fixture通过不等于当前OpenCode连续链通过。'},
 service:{sources:['packages/service-management/package.json','packages/cli/src/cli.ts'],runs:['audit-service-management','audit-cli','025-cli-guidance-regression'],limit:'Windows上的源码/回归；Linux systemd真实服务注册未取证。CLI首次788通过1失败，已修复并定向5通过，不能写成首次全绿。'},
 schema:{sources:['packages/daemon-core/src/state/runtime-schema-descriptors.ts','packages/daemon-core/src/project/project-schema-descriptors.ts','packages/configuration/src/project-schema-descriptor.ts'],runs:['005-daemon-regression','audit-configuration'],limit:'已覆盖owner的schema拒绝；缺少每一持久化类别全部首次读写路径的完整证明。'},
 diagnostics:{sources:['packages/observability/package.json','packages/host-profile/package.json','packages/version-unification/package.json'],runs:['audit-observability','audit-host-profile-retry','audit-version-unification-retry'],limit:'现有包回归；不把包存在和测试数量当作全生产调用链证明。'},
 prompts:{sources:['setup/userlevel-opencode/agents/sf-verifier.md','setup/userlevel-opencode/skills/superpowers-verification-before-completion/SKILL.md','setup/userlevel-opencode/skills/superpowers-tdd/SKILL.md','setup/userlevel-opencode/agents/sf-executor.md'],runs:['017-guidance-owner-regression','025-cli-guidance-regression'],limit:'Verifier已修D18/状态/owner；TDD Skill仍要求运行测试，完整消费者一致性未达标。'}
};
catalog.guard.sources.push('packages/daemon-core/src/tools/lib/regenerable-artifact-governance.ts','packages/daemon-core/src/tools/lib/code-permission-service-v11.ts','packages/daemon-core/src/tools/handlers/sf-git-ignore-decision-record.ts');
catalog.adapter.sources.push('packages/daemon-core/src/daemon/Daemon.ts');
catalog.workflow.sources.push('packages/workflow-runtime/src/index.ts','packages/workflow-runtime/src/WorkflowPersistence.ts');
catalog.workflow.limit+=' 当前公开导出仍有 WorkflowPersistence 文件存储实现；未发现Daemon生产调用不等于证明所有消费者不可达，职责隔离需进一步收口。';
catalog.installer.runs.push('030-final-precheck','032-final-verify','033-final-installed-identity','034-final-host');
catalog.prompts.runs.push('026-guidance-final-regression','034-final-host');
catalog.installer.runs.push('043-path-precheck','045-path-verify','046-final-byte-check','047-fresh-final-host');
catalog.prompts.runs.push('039-verifier-paths-retry','047-fresh-final-host');
catalog.prompts.sources.push('setup/userlevel-opencode/AGENTS.md','setup/userlevel-opencode/agents/sf-debugger.md','setup/userlevel-opencode/tools/lib/sf_artifact_write_core.ts','packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts');
catalog.adapter.runs.push('048-production-probe','051-production-prompt');
catalog.adapter.runs.push('052-adapter-events');
catalog.adapter.runs.push('055-event-callsites');
catalog.adapter.sources.push('packages/daemon-core/src/http/HTTPServer.ts','packages/opencode-adapter/tests/integration/session-lifecycle.integration.test.ts');
catalog.candidate.sources.push('packages/daemon-core/src/tools/lib/sf_requirements_gate_core.ts','setup/userlevel-opencode/agents/sf-requirements.md');
catalog.candidate.sources.push('packages/daemon-core/src/tools/lib/sf_doc_lint_core.ts');
catalog.prompts.sources.push('setup/userlevel-opencode/agents/sf-design.md','packages/daemon-core/src/tools/handlers/sf-artifact-write.ts');
catalog.candidate.runs.push('057-requirement-core-probe');
catalog.candidate.runs.push('066-reference-probe');
catalog.candidate.runs.push('067-seal-observation','068-baseline-false-positive','070-final-business-files','072-final-runtime-state');
catalog.prompts.runs.push('060-parent-check');
catalog.adapter.limit='918项自动回归；实际部署Daemon→Adapter→OpenCode创建/查询/取消和真实模型纯文本提示/回复已独立验证。完整业务闭环仍另列。';
catalog.plugin.runs.push('048-production-probe');
catalog.service.runs.push('036-cli-help','037-daemon-status');
const snapshots={};for(const e of Object.values(catalog)){for(const f of e.sources){if(!fs.existsSync(f))throw Error('SOURCE_NOT_FOUND '+f);const bytes=fs.readFileSync(f);snapshots[f]={sha256:hash(bytes),text:bytes.toString('utf8')};}e.results=e.runs.map(id=>({id,...JSON.parse(fs.readFileSync(path.join(out,id+'.result.json')))}));}
const groups={'0':'authority','0.1':'release','1.1':'candidate','1.2':'release','1.3':'release','2.1':'workflow','2.2':'workflow','3.1':'authority','3.2':'project','3.3':'state','4.1':'paths','4.2':'project','4.3':'project','4.4':'paths','5.1':'config','5.2':'config','6.1':'state','6.2':'state','6.3':'candidate','6.4':'candidate','6.5':'recovery','6.6':'recovery','7.1':'state','7.2':'service','7.3':'plugin','8':'workflow','9.1':'guard','9.2':'guard','9.3':'guard','9.4':'guard','10.1':'plugin','10.2':'adapter','11':'service','12.1':'installer','12.2':'installer','13.1':'service','13.2':'diagnostics','14':'diagnostics','15':'schema','16':'diagnostics','17':'release','18':'release','19':'authority','20':'authority','21':'authority','22':'authority'};
const conservative=new Set(['1.1','1.2','2.1','2.2','6.3','7.1','7.2','8','10.2','13.1','13.2','14','15','16','21']);
const lines=fs.readFileSync(spec,'utf8').split(/\r?\n/);let section='0',fence=false,start=0,buffer=[];const rows=[];
function flush(){if(!buffer.length)return;const text=buffer.join(' ').trim();buffer=[];if(!text||text==='---'||text.startsWith('<!--')||text.startsWith('>')||text.startsWith('|'))return;if(section==='18.1'||section==='Appendix')return;const group=groups[section]||'authority';let status=conservative.has(section)?'证据不足':'已实现';let missing=status==='证据不足'?'已有局部实现/测试；该条完整生产调用链或目标环境证据未闭合。':'';
 if(section==='19'){const n=Number(text.match(/^(\d+)\./)?.[1]);if([3,6,12,15,19].includes(n)){status=n===19?'未实现':'证据不足';missing=n===19?'CONFIRMED：已安装 superpowers-tdd/SKILL.md 第14/20/25行仍要求执行测试，与D18冲突；sf-executor完成定义仍要求命令真跑通。':'缺少本轮覆盖该全称要求的完整真实部署/业务链证据。';}}
 if(section==='9.2'&&text.includes('当前 `sf_safe_bash`')){missing='通用脚本/测试执行明确不在当前能力范围；拒绝能力已实现，不能解释为具备自动测试。';}
 if(section==='4.2'&&text.includes('辅助项目上下文')){status='证据不足';missing='Verifier已改为Contract条件输入；其他消费者仍强制读取辅助文件，其正式Contract绑定尚未完整证明。';}
 if(section==='11'){status='证据不足';missing='正式命令表面有回归；完整CLI→Daemon真实命令集合本轮未逐项执行。';}
 // Group-level regression coverage is not a proof of each paragraph's whole claim.
 // Keep only individually reviewed, bounded claims as implemented; broad/universal
 // claims stay insufficient even when their implementation has extensive tests.
 const boundedVerified=new Set([592,600,601,602,638,642,643,644,645,650,654,656,658,721,723,725,726,727,740,773,777,778,779,780,781,782,784,785,786,787,791,793,1545,1546,1548,1549,1551,1553,1555,1557,1558,1560,1562,1564]);
 if(status==='已实现'&&!boundedVerified.has(start)){status='证据不足';missing='已定位相关实现和回归，但本轮未形成该段全部子要求的独立、逐项证据闭环；不把同模块测试通过提升为本条完整实现。';}
 if(boundedVerified.has(start)){status='已实现';missing='结论限定于此条明确行为的源码/回归及列明实测环境；不外推为整体业务验收。';}
 if(start===721||start===723){missing='048/051：实际部署Daemon经Adapter创建/查询/取消会话并投递提示，独立OpenCode消息确认真实模型回复。';}
 if(start===724){status='未实现';missing='CONFIRMED：052真实HTTP runtime模型已回复，subscribeEvents在30秒后done且零事件；生产handleOpenCodeEvent只转SessionRegistry，Adapter队列仅有pushEvent/simulateEvent注入。缺失生产事件桥接；不否认本地翻译器已有实现。';}
 if(start===518){status='证据不足';missing='057只读探针：真实需求Candidate的REQ-001至REQ-006被正式Requirements核心校验器识别为不合规；并非正式Gate运行。当前不能用Agent自述或doc_lint通过替代本条完整Requirements+Workflow Gate闭环。';}
 if(start===1563){status='未实现';missing='CONFIRMED：已部署TDD/Executor消费者仍要求执行D18禁止的测试；全局/其他Agent与旧tool_lib存在Trace/权威路径漂移；sf-design要求写trace_delta而Runtime owner为sf-task-planner，真实调用已拒绝。详见review.md三个消费者缺口及源码/部署/会话证据。';}
 if(start===544){status='未实现';missing='CONFIRMED RUNTIME_DEFECT：067真实封存拒绝包含正确README既有/业务源码不存在的说明；068隔离夹具排除错误绑定等干扰，准确事实对照通过，带范围限定或仅引用术语greenfield的正确说明均被关键词规则误判。未声明封存其他子要求全部缺失。';}
 rows.push({id:`SPS-${section}-L${start}`,section,line:start,requirement:text,status,evidence:group,scope:catalog[group].limit,missing});}
for(let i=0;i<lines.length;i++){const l=lines[i];if(/^\s*(```|~~~)/.test(l)){flush();fence=!fence;continue;}if(fence)continue;const h=/^#+\s+(\d+(?:\.\d+)?|Appendix)\b/.exec(l);if(h){flush();section=h[1];continue;}if(/^#/.test(l)){flush();continue;}if(!l.trim()){flush();continue;}if(/^\s*(- |\d+\. )/.test(l)){flush();start=i+1;buffer=[l];continue;}if(!buffer.length)start=i+1;buffer.push(l);}flush();
const machine=JSON.parse(lines.slice(lines.findIndex(l=>l.includes('SPECFORGE_RELEASE_AUTHORITY_ITEMS:START'))+2,lines.findIndex(l=>l.includes('SPECFORGE_RELEASE_AUTHORITY_ITEMS:END'))-1).join('\n'));
const releaseRows=machine.itemGroups.flatMap(g=>g.ids.map(id=>({id,classification:g.classification,requiredSurfaces:g.requiredSurfaces,status:'已实现',scope:'仅当前发布集合分类/表面一致性，非业务功能完整性',evidence:'021-release-precheck'})));
const data={utc:new Date().toISOString(),spec_sha256:hash(fs.readFileSync(spec)),method:'逐个正文段落/编号/项目符号保留原文及行号；代码/目录示意由相邻条款解释；18.1全部机器ID单列；已实现只指所列实现和验证范围。未完成真实链不得据此宣称整体符合。',catalog,rows,releaseRows};
fs.writeFileSync(path.join(out,'clause-matrix.json'),JSON.stringify(data,null,2));fs.writeFileSync(path.join(out,'source-evidence.json'),JSON.stringify(snapshots,null,2));
const esc=s=>s.replaceAll('|','\\|').replaceAll('\n',' ');
let md='# SPS 逐条证据矩阵\n\n'+data.method+'\n\n';for(const [id,e]of Object.entries(catalog))md+=`- **${id}**：${e.sources.map(s=>`[${path.basename(s)}](D:/code/SpecForge/${s})`).join('、')}；原始运行 ${e.runs.join(', ')}。${e.limit}\n`;
md+='\n|条款|判定|原文|证据与界限|\n|---|---|---|---|\n';for(const r of rows)md+=`|[${r.id}](D:/code/SpecForge/${spec}:${r.line})|${r.status}|${esc(r.requirement)}|${r.evidence}；${esc(r.missing||r.scope)}|\n`;
md+='\n发布机器投影逐ID见 clause-matrix.json.releaseRows，不将“在发布集合内”混为“业务已验收”。\n';fs.writeFileSync(path.join(out,'clause-matrix.md'),md);
console.log(JSON.stringify({clauses:rows.length,counts:rows.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),releaseItems:releaseRows.length,sourceFiles:Object.keys(snapshots).length}));



