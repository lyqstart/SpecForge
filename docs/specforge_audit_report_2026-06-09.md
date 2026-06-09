# SpecForge 项目审查报告（基于 final fused standard v1.1 Patch 1）

审查对象：

1. OpenCode 官方机制：plugins / tools / agents / skills / config。
2. GitHub 项目页面与可访问 raw 文件：`https://github.com/lyqstart/specforge.git`。
3. 附件 `spec-opencode(1).zip`：用户级 `~/.config/opencode/` 扩展包，包括 agents、tools、plugins、skills。
4. 附件 `specforge_final_fused_standard_v1_1_patch1_zh(3).md`。

## 1. 总体结论

当前不能判定为“符合 final fused standard，可直接作为 v1.1 标准执行包使用”。

需要分开看：

- GitHub `main` 页面显示项目已经向 v1.1 闭环能力演进，公开 README 声称包括 Write Guard、Gate、Changed Files Audit、状态机、Legacy 只读等能力；可访问 raw 文件中也能看到 `directory-layout.ts` 已切换到 `.specforge/project/`、`.specforge/work-items/`、`.specforge/runtime/`，并新增 `extension_registry.json`、Path Policy、legacy read-only 对象。
- 但附件 `spec-opencode.zip` 明显还是旧工作流包：大量 Agent、Tool、Skill 仍写 `.specforge/specs/<WI>`、`.specforge/config`、`.specforge/archive`、`~/.specforge`，状态机仍是 `feature_spec / bugfix_spec / quick_change / change_request` 旧模型，未落实 v1.1 的 `workflow_path`、Candidate、Gate Summary、User Decision、Merge Runner、close_gate 闭环。

因此，真实风险不是“项目完全没做”，而是“仓库源码和安装到 OpenCode 的用户级扩展包不一致”。如果用户当前运行的是附件这套 `~/.config/opencode` 扩展包，那么 SpecForge 的行为仍会按旧规则执行，无法保证 v1.1 标准。

## 2. 最严重阻断项

### P0-1：附件扩展包仍以旧 `.specforge/specs/<WI>` 为主路径

标准要求：MVP 项目级 `.specforge/` 只能创建 `project/`、`work-items/`、`runtime/`，旧 `.specforge/specs/<WI-ID>/` 只能 legacy read-only，新 WI 不得写入旧路径。

附件证据：

- `tools/lib/directory-layout.ts:90-176` 仍把 `manifest`、`config`、`specs`、`knowledge`、`archive`、`sessions`、`cas` 放在主 `LAYOUT`。
- `tools/lib/directory-layout.ts:247-253` 的 `specPath()` 仍写入 `.specforge/specs/<WI>/<file>`。
- `tools/lib/directory-layout.ts:328-334` 的 `workItemPath()` 仍等价于 `.specforge/specs/<WI>/...`。
- `tools/lib/sf_artifact_write_core.ts:92-105` 将 `verification_report`、`review_report`、`intake` 写到 `.specforge/specs/<WI>/...`，将 work_log 写到 `.specforge/archive/agent_runs/...`。
- `agents/sf-design.md:362-383` 要求在 `.specforge/specs/<work_item_id>/` 中生成 `design.md`。
- `skills/superpowers-knowledge-extraction/SKILL.md:13-24` 仍将 `.specforge/sessions`、`.specforge/archive`、`.specforge/specs`、`.specforge/knowledge`、`.specforge/logs` 作为证据主路径。

判断：这是 v1.1 标准下的硬冲突。只要这些扩展包被 OpenCode 加载，Agent 和工具会继续创建/读取/写入旧结构。

整改：

1. 先不要继续补 Agent 文案。
2. 先重新生成并安装 OpenCode 扩展包，确保 `~/.config/opencode/tools/lib/directory-layout.ts` 与仓库 `packages/types/src/directory-layout.ts` 使用同一套 v1.1 Path Service。
3. 删除或隔离旧 `specPath()`、`workItemPath()`、`.specforge/specs` 写入口。需要读取旧 specs 的地方必须显式调用 `legacyPaths`，并在函数名中带 `legacyReadOnly`。

