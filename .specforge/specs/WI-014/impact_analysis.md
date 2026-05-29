# WI-014 影响分析 — Lint 防线加固 + Verifier 制度建设

> 生成时间：2026-05-29
> 分析范围：C1~C5 五个修改项对现有代码库、CI 流程、Agent 行为的影响

---

## 变更范围

### 概述

本次变更是**防线工程**（guardrail hardening），不修改任何业务逻辑代码。涉及 5 个修改项（C1~C5），影响范围集中在 lint 工具、文档生成器、Agent 模板和 CI 配置。

### C1：修复 lint 正则（带 subpath 命中）

| 维度 | 详情 |
|------|------|
| **直接修改文件** | `scripts/lint/check-hardcoded-paths.ts`（line 112、117 的两个正则） |
| **修改内容** | 泛化 `VIOLATION_PATTERNS` 中两个正则，使带 subpath 的路径字面量可被检测 |
| **当前正则** | 模式 1：`/['"]\.specforge[/'"\\]/g`；模式 2：`/['"]specforge\/['"]/g` |
| **目标正则** | 模式 1：`/['"]\.specforge[/'"\\][^'"]*['"]/g`；模式 2：`/['"]specforge\/[^'"]*['"]/g` |
| **新增测试** | ≥5 个单元测试用例（需新建 `scripts/lint/__tests__/` 目录） |
| **影响边界** | 仅影响 lint 检测结果；**正则泛化后可能导致现有未命中路径被暴露**（见下方风险评估） |

### C2：lint 扩展扫描到 `.md`

| 维度 | 详情 |
|------|------|
| **直接修改文件** | `scripts/lint/check-hardcoded-paths.ts`（line 161 文件过滤逻辑 + `shouldSkipLine()` 函数） |
| **修改内容** | 1. `collectTsFiles()` 扩展为同时收集 `.md` 文件；2. `shouldSkipLine()` 增加 Markdown 注释 `<!-- ... -->` 和代码块边界处理 |
| **白名单更新** | `.lintrc-layout.json` 新增 8 条 `.md` 白名单条目 |
| **影响边界** | 扫描范围从 `.ts` 文件扩大到 `.ts + .md`，可能命中大量历史文档中的路径引用 |

### C3：README/AGENTS.md 加 directory-layout 注入 marker

| 维度 | 详情 |
|------|------|
| **直接修改文件** | `README.md`、`AGENTS.md`（插入 marker 对） |
| **修改内容** | 在合适位置插入 `<!-- BEGIN: directory-layout -->` / `<!-- END: directory-layout -->` marker |
| **联动操作** | 运行 `bun run scripts/render-layout.ts` 将当前 LAYOUT 渲染到 marker 区域 |
| **影响边界** | `render-layout.ts` 已实现 marker 注入逻辑（line 276-308 `updateMarkersInFile`），无需修改脚本本身 |

### C4：sf-verifier 端到端 fs 冒烟检查模板化

| 维度 | 详情 |
|------|------|
| **直接修改文件** | `setup/userlevel-opencode/agents/sf-verifier.md` |
| **修改内容** | 在验证协议中增加"端到端文件系统冒烟"强制章节（基线快照→执行后冒烟→不变性断言→证据归档） |
| **影响边界** | 仅影响 Agent 行为模板，不修改任何可执行代码；用户需运行 `sf-installer.ts install` 同步到 `~/.config/opencode/` |
| **联动检查** | `superpowers-verification-before-completion` Skill 是否需要同步更新 |

### C5：CI 加入 lint + render-layout 一致性检查

| 维度 | 详情 |
|------|------|
| **直接修改文件** | `.github/workflows/code-quality.yml` |
| **修改内容** | 新增 2 个 job：`lint-hardcoded-paths`（运行 lint 脚本）和 `render-layout-consistency`（运行 render-layout + git diff 检查） |
| **影响边界** | 所有未来 PR 都将经过这两项检查；**若 lint 结果不为 0 或 render-layout 输出不一致，PR 将被阻塞** |

### 文件变更矩阵

| 文件 | C1 | C2 | C3 | C4 | C5 |
|------|----|----|----|----|-----|
| `scripts/lint/check-hardcoded-paths.ts` | ✏️ | ✏️ | | | |
| `.lintrc-layout.json` | | ✏️ | | | |
| `README.md` | | | ✏️ | | |
| `AGENTS.md` | | | ✏️ | | |
| `setup/userlevel-opencode/agents/sf-verifier.md` | | | | ✏️ | |
| `.github/workflows/code-quality.yml` | | | | | ✏️ |
| `scripts/lint/__tests__/*.test.ts`（新建） | ✏️ | | | | |

