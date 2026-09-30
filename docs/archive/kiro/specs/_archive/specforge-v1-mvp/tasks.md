# 实施计划：SpecForge V1 MVP

## 概述

本实施计划将 SpecForge V1 MVP 的设计拆分为 6 个开发阶段，按增量方式推进。每个阶段在前一阶段基础上构建，确保无孤立代码。所有代码使用 TypeScript 编写，测试使用 Vitest + fast-check。

## 任务

- [x] 1. Phase 1：基础骨架 — 目录结构、状态基础、全局配置
  - [x] 1.1 创建项目目录结构
    - 创建以下目录：`.opencode/agents/`、`.opencode/tools/`、`.opencode/plugins/`、`.opencode/skills/`
    - 创建以下目录：`specforge/agents/contracts/`、`specforge/config/`、`specforge/specs/`
    - 创建以下目录：`specforge/runtime/`、`specforge/runtime/checkpoints/`
    - 创建以下目录：`specforge/sessions/`、`specforge/archive/agent_runs/`、`specforge/logs/`
    - 创建 `AGENTS.md` 文件（Agent 总览文档）
    - _需求: 1.1, 1.2, 1.3_

  - [x] 1.2 创建权威状态与事件基础文件
    - 创建 `specforge/runtime/state.json`，初始内容为 `{ "work_items": {} }`
    - 创建 `specforge/runtime/events.jsonl`，初始为空文件
    - 创建日志文件：`specforge/logs/app.log`、`specforge/logs/error.log`、`specforge/logs/gate.log`
    - _需求: 12.1, 12.2, 15.1_

  - [x] 1.3 创建 AGENT_CONSTITUTION.md
    - 在 `specforge/agents/AGENT_CONSTITUTION.md` 中定义 9 条底线规则
    - 包含：不得绕过 Gate、不得伪造验证、不得把推测当事实、不得直接修改权威状态、不得越权调用工具、除 Orchestrator 外不得直接向用户提问、不得创建未授权子 Agent、不得在需求文档中写设计、不得在设计文档中写任务
    - _需求: 5.1, 5.2_

  - [x] 1.4 创建项目配置文件
    - 创建 `specforge/config/project.json`（项目元数据配置）
    - 创建 `specforge/config/risk_policy.json`（风险策略配置）
    - _需求: 1.1_

  - [ ]* 1.5 编写目录结构集成测试
    - 验证所有目录和文件正确创建
    - 验证 state.json 初始内容格式正确
    - 验证 AGENT_CONSTITUTION.md 包含 9 条底线规则
    - _需求: 1.1, 1.2, 1.3, 5.2, 12.1_

