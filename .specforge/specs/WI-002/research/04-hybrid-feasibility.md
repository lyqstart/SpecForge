# 04 — Hybrid 可行性筛查（步骤 4，回答 Q3）

> 对 A+B / A+D / B+D / A+B+D 各回答：是否矛盾？收益 vs 负担？明确判定。
> **直接引用 `03-comparison-matrix.md` 的格子，不重复采证**。

---

## H1 — A+B（"补别名表" + "插件会话用 OpenCode sessionID 当 key"）

### 是否矛盾？

**直接互斥**。

- A 的核心动作（D1-A）：**保留 daemon sessionId 为主键**，引入 OpenCode sessionID 的**别名表**作为副索引。
- B 的核心动作（D1-B）：**插件会话主键直接 = OpenCode sessionID**，daemon 不为插件会话生成独立 UUIDv7。

两者对**插件会话主键归属**的处理直接冲突：A 主键 = daemon sessionId，B 主键 = OpenCode sessionID。同一 SessionRegistry 不可能两个主键同时成立。

### 收益 vs 负担

- 收益（如硬要合并）：仅是 D1 维度的"两种 ID 都能命中"——但这与 A 单独的"主键 + 别名"等价，B 在此组合下被降级为"对插件会话同样维护别名"，**B 的独立价值消失**。
- 负担：模块边界量级超过 A 单方案（D4-B 是"一模块"，D4-A 是"一文件 + 一行"），实际相当于"实施 B 但同时维护 A 的别名表"——重复工作。

### 判定：**不成立（互斥）**

将 A+B 视为两种"补 ID 映射"路径的二选一，不存在有意义的合并。

---

## H2 — A+D（"补别名表" + "全 WAL 化"）

### 是否矛盾？

**不矛盾，且高度互补**。

- A 解 D1（ID 一致性 partial）的同时不动状态权威性（D2-A "未改变"）。
- D 不解 D1（D1-D "no"，必须叠加 A 或 B），但解 D2（内存权威性 → events.jsonl）、D3（磁盘可恢复性 yes）。

A 改 SessionRegistry 的 Map 字段，D 改 SessionRegistry 的写入路径（WAL-first）；两者在 SessionRegistry 内部正交：A 决定"映射存什么"，D 决定"映射变更怎么持久化"。

### 收益 vs 负担

**收益**：
- 症状 1 立即解（A 解，D 不解）
- 症状 2 + 整类"daemon 重启后绑定丢"解（D 解，A 不解）—— A+D 同时覆盖两个症状
- D3 从 partial 升 yes；D2 重定向到 events.jsonl
- A+D 在 D6（迁移成本）上是 A 的零成本 + D 的"schema 演进需求"叠加 —— 总成本 ≈ D 的成本
- D9 与 Property 20/21 兼容性（D9-A 完全兼容 + D9-D 扩展）兼容良好，扩展的部分是 D 单方面带来的

**负担**：
- 模块边界变化跨 4 个模块（D4-D 跨模块）——A 的"一文件 + 一行"不能省，是 D 总量上的一个小子集
- D 的盲点 D10-D 全部继承（WAL 写失败处理、events.jsonl 损坏、events 无限增长）
- 实施工作量：A（数小时）+ D（数周）——但 A 可以作为 D 的 "Phase 0" 快速止血

### 判定：**成立**

**最强组合候选**。A 解眼前痛点（D1 partial → 实际能用），D 解长期可恢复性。边界条件：
- 实施顺序必须 **A 先 D 后**（A 是 1 行修复，D 是数周改造；先 A 让症状 1 立即消失，D 在后台推进）
- D 阶段要复用 A 引入的"别名表"，把 alias 写入也纳入 WAL 事件（D 阶段对 A 别名表的 transitively wal-ize）

---

## H3 — B+D（"OpenCode sessionID 当 key" + "全 WAL 化"）

### 是否矛盾？

**不矛盾，但有摩擦**。

