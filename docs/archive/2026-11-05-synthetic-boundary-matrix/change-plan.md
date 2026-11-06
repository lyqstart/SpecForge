# 剩余合成隔离验收

EXECUTION_MODE=CODEX_DIRECT
RUN_ID=CODEX-SF-20261105-SYNTHETIC-BOUNDARY-MATRIX-A01
EXECUTION_ATTEMPT_ID=CODEX-SF-20261105-SYNTHETIC-BOUNDARY-MATRIX-A01-01
EXPERIENCE_FILE_READ=YES
ACTIVE_EXPERIENCE_RULES_FILE_READ=YES
APPLICABLE_EXPERIENCE_RULES=EXP-002,EXP-004,EXP-007,EXP-008,EXP-017,EXP-038,EXP-060,EXP-082,EXP-145,EXP-193,EXP-260,EXP-261,EXP-285,EXP-287
HISTORICAL_LEDGER_SEARCH=LPAC/registryRead/子进程/管道；ERR-1914..1919及以上EXP
REPEATED_ERROR_CHECK=PASS

初始Bootstrap READY/CLEAN，main/local/remote=53bf7d6c33575d765b2bc23805f32e8d5d34ac6c。五REQUIRED_RULES沿用同一会话已完整读取覆盖并核验相同raw哈希，本轮重新读取协议、D20/D21正文及从属合同；没有以哈希宣称新全文读取。

CONFIRMED：上阶段仅有固定内联正例和一个假注册表键拒绝；原文件入口和默认stdio pipe失败。能力为PARTIALLY_SUPPORTED。责任为未发布Execution Producer及其隔离/回执/恢复合同，不是业务Executor。真实架构为C#挂起创建/实际token与Job核验→固定Node→唯一owned夹具→owner原始回执/宿主对账。没有public Tool、daemon wiring、安装器或原WI执行路径。

先冻结P01/A01/A02的父/子/孙固定Node内联探针：node:test实际断言、输入正控制、假凭据读拒绝、input/runtime/profile/temp写拒绝；由宿主从Job PID清单独立检查后代token/SID/capability与Job。使用继承std句柄，保持同一registryRead/LPAC/只读文件边界、32进程/1GiB/输出各1MiB，显式20s墙钟。所有新路径先记录唯一Attempt归属，源/输入/Node/launcher先冻结；宿主假值不传应用。失败未知不得通过；有可验证同边界修复时保留原失败、先修复再新Attempt，不增capability/现有ACL。

随后按证据逐项处理别名、私有注册表、loopback/外部网络、COM/WMI/native breakaway、资源/取消/launcher与daemon中断恢复。每项先冻结具体夹具/正控制/原始判据；不把待执行列表当已验收。D21采用进生产仍需完整证据后的独立具体裁决，用户“继续”不代替该决定。

TRUTH_SOURCE_WRITES=唯一project-status；REPOSITORY_TRACKED_WRITES=现有未发布合成helper及必要新增helper/说明、从属合同、经验/.gitattributes；RUNTIME_OBSERVER_WRITES=编译及独立新owned profile/input/runtime/shadow夹具、Job/进程、必要同边界新假键/loopback与清理；EXTERNAL_EVIDENCE_WRITES=本根全部原始命令/源二进制/资源/结果。

停点仅为完整合成矩阵结果及产品采用所需具体决定，或有证据支持且同边界无法恢复的HardStop/权限或合同冲突。不得因普通容量、部分检查通过或可修复载体失败停为产品完成。原业务/部署156身份复核、资源清理与证据封存为阶段收尾必需；t2/t3不访问。
