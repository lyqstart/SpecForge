# Refactor Plan — WI-013

> **work_item_id**: WI-013
> **workflow_type**: refactor
> **upstream**: WI-010（P0 Schema 建设）、WI-011（P1 代码全量切换）、WI-012（P2 防线建设）
> **关联提案**: `docs/proposals/handoff-fix-residuals-p3.md`
> **关联分析**: `.specforge/specs/WI-013/refactor_analysis.md`

---

## 重构策略

### 总体策略：定向精准修复，零扩散

本次重构采用 **逐项定点修复** 策略，严格遵循以下原则：

1. **只动提案 §3 列出的文件和行号**，不扩散 scope
2. **每步修复后代码可运行**，不引入中间态编译错误
3. **常量替换优先**：凡有 `SPEC_DIR_NAME` / `LAYOUT` 常量可用的，必须用常量，禁止新增 `.specforge/` 字面量
4. **高风险操作原子化**：daemon 停止 → 清理 → 重启 → 验证，作为一个不可分割的操作序列

### 修复分类

| 分类 | 编号 | 风险 | 策略 |
|------|------|------|------|
| **常量替换** | R1, R2, R6 | 低 | 直接修改，git revert 可回滚 |
| **文档修正** | R3, R4 | 低 | 直接修改路径文本 |
| **根因修复+清理** | R5 | 中高 | 先验证无活跃写入者 → 删除残留 → 重启观察 |
| **元数据补全** | R8 | 低 | 新增文件，参考模板 |
| **垃圾清理** | R7 | 低 | 备份 → 用户确认 → 删除 |

### 依赖关系

```
Task 1: R1+R2 (configuration / plugin-loader)  ─┐ 并行
Task 2: R3+R4 (Agent prompt 路径文本)           ─┤ 并行
Task 3: R6   (sf_doctor 路径常量)               ─┘ 并行
    ↓ (前三组完成后执行)
Task 4: R5 (observability 残留根因确认 + 清理) — 需确认无活跃写入者
    ↓
Task 5: R8 (WI-012 _meta.json 补写)
    ↓
Task 6: R7 (.specforge-/ 备份清理, 需用户确认)
```

Task 4 依赖前 3 组完成的原因：需要确保 R1/R2 中的路径常量已切换完毕，才能准确判断 `specforge/` 目录下是否有遗漏的活跃写入者。

---

## 步骤顺序

### Task 1: R1 + R2 — configuration / plugin-loader 路径常量（可并行）

#### Step 1.1: R1 — constants.ts 配置目录常量补点

**文件**: `packages/configuration/src/constants.ts`
**行号**: 第 70 行

**当前代码**（第 68-71 行）:
```typescript
export const CONFIG_DIRS = {
  user: '~/.specforge/config',
  project: 'specforge/config',
} as const
```

**修改方案**:

1. 在文件顶部（第 5 行 `import { ConfigLayerType } from './types'` 之后）新增 import:
   ```typescript
   import { SPEC_DIR_NAME } from '@specforge/types/directory-layout'
   ```

2. 将第 70 行从:
   ```typescript
   project: 'specforge/config',
   ```
   改为:
   ```typescript
   project: `${SPEC_DIR_NAME}/config`,
   ```

**注意**: 此处不使用 `LAYOUT.config`（值为 `'config'`），因为 `CONFIG_DIRS.project` 的语义是完整的 `.specforge/config` 路径片段，而非相对于 `.specforge/` 的子路径。使用 `` `${SPEC_DIR_NAME}/config` `` 语义最清晰。

**验证**: `bun build packages/configuration/` 后检查 `dist/constants.d.ts` 中 `project` 的类型声明是否从 `"specforge/config"` 变为 `` `${SPEC_DIR_NAME}/config` ``（模板字符串类型）。

#### Step 1.2: R2 — fs-path-rules.ts 允许目录补点

**文件**: `packages/plugin-loader/src/static-checker/fs-path-rules.ts`
**行号**: 第 818 行

