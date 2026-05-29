# WI-014 Tasks — Lint 防线加固 + Verifier 制度建设（P4）

> **工作流类型**：change_request
> **基于**：`intake.md` + `impact_analysis.md` + `design_delta.md`（5 个 DD）
> **硬规则**：不碰 P3 已修复的 R1~R7，不改业务代码
> **环境**：Windows 11 / bun 1.3.11 / pwsh

---

## 执行计划

### 并行批次

- **Batch 1**（并行）：TASK-1, TASK-3
- **Batch 2**（串行）：TASK-2（依赖 TASK-1）
- **Batch 3**（并行）：TASK-4, TASK-5（依赖 TASK-1 + TASK-2 + TASK-3）

### 依赖关系图

```
TASK-1 (C1 正则+测试) ──┐
                        ├─→ TASK-2 (C2 .md+白名单) ──┬─→ TASK-4 (C4 verifier)
TASK-3 (C3 marker+时间戳)┘                            └─→ TASK-5 (C5 CI)
```

### 串行说明

TASK-1 和 TASK-2 都修改 `scripts/lint/check-hardcoded-paths.ts`。虽然修改行号不重叠
（TASK-1 改 line 112/117 正则 + line 289 main guard；TASK-2 改 line 122-137 shouldSkipLine
+ line 144-169 collectTsFiles + line 172/188/251 调用点），但两个 executor 并行写入
同一文件会导致后写者覆盖前写者变更，因此 **TASK-2 必须在 TASK-1 之后串行执行**。

TASK-3 修改的文件（README.md、AGENTS.md、scripts/render-layout.ts）与 TASK-1/TASK-2
完全无交集，可以与 TASK-1 并行。

---

### TASK-1 修复 lint 正则泛化 + 新增单元测试

**context_block**（executor 必读）：
- **What**: 泛化 `scripts/lint/check-hardcoded-paths.ts` 中 `VIOLATION_PATTERNS` 的两个正则（line 112 和 line 117），使其能命中带 subpath 的路径字面量；同时新建 `scripts/lint/__tests__/check-hardcoded-paths.test.ts` 包含 6 个单元测试；为支持测试导入，需导出关键函数并用 `import.meta.main` 保护 `main()` 调用
- **Why**: 当前正则只能匹配 `'specforge/'` 严格紧跟引号的情况，无法命中 `'specforge/config'`、`"specforge/runtime/state.json"` 等带 subpath 的违规路径
- **Refs**: DD-1（正则泛化设计，design_delta.md DD-1 段）
- **Constraints**:
  - 只修改 `VIOLATION_PATTERNS` 数组中的两个 regex（line 112 和 line 117），不改动 shouldSkipLine / collectTsFiles / scanFile / main 等函数的内部逻辑
  - 正则泛化后，`shouldSkipLine()` 已有的 npm scope 排除（`/@specforge\//`）和新正则锚定设计（`['"]specforge\/` 要求引号紧跟 specforge）共同保证不误报
  - 为让测试文件能导入函数，需将 `shouldSkipLine`、`VIOLATION_PATTERNS` 改为 export，并将 line 289 的 `main();` 改为 `if (import.meta.main) { main(); }`
  - 测试框架使用 `bun:test`（与 `tests/architecture/directory-layout.test.ts` 一致）
  - 不引入新依赖
- **Done When**:
  - 正则泛化完成：模式 1 `/['"]\.specforge[/'"\\][^'"]*['"]/g`，模式 2 `/['"]specforge\/[^'"]*['"]/g`
  - 6 个测试用例全部 pass
  - `bun test scripts/lint/__tests__/` exit 0

**具体修改**：