### P0-2：附件状态机仍是旧工作流，不是 v1.1 主状态机

标准要求：状态必须支持 `created → intake_ready → impact_analyzing → ... → closed` 的 v1.1 主状态，并禁止直接进入 implementation、禁止 approval 直接 merge/close、禁止 closed 后再写。

附件证据：

- `tools/lib/state_machine.ts:15-30` 仍定义 `WorkflowType = feature_spec | bugfix_spec | feature_spec_design_first | quick_change | change_request | refactor | ops_task | investigation ...`。
- `tools/lib/state_machine.ts:42-75` 仍定义旧状态：`intake`、`requirements`、`requirements_gate`、`requirements_approval`、`design`、`design_gate`、`development`、`completed` 等。
- `agents/sf-orchestrator.md:1-80` 仍围绕 Feature Spec 的 `requirements_gate → requirements_approval → design` 和 `design_gate → design_approval → tasks` 运行。

GitHub `main` 可访问 raw 文件中已有 `state-machine-v11.ts`，说明仓库主线可能已有 v1.1 状态机；但附件扩展包没有同步。

判断：运行态扩展包不符合 v1.1。

整改：

1. OpenCode 工具层必须调用 v1.1 runtime service，例如 `state-machine-v11.ts`，而不是旧 `tools/lib/state_machine.ts`。
2. Agent 文案里的 `feature_spec / quick_change / change_request` 必须映射或替换为标准 `workflow_path`：`requirement_change_path`、`design_change_path`、`architecture_change_path`、`task_change_path`、`code_only_fast_path`、`spec_migration_path`、`rollback_path`。
3. `completed` 不应再作为闭环成功终态；终态必须经 `verification_done → close_gate → closed`。

### P0-3：OpenCode 插件目前主要是“事件上报”，不是强制 Write Guard

标准要求：Write Guard 是程序级写入拦截器，必须覆盖 edit、SpecForge 写文件工具、bash、formatter、generator、package manager、snapshot update、Git 写入；所有可能写文件的命令必须声明 expected_write_files，无声明默认只读或阻断。

附件证据：

- `plugins/sf_specforge.ts:48-93` 只在 `tool.execute.before/after`、`event`、chat hooks 中 `postEvent()` 到 daemon。
- 这些 hook 包装函数 `wrap()` 捕获异常后只 `console.warn`，不抛出，因此即使 daemon 检查失败，也不会阻断 OpenCode 原生工具执行。
- 插件没有对 `edit/write/apply_patch/bash` 的参数做 `checkWrite()` 判断，也没有在违规时 `throw new Error(...)`。
- OpenCode 官方插件示例显示，要阻断工具行为，需要在 `tool.execute.before` 中抛出错误，例如 `.env protection` 示例对 `.env` read 直接 `throw new Error("Do not read .env files")`。

判断：附件插件最多能做审计/遥测，不能承担 v1.1 的 Write Guard 硬拦截。

整改：

1. 在 `tool.execute.before` 中识别 `edit`、`write`、`apply_patch`、`bash`、自定义写文件工具、git 相关工具。
2. 调 daemon 的 `checkWrite` / `bashGuard` / `expected_write_files` 校验。
3. 违规时必须 `throw`，不能 warn 后放行。
4. 对无法解析写集合的 bash 命令，默认只读或阻断。
5. `tool.execute.after` 再做 `changed_files_audit`，发现越界后将 WI 标记 blocked，阻止 close。

### P0-4：Agent 权限与标准的“普通 Agent 不得写受控文件”冲突

标准要求：普通 Agent 不得推进 WI 状态、释放 code_permission、写 `.specforge/project/**`、写 `user_decision.json`、写 `gates/**`、写 `gate_summary.md`、写 `merge_report.md`、关闭 WI。

附件证据：