- [x] 2. 检查点 — 确保基础骨架完整
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 3. Phase 2：Agent 文件 — 8 个 Agent 定义 + 8 个契约 + opencode.json
  - [x] 3.1 创建 sf-orchestrator Agent 定义文件
    - 在 `.opencode/agents/sf-orchestrator.md` 中定义 primary agent
    - 包含 frontmatter：description、mode=primary、model、temperature、steps、permission（task=allow）
    - 包含正文章节：Role、Responsibilities、Boundaries（引用 AGENT_CONSTITUTION.md）、Required Output
    - _需求: 2.1, 2.2, 2.3, 2.4, 5.3_

  - [x] 3.2 创建 7 个 Sub-Agent 定义文件
    - 创建 `.opencode/agents/sf-requirements.md`（mode=subagent, permission.task=deny）
    - 创建 `.opencode/agents/sf-design.md`（mode=subagent, permission.task=deny）
    - 创建 `.opencode/agents/sf-task-planner.md`（mode=subagent, permission.task=deny）
    - 创建 `.opencode/agents/sf-executor.md`（mode=subagent, permission.task=deny）
    - 创建 `.opencode/agents/sf-debugger.md`（mode=subagent, permission.task=deny）
    - 创建 `.opencode/agents/sf-reviewer.md`（mode=subagent, permission.task=deny, permission.edit=deny）
    - 创建 `.opencode/agents/sf-verifier.md`（mode=subagent, permission.task=deny, permission.edit=deny）
    - 每个文件包含 frontmatter 和 Role/Responsibilities/Boundaries/Required Output 章节
    - 每个文件在 Boundaries 中引用 AGENT_CONSTITUTION.md
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 5.3, 16.1_

  - [x] 3.3 创建 8 个 Agent 契约文件
    - 在 `specforge/agents/contracts/` 下为每个 Agent 创建 `<agent-name>.contract.md`
    - 每个契约文件包含：输入格式、输出格式、禁止行为列表、升级条件
    - _需求: 3.1, 3.2_

  - [x] 3.4 创建 opencode.json 配置
    - 为 8 个 Agent 配置条目，包含 mode、model、prompt 字段
    - prompt 字段引用对应的 `.opencode/agents/<agent-name>.md` 文件
    - 所有 Sub-Agent 的 permission.task 设为 deny
    - sf-reviewer 和 sf-verifier 的 permission.edit 设为 deny
    - _需求: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 3.5 编写 Agent 文件结构单元测试
    - 验证 8 个 agent.md 文件包含正确的 frontmatter 字段和正文章节
    - 验证 sf-orchestrator 的 mode 为 primary，其余为 subagent
    - 验证 sf-reviewer 和 sf-verifier 的 permission.edit 为 deny
    - 验证每个 agent.md 引用了 AGENT_CONSTITUTION.md
    - _需求: 2.2, 2.3, 2.4, 2.5, 5.3_

  - [ ]* 3.6 编写契约文件结构单元测试
    - 验证 8 个 contract.md 文件包含必需章节（输入格式、输出格式、禁止行为、升级条件）
    - _需求: 3.1, 3.2_

  - [ ]* 3.7 编写 opencode.json 配置单元测试
    - 验证 8 个 Agent 条目存在且配置正确
    - 验证所有 Sub-Agent 的 permission.task 为 deny
    - 验证 prompt 字段引用正确的文件路径
    - _需求: 4.1, 4.2, 4.3, 4.4, 16.1_

