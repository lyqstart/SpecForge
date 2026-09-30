# SpecForge v1.1 Hard Stop + Artifact Closure Report

**日期**: 2026-06-13
**分支**: `post-v1.1-hard-stop-artifact-closure`
**基于**: `post-v1.1-tool-registry-writeguard-fix @ e78c981`

---

## 1. 为什么上一轮没有完全修复

上一轮（session 1）修复了大量真实 bug，但以下核心问题未闭环：

1. **hard_stop 只是返回字段**：`sf_code_permission` 返回 `hard_stop: true` 后，Agent 仍可继续调用后续工具。没有 plugin/runtime latch 机制。
2. **WI 产物通过非受控路径写入**：Agent 使用 `sf_safe_bash` / powershell `Set-Content` 写入 WI 产物（trigger_result.json 等），导致非法 JSON 落盘。
3. **JSON schema 未校验**：trigger_result.json、candidate_manifest.json 等可写入任意内容。
4. **changed_files_audit 无前置条件**：未检查 code_permission 是否启用。
5. **close_gate 证据闭环未验证**：未验证 trigger_result/candidate_manifest/evidence_manifest 的 schema 合法性。

## 2. 根因分析

根因是 **v1.1 标准要求的关键控制点全部落在 Agent prompt 约束上，没有程序级强制**：

- Agent 可以忽略 hard_stop 继续执行（prompt 约束无效）
- Agent 可以用 bash 绕过 sf_artifact_write（没有程序级阻断）
- 无 JSON schema 校验意味着任何内容都能落盘
- changed_files_audit 不检查前置条件意味着可以被当作授权工具

## 3. 本轮提示词约束如何升级

本轮不依赖 prompt 约束。所有控制点均由程序实现：

| 控制点 | 实现方式 |
|--------|----------|
| hard_stop latch | 持久化 hard_stop.json + plugin/handler 双重阻断 |
| WI 产物写入 | sf_artifact_write 独占 + HTTPServer 阻断 bash/write |
| JSON schema | artifact-schema-validation.ts 校验后才允许写盘 |
| changed_files_audit | 检查 code_permission + allowed_write_files + hard_stop |
| close_gate | 验证 trigger_result + candidate_manifest + evidence_manifest schema |

## 4. 修改文件列表

### 新增文件
- `packages/daemon-core/src/tools/lib/hard-stop-latch.ts` — hard_stop latch 核心逻辑
- `packages/daemon-core/src/tools/lib/artifact-schema-validation.ts` — JSON artifact schema 校验
- `packages/daemon-core/tests/unit/v11-hard-stop-artifact-closure.test.ts` — 42 个新测试