- B 改 SessionRegistry 的 key 语义（D1-B yes），D 改持久化路径（D3-D yes）——结构上正交。
- 摩擦点：B 的 D6（迁移成本）说"checkpoint 文件名空间发生变化、sessions/<sessionId>.json 命名冲突需要分离" + D 的 D6 说"events.jsonl schema 需要演进"——两个 schema 变更同时落地，迁移耦合。
- 摩擦点 2：D 的 rebuild 需要重放 session events，B 的 session events 的 sessionId 字段语义已经变了（OpenCode ID）——若 events.jsonl 里早期事件用 daemon UUID、后期用 OpenCode ID，rebuild 必须区分时段。

### 收益 vs 负担

**收益**：
- 症状 1 解（B 解，D 不解）
- 症状 2 解（D 解，B 不解）
- D1 升 yes（B 的核心优势），D3 升 yes
- D7（可观测性）"No session binding found" 消失 + 大量新 WAL trace
- D8 排查路径"4 步映射变 1 步"（B 简化）+ 但 D 仍引入 replay 工具的需求——D8 局部互相抵消

**负担**：
- D9 Property 5（sessionId 是 sole identity key）**显式破坏**（D1-B 已点出），且 D 扩展 Property 20/21 又是另一处不变式调整 —— **同一次发布破两条不变式**，风险叠加
- D5 plugin 端兼容性"零代码改动但语义变"（D5-B）+ D 的 schema 演进需求 —— plugin 端代码不变但 wire format 的语义升级幅度大
- D4 模块边界变更：B 是"一模块"，D 是"跨模块"，B+D 是跨 4 模块且 SessionRegistry 内部两条改造路径耦合
- D10 盲点叠加：B 的"OpenCode sessionID 跨 daemon 唯一性假设"（B-盲点 2）在 D 下不缓解，反而因为 events.jsonl 持久化使错配数据更难修复

### 判定：**部分成立（边界条件严格）**

理论上可行，但实施风险高：
- 必须先实施 B 稳定（让"插件会话主键 = OpenCode sessionID"在生产环境验证 ≥ 一个 release cycle），再上 D
- 或者反过来：先实施 D 的 session WAL 化（保留 daemon sessionId），再切到 B 的 OpenCode sessionID 主键 —— 但这意味着 D 期间事件 schema 用 daemon sessionId，B 落地时要写迁移脚本重写历史事件
- 二者顺序都很重，且都触及一次"事件历史的语义改写"

---

## H4 — A+B+D（三合一）

### 是否矛盾？

**承继 H1（A+B 互斥）的矛盾，整体不成立**。

A 与 B 在 D1 的主键归属上互斥（H1 判定），加上 D 不解决这种互斥（D 不动 ID 语义）。三合一中 A 和 B 必须选一个充当"插件会话主键归属"的决策，另一个被降级为"次要别名"——本质上还是 H2 或 H3 的退化形式。

### 收益 vs 负担

- 收益：无（A 与 B 互相挤占 D1 维度）
- 负担：维护两条 ID 映射（A 的别名表 + B 的主键变更）+ D 的全部成本 —— 等同 "H2 工作量 + H3 工作量 - 共享部分"，但实际能力**不超过 H2 或 H3 中的较优者**

### 判定：**不成立（A 与 B 互斥导致三合一退化）**

---

## 总判定表

| Hybrid | 判定 | 备注 |
|--------|------|------|
| **A+B** | **不成立** | A 与 B 在 D1 的"插件会话主键归属"上直接互斥 |
| **A+D** | **成立**（强推荐分阶段路径） | 两个症状各打一个、D9 兼容性最好、A 可作为 D 的 Phase 0 |
| **B+D** | **部分成立**（高风险） | 同期破坏 Property 5 + 扩展 Property 20/21，事件 schema 历史改写 |
| **A+B+D** | **不成立** | A+B 互斥矛盾向上传递 |

## 关键观察（事实层面）

1. **A 与 B 是"插件会话主键归属"的二选一**，不能同时成立。
2. **D 既不替代 A 也不替代 B**（D1-D "no" 明示），必须叠加。
3. **A+D 的实施顺序自然 fork**：A 可在数小时内解症状 1，D 可在数周后解症状 2 与可恢复性。
4. **B+D 的实施顺序耦合**：两者都触及事件 schema 与 sessionId 语义，必须谨慎排序避免历史事件重写。

**推荐方案及其理由放在 `05-recommendation.md`，本文件仅判定 hybrid 的可行性。**
