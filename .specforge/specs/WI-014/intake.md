# WI-014 Intake — Lint 防线加固 + Verifier 制度建设（P4）

## 变更类型

change_request（防线工程，不修业务代码）

## 业务背景

P3 阶段已完成 specforge → .specforge 迁移的所有残余修复，仓库当前无 `specforge/`、无 `.specforge-/` 残留。
但 P3 过程中暴露了 lint 工具的盲区：部分应该被 lint 提前发现的问题未能被检测到。
本次 P4 的目标是**加固 lint 防线 + 建立 verifier 端到端制度**，防止未来同类问题再次漏出。

## 变更范围（5 个修改项）

### C1：修复 lint 正则（带 subpath 命中）
- **文件**：`scripts/lint/check-hardcoded-paths.ts`
- **当前问题**：line 117 的正则 `/['"]specforge\/['"]/g` 只匹配 `'specforge/'` 严格紧跟引号，无法命中带 subpath 的字面量如 `'specforge/config'`、`"specforge/runtime/state.json"`
- **目标**：泛化正则，支持带 subpath 的路径命中
- **同步**：模式 1（`.specforge`）也需要泛化
- **测试**：新增 ≥5 个单元测试用例

### C2：lint 扩展扫描到 `.md`
- **文件**：`scripts/lint/check-hardcoded-paths.ts`
- **当前问题**：line 161 只扫描 `.ts` 文件，忽略 `.md` 文件中的硬编码路径
- **目标**：扩展扫描到 `.md` 文件，同时配置白名单避免误报
- **白名单更新**：`.lintrc-layout.json` 新增 `.md` 相关白名单条目
- **同步**：`shouldSkipLine()` 需处理 Markdown 注释和代码块

### C3：README/AGENTS.md 加 directory-layout 注入 marker
- **文件**：`README.md`、`AGENTS.md`
- **当前问题**：这两个文件缺少 `<!-- BEGIN: directory-layout -->` / `<!-- END: directory-layout -->` marker，`render-layout.ts` 无法注入内容
- **目标**：插入 marker 对，运行 `render-layout.ts` 生成内容

### C4：sf-verifier 端到端 fs 冒烟检查模板化
- **文件**：`setup/userlevel-opencode/agents/sf-verifier.md`
- **目标**：在 refactor / change_request 工作流的验证流程中，加一节强制"端到端文件系统冒烟"要求
- **同步**：检查 `superpowers-verification-before-completion` Skill 联动

### C5：CI 加入 lint + render-layout 一致性检查
- **文件**：`.github/workflows/code-quality.yml`
- **目标**：在 PR check 中加 2 个 job（lint hardcoded paths + render-layout consistency）

## 硬规则

1. 不要碰 P3 已修复的 R1~R7 修复点
2. 白名单变更必须有 design.md 论证
3. C1 正则改完必须先跑测试再跑全仓 lint
4. C4 改 sf-verifier.md 时同步提示用户跑 installer
5. 完成后才能在 CHANGELOG 标 "Directory Layout v1.0 Locked"

## 受影响功能模块

- `scripts/lint/check-hardcoded-paths.ts`（核心 lint 工具）
- `.lintrc-layout.json`（白名单配置）
- `scripts/render-layout.ts`（可能需要检查 marker 注入逻辑）
- `README.md`、`AGENTS.md`（添加 marker）
- `setup/userlevel-opencode/agents/sf-verifier.md`（verifier 行为模板）
- `.github/workflows/code-quality.yml`（CI 配置）

## 期望变更结果

1. lint 能检测到带 subpath 的 specforge 路径违规
2. lint 扫描覆盖 .md 文件
3. README.md 和 AGENTS.md 包含自动生成的目录布局
4. sf-verifier 有端到端文件系统冒烟检查的强制流程
5. CI 自动运行 lint 和 render-layout 一致性检查
