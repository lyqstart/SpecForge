# Work Log: WI-002-sf-design-2 (findings_report phase, orchestrator-substituted)

## 异常说明

本 work_log 描述 findings_report 阶段的**实际执行路径**，与正常情况偏离：

**正常路径**：orchestrator 调度 sf-design → sf-design 读 7 个 research 文件 + intake + plan → 写 findings_report.md + 自己的 work_log → 返回摘要 → orchestrator 跑 sf_design_gate(mode=investigation)

**实际路径**：
1. orchestrator 调度 sf-design 第 1 次（prompt ~8000 字，要求读 9 个文件）→ task 通道返回"我已经理解全部内容，开始写..."这种**中间状态文字** → 磁盘**无任何文件**
2. orchestrator 调度 sf-design 第 2 次（精简 prompt 约 60%，要求只读 7 个 research 文件，明确返回 JSON 格式）→ task 通道返回**完全空字符串** → 磁盘**无任何文件**
3. orchestrator 向用户报告 2 次失败，提出 3 条出路（继续重试 / 接受 research 为最终产物+导航 README / 跳 Gate 强进 completed）
4. 用户选择 (B)：orchestrator 代写 findings_report 骨架 + 导航
5. orchestrator 完成本文件 + findings_report.md（导航+执行摘要风格，不复述 research 细节）

## findings_report.md 的内容来源

| 章节 | 来源 |
|------|------|
| §1 执行摘要 | research/05-recommendation.md §5.1 + research/07-limitations.md 主体 |
| §2.1 模块契约表 | 指针引用 research/01-contracts.md（未在 findings_report 中重述全表） |
| §2.2 双症状证据链 | 精炼复述 research/02-symptom-chains.md 的两条证据链精准定位 |
| §2 plan 外的 4 条发现 | 来自 WI-002-sf-executor-1/work_log.md 阶段 B |
| §3.1 维度定义 | research/03-comparison-matrix.md 表头 |
| §3.2 矩阵 | **指针引用 + 一张精简结论表**（不复述 30 个格子的完整文字） |
| §3.3 相关性观察 | 指针引用 research/03 末尾段 |
| §4 Hybrid 可行性 | 精炼复述 research/04-hybrid-feasibility.md 的 H1-H4 判定 |
| §5 推荐方案全文 | **全部指针引用 research/05-recommendation.md**，mermaid 图与 ASCII 数据流图均未在 findings_report 中重复（避免膨胀） |
| §6 非功能影响 | 指针引用 research/06-non-functional-impact.md |
| §7.1 方法限制 | 综合 plan 死角 + research/07 |
| §7.2 同源裂缝 pointer | 6 条裂缝（4 条来自 07，2 条来自本会话补充） |
| §7.3 适用前提 | 4 条（基于推荐方案的边界条件） |
| §附录 A.1 行号引用索引 | 从 research 各文件聚合（10 个文件） |
| §附录 A.2 实证素材清单 | 来自本会话观察 |
| §附录 A.3 research 索引 | 7 个 research 子文件路径 |

## 关键决策

- **不复述 mermaid 图**：研究产物中的目标架构图 / 状态机 / 数据流图全部在 research/05 里，findings_report 只指针。理由：研究的 mermaid 已被 sf-executor 完整产出，复述无新增价值，且会让 findings_report 膨胀到 1500 行外
- **不复述 30 格矩阵全文**：只给精简结论表（每格只给 winner 类别+一两个关键词），完整论证回 research/03。理由：保持 findings_report 可单页阅读
- **保留所有源码行号引用**：附录 A.1 完整聚合，便于审阅者快速定位

## findings_report.md 的特殊性声明

文件末尾添加了"## 文件来源说明"段落，明确告知读者：本文件由 orchestrator 代撰而非 sf-design 产出，所有事实均来自 research/ 子文件。
这是为了**审计透明性**——避免读者误以为这是常规 sf-design 产物。

## 关于 sf-design 失败的 orchestrator 观察

两次失败模式不同但有共同特征：**最终输出阶段（write findings_report.md）从未发生**。
- 第 1 次返回中间状态文字 → 看起来 sf-design 完成了"读"和"理解"，但在"开始写"动作的瞬间被截断
- 第 2 次返回空字符串 → 看起来 sf-design 完全没产生有意义输出

这两种模式都不是典型的 context exhaustion（没看到 compaction 痕迹），更像是 **task 工具在 sub-agent 的某种 workload 下不稳定**。
本观察已登记为 findings_report §7.2 第 6 条同源裂缝实证。

## 总行数与字节数

findings_report.md 总行数: ~280 行（含表格）
findings_report.md 总字节数: 待 read 后实测（本 work_log 写完后由 orchestrator 自查）

## Gate 自查（在 orchestrator 调用 sf_design_gate 之前）

- [x] H2 #1 `## 调查结论` 存在，下面有非空 intro 段落（"本次调查回答的核心问句..."）
- [x] H2 #2 `## 数据和证据` 存在，下面有非空 intro 段落（"本节是 §3...和 §4...的证据陈列段..."）
- [x] H2 #3 `## 建议` 存在，下面有非空 intro 段落（"本节给出推荐方案的全部交付物..."）
- [x] H2 #4 `## 限制` 存在，下面有非空 intro 段落（"本节诚实声明本次调查的边界..."）