---

## 风险评估

### 总体风险等级：**中**

### 风险详情

#### 风险 1：C1 正则泛化后暴露 `scripts/lib/` 中的硬编码路径（高风险点）

**发现**：`scripts/lib/project_runtime.ts` 和 `scripts/lib/runtime_manifest.ts` 包含大量硬编码 `specforge/`（不带点）路径字面量：

```typescript
// scripts/lib/project_runtime.ts line 52-59
const RUNTIME_REQUIRED_DIRS = [
  "specforge/runtime",    // ← C1 泛化后会被命中
  "specforge/logs",
  "specforge/config",
  "specforge/sessions",
  ...
]

// scripts/lib/runtime_manifest.ts line 22
const RUNTIME_MANIFEST_RELATIVE = "specforge/runtime-manifest.json"
```

这些文件**不在当前白名单中**（`scripts/lib/**` 未列入 `.lintrc-layout.json`）。当前正则 `['"]specforge\/['"]/g` 不命中它们（因为 `specforge/runtime` 在斜杠后紧跟路径段而非引号），但 C1 泛化后**必然被检测为违规**。

**影响**：lint 运行结果将从 exit 0 变为 exit 1（报告约 20+ 条违规），阻断 C5 的 CI 集成。

**缓解方案**（需 design.md 论证选择）：
- 方案 A：将 `scripts/lib/**` 加入白名单（这些是 installer/reconcile 逻辑，有合理理由使用旧路径名）
- 方案 B：将 `scripts/lib/project_runtime.ts` 和 `scripts/lib/runtime_manifest.ts` 迁移到使用 `directory-layout.ts` 常量（但这超出 P4 防线工程范围，且 intake 明确说"不要碰 P3 已修复的修复点"）
- 方案 C：分阶段执行——C1 先加白名单过渡，后续 WI 专门处理 `scripts/lib/` 迁移

#### 风险 2：C2 扩展到 `.md` 后误报爆炸（中风险）

**发现**：全仓 `.md` 文件中存在大量合法的 `specforge` 路径引用，包括：
- `docs/audit/` — 验收/审计报告中引用老路径作为问题描述（已存在但未白名单）
- `docs/proposals/` — 提案文档引用老路径（未白名单）
- `.specforge/specs/**/*.md` — 历史 spec 报告（未白名单）
- `CHANGELOG.md` — 变更日志引用路径（未白名单）
- `README.md`、`AGENTS.md` — 顶部入口文档（C3 会加 marker，但内容本身可能含引用）

**缓解**：提案中的白名单新增 8 条条目基本覆盖这些场景，但需在 design.md 中逐条论证。

#### 风险 3：C3 marker 注入后的文档体积膨胀（低风险）

`render-layout.ts` 生成的目录布局 markdown 约 72 行。注入到 README.md 和 AGENTS.md 后会增加文件体积，但不影响功能。两个文件中 marker 的放置位置需谨慎选择，避免打断文档结构。

#### 风险 4：C5 CI 一致性检查的幂等性问题（低风险）

`render-layout.ts` 的输出包含时间戳（`*最后更新：${new Date().toISOString()}*`），这会导致每次运行生成不同内容。CI 中 `git diff --exit-code` 可能因此误报不一致。

**缓解**：需在 design.md 中考虑是否修改 `render-layout.ts` 移除时间戳，或 CI 检查时排除时间戳行。

#### 风险 5：C4 verifier 模板更新未同步到用户副本（低风险）

修改 `setup/userlevel-opencode/agents/sf-verifier.md` 后，用户本地的 `~/.config/opencode/agents/sf-verifier.md` 不会自动更新。需提醒用户运行 installer。

---

## 回归测试范围

### 必须通过的测试

| 测试项 | 命令 | 预期结果 | 关联修改项 |
|--------|------|----------|------------|
| lint 单元测试（新增） | `bun test scripts/lint/` | ≥6 pass / 0 fail（含 5 个新增 C1 用例） | C1 |
| lint 实跑无违规 | `bun run scripts/lint/check-hardcoded-paths.ts` | exit 0 | C1, C2 |
| 故意触发违规 | 写入含 `'specforge/runtime/foo.json'` 的测试文件后运行 lint | exit 1 | C1 |
| render-layout 输出一致性 | `bun run scripts/render-layout.ts && git diff --exit-code` | exit 0（无差异） | C3 |
| 架构测试不退步 | `bun test tests/architecture/` | 全部 pass（baseline 同 P3 完成后） | C1-C5 |
| sf-verifier 模板检查 | 搜索 `端到端文件系统冒烟` 关键词 | 有匹配 | C4 |

