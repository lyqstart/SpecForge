# WI-007 Intake: SpecForge v1.1 Standard Alignment

## 变更背景

SpecForge 项目已根据 `specforge_final_fused_standard_v1_1_patch1_zh.md` 完成了 v1.1 核心模块的 TypeScript 实现（13 个 `-v11.ts` 模块、10 个 handler、11 条 HTTP API 路由、94 个测试），但存在两个层面的严重差距：

1. **代码层面**：大量 v1.1 标准要求的独立模块被合并到现有的 `-v11.ts` 大文件中，标准要求它们作为独立模块存在（如 `change-classification.ts`、`impact-analysis.ts`、`trigger-result.ts` 等 24 个模块）
2. **文档层面**：所有 Agent 定义文件（`agents/*.md`）、Skill 文件（`skills/**/*.md`）、AGENT_CONSTITUTION.md 均未更新以反映 v1.1 的 Candidate/Delta/Gate/Trace/Evidence/Extension 概念

## 变更动机

standard v1.1 文档内要求具有最高优先级。当前实现不满足标准在以下方面的要求：
- 独立模块拆分（§6-§16 各节要求独立 .ts 文件）
- Agent 定义文档更新（§14 Agent 职责体系）
- Extension Subflow Agent 定义（补丁1）
- 项目结构合规性（§1-§2）

## 受影响模块

### 代码文件（packages/daemon-core/src/tools/lib/）
需要新建 24 个独立模块，从现有大文件中拆分或全新实现：
- `change-classification.ts`, `impact-analysis.ts`, `trigger-result.ts` — 从 workflow-path-selector-v11.ts 拆分
- `required-files.ts`, `required-gates.ts` — 新建
- `gate-report.ts`, `gate-summary.ts`, `gate-chain.ts` — 从 gate-runner-v11.ts 拆分
- `user-decision.ts`, `waiver.ts` — 新建/拆分
- `allowed-write-files.ts`, `write-policy.ts`, `command-write-audit.ts`, `changed-files-audit.ts` — 新建/拆分
- `tool-wrapper.ts`, `bash-guard.ts` — 新建
- `verification-report.ts`, `evidence-manifest.ts`, `evidence.ts`, `close-gate.ts` — 新建/拆分
- `extension-registry.ts`, `extension-request.ts`, `extension-gate.ts` — 新建/拆分
- `path-service.ts`, `path-policy.ts`, `project-layout.ts` — 新建/拆分
- `schema.ts`, `constants.ts` — packages/types/src/ 新建

### Agent 定义文件（setup/userlevel-opencode/agents/）
需要更新 10 个现有文件 + 新建 1 个：
- UPDATE: `_AGENT_BASE.md`, `sf-orchestrator.md`, `sf-design.md`, `sf-requirements.md`, `sf-verifier.md`, `sf-executor.md`, `sf-debugger.md`, `sf-reviewer.md`, `sf-task-planner.md`, `sf-knowledge.md`
- CREATE: `sf-extension.md`

### Skill 文件（~/.config/opencode/skills/）
需要更新 12 个现有 Skill 的 SKILL.md

### 用户级配置
需要更新 `AGENT_CONSTITUTION.md`

## 期望变更结果

1. 所有 v1.1 标准要求的独立模块文件都存在且有实际实现
2. 所有 Agent 定义文件反映 v1.1 的 WI 生命周期、Candidate/Delta/Gate/Trace/Evidence 概念
3. `sf-extension.md` 作为新 Agent 定义存在
4. 所有 Skill 文件反映 v1.1 工作流路径和验证要求
5. 项目构建（15 个包）保持零错误
6. 现有 94 个 v1.1 测试保持通过

## 优先级

CRITICAL — standard v1.1 要求具有最高优先级

## 约束

- 现有 `-v11.ts` 大文件中的功能不得删除，只可拆分/重导出
- 所有新模块必须通过 TypeScript 严格模式编译
- 保持向后兼容（现有 handler/API 路由不受影响）
- `packages/types/src/` 的变更必须同步到依赖包
