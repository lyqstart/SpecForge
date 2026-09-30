# Handoff — P3 修复：目录治理"零真残留"收尾

> **本文件用法**：在 OpenCode 新会话中（与验收会话隔离），把本文件全文给 sf-orchestrator，
> 或者直接说："请阅读 `docs/proposals/handoff-fix-residuals-p3.md` 并执行"
>
> **前置条件**：已完成 `docs/audit/2026-05-29-directory-governance-final-audit.md` 验收。
> 本次修复**只关闭验收报告中的 #1~#7、#8 七个问题**，#3（lint 加固）和 #9（verifier 制度）
> 由后续 P4（handoff-fix-lint-hardening.md）处理，本次不动。

---

## 1. 你的角色

你是 **sf-orchestrator**，本次任务是按 **refactor 工作流**（双路径状态机：高风险 → review；低风险 → 直接验证）
驱动 1 个 WI 完成"目录治理零真残留"修复。

**风险判定**：本任务**属于高风险路径**——会触动 daemon 运行期代码、配置常量、Agent prompt，
任何一处搞错都可能让 daemon 起不来或写错路径。因此**必须经过 review 阶段**。

---

## 2. 创建 WI 与 intake

1. 走 sf-orchestrator 正常启动流程
2. 创建 WI（workflow_type=`refactor`）
3. intake 阶段：把本文件 §3 的修复清单作为 scope 写入 intake.md
4. 严格限定 scope：**只动 §3 列出的文件 + 文件中列出的行**，不允许"顺手优化"

---

## 3. 修复清单（每条都附目标证据，子 Agent 必须按行号校对）

### 修复项 R1：constants.ts 配置目录常量补点
- **文件**：`packages/configuration/src/constants.ts`
- **行号**：第 70 行
- **当前**：
  ```ts
  project: 'specforge/config',
  ```
- **目标**：使用 `SPEC_DIR_NAME` 常量拼接
  ```ts
  // 顶部 import: import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
  project: `${SPEC_DIR_NAME}/config`,
  ```
- **附带任务**：检查 `dist/constants.d.ts:28` 是否仍声明 `readonly project: "specforge/config"`，
  确保重新构建后类型声明也更新

### 修复项 R2：fs-path-rules.ts 允许目录补点
- **文件**：`packages/plugin-loader/src/static-checker/fs-path-rules.ts`
- **行号**：第 818 行
- **当前**：
  ```ts
  allowedDirs: ['~/.specforge/config', 'specforge/config'],
  ```
- **目标**：第二项必须带点；如可用 LAYOUT，则改为常量拼接，否则字面量加点
  ```ts
  allowedDirs: ['~/.specforge/config', '.specforge/config'],
  ```

### 修复项 R3：sf-knowledge.md 路径补点
- **文件**：`setup/userlevel-opencode/agents/sf-knowledge.md`
- **行号**：第 78 行
- **当前**：
  ```
  "retro_report_path": "specforge/archive/agent_runs/<run_id>/retro_report.md",
  ```
- **目标**：
  ```
  "retro_report_path": ".specforge/archive/agent_runs/<run_id>/retro_report.md",
  ```

### 修复项 R4：sf-orchestrator.md 路径补点
- **文件**：`setup/userlevel-opencode/agents/sf-orchestrator.md`
- **行号**：第 82 行
- **当前**：
  ```
  1. 读取最新 checkpoint recovery 文件（specforge/runtime/checkpoints/*.recovery.md）
  ```
- **目标**：
  ```
  1. 读取最新 checkpoint recovery 文件（.specforge/runtime/checkpoints/*.recovery.md）
  ```
- **同步**：若用户级 `~/.config/opencode/agents/sf-orchestrator.md` 也存在同样问题（sf-installer 会从
  `setup/` 同步过去），则记录在 work_log 中提醒用户重新跑 `bun scripts/sf-installer.ts install`

### 修复项 R5：定位并修复 `specforge/observability/events.jsonl` 的写入者（最关键）
- **症状**：仓库根的 `specforge/observability/events.jsonl` 在 2026-05-29 8:38:02 仍被新写入
- **根因调查**（design 阶段必做）：
  1. `Get-ChildItem packages -Recurse -Filter *.ts | Select-String "observability/events.jsonl|/observability"` 找出所有候选
  2. 重点排查 `packages/observability/src/event-logger/index.ts`、`packages/daemon-core/src/daemon/Daemon.ts:95`
     的 `new EventLogger(runtimeDir)` 入参链路——runtimeDir 是否被某处拼出 `specforge/observability`
  3. 用 `Get-Process bun; Stop-Process` 停掉当前 daemon，删 `specforge/observability/events.jsonl`，
     重启 daemon，等 30s，再 `Test-Path specforge/observability/events.jsonl` —— 如果又出现，说明仍有代码在写
