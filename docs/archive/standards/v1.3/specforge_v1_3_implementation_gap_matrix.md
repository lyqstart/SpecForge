# SpecForge v1.3 Implementation Gap Matrix

## 1. 使用说明

本文件用于把 `specforge_unified_standard_v1_3_final.md` 从“标准文本”转换成“实现任务边界”。

重要边界：

```text
本矩阵基于当前已知 v1.2 差距审查与标准融合结果；
它不是最新代码扫描报告；
进入实现前必须结合 GitHub/main 或本地分支做逐文件职责映射。
```

## 2. 总体判断

| 领域 | 当前判断 | v1.3 动作 |
|---|---|---|
| v1.2 stable 运行基线 | 已稳定可用 | 不直接在 tag 上修改 |
| Project Spec Store | 最小闭环已实现 | 扩展为多视角体系 |
| Extension Subflow | 初步闭环已实现 | schema、版本、回滚、返回协议正式化 |
| Write Guard | 核心事务链已成立 | 控制面单源化、日志服务化 |
| PathPolicy / WritePolicyService | 存在分散判断 | v1.3 单源化 |
| Live Acceptance | 有效但偏人工 | 自动化 |
| Agent / Skill / Tool 合同 | 未完成全量复审 | 单独审计包 |

## 3. 差距矩阵

| 标准能力 | v1.3 要求 | 已知 v1.2 状态 | 差距等级 | 建议实现位置 | 验收方式 |
|---|---|---|---|---|---|
| `extension_registry.json` Core 化 | Core Project Spec，登记 view/gate/artifact/workflow 扩展 | 初步闭环 | P1 | Project Spec service + Merge Runner + Gate | 未登记 view_type 不得进入 Candidate；登记后可合并 |
| `.specforge/project/views/**` | 多视角专题规格统一位置 | 当前只是最小 Store | P2 | Project Spec Path Service + Validator | 初始化不默认生成空 views；触发后登记并生成 |
| ADR Detail Extension | `decisions.md` Core，`decisions/ADR-*` Conditional | v1.1 MVP 只用 `decisions.md` | P2 | Project Spec Extension + ADR Gate | 未登记 ADR Extension 时创建 `decisions/` 被拒绝 |
| Project Spec 多视角 Trace | View → Gate → Trace | 最小 trace | P2 | Trace service + Gate Runner | active view 必须有 trace rows |
| Core / Conditional / Optional 文件分级 | 禁止机械生成空专题文件 | 未产品化 | P2 | Impact Analysis + Extension Registry | 未触发专题不生成；触发专题必须有 Gate |
| Path Service v1.3 方法 | `projectExtensionRegistry()`、`projectViewsRoot()`、`projectView()`、`projectAdr()`、`projectReportsRoot()` | 需核验 | P1 | directory-layout / path-resolver | 单元测试覆盖所有路径 |
| PathPolicy v1.3 | 正式路径必须 `.specforge/project/...`，reports 非真相源 | 需核验 | P1 | PathPolicy / WritePolicyService | 反斜杠、绝对路径、`..`、未登记 views 被拒绝 |
| WritePolicyService 单源化 | plugin/handler/lib 不分散判断 | v1.2 差距显示未完成 | P1 | daemon-core WritePolicyService | native Write/edit/apply_patch/safe_bash 共用同一策略 |
| write_guard_log 服务化 | 独立事实源 | 已能记录但未服务化 | P1 | write-guard-log service | blocked write 可查询、可进入 evidence |
| Recovery Plane | 不死锁、可恢复 | 未正式验收 | P1 | StateManager + resume_check/resume_plan | hard_stop 后其他 WI 不受影响，原 WI 可恢复 |
| `sf_safe_bash` WI Context | 无显式 WI 时行为无歧义 | v1.2 差距显示仍需收敛 | P1 | thin-client / tool context | 无 WI 写入 protected path 被拒绝并可解释 |
| Automated Live Acceptance | 自动收集证据 | 当前偏人工 | P1 | test/e2e/live-acceptance | 一键生成 evidence + report |
| 专题 Gate | view/adr/atam/domain/service/resilience/runtime/sre/evolution | 未产品化 | P2 | Gate Registry + Gate Runner | impact_analysis 触发专题 Gate，未触发不执行 |
| Agent / Skill / Tool 合同 | 普通 Agent 只能产出 candidate/delta/evidence，不推进控制面 | 未全量审计 | P1 | docs/agents + skills + tool schemas | 合同审计报告 |
| Installer Registry 完整性 | 安装文件必须 registry 登记并 verify | v1.2.1 修过 observability 缺漏 | P1 | scripts/lib/registry.ts + verify | 删除 registry 项后 verify 必须失败 |

## 4. 建议拆分为 v1.3 实现包

| 实现包 | 目标 | 不做什么 |
|---|---|---|
| v1.3-standard-code-mapping | 把标准规则映射到当前代码职责 | 不改代码 |
| v1.3-path-policy-unification | Path Service / PathPolicy / WritePolicyService 单源化 | 不做多视角产品化 |
| v1.3-project-spec-multiview-core | Project Spec views、registry、schema、validator | 不做 UI |
| v1.3-extension-subflow-formalization | Extension Subflow schema、Gate、恢复协议 | 不做大架构重构 |
| v1.3-live-acceptance-automation | 自动化 live acceptance | 不改变标准 |
| v1.3-agent-skill-tool-contract-audit | 全量职责边界审计 | 不修运行 bug，除非发现 P0 |

## 5. 入库前验收

标准文件入库前只需验证：

```text
1. 文件放在 docs/standards/v1.3/；
2. 旧标准归档，不删除；
3. final_review_report 说明有条件通过；
4. implementation_gap_matrix 明确不等于代码已实现；
5. README 写清楚不直接替代 v1.2-stable。
```
