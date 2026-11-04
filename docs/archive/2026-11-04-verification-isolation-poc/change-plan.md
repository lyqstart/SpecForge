# 有限隔离能力：正式合同与合成原型

EXECUTION_MODE=CODEX_DIRECT
RUN_ID=CODEX-SF-20261104-VERIFICATION-ISOLATION-POC-A01
EXECUTION_ATTEMPT_ID=CODEX-SF-20261104-VERIFICATION-ISOLATION-POC-A01-01
EXPERIENCE_FILE_READ=YES
ACTIVE_EXPERIENCE_RULES_FILE_READ=YES
APPLICABLE_EXPERIENCE_RULES=EXP-001,EXP-002,EXP-004,EXP-006,EXP-007,EXP-008,EXP-017,EXP-032,EXP-038,EXP-050,EXP-060,EXP-082,EXP-086,EXP-145,EXP-161,EXP-181,EXP-188,EXP-193,EXP-261,EXP-264,EXP-276,EXP-282,EXP-284,EXP-285,EXP-287,EXP-289,EXP-290
HISTORICAL_LEDGER_SEARCH=LPAC,AppContainer,隔离,P/Invoke,指针,D18; EXP-145/261/285/287; ERR-1877..1882,ERR-1890/1891,ERR-1908,ERR-1913
PRIOR_FAILURE_RECONCILIATION=PASS
UNRECORDED_FAILURES=0
REPEATED_ERROR_CHECK=PASS

用户明确批准 proposal-001 的有限方案，先完成隔离验收。新阶段不改变执行模式。Bootstrap READY，初始 main/origin/main=45b256795b02eb732e0b8191b54e03be1af0c61e，工作区干净；创建 codex/verification-isolation-poc exit0。五份规则沿用同一会话已完整分块读取的覆盖证据并重新核验原始哈希；不是声称只看哈希即可首次完整读取。之前输出载体截断不计入新覆盖，重新以小块获得完整 Bootstrap/提案。

先将 D20 写入 SPS/Registry、冻结从属合同和合成矩阵，再编译第一方 x64 launcher。原型仅在自有合成输入运行固定 Node；先证明无应用文件写权限的最小 LPAC 是否能启动，再做攻防与进程生命周期。每个真实运行独立 SID/profile/Job，不修改现有系统/业务 ACL，不读真实凭据。权限不够即保留结果，禁止扩大 capability 或普通进程降级。若最小配置失败且缺少合法修复路径，以具体证据停在能力缺口；不得宣称全部验收通过。

写入四类：TRUTH_SOURCE_WRITES=仅 SPS/Registry 正式产品合同与唯一 project-status；不写业务 .specforge。REPOSITORY_TRACKED_WRITES=本根、产品合同、从属设计、packages/daemon-core/src/verification/windows/**、相关 scripts/tests、必要失败账本、.gitattributes。RUNTIME_OBSERVER_WRITES=编译器/系统启动观测、本次新建 owner 标记 profile 及合成隔离资源（需逐次回执和清理）；没有原业务执行。EXTERNAL_EVIDENCE_WRITES=本根命令四件套/原始回执/快照。

停点：SYNTHETIC_ISOLATION_ACCEPTED 或 CONCRETE_ISOLATION_CAPABILITY_GAP。先验收隔离；生产工具、Gate消费者、安装发布和原 WI 不是本阶段已完成项。保存原 WI、f5fed085、PSV-0002及撤销权限事实，不重复审批，不合并业务main，不访问t2/t3。