- `agents/sf-orchestrator.md:6-10` 给 orchestrator `edit: allow`。
- `agents/sf-requirements.md:6-10`、`sf-design.md:6-10`、`sf-task-planner.md:6-10` 都是 `edit: allow`。
- `sf-executor.md:6-10`、`sf-debugger.md:6-10` 是 `edit: allow`、`bash: allow`。
- OpenCode 官方文档说明 `edit` 是修改文件主工具，`write` 创建/覆盖文件也受 `edit` permission 控制，`apply_patch` 也属于文件修改权限范畴。

判断：如果没有强制 Write Guard，Agent 拥有 OpenCode 原生写权限，就可以绕过 v1.1 流程。靠提示词说“不要写”不够。

整改：

1. 短期：把非 executor/debugger 的 Agent `edit` 改为 `deny`，只允许它们通过受控 `sf_artifact_write` 写入当前 WI 允许的过程文件。
2. 中期：不要依赖 OpenCode permission 表达业务权限；权限必须由 Write Guard 根据 active WI、callerRole、targetPath、operation 判断。
3. `sf_artifact_write` 自身也必须接入 Write Guard，而不是只检查路径前缀。

### P0-5：Candidate / Manifest / User Decision / Merge Runner 在附件扩展包中没有形成闭环

标准要求：正式规格只能通过 Candidate + Gate + User Decision + Merge Runner 合并。Candidate 必须完整文件，位于 `work-items/<WI>/candidates/`，`candidate_manifest.json` 所有 WI 必须生成，Merge Runner 只能按 manifest 合并。

附件证据：

- 附件 grep 可见大量 `allowed_write_files`、Gate、review、verification 文案，但没有找到与 v1.1 完整 `candidate_manifest`、`manifest_hash`、`candidate_hash`、`base_spec_version`、`merge_ready_gate`、`post_merge_gate`、`Merge Runner` 实现相匹配的 OpenCode 工具文件。
- 附件工具列表没有 `sf_user_decision_record`、`sf_merge_runner`、`sf_close_gate`、`sf_code_permission_release` 这类独立受控工具。
- `sf_artifact_write_core.ts` 仍允许写旧规格过程文件，不是 Candidate 写入器。

GitHub `main` 的 `packages/daemon-core/src/index.ts` 已导出 `merge-runner-v11`、`user-decision-recorder-v11`、`code-permission-service-v11`、`write-guard-v11`、`gate-runner-v11` 等模块，说明仓库源代码可能补了 runtime 层；但附件扩展包没有相应 thin-client 工具暴露。

判断：运行态不可闭环。

整改：

1. 给 OpenCode 暴露最少 6 个 v1.1 工具：`sf_gate_run`、`sf_gate_summary`、`sf_user_decision_record`、`sf_merge_run`、`sf_code_permission`、`sf_close_gate`。
2. 所有 Agent 不再直接写 `gate_summary.md`、`user_decision.json`、`merge_report.md`。
3. Candidate 写入必须专门受控：只允许写 `.specforge/work-items/<WI>/candidates/**` 和 `candidate_manifest.json`，冻结后禁止改。

### P0-6：final fused standard Patch 1 的 extension_registry / Extension Subflow 未落到附件扩展包

标准要求：`.specforge/project/extension_registry.json` 必须存在，`spec_manifest.json` 必须登记，Agent 发现缺少类型必须写 `extension_request.json`，由 sf-orchestrator 调度 `sf-extension`，经 extension_gate、User Decision、Merge Runner 后恢复主流程。

附件证据：

- 附件中没有 `agents/sf-extension.md`。
- 附件 Agent 文案没有系统性要求“使用类型前读取 extension_registry”。
- 附件工具层没有 `extension_gate`、`extension_request` 专用处理逻辑。
- 附件 `tools/lib/directory-layout.ts` 没有 `.specforge/project/extension_registry.json` 作为正式规格路径。

判断：Patch 1 没有进入运行态扩展包。

整改：

1. 增加 `sf-extension.md`。
2. 增加 `extension_gate`。
3. 在 requirements/design/task/verification/gate 生成前统一读取 `extension_registry.json`。
4. 缺类型时只能写 `extension_request.json`，不能继续生成依赖未知类型的 Candidate。

