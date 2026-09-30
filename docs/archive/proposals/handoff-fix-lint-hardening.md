# Handoff — P4 修复：Lint 防线加固 + Verifier 制度建设

> **本文件用法**：在 OpenCode 新会话中（与 P3 隔离），把本文件全文给 sf-orchestrator，
> 或者直接说："请阅读 `docs/proposals/handoff-fix-lint-hardening.md` 并执行"
>
> **前置条件**：P3（`handoff-fix-residuals-p3.md`）已全部 pass，仓库无 `specforge/`、
> 无 `.specforge-/` 残留，doctor 报 healthy。
> 如果 P3 未完成，**停止执行**，告诉用户："P4 前置条件未满足，请先跑 P3"。

---

## 1. 你的角色

你是 **sf-orchestrator**，本次任务是按 **change_request 工作流** 驱动 1 个 WI 完成
"lint 工具加固 + verifier 端到端制度建设"。

**Gate 模式**：`change_request`（需求/设计/任务/验证四个 Gate 全开）

---

## 2. 创建 WI 与 intake

1. 走 sf-orchestrator 正常启动流程
2. 创建 WI（workflow_type=`change_request`）
3. intake 阶段：把本文件 §3 的修改清单作为 scope 写入 intake.md
4. 强调本次是"防线工程"，不是修业务 bug；目标是把 P3 没漏出来但**应该被 lint 提前发现的盲区**关掉

---

## 3. 修改清单

### 修改项 C1：修复 lint 正则（带 subpath 命中）
- **文件**：`scripts/lint/check-hardcoded-paths.ts`
- **当前**（line 117）：
  ```ts
  regex: /['"]specforge\/['"]/g,    // 只匹配 'specforge/' 严格紧跟引号
  ```
- **目标**：能命中 `'specforge/config'`、`"specforge/runtime/state.json"` 这类带 subpath 的字面量
  ```ts
  regex: /['"]specforge\/[^'"]*['"]/g,
  ```
- **同步**：把模式 1 也同样泛化
  ```ts
  // 当前：/['"]\.specforge[/'"\\]/g
  // 目标：/['"]\.specforge[/'"\\][^'"]*['"]/g   (注：第二个引号必须配对)
  ```
  > 注意：模式 1 在用 `SPEC_DIR_NAME` 替换后**不应该再有命中**；这个泛化主要是为了未来抓
  > 任何遗漏。请配置好测试用例后再调整。
- **测试**：扩展 `tests/lint/` 或 `scripts/lint/__tests__/` 加单元测试，覆盖：
  - `'specforge/'` (空 subpath) → 命中
  - `'specforge/config'` (单段 subpath) → 命中
  - `'specforge/runtime/state.json'` (多段 subpath) → 命中
  - `'@specforge/types'` (npm scope) → **不**命中
  - `'@specforge/observability'` (npm scope 含 / ) → **不**命中
  - 注释行 `// some specforge/foo` → **不**命中

### 修改项 C2：lint 扩展扫描到 `.md`
- **文件**：`scripts/lint/check-hardcoded-paths.ts`
- **当前**（line 161）：
  ```ts
  } else if (entry.isFile() && entry.name.endsWith('.ts')) {
  ```
- **目标**：把 `.md` 也加进去，但**注意白名单**——许多 docs/audit/、.specforge/specs/ 下的
  历史报告里会引用老路径作为"问题记录"，必须白名单
  ```ts
  } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.md'))) {
  ```
- **白名单更新**：编辑 `.lintrc-layout.json`，新增以下 .md 白名单条目
  ```json
  "whitelist": [
    // ... 现有项
    "docs/audit/**",                     // 验收 / 审计报告允许引用老路径作为问题描述
    "docs/proposals/**",                 // 提案文档允许引用老路径
    ".specforge/specs/**/*.md",          // 历史 spec 报告允许引用
    "docs/conventions/**",               // 约定文档由 render-layout 生成，本身有 marker
    "docs/adr/**",                       // ADR 已在白名单
    "README.md",                         // 顶部入口文档可保留示例引用
    "AGENTS.md",
    "**/CHANGELOG.md"
  ]
  ```
