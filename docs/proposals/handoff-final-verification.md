# Handoff Prompt — 最终验收：SpecForge V6 目录结构治理（P0+P1+P2）

> **本文件用法**：在 OpenCode 新会话中（**与 P0/P1/P2 不同的会话**，干净环境验收最可靠），
> 复制本文件全文给 sf-orchestrator，或者直接说：
> "请阅读 `docs/proposals/handoff-final-verification.md` 并执行最终验收"
>
> **前置条件**：P0、P1、P2 三个 WI 必须全部完成。

---

## 1. 你的角色

你是 **sf-orchestrator**，作为**独立第三方验收员**对整个目录结构治理项目（P0+P1+P2）做端到端验证。

⚠️ **关键纪律**：
- **不依赖之前任何会话的记忆**——所有判断必须基于实际文件 + 实际命令输出
- **不要修复任何问题**——发现问题时记录，由用户决定开新 WI 修复
- **不要被"已经写过的报告"误导**——独立复核每条验收标准

---

## 2. 启动流程（必走）

按 sf-orchestrator 的"启动流程"步骤 0-4 完成基础检测。然后**先确认三个 WI 的状态**：

```
sf_state_read(work_item_id="all")
# 必须看到：
# - WI-010 workflow_type=refactor      state=completed
# - WI-011 workflow_type=change_request state=completed
# - WI-012 workflow_type=refactor      state=completed
```

如果任何一个不在 completed 状态，停止验收，告诉用户："验收前置条件未满足，WI-XXX 仍在 YYY 状态。"

---

## 3. 验收检查清单（分 6 类）

### 类别 A：Schema 与决策档案（来自 P0）

| # | 验收项 | 检查方法 |
|---|---|---|
| A1 | `packages/types/src/directory-layout.ts` 存在且导出完整 | `Get-Content` 看 SPEC_DIR_NAME / LAYOUT / 3 个路径构造函数都在 |
| A2 | `packages/types/src/meta-schema.ts` 存在导出 zod schema | `Get-Content` 看 WorkItemMetaSchema / WorkItemMeta 类型 |
| A3 | `docs/adr/ADR-006-specforge-dir-naming.md` 含 4 段标准结构 | `Select-String "^## (Status\|Context\|Decision\|Consequences)"` 输出 4 行 |
| A4 | `scripts/migrations/v6-dir-rename.ts` + `v6-dir-backup.ts` 存在 | `Test-Path` 两个文件 |
| A5 | types 包测试通过 | `bun test packages/types/tests/` → expect pass/fail=58/0（或更多）|
| A6 | types 包 tsc 编译通过 | `bun run tsc --noEmit -p packages/types` → exit 0 |

### 类别 B：代码全量切换（来自 P1）

| # | 验收项 | 检查方法 |
|---|---|---|
| B1 | daemon-core 12 个 core 文件不再含裸路径字面量 | `grep "\.specforge" packages/daemon-core/src/tools/lib/*.ts` —— 应仅出现在 import 行或路径常量调用中 |
| B2 | `.opencode/tools/lib/` 路径已与 daemon-core 统一 | `grep "specforge/" .opencode/tools/lib/` → 应无匹配（或仅注释） |
| B3 | 8 个 SKILL.md 全部使用 `.specforge/specs/`（带点） | `grep -l "specforge/specs/" .opencode/skills/*/SKILL.md` → 应无匹配（应该都是 `.specforge/specs/`）|
| B4 | 4 个 Agent prompt 全部使用 `.specforge/`（带点） | 同 B3，扫 `.opencode/agents/sf-*.md` |
| B5 | permission-engine 路径切换完成 | `grep "./specforge/" packages/permission-engine/src/**/*.ts` → 应无匹配 |
| B6 | setup/ 目录建成 | `Test-Path setup/userlevel-opencode/`、`setup/userlevel-scripts-lib/`、`setup/userlevel-templates/` 均 true |
| B7 | sf-installer.ts 从 setup/ 读 | `grep "path.join(sourceDir," scripts/sf-installer.ts` → 应看到 `"setup"` 而非 `".opencode"` |
| B8 | 文档生成器 `render-layout.ts` 存在 | `Test-Path scripts/render-layout.ts` |
| B9 | README/AGENTS.md 含 `<!-- BEGIN: directory-layout -->` marker | `Select-String "BEGIN: directory-layout" README.md AGENTS.md` |
| B10 | `specs/README.md` 含 WI 索引 | `Test-Path .specforge/specs/README.md`；内容含 WI-001 至 WI-012 |
| B11 | 数据迁移执行完成（仓库无双目录残留） | `Test-Path specforge` → false；`Test-Path .specforge` → true |
| B12 | 根目录无 `.opencode-/`、`opencode.json`、临时文件 | `Test-Path .opencode-`、`Test-Path opencode.json` 均 false |

### 类别 C：强制约束（来自 P2）

| # | 验收项 | 检查方法 |
|---|---|---|
| C1 | CI Lint 工具存在 | `Test-Path scripts/lint/check-hardcoded-paths.ts` |
| C2 | 全仓库跑 lint → 0 违规 | `bun run scripts/lint/check-hardcoded-paths.ts` → exit 0 |
| C3 | Architecture Test 存在 | `Test-Path tests/architecture/directory-layout.test.ts` |
| C4 | Architecture Test 通过 | `bun test tests/architecture/` → pass/fail = N/0 |
| C5 | 故意触发：人为加一行违规，确认 lint 能拦下 | 测试用临时文件加 `const x = '.specforge/runtime/state.json'`，跑 lint → exit 1；恢复 |