## 3. OpenCode 适配性问题

### 3.1 插件安装位置基本正确

OpenCode 官方支持把本地插件放在 `.opencode/plugins/` 或 `~/.config/opencode/plugins/`，启动时自动加载。附件把插件放在 `plugins/sf_specforge.ts`，如果安装器复制到 `~/.config/opencode/plugins/`，方向是正确的。

### 3.2 Skills 有两个加载问题

OpenCode 官方要求每个 `SKILL.md` 必须有 YAML frontmatter，且只识别 `name`、`description`、`license`、`compatibility`、`metadata` 等字段；`name` 必须匹配目录名。

附件问题：

- `skills/sf-intake/SKILL.md:1-5` 有 frontmatter，但缺少 `name`，并使用了未知字段 `mode`、`autoload`。
- `skills/superpowers-knowledge-extraction/SKILL.md:1-4` 没有 YAML frontmatter。

影响：这两个 skill 可能不会按预期被 OpenCode 发现或选择。

整改：

```yaml
---
name: sf-intake
description: SpecForge intake 阶段提问脚本，由 sf-orchestrator 在 intake 阶段使用。
---
```

`superpowers-knowledge-extraction` 也必须补同样结构。

### 3.3 插件使用 `~/.specforge/lib/sf_plugin_client.ts` 与标准冲突

附件插件：

- `plugins/sf_specforge.ts:6-20` 默认从 `~/.specforge/install.json` 和 `~/.specforge/lib/sf_plugin_client.ts` 动态加载 client。

标准要求：新版本不得默认写入 `~/.specforge/`，`~/.specforge/` 只作为 legacy read-only 来源。

整改：

- client 库应放到 `~/.config/opencode/sf-user/` 或插件包自身可解析路径。
- `~/.specforge/install.json` 只能作为 legacy 迁移读取，不能作为新安装默认路径。

## 4. GitHub 仓库与附件扩展包的不一致

GitHub README 页面显示：

- 项目是“运行在 OpenCode 上的规格驱动 AI 开发控制系统（v1.1）”。
- README 描述了 `Intake → Classification → Impact Analysis → Candidate → Gate → User Decision → Merge → Post-Merge Verify → Close`。
- README 显示安装后目录已经包括 `.specforge/project/extension_registry.json`、`.specforge/work-items/<WI>/...`、`.specforge/runtime/...`。

可访问 raw 文件显示：

- `packages/types/src/directory-layout.ts` 已经把 v1.1 的 `project`、`work-items`、`runtime` 作为主布局。
- `packages/daemon-core/src/index.ts` 已导出 `state-machine-v11`、`gate-runner-v11`、`merge-runner-v11`、`write-guard-v11`、`user-decision-recorder-v11`、`code-permission-service-v11`、`workflow-path-selector-v11`、`work-item-lifecycle-v11`。

但附件扩展包仍是旧版本。最可能的情况：

1. 仓库 runtime 层已经做了一部分 v1.1。
2. 安装器没有把新 runtime 能力正确同步到 `~/.config/opencode` 扩展层。
3. Agent/Skill/Tool 文案和 thin-client 工具仍停留在 V6/旧 specs 工作流。

这会导致实际使用时出现“源码看起来合规，OpenCode 运行时不合规”。

## 5. 建议整改顺序

### 第一阶段：先修运行态一致性

目标：让 `spec-opencode.zip` 与仓库 v1.1 runtime 对齐。

必须完成：

1. 安装器重新打包 `~/.config/opencode` 扩展层。
2. OpenCode 扩展层不再包含旧 `tools/lib/directory-layout.ts`。
3. 所有 Agent / Skill / Tool 中的 `.specforge/specs` 写入口改为 `.specforge/work-items`。
4. `.specforge/archive`、`.specforge/sessions`、`.specforge/logs`、`.specforge/config`、`.specforge/knowledge` 改为 legacy read-only 或 runtime 下合规路径。
5. 补齐 `sf-extension`、`extension_gate`、`extension_request` 流程。

验收方式：

