# WI-031 增量设计文档（Gateway File）

> 本文件为 `design_delta.md` 的 Gateway 入口文件，供 sf_design_gate 和 sf_doc_lint 检查使用。
> 完整增量设计内容见 `design_delta.md`。

本文档是 WI-031 Change Request 工作流的设计阶段产物。由于 change_request 工作流使用 `design_delta` 状态，
设计文档命名为 `design_delta.md`。本文件为 Gate 工具兼容性入口。

请参考 `design_delta.md` 获取以下完整内容：

- **架构概述**：A 层存储路径重构（mode 配置、IPathResolver）和 B 层事件处理实现（ingest 路由、各子系统集成）的 Mermaid 依赖图
- **14 个设计决策**：DD-A1~A5 覆盖存储重构，DD-B1~B7 覆盖事件处理，DD-AB1~AB2 覆盖 A/B 接口契约
- **组件接口定义**：IPathResolver、IngestEventRouter、PermissionEngine 集成、SessionRegistry 扩展等
- **数据模型变更**：PathResolver 接口、RegisterRequest/Response、IngestEventRequest 类型定义
- **测试策略**：单元测试（7 个文件）、属性测试（3 个文件）、集成测试（5 个场景）、E2E 测试（2 条链路）
- **Correctness Properties**：6 个 CP 覆盖路径不变式、向后兼容、幂等性、非阻塞、交叉一致性、gitignore 完整性
- **Out of Scope**：8 项明确排除
- **Assumptions**：9 项设计假设
- **兼容性影响**：API 变更、配置格式变更、数据迁移策略、插件协议变更、降级策略
- **回归风险**：3 类场景的缓解措施
- **KG 追溯关系**：设计决策→需求、受影响 WI-001 Task 节点

## 关键设计决策索引

| DD | 标题 | 需求引用 |
|----|------|---------|
| DD-A1 | mode 配置模型 | WI-031 A 层需求 1 |
| DD-A2 | 路径解析接口设计（IPathResolver） | WI-031 A 层需求 1, 2 |
| DD-A3 | .gitignore 自动维护机制 | WI-031 A 层需求 2 |
| DD-A4 | daemon.json 迁移方案 | WI-031 A 层需求 3 |
| DD-A5 | ALL_STATES 完备性验证 | WI-031 A 层需求 4, WI-033:req:1, WI-033:req:2 |
| DD-B1 | Register 端点协议 | WI-031 B 层需求 1, 4 |
| DD-B2 | Ingest 事件路由表设计 | WI-031 B 层需求 2, 3 |
| DD-B3 | PermissionEngine 接入 | WI-031 B 层需求 3 |
| DD-B4 | SessionRegistry opencode.event | WI-031 B 层需求 3 |
| DD-B5 | EventLogger 接入 ingest 管道 | WI-031 B 层需求 3 |
| DD-B6 | RecoverySubsystem.saveCheckpoint | WI-031 B 层需求 3 |
| DD-B7 | shell.env hook 实现 | WI-031 B 层需求 4 |
| DD-AB1 | sessionId↔projectPath 绑定契约 | WI-031 A/B 集成 |
| DD-AB2 | Feature Flag 功能开关 | WI-031 B 层回滚 |