**当前代码**（第 816-822 行）:
```typescript
{
  id: 'config-dir',
  name: '配置目录',
  allowedDirs: ['~/.specforge/config', 'specforge/config'],
  allowSubdirs: true,
  requiredPermissions: ['filesystem.read'],
  enabled: true,
},
```

**修改方案**:

将第 818 行从:
```typescript
allowedDirs: ['~/.specforge/config', 'specforge/config'],
```
改为:
```typescript
allowedDirs: ['~/.specforge/config', `${SPEC_DIR_NAME}/config`],
```

**前置条件**: 需要在文件头部确认是否已导入 `SPEC_DIR_NAME`。当前第 21 行仅导入 `path`。需新增:
```typescript
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
```

**不使用 LAYOUT 常量的理由**: `allowedDirs` 是白名单匹配，值需要是完整路径片段（含 `.specforge/` 前缀），而非相对于 `.specforge/` 的子路径。使用 `` `${SPEC_DIR_NAME}/config` `` 语义最清晰，且与 `~/.specforge/config`（用户级路径）风格对称。

**验证**: `bun test packages/plugin-loader/` 不退步。

---

### Task 2: R3 + R4 — Agent prompt 路径文本修正（可并行）

#### Step 2.1: R3 — sf-knowledge.md 示例路径补点

**文件**: `setup/userlevel-opencode/agents/sf-knowledge.md`
**行号**: 第 78 行

**当前文本**:
```
"retro_report_path": "specforge/archive/agent_runs/<run_id>/retro_report.md",
```

**修改方案**: 将第 78 行的裸路径加前缀点:
```
"retro_report_path": ".specforge/archive/agent_runs/<run_id>/retro_report.md",
```

**理由**: 此处是 Agent markdown 中的 JSON 示例，不适合导入常量。第 87-93 行的数据源列表已全部使用 `.specforge/` 带点前缀，此处需保持一致。

**验证**: 目视检查修改后该文件中所有路径引用均为 `.specforge/` 开头。

#### Step 2.2: R4 — sf-orchestrator.md 路径补点

**文件**: `setup/userlevel-opencode/agents/sf-orchestrator.md`
**行号**: 第 82 行

**当前文本**:
```
1. 读取最新 checkpoint recovery 文件（specforge/runtime/checkpoints/*.recovery.md）
```

**修改方案**: 将第 82 行的裸路径加前缀点:
```
1. 读取最新 checkpoint recovery 文件（.specforge/runtime/checkpoints/*.recovery.md）
```

**理由**: Agent markdown 中的路径描述，需与实际目录 `.specforge/runtime/checkpoints/` 一致。

**附带提醒**: 记录在 work_log 中提醒用户，如果 `~/.config/opencode/agents/sf-orchestrator.md` 也存在同样问题，需要重新运行 `bun scripts/sf-installer.ts install` 同步。

**验证**: 目视检查修改后该行路径引用正确。

---

### Task 3: R6 — sf_doctor 路径常量风格统一（可并行）

**文件**: `packages/daemon-core/src/tools/lib/sf_doctor_core.ts`
**行号**: 第 92-95 行

**当前代码**:
```typescript
const PROJECT_RUNTIME_KEY_FILES = [
  `${SPEC_DIR_NAME}/runtime/state.json`,
  `${SPEC_DIR_NAME}/config/project.json`,
]
```

**修改方案**: 使用 `LAYOUT` 常量替代手动拼接的路径片段，与同文件 `checkInitializationCompleteness()` 函数（第 233-267 行）的风格保持一致。

改为:
```typescript
const PROJECT_RUNTIME_KEY_FILES = [
  join(SPEC_DIR_NAME, LAYOUT.runtimeState),
  join(SPEC_DIR_NAME, LAYOUT.configFiles.project),
]
```

**前置条件**: 
- 第 13 行已有 `import { join } from "node:path"` ✅
- 第 15 行已有 `import { SPEC_DIR_NAME, LAYOUT, resolveProjectPath } from "@specforge/types/directory-layout"` ✅

