# WI-005 Work Log — sf-design (Design Delta)

## 任务摘要

为 WI-005 Change Request（WAL/StateManager 单例化 Phase 1）生成 design_delta.md 文档，基于 WI-002 investigation 的研究素材和 WI-005 impact_analysis.md 的 4 个改项，设计具体的代码变更方案。

## 执行过程

1. **读取 intake.md**（70 行）— 理解变更背景、范围、约束和受影响模块
2. **读取 impact_analysis.md**（250 行）— 理解 4 个改项的详细分析、风险矩阵和回归测试范围
3. **读取 WI-002 research 素材**：
   - `01-contracts.md`（155 行）— 10 个模块的契约提取，9 个隐式契约
   - `05-recommendation.md`（300 行）— §5.2 目标架构、§5.5 Phase 1 迁移路径
   - `03-comparison-matrix.md`（134 行）— D4-D 跨模块变更范围评估
4. **读取源码**（6 个文件）：
   - `Daemon.ts`（300 行）— 确认 L44/L53/L54/L57/L82/L88 的关键构造
   - `StateManager.ts`（432 行）— 确认 L50 内部 WAL 创建、rebuildState 逻辑
   - `WAL.ts`（162 行）— 确认 _lastSeq 实例字段、appendEvent 流程
   - `RecoverySubsystem.ts`（618 行）— 确认 L52 可选注入、L305 fallback rebuild
   - `ProjectManager.ts`（265 行）— 确认 L60/L63 per-project WAL/SM 创建
   - `path-resolver.ts`（195 行）— 确认 PersonalPathResolver 嵌套路径问题
5. **读取 HTTPServer.ts** — 关键发现：`deps.wal` 被声明但从未使用，HTTPServer 通过 eventLogger/sessionRegistry 路由
6. **读取 project-rules.md** — 确认技术栈约束（TypeScript strict, monorepo, JSON/JSONL 持久化）
7. **设计并写入 design_delta.md** — 包含 4 个改项的详细设计、2 个关键设计决策（statePath 方案选择、ProjectManager 注入方案选择）、兼容性分析、回归风险、KG 追溯

## 遇到的问题

1. **HTTPServer deps.wal 使用情况不明确** — 通过 grep 搜索和代码审查确认 HTTPServer 实际不使用 `deps.wal`，这简化了改项 1 的设计
2. **statePath 方案选择** — 三个选项各有优劣，最终选择方案 (2)（IPathResolver 新增 daemon 专用方法），因为它与现有 resolveDaemonRuntimeDir() 形成对称，不污染 projectPath 语义
3. **ProjectManager 方案选择** — 选择方案 (A)（构造注入）而非方案 (B)（工厂/回调），因为后者违反 YAGNI（只有 1 个 StateManager 源）
4. **旧嵌套 events.jsonl 数据合并** — 发现 StateManager 的 WAL 和 Daemon 独立 WAL 写入不同文件（嵌套 vs 非嵌套），需要设计合并逻辑

## 最终结论

design_delta.md 已写入 `.specforge/specs/WI-005/design_delta.md`，包含：
- 4 个改项的详细设计（含精确代码变更位置和行号引用）
- 2 个关键设计决策（statePath 选择方案 2，ProjectManager 选择方案 A）
- 依赖关系 Mermaid 图（变更前 vs 变更后对比）
- 兼容性分析（events.jsonl/state.json/HTTP API/Plugin wire format）
- 5 个回归风险的详细缓解措施
- KG 追溯关系映射

### 需要用户确认的设计歧义

1. **旧嵌套 events.jsonl 合并策略** — 如果旧嵌套路径有大量事件，是否需要更复杂的合并逻辑？
2. **ProjectContext.wal/stateManager 字段** — 是否直接删除（breaking change）还是保留为 deprecated 可选字段？
3. **StateManager 构造函数 isDaemonGlobal 参数** — 是否可以接受构造函数签名变更？

## 工具调用统计

- read: 12 次（7 个源码文件 + 5 个文档文件）
- grep: 2 次（搜索 HTTPServer 中 wal 使用）
- write: 1 次（design_delta.md）
