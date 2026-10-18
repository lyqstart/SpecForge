# 六项验收发现问题的修复证据

RUN_ID=CODEX-SF-20261018-ACCEPTANCE-REPAIR-A01
EXECUTION_MODE=CODEX_DIRECT
EVIDENCE_ROOT=D:\code\SpecForge
BASELINE=eda482bb88152b82becdd4a951ecafdf6a46d518
USER_REQUEST=你开始修复

本文是执行历史证据，不是产品权威或第二当前状态。状态仅在 docs/project-status.md。

## 门禁与事实

Bootstrap READY，本地/远端 main 相等，原始工作树干净；当前分支 codex/acceptance-guard-audit-fixes，全部变更归本任务。新指令授权从先前等待验收进入修复阶段，执行模式保持 CODEX_DIRECT。

EXPERIENCE_FILE_READ=YES
ACTIVE_EXPERIENCE_RULES_FILE_READ=YES
APPLICABLE_EXPERIENCE_RULES=EXP-004,EXP-007,EXP-012,EXP-017,EXP-031,EXP-032,EXP-264,EXP-281,EXP-282,EXP-283
HISTORICAL_LEDGER_SEARCH=初始化、native write、changed files audit、close、日志和恢复；命中 EXP-264/281/282/283、ERR-1845/1846
REPEATED_ERROR_CHECK=PASS

此前完整读取的活动规则、产品规格、权威注册表及设计仍有效，入场活动规则 SHA-256 为 7bda7d8fdc89b0cddbc1187d9f610176f95f877d3c850edda3c976c47fac5050；本次补丁前并未把截断读取算作完整读取。

CONFIRMED：真实 OpenCode 初始化工具被误拦；原始 11 条/0 拒绝审计后出现第 12 条拒绝，Close 仍通过。来源为 D:/code/sf-acceptance-six-evidence/review-20261018-A01 的原始导出、1051 文件快照及 SHA-256 清单。完整会话共 22 个、482 次工具调用；业务测试独立重跑 31/31 通过。这些业务测试不能证明六项产品验收全通过。

INSUFFICIENT_EVIDENCE：原配置测试使用每次调用参数而非 accepted JSON；原日志测试使用 markdown 而非配置入口；模型能力、错误 HTTP 和浏览器项目测试尚缺真实目标环境验收。其原“通过”不沿用。

## 架构与变更边界

初始化：原生写前检查 → 精确受控工具注册 → HTTP Project Init owner。修复遗漏的独立 HTTP 注册，不放开任意 sf_* 或原生 shell。

审计与关闭：Write Guard / resolution / authorization 原始文件 → 审计绑定 → Verification 与 Close 同一新鲜度检查。新增记录后旧审计不能消费；未处置拒绝由审计 owner 建立 HardStop，经既有 resolver 正式放弃或处置后重新审计。Close 不再改写历史日志。历史误关闭由原 Close 事件时点与遗漏计数证明，在归档原始字节后使用既有补偿恢复 owner，不修改业务真相源。

能力判断：RUNTIME_DEFECT，复用现有 owner 并补齐消费合同。规格 §6.6/§9.2 同步。无新业务工作流或绕过治理工具。

TRUTH_SOURCE_WRITES：产品规格与唯一 project-status；未直接修改验收项目 .specforge。
REPOSITORY_TRACKED_WRITES：源代码、回归测试、产品版本、工程经验和本归档。
RUNTIME_OBSERVER_WRITES：测试临时夹具、测试缓存、编译/发布派生产物；部署时单独记录。
EXTERNAL_EVIDENCE_WRITES：当前无新增外部证据；原验收证据未覆盖。

## 测试记录

日志目录 `.tmp/acceptance-fix/`。初始新增测试 5/5、退出 0；现有定向测试首轮 64/65、退出 1，失败的正向夹具补写日志后未重生成审计，按新合同应当失效；保持断言强度，改为同代来源。加入完整 Close 处理器拒绝与补偿恢复测试后 27/27、退出 0（flow-tests.log）。未修改阈值或跳过失败用例。

完整验证、提交和实际安装证据将在完成后追加；当前不宣称交付完成或六项验收全通过。

