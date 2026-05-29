# WI-014 Design Delta — Lint 防线加固 + Verifier 制度建设（P4）

> **工作流类型**：change_request
> **基于**：`intake.md`（变更范围）+ `impact_analysis.md`（3 个阻断级发现）
> **硬规则**：不碰 P3 已修复的 R1~R7，不改业务代码

---

## 增量设计描述

本次变更是**防线工程**（guardrail hardening），对已有 lint 工具、文档生成器、Agent 行为模板和 CI 配置进行增量修改。设计聚焦于 5 个修改项（C1~C5），不引入新架构层或新组件。

### 总体架构影响

```
                    ┌───────────────────────────────────┐
                    │    .github/workflows/              │
                    │    code-quality.yml                │
                    │  + lint-hardcoded-paths job (C5)   │
                    │  + render-layout-consistency job   │
                    └──────────┬────────────────────────┘
                               │ triggers
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
   ┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
   │ check-hardcoded- │ │render-layout │ │  sf-verifier.md   │
   │  paths.ts        │ │    .ts       │ │  (C4 冒烟模板)    │
   │ (C1 正则泛化)     │ │              │ │                   │
   │ (C2 .md 扫描)    │ │ (C3 时间戳)  │ └──────────────────┘
   └──────┬───────────┘ │ 幂等性修复)  │
          │             └──────┬───────┘
          ▼                    ▼
   ┌──────────────┐    ┌──────────────────┐
   │.lintrc-layout│    │ README.md        │
   │   .json      │    │ AGENTS.md        │
   │ (C2 白名单)  │    │ (C3 marker 注入) │
   └──────────────┘    └──────────────────┘
```

---

## DD-1 正则泛化设计（C1）

refs: [C1, intake.md]
constrained_by: 当前正则仅命中 `'specforge/'` 严格紧跟引号的字面量，需泛化至含 subpath 的路径

### 当前正则

```typescript
// 模式 1（.specforge 开头）：
regex: /['"]\.specforge[/'"\\]/g

// 模式 2（specforge/ 不带点前缀）：
regex: /['"]specforge\/['"]/g
```

### 目标正则

```typescript
// 模式 1（.specforge 开头，含 subpath）：
regex: /['"]\.specforge[/'"\\][^'"]*['"]/g

// 模式 2（specforge/ 不带点前缀，含 subpath）：
regex: /['"]specforge\/[^'"]*['"]/g
```

### 正则语义分析

**模式 1** `['"]\.specforge[/'"\\][^'"]*['"]`：
- `['"]` — 匹配开头引号（单或双）
- `\.specforge` — 匹配 `.specforge` 字面量
- `[/'"\\]` — 匹配路径分隔符或引号或反斜杠（与原始设计一致）
- `[^'"]*` — 匹配 0 个或多个非引号字符（即 subpath 部分）
- `['"]` — 匹配闭合引号
- **关键**：此模式匹配的闭合引号可能与开头引号不配对（如 `'` 开头 `"` 结尾），但这在实际代码中是极低概率事件，且 lint 工具的目标是"宁可多报不可漏报"。如需严格配对，需要使用捕获组 + 反向引用，但这会显著增加复杂度，当前 YAGNI。

**模式 2** `['"]specforge\/[^'"]*['"]`：
- 同上语义，但针对不带点前缀的 `specforge/` 路径。

### `shouldSkipLine()` 保持不变

npm scope 排除已由现有逻辑覆盖：

```typescript
// 跳过 @specforge/ npm scope 引用
if (/@specforge\//.test(trimmedLine)) return true;
```

对于测试用例 4/5（`'@specforge/types'` 和 `'@specforge/observability'`），虽然 `@specforge/` 在行中出现会触发 skip，但即使不 skip，新模式 2 也不会匹配它们——因为 `'@specforge/types'` 中 `specforge` 前面有 `@`，不满足 `['"]specforge\/` 的锚定。

**对于测试用例 6**（注释行 `// some specforge/foo`），`shouldSkipLine()` 已有注释跳过逻辑：

