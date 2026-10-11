# SpecForge

SpecForge 是运行在 OpenCode 上的规格驱动 AI 开发治理系统。它把需求、Candidate、Gate、用户决定、实施权限、验证和关闭连接成可恢复、可审计的 Work Item 生命周期。

## 文档入口与权威

- 产品需求与架构唯一权威：[Product Specification](docs/product-specification/specforge-product-specification.md)
- 文件角色与产品裁决：[Authority Registry](docs/product-specification/authority-registry.md)
- 新会话当前恢复点：[project-status](docs/project-status.md)
- 从属技术治理合同：[架构一致性治理实施方案](docs/design/SpecForge架构一致性治理最终实施方案.md)
- 当前活动开发规则：[active development rules](docs/rule/specforge-active-development-rules.md)

README 是导航与使用说明，不定义产品范围。旧规格、设计、标准、报告和 Kiro 材料统一位于 `docs/archive/**`，只作历史证据。

## 当前运行模型

- Daemon 是独立共享治理服务；CLI、用户/部署环境或 Linux `systemd --user` 管理其生命周期。
- Thin Plugin 只连接 daemon、注册项目上下文和转发事件，不启动、停止或重启 daemon。
- 用户级私有数据位于 `<OpenCode config>/sf-user/`；安装 Manifest 位于 `<OpenCode config>/specforge-manifest.json`。
- 业务项目治理数据位于 `<project>/.specforge/`。
- `events.jsonl` 是持久化状态事实源，`state.json` 是可重建 projection。
- 当前新 Work Item 使用 `feature_spec` 统一治理身份；事实分类决定所需路径、产物、Gate 和验证深度。

## 前提条件

- OpenCode
- Bun
- 至少一个已配置的 AI Provider

## 安装

在 SpecForge 仓库根执行：

```bash
bun scripts/sf-installer.ts install
bun scripts/sf-installer.ts verify
```

升级与卸载：

```bash
bun scripts/sf-installer.ts upgrade
bun scripts/sf-installer.ts uninstall
```

`npm -g`、`npx specforge init`、`~/.specforge` 和 NSSM 都不是当前安装合同。安装/升级后重启 OpenCode 以重新加载 Plugin。

## 启动与停止 daemon

正式安装使用短命令：

```bash
specforge daemon start --detach
specforge daemon status
specforge daemon stop
```

`status` 通过 `/api/v1/healthz` 检查当前 daemon；`stop` 调用 `/api/v1/admin/stop`。Windows 当前采用直接独立进程，不注册系统服务或开机自启动。

开发 SpecForge 源码时也可以在仓库根以前台方式运行：

```bash
bun run packages/daemon-core/src/index.ts
```

保持终端运行；按 `Ctrl+C` 停止。不要同时启动第二个 daemon。

## 在真实项目中开始

先确认 daemon 为 `ok`，再打开业务项目：

```bash
cd <你的项目>
opencode
```

切换到 `sf-orchestrator` 并直接描述业务目标。不要手工创建 `.specforge` 文件，不要让 Plugin 管理 daemon，也不要为非 Git 项目预先执行 `git init`。SpecForge 会在实施前按现场冻结 Git 或 filesystem 模式。

## 仓库结构

```text
SpecForge/
├── AGENTS.md                         # 新开发会话稳定入口
├── docs/product-specification/       # 当前产品权威与 Registry
├── docs/project-status.md            # 唯一当前执行状态
├── docs/design/                      # 已登记的从属技术合同
├── docs/rule/                        # 当前规则 + 历史账本
├── docs/conventions/                 # 派生实现说明
├── docs/user/ + docs/cli/            # 派生使用说明
├── docs/archive/                     # 历史证据
├── packages/                         # 产品源码
├── setup/userlevel-opencode/         # 发布给 OpenCode 的资产源
├── scripts/                          # 安装、构建、发布和恢复工具
└── tests/                            # 当前发布跨包验证
```

业务项目的核心结构由实现合同自动投影如下：

<!-- BEGIN: directory-layout -->
> ⚠️ 本文档由 `scripts/render-layout.ts` 从 `packages/types/src/directory-layout.ts` 自动生成。
> 角色：DERIVED REFERENCE，不是产品权威。不要手动编辑；产品边界先由 SPS/已登记 Contract 决定。

## 项目目录名

```
SPEC_DIR_NAME = '.specforge'
```

## Current Active Paths (.specforge/)

### committed 区（提交到 Git）

| Key | 路径 | 说明 |
|-----|------|------|
| config | `config` | 项目配置目录 — `<root>/.specforge/config/` |
| project | `project` | 项目级正式规格目录 — `<root>/.specforge/project/` |
| workItems | `work-items` | Work Item 事务根目录 — `<root>/.specforge/work-items/` |

### configFiles 分组