```bash
grep -R "\.specforge/specs\|\.specforge/archive\|\.specforge/config\|\.specforge/knowledge\|~/.specforge" ~/.config/opencode
```

允许存在的结果必须全部带 `legacy read-only`，不得出现在写入函数、Agent 输出路径、Skill 主流程路径中。

### 第二阶段：把 Write Guard 变成真实拦截

目标：OpenCode 原生写工具也不能绕过 SpecForge。

必须完成：

1. `tool.execute.before` 对写工具执行 daemon `checkWrite`。
2. 违规必须 `throw Error`。
3. `wrap()` 不能吞掉 Write Guard 错误。
4. `sf_artifact_write` 接入同一 Write Guard。
5. bash 必须解析 `expected_write_files`；没有声明的写命令阻断。

验收场景：

1. 无 WI 时让 Agent 改代码，应被阻断。
2. `code_change_allowed=false` 时让 Agent 改代码，应被阻断。
3. 让 Agent 改 allowed_write_files 外的文件，应被阻断。
4. 让普通 Agent 写 `.specforge/project/requirements_index.md`，应被阻断。
5. 让普通 Agent 写 `user_decision.json`，应被阻断。

### 第三阶段：补齐闭环控制工具

目标：聊天“同意”不能直接变 Merge；普通 Agent 不能造 Gate / Merge 事实。

必须暴露并强制使用：

- `sf_gate_run`
- `sf_gate_summary`
- `sf_user_decision_record`
- `sf_merge_run`
- `sf_code_permission_release/revoke`
- `sf_changed_files_audit`
- `sf_close_gate`

验收场景：

1. Candidate 生成后，未写 `user_decision.json`，merge 应失败。
2. 改动 Candidate 后，旧 User Decision 应 invalidated。
3. base_spec_version 不一致，merge_ready_gate 应失败。
4. code_only_fast_path 也必须生成 `candidate_manifest.entries=[]` 和 `merge_report.status=not_applicable`。

### 第四阶段：再修 Agent 文案

目标：Agent 只做专业内容，不做流程裁判。

需要改：

1. `sf-orchestrator.md` 不再直接说 Feature Spec 两次 approval，而是按 v1.1 `workflow_path` 分流。
2. `sf-requirements`、`sf-design`、`sf-task-planner` 输出 Delta / Candidate，而不是直接写正式 specs。
3. `sf-executor` 只在 `implementation_ready` 且 code_permission 已释放后执行。
4. `sf-reviewer`、`sf-verifier` 的证据路径切到 `work-items/<WI>/evidence/evidence_manifest.json`。
5. 所有 Agent handoff 增加：`Inputs Read / Outputs Written / Findings / Unknowns / Escalation Signals / Next Step Recommendation / Boundary Statement`。

## 6. 最终判定

| 审查项 | GitHub main 可见状态 | 附件 spec-opencode 状态 | 判定 |
|---|---|---|---|
| OpenCode 插件/Agent/Tool/Skill 基础结构 | 基本方向正确 | 基础结构存在 | 可用但不等于合规 |
| v1.1 目录模型 | raw 文件可见已实现 | 扩展包仍旧路径 | 阻断 |
| v1.1 状态机 | raw 文件可见已实现 | 扩展包仍旧状态机 | 阻断 |
| Write Guard | raw 文件可见有核心模块 | 插件未硬拦截 | 阻断 |
| Candidate / Manifest / User Decision / Merge | raw 文件可见有导出 | 扩展包未暴露闭环工具 | 阻断 |
| extension_registry / Extension Subflow | raw 目录模型可见 registry | 扩展包缺 sf-extension 流程 | 阻断 |
| Skills OpenCode 兼容性 | 未完整审查 | 2 个 skill frontmatter 不合规 | 重要缺陷 |
| Agent 职责边界 | 未完整审查 | 多个普通 Agent 有 edit allow | 高风险 |

结论：

