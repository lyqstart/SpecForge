# Winsock 启动失败只读诊断

EXECUTION_MODE=CODEX_DIRECT
RUN_ID=CODEX-SF-20261104-WINSOCK-DIAGNOSIS-A01
EXECUTION_ATTEMPT_ID=CODEX-SF-20261104-WINSOCK-DIAGNOSIS-A01-01
EXPERIENCE_FILE_READ=YES
ACTIVE_EXPERIENCE_RULES_FILE_READ=YES
APPLICABLE_EXPERIENCE_RULES=EXP-001,EXP-002,EXP-004,EXP-006,EXP-007,EXP-008,EXP-017,EXP-032,EXP-038,EXP-050,EXP-060,EXP-082,EXP-145,EXP-161,EXP-181,EXP-188,EXP-193,EXP-261,EXP-264,EXP-282,EXP-284,EXP-285,EXP-287,EXP-289
HISTORICAL_LEDGER_SEARCH=WSAStartup,ERR-1913/1914/1915,调试器,DebugActiveProcess,WaitForDebugEvent; EXP-145/193/261/285
PRIOR_FAILURE_RECONCILIATION=PASS
UNRECORDED_FAILURES=0
BACKFILLED_ERROR_IDS=ERR-1916
REPEATED_ERROR_CHECK=PASS

用户继续同一目标，继承D20有限方案授权，不重复审批。Bootstrap READY，main/local/remote=54b6688275af9840175dcf282ad48fde33a797f8，工作区干净。新维护分支codex/winsock-isolation-diagnosis。当前同一会话中已完整读取的活动规则和从属治理规则原始字节不变；先前SPS/Registry D20新增正文已完整读取，本轮再读当前D20及完整LPAC合同。覆盖来源与哈希核验写入authorization；不把摘要或局部读取冒充首次全文。

CONFIRMED：原型真实token有效权限核验后恢复固定Node，在WSAStartup10107处非零退出；不能从错误码断言哪一项权限缺失。第一责任层为Execution Producer的隔离运行兼容性；D18只读执行不改。旧245成员、原业务与部署基线先核验。已存在debugger/Procmon未在PATH发现，仅证明这一发现范围。

本轮先冻结诊断工具：保持原合成正例、Node指纹、零capability、只读profile/runtime/input、最小环境与Job；只新增DEBUG_ONLY_THIS_PROCESS观察。读取新合成进程内存里的系统调用对象名和返回码，不读原业务/真实凭据值，不替应用取得权限。通过硬件断点/线程上下文观察NtOpenKey、NtOpenKeyEx、NtCreateFile及返回；不改Node/系统DLL代码字节。调试影响时序且可被应用感知，因此结果仅作诊断，不能当作未调试隔离验收；不补写此前passed。仅调试本轮新创建的合成PID，不附加其他用户/daemon进程，不安装调试驱动或启用SeDebugPrivilege。

验证先于结论：固定输入和实际token/Job回读；诊断记录含UTC/API/对象名/访问掩码/实际NTSTATUS；从内存解析名字必须边界/长度检查，根句柄解析失败保持未知。不记录注册表值或应用密钥。调试事件、线程上下文和模块身份逐项检查；任何采集失败保存非零结果，终止并回收自有Job/profile。恢复前的普通AppContainer对照仍不执行代码。

拟修改面仅现有未发布合成launcher、独立诊断helper/说明、唯一project-status、本根证据、必要失败账本及.gitattributes。无需安装器/模板同步：该诊断资产不注册/打包/部署；不是产品能力交付。没有SPS扩权、公开工具、角色代理、原业务输入或业务状态推进。

写入四类：TRUTH_SOURCE_WRITES=仅唯一project-status；REPOSITORY_TRACKED_WRITES=上述未发布诊断源码/说明/经验/属性；RUNTIME_OBSERVER_WRITES=本轮自有合成profile/副本、只读ACL设置、硬件调试寄存器和调度影响以及清理，不修改已有系统/业务ACL；EXTERNAL_EVIDENCE_WRITES=本根命令四件套/原始管道/源与二进制/诊断trace。

停点：DENIED_RESOURCE_IDENTIFIED 或 DIAGNOSTIC_EVIDENCE_INSUFFICIENT，并形成是否存在同合同修正的判断。若确需更宽capability/可写资源/另一后端/系统设置，停止在具体差异，先形成可审阅方案；本轮“继续”不是扩权。无通过的完整矩阵就不接产品/业务。
