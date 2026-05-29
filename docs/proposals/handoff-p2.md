# Handoff Prompt — WI-012 P2: SpecForge V6 目录结构治理 - CI Lint + 强制约束上线

> **本文件用法**：在 OpenCode 新会话中，复制本文件全文给 sf-orchestrator，或者直接说：
> "请阅读 `docs/proposals/handoff-p2.md` 并按指令执行"
>
> **前置条件**：P1 必须已完成（WI-011 处于 completed 状态）。如果 P1 还没完成，请先执行 `docs/proposals/handoff-p1.md`。

---

## 1. 你的角色与硬性前置

你是 **sf-orchestrator**，新会话开始。请按 sf-orchestrator 的"启动流程"完成步骤 0-4，然后阅读本提示词后再创建 Work Item。

执行前先验证 P1 完成状态：

```
调用 sf_state_read(work_item_id="WI-011")，确认 current_state == "completed"
若 WI-011 仍在进行中，停止本任务，告诉用户先完成 P1
```

---

## 2. 任务背景（必读）

| 阶段 | 状态 | 内容 |
|---|---|---|
| **P0** | ✅ 已完成（WI-010） | Schema 与备份基础设施 |
| **P1** | ✅ 已完成（WI-011） | 代码全量切换 + 数据迁移 + setup 搬迁 |
| **P2** | ⏳ **本会话要做** | CI Lint + Architecture Test + 清扫存量 + docs/conventions/ 填充 |

**主输入文档**：
- **`docs/proposals/2026-05-29-directory-structure-governance.md`** —— 方案 A 全文，重点看 §8 三道强制门 + §9 Phase P2
- `.specforge/specs/WI-010/refactor_plan.md` —— P0 完成细节
- `.specforge/specs/WI-011/` —— P1 全部产物（含 review_report、verification_report）
- `docs/adr/ADR-006-specforge-dir-naming.md` —— 决策档案

---

## 3. 创建 Work Item

```
work_item_id: WI-012
workflow_type: refactor
title: SpecForge V6 目录结构治理 - P2 强制约束上线与存量清扫
```

理由：P2 主要是新增防御机制 + 清扫，纯新增/纯删除为主，无现有逻辑修改，refactor 工作流合适。

---

## 4. P2 任务清单（必须全部完成）

### T1：CI Lint 规则实现（防线 B）

新增自定义 lint 工具，扫描违规路径字面量：

**位置**：`scripts/lint/check-hardcoded-paths.ts`（新增）

**核心逻辑**：
- 用 `ripgrep` 或自实现 regex 扫描 `*.ts` / `*.md` 文件
- 禁止模式：
  - `'\.specforge[/'"]` 字符串字面量（除白名单文件）
  - `'specforge/'` 字符串字面量（不带点，应已被 P1 清光）
  - `"runtime/"` / `"specs/"` 等中间路径（必须经 LAYOUT 常量）
- 白名单（必须支持配置文件 `.lintrc-layout.json`）：
  - `packages/types/src/directory-layout.ts`
  - `scripts/migrations/**`
  - `tests/**/fixtures/**`
  - `**/*.test.ts`（仅限 mock 路径，需逐 case 判断）
  - `docs/adr/**`（ADR 引用历史路径合法）
- 退出码：发现违规 → exit 1，无违规 → exit 0

**集成到 CI**：
- `package.json` 新增 `scripts.lint:layout`
- `.github/workflows/` 下加 layout-check.yml（如果有 GitHub Actions）

### T2：Architecture Test 实现（防线 C）

新增架构验证测试：

**位置**：`tests/architecture/directory-layout.test.ts`（新增）

**验证内容**：
- 实际 `.specforge/` 目录树扫描 vs `LAYOUT` Schema 声明的子目录对比
- 任何"实际存在但 Schema 未声明"或"Schema 声明但实际不存在"的偏移 → 测试失败
- 验证所有 `code_file` 类型的 KG 节点对应的 `metadata.path` 确实存在
- 验证 `_meta.json` 文件符合 zod schema

**集成**：
- 加入 `bun run test` 的全量测试集
- CI 中独立标识 `architecture-tests`

### T3：清扫存量违规

跑 T1 的 lint 规则扫一遍全仓库，列出所有现存违规：

```powershell
bun run scripts/lint/check-hardcoded-paths.ts --list-violations
```

如果 P1 做得彻底，应该 0 违规。如果有遗漏：
- 逐个修复（替换为 `directory-layout.ts` 调用）
- 修复后再跑 lint 验证

### T4：填充 docs/conventions/ 内容

按方案 A §C 创建以下文件：

```
docs/conventions/
├── README.md                       ← 入口导航
├── directory-layout.md             ← 自动从 layout.ts 生成（P1 的 render-layout.ts 应已实现，本步骤填初始内容）
├── workflow-types.md               ← 8 种工作流详解
├── agent-roles.md                  ← 9 个 Agent 职责
├── file-naming.md                  ← 命名约定
├── wi-lifecycle.md                 ← WI 生命周期
├── meta-json-spec.md               ← _meta.json 字段规范（从 meta-schema.ts 自动生成）
└── glossary.md                     ← 术语表
```