```typescript
if (/^\s*\/\//.test(trimmedLine)) return true;
```

### 测试用例设计（6 个，含预期结果）

| # | 输入 | 模式 | 预期 | 判定依据 |
|---|------|------|------|----------|
| T1 | `'specforge/'` | 模式 2 | ✅ 命中 | `[^'"]*` 匹配空串，等效旧正则 |
| T2 | `'specforge/config'` | 模式 2 | ✅ 命中 | `[^'"]*` 匹配 `config` |
| T3 | `'specforge/runtime/state.json'` | 模式 2 | ✅ 命中 | `[^'"]*` 匹配 `runtime/state.json` |
| T4 | `'@specforge/types'` | 模式 2 | ❌ 不命中 | `@` 在 `specforge` 前，不满足 `['"]specforge\/` |
| T5 | `'@specforge/observability'` | 模式 2 | ❌ 不命中 | 同上 |
| T6 | `// some specforge/foo` | — | ❌ 不命中 | `shouldSkipLine()` 跳过行注释 |

**测试文件位置**：`scripts/lint/__tests__/check-hardcoded-paths.test.ts`（新建目录和文件）

**测试框架**：`bun:test`（与项目现有测试一致，见 `tests/architecture/directory-layout.test.ts`）

### 执行顺序约束

1. 先写测试用例 → 跑测试确认旧正则 T2/T3 失败
2. 改正则 → 跑测试确认全部 pass
3. 跑全仓 lint（`bun run scripts/lint/check-hardcoded-paths.ts`）→ 确认不爆炸或按 C2 白名单处理

### `scripts/lib/` 路径暴露问题

C1 泛化后，以下文件将被检测为违规：
- `scripts/lib/project_runtime.ts`（约 20 处 `"specforge/..."` 硬编码）
- `scripts/lib/runtime_manifest.ts`（1 处 `"specforge/runtime-manifest.json"`）

**处理策略**：在 DD-2 白名单设计中将 `scripts/lib/**` 加入白名单。论证见 DD-2。

---

## DD-2 白名单设计（C2）

refs: [C2, intake.md, impact_analysis.md-风险1, impact_analysis.md-风险2]
constrained_by: `.lintrc-layout.json` note 要求 dual-person approval

### 新增白名单条目及论证

```json
{
  "whitelist": [
    "packages/types/src/directory-layout.ts",
    "packages/types/src/meta-schema.ts",
    "scripts/migrations/**",
    "tests/**/fixtures/**",
    "**/*.test.ts",
    "scripts/lint/**",
    "scripts/render-layout.ts",
    "scripts/render-specs-readme.ts",
    "scripts/render-meta-schema.ts",
    "docs/adr/**",

    "docs/audit/**",
    "docs/proposals/**",
    ".specforge/specs/**/*.md",
    "docs/conventions/**",
    "README.md",
    "AGENTS.md",
    "**/CHANGELOG.md",
    "scripts/lib/**"
  ]
}
```

### 逐条论证

| 条目 | 论证 |
|------|------|
| `docs/audit/**` | 验收/审计报告引用老路径作为问题描述的记录。这些是历史记录文档，引用旧路径是内容本身的正当需要（描述"当时发现了什么问题"）。修改它们反而破坏审计完整性。 |
| `docs/proposals/**` | 提案文档（如本 `handoff-fix-lint-hardening.md`）引用旧路径描述变更对象。这些是设计讨论文档，引用旧路径是为了说明"要改什么"。 |
| `.specforge/specs/**/*.md` | 历史 spec 报告（requirements.md / design.md / verification_report.md）引用路径描述需求和验收标准。这些是阶段产物，不应被 lint 修改。 |
| `docs/conventions/**` | 约定文档由 `render-layout.ts` 自动生成（含 marker），其内容来源于 `directory-layout.ts` 常量。lint 白名单已有 `scripts/render-layout.ts`，生成物也应覆盖。 |
| `README.md` | 顶部入口文档，包含安装指南中的示例命令（如 `rm -rf ~/.specforge/`）和目录结构示意。这些引用是面向用户的使用说明，不是代码逻辑。C3 会在其中注入 marker，注入内容来自 render-layout。 |
| `AGENTS.md` | Agent 总览文档，包含 `specforge/` 目录结构说明（line 36-41）。这些是文档描述，不是可执行代码。C3 同样会注入 marker。 |
| `**/CHANGELOG.md` | 变更日志记录历史版本中涉及的路径变更。修改历史日志条目不符合审计原则。 |

