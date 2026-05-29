<!-- BEGIN: specforge-managed (DO NOT EDIT MANUALLY) -->
<!-- 由 scripts/render-specs-readme.ts 自动生成 -->

# Work Items 总索引

最后更新：2026-05-28T20:59:29.106Z
总数：9 (completed: 8, development: 1)

---

## WI-002 Daemon 架构重设计调查
- **工作流**：Investigation
- **状态**：✅ Completed
- **创建日期**：2026-05-27
- **摘要**：调查 SpecForge daemon 架构的核心问题，包括会话 ID 映射缺陷、WAL 多实例竞态、RecoverySubsystem 依赖注入缺失等，产出 A+D Hybrid 推荐方案。

---

## WI-003 Phase 0 热修：OpenCode 事件路由断链
- **工作流**：Bugfix Spec
- **状态**：✅ Completed
- **创建日期**：2026-05-27
- **摘要**：修复 SpecForge daemon 日志中 'No session binding found' 的问题。根因：HTTPServer 丢弃顶层 sessionId，SessionRegistry 映射逻辑全部 miss。
- **上游 WI**：WI-002

---

## WI-004 SpecForge 工具裂缝修复
- **工作流**：Change Request
- **状态**：✅ Completed
- **创建日期**：2026-05-27
- **摘要**：修复 WI-002 调查发现的 4 条工具实现裂缝：Gate 隐式 intro body 要求、双目录约定不一致、Skill 文档路径引用不统一等。
- **上游 WI**：WI-002

---

## WI-005 WAL/StateManager 单例化（Phase 1）
- **工作流**：Change Request
- **状态**：✅ Completed
- **创建日期**：2026-05-27
- **摘要**：消除 Daemon.ts 多 WAL 实例竞态、修复 path-resolver 嵌套 statePath、RecoverySubsystem 依赖注入、ProjectManager 不再为每个项目创建独立 StateManager。
- **上游 WI**：WI-002, WI-003, WI-004

---

## WI-006 SessionRegistry WAL 化（Phase 2）
- **工作流**：Change Request
- **状态**：✅ Completed
- **创建日期**：2026-05-27
- **摘要**：将 SessionRegistry 的 4 个内存 Map 转为 WAL-first 持久化，支持 daemon 重启后通过 WAL 重放恢复 session bindings。
- **上游 WI**：WI-002, WI-005

---

## WI-007 Property 21 重写与悬空契约清理（Phase 3）
- **工作流**：Change Request
- **状态**：✅ Completed
- **创建日期**：2026-05-27
- **摘要**：收尾清理：重写 Property 21 注释措辞、删除 detectOldSessions/reconnectOldSessions 悬空代码路径、同步文档。
- **上游 WI**：WI-002, WI-006

---

## WI-009 SpecForge 项目初始化流程根治
- **工作流**：Change Request
- **状态**：✅ Completed
- **创建日期**：2026-05-28
- **摘要**：修复 sf-intake skill frontmatter、daemon 不再自动建 manifest 改为探针+错误、统一初始化流程。
- **上游 WI**：WI-002

---

## WI-010 SpecForge V6 目录结构治理 P0
- **工作流**：Refactor
- **状态**：✅ Completed
- **创建日期**：2026-05-29
- **摘要**：建立单一真相源 Schema（directory-layout.ts + meta-schema.ts），引入路径构造函数，创建迁移/备份脚本，记录 ADR-006 决策。风险路径 low，development 直跳 verification。
- **下游 WI**：WI-011
- **相关模块**：packages/types

---

## WI-011 SpecForge V6 目录结构治理 P1 代码全量切换与数据迁移
- **工作流**：Change Request
- **状态**：🔨 Development
- **创建日期**：2026-05-29
- **摘要**：P1 阶段：40+ 文件 200-500 处路径替换 + 数据迁移执行 + setup/ 搬迁。基于 P0 的 directory-layout.ts Schema 全量切换代码中的硬编码路径。
- **上游 WI**：WI-010
- **相关模块**：packages/daemon-core, packages/permission-engine, packages/types

---


<!-- END: specforge-managed -->