- [x] 4. 检查点 — 确保 Agent 体系完整
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 5. Phase 3：Custom Tools — 7 个工具实现
  - [x] 5.1 实现测试基础设施和共享工具函数
    - 配置 Vitest + fast-check 测试环境
    - 实现共享的日志写入函数（写入 app.log、error.log、gate.log）
    - 实现共享的敏感信息脱敏函数 `redactSensitive()`
    - 实现共享的 JSONL 追加写入函数 `appendJsonl()`
    - 实现共享的状态流转合法性验证表
    - _需求: 15.2, 15.6, 11.5_

  - [ ]* 5.2 编写脱敏函数属性测试
    - **Property 10: 敏感信息脱敏**
    - 使用 fast-check 生成包含随机敏感模式（api_key、token、password 等）的字符串
    - 验证脱敏后敏感值被替换为 "[REDACTED]"，非敏感内容不变
    - **验证: 需求 11.5, 15.6**

  - [ ]* 5.3 编写日志条目结构属性测试
    - **Property 9: 日志条目结构不变量**
    - 使用 fast-check 生成随机日志数据
    - 验证格式化后的日志条目包含 timestamp、level、component、event、message、payload 六个字段
    - 验证 timestamp 为合法 ISO 8601 格式
    - **验证: 需求 11.4, 15.2**

  - [x] 5.4 实现 sf_state_read 工具
    - 在 `.opencode/tools/sf_state_read.ts` 中实现
    - 使用 `tool()` helper 和 Zod schema 定义输入
    - 读取 `specforge/runtime/state.json`，返回指定 work_item_id 的当前状态
    - 处理 state.json 不存在、work_item_id 不存在等错误场景
    - _需求: 9.1, 9.8_

  - [x] 5.5 实现 sf_state_transition 工具
    - 在 `.opencode/tools/sf_state_transition.ts` 中实现
    - 使用 `tool()` helper 和 Zod schema 定义输入（work_item_id、from_state、to_state、evidence）
    - 验证 from_state 与当前权威状态一致（乐观锁）
    - 验证 to_state 是 from_state 的合法后继状态
    - 更新 state.json 并追加 state.transitioned 事件到 events.jsonl
    - 处理所有错误场景（状态不一致、非法流转、文件不存在等）
    - _需求: 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [ ]* 5.6 编写状态流转合法性属性测试
    - **Property 1: 状态流转合法性验证**
    - 使用 fast-check 生成随机 (from_state, to_state) 对，覆盖合法和非法组合
    - 验证：from_state 不匹配当前状态时返回失败
    - 验证：to_state 不是合法后继时返回失败
    - 验证：仅当 from_state 匹配且 to_state 合法时返回成功
    - **验证: 需求 6.3, 9.3, 9.4, 9.5, 9.6**

  - [ ]* 5.7 编写状态流转持久化往返属性测试
    - **Property 2: 状态流转持久化往返**
    - 使用 fast-check 生成随机合法流转序列
    - 验证：执行流转后读取 state.json 返回更新后的 current_state
    - 验证：events.jsonl 最后一条记录为 state.transitioned 事件，包含正确的 from/to
    - **验证: 需求 9.7, 12.4**

  - [ ]* 5.8 编写 Work Item 创建持久化属性测试
    - **Property 11: Work Item 创建持久化**
    - 使用 fast-check 生成随机 Work Item 数据
    - 验证：创建后读取 state.json 包含该 Work Item 条目
    - 验证：条目包含 work_item_id、workflow_type、current_state、created_at 四个字段
    - **验证: 需求 12.3**

  - [x] 5.9 实现 sf_doc_lint 工具
    - 在 `.opencode/tools/sf_doc_lint.ts` 中实现
    - 使用 `tool()` helper 和 Zod schema 定义输入（work_item_id、doc_type）
    - 根据 doc_type 检查对应文档的结构合规性
    - requirements：检查"简介"、"术语表"、"需求"章节
    - design：检查设计相关章节且不包含任务拆分内容
    - tasks：检查每个 task 包含描述和 verification_commands
    - 返回 `{ status, issues }` 结构
    - _需求: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 5.10 实现 sf_requirements_gate 工具
    - 在 `.opencode/tools/sf_requirements_gate.ts` 中实现
    - 使用 `tool()` helper 和 Zod schema 定义输入
    - 检查 requirements.md 是否存在、是否包含用户故事和验收标准、是否包含术语表
    - 返回 `{ status, blocking_issues, warnings, next_action }` 结构
    - _需求: 8.1, 8.2, 8.3, 8.4, 8.8_

  - [x] 5.11 实现 sf_design_gate 工具
    - 在 `.opencode/tools/sf_design_gate.ts` 中实现
    - 检查 design.md 是否存在、是否引用了 requirements.md 中的需求编号
    - 返回 Gate 通用输出结构
    - _需求: 8.1, 8.2, 8.3, 8.5, 8.8_

  - [x] 5.12 实现 sf_tasks_gate 工具
    - 在 `.opencode/tools/sf_tasks_gate.ts` 中实现
    - 检查 tasks.md 是否存在、每个 task 是否包含 verification_commands 字段
    - 返回 Gate 通用输出结构
    - _需求: 8.1, 8.2, 8.3, 8.6, 8.8_

  - [x] 5.13 实现 sf_verification_gate 工具
    - 在 `.opencode/tools/sf_verification_gate.ts` 中实现
    - 检查是否存在测试执行结果、测试是否全部通过
    - 返回 Gate 通用输出结构
    - _需求: 8.1, 8.2, 8.3, 8.7, 8.8_

  - [ ]* 5.14 编写 Gate 输出结构属性测试
    - **Property 3: 工具输出结构不变量**
    - 使用 fast-check 生成随机 work_item_id 和文档状态
    - 验证 4 个 Gate 工具输出包含 status、blocking_issues、warnings、next_action 四个字段
    - 验证 sf_doc_lint 输出包含 status 和 issues 两个字段
    - **验证: 需求 8.3, 10.5**

  - [ ]* 5.15 编写需求文档章节检测属性测试
    - **Property 4: 需求文档章节检测**
    - 使用 fast-check 生成随机 markdown 文档，随机包含/缺少"简介"、"术语表"、"需求"章节
    - 验证 sf_requirements_gate 和 sf_doc_lint 正确识别缺失章节
    - **验证: 需求 8.4, 10.2**

  - [ ]* 5.16 编写设计文档验证属性测试
    - **Property 5: 设计文档验证**
    - 使用 fast-check 生成随机 design.md，随机包含/缺少需求引用和任务内容
    - 验证 sf_design_gate 检测需求引用缺失时报告 fail
    - 验证 sf_doc_lint 检测任务拆分内容时报告 fail
    - **验证: 需求 8.5, 10.3**

  - [ ]* 5.17 编写任务文档验证属性测试
    - **Property 6: 任务文档验证**
    - 使用 fast-check 生成随机 tasks.md，随机包含/缺少 verification_commands
    - 验证 sf_tasks_gate 和 sf_doc_lint 正确识别缺失字段
    - **验证: 需求 8.6, 10.4**

  - [ ]* 5.18 编写验证 Gate 测试结果评估属性测试
    - **Property 7: 验证 Gate 测试结果评估**
    - 使用 fast-check 生成随机测试结果状态（全部通过、部分失败、结果缺失）
    - 验证 sf_verification_gate 在全部通过时返回 pass，其他情况返回 fail 或 blocked
    - **验证: 需求 8.7**

  - [ ]* 5.19 编写 Zod Schema 输入验证属性测试
    - **Property 8: Zod Schema 输入验证**
    - 使用 fast-check 生成随机非法输入（缺少必需字段、类型错误等）
    - 验证所有 7 个 Custom Tool 拒绝非法输入并返回验证错误
    - 验证合法输入不触发 schema 验证错误
    - **验证: 需求 8.8, 9.8, 10.6**

  - [ ]* 5.20 编写 Custom Tools 单元测试
    - 为 sf_state_read 编写单元测试（正常读取、work_item 不存在、state.json 不存在）
    - 为 sf_state_transition 编写单元测试（合法流转、非法流转、状态不一致）
    - 为 sf_doc_lint 编写单元测试（各 doc_type 的通过和失败场景）
    - 为 4 个 Gate 工具编写单元测试（文档存在/不存在、内容合规/不合规）
    - _需求: 8.1-8.8, 9.1-9.8, 10.1-10.6_