### `scripts/lib/**` 白名单论证（阻断级决策）

**加入白名单的理由**：

1. **业务合理性**：`scripts/lib/project_runtime.ts` 和 `scripts/lib/runtime_manifest.ts` 是 installer/reconcile 系统，它们使用 `"specforge/"`（不带点）路径是因为**项目级运行时尚未迁移到 `.specforge/`**。这是已知的遗留状态（intake 明确说"不碰 P3 已修复的修复点"）。

2. **范围控制**：将这些文件迁移到使用 `directory-layout.ts` 常量需要：
   - 修改 `project_runtime.ts` 的 `RUNTIME_REQUIRED_DIRS` 和 `RUNTIME_TEMPLATE_FILES` 数组
   - 修改 `runtime_manifest.ts` 的 `RUNTIME_MANIFEST_RELATIVE` 常量
   - 可能影响 installer 的 reconcile 逻辑
   - 这超出 P4"防线工程"的范围，是 P3 遗留的后续迁移任务

3. **过渡策略**：白名单条目 `scripts/lib/**` 是**有期限的过渡方案**。后续 WI 专门处理 `scripts/lib/` 到 `directory-layout.ts` 常量的迁移后，此白名单条目应被移除。

4. **影响面评估**：`scripts/lib/` 目录下的文件数量有限（< 10 个），白名单不会掩盖大量潜在问题。后续迁移完成后清理即可。

**替代方案被否决的理由**：
- 方案 B（立即迁移）：超出 P4 范围，且 intake 硬规则说"不碰 P3 已修复的修复点"
- 不加白名单：C5 CI lint job 将持续失败，阻断所有 PR

### `.md` 文件扫描扩展

**修改点**：`check-hardcoded-paths.ts` 的 `collectTsFiles()` 函数（line 161）

```typescript
// 当前：
} else if (entry.isFile() && entry.name.endsWith('.ts')) {

// 目标：
} else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.md'))) {
```

**同步修改 — 函数更名**：将 `collectTsFiles` 更名为 `collectTargetFiles`，语义更准确。

**同步修改 — `shouldSkipLine()` 扩展**：

