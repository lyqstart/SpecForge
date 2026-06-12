# 给开发 AI 的完整提示词：SpecForge v1.1 Runtime Integration Hardening

请继续推进 SpecForge 项目。请全程使用中文。少量技术名词、文件名、路径、commit、branch、tag、Agent、Gate、workflow_path 可以保留英文。

你必须把自己定位为严苛的实现者，不要只写报告。当前任务不是清理文件，而是先把 v1.1 标准要求的治理链真实接入运行流程。

## 一、任务背景

SpecForge v1.1 标准要求：

1. 所有变更必须先进入 Work Item；
2. 正式规格只能通过 Candidate + Gate + User Decision + Merge Runner 合并；
3. 代码只能在 code_permission + allowed_write_files + Write Guard 下修改；
4. changed_files_audit 必须审计实际改动；
5. close_gate 必须在 verification、evidence、trace、audit、merge 或 not_applicable 全部闭环后通过；
6. 关键控制不能依赖 Agent 自觉，必须落到 Runtime、State Machine、Path Service / Path Policy、Gate Runner、User Decision Recorder、Merge Runner、code_permission_service、Write Guard、changed_files_audit、close_gate。

Patch 1 要求：

1. `.specforge/project/extension_registry.json` 是正式规格的一部分；
2. `spec_manifest.json` 必须登记 extension_registry；
3. Extension Subflow 必须由 `sf-orchestrator` 调度 `sf-extension`；
4. `sf-extension` 不得直接写正式 `.specforge/project/extension_registry.json`；
5. Extension Subflow 必须经过 Candidate + Gate + User Decision + Merge Runner；
6. close_gate 必须检查未处理的 `extension_request.json`。

## 二、当前已发现的硬证据

1. GitHub main 的 `setup/userlevel-opencode/tools/` 已存在：

```text
sf_changed_files_audit.ts
sf_close_gate.ts
sf_code_permission.ts
sf_gate_run.ts
sf_merge_run.ts
sf_user_decision_record.ts
```

2. 用户级 OpenCode 运行目录 `~/.config/opencode/tools/` 缺失这些文件。

3. 用户级 `skills/sf-workflow-feature-spec/SKILL.md` 已经引用：

```text
sf_gate_run
sf_user_decision_record
sf_merge_run
sf_close_gate
```

但实际用户级 tools 目录没有这些工具，运行链路会断。

4. 用户级 `sf-user/lib/registry.ts` 仍只登记旧工具：

```text
sf_requirements_gate
sf_design_gate
sf_tasks_gate
sf_verification_gate
sf_state_read
sf_state_transition
```

没有登记 v1.1 新工具。

5. 用户级 `agents/` 缺失：

```text
sf-extension.md
sf-evidence-collector.md
sf-investigator.md
```

6. `sf-orchestrator.md` 仍保留：

```text
manifest.json schema_version v6.0
~/.specforge/host-profile.json
.specforge/prod-environment.md
.specforge/project-rules.md
旧 Gate 映射 requirements_gate/design_gate/tasks_gate/verification_gate
```

7. 多数旧 workflow skill 仍调用旧 Gate 工具，而不是统一 `sf_gate_run`。

## 三、本轮目标

从最新 `main` 新建分支：

```text
post-v1.1-runtime-integration-hardening
```

本轮目标：让 v1.1 主控制链在仓库安装源、installer registry、用户级部署目录、orchestrator、workflow skills、daemon/runtime 之间形成真实可执行链路。

## 四、必须先验证仓库真实状态