**可用 LAYOUT 常量确认**（来自 `packages/types/src/directory-layout.ts`）:
- `LAYOUT.runtimeState` = `'runtime/state.json'` ✅ 第 135 行
- `LAYOUT.configFiles.project` = `'config/project.json'` ✅ 第 108 行

**行为不变性**: `join('.specforge', 'runtime/state.json')` 的运行时结果与 `` `${SPEC_DIR_NAME}/runtime/state.json` `` 完全一致（在 Unix 上为 `.specforge/runtime/state.json`，在 Windows 上为 `.specforge\runtime\state.json`）。`join()` 会自动处理平台分隔符，且 `existsSync()` 对两种分隔符都能正确匹配。

**验证**: `sf_doctor` 对已正确初始化的项目报告 `installation.overall = "ok"`。

---

### Task 4: R5 — observability 残留根因确认与清理（最关键）

> **前置依赖**: Task 1-3 全部完成后执行。

#### Step 4.1: 根因确认（基于 refactor_analysis.md 调用链追踪结果）

**refactor_analysis.md 已完成的调用链追踪结论**:

| 链路 | 路径 | 结论 |
|------|------|------|
| EventLogger 构造函数 | `event-logger/index.ts:77` | 默认值 `'./data/observability'`，不使用 `specforge/` |
| Daemon 实例化 | `Daemon.ts:95` | `new EventLogger(runtimeDir)` → `runtimeDir` = `~/.specforge/runtime` ✅ |
| permission-engine 历史路径 | WI-11 已修复 | 4 个文件全部切换到 `SPEC_DIR_NAME + LAYOUT.logsTelemetry` ✅ |
| sf_knowledge_graph_core.ts | 第 91 行 | 已使用 `join(SPEC_DIR_NAME, LAYOUT.knowledgeGraph)` ✅ |

**结论**: 当前 **无活跃代码** 在写 `specforge/`（无点）目录。`specforge/observability/events.jsonl` 和 `specforge/knowledge/graph.json` 是 **历史残留**，由 WI-11 切换前的旧代码创建。

**磁盘残留确认**:
- `specforge/observability/events.jsonl` — mtime 2026/5/29 5:32~8:38, 2560 bytes
- `specforge/knowledge/graph.json` — mtime 2026/5/29 9:32:39, 52 bytes

#### Step 4.2: 清理操作（原子操作序列）

**操作序列**（不可分割，任一步失败则中止）:

1. **停止 daemon 进程**:
   ```powershell
   Stop-Process -Name bun -Force -ErrorAction SilentlyContinue
   ```

2. **删除 `specforge/` 目录**（整个无点目录）:
   ```powershell
   Remove-Item -Path "specforge" -Recurse -Force
   ```

3. **重启 daemon**: 由 opencode 自动重启，或手动触发

4. **等待 5 分钟**，然后检查:
   ```powershell
   Test-Path specforge   # 必须 False
   Test-Path .specforge  # 必须 True
   ```

5. **如果 `specforge/` 被重建**: 需要用 Process Monitor / `handle` 工具定位写入者，进入二轮排查。此时 **不继续 Task 5/6**，记录到 work_log 并升级。

**行为不变性测试方案**:
- 重启 daemon 后运行 5 分钟，确认 `specforge/` 目录不存在
- 执行 `sf_knowledge_graph` 的 `add_nodes` + `get_node` 操作，确认数据写入 `.specforge/knowledge/graph.json`
- 执行 `sf_doctor`，确认 `installation.overall = "ok"`

---

### Task 5: R8 — WI-012 _meta.json 补写

**目标文件**: `.specforge/specs/WI-012/_meta.json`（新建）

**模板**: 参考 WI-010 和 WI-011 的 `_meta.json`

**WI-012 信息摘取**:
- `id`: `"WI-012"`
- `workflow_type`: `"refactor"`（从 verification_report.md 的测试套件和 refactor_analysis.md 推断）
- `title`: `"SpecForge V6 目录结构治理 P2 防线建设"`
- `summary`: 从 `refactor_analysis.md` 和 `verification_report.md` 摘取
- `current_stage`: `"completed"`（verification_report.md 显示 22/22 pass）
- `created_at`: `"2026-05-29T00:00:00Z"`
- `completed_at`: `"2026-05-29T00:00:00Z"`