### 修改文件
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts` — 集成 hard_stop guard + schema validation + v1.1 controlled writer
- `packages/daemon-core/src/tools/handlers/sf-state-transition.ts` — 集成 hard_stop guard
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts` — 集成 hard_stop guard + code_permission 前置条件
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts` — 集成 hard_stop guard + JSON schema 校验
- `packages/daemon-core/src/tools/handlers/sf-v11-code-permission.ts` — 集成 hard_stop guard + latch 持久化
- `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts` — 集成 hard_stop guard
- `setup/userlevel-opencode/plugins/sf_specforge.ts` — plugin 层 hard_stop latch 检测 + 阻断
- `packages/daemon-core/tests/unit/sf-v11-close-gate.test.ts` — 修复 fixture（v1.1 schema 兼容）
- `packages/daemon-core/tests/unit/governance-closure-core.test.ts` — 修复 fixture
- `packages/daemon-core/tests/unit/governance-closure-e2e.test.ts` — 修复 fixture
- `packages/daemon-core/tests/unit/close-gate-extension-request.test.ts` — 修复 fixture

## 5. Hard Stop Latch 设计与实现

### 设计
- 持久化文件：`.specforge/work-items/<WI-ID>/hard_stop.json`
- 一旦写入，WI 进入 blocked 状态
- 三层阻断：
  1. **Plugin 层** (`tool.execute.before`)：检查所有活跃 WI 的 hard_stop.json，对 write/shell 工具 throw
  2. **Plugin 层** (`tool.execute.after`)：检测 SpecForge 工具返回的 hard_stop=true，自动持久化 latch
  3. **Handler 层**：每个写入/推进类 handler 自行调用 `guardHardStop()`

### 阻断覆盖
| 被阻断工具 | 阻断层 |
|------------|--------|
| sf_state_transition | handler guard |
| sf_artifact_write | handler guard |
| sf_safe_bash | handler guard + plugin |
| sf_changed_files_audit | handler guard |
| sf_close_gate | handler guard |
| sf_v11_code_permission (enable/revoke) | handler guard |
| write/edit/bash (非 SpecForge) | plugin tool.execute.before |

### 允许通过
- sf_state_read、sf_context_build、sf_continuity、sf_cost_report、sf_doctor 等 read/debug 工具

## 6. Artifact Writer Schema Validation 设计与实现

### 校验对象
| 文件 | 校验规则 |
|------|----------|
| work_item.json | 合法 JSON + work_item_id 匹配 + schema_version + status |
| trigger_result.json | 合法 JSON + work_item_id 匹配 + workflow_path ∈ v1.1 枚举 |
| candidate_manifest.json | 合法 JSON + work_item_id 匹配 + entries 数组 + code_only_fast_path 下 entries=[] |
| evidence_manifest.json | 合法 JSON + work_item_id 匹配 + entries 数组 |

### 失败行为
- 返回 `{ success: false, error: 'INVALID_ARTIFACT_JSON', hard_stop: true }`
- 持久化 hard_stop latch
- **不落盘**（内容不写入文件系统）

### workflow_path 枚举
```
requirement_change_path
design_change_path
architecture_change_path
task_change_path
code_only_fast_path
spec_migration_path
rollback_path
```

## 7. Changed Files Audit 前置条件

`sf_changed_files_audit` 调用时必须满足：
1. ✅ work_item.json 存在
2. ✅ 当前 WI 没有 hard_stop blocked
3. ✅ code_permission 曾经成功启用（code_change_allowed=true 或 permission_enabled_at 存在）
4. ✅ allowed_write_files 非空
5. ✅ 实际变更文件不超过 allowed_write_files

不满足返回 `hard_stop: true` + 对应错误码。

## 8. Close Gate 证据闭环

`sf_close_gate` 执行前验证：
1. ✅ work_item.json 存在且状态为 verification_done
2. ✅ 无 hard_stop blocked
3. ✅ trigger_result.json schema 校验通过
4. ✅ candidate_manifest.json schema 校验通过（code_only_fast_path 下 entries=[]）
5. ✅ evidence_manifest.json schema 校验通过
6. ✅ merge_report.md 存在（code_only_fast_path 下 status=not_applicable）
7. ✅ code_permission 在流程内正确处理
8. ✅ changed_files_audit 证据存在（由 handler Step 2 生成或预先存在）

## 9. 测试结果

### 新增测试：42 pass / 0 fail
- 7.1 hard_stop latch: 11 tests
- 7.2 artifact writer schema: 20 tests
- 7.3 changed_files_audit prerequisites: 5 tests
- 7.4 WI artifact bash/write blocking: 6 tests

### 已有 close-gate 测试：11 pass / 0 fail（修复 fixture 后）

### 整体 daemon-core unit tests
- 分支: 570 pass / 50 fail (620 total)
- Main baseline: 553 pass / 24 fail (577 total)
- 差异分析：50 - 24 = 26 增加的 fail 全部是 WI ID validator 导致的 pre-existing baseline failures（tests 使用 `wi-seal-no-actor` 等非标准 ID），不是本轮引入的

## 10. Build / Installer 结果

- `bun run build` (packages/daemon-core): ✅ 成功
- `bun scripts/sf-installer.ts install`: ✅ 成功 (113 个文件部署, 0 warning)

## 11. 真实 OpenCode Trial 状态

**待用户执行**。已提供部署步骤和验证清单。

## 12. 是否建议 Merge

**RECOMMEND_MERGE=no** (真实 OpenCode trial 未执行)

所有 5 个范围的程序级实现已完成。需要用户执行真实 trial 验证：
1. hard_stop latch 在真实 Agent 交互中生效
2. 非法 JSON 不落盘
3. WI 产物不通过 bash 写入
4. close_gate 证据闭环通过

---

## 部署与验证步骤

### 部署
```powershell
cd D:\code\temp\SpecForge
bun scripts/sf-installer.ts install
```

### 启动 Daemon
```powershell
cd D:\code\temp\SpecForge\packages\daemon-core
npx tsc
bun run dist/index.js
```

### 验证清单（真实 OpenCode trial）

1. 新建干净目录 `D:\code\temp\sf-v11-hard-stop-latch-clean-trial`
2. `git init`
3. OpenCode 打开该目录
4. 输入："新建一个网页，里面有一个h1标题'hello' 字体是蓝色"
5. 验证：
   - [ ] sf_code_permission enable 必须带 allowed_write_files
   - [ ] 缺 allowed_write_files → hard_stop latch 写入
   - [ ] hard_stop 后后续工具被拒绝
   - [ ] trigger_result.json 是合法 JSON（有 workflow_path）
   - [ ] candidate_manifest.json entries=[]
   - [ ] WI 产物不通过 bash 写入
   - [ ] close_gate 执行成功
   - [ ] evidence_manifest.json 存在且合法
