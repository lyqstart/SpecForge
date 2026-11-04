# 有限隔离合成验收：停在已证实的启动缺口

RESULT=CONCRETE_ISOLATION_CAPABILITY_GAP
ISOLATION_ACCEPTANCE=NOT_ACCEPTED
BUSINESS_TESTS_EXECUTED=NO
PRODUCT_EXECUTION_ENABLED=NO

用户已明确批准有限方案，不再等待同一决定。SPS §9.2.1 / Registry D20 与从属合同先于原型写入，规定零扩展 capability、无应用文件写权限、真实 LPAC/Job、先合成验收后接业务。已有 sf_safe_bash、部署和业务权限均未放宽。

## 已确认事实

| 事实 | 一手证据 | 证明范围 |
|---|---|---|
| 原型可编译为固定x64资产 | 0004/0007/0010，builds两个源/二进制快照 | 编译成功；不是安全验收 |
| 新profile/input/runtime的DACL收紧后回读；无扩展capability | 0012及对应attempt/events.jsonl | 本次设置与token事实；尚未运行恶意文件写探针 |
| 实际普通AppContainer与LPAC权限区分成立 | 0012的实际token/SID和六项AccessCheck，对照未恢复即终止 | LPAC忽略AAP权限的本机语义；class46仍返回87，不伪造查询值 |
| LPAC恢复后Node正例失败 | 0012，application_exit_code=2147483651；原始stderr.bin含WSAStartup10107，stdout为空 | 此冻结Node/本机/零capability配置未能执行正例；不证明所有LPAC方案失败 |
| Job清空且profile删除 | 0012的job_empty active0、profile_cleanup0；0017宿主独立查询对应PID均缺失、profile不存在 | 此次正常失败回收；不冒充崩溃/孤儿/进程树验收 |
| 原业务和已有部署未漂移 | 0018的156项身份比对，unaffected-verification.json | 五业务文件、原治理字节/事件、现有源码模板与安装文件；原提交仍f5fed085，代码权限撤销 |

原始Node指纹3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237；0013实际宿主版本查询v24.19.0。执行始终使用副本，未读取原项目输入。阶段没有业务Node/test、公开新工具、Gate接线、安装或daemon重启。

## 未证明的内容和责任归属

Capability判断：现有D18内部只读为SUPPORTED；本次拟新增的固定Node隔离执行为PARTIALLY_SUPPORTED（挂起创建/权限核验可用，但正例不能启动），尚不能形成合法业务闭环。责任仍在隔离Execution Producer/运行时兼容层，不能交给Executor换命令或绕过工具。

CORROBORATED：所测v24.19.0的上游libuv初始化源码调用WSAStartup，失败走fatal路径，与本次stderr相符。未独立证明该二进制与上游源码构建等同。INSUFFICIENT_EVIDENCE：到底哪一个系统资源导致10107，是否有不扩大本合同权限的可行修正。不能仅据错误码断言必须增加网络或registryRead capability，也不能称这些权限为已验证修复。

P01失败；A01/A02/A03/L01/L02/L03未完成，I01/D01未进入。私有注册表、恶意父/子/孙、宿主路径别名、网络、COM/WMI/breakaway、限额、中断恢复均没有通过结论。matrix-result.json必须保留NOT_ACCEPTED，不能用正常启动失败后的清理结果替代整行生命周期验收。

## 下一合法动作

停在本阶段声明的CONCRETE_ISOLATION_CAPABILITY_GAP。后续先只读定位Winsock启动所需且被拒绝的具体资源，形成与D20逐项比较的最小差异；在证明同合同修正前，不盲重跑。若确需扩展capability、可写资源或另一后端，先提交具体可审阅变更及验证计划供新的产品决定；当前没有执行这些扩权。原用户授权仍有效，不重问Candidate/分支或本次有限方案。

保留原WI/PSV-0002/f5fed085、implementation_running与撤销代码权限。不推进implementation_done、verification_done、Formal Version、Close或业务main合并。后续仍须先通过真实隔离验收，再生产接线/共同消费者/安装验证，最后恢复原WI。

## 失败与证据卫生

0003旧csc相对正斜杠路径、0005未引号Node路径、0006重复SetOwner的ACL初始化失败、0008class46查询假设、0012真实Node启动失败，全部保留为非零。0015执行策略拒绝及0016UTF-8读取错误也保留；唯一观测载体替代为同一静态只读cmdlet的内联，不改系统策略。ERR-1914/1915记录归因和实际修正。早期命令展示有代码页替换，中文原始错误以attempts的UTF-8 events和原始管道bin为准；从0018增加命令原始管道字节。

TRUTH_SOURCE_WRITES=正式SPS/Registry及唯一project-status；没有业务真相源写入。REPOSITORY_TRACKED_WRITES=上述合同、未发布原型、经验及本根证据/.gitattributes。RUNTIME_OBSERVER_WRITES=编译输出、自有合成副本、3个新profile的创建/收紧/删除及系统启动观察；现有业务/系统ACL未改。EXTERNAL_EVIDENCE_WRITES=本根不可覆盖回执/快照/封存。没有读取真实凭据、开启系统功能或安装其他后端。