### 需要回归验证的模块

| 模块 | 原因 | 验证方式 |
|------|------|----------|
| `scripts/lint/check-hardcoded-paths.ts` | C1 改正则 + C2 改文件过滤 | 单元测试 + 全仓 lint 运行 |
| `scripts/render-layout.ts` | C3 依赖其 marker 注入逻辑 | dry-run + 实际运行对比 |
| `packages/types/src/directory-layout.ts` | lint 和 render-layout 的上游依赖 | 确认未被修改（只读依赖） |
| `tests/architecture/directory-layout.test.ts` | 唯一现有架构测试，验证布局常量完整性 | 运行确认 pass |
| `.lintrc-layout.json` | C2 白名单变更 | 全仓 lint 运行确认无新增误报 |
| `scripts/lib/project_runtime.ts` | C1 后可能暴露的违规来源 | lint 运行确认处理策略 |
| `scripts/lib/runtime_manifest.ts` | 同上 | lint 运行确认处理策略 |
| `setup/userlevel-opencode/agents/sf-verifier.md` | C4 模板修改 | 内容审查 + 关键词搜索 |
| `.github/workflows/code-quality.yml` | C5 CI 配置修改 | PR check 验证 |

### 回归排除范围

以下内容**不在回归范围内**（硬规则）：
- P3 已修复的 R1~R7 修复点——不得触碰
- 业务逻辑代码——本次不修改任何业务代码
- `packages/` 下的模块——本次不涉及

---

## KG 关联

### 直接关联节点（来自 WI-011）

| 节点 ID | 类型 | 标签 | 关联原因 |
|---------|------|------|----------|
| `WI-011:code_file:1` | code_file | `directory-layout.ts` | lint 和 render-layout 的上游 Schema 定义 |
| `WI-011:task:10` | task | `render-layout.ts 文档生成器` | C3 依赖此任务的产物 |
| `WI-011:task:1` | task | `扩展 directory-layout.ts 用户级路径 Schema` | Schema 的原始定义任务 |

### 间接关联节点

| 节点 ID | 类型 | 标签 | 关联原因 |
|---------|------|------|----------|
| `WI-011:task:9` | task | `sf-installer.ts 改造` | C4 修改 sf-verifier.md 后需 installer 同步 |
| `WI-011:task:13` | task | `清理废弃文件` | lint 白名单需覆盖清理脚本中的旧路径引用 |

### 应新增的 KG 节点（建议在 design 阶段创建）

| 建议节点 | 类型 | 标签 | 说明 |
|----------|------|------|------|
| `WI-014:code_file:1` | code_file | `check-hardcoded-paths.ts` | C1/C2 核心修改目标 |
| `WI-014:code_file:2` | code_file | `sf-verifier.md` | C4 修改目标 |
| `WI-014:code_file:3` | code_file | `code-quality.yml` | C5 修改目标 |

### 知识库关联

- lint 正则模式的设计意图（来自 P3 经验教训）
- 白名单治理规则（`.lintrc-layout.json` note: "dual-person approval"）
- `render-layout.ts` 的 marker 注入协议

---

## 附录：关键发现摘要

### 发现 1：`scripts/lib/` 硬编码路径暴露（阻断级）

C1 正则泛化后，以下文件中的 `specforge/`（不带点）路径将被检测为违规：
- `scripts/lib/project_runtime.ts`（约 20 处）
- `scripts/lib/runtime_manifest.ts`（1 处）

这些是 installer/reconcile 系统的旧路径引用，**尚未迁移到 `directory-layout.ts` 常量**。需在 design.md 中明确处理策略，否则 C5 的 CI job 会持续失败。

### 发现 2：`render-layout.ts` 时间戳导致非幂等（CI 阻断级）

`render-layout.ts` line 268 生成的 markdown 包含动态时间戳：
```typescript
*最后更新：${new Date().toISOString()}*
```
C5 的 `git diff --exit-code` 检查会因为每次运行产生不同的时间戳而失败。需在 design.md 中决定是否移除时间戳或修改 CI 检查逻辑。

### 发现 3：现有 lint 测试为零

当前 `scripts/lint/` 下不存在 `__tests__/` 目录或任何测试文件。C1 要求新增的 ≥5 个单元测试将是 lint 工具的首批测试。需确定测试框架（vitest vs bun:test）和测试文件位置。