### 类别 D：文档（来自 P2）

| # | 验收项 | 检查方法 |
|---|---|---|
| D1 | `docs/conventions/README.md` 存在 | `Test-Path` |
| D2 | `docs/conventions/directory-layout.md` 存在（生成器输出） | `Test-Path` + 看内容是否与 Schema 一致 |
| D3 | `docs/conventions/wi-lifecycle.md` 存在 | `Test-Path` |
| D4 | `docs/conventions/glossary.md` 存在 | `Test-Path` |
| D5 | 仓库根 `README.md` 顶部有 `docs/conventions/` 入口指引 | `Get-Content README.md -Head 30` 含相关链接 |

### 类别 E：行为不变性（端到端）

| # | 验收项 | 检查方法 |
|---|---|---|
| E1 | daemon 启动正常 | `sf_doctor` → daemon_components 全 ok |
| E2 | 全量回归测试通过 | `bun run test` 全量跑（**用 Start-Job + Wait-Job -Timeout 600 包裹**），与 P0 前一致（允许 pre-existing failures 但不能新增） |
| E3 | sf-installer 4 个命令正常 | `bun scripts/sf-installer.ts verify` → exit 0 |
| E4 | 工作流能端到端跑通 | 试创建一个新的 quick_change WI 测试（最轻量工作流），跑完 intake → completed |

### 类别 F：知识沉淀

| # | 验收项 | 检查方法 |
|---|---|---|
| F1 | WI-010/011/012 各自的 verification_report.md 存在且结论 pass | 读三个文件，看最终结论 |
| F2 | 三个 WI 的 _meta.json 已生成（如果 P1 已实现） | `Test-Path .specforge/specs/WI-010/_meta.json` 等 |
| F3 | sf-knowledge 已沉淀经验（completed 后自动触发） | 看 `~/.specforge/knowledge/` 或全局知识库是否有新条目 |

---

## 4. 验收报告产出

完成所有检查后，写入：

**文件**：`docs/audit/2026-XX-XX-directory-governance-final-audit.md`

**结构**：

```markdown
# SpecForge V6 目录结构治理 — 最终验收报告

**验收日期**：YYYY-MM-DD
**验收人**：sf-orchestrator（独立会话）
**WI 范围**：WI-010 (P0) + WI-011 (P1) + WI-012 (P2)

## 总体结论

**conclusion = pass / partial-pass / fail**

总检查项：XX
通过：YY
失败：ZZ
警告：WW

## 类别 A：Schema 与决策档案

| 项 | 状态 | 证据 |
|---|---|---|
| A1 | pass | ... |
...

## 类别 B：代码全量切换

（同上格式）

## 类别 C：强制约束
## 类别 D：文档  
## 类别 E：行为不变性
## 类别 F：知识沉淀

## 发现的问题（如有）

按严重度排序，每条含：
- 严重度（high / medium / low）
- 描述
- 影响范围
- 建议处理（新开 WI / 立即修 / 不修）

## 已知 pre-existing 问题（与本治理项目无关）

（如 daemon-core SessionRegistry 5 个测试失败）

## 治理项目最终评价

- 设计完整性：A / B / C / D
- 实施质量：A / B / C / D
- 文档完备性：A / B / C / D
- 风险管控：A / B / C / D

## 建议下一步

如果一切 pass：
- 启动方案 B（Engineering Playbook 框架）的 WI
- 把 P0/P1/P2 的成功经验沉淀为团队最佳实践
- 在 CHANGELOG 标记 "Directory Layout v1.0 Locked"

如果有问题：
- 列出问题分级修复路径
```

---

## 5. 硬规则（验收员必读）

1. ⚠️ **客观验证，不要带情绪**——pass 就 pass，fail 就 fail，不要为"项目努力了那么久"而美化结果
2. ⚠️ **所有 shell 命令用 sf_safe_bash**，每次 `bun test` 用 Start-Job + Wait-Job 包裹
3. ⚠️ **不要尝试修复任何发现的问题**——你是验收员不是执行者
4. ⚠️ **C5 的故意触发测试要记得恢复**——避免污染仓库
5. ⚠️ **如果发现 pass 与 fail 之间有歧义**（比如 lint 报 1 个违规但其实合法），在报告中明确写出 reasoning
6. ⚠️ **如果发现 SpecForge 自身 daemon/工具的 bug**（不是 P0/P1/P2 范围）单独列出

---

## 6. 完成后告诉用户的话

```
SpecForge V6 目录结构治理 — 最终验收完成。

总体结论：[pass / partial-pass / fail]
通过 X / Y 项检查。

详细报告：docs/audit/YYYY-MM-DD-directory-governance-final-audit.md

发现的高优先级问题：N 个
建议处理方式：[列出]

下一步建议：
- 如果 pass：可以启动方案 B（Engineering Playbook 框架）
- 如果 partial-pass：先开 WI 修复严重项
- 如果 fail：召集 review，重新规划

✅ 治理项目里程碑达成 / ⚠️ 需要补救 / ❌ 需要重大调整
```