首轮 Daemon 全量 1895/1897、退出 1：两个旧完整流程夹具在真实拒绝后手写零拒绝 PASS，已改为实际 Audit → HardStop resolution → Audit 工具链，定向 26/26 通过。第二轮 1896/1897、退出 1：历史拒绝去重测试错误使用事后写入时间作为原拒绝时间，改用原 HardStop.created_at；新增回归明确要求 resolution 不能覆盖之后的同路径新拒绝。全部原始失败日志保留。严格构建、三项发布类型检查和工作流同步均退出 0，具体 UTC 与输出在 check-*.result.json/log。

## 最终验证与交付

CONFIRMED：源码提交 1e47b08a5ee761f4ed6f927508468802a903a535；38 个文件的原始/当前字节、diff 和逐文件哈希已封存在 .tmp/acceptance-fix/source-review-01.json.gz，其 SHA-256 为 249e32a6272acb287e9f5f522428970b79bb350a24f44471f0af8f00994f2c4e，封存后复算一致。全量验证后已快进 main 并推送 origin/main，无 PR。

官方完整测试于 2026-10-18T08:35:42.6635325Z 开始、2026-10-18T08:42:29.5802384Z 完成，退出 0；共 6813/6813 通过。各组计数：725、2、197、226、2、47、375、903、134、1516、789、1897，依次为 root、version-unification、configuration、service-management、host-profile、observability、permission-engine、opencode-adapter、scope-gate、workflow-runtime、CLI、daemon-core。严格构建、三项发布类型检查、工作流检查、运行程序生成、提交绑定 release manifest 与 precheck 均退出 0。

CONFIRMED：升级前实际 1.0.14 PID 36576 对 sf_project_init 的写前检查拒绝；官方停止后旧 PID 退出。官方安装器仅更新两个二进制，109 个文件无变化；最终 verify 111/111。长期后台 PID 11640、端口 5594，独立 health=ok/1.0.15。两份安装 SHA-256 与 release 清单逐字相等，详见 user-runtime-after.json。插件字节未变，未声称本次完成新的 OpenCode 模型会话验收。

CONFIRMED：已安装二进制的实际 HTTP 回归通过，原拒绝的初始化现在允许，初始化幂等，未知工具和原生 shell 仍拒绝，未知路由 404、CAS 占位 501。将封存的 1051 文件验收快照逐字复制并逐文件核验至隔离目录，再用真实 HTTP ToolDispatcher 恢复 WI-0001：识别原关闭前漏审拒绝 → 不可变归档 → 补偿事件回到 implementation_ready → 审计失败并 HardStop → 正式放弃违规动作的 resolution → 新审计通过；原守护日志字节不变，代码权限保持撤销。此项不冒充原业务项目重验收。原项目 4 个业务文件及 events、work_item、write_guard_log、changed_files_audit 共 8 个文件前后哈希不变。原始请求/响应、临时夹具路径和哈希在 installed-after.json，未包含认证令牌。

执行纠正：首次启动遗漏 --detach，按正式 CLI 的默认前台模式持续运行（PID 2196），不是后台故障。该进程完成上述功能测试后通过正式 stop 退出，载体真实退出 0；随后使用 daemon start --detach --json 启动长期进程并重新核验 health、初始化及文件。保留前台日志与停止记录，未把“启动声明”冒充独立验证；一次提前读取尚未生成的结果文件失败也保留为执行诊断。

写入分类补充：正式 installer/CLI 仅更新用户级两个二进制、事务备份/manifest、handshake 和运行日志；测试产生 .tmp 初始化夹具及系统 TEMP 的验收快照副本，副本内治理写入均经正式工具；原验收项目状态及原始证据不被修改，t2/t3 未操作。

记录入口：.tmp/acceptance-fix/verification-summary.json 与全部原始 *.log、*.result.json、installed-*.json。另将该目录和本报告复制至 D:/code/sf-acceptance-six-evidence/repair-20261018-A01，生成逐文件 SHA-256 清单并自校验。外部副本只是封存证据，不是当前状态入口。

仍未证明：六项真实 OpenCode 验收整体通过。配置层级/稳定激活、日志秘密处理、外部真实模型能力及浏览器等缺口必须用正确入口补测；原错误 PASS 不沿用。原已关闭业务 WI 没有被自动重开。