- [x] 6. 检查点 — 确保所有 Custom Tools 工作正常
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 7. Phase 4：Plugin — 事件记录器
  - [x] 7.1 实现 sf_event_logger Plugin
    - 在 `.opencode/plugins/sf_event_logger.ts` 中实现
    - 导出符合 `Plugin` 类型的异步函数
    - 监听 `tool.execute.after` 事件，将工具调用信息追加写入 `specforge/logs/tool_calls.jsonl`
    - 监听 `session.idle` 和 `session.status` 事件，记录会话状态变化
    - 日志格式为 JSONL，每条包含 timestamp、level、component、event、message、payload
    - 调用共享的 `redactSensitive()` 函数对日志内容脱敏
    - 调用共享的 `appendJsonl()` 函数写入日志
    - 日志目录不存在时自动创建
    - 写入失败时静默处理，不阻断主流程
    - _需求: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 7.2 编写 sf_event_logger 单元测试
    - 验证 tool.execute.after 事件正确写入 JSONL
    - 验证 session 事件正确记录
    - 验证敏感信息被脱敏
    - 验证写入失败时静默处理
    - _需求: 11.2, 11.3, 11.4, 11.5_

  - [ ]* 7.3 编写事件记录集成测试
    - 验证 Plugin 与 Custom Tools 协作：工具调用后事件正确写入 tool_calls.jsonl
    - 验证 Gate 执行后结果写入 gate.log
    - 验证错误信息写入 error.log
    - 验证阶段转换事件写入 app.log
    - _需求: 15.3, 15.4, 15.5_

