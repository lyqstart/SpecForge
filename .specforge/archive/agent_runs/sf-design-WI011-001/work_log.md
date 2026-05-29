## sf-design WI-011 Design Delta 完成

### 执行概要

为 WI-011（SpecForge V6 目录结构治理 P1）生成了完整的 `design_delta.md`。

### 读取的输入文件
1. `.specforge/specs/WI-011/intake.md` — 完整需求定义
2. `.specforge/specs/WI-011/impact_analysis.md` — 影响分析（361 行，含 6 个发现问题和 5 个待决策项）
3. `packages/types/src/directory-layout.ts` — 单一真相源 Schema（281 行）
4. `docs/proposals/2026-05-29-directory-structure-governance.md` — 方案 A 全文（528 行）
5. `.specforge/dev-environment.md` — 开发环境配置
6. `.specforge/project-rules.md` — 工程规则
7. 关键源码文件抽查：sf_safe_bash_core.ts, path-resolver.ts, static-api-checker.ts, hard-rules.ts, sf-installer.ts, meta-schema.ts, index.ts(permission-engine)

### 产物
- `.specforge/specs/WI-011/design_delta.md`（~950 行）

### 设计决策摘要（12 个 DD）

| DD | 标题 | 关键决策 |
|----|------|---------|
| DD-0 | 用户级路径 Schema 扩展 | 新增 USER_LAYOUT + resolveUserPath()，解决 D1 |
| DD-1 | T1 daemon-core 路径切换 | 3 种模式（A 带点/B 不带点/C 用户级）分类处理 |
| DD-2 | T2 部署态 tools 切换 | 内联常量方案（脱离 monorepo 上下文） |
| DD-3 | T3+T4 SKILL/Agent 修正 | 纯文本替换 specforge/specs/ → .specforge/specs/ |
| DD-4 | T5 permission-engine | observability/events.jsonl → logsTelemetry，解决 D2 |
| DD-5 | T6 setup/ 搬迁 | git mv + junction 保留开发入口，解决 D5 |
| DD-6 | T7 sf-installer 改造 | 安装源从 setup/ 读取，不保留旧路径兼容，解决 D4 |
| DD-7 | T8 render-layout.ts | marker 机制 + schema 解析 + .bak 安全 |
| DD-8 | T9 render-specs-readme | _meta.json 驱动 + daemon 非阻塞集成 |
| DD-9 | T10 数据迁移 | 5 步执行（dry-run→backup→migrate→verify→cleanup） |
| DD-10 | T11 清理废弃 | 直接 git rm，不保留 archive，解决 D3 |
| DD-11 | 分批执行策略 | 6 批次串行 + 批次间回归检查 |

### 5 个待决策项解决状态
- D1 ✅ 扩展 directory-layout.ts
- D2 ✅ logsTelemetry（logs/telemetry.jsonl）
- D3 ✅ 直接删除 .opencode-/
- D4 ✅ 不保留旧路径兼容
- D5 ✅ 保留 .opencode/ 用 junction

### 架构属性自检
- A1 单一职责 ✅
- A2 显式依赖 ✅（Mermaid 图）
- A3 可替换性 ✅（interface 定义 + mock 方式）
- A4 失败可观测 ✅（失败路径列表）
- A5 边界明确 ✅（Out of Scope + Assumptions）