- **修复**：把写入路径切换到 `LAYOUT.archive` / `LAYOUT.logs` 之类的带点常量
  （**禁止**手工拼 `'.specforge/observability/...'`，必须用 `path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.xxx)`）
- **验证**：删 `specforge/observability/` 后跑 daemon 5 分钟，确认该目录不再被自动创建

### 修复项 R6：sf_doctor 自身路径常量切换
- **文件**：`packages/daemon-core/src/tools/lib/sf_doctor_core.ts`（或同包内 doctor 检查列表的定义处）
- **症状**：doctor 检查项命名为 `项目运行时: specforge/runtime/state.json`（无点）、
  `项目运行时: specforge/config/project.json`（无点），永远报 error
- **修复**：把这两个检查的路径改用 `path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.runtimeState)` 等常量
- **验证**：跑 `sf_doctor`，对一个已正确初始化的项目应报 `installation.overall = "ok"`

### 修复项 R7：清理 `.specforge-/` 备份目录
- **目录**：`D:\code\temp\SpecForge\.specforge-`（含完整 cas/ + observability/，单文件 >1MB）
- **前置安全检查**（development 阶段必做、必须按顺序）：
  1. `git status` 确认 `.specforge-/` 不在 git tracking 中
  2. 在 `.tmp/` 下生成 `.specforge-/` 的文件清单 + 大小快照（便于事后回溯）
  3. 用 PowerShell `Compress-Archive` 把 `.specforge-/` 打包到 `.tmp/specforge-backup-pre-cleanup.zip`
     作为"最终兜底"，记录该 zip 的 sha256
  4. **告诉用户**："已生成 zip 兜底于 `.tmp/`，准备删除 `.specforge-/`，请二次确认 [y/N]"
     （fail-stop：除非用户明确 y，否则不删）
  5. 用户确认后 `Remove-Item -Recurse -Force .specforge-`
- **验证**：`Test-Path .specforge-` → False

### 修复项 R8：补 WI-012 _meta.json
- **症状**：`.specforge/specs/WI-012/_meta.json` 不存在（WI-010 和 WI-011 都有）
- **修复方式**：
  1. 读 `.specforge/specs/WI-010/_meta.json` 和 `.specforge/specs/WI-011/_meta.json` 作为模板
  2. 读 WI-012 的 requirements.md / design.md / verification_report.md 摘取 title / summary / workflow_type / current_stage
  3. 用 `WorkItemMetaSchema.parse()` 校验生成的 JSON 合规
  4. 写入 `.specforge/specs/WI-012/_meta.json`
- **验证**：`bun test tests/architecture/` 中的 Suite 4 (_meta.json schema validation) 应该比修复前多通过 1 个 file

### **不在本 WI 范围内**（明确排除）
- ❌ 不要碰 `scripts/lint/check-hardcoded-paths.ts` 的正则（→ 留给 P4）
- ❌ 不要扩展 lint 到 `.md`（→ 留给 P4）
- ❌ 不要修改 README/AGENTS.md 加 marker（→ 留给 P4）
- ❌ 不要"顺手"修复任何其它 pre-existing test 失败
- ❌ 不要重命名 `specforge/observability/events.jsonl`，**删除**它而不是移动

---

## 4. 任务拆分建议（sf-task-planner 阶段参考）

按依赖关系建议分 3 组任务并行/串行：

```
Task 1: R1+R2 (configuration / plugin-loader 路径常量)  ─┐ 并行
Task 2: R3+R4 (Agent prompt 路径文本)                    ─┤
Task 3: R6   (sf_doctor 路径常量)                        ─┘
       ↓
Task 4: R5 (observability 写入者根因定位 + 修复) — 单独最大任务
       ↓
Task 5: R8 (WI-012 _meta.json 补写)
       ↓
Task 6: R7 (.specforge-/ 备份清理，必须用户确认)
```