附件 `spec-opencode.zip` 不能作为 final fused standard v1.1 Patch 1 的合规运行包。GitHub 仓库主线看起来已经补了若干 v1.1 runtime 能力，但必须把 runtime 能力、安装器、OpenCode 扩展层、Agent/Skill 文案、插件硬拦截全部打通，才算真正可运行的 v1.1。

## 7. 整改实施计划

基于本审查报告，已启动 **SpecForge v1.1 标准合规整改项目**（项目代号：`specforge-v1-1-compliance-remediation`）。

### 7.1 整改范围

整改项目将按照 SpecForge v1.1 + Patch 1 标准，系统性地将当前系统从"Agent 工作流框架"迁移为"不可绕过的规格驱动 Runtime"。整改覆盖本审查报告中识别的所有 P0 阻断项，并建立程序级硬约束以替代当前依赖 Agent 提示词的软控制。

### 7.2 整改轮次

整改项目分 5 轮实施，每轮建立递进的控制能力：

**Round 1: 目录模型迁移与路径治理**
- 实现 v1.1 标准目录结构（`.specforge/project/`、`.specforge/work-items/`、`.specforge/runtime/`）
- 实现 Path Service 和 Path Policy，统一路径生成和校验
- 建立 Legacy Specs 只读保护机制
- 禁止创建废弃目录（`archive/`、`state/`、`gates/`）
- **解决 P0-1 阻断项**

**Round 2: v1.1 事务状态机实现**
- 实现完整的 24 状态事务状态机
- 实现状态转换合法性校验（禁止跳过规格阶段、禁止非法终态转换）
- 实现状态转换授权控制（只允许 Runtime 组件推进状态，Agent 不得直接操作）
- 建立状态持久化和历史追踪机制
- **解决 P0-2 阻断项**

**Round 3: Candidate 合并主链实现**
- 实现 Candidate 格式验证（完整文件内容，禁止 patch/diff）
- 实现 Candidate Manifest 路径校验
- 实现 Gate Runner 和门禁执行框架
- 实现 User Decision Recorder 及哈希绑定机制
- 实现 Merge Runner 及合并前置条件校验
- 实现 post-merge gate 和项目规格版本递增
- 建立受保护文件写入隔离（Agent 不得写入 `.specforge/project/**`、`user_decision.json`、`gates/**` 等）
- **解决 P0-5 阻断项**

**Round 4: Write Guard 硬约束实现**
- 实现 Write Guard 拦截器框架，覆盖所有写入工具类型
- 实现 Code Permission Service 管理代码修改权限
- 实现 Changed Files Audit 审计文件变更
- 实现冻结文件保护和特权组件授权
- 实现 write_scope_gate 集成
- **解决 P0-3 和 P0-4 阻断项**

**Round 5: Extension Registry 与 Extension Subflow 实现**
- 实现 Extension Registry 正式规格和初始化
- 实现未知类型检测机制
- 实现 Extension Subflow 调度流程
- 实现 extension_gate 验证
- 实现扩展批准和合并流程
- 实现主流程恢复机制
- 实现扩展写入保护
- **解决 P0-6 阻断项**

### 7.3 横切关注点

以下能力在各轮实施中同步完成：

- **解析器和序列化器测试**：所有 JSON 解析器和序列化器具备往返测试属性（Round-trip Property）
- **Close Gate 完整性检查**：验证所有必要条件满足后才允许关闭工作项
- **Runtime 组件职责定义**：明确各组件职责边界，实现清晰的职责分离和权限控制

### 7.4 整改验收

每轮完成后进行验收测试，确保该轮的所有验收标准通过后再进入下一轮。完整的验收标准包括：

1. **功能验收**：所有需求的验收标准（Acceptance Criteria）必须通过
2. **属性测试验收**：所有往返属性（Round-trip Properties）、授权属性、保护属性等必须通过基于属性的测试（Property-Based Testing），最少 100 次迭代
3. **集成验收**：完整工作项生命周期必须按 v1.1 标准流转，无非法状态转换、无未授权写入
4. **合规验收**：所有 P0 阻断项必须修复并通过回归测试

### 7.5 整改产物

整改项目已生成以下正式规格文档：

