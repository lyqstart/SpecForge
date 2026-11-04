# 隔离验证方案取证与裁决准备

EXECUTION_MODE=CODEX_DIRECT
RUN_ID=CODEX-SF-20261104-VERIFICATION-ISOLATION-PROPOSAL-A01
EXECUTION_ATTEMPT_ID=CODEX-SF-20261104-VERIFICATION-ISOLATION-PROPOSAL-A01-01
EXPERIENCE_FILE_READ=YES
ACTIVE_EXPERIENCE_RULES_FILE_READ=YES
HISTORICAL_LEDGER_SEARCH=D18, shell boundary, verifier execution; matched ERR-1877..1882, ERR-1890/1891, ERR-1904/1908/1911/1912 and EXP-285/287.
APPLICABLE_EXPERIENCE_RULES=EXP-001,EXP-002,EXP-004,EXP-006,EXP-007,EXP-008,EXP-017,EXP-032,EXP-038,EXP-050,EXP-060,EXP-086,EXP-161,EXP-181,EXP-188,EXP-193,EXP-261,EXP-264,EXP-276,EXP-282,EXP-284,EXP-285,EXP-287,EXP-289
PRIOR_FAILURE_RECONCILIATION=PASS
BACKFILLED_ERROR_IDS=ERR-1913
UNRECORDED_FAILURES=0
REPEATED_ERROR_CHECK=PASS

用户本轮原话“继续”。Bootstrap READY，main/local/live remote 同为 bb7780cc，工作区初始干净。完整重读五份 REQUIRED_RULES，活动规则350行分块、SPS450行分块覆盖到EOF。初始取证显示截断、CIM访问限制和PowerShell只读探测语法失败均登记ERR-1913；不作为产品测试结果。

目标：以真实源码、安装字节、原 WI 状态、主机只读探测和官方一手资料形成具体有限隔离验证方案，展示责任归属、首期范围、输入/输出和失败恢复、攻防验收、部署消费者及原Task兼容问题，再取得真实产品裁决。当前SPS/Registry D18不改，业务测试不运行。不得把“继续”改写为对尚未展示方案的批准。

本阶段允许写：本目录、唯一 docs/project-status.md、必要失败账本、该证据根的 .gitattributes 字节保留规则，以及本地维护分支/Git发布记录。禁止写核心源码、包装器、Agent/Skill、Installer、SPS/Registry及原项目业务/治理真相源；只读 sf_state_read 的正常Runtime派生投影/审计属于已申报观察者效应。无隔离进程、无新增系统组件、无AppContainer profile/ACL/注册表变更、无用户凭据读取；不访问t2/t3。

写入四类：TRUTH_SOURCE_WRITES=NONE；REPOSITORY_TRACKED_WRITES=上述文档/证据范围；RUNTIME_OBSERVER_WRITES=正式只读状态加载的派生投影与daemon审计、只读主机探测自身系统观测；EXTERNAL_EVIDENCE_WRITES=当前根。原项目没有测试/状态推进/权限放行，旧649份封存证据不改写。

停点：READY_FOR_PRODUCT_ISOLATED_VERIFICATION_DECISION。方案属于提案，不是产品权威，不据此启用任何执行器。必要裁决的依据是 Registry §6 的“产品负责人明确决定→更新 Product Specification→…→实现”，以及 SPS §9.2 / D18 和当前 NEXT_LEGAL_ACTION。已有分支名和 Candidate 决定继续有效，不重复索要。