R5 单独成一个最大的 task，必须配 design.md 章节写明：
- 调用链分析（谁 → EventLogger → 哪个 basePath）
- 修复方案（用哪个 LAYOUT 常量）
- 行为不变性测试（重启 daemon 5 分钟 + 多写 100 个事件后路径校验）

---

## 5. Gate 通过标准（reviewer / verifier 阶段必须验证）

### Review 阶段（sf-reviewer）必须检查
- [ ] **每一处修改都直接对应 §3 中的一个 R 编号**，无任何"顺手优化"
- [ ] 每个常量替换都用 `SPEC_DIR_NAME` 或 `LAYOUT.xxx`，**没有**新增的 `.specforge/` 字面量
- [ ] R5 的修改提供了完整的 before/after 调用链图
- [ ] R7 的 zip 兜底文件已生成并记录 sha256

### Verification 阶段（sf-verifier）必须跑的命令（exit 0 才算 pass）
```powershell
# 1. types 包测试不退步
bun test packages/types/tests/              # 期望: 74 pass / 0 fail

# 2. 架构测试不退步
bun test tests/architecture/                # 期望: ≥28 pass / 0 fail（R8 修后可能 +1）

# 3. lint 当前不退步（即便覆盖不全也得维持 exit 0）
bun run scripts/lint/check-hardcoded-paths.ts   # exit 0

# 4. sf-installer verify 通过
bun scripts/sf-installer.ts verify          # exit 0

# 5. 残留目录端到端冒烟（关键）
Stop-Process -Name bun -Force -ErrorAction SilentlyContinue
Remove-Item specforge -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item .specforge- -Recurse -Force -ErrorAction SilentlyContinue
# 重启 daemon（让 opencode 自动重启），等 60 秒
Start-Sleep -Seconds 60
Test-Path specforge        # 必须 False
Test-Path .specforge-      # 必须 False
Test-Path .specforge       # 必须 True

# 6. doctor 报 healthy
# 调用 sf_doctor → installation.overall = "ok"（不是 "error"）

# 7. WI-012 _meta.json 存在并通过 schema
Test-Path .specforge/specs/WI-012/_meta.json   # True
```

**任何一项不过 → verifier 直接 fail，不要做"主观判断 pass"**。

---

## 6. 硬规则（执行者必读）

1. ⚠️ **所有 shell 命令用 `sf_safe_bash`**；长任务用 `Start-Job + Wait-Job -Timeout` 包裹
2. ⚠️ **R5 和 R7 是高风险操作**，必须在 development 阶段调用 sf-executor 之前先调用 sf-debugger
   做风险评估，并把"daemon 停止 + 备份 + 操作 + 重启"作为单个原子任务
3. ⚠️ **不要扩散 scope**——验收员发现的问题里，#3（lint 加固）#6（render-layout marker）
   #9（verifier 制度）**全部不在本 WI 范围**，留给 P4。如果在执行中发现新问题，记录到
   work_log 的 "follow-up" 区，**不要**当场修
4. ⚠️ **R5 是本 WI 最容易翻车的点**——禁止"先删 specforge/observability 看看会不会再出现"
   作为唯一证据；必须先看代码定位写入者，再决定如何切换
5. ⚠️ **R7 删 `.specforge-/` 前必须用户确认**，二次确认机制不能跳过
6. ⚠️ **完成后**不要急着标 "Directory Layout v1.0 Locked"——还有 P4 没做

---

## 7. 完成后告诉用户

```
WI-{NN}（refactor）已完成。

修复项闭环情况：
- R1 constants.ts:70           [pass / fail]
- R2 fs-path-rules.ts:818      [pass / fail]
- R3 sf-knowledge.md:78        [pass / fail]
- R4 sf-orchestrator.md:82     [pass / fail]
- R5 observability 写入者根治  [pass / fail]   ← 关键
- R6 sf_doctor 路径常量        [pass / fail]
- R7 .specforge-/ 清理         [pass / fail]
- R8 WI-012 _meta.json         [pass / fail]

端到端冒烟（重启 daemon 60s 后）：
- Test-Path specforge       = False ✓ / ✗
- Test-Path .specforge-     = False ✓ / ✗
- sf_doctor installation.overall = ok ✓ / ✗

下一步建议：
- 全部 pass → 启动 P4（handoff-fix-lint-hardening.md）
- 任一 fail → 调度 sf-debugger 介入
```