1. **修改 `scripts/lint/check-hardcoded-paths.ts`**：

   a) `VIOLATION_PATTERNS`（line 106-120）— 两个 regex 泛化：
   ```typescript
   // 模式 1（line 112）：
   // 当前：regex: /['"]\.specforge[/'"\\]/g,
   // 目标：
   regex: /['"]\.specforge[/'"\\][^'"]*['"]/g,

   // 模式 2（line 117）：
   // 当前：regex: /['"]specforge\/['"]/g,
   // 目标：
   regex: /['"]specforge\/[^'"]*['"]/g,
   ```

   b) 导出关键符号——在 `VIOLATION_PATTERNS`（line 106）前加 `export`：
   ```typescript
   export const VIOLATION_PATTERNS: {
   ```

   c) 导出 `shouldSkipLine`——在 `shouldSkipLine`（line 123）前加 `export`：
   ```typescript
   export function shouldSkipLine(trimmedLine: string): boolean {
   ```

   d) 保护 `main()` 调用（line 289）：
   ```typescript
   // 当前：main();
   // 目标：
   if (import.meta.main) {
     main();
   }
   ```

2. **新建 `scripts/lint/__tests__/check-hardcoded-paths.test.ts`**（新建目录和文件）：

   6 个测试用例（详见表格和代码框架见 design_delta.md DD-1 段）：

   | # | 输入 | 模式 | 预期 |
   |---|------|------|------|
   | T1 | `'specforge/'` | 模式 2 | 命中（`[^'"]*` 匹配空串，向后兼容） |
   | T2 | `'specforge/config'` | 模式 2 | 命中（`[^'"]*` 匹配 `config`） |
   | T3 | `'specforge/runtime/state.json'` | 模式 2 | 命中（`[^'"]*` 匹配 `runtime/state.json`） |
   | T4 | `'@specforge/types'` | 模式 2 | 不命中（`@` 在 specforge 前，不满足锚定） |
   | T5 | `'@specforge/observability'` | 模式 2 | 不命中（同上） |
   | T6 | `// some specforge/foo` | — | 不命中（shouldSkipLine 跳过行注释） |

   测试实现要点：
   - T1-T5：直接用 `VIOLATION_PATTERNS[1].regex.test(input)` 验证
   - T6：用 `shouldSkipLine('// some specforge/foo') === true` 验证
   - 每次 test 前重置 `regex.lastIndex = 0`

- **依赖**: 无
- refs: [DD-1, C1]
- files: [scripts/lint/check-hardcoded-paths.ts, scripts/lint/__tests__/check-hardcoded-paths.test.ts]
- **verification_commands**:
  1. `bun test scripts/lint/__tests__/check-hardcoded-paths.test.ts` — 预期：6 pass / 0 fail / exit 0
  2. `bun run scripts/lint/check-hardcoded-paths.ts --list-violations` — 预期：exit 0（list-only 模式）。**注意**：此时可能报告 `scripts/lib/` 中的违规（约 20+ 条），这是预期行为，TASK-2 将通过白名单处理

---

### TASK-2 扩展 lint 扫描到 .md 文件 + 更新白名单

**context_block**（executor 必读）：
- **What**: 将 `check-hardcoded-paths.ts` 的扫描范围从 `.ts` 扩展到 `.ts + .md`；更新 `shouldSkipLine()` 增加 `fileExt` 参数以处理 Markdown 特有语法（注释和代码块边界）；将 `collectTsFiles()` 更名为 `collectTargetFiles()`；在 `.lintrc-layout.json` 中新增 8 条白名单条目；同步更新 TASK-1 新建的测试文件
- **Why**: 当前 lint 只扫描 `.ts` 文件，忽略 `.md` 文件中的硬编码路径（如文档中的 `specforge/` 目录引用），存在检测盲区。扩展扫描后需要白名单覆盖合法的 `.md` 路径引用，否则会误报爆炸
- **Refs**: DD-2（白名单设计，design_delta.md DD-2 段）
- **Constraints**:
  - `shouldSkipLine()` 签名变更：新增 `fileExt: string` 参数
  - 函数更名：`collectTsFiles` → `collectTargetFiles`
  - `scanFile()` 需传入 fileExt 以支持 shouldSkipLine 的 Markdown 规则
  - 白名单新增 8 条条目，每条都有 design_delta.md DD-2 段中的逐条论证
  - `scripts/lib/**` 白名单是有期限的过渡方案（后续 WI 处理 scripts/lib/ 到 directory-layout.ts 常量的迁移后移除）
  - TASK-1 的测试文件 `scripts/lint/__tests__/check-hardcoded-paths.test.ts` 中 T6 调用了 `shouldSkipLine()`，由于签名变更（新增 fileExt 参数），**必须同步更新此测试文件**中 T6 的调用
  - 不引入新依赖