**写入内容**:
```json
{
  "id": "WI-012",
  "workflow_type": "refactor",
  "title": "SpecForge V6 目录结构治理 P2 防线建设",
  "summary": "P2 阶段：在 P1 代码全量切换基础上加固防线——lint 规则、sf_doctor 集成、_meta.json schema 验证。确保所有新代码使用 LAYOUT 常量，并建立自动化检测机制防止回退。",
  "key_decisions": [
    "check-hardcoded-paths.ts lint 脚本扫描 src/ 目录",
    "sf_doctor 集成 directory-layout.ts 路径检查",
    "_meta.json schema 验证纳入 architecture 测试套件"
  ],
  "current_stage": "completed",
  "created_at": "2026-05-29T00:00:00Z",
  "completed_at": "2026-05-29T00:00:00Z",
  "related_modules": [
    "packages/types",
    "packages/daemon-core",
    "scripts/lint"
  ],
  "upstream_wis": ["WI-010", "WI-011"],
  "downstream_wis": ["WI-013"]
}
```

**验证**: 
- `Test-Path .specforge/specs/WI-012/_meta.json` → True
- `bun test tests/architecture/` 中 `_meta.json Schema validation` suite 应多通过 1 个 file

---

### Task 6: R7 — .specforge-/ 备份目录清理（需用户确认）

> **前置条件**: Task 4 完成、Task 5 完成后执行。
> **硬性要求**: 必须用户二次确认才能删除。

#### Step 6.1: 安全前置检查

1. **确认不在 git tracking 中**:
   ```powershell
   git status .specforge-/
   ```
   预期: 不在 tracking 中（`git status` 显示 clean 或 untracked）

2. **生成文件清单和大小快照**:
   ```powershell
   Get-ChildItem -Path ".specforge-" -Recurse -File | Select-Object FullName, Length, LastWriteTime | Out-File ".tmp/specforge-dash-filelist.txt"
   ```

3. **打包兜底备份**:
   ```powershell
   Compress-Archive -Path ".specforge-" -DestinationPath ".tmp/specforge-backup-pre-cleanup.zip" -Force
   ```

4. **记录 zip 的 SHA256**:
   ```powershell
   Get-FileHash ".tmp/specforge-backup-pre-cleanup.zip" -Algorithm SHA256 | Select-Object Hash
   ```

#### Step 6.2: 用户确认（fail-stop）

输出以下确认信息:
```
已生成兜底备份:
  - 备份文件: .tmp/specforge-backup-pre-cleanup.zip
  - SHA256: <hash>
  - 文件清单: .tmp/specforge-dash-filelist.txt

准备永久删除 .specforge-/ 目录（含 cas/ + observability/ 子目录）。
该目录不在 git tracking 中，属于早期迁移过程的残留备份。

请确认删除 [y/N]:
```

**fail-stop 规则**: 用户不明确回复 `y` → 不删除，Task 6 标记为 "skipped (user declined)"。

#### Step 6.3: 执行删除

```powershell
Remove-Item -Path ".specforge-" -Recurse -Force
```

**验证**: `Test-Path .specforge-` → False

**回滚方案**: 从 `.tmp/specforge-backup-pre-cleanup.zip` 解压恢复。

---

## 风险等级判定

### 最终风险等级: **高**

### 判定依据

| 判定维度 | 分析 |
|----------|------|
| **是否涉及 daemon 运行期代码** | ✅ 是 — R1 修改 configuration 包常量（daemon 启动时读取），R6 修改 sf_doctor_core.ts（daemon MCP 工具） |
| **是否涉及文件删除操作** | ✅ 是 — R5 删除 `specforge/` 目录，R7 删除 `.specforge-/` 目录 |
| **是否需要 daemon 重启验证** | ✅ 是 — R5 需要停止 → 清理 → 重启 → 观察 5 分钟 |
| **是否存在不可逆操作** | ⚠️ 部分 — R5 删除的是 gitignored 历史残留（无代码影响），R7 已有 zip 兜底备份 |
| **修复范围是否可控** | ✅ 是 — 8 项修复均为定点操作，每项涉及 1-3 行代码变更 |
| **回滚难度** | 低 — 所有代码变更可通过 `git revert` 回滚，文件删除有备份 |

