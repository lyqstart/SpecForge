# 已批准分支恢复与原 WI 实施检查点

本阶段已完成受控 Git 能力扩展、正式部署，并在原会话落实用户选择的 `main + codex/greet-library-wi-0001`。原 WI 的五个业务文件已受控提交，代码权限已收回。**业务测试没有执行，不能声称已验证可运行或 WI 已完成。**

## 已证实的结果

| 对象 | 事实 | 一手证据 |
|---|---|---|
| Candidate 批准 | 用户原话“批准”由正式 Recorder 记录为 UD-WI-0001-1793717210435 | formal-native-events.json、original-audit-approved-merged.json |
| 规格合并 | 九项成功、零失败；PSV-0001 → PSV-0002；post_merge_gate attempt-0006 passed | 原 merge_report、WAL、正式 StateManager；0004、0074、0075 |
| Git owner 扩展 | SPS §9.2 / Registry D19；源码提交 cf94aa7d7e7a04f1bfd97e34a8b1833accc1b89c | 真实源码、source-before-milestone.json、Git |
| 产品验证与部署 | 63/63 回归；四个真实进程中断恢复合同通过；类型、工作区构建、发布 precheck 通过；112 安装文件通过；六资产字节一致 | 0027、0030～0034、0042、0048、0051 |
| 两条新分支 | 用户精确原话绑定计划 f7c1fe5dfe60741054b396cc7fb906aa990d05c2b902aa644dd25c876cf649ca；初始均在 8a692e88c0823984647622294f5199c18bb0c587，HEAD/context 正确，索引和业务字节保持写前值 | 0055、0059、branch-verification.json |
| 业务代码 | 四个新文件及 README 追加；实际专业 Executor 写入；README 缺后缀问题经真实 Reviewer 指出、专业 Executor 修正 | 原生只读/写入工具记录、0062/0068/0072、final-original-observation.json |
| 代码提交 | 受控 sf_git_checkpoint_commit 创建 f5fed085a8609f593592eca5e8035b2d1c958759，只含批准五文件；父提交为原 8a692e88；业务 main 仍是原提交 | 0069、0072、0075；实际 Git commit/tree/raw blobs |
| 权限及状态 | 正式 owner revoke；code_change_allowed=false、code_permission_revoked=true；真实状态仍 implementation_running | 0070、0071、0074 |

最终业务文件为 `README.md`、`package.json`、`tsconfig.json`、`src/greet.ts`、`tests/greet.test.ts`。0075 独立逐字节确认 README 前123字节与分支恢复前完全一致，完整业务文件清单恰五条，提交对象与当前五文件原字节一致。此为文件与 Git 对象取证，不是执行原声明的测试或行为验证。

## 尚未取得的验收证据

- Task-001～004 已有代码和静态观察；原声明命令的真实退出码证据没有取得，不能称全部 Done When Evidence 满足。
- Task-005 的 `node --test`、动态导入 e2e 和 Node 版本/降级判定均 `not_executed`；当前 D18 没有合法的业务脚本、解释器、构建或测试执行路径。
- 没有推进 implementation_done / review_done / verification_done，没有 Formal Version、semantic closure 或 Close；业务分支没有合并或推送至业务 main。
- 修正前 Reviewer 的 request_changes 与后续修订原件保留；没有伪造修正后正式全阶段 review/verification 通过报告。
- 整体 SPS 符合性、历史项目丢失根因以及所有旧 Git 工具的外部回调隔离均不能据本阶段局部成功推定。原现场丢失根因仍为 INSUFFICIENT_EVIDENCE。

后续须先由产品权威明确一种合法、受控且可审计的业务验证执行能力；D18 在正式改变前持续有效。保留同一 WI、PSV-0002 和 f5fed085 检查点，从真实断点恢复，取得运行证据后再走正式验证/关闭流程。不得让用户或外部 Codex 换执行器运行命令代替能力建设。默认主线 Git Merge 仍需其独立确认。

## 失败与证据解释

全部失败原文保留，分类见 ERR-1903～1912。新入口的 Windows null device、HEAD 同提交符号绑定竞争、clean filter 回调与 Schema 闭包类型问题均先复现再修正验证；既有指导测试漂移用精确 b09edc26 对照重现。最终回归没有放宽断言。

两次受保护哈希工具调用被拒：第一条产生一个 Write Guard blocked 记录和 HS，第二条在 HARD_STOP_ACTIVE 前置拒绝。最终 Changed Files Audit 因此准确报告一个 guard blocked、一个 resolved、零 unresolved；两次工具拒绝仍完整保留，不冒充历史零拒绝。专业交接缺参、绝对路径静态检查失败和短暂限流也保留，不转写为通过。模型自填时间、duration 和完成自述不作为实际执行时序或验收证明。

写入分类：TRUTH_SOURCE_WRITES 为原生专业 owner 的决策、规格合并、Git计划/context、Code Permission、交接与审计/收尾日志；业务五文件和 Git checkpoint 均走正式许可工具。REPOSITORY_TRACKED_WRITES 为本次产品合同、owner、包装器、指导、测试、经验和唯一状态文件。RUNTIME_OBSERVER_WRITES 为 OpenCode 会话、daemon 日志/派生投影及自有测试夹具。EXTERNAL_EVIDENCE_WRITES 为本目录回执与只读副本。外部取证未直接修改原项目真相源；没有读取 t2/t3，没有覆盖旧封存阶段。