- **Done When**:
  - `.md` 文件被 lint 扫描覆盖
  - `shouldSkipLine()` 正确处理 Markdown 注释 `<!-- ... -->` 和代码块边界 ` ``` `
  - 白名单从 10 条扩展到 18 条
  - `bun run scripts/lint/check-hardcoded-paths.ts` exit 0（无违规）
  - TASK-1 的 6 个测试仍然全部 pass

**具体修改**：

1. **修改 `scripts/lint/check-hardcoded-paths.ts`**：

   a) `shouldSkipLine` 签名和逻辑（line 123-137）——新增 `fileExt` 参数 + Markdown 规则：
   ```typescript
   export function shouldSkipLine(trimmedLine: string, fileExt: string = '.ts'): boolean {
     // 现有规则（.ts 和 .md 通用）
     if (/^\s*import\s/.test(trimmedLine)) return true;
     if (/^\s*\/\//.test(trimmedLine)) return true;
     if (/^\s*\*\s/.test(trimmedLine)) return true;
     if (/^\s*\/\*/.test(trimmedLine)) return true;
     if (/@specforge\//.test(trimmedLine)) return true;
     if (/SPEC_DIR_NAME|SPEC_USER_DIR_NAME/.test(trimmedLine)) return true;

     // Markdown 特有规则（仅 .md 文件）
     if (fileExt === '.md') {
       if (/^\s*<!--.*-->\s*$/.test(trimmedLine)) return true;
       if (/^\s*```/.test(trimmedLine)) return true;
     }

     return false;
   }
   ```

   b) `collectTsFiles` → `collectTargetFiles`（line 144）— 更名 + 扩展文件过滤（line 161）：
   ```typescript
   function collectTargetFiles(rootDir: string): string[] {
     // ... 保持不变 ...
       } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.md'))) {
     // ... 保持不变 ...
   }
   ```

   c) `scanFile` 函数（line 172）— 新增 `fileExt` 参数并传递给 shouldSkipLine（line 188）：
   ```typescript
   function scanFile(filePath: string, fileExt: string): Violation[] {
     // ...
     if (shouldSkipLine(trimmed, fileExt)) continue;
     // ...
   }
   ```

   d) `main()` 函数中更新引用：
   - line 251：`collectTsFiles` → `collectTargetFiles`
   - line 261-263：scanFile 调用需传入 fileExt（从 filePath 提取）

2. **修改 `.lintrc-layout.json`**：在 `whitelist` 数组末尾新增 8 条：
   ```json
   "docs/audit/**",
   "docs/proposals/**",
   ".specforge/specs/**/*.md",
   "docs/conventions/**",
   "README.md",
   "AGENTS.md",
   "**/CHANGELOG.md",
   "scripts/lib/**"
   ```

3. **更新 `scripts/lint/__tests__/check-hardcoded-paths.test.ts`**（TASK-1 创建的测试文件）：
   - T6 测试用例中 `shouldSkipLine` 调用需传入 `fileExt` 参数：`shouldSkipLine('// some specforge/foo', '.ts')`

- **依赖**: [TASK-1]
- refs: [DD-2, C2]
- files: [scripts/lint/check-hardcoded-paths.ts, .lintrc-layout.json, scripts/lint/__tests__/check-hardcoded-paths.test.ts]
- **verification_commands**:
  1. `bun run scripts/lint/check-hardcoded-paths.ts` — 预期：exit 0（输出 `✓ No hardcoded path violations found.`）
  2. `bun test scripts/lint/__tests__/check-hardcoded-paths.test.ts` — 预期：6 pass / 0 fail（TASK-1 的测试仍然全部通过）

---

### TASK-3 marker 注入 + render-layout 时间戳移除

**context_block**（executor 必读）：
- **What**: 在 `README.md` 和 `AGENTS.md` 中插入 `<!-- BEGIN: directory-layout -->` / `<!-- END: directory-layout -->` marker 对；从 `scripts/render-layout.ts` 中移除时间戳行（line 268）；运行 render-layout.ts 生成内容并注入 marker 区域
- **Why**: README.md 和 AGENTS.md 缺少 marker，render-layout.ts 无法向其注入自动生成的目录布局。时间戳导致每次运行输出不同，CI 的一致性检查（`git diff --exit-code`）会因此失败
- **Refs**: DD-3（marker 注入设计，design_delta.md DD-3 段）
- **Constraints**:
  - `render-layout.ts` 的 marker 注入逻辑（`updateMarkersInFile()` line 283-308）和 marker targets（line 352-355 `['README.md', 'AGENTS.md']`）**已经完整，不需要修改注入逻辑**
  - 只需在目标文件中插入空 marker 对（含注释行），render-layout 会自动填充
  - README.md marker 位置：line 197 `---` 之后、line 199 `## 工作流` 之前（"目录结构"章节之后）
  - AGENTS.md marker 位置：文件末尾（line 41 之后）
  - 移除 `render-layout.ts` line 268 的时间戳 `*最后更新：${new Date().toISOString()}*` 及其前方空行，使输出完全幂等
  - 不碰 P3 已修复的 R1~R7
  - 不引入新依赖
- **Done When**:
  - README.md 和 AGENTS.md 包含 marker 对
  - render-layout.ts 输出不含时间戳（`toISOString` 不再出现）
  - `bun run scripts/render-layout.ts` 成功执行，marker 区域被注入目录布局内容
  - 重复运行 render-layout 后 `git diff --exit-code` 无差异（幂等性）

**具体修改**：

1. **修改 `README.md`**：在 line 197 `---` 之后、line 199 `## 工作流` 之前插入：
   ```markdown

   <!-- BEGIN: directory-layout -->
   <!-- 此区域由 scripts/render-layout.ts 自动生成，请勿手动编辑 -->
   <!-- 内容会在 CI 中校验，编辑请改 packages/types/src/directory-layout.ts -->
   <!-- END: directory-layout -->
   ```

2. **修改 `AGENTS.md`**：在文件末尾（line 41 之后）追加：
   ```markdown

   <!-- BEGIN: directory-layout -->
   <!-- 此区域由 scripts/render-layout.ts 自动生成，请勿手动编辑 -->
   <!-- 内容会在 CI 中校验，编辑请改 packages/types/src/directory-layout.ts -->
   <!-- END: directory-layout -->
   ```

3. **修改 `scripts/render-layout.ts`**：移除 line 266-269 中的空行和时间戳行：
   ```typescript
   // 当前（generateMarkdown 函数末尾，约 line 265-269）：
   ${makeTableRows(userEntries)}

   ---

   *最后更新：${new Date().toISOString()}*
   `;

   // 目标（删除空行 + 时间戳行）：
   ${makeTableRows(userEntries)}

   ---
   `;
   ```
   即删除 `\n\n*最后更新：${new Date().toISOString()}*` 部分，保留 `---` 分隔线和模板字符串结束的 `` `; ``。

4. **运行 render-layout 生成内容**：
   ```bash
   bun run scripts/render-layout.ts
   ```
   脚本会检测到 marker → 注入当前 LAYOUT 的 markdown 表格到 README.md 和 AGENTS.md 的 marker 区域，同时更新 `docs/conventions/directory-layout.md`。

- **依赖**: 无
- refs: [DD-3, C3]
- files: [README.md, AGENTS.md, scripts/render-layout.ts]
- **verification_commands**:
  1. `bun run scripts/render-layout.ts` — 预期：exit 0，输出含 `✓ Generated: docs/conventions/directory-layout.md` 和 `✓ Updated markers in: README.md` / `AGENTS.md`
  2. `bun run scripts/render-layout.ts`（重复运行）后 `git diff --exit-code -- README.md AGENTS.md docs/conventions/directory-layout.md` — 预期：exit 0（幂等，第二次运行无差异）
  3. 搜索确认时间戳已移除：在 `scripts/render-layout.ts` 中搜索 `toISOString` — 预期：0 匹配

---

### TASK-4 sf-verifier 端到端文件系统冒烟模板

**context_block**（executor 必读）：
- **What**: 在 `setup/userlevel-opencode/agents/sf-verifier.md` 中新增"端到端文件系统冒烟（强制）"章节，定义当修改涉及路径常量、目录布局、文件 IO 时必须执行的文件系统级冒烟检查流程（基线快照→执行后冒烟→不变性断言→证据归档）
- **Why**: P3 过程中暴露了"代码层 grep 无残留 ≠ 运行期无残留"的问题。当前 sf-verifier 没有文件系统级冒烟检查的强制要求，需要在验证协议中增加具体操作步骤
- **Refs**: DD-4（fs 冒烟检查模板设计，design_delta.md DD-4 段）
- **Constraints**:
  - 只修改 `setup/userlevel-opencode/agents/sf-verifier.md`，不修改任何可执行代码
  - 新增章节插入在 `## 高效验证规则` 章节（line 71）之前（即 line 70 `---` 之后、line 71 之前）
  - `superpowers-verification-before-completion` Skill **不需要修改**（与 C4 互补，不冲突）
  - 修改后需提醒用户运行 `bun scripts/sf-installer.ts install` 同步到 `~/.config/opencode/agents/`
  - 不引入新依赖
- **Done When**:
  - sf-verifier.md 包含完整的"端到端文件系统冒烟（强制）"章节
  - 章节包含 4 个步骤：基线快照、执行后冒烟、不变性断言（5 条）、证据归档
  - 关键词 `端到端文件系统冒烟` 可被搜索到
  - 包含 `⚠️ 不允许把"代码层 grep 无残留"等价于"运行期无残留"` 警告

**具体修改**：

1. **修改 `setup/userlevel-opencode/agents/sf-verifier.md`**：在 line 70（`---` 分隔线）之后、line 71（`## 高效验证规则`）之前，插入完整章节。内容模板见 design_delta.md DD-4 段。

   章节结构：
   ```
   ## 端到端文件系统冒烟（强制）

   当本次修改涉及以下任一条件时，**必须**执行端到端文件系统冒烟检查：
   - 路径常量修改（`directory-layout.ts`）
   - 目录布局变更（新增/删除/重命名目录）
   - 文件 IO 操作（reconcile、migration、installer）
   - `.specforge/` 或 `specforge/` 相关的任何修改

   ### 流程

   #### Step 1：基线快照
   [PowerShell 命令：Get-ChildItem .specforge -Recurse -Directory → fs-baseline.txt]

   #### Step 2：执行后冒烟
   [完整生命周期后再次快照：Stop-Process → install → 等待 → Get-ChildItem → fs-after.txt]

   #### Step 3：关键不变性断言
   | 断言 | 命令 | 预期 |
   |------|------|------|
   | 旧路径不存在 | Test-Path specforge | $false |
   | 备份路径不存在 | Test-Path .specforge- | $false |
   | 带点路径存在 | Test-Path .specforge | $true |
   | 事件文件活跃 | events.jsonl mtime > 修改前 | $true |
   | manifest 有效 | Test-Path .specforge/runtime-manifest.json | $true |

   #### Step 4：证据归档
   [sf_artifact_write 调用模板]

   ⚠️ **不允许**把"代码层 grep 无残留"等价于"运行期无残留"。必须验证实际文件系统状态。
   ```

   完整内容请严格按照 design_delta.md DD-4 段的模板写入。

- **依赖**: [TASK-1, TASK-2, TASK-3]
- refs: [DD-4, C4]
- files: [setup/userlevel-opencode/agents/sf-verifier.md]
- **verification_commands**:
  1. 搜索章节标题确认存在：在 `setup/userlevel-opencode/agents/sf-verifier.md` 中搜索 `端到端文件系统冒烟` — 预期：至少 1 处匹配
  2. 搜索不变性断言确认完整：搜索 `旧路径不存在` — 预期：至少 1 处匹配
  3. 搜索警告行确认存在：搜索 `运行期无残留` — 预期：至少 1 处匹配
  4. 搜索基线快照步骤确认存在：搜索 `fs-baseline.txt` — 预期：至少 1 处匹配

---

### TASK-5 CI 加入 lint + render-layout 一致性检查

**context_block**（executor 必读）：
- **What**: 在 `.github/workflows/code-quality.yml` 中新增 2 个 job：`lint-hardcoded-paths`（运行 lint 脚本检测硬编码路径违规）和 `render-layout-consistency`（运行 render-layout 并用 git diff 检查生成物与提交一致）
- **Why**: 将 lint 和 render-layout 一致性检查集成到 CI 流水线，所有未来 PR 都将自动经过这两项检查，防止不合规代码合入 main
- **Refs**: DD-5（CI 集成设计，design_delta.md DD-5 段）
- **Constraints**:
  - 现有 CI 使用 `ubuntu-latest` + `bun latest`，新增 job 保持一致
  - 两个新 job **相互独立**，可与现有 job 并行运行，不需要 `needs:` 依赖
  - lint 脚本已有 exit 0/1 语义，无需包装
  - `git diff --exit-code` 在有差异时返回 1，自动标记 CI 失败
  - DD-3（TASK-3）已移除时间戳，render-layout 输出完全幂等
  - 检查的 3 个文件是 render-layout 的所有输出目标：`docs/conventions/directory-layout.md`（直接写入）、`README.md`（marker 更新）、`AGENTS.md`（marker 更新）
  - 不引入新依赖
- **Done When**:
  - code-quality.yml 包含 2 个新 job
  - YAML 语法正确（缩进、键名无误）
  - 每个 job 的 steps 包含：检出代码 → 安装 Bun → 安装依赖 → 运行检查

**具体修改**：

1. **修改 `.github/workflows/code-quality.yml`**：在最后一个 job（`test`，约 line 81 结束）之后追加 2 个 job：

   Job 1 — `lint-hardcoded-paths`：
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

   Job 2 — `render-layout-consistency`：
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

- **依赖**: [TASK-1, TASK-2, TASK-3]
- refs: [DD-5, C5]
- files: [.github/workflows/code-quality.yml]
- **verification_commands**:
  1. 搜索确认 `lint-hardcoded-paths` job 存在：在 `.github/workflows/code-quality.yml` 中搜索 `lint-hardcoded-paths` — 预期：至少 1 处匹配
  2. 搜索确认 `render-layout-consistency` job 存在：搜索 `render-layout-consistency` — 预期：至少 1 处匹配
  3. 本地模拟 CI lint 检查：`bun run scripts/lint/check-hardcoded-paths.ts` — 预期：exit 0
  4. 本地模拟 CI 一致性检查：`bun run scripts/render-layout.ts` 后 `git diff --exit-code -- README.md AGENTS.md docs/conventions/directory-layout.md` — 预期：exit 0

---

## 总体验证命令（全部 task 完成后）

以下命令应在全部 5 个 task 完成后依次运行，确认整体集成无问题：

```powershell
# 1. lint 单元测试
bun test scripts/lint/__tests__/check-hardcoded-paths.test.ts
# 预期：6 pass / 0 fail

# 2. lint 实跑无违规
bun run scripts/lint/check-hardcoded-paths.ts
# 预期：exit 0

# 3. 故意触发违规（验证 lint 能检测带 subpath 的违规）
# （手动测试：在 .tmp/ 下创建含 'specforge/runtime/foo.json' 的文件后运行 lint，预期 exit 1）

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

## Out of Scope

以下内容**不在本次任务范围内**：

1. P3 已修复的 R1~R7 修复点（intake 硬规则）
2. 业务逻辑代码（`packages/**` 下所有代码）
3. `scripts/lib/` 到 `directory-layout.ts` 常量的迁移（白名单过渡，留给后续 WI）
4. `directory-layout.ts` 常量修改（上游 Schema 不变）
5. `superpowers-verification-before-completion` Skill 修改（与 C4 互补，不需要联动）
6. `docs/conventions/directory-layout.md` 手动编辑（由 render-layout 自动生成）
7. CHANGELOG 标记"Directory Layout v1.0 Locked"（在全部验证通过后执行）