| Key | 路径 | 说明 |
|-----|------|------|
| configFiles.projectRules | `config/project-rules.md` | — |
| configFiles.prodEnv | `config/prod-environment.md` | — |
| configFiles.project | `config/project.json` | — |

### projectFiles 分组

| Key | 路径 | 说明 |
|-----|------|------|
| projectFiles.specManifest | `project/spec_manifest.json` | — |
| projectFiles.extensionRegistry | `project/extension_registry.json` | — |
| projectFiles.requirementsIndex | `project/requirements_index.md` | — |
| projectFiles.designIndex | `project/design_index.md` | — |
| projectFiles.architecture | `project/architecture.md` | — |
| projectFiles.glossary | `project/glossary.md` | — |
| projectFiles.decisions | `project/decisions.md` | — |
| projectFiles.traceMatrix | `project/trace_matrix.md` | — |
| projectFiles.modulesRoot | `project/modules` | — |

### workItemFiles 分组

| Key | 路径 | 说明 |
|-----|------|------|
| workItemFiles.workItemJson | `work_item.json` | — |
| workItemFiles.intake | `intake.md` | — |
| workItemFiles.changeClassification | `change_classification.md` | — |
| workItemFiles.impactAnalysis | `impact_analysis.md` | — |
| workItemFiles.triggerResult | `trigger_result.json` | — |
| workItemFiles.requirements | `requirements.md` | — |
| workItemFiles.design | `design.md` | — |
| workItemFiles.requirementsDelta | `requirements_delta.md` | — |
| workItemFiles.designDelta | `design_delta.md` | — |
| workItemFiles.domainAnalysis | `domain_analysis.md` | — |
| workItemFiles.moduleBoundaryAnalysis | `module_boundary_analysis.md` | — |
| workItemFiles.architectureMigrationMap | `architecture_migration_map.md` | — |
| workItemFiles.projectSpecVersionBefore | `project_spec_version_before.json` | — |
| workItemFiles.projectSpecVersionAfter | `project_spec_version_after.json` | — |
| workItemFiles.tasks | `tasks.md` | — |
| workItemFiles.traceDelta | `trace_delta.md` | — |
| workItemFiles.candidateManifest | `candidate_manifest.json` | — |
| workItemFiles.candidates | `candidates` | — |
| workItemFiles.candidateFiles.project | `project` | — |
| workItemFiles.candidateFiles.modulesRoot | `project/modules` | — |
| workItemFiles.candidateFiles.requirements | `requirements.candidate.md` | — |
| workItemFiles.candidateFiles.design | `design.candidate.md` | — |
| workItemFiles.candidateFiles.tasks | `tasks.md` | — |
| workItemFiles.candidateFiles.traceDelta | `trace_delta.md` | — |
| workItemFiles.gates | `gates` | — |
| workItemFiles.gateSummary | `gate_summary.md` | — |
| workItemFiles.userDecision | `user_decision.json` | — |
| workItemFiles.verificationReport | `verification_report.md` | — |
| workItemFiles.mergeReport | `merge_report.md` | — |
| workItemFiles.evidence | `evidence` | — |
| workItemFiles.evidenceManifest | `evidence/evidence_manifest.json` | — |
| workItemFiles.extensionRequest | `extension_request.json` | — |
| workItemFiles.extensionDelta | `extension_delta.md` | — |

### gitignored 区（运行时数据）

| Key | 路径 | 说明 |
|-----|------|------|
| runtime | `runtime` | 运行时状态目录（gitignored）— `<root>/.specforge/runtime/` |

### runtimeFiles 分组

| Key | 路径 | 说明 |
|-----|------|------|
| runtimeFiles.events | `runtime/events.jsonl` | — |
| runtimeFiles.state | `runtime/state.json` | — |
| runtimeFiles.checkpoints | `runtime/checkpoints` | — |
| runtimeFiles.logs | `runtime/logs` | — |


---
<!-- END: directory-layout -->

## Work Item 主链

```text
Intake → Impact Analysis → Candidate → Gates → User Decision
→ Project Spec Merge（适用时）→ Code Permission → Implementation
→ Verification / Formal Version → Permission Revoke → Close
```

`blocked` 与 HardStop 是受控停点，不等于丢弃工作。恢复时必须读取 Runtime 权威状态并继续同一个 Work Item。

## 开发 SpecForge

新会话先执行：

```bash
node scripts/project-session-bootstrap.mjs
```

然后完整读取输出的 `REQUIRED_RULES`，只从 `docs/project-status.md` 的 `NEXT_LEGAL_ACTION` 恢复。修改前必须核验真实消费者；修改后运行定向测试、官方全量测试、构建、Bootstrap、`git diff --check` 和最终状态复核。

常用验证入口：

```bash
bun run test
bun run build
```

完整用户与 CLI 说明见 `docs/user/` 和 `docs/cli/`。
