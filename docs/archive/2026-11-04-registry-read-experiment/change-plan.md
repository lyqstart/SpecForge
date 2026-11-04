# D21 单capability合成实验

EXECUTION_MODE=CODEX_DIRECT
RUN_ID=CODEX-SF-20261104-REGISTRY-READ-EXPERIMENT-A01
EXECUTION_ATTEMPT_ID=CODEX-SF-20261104-REGISTRY-READ-EXPERIMENT-A01-01
EXPERIENCE_FILE_READ=YES
ACTIVE_EXPERIENCE_RULES_FILE_READ=YES
APPLICABLE_EXPERIENCE_RULES=EXP-001,EXP-002,EXP-004,EXP-006,EXP-007,EXP-008,EXP-017,EXP-032,EXP-038,EXP-050,EXP-060,EXP-082,EXP-145,EXP-161,EXP-181,EXP-188,EXP-193,EXP-261,EXP-264,EXP-282,EXP-284,EXP-285,EXP-287,EXP-289
HISTORICAL_LEDGER_SEARCH=registryRead,WSAStartup,假凭据,ERR-1914/1915/1916; EXP-145/193/261/285
PRIOR_FAILURE_RECONCILIATION=PASS
UNRECORDED_FAILURES=0
BACKFILLED_ERROR_IDS=ERR-1917,ERR-1918
REPEATED_ERROR_CHECK=PASS

用户精确批准“批准仅合成实验”。Bootstrap READY，初始main/local/remote=5bee5e5144ad02f9281f363db5dfd4d032ddfb29，工作区干净；独立维护分支codex/registry-read-experiment。先核验旧266个封存成员和批准提案/正式规则原始哈希。同一会话已完整读取的规则保持相同字节，完整读取当前提案和D21候选正文；沿用原覆盖而非以摘要/哈希冒充新全文。

先将已审阅D21候选原始字节写入SPS/Registry并读回，再开发合成launcher。独立实验profile仅恰好1个registryRead，SID由系统派生且实际token集合逐项核验。无网络/COM/广泛文件/第二capability，无应用文件写权限，不改已有系统或业务ACL，不访问真实凭据，不运行原WI或注册生产工具。当前责任是隔离Execution Producer的启动依赖，已知Winsock注册表读取拒绝，不把capability名称当作安全证明。

先运行未调试S01，固定Node/输入/环境/只读ACL/Job，保留真实退出码。不能启动则停在失败，不加第二项权限；成功后才进入固定假哨兵检查：自有新键HKCU/Software/SpecForgeIsolationCanary-<nonce>与影子文件、私有profile/input/runtime写拒绝；父/子/孙同边界；自有loopback哨兵只验证拒绝，不探外网。不得向应用提供假凭据原值，owner在外部独立比较原始输出和哨兵字节/键值。系统reg.exe若不能以安全正控制证明真实可用，该注册表检查保持未知而不算拒绝成功。

文件/注册表夹具仅创建本轮owner标记、碰撞即停的新资源，不修改已有键/ACL；新假值非真实凭据。原始回执、计划、Node/launcher/输入/能力和预算身份运行前冻结。任何宿主假凭据可读写、应用文件写、网络通达、token异常或残留立即不通过，不升级权限。stdout/stderr各1MiB、120s、32进程/总提交1GiB；完整Job结束和宿主独立PID/profile对账后，仅回收归属可证资源。

TRUTH_SOURCE_WRITES=SPS/Registry D21、必要从属合同和唯一project-status；不写业务真相源。REPOSITORY_TRACKED_WRITES=未发布合成源码/README、本根/.gitattributes、必要失败账本。RUNTIME_OBSERVER_WRITES=自有合成profile/只读副本/假哨兵键与文件/临时loopback监听及回收，不改系统功能、SeDebugPrivilege或原业务。EXTERNAL_EVIDENCE_WRITES=本根不可覆盖命令/原始字节/构建快照/独立复核。

唯一状态的ALLOWED_SCOPE显式登记已在Registry注册的docs/design/windows-lpac-node-readonly-contract.md，用于本次已授权D21从属合同同步；不改变SPS权限边界。实际未创建文件/loopback夹具，因为R01未知后即停止，最终写入按原始结果归集。

停点：SYNTHETIC_EXPERIMENT_RESULT_RECORDED（启动失败、边界拒绝、未知或当前合成检查通过均如实记录）。不因局部成功进入产品/部署/原WI；生产采用需按D21与完整隔离矩阵另行裁决。原审批/分支决定不重复，D18保持只读，无业务main合并。