先输出以下命令原始结果：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log -1 --oneline
git tag --points-at HEAD
```

然后输出：

```bash
git ls-files setup/userlevel-opencode/tools | sort
git ls-files setup/userlevel-opencode/agents | sort
git ls-files setup/userlevel-opencode/skills | sort
git ls-files scripts/lib/registry.ts
grep -n "sf_gate_run\|sf_user_decision_record\|sf_merge_run\|sf_code_permission\|sf_changed_files_audit\|sf_close_gate\|sf-extension\|sf-evidence-collector\|sf-investigator" scripts/lib/registry.ts
```

如果 registry 缺失 v1.1 新工具或 Agent，先修 registry。

## 五、第一阶段：修复 installer / registry 部署一致性

必须确保 `scripts/lib/registry.ts` 登记：

```text
setup/userlevel-opencode/tools/sf_gate_run.ts
setup/userlevel-opencode/tools/sf_user_decision_record.ts
setup/userlevel-opencode/tools/sf_merge_run.ts
setup/userlevel-opencode/tools/sf_code_permission.ts
setup/userlevel-opencode/tools/sf_changed_files_audit.ts
setup/userlevel-opencode/tools/sf_close_gate.ts
setup/userlevel-opencode/agents/sf-extension.md
setup/userlevel-opencode/agents/sf-evidence-collector.md
setup/userlevel-opencode/agents/sf-investigator.md
```

运行 installer 测试，确认这些文件会部署到：

```text
~/.config/opencode/tools/
~/.config/opencode/agents/
```

## 六、第二阶段：修复 sf-orchestrator.md 主链路

必须修改 `setup/userlevel-opencode/agents/sf-orchestrator.md`，要求：

1. 启动检测不再以 `manifest.json schema_version v6.0` 作为新流程主依据。
2. 默认主路径改为：

```text
.specforge/project/spec_manifest.json
.specforge/work-items/
.specforge/runtime/
```

3. `~/.specforge/host-profile.json` 只能作为 legacy read-only，不得作为新默认写入路径。
4. `.specforge/prod-environment.md` 和 `.specforge/project-rules.md` 不得作为 v1.1 主流程正式配置路径。
5. Gate 统一调用 `sf_gate_run`。
6. User Decision 统一调用 `sf_user_decision_record`。
7. Merge 统一调用 `sf_merge_run`。
8. 实现前必须调用 `sf_code_permission enable`。
9. 实现后必须调用 `sf_changed_files_audit`。
10. 关闭前必须调用 `sf_close_gate`。
11. Extension Subflow 必须明确由 sf-orchestrator 调度 `sf-extension`。
12. sf-orchestrator 不得说明 `sf-extension` 可自行推进状态或直接写正式 registry。

## 七、第三阶段：迁移 workflow skills

至少修改以下文件：

```text
setup/userlevel-opencode/skills/sf-workflow-bugfix-spec/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-change-request/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-design-first/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-investigation/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-ops-task/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-quick-change/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-refactor/SKILL.md
```

迁移要求：

1. 旧 `sf_requirements_gate` / `sf_design_gate` / `sf_tasks_gate` / `sf_verification_gate` 不得作为主流程 Gate 调用。
2. 主流程统一调用 `sf_gate_run`。
3. 涉及规格变更的 workflow 必须进入 User Decision + Merge Runner。
4. code-only / quick-change 也必须生成 candidate_manifest entries=[]、merge_report not_applicable、verification_report、evidence_manifest、changed_files_audit、close_gate。
5. implementation 前必须通过 `sf_code_permission enable` 设置 allowed_write_files。
6. implementation 后必须通过 `sf_changed_files_audit`。
7. close 前必须通过 `sf_close_gate`。

## 八、第四阶段：daemon/runtime 真实接入验证

必须审查并必要时修改：

```text
packages/daemon-core/src/**
packages/workflow-runtime/src/**
packages/types/src/**
packages/permission-engine/src/**
packages/scope-gate/src/**
packages/opencode-adapter/src/**
```

必须证明以下 tool invoke 在 daemon/runtime 中真实实现：

```text
sf_gate_run
sf_user_decision_record
sf_merge_run
sf_code_permission
sf_changed_files_audit
sf_close_gate
```

如果 OpenCode tool 只是 thin wrapper，但 daemon 没有 handler，必须补 handler。

## 九、第五阶段：Extension Subflow 验证

必须验证：

1. `sf-design` / `sf-requirements` / `sf-task-planner` / `sf-verifier` 发现扩展缺口时，只能写 `extension_request.json` 并停止。
2. `sf-orchestrator` 检测到 `extension_request.json` 后阻断主流程。
3. `sf-orchestrator` 调度 `sf-extension`。
4. `sf-extension` 生成：

```text
extension_delta.md
candidates/project/extension_registry.json
candidate_manifest.json entry
```

5. `extension_gate` 通过 `sf_gate_run` 执行。
6. User Decision 通过 `sf_user_decision_record` 写入。
7. Merge 通过 `sf_merge_run` 写 `.specforge/project/extension_registry.json`。
8. close_gate 检查未处理 extension_request。

## 十、禁止事项

本轮禁止：

1. 禁止删除 legacy 文件；
2. 禁止清理目录；
3. 禁止打 tag；
4. 禁止声明 production ready；
5. 禁止只改文档不改运行链路；
6. 禁止只说“工具存在”就判定完成；
7. 禁止跳过 installer 验证；
8. 禁止让聊天里的“同意”替代 user_decision.json。

## 十一、测试要求

至少运行：

```bash
bun test scripts
bun test packages/daemon-core
bun test packages/workflow-runtime
```

期望基线：

```text
330/330 passed
```

如果数量不是 330，必须解释新增/删除/跳过的原因。

必须增加或运行 E2E 场景：

```text
requirement_change_path
code_only_fast_path
extension subflow
write guard 越界写入
user decision invalidation
close_gate blocking extension_request
```

## 十二、最终回执格式

必须按 key=value 输出：

```text
BRANCH=
BASE_MAIN_COMMIT=
HEAD_COMMIT=
NEW_COMMIT=
PUSHED=
TAGGED=

REGISTRY_UPDATED=
INSTALLER_DEPLOYS_V1_1_TOOLS=
USERDIR_DEPLOYMENT_VERIFIED=
ORCHESTRATOR_UPDATED=
WORKFLOW_SKILLS_UPDATED_COUNT=
DAEMON_TOOL_HANDLERS_VERIFIED=
DAEMON_TOOL_HANDLERS_ADDED=
EXTENSION_SUBFLOW_E2E_VERIFIED=
WRITE_GUARD_E2E_VERIFIED=
CLOSE_GATE_EXTENSION_REQUEST_CHECK_VERIFIED=

TEST_RESULT=
TEST_BASELINE_STATUS=

DELETED_FILES=
MOVED_FILES=
TAGGED=
PRODUCTION_READY_CLAIMED=

BLOCKING_GAPS=
RECOMMEND_MERGE=
RECOMMEND_NEXT_ACTION=
```

判定规则：

1. 如果 v1.1 新工具没有部署到用户级目录，不得通过。
2. 如果 workflow skill 仍以旧 Gate 工具作为主流程，不得通过。
3. 如果 User Decision / Merge Runner 没有进入主链路，不得通过。
4. 如果 implementation 前没有 code_permission enable，不得通过。
5. 如果 close_gate 不检查 changed_files_audit / evidence_manifest / verification_report / extension_request，不得通过。
6. 如果 Extension Subflow 没有端到端验证，不得通过。