- **需求文档**：`.kiro/specs/specforge-v1-1-compliance-remediation/requirements.md`  
  定义 8 个主要需求，覆盖目录模型、状态机、合并主链、Write Guard、Extension Registry、解析器测试、Close Gate、Runtime 职责等所有合规要点
  
- **设计文档**：`.kiro/specs/specforge-v1-1-compliance-remediation/design.md`  
  详细描述系统架构、组件接口、数据模型、状态机设计、Write Guard 架构、Candidate 合并流程、Extension Subflow 等技术设计

- **任务清单**：`.kiro/specs/specforge-v1-1-compliance-remediation/tasks.md`  
  包含 35 个顶级任务、86 个子任务，按 5 轮组织，每个任务都引用具体需求并提供详细实施说明。包含任务依赖图，支持并行执行调度

### 7.6 实施技术栈

- **实现语言**：TypeScript（严格模式）
- **测试框架**：Vitest + fast-check（基于属性的测试）
- **最小测试迭代次数**：100 次/属性测试

### 7.7 与审查报告的对应关系

| 审查报告阻断项 | 整改轮次 | 对应需求 | 关键任务 |
|---|---|---|---|
| P0-1: 旧目录路径冲突 | Round 1 | Requirement 1 | Tasks 1-6 |
| P0-2: 旧状态机冲突 | Round 2 | Requirement 2 | Tasks 7-10 |
| P0-3: 插件未硬拦截 | Round 4 | Requirement 4 | Tasks 18-23 |
| P0-4: Agent 权限冲突 | Round 4 | Requirement 4, 8 | Tasks 18-23, 34 |
| P0-5: 合并闭环缺失 | Round 3 | Requirement 3 | Tasks 11-17 |
| P0-6: Extension Registry 缺失 | Round 5 | Requirement 5 | Tasks 24-31 |
| 解析器测试要求 | 横切 | Requirement 6 | Tasks 5, 7, 11 |
| Close Gate 缺失 | 横切 | Requirement 7 | Tasks 32 |
| 组件职责不清 | 横切 | Requirement 8 | Tasks 33-34 |

### 7.8 后续行动

1. **立即启动 Round 1 实施**：优先建立 v1.1 目录模型和路径治理，阻断所有旧路径写入
2. **分阶段验收**：每完成一轮必须通过验收测试后再进入下一轮
3. **持续集成**：建立自动化测试流水线，确保每次代码提交不破坏已完成轮次的合规性
4. **文档同步更新**：随实施进度更新 README、安装文档、Agent 文案，确保用户文档与实际行为一致

## 8. 更新后的最终判定

| 审查项 | 当前状态 | 整改计划状态 | 预期达成轮次 |
|---|---|---|---|
| v1.1 目录模型 | 阻断 | 已规划 | Round 1 |
| v1.1 状态机 | 阻断 | 已规划 | Round 2 |
| Candidate 合并主链 | 阻断 | 已规划 | Round 3 |
| Write Guard 硬拦截 | 阻断 | 已规划 | Round 4 |
| Agent 权限控制 | 高风险 | 已规划 | Round 4 |
| Extension Registry | 阻断 | 已规划 | Round 5 |
| 解析器测试 | 未实施 | 已规划 | 横切，各轮同步 |
| Close Gate | 缺失 | 已规划 | 横切，Round 3 后 |
| Runtime 职责边界 | 不清晰 | 已规划 | 横切，Round 5 后 |

**结论更新**：

SpecForge 项目当前状态不符合 v1.1 标准，但已启动系统性的合规整改项目。整改计划覆盖所有识别的阻断项，并通过 5 轮递进式实施建立完整的 v1.1 Runtime 控制能力。

整改项目采用正式的规格驱动开发方法，已完成需求分析、技术设计和任务规划。所有整改内容均可追溯到具体的验收标准，并配备基于属性的测试策略以确保正确性。

预计完成整改后，SpecForge 将成为首个完整实现 final fused standard v1.1 + Patch 1 的规格驱动 AI 开发控制系统。
