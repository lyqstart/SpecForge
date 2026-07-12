# sf-orchestrator 契约条款—当前代码实现—验证证据对应表

## 一、使用说明

本表以提交 `e900f3923df58250deda95299c116d2f1369e0a5` 为基线，并反映本替换包完成后的目标状态。

“强制层级”含义：

- **Runtime 强制**：代码会拒绝不合法操作；
- **Tool 强制**：对应权威 Tool 负责执行和封口；
- **Contract 强制**：Orchestrator 必须遵守，但 Runtime 不理解用户语义；
- **测试证据**：本次新增或保留的自动／独立验证。

## 二、对应表

| 编号 | 契约条款 | 当前代码实现 | 本次处理 | 验证证据 | 强制层级与裁决 |
|---:|---|---|---|---|---|
| 1 | 纯咨询、只读状态查询、使用说明不调用 `sf_project_init`，不创建业务 WI | Runtime 没有自然语言分类能力 | 在 Standard 和 `sf-orchestrator.md` 统一口径 | `design-governance-orchestrator-closure.test.ts` 静态断言 | Contract 强制；未伪称 Runtime 强制 |
| 2 | 进入项目治理后才检查初始化 | `sf_project_init` 负责项目骨架 | 调整 Orchestrator 的入口顺序 | 同上 | Contract + Tool |
| 3 | `.specforge/manifest.json` 不是正式 Project Spec 权威 | 当前 `sf_project_init` 仍维护兼容初始化标记 | Standard 明确兼容文件边界 | Standard 静态断言 | Runtime 事实 + Standard 裁决 |
| 4 | `.specforge/project/spec_manifest.json` 是正式项目规格与模块清单 | `sf_project_init_core` 创建初始 Project Spec；Merge Runner 受控更新 | 保留现有机制，禁止 Orchestrator 直接写入 | 新项目 `core`／既有空模块注册表测试 | Tool／Runtime 强制 |
| 5 | `StateManager/events.jsonl` 是状态唯一权威 | `sf_state_read` 从事件重建状态；`runtime/state.json` 为投影 | Standard 与 Contract 统一 | Standard 静态断言 | Runtime 强制 |
| 6 | `work_item.json` 只保存元数据 | 当前状态由 StateManager 管理 | 从 Standard 示例移除 `status`，明确不得编辑推进状态 | `expect(standard).not.toContain('"status": "created"')` | Standard + Runtime |
| 7 | 多活动 WI 必须明确目标 `work_item_id` | 基线 Dispatcher 只能在唯一活动 WI 时推断 | Contract 增加明确规则 | 契约静态断言 | Contract 强制 |
| 8 | 多活动 WI 中存在 Work Item HardStop 时，歧义调用失败关闭 | 基线会因无法唯一解析 WI 而跳过 Work Item HardStop | `ToolDispatcher` 扫描活动 WI，返回 `HARD_STOP_CONTEXT_AMBIGUOUS` | 新增多 WI Runtime 测试；独立 TypeScript 场景验证 | Runtime 强制，已修复 |
| 9 | 显式操作未阻断 WI 不应被另一 WI 的 HardStop 错误阻断 | Work Item HardStop 应保持 scope 隔离 | 保留显式 WI 定位逻辑 | 同一测试验证显式 `WI-0002` 可执行 | Runtime 强制 |
| 10 | Project HardStop 不依赖 WI 上下文 | 基线 `guardHardStop` 在无效 WI 时提前放行 | `checkHardStop` 先检查 Project scope；Dispatcher 先做 Project guard | 新增 Project HardStop 无 WI 测试；独立验证 | Runtime 强制，已修复 |
| 11 | HardStop 后只允许只读、诊断、恢复白名单 Tool | `hard-stop-latch.ts` 维护白名单 | 保留并覆盖 Project／Work Item scope | 原有 Dispatcher、Shell、Audit 测试 | Runtime 强制 |
| 12 | 历史阻断记录不得删除 | Write Guard 日志、HardStop resolution、Changed Files Audit | 未改变既有证据链 | 原有“阻断→解除→Audit”测试 | Runtime／Audit 强制 |
| 13 | `workflow_type` 与 `workflow_path` 必须合法配对 | `state_machine.ts` 保存映射并拒绝非法配对 | Orchestrator 路由表与 Runtime 对齐 | 路由表测试读取 State Machine 和 8 个 Skill | Runtime + Contract |
| 14 | `quick_change` 不得用于存在规格、接口、架构或未知项变化的请求 | Runtime 只知道枚举和配对，不理解语义 | Contract 明确严格前提 | 契约静态断言 | Contract 强制 |
| 15 | 保留路径不等于已有完整 Workflow | Runtime 有 `architecture_change_path`、`spec_migration_path`、`rollback_path` 枚举 | Contract 明确当前无完整用户级身份和 Skill 映射 | 路由测试确认枚举存在且契约不假定已实现 | Contract 诚实声明 |
| 16 | 专业产物由正确 Agent 负责 | Agent Contract 定义各角色，Runtime 不自动判断作者语义 | 完整列出职责和交接边界 | 契约静态审核 | Contract 强制；尚无 Runtime 所有权证明 |
| 17 | 跨来源证据由 `sf-evidence-collector` 归集，专业结论仍归专业 Agent | 当前存在对应 Agent | 补充触发边界 | 契约静态断言 | Contract 强制 |
| 18 | Candidate 只能写入当前 WI 的 `candidates/**` | `sf_artifact_write` 和路径治理负责规范化 | Orchestrator 不再手工拼装 Manifest | 现有 Artifact／Candidate 测试；契约审核 | Tool／Runtime 强制 |
| 19 | 模块必须来自 `spec_manifest.json` 或正式 `default_module` | `sf_project_init_core` 新项目声明 `core`，既有空注册表不自动改写 | 保持并测试 | 新项目／既有项目测试 | Runtime 强制 |
| 20 | Candidate Gate 失败要区分候选缺陷和治理链缺陷 | Gate 提供结果，根因语义不由 Runtime 自动判断 | Contract 明确两条返工路径 | 契约静态断言 | Contract + Gate 证据 |
| 21 | 用户决定只能由 `sf_user_decision_record` 记录 | Tool Schema 支持 `user_approved`、`auto_approved`、`waived`、`rejected`、`invalidated` | 修复“只能当前用户明确决定”的冲突 | 决策生命周期静态断言 | Tool + Contract |
| 22 | `user_approved` 必须保存 `user_response_quote` | `sf_user_decision_record` Schema 要求结构化证据 | 保留并写入主链 | 契约测试 | Tool／Contract |
| 23 | `auto_approved` 必须有有效策略和 `auto_approval_policy_id` | Tool Schema 支持策略字段 | 在主链中明确合法条件 | 契约测试 | Tool／Contract |
| 24 | Candidate、范围、基础版本或适用条件变化后旧决定失效 | Runtime 不理解所有语义变化 | Contract 要求 `invalidated`、重跑 Gate、重新决策 | 契约测试 | Contract + Tool 记录 |
| 25 | Merge 只能通过 `sf_merge_run` | Merge Runner 独占合并状态链和正式规格更新 | 保留 | 现有 Merge／状态测试 | Tool／Runtime 强制 |
| 26 | 实现前必须获得 Code Permission | `sf_code_permission` 管理受控范围 | 保留 | 现有权限／状态测试 | Tool／Runtime 强制 |
| 27 | Executor 只能写授权文件 | Write Guard 和 permission snapshot 管理范围 | 保留 | Changed Files Audit／Write Guard 测试 | Runtime／Audit 强制 |
| 28 | 实现后必须通过 Changed Files Audit | `sf_changed_files_audit` 生成权威报告 | 保留 | 原有 HardStop 历史审计测试 | Tool／Audit 强制 |
| 29 | 实现重复失败升级 Debugger，仍失败进入 `blocked` | Runtime 能保存状态，但不能判断“重复失败”的语义 | Contract 明确一次有边界修复后升级 | 契约静态断言 | Contract 强制 |
| 30 | Verification、Semantic Closure、撤销权限、Close 有固定顺序 | 对应 Tool 和 State Machine 提供封口动作 | 保留完整收口链 | 现有 Gate／Closure 测试；契约审核 | Tool／Runtime 强制主要动作 |
| 31 | `closed` 只能由 `sf_close_gate` 从权威 `verification_done` 形成 | Close Gate 校验权威状态 | 保留 | 现有 Close 测试 | Tool／Runtime 强制 |
| 32 | Orchestrator 不直接修改 `.specforge/project/**` | Write Guard／权限可阻断受保护路径，但自然语言行为仍需契约 | 将绝对路径边界写入职责表并测试 | 契约静态断言；Shell 受保护路径阻断测试 | Contract + Runtime 保护 |
| 33 | 恢复基于持久化事实，不依赖对话猜测 | 状态可由 `sf_state_read` 恢复；Agent Run 读取能力尚未确认完整 | 明确状态权威与 Agent Run 证据分离，证据不足进入 `blocked` | 契约静态断言 | Contract；存在剩余能力缺口 |
| 34 | `sf_continuity` 是连续性入口 | 当前存在 `sf_continuity`；旧名称不应当成 Tool | Standard、Contract 统一 | Standard／Contract 静态断言 | Tool + Contract |
| 35 | 用户沟通必须基于真实 Gate、HardStop、Audit 和文件变化 | Runtime 提供事实，但不能强制表达完整性 | 保留五职责沟通条款 | 契约审核 | Contract 强制 |

## 三、验证汇总

### 已在交付环境完成

1. 三个 TypeScript 完整替换文件按仓库 `.prettierrc.json` 参数通过 Prettier 检查。
2. 三个 TypeScript 文件通过 esbuild 语法和模块解析检查。
3. 独立 Runtime 场景验证通过：
   - 多活动 WI + 一个 Work Item HardStop + 无 `work_item_id`：阻断；
   - 显式指定未阻断 WI：允许；
   - Project HardStop + 无 WI 上下文：阻断。
4. Contract／Standard 关键条款静态验证通过。

### 必须在用户完整仓库完成

- `bun test packages/daemon-core/tests/design-governance-orchestrator-closure.test.ts`
- `bun run format:check`、`bun run lint`、`bun run build`
- 仓库全量 `bun test`
- Installer render／verify 和用户级部署一致性验证。

## 四、结论

本表明确区分了“代码强制”与“契约要求”。本次只对真实证据证明存在的 HardStop Runtime 空隙做最小修改，没有把语义路由、Agent 所有权或用户沟通伪装成 Runtime 已能自动判断的能力。