```typescript
function shouldSkipLine(trimmedLine: string, fileExt: string): boolean {
  // 现有规则（.ts 和 .md 通用）
  if (/^\s*import\s/.test(trimmedLine)) return true;
  if (/^\s*\/\//.test(trimmedLine)) return true;
  if (/^\s*\*\s/.test(trimmedLine)) return true;
  if (/^\s*\/\*/.test(trimmedLine)) return true;
  if (/@specforge\//.test(trimmedLine)) return true;
  if (/SPEC_DIR_NAME|SPEC_USER_DIR_NAME/.test(trimmedLine)) return true;

  // Markdown 特有规则（仅 .md 文件）
  if (fileExt === '.md') {
    // 跳过 Markdown 注释 <!-- ... -->
    if (/^\s*<!--.*-->\s*$/.test(trimmedLine)) return true;
    // 跳过代码块边界 ```（不跳过代码块内容——代码块内的路径引用也应被检测）
    if (/^\s*```/.test(trimmedLine)) return true;
  }

  return false;
}
```

**关于代码块内的路径**：Markdown 代码块（` ``` ` 围栏）内的内容通常是示例命令或配置片段，其中引用 `specforge/` 是合法的。但考虑到：
1. README.md 和 AGENTS.md 已在白名单中
2. 其他 `.md` 文件中的代码块内硬编码路径确实可能是问题
3. 误报风险由白名单控制

**决策**：不跳过代码块内容（` ``` ` 行本身跳过即可，因为那不是路径行）。代码块内的路径引用会被检测，但白名单覆盖了合法场景。

---

## DD-3 marker 注入设计（C3）

refs: [C3, intake.md]
constrained_by: `render-layout.ts` 已实现 `updateMarkersInFile()` 函数（line 283-308），且已配置 marker targets 为 `['README.md', 'AGENTS.md']`（line 352-355）

### 现有能力确认

`render-layout.ts` 的 marker 注入机制已完整：
- `BEGIN_MARKER = '<!-- BEGIN: directory-layout -->'`（line 276）
- `END_MARKER = '<!-- END: directory-layout -->'`（line 277）
- `updateMarkersInFile()` 函数：读取文件 → 定位 marker → 替换中间内容 → 写回（line 283-308）
- marker targets 已包含 `README.md` 和 `AGENTS.md`（line 352-355）

**结论**：不需要修改 `render-layout.ts` 的 marker 注入逻辑。只需在目标文件中插入空的 marker 对。

### README.md marker 锚点

**目标位置**：在"目录结构"章节（line 144-195）之后、"工作流"章节（line 199）之前

```markdown
<!-- 在 line 197 之后插入 -->
<!-- BEGIN: directory-layout -->
<!-- 此区域由 scripts/render-layout.ts 自动生成，请勿手动编辑 -->
<!-- 内容会在 CI 中校验，编辑请改 packages/types/src/directory-layout.ts -->
<!-- END: directory-layout -->
```

**选择理由**：
- "目录结构"章节是目录布局信息的自然上下文
- marker 注入的内容是目录布局的详细表格，与"目录结构"章节语义一致
- 在"工作流"章节前插入不会打断文档结构

### AGENTS.md marker 锚点

**目标位置**：在文件末尾（line 41 之后）

```markdown
<!-- 在文件末尾追加 -->
<!-- BEGIN: directory-layout -->
<!-- 此区域由 scripts/render-layout.ts 自动生成，请勿手动编辑 -->
<!-- 内容会在 CI 中校验，编辑请改 packages/types/src/directory-layout.ts -->
<!-- END: directory-layout -->
```

**选择理由**：
- AGENTS.md 是简短的规则文件（41 行），无"目录结构"章节
- 文件末尾追加不干扰现有 Agent 规则的结构
- render-layout 注入的内容是参考信息，放在末尾作为附录

### 注入流程

1. 在 README.md 和 AGENTS.md 中插入空 marker 对（仅含注释行）
2. 运行 `bun run scripts/render-layout.ts`
3. 脚本检测到 marker → 注入当前 LAYOUT 的 markdown 表格
4. `git diff` 验证注入结果

### 时间戳幂等性问题（C3 附带修复）

**问题**：`render-layout.ts` line 268 的 `*最后更新：${new Date().toISOString()}*` 导致每次运行产生不同输出，C5 的 `git diff --exit-code` 会因此失败。

**设计方案**：**移除时间戳行**

```typescript
// 当前（line 266-269）：
return `# SpecForge 目录布局
...
---

*最后更新：${new Date().toISOString()}*
`;

// 目标（删除最后两行）：
return `# SpecForge 目录布局
...
---
`;
```

**选择理由**：
- 时间戳信息可通过 `git log` 获取，不需要在生成物中嵌入
- 移除时间戳使输出完全幂等：相同输入 → 相同输出
- 比 `git diff --ignore-matching-lines` 方案更简洁，不需要维护 CI 中的排除规则
- 比基于 git hash 的方案更简单，不引入 git 依赖

---

## DD-4 fs 冒烟检查模板设计（C4）

refs: [C4, intake.md]
constrained_by: `sf-verifier.md` 是 Agent 行为模板，修改后需用户运行 installer 同步

### 端到端文件系统冒烟流程

在 `setup/userlevel-opencode/agents/sf-verifier.md` 的 `# V3.7 执行协议` 章节之前，新增以下内容：

```markdown
## 端到端文件系统冒烟（强制）

当本次修改涉及以下任一条件时，**必须**执行端到端文件系统冒烟检查：
- 路径常量修改（`directory-layout.ts`）
- 目录布局变更（新增/删除/重命名目录）
- 文件 IO 操作（reconcile、migration、installer）
- `.specforge/` 或 `specforge/` 相关的任何修改

### 流程

#### Step 1：基线快照

在执行任何修改前，记录当前文件系统状态：

\`\`\`bash
# 列出关键目录结构
Get-ChildItem -Path .specforge -Recurse -Directory -ErrorAction SilentlyContinue \
  | Select-Object FullName, LastWriteTime \
  | Sort-Object FullName \
  | Out-File -FilePath .tmp/fs-baseline.txt -Encoding utf8
\`\`\`

#### Step 2：执行后冒烟

修改完成后，执行完整生命周期后再次快照：

\`\`\`bash
# 1. 停止 daemon（如有）
Stop-Process -Name bun -Force -ErrorAction SilentlyContinue

# 2. 运行 installer reconcile（如涉及）
bun scripts/sf-installer.ts install

# 3. 等待 Plugin 初始化（模拟 OpenCode 启动）
# （手动触发或等待 60s）

# 4. 再次快照
Get-ChildItem -Path .specforge -Recurse -Directory -ErrorAction SilentlyContinue \
  | Select-Object FullName, LastWriteTime \
  | Sort-Object FullName \
  | Out-File -FilePath .tmp/fs-after.txt -Encoding utf8
\`\`\`

#### Step 3：关键不变性断言

| 断言 | 命令 | 预期 |
|------|------|------|
| 旧路径不存在 | `Test-Path specforge` | `$false` |
| 备份路径不存在 | `Test-Path .specforge-` | `$false`（除非任务声明保留） |
| 带点路径存在 | `Test-Path .specforge` | `$true` |
| 事件文件活跃 | `.specforge/observability/events.jsonl` 的 mtime > 修改前时间 | `$true` |
| manifest 有效 | `Test-Path .specforge/runtime-manifest.json` | `$true` |

#### Step 4：证据归档

将冒烟证据写入验证报告：

\`\`\`
调用 sf_artifact_write：
  work_item_id: "<work_item_id>"
  file_type: "verification_report"
  content: '{
    "e2e_fs_smoke": {
      "baseline_snapshot": "<fs-baseline.txt 内容摘要>",
      "after_snapshot": "<fs-after.txt 内容摘要>",
      "invariants": [
        {"name": "旧路径不存在", "status": "pass/fail", "evidence": "Test-Path specforge = False"},
        ...
      ]
    }
  }'
\`\`\`

⚠️ **不允许**把"代码层 grep 无残留"等价于"运行期无残留"。必须验证实际文件系统状态。
```

### 联动检查

`superpowers-verification-before-completion` Skill 的描述是"要求 Agent 在声明任务完成前必须提供充分的验证证据"，与 C4 的端到端冒烟要求一致。C4 是在 sf-verifier 的行为模板中增加具体操作步骤，与 Skill 的通用要求互补，**不需要修改 Skill 本身**。

### 用户同步提醒

修改 `sf-verifier.md` 后，在 verification_report 中增加提示：

```markdown
> **提醒**：sf-verifier.md 已更新，请运行 `bun scripts/sf-installer.ts install` 同步到 `~/.config/opencode/agents/`。
```

---

## DD-5 CI 集成设计（C5）

refs: [C5, intake.md]
constrained_by: 现有 CI 使用 `ubuntu-latest` + `bun`，新增 job 保持一致

### 新增 Job 1：`lint-hardcoded-paths`

```yaml
  # ─── 硬编码路径 Lint ────────────────────────────────────────────────────────
  lint-hardcoded-paths:
    name: 硬编码路径 Lint
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - name: 检出代码
        uses: actions/checkout@v4

      - name: 安装 Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: 安装依赖
        run: bun install --frozen-lockfile

      - name: 运行硬编码路径 Lint
        run: bun run scripts/lint/check-hardcoded-paths.ts
```

**说明**：
- 脚本已有 exit 0/1 语义，无需包装
- 超时 5 分钟足够（当前扫描全仓 < 10s）

### 新增 Job 2：`render-layout-consistency`

```yaml
  # ─── 目录布局一致性检查 ──────────────────────────────────────────────────────
  render-layout-consistency:
    name: 目录布局一致性检查
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - name: 检出代码
        uses: actions/checkout@v4

      - name: 安装 Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: 安装依赖
        run: bun install --frozen-lockfile

      - name: 生成目录布局
        run: bun run scripts/render-layout.ts

      - name: 检查生成物与提交一致
        run: git diff --exit-code -- README.md AGENTS.md docs/conventions/directory-layout.md
```

**说明**：
- DD-3 已移除时间戳，输出完全幂等
- `git diff --exit-code` 在有差异时返回 1，自动标记 CI 失败
- 检查的 3 个文件是 render-layout 的所有输出目标：
  1. `docs/conventions/directory-layout.md`（直接写入）
  2. `README.md`（marker 更新）
  3. `AGENTS.md`（marker 更新）

### Job 间关系

两个新 job **相互独立**，可与现有 job 并行运行。不需要 `needs:` 依赖。

---

## 受影响模块

### 代码模块

| 模块 | 修改类型 | 关联 DD | interface 变更 |
|------|----------|--------|---------------|
| `scripts/lint/check-hardcoded-paths.ts` | 修改（正则 + 扫描范围） | DD-1, DD-2 | `collectTsFiles()` → `collectTargetFiles()`（更名）；`shouldSkipLine()` 签名新增 `fileExt` 参数 |
| `.lintrc-layout.json` | 修改（新增 8 条白名单） | DD-2 | 无（JSON 配置，无 interface） |
| `scripts/render-layout.ts` | 修改（移除时间戳，line 268） | DD-3 | 无（内部生成逻辑，interface 不变） |
| `README.md` | 修改（插入 marker 对） | DD-3 | N/A（文档文件） |
| `AGENTS.md` | 修改（插入 marker 对） | DD-3 | N/A（文档文件） |
| `setup/userlevel-opencode/agents/sf-verifier.md` | 修改（新增冒烟章节） | DD-4 | N/A（Agent 行为模板） |
| `.github/workflows/code-quality.yml` | 修改（新增 2 个 job） | DD-5 | N/A（CI 配置） |

### 新增文件

| 文件 | 用途 | 关联 DD |
|------|------|--------|
| `scripts/lint/__tests__/check-hardcoded-paths.test.ts` | lint 工具单元测试 | DD-1 |

### 不修改的模块（只读依赖）

| 模块 | 原因 |
|------|------|
| `packages/types/src/directory-layout.ts` | lint 和 render-layout 的上游 Schema，本次不修改 |
| `scripts/lib/project_runtime.ts` | 白名单过渡，不修改 |
| `scripts/lib/runtime_manifest.ts` | 白名单过渡，不修改 |
| `tests/architecture/directory-layout.test.ts` | 现有架构测试，回归验证用 |
| `packages/**` 下所有业务代码 | intake 硬规则：不改业务代码 |

---

## 兼容性影响

### 向后兼容

| 维度 | 影响 | 严重度 |
|------|------|--------|
| lint 正则泛化 | **检测范围扩大**：以前不报的带 subpath 路径现在会报违规 | 低（由白名单覆盖） |
| lint 扩展到 `.md` | **扫描范围扩大**：`.md` 文件也会被扫描 | 低（由白名单覆盖） |
| `shouldSkipLine()` 签名变更 | 新增 `fileExt` 参数，所有调用点需更新 | 低（仅 `check-hardcoded-paths.ts` 内部调用） |
| render-layout 时间戳移除 | 生成的 `directory-layout.md` 少一行时间戳 | 无影响（信息冗余） |
| CI 新增 2 个 job | 所有未来 PR 需通过 lint + layout 一致性检查 | 中（阻塞不合规 PR，但这是预期行为） |

### API 变更

- **无公共 API 变更**。所有修改限于内部工具和 CI 配置。
- `scripts/lint/check-hardcoded-paths.ts` 的 CLI interface（`bun run scripts/lint/check-hardcoded-paths.ts [--list-violations]`）不变。

### 配置变更

- `.lintrc-layout.json` 白名单从 10 条扩展到 18 条。需要 dual-person approval（按 `.lintrc-layout.json` note 要求）。

---

## 回归风险

### 高风险点

| 风险 | 触发条件 | 缓解措施 | 验证方法 |
|------|----------|----------|----------|
| C1 正则误报 npm scope | `@specforge/` 路径被错误匹配 | `shouldSkipLine()` 已有 `@specforge/` 排除；新模式 2 的 `['"]specforge\/` 锚定排除了 `@` 前缀 | 测试用例 T4/T5 |
| C1 正则导致全仓 lint 失败 | 泛化后命中未白名单的合法路径 | DD-2 白名单覆盖 `scripts/lib/**` | 全仓 lint 运行（exit 0） |
| C2 `.md` 扫描误报爆炸 | 大量历史文档被标记为违规 | DD-2 白名单覆盖 8 个 `.md` 目录/文件 | 全仓 lint 运行（exit 0） |

### 中风险点

| 风险 | 触发条件 | 缓解措施 | 验证方法 |
|------|----------|----------|----------|
| C5 CI lint job 阻塞合法 PR | 白名单遗漏导致合法路径被标记 | 先本地跑 lint 确认 exit 0，再提交 CI | 本地 `bun run scripts/lint/check-hardcoded-paths.ts` |
| C3 marker 位置不合适 | 注入内容打断文档结构 | 选择在已有相关章节后插入 | 人工审查注入后的 README.md / AGENTS.md |

### 低风险点

| 风险 | 触发条件 | 缓解措施 | 验证方法 |
|------|----------|----------|----------|
| C4 用户副本未同步 | 修改 sf-verifier.md 后用户未跑 installer | verification_report 中加提醒 | 人工提醒 |
| C3 render-layout 时间戳移除 | 丢失"最后更新"信息 | git log 提供等价信息 | 无需验证 |
| C5 render-layout 一致性检查误报 | 极端情况下 render 输出不稳定 | DD-3 移除时间戳保证幂等 | `bun run scripts/render-layout.ts && git diff --exit-code` |

### 回归验证清单

```bash
# 1. lint 单元测试
bun test scripts/lint/__tests__/check-hardcoded-paths.test.ts
# 预期：6 pass / 0 fail

# 2. lint 实跑无违规
bun run scripts/lint/check-hardcoded-paths.ts
# 预期：exit 0

# 3. 故意触发违规
echo "'specforge/runtime/foo.json'" > .tmp/bad-trigger.md
bun run scripts/lint/check-hardcoded-paths.ts
# 预期：exit 1
rm .tmp/bad-trigger.md

# 4. render-layout 幂等性
bun run scripts/render-layout.ts
git diff --exit-code -- README.md AGENTS.md docs/conventions/directory-layout.md
# 预期：exit 0

# 5. 架构测试不退步
bun test tests/architecture/
# 预期：全部 pass

# 6. sf-verifier 模板检查
Select-String -Path setup/userlevel-opencode/agents/sf-verifier.md -Pattern "端到端文件系统冒烟"
# 预期：有匹配
```

---

## KG 追溯关系

### impact_analysis.md 变更范围对应

| impact_analysis 条目 | 对应 DD | 处理方式 |
|---------------------|---------|----------|
| C1：修复 lint 正则 | DD-1 | 正则泛化 + 6 个测试用例 |
| 风险 1：scripts/lib/ 路径暴露 | DD-2 | `scripts/lib/**` 白名单过渡 |
| 风险 2：.md 误报爆炸 | DD-2 | 8 条 .md 白名单条目 |
| C3：marker 注入 | DD-3 | 插入空 marker 对 + render-layout 执行 |
| 风险 3：文档体积膨胀 | DD-3 | 低风险，可接受 |
| 风险 4：时间戳幂等性 | DD-3 | 移除时间戳行 |
| C4：verifier 冒烟模板 | DD-4 | 新增冒烟章节到 sf-verifier.md |
| 风险 5：用户副本未同步 | DD-4 | verification_report 提醒 |
| C5：CI 集成 | DD-5 | 2 个新 job |
| 发现 3：lint 测试为零 | DD-1 | 新建 __tests__/ + 6 个测试用例 |

### 3 个阻断级发现的闭环

| 阻断级发现 | 闭环 DD | 闭环方式 |
|------------|---------|----------|
| 发现 1：`scripts/lib/` 硬编码路径暴露 | DD-2 | `scripts/lib/**` 加入白名单（过渡方案） |
| 发现 2：`render-layout.ts` 时间戳非幂等 | DD-3 | 移除 line 268 的时间戳行 |
| 发现 3：现有 lint 测试为零 | DD-1 | 新建 `scripts/lint/__tests__/` + 6 个测试用例 |

### 建议新增的 KG 节点

| 节点 ID | 类型 | 标签 | 关联 |
|---------|------|------|------|
| `WI-014:design_decision:1` | design_decision | `C1 正则泛化` | → `WI-011:code_file:1`（directory-layout.ts） |
| `WI-014:design_decision:2` | design_decision | `C2 白名单扩展` | → `WI-014:design_decision:1` |
| `WI-014:design_decision:3` | design_decision | `C3 marker 注入 + 时间戳修复` | → `WI-011:task:10`（render-layout.ts） |
| `WI-014:design_decision:4` | design_decision | `C4 fs 冒烟模板` | → `WI-011:task:9`（sf-installer.ts） |
| `WI-014:design_decision:5` | design_decision | `C5 CI 集成` | 独立 |

---

## Out of Scope

以下内容**明确不在本次变更范围内**：

1. **P3 已修复的 R1~R7 修复点**：intake 硬规则，不得触碰
2. **业务逻辑代码**：`packages/**` 下所有代码不修改
3. **`scripts/lib/` 迁移**：白名单过渡，迁移留给后续 WI
4. **`directory-layout.ts` 常量修改**：上游 Schema 本次不变
5. **`superpowers-verification-before-completion` Skill 修改**：与 C4 互补，不需要联动
6. **`docs/conventions/directory-layout.md` 内容修改**：由 render-layout 自动生成，非手动修改
7. **CHANGELOG 标记 "Directory Layout v1.0 Locked"**：在全部验证通过后执行，不属于设计阶段

---

## Assumptions

1. **P3 已全部完成**：仓库无 `specforge/`、无 `.specforge-/` 残留（intake 前置条件）
2. **白名单治理规则有效**：`.lintrc-layout.json` 的 dual-person approval 规则能阻止未来不当扩展
3. **`scripts/lib/` 迁移将由后续 WI 处理**：当前白名单是过渡方案，不是永久解
4. **CI runner 使用 ubuntu-latest**：与现有 job 一致，lint 脚本跨平台兼容
5. **bun 1.3.11+ 支持所有需要的 API**：`Bun.file()`、`Bun.CryptoHasher()` 在 CI 的 latest bun 版本可用
6. **README.md 和 AGENTS.md 是唯一的 marker 目标**：`render-layout.ts` 硬编码了这两个文件
7. **render-layout 输出幂等性可由移除时间戳保证**：相同输入 → 相同 markdown 输出
8. **用户会在 C4 完成后运行 installer 同步**：sf-verifier.md 修改后需手动同步