- [x] 8. 检查点 — 确保 Plugin 事件记录正常
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 9. Phase 5：Superpowers 适配 — 2 个 Skill 文件
  - [x] 9.1 创建 superpowers-brainstorming Skill
    - 在 `.opencode/skills/superpowers-brainstorming/SKILL.md` 中创建
    - 包含 YAML frontmatter：name、description、autoload=false
    - 指导 Agent 从 7 个维度进行头脑风暴：业务需求、技术约束、用户体验、安全合规、运维部署、成本预算、扩展性
    - 要求每个维度至少列出一个考虑点后再开始撰写需求
    - _需求: 13.1, 13.2, 13.3_

  - [x] 9.2 创建 superpowers-verification-before-completion Skill
    - 在 `.opencode/skills/superpowers-verification-before-completion/SKILL.md` 中创建
    - 包含 YAML frontmatter：name、description、autoload=false
    - 要求 Agent 在声明完成前提供 3 类验证证据：测试执行结果、构建成功证据、验收标准逐项确认
    - 禁止在没有验证证据的情况下标记任务为 completed
    - _需求: 14.1, 14.2, 14.3_

  - [ ]* 9.3 编写 Skill 文件内容单元测试
    - 验证 brainstorming Skill 包含 7 个维度关键词
    - 验证 verification Skill 包含 3 类证据要求关键词
    - 验证两个 Skill 文件的 YAML frontmatter 格式正确
    - _需求: 13.2, 14.2_

- [x] 10. Phase 6：Orchestrator 核心流程 — 完善主 Agent 和工作流串联
  - [x] 10.1 完善 sf-orchestrator.md 核心流程
    - 在 sf-orchestrator.md 中定义意图判断逻辑（new_feature、bug_report、question、other）
    - 定义工作流选择逻辑（new_feature → feature_spec Requirements-First）
    - 定义阶段推进流程：intake → requirements → requirements_gate → design → design_gate → tasks → tasks_gate → development → review → verification → verification_gate
    - 定义 Gate 结果处理：pass → 继续、fail → 回退修订、blocked → 报告用户
    - 定义子 Agent 调度规则：每个阶段调度对应的 Sub-Agent
    - 定义 Skill 加载规则：requirements 阶段加载 brainstorming、verification 阶段加载 verification-before-completion
    - 定义失败重试策略：executor 最多 2 次、debugger 最多 1 次、review repair loop 最多 1 次
    - 定义角色边界：只做项目管理和用户沟通，不执行技术任务
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.1-7.9, 13.4, 14.4, 17.1-17.5, 18.1, 18.2, 18.3_

  - [x] 10.2 更新 AGENTS.md 总览文档
    - 列出所有 8 个 Agent 的名称、类型、职责概述
    - 说明调用层级和权限模型
    - 说明 Feature Spec 工作流的完整阶段
    - _需求: 1.2_

  - [ ]* 10.3 编写权限配置单元测试
    - 验证所有 Sub-Agent 的 permission.task 为 deny
    - 验证调用深度限制为最多 3 层
    - 验证 sf-reviewer 和 sf-verifier 的 permission.edit 为 deny
    - _需求: 16.1, 16.2, 16.3_

  - [ ]* 10.4 编写 Gate 到状态流转链路集成测试
    - 验证 Gate pass 后状态正确流转到下一阶段
    - 验证 Gate fail 后状态回退到前一阶段
    - 验证 Gate blocked 后状态流转到 blocked
    - _需求: 6.3, 6.4, 6.5_

  - [ ]* 10.5 编写事件类型支持单元测试
    - 验证 4 种核心事件类型（work_item.created、document.generated、gate.executed、state.transitioned）可正常创建和写入
    - _需求: 12.5_

- [x] 11. 最终检查点 — 确保所有测试通过，全部组件集成完毕
  - 确保所有测试通过，如有疑问请向用户确认。
  - 运行完整测试套件，确认无失败用例。
  - 确认所有 18 项需求均有对应的实现任务和测试覆盖。

## 说明

- 标记 `*` 的子任务为可选任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号，确保可追溯性
- 检查点任务确保增量验证，及早发现问题
- 属性测试验证 11 个正确性属性的普遍正确性
- 单元测试验证具体场景和边界条件
- 集成测试验证组件间协作