- **同步处理**：扩展 `shouldSkipLine()` 处理 Markdown 注释（`<!-- ... -->`）和代码块边界
- **测试**：跑 `bun run scripts/lint/check-hardcoded-paths.ts` 应仍报 0 violations（前提 P3 已修干净）
  - 如果意外报出违规，**先停**，列出每条评估是否真违规还是白名单遗漏

### 修改项 C3：README/AGENTS.md 加 directory-layout 注入 marker
- **文件**：`README.md`（推荐在"文档导航"章节后）和 `AGENTS.md`（推荐在文件末尾或"目录结构"章节）
- **目标**：在合适位置插入一对 marker，让 `scripts/render-layout.ts` 能写入
  ```markdown
  <!-- BEGIN: directory-layout -->
  <!-- 此区域由 scripts/render-layout.ts 自动生成，请勿手动编辑 -->
  <!-- 内容会在 CI 中校验，编辑请改 packages/types/src/directory-layout.ts -->
  <!-- END: directory-layout -->
  ```
- **同步处理**：
  1. 跑 `bun run scripts/render-layout.ts`，让其把当前 LAYOUT 渲染进 marker 之间
  2. 检查 `render-layout.ts` 本身是否已经实现 marker 注入逻辑——若没有，本次需要补完
  3. 把"render-layout 输出与现状一致"作为一个 CI 验证步骤（见 C5）

### 修改项 C4：sf-verifier 端到端 fs 冒烟检查模板化
- **文件**：`setup/userlevel-opencode/agents/sf-verifier.md`（或 verification 阶段相关 SKILL）
- **目标**：在 refactor / change_request 工作流的验证流程中，加一节强制要求
  ```markdown
  ## 端到端文件系统冒烟（强制）
  
  当本次修改涉及任何路径常量、目录布局、文件 IO 时，必须按以下步骤生成证据：
  
  1. **基线快照**：在修改前列出关键目录树
     ```powershell
     Get-ChildItem .specforge -Recurse -Directory | Select-Object FullName,LastWriteTime > .tmp/fs-before.txt
     ```
  2. **执行后冒烟**：停 daemon、清残留、重启、等 60s、再列目录
     ```powershell
     Stop-Process -Name bun -Force -ErrorAction SilentlyContinue
     # 删除待清理目录...
     # 重启 daemon by opencode
     Start-Sleep -Seconds 60
     Get-ChildItem .specforge -Recurse -Directory > .tmp/fs-after.txt
     ```
  3. **关键不变性断言**：
     - `Test-Path specforge` = False
     - `Test-Path .specforge-` = False（除非任务声明保留备份）
     - `.specforge/observability/events.jsonl` 的 mtime > daemon 重启时间
       （证明事件正确落到带点路径）
  4. **证据归档**：把 fs-before.txt / fs-after.txt 复制到 verification_report 同目录
  
  ⚠️ 不允许把"代码层 grep 无残留"等价于"运行期无残留"。
  ```
- **同步**：检查 `superpowers-verification-before-completion` Skill 是否需要联动更新

### 修改项 C5：CI 加入 lint + render-layout 一致性检查（如果有 CI 配置）
- **文件**：`.github/workflows/*.yml` 或同等 CI 配置
- **目标**：在 PR check 中加 2 个 job
  ```yaml
  - name: Lint hardcoded paths
    run: bun run scripts/lint/check-hardcoded-paths.ts
  
  - name: Render-layout consistency
    run: |
      bun run scripts/render-layout.ts
      git diff --exit-code -- README.md AGENTS.md docs/conventions/directory-layout.md
      # exit 1 if generator output differs from committed content
  ```
- **如果**仓库没有 CI 配置：在 `docs/conventions/README.md` 中加一节
  "本地预提交检查清单"，把这两条命令列出来，并建议加入 git pre-commit hook