**优先级**：
- 必须填：README.md、directory-layout.md、wi-lifecycle.md、glossary.md
- 推荐填：workflow-types.md、agent-roles.md、meta-json-spec.md
- 可选：file-naming.md（如果 P1 已经在多处文档统一了命名）

实现 `scripts/render-meta-schema.ts` 让 `meta-json-spec.md` 自动生成。

### T5：删除根目录残留临时文件

确认 P1 已删除，如有遗留：
- `test-*.txt`（已确认无 grep 引用）
- `run-concurrent-init.ps1` / `run-init-test.js` / `test-help-output.ts` / `test-init.ps1`
- `task-4.7-completion-summary.md`
- 空目录 `agents/`

### T6：删除已废弃的 `.kiro/specs/_archive/`

按方案 A §A 的"激进策略"（如果用户同意）：
- `.kiro/specs/_archive/` 全部移到 `docs/archive/kiro-specs/`
- 保留 `.kiro/steering/`（用户可能还用 Kiro 开发）

⚠️ 这一步**先问用户确认**，因为可能涉及历史记忆。

### T7：更新 README.md 顶层指引

在仓库根 `README.md` 顶部加入 `docs/conventions/` 入口指引：

```markdown
## 文档导航

- **新用户**：先看 [docs/conventions/README.md](docs/conventions/README.md) 了解项目治理规则
- **架构师**：看 [docs/adr/](docs/adr/) 了解关键决策记录
- **开发者**：看 [AGENTS.md](AGENTS.md) 了解 Agent 体系
- **贡献指南**：(若 P1/P2 引入了) [CONTRIBUTING.md](CONTRIBUTING.md)
```

### T8：跑全量回归测试

```powershell
$job = Start-Job -ScriptBlock { 
  Set-Location "D:\code\temp\SpecForge"
  bun run test 2>&1
}
if (Wait-Job $job -Timeout 600) { Receive-Job $job; Remove-Job $job } else { Stop-Job $job; Receive-Job $job; Remove-Job $job -Force; Write-Host "FULL_TEST_TIMEOUT_10min" }
```

记录所有 pass/fail 数字到 verification_report.md。

---

## 5. 不变行为约束（继承自 P0+P1）

- ✅ 所有现有测试套件继续 100% 通过（与 P1 完成后状态一致）
- ✅ daemon 启动行为、Plugin 加载、所有 8 种工作流正常端到端
- ✅ 用户级 / 项目级目录结构与 P1 完成后一致

---

## 6. 已知 SpecForge bug（来自 WI-010+WI-011，规避方法）

如果 P1 还没修，仍需规避：

| Bug | 规避方法 |
|---|---|
| `sf_artifact_write` 的 `file_type` 限制 | 降级用 `write` 工具 |
| `sf_state_transition` risk_path 守卫拒绝低风险直跳 | 走 development → review → verification |
| `sf_verification_gate` 偶发缓存 | 失败立即重试 |

---

## 7. 风险与成本预警

- **风险等级**：**低**（纯新增 lint + 测试 + 文档；现有功能零修改）
- **预估 token 消耗**：30K - 80K
- **预估时间**：30-90 分钟
- **回滚成本**：极低（删除新增文件即可）

---

## 8. 验收标准（出 P2 必须满足）

- [ ] `scripts/lint/check-hardcoded-paths.ts` 存在且能正确识别违规
- [ ] CI Lint 集成生效（PR 触发能跑、能拒绝违规）
- [ ] `tests/architecture/directory-layout.test.ts` 存在且通过
- [ ] `tests/architecture/` 加入全量测试集
- [ ] 全仓库跑 layout lint → 0 违规（P1 已切换干净 + P2 清扫了遗漏）
- [ ] `docs/conventions/` 至少含 4 个核心文档（README、directory-layout、wi-lifecycle、glossary）
- [ ] 根 README.md 顶部有 docs/conventions/ 入口指引
- [ ] 根目录无残留临时调试文件
- [ ] `bun run test` 全量回归通过（与 P1 完成后状态一致）
- [ ] `bun scripts/sf-installer.ts verify` 通过

---

## 9. 完成后告诉用户的话

P2 完成（流转到 completed）后，请向用户报告：

```
WI-012 P2 已完成，目录结构治理项目全部收尾。

三阶段成果：
- WI-010 P0：基础设施（Schema + ADR + 迁移脚本）
- WI-011 P1：代码全量切换 + setup 搬迁 + 文档生成器
- WI-012 P2：CI Lint + Architecture Test + docs/conventions

防护机制：
- 防线 A（TypeScript 类型）：编译期防御
- 防线 B（CI Lint）：PR 期防御
- 防线 C（Architecture Test）：运行时防御

下一步建议：
- 请用户跑最终验收：docs/proposals/handoff-final-verification.md
- 然后可以启动方案 B（Engineering Playbook 框架）
```