### 高风险路径下的额外要求

根据 refactor 工作流双路径状态机，本 WI 走 **高风险路径**：

1. **development 后必须经过 review 阶段**（sf-reviewer）
2. **review 必须验证**（提案 §5 明确列出检查项）:
   - 每一处修改都直接对应 §3 中的一个 R 编号
   - 每个常量替换使用 `SPEC_DIR_NAME` 或 `LAYOUT.xxx`
   - R5 的 before/after 调用链分析
   - R7 的 zip 兜底文件已生成并记录 sha256
3. **verification 必须跑完提案 §5 列出的全部 7 项命令**，exit 0 才算 pass

### 各项风险评级

| 编号 | 风险 | 回滚方式 |
|------|------|----------|
| R1 | 低 — 单行常量修改 | `git revert` |
| R2 | 低 — 白名单路径值修改 | `git revert` |
| R3 | 低 — 文档文本修改 | `git revert` |
| R4 | 低 — 文档文本修改 | `git revert` |
| R5 | 中高 — daemon 停止 + 残留清理 + 重启验证 | 代码 revert + 重新运行 daemon |
| R6 | 极低 — 代码风格统一，功能行为完全不变 | `git revert` |
| R7 | 低 — 垃圾文件删除（有 zip 备份） | 从 `.tmp/` 恢复 |
| R8 | 低 — 新增元数据文件 | 直接删除文件 |

---

## Out of Scope

以下内容 **明确不在本 WI 范围内**，执行中不得触碰：

- ❌ `scripts/lint/check-hardcoded-paths.ts` 的正则扩展（→ P4）
- ❌ lint 扫描范围扩展到 `.md` 文件（→ P4）
- ❌ README/AGENTS.md 中加 directory-layout marker（→ P4）
- ❌ verifier 制度建设（→ P4）
- ❌ 任何 pre-existing test 失败的修复
- ❌ `specforge/observability/events.jsonl` 的重命名/移动（应该**删除**）
- ❌ 标记 "Directory Layout v1.0 Locked"（P4 未完成前不锁定）

---

## Assumptions（设计假设）

1. **假设 WI-11 已正确完成**：permission-engine 中 `specforge/observability` 硬编码已全部切换，当前无活跃代码在写 `specforge/`（无点）目录
2. **假设 daemon 为长驻进程**：如果 daemon 在 WI-11 代码切换前启动且未重启，内存中可能仍是旧代码路径——R5 的清理必须在 daemon 重启后执行
3. **假设 `specforge/`（无点）目录中的文件均为历史残留**：refactor_analysis.md 的调用链追踪已确认无活跃写入者，但 mtime 显示 `graph.json` 在当天 9:32 仍有写入——可能来自 daemon 未重启前的旧代码路径
4. **假设 `.specforge-/` 是早期迁移的备份目录**：创建于 2026/5/25~26，含 cas + observability 完整副本，不在 git 中
5. **假设 `LAYOUT` 常量字典已稳定**：`runtimeState`（= `'runtime/state.json'`）和 `configFiles.project`（= `'config/project.json'`）在 WI-010 中定义，WI-011/WI-012 中未变更
6. **假设 `sf_doctor` 的 `existsSync()` 能正确匹配 `path.join()` 生成的平台分隔符路径**：Windows 上 `join('.specforge', 'runtime/state.json')` 会产生 `.specforge\runtime\state.json`，而 `existsSync` 能正确处理
7. **假设 R7 的 `.specforge-/` 删除不需要 daemon 停止**：该目录不在 SpecForge 运行时路径中，是静态备份
