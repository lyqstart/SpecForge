# Requirements Document

## Requirements

### Requirement 25: V6.0 开发范围边界（P0 / P1 / P2）

**User Story:** 作为 V6.0 的项目经理，我希望范围被明确切分为 P0 / P1 / P2，避免"边做边加"。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 以列表形式列出 V6.0 P0 必做项（共 27 项），分组为：
   - 基础设施（Daemon、通信、Session Registry、Permission、Adapter、Config、Directory、CLI、Recovery、Multi-project，共 10 项）。
   - 核心能力（10 Agent、Feature Spec workflow、4 Gate、state.json、events.jsonl、Thin Plugin，共 6 项）。
   - 可观测性基础（Event Bus、CAS、三级模式、基础日志、sf-analyst，共 5 项）。
   - 扩展机制骨架（Skill 加载、Tool 注册、内置 Workflow，共 3 项）。
   - 分发（npm 包、安装向导、schema_version + 迁移框架，共 3 项）。

2. THE Requirements_Document SHALL 以列表形式列出 V6.1 P1 项（共 15 项），包含 bugfix workflow、design-first workflow、quick change workflow、Knowledge Graph、全局知识库 + sf-knowledge、Context Builder、成本追踪、并行任务调度、跨会话续接、Telegram Webhook 通知、用户自定义 Tool、用户自定义 Skill、sf-debugger 自愈闭环、Workflow 数据驱动扩展、Gate 组合。

3. THE Requirements_Document SHALL 以列表形式列出 V6.x P2 项，包含多模态完整支持、自愈完整闭环、V3.6 四工作流（change_request / refactor / ops_task / investigation）、插件沙箱、多机同步、Web UI、跨项目自动学习。

4. WHEN 某项被明确列入 P1 或 P2，THE V6_0_Scope SHALL 禁止在 V6.0 交付该项。

5. THE Requirements_Document SHALL 允许在 ADR（记录在 design.md）中调整 P0 / P1 / P2 归属，但必须同步更新本文档。

### Requirement 30: Correctness Properties（架构一致性属性）

#### Property 15: Scope Boundary

*For all* 标记为 P1 或 P2 的能力 f（见 REQ-25 清单），在 V6.0 的 release 分支中 f **默认关闭**（可存在死代码或 feature flag，但用户可见行为必须关闭）；运行时调用 f 的 entry 必须返回"不可用"错误，除非用户通过运行期 feature flag 明确开启。

**Validates: Requirements 30.15, 25.4**