---

## 4. 任务拆分建议

```
Task 1: C1 + lint 单元测试         ─┐ 并行
Task 2: C2 + 白名单更新            ─┤
Task 3: C3 + render-layout 集成    ─┘
       ↓
Task 4: C4 verifier 模板更新（独立，不影响代码）
       ↓
Task 5: C5 CI 集成（如适用）
```

---

## 5. Gate 通过标准

### Requirements Gate
- intake 中明确"本次是防线工程，不修业务代码"
- 列明 5 个修改项的 scope 边界

### Design Gate
- design.md 必须包含：
  - C1 正则的 5 个测试用例预期结果
  - C2 .md 白名单的判定依据
  - C3 marker 注入的目标章节锚点
  - C4 fs 冒烟流程的伪代码

### Tasks Gate
- 任务必须可独立验证；Task 4（C4）必须单独成 task 因为它改的是 Agent 行为而非代码

### Verification Gate（必须全 pass）
```powershell
# 1. lint 单元测试通过
bun test scripts/lint/                  # 期望: ≥6 pass / 0 fail（含 5 个新增 case）

# 2. lint 实跑无违规
bun run scripts/lint/check-hardcoded-paths.ts   # exit 0

# 3. 故意触发：在 .tmp/ 加一个带 subpath 的违规 .md
"some text with 'specforge/runtime/foo.json'" > .tmp/bad-trigger.md
bun run scripts/lint/check-hardcoded-paths.ts   # 必须 exit 1
Remove-Item .tmp/bad-trigger.md

# 4. render-layout 输出与现状一致
bun run scripts/render-layout.ts
git diff --exit-code -- README.md AGENTS.md docs/conventions/directory-layout.md
                                        # exit 0（无差异，证明生成器是 idempotent）

# 5. 架构测试不退步
bun test tests/architecture/            # 期望: 同 P3 完成后的 baseline

# 6. sf-verifier 模板包含端到端冒烟章节
Select-String -Path setup/userlevel-opencode/agents/sf-verifier.md -Pattern "端到端文件系统冒烟"
                                        # 必须有匹配
```

---

## 6. 硬规则

1. ⚠️ **不要去碰已修复的 P3 修复点**——如果发现 R1~R7 有遗漏，记录到 work_log 的 follow-up，**不要**当场修
2. ⚠️ **白名单变更最敏感**——`.lintrc-layout.json` 的每一条新增必须有 design.md 中的论证
3. ⚠️ **C1 正则改完必须先跑测试再跑全仓 lint**——如果泛化后命中爆炸（例如把 `'@specforge/types'`
   误命中），说明 `shouldSkipLine` 的 npm scope 排除逻辑也要加固
4. ⚠️ **C4 改 sf-verifier.md 时同步检查用户级副本**——`~/.config/opencode/agents/sf-verifier.md`
   是 installer 同步的，提示用户改完后跑 `bun scripts/sf-installer.ts install`
5. ⚠️ **完成后才能在 CHANGELOG 标 "Directory Layout v1.0 Locked"**

---

## 7. 完成后告诉用户

```
WI-{NN}（change_request, P4）已完成。

修改项闭环：
- C1 lint 正则泛化 + 5 个测试用例   [pass / fail]
- C2 .md 扫描 + 白名单              [pass / fail]
- C3 README/AGENTS marker + render  [pass / fail]
- C4 sf-verifier 端到端冒烟模板     [pass / fail]
- C5 CI 集成（如适用）              [pass / fail / n/a]

防线验证：
- 故意触发带 subpath 违规 → lint exit 1 ✓ / ✗
- render-layout idempotent ✓ / ✗
- 全 lint exit 0 ✓ / ✗

里程碑：
- 全部 pass → 可在 CHANGELOG 标 "Directory Layout v1.0 Locked"
- 可启动方案 B（Engineering Playbook 框架）
```
