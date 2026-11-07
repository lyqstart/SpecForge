const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),status=path.join(root,'docs/project-status.md'),ledger=path.join(root,'docs/rule/specforge-development-error-ledger-and-experience.md');
for(const n of ['0310','0316','0317','0320','0321'])assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname,'commands',n+'.result.json'))).inner_exit_code,0);
const extra=`
### ERR-1997：Evidence工具描述遗漏受控名称规则，独立来源表述与D23直接回执引用冲突

- 0294真实Aggregator连续12次传入.json/.md/无扩展名，被现有Runtime命名判据拒绝，未写入这些文件。0296冻结5份旧消费者源码并直接核验实际正则；D23的独立执行源已是私有认证receipt，不要求复制成verification_evidence。修复Tool/Agent/Skill/从属合同的名称及直接引用说明，不放宽Runtime写边界。0297真实producer两项通过。EXP-004/007/008/026/287。

### ERR-1998：Verifier清单示例使用别名而缺少基本Schema必填字段

- 0305真实请求是合法JSON，但22条entry缺少type；现有Agent示例只有artifact_type/id/location/timestamp，不能替代evidence_id/type/path/created_at。修复当前示例并解释物理type与语义evidence_type的区别，不由Runtime补造字段。0306生产双Schema示例回归2项通过；0317独立检查实际专业产物及22个正式命令主体一致，不能据此宣布完整Gate通过。EXP-004/007/022/025/026。

### ERR-1999：30秒客户端超时被误当作owner产物未写入

- 0310从原始Dispatcher响应与规范文件证明：Evidence Manifest实际30157ms成功、Verification Report实际33511ms成功；真实客户端30秒截止后owner仍完成，两份字节与哈希被不可变保存。内部耗时分解仍INSUFFICIENT_EVIDENCE，不归因为未经测量的具体子步骤。
- 共同验证消费者客户端改用有界180秒且不自动重发，超时/断连返回结果unknown并要求只读对账；握手失败仍是已知请求前失败，owner明确拒绝原样保留。实际四个工具保留完整SDK上下文并由共享客户端过滤，普通产物沿原路径。原生120秒、隔离、MAC、新鲜度与Gate判据均未放宽。0312七项回归、0316上下文/示例14项、0320完整51文件748项通过。当前用户安装仍1.0.22，修复尚未部署。EXP-004/007/008/017/031/298。

### ERR-2000：新测试未进入Git发现库存及旧上下文检查器未消费共享路由

- 0313注册表检查拒绝两个尚未跟踪的新测试；0314只暂存这两个已冻结测试后进入实际库存。0315完整集747通过、1项失败，首次偏离为静态上下文检查器只识别直接daemon.invokeTool，不识别新的共享消费者调用。同步该消费者并在实际四工具路由回归中断言完整第三参数及HTTP项目上下文；没有删除上下文要求。0316与0320通过。EXP-004/007/008/022/031。

### ERR-1990 / ERR-1992 补充：恢复取证仍重复输出巨型JSON及猜测尚不存在的stdout

- 本轮恢复直接打印含工作树全量清单的0320/321 receipt和活动规则导致展示截断，不能计作完整读取；原会话已完成的前置全文读取不被这些截断替代。随后仅投影数值退出/目的/UTC及最终测试摘要，确认0320为51文件748项通过、0321为33路径版本提交身份核验通过。读取活动0319尚不存在的stdout产生ENOENT，未改变现场。0322受限本机fetch TypeError后0323同一只读观察在已授权宿主成功；不把受限载体连接失败当作产品失败。后续先检查存在性并解析选定字段。EXP-007/008/021/193/296。
`;
let l=fs.readFileSync(ledger,'utf8');assert.ok(!l.includes('### ERR-1997：'));fs.appendFileSync(ledger,extra);
let s=fs.readFileSync(status,'utf8');const replace=(key,value)=>{const re=new RegExp('^'+key+'=.*$','m');assert.ok(re.test(s));s=s.replace(re,key+'='+value);};
replace('LAST_EXECUTION_CHECKPOINT','SPS8/action source6be12495 and1.0.23 metadata759cd2ff committed; source bindings0268/0321 verified. Current consumer guidance/schema-example/180s bounded HTTP reconciliation fix pending source commit;0316 related14 and0320 maintained51-file748-test regression passed. Original44 real successes:22 implementation+22 formal0298;0310 canonical professional Manifest/Report succeeded after30s client deadline,0317 typed/hash/22-selector inspection passed. Fresh authorized minimum-context R04 session0319 active;0323 semantic closure rejects weak or missing Task behavioral evidence, real Agent checking. Global117 managed files/Daemon remain1.0.22 old0208 assets, original code permission revoked. No full Gate/FV/Close or overall SPS acceptance.');
replace('LAST_COMPLETED_CHECKPOINT','Original approved PSV-0002 nine-artifact merge and post_merge_gate retained. All22 implementation and22 formal controlled executions complete with actual exit0/output/cleanup receipts. Professional Evidence Manifest and Verification Report exist and independently validate; semantic closure and downstream Gate/FV/Close still pending. Business main8a692e88 unchanged, code permission revoked; no business-main merge approval.');
replace('CURRENT_BLOCKER','ORIGINAL_SEMANTIC_CLOSURE_AND_FULL_GATES_PENDING;CONSUMER_FIX_SOURCE_COMMIT_AND1_0_23_NATIVE_BUILD_INSTALL_ACCEPTANCE_PENDING;SPS_FINAL_MATRIX_AND_PRODUCT_GIT_DELIVERY_PENDING');
replace('NEXT_LEGAL_ACTION','Monitor owned real R04 session0319 and read live authoritative state; reuse44 successful executions and successful professional artifacts, retain all prior refusals/timeouts. Resolve only actual semantic/Gate errors through legal owner; unknown transport outcomes require read-only reconciliation before retry. Do not replace global native assets while original receipts active. Review exact ALLOWED_SCOPE raw/parent/index bindings and commit tested consumer fix/status/ledger; then after original completion/legal stop rebuild/precheck/install/test1.0.23. Finish SPS matrix and authorized direct-main product Git delivery. Business-main merge still needs fresh concrete can_merge=true plan and separate user confirmation.');
fs.writeFileSync(status,s);console.log(JSON.stringify({utc:new Date().toISOString(),status_updated:true,ledger_appended:['ERR-1997','ERR-1998','ERR-1999','ERR-2000'],EXPERIENCE_FILE_READ:'YES',ACTIVE_EXPERIENCE_RULES_FILE_READ:'YES (earlier complete read; current truncated rereads excluded)',APPLICABLE_EXPERIENCE_RULES:'EXP-004/007/008/017/022/026/031/105/193/298',HISTORICAL_LEDGER_SEARCH:'ERR-1990..1996, EXP-105/193; current observed consumer failures',REPEATED_ERROR_CHECK:'PASS_WITH_REPEATS_RECORDED'}));
