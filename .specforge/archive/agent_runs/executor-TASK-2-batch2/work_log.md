# WI-011 TASK-2 Batch 2 — Remaining 5 Files

## 执行摘要
完成 `packages/daemon-core/src/tools/lib/` 下最后 5 个文件的硬编码路径替换。

## 修改的文件

### 1. sf_knowledge_graph_core.ts
- 3 处模板字符串 `.specforge/specs/${workItemId}/...` → `${SPEC_DIR_NAME}/specs/${workItemId}/...`
- import 已存在，无需添加

### 2. sf_knowledge_base_core.ts
- 添加 import: `SPEC_DIR_NAME, resolveProjectPath`
- 1 处: `join(baseDir, "specforge", "config", "project.json")` → `join(baseDir, SPEC_DIR_NAME, "config", "project.json")`
- 保留 `getGlobalStoreDir()` 中 `.config/opencode/specforge/knowledge`（opencode 配置路径，非 .specforge 目录）

### 3. utils.ts
- 添加 import: `SPEC_DIR_NAME, resolveProjectPath`
- 4 处替换:
  - `"specforge/logs/error.log"` → `` `${SPEC_DIR_NAME}/logs/error.log` ``
  - `join(baseDir, "specforge", "logs")` → `resolveProjectPath(baseDir, 'logs')`
  - `join(baseDir, "specforge", "runtime", "events.jsonl")` → `resolveProjectPath(baseDir, 'runtime', 'events.jsonl')`
  - `join(baseDir, "specforge", "logs", "error.log")` → `join(resolveProjectPath(baseDir, 'logs'), 'error.log')`

### 4. sf_safe_bash_core.ts
- 添加 import: `SPEC_USER_DIR_NAME, USER_LAYOUT, resolveUserPath`
- 3 处替换:
  - `path.join(os.homedir(), ".specforge", "host-profile.json")` → `resolveUserPath('hostProfile')`
  - `path.join(os.homedir(), ".specforge")` → `path.join(os.homedir(), SPEC_USER_DIR_NAME)`
  - `path.join(os.homedir(), ".specforge", "logs")` → `resolveUserPath('logs')`

### 5. sf_cost_report_core.ts
- 添加 import: `resolveProjectPath`
- 2 处替换:
  - `join(baseDir, "specforge", "logs", "cost.jsonl")` → `resolveProjectPath(baseDir, 'logsCost')`
  - `join(baseDir, "specforge", "runtime", "events.jsonl")` → `resolveProjectPath(baseDir, 'runtime', 'events.jsonl')`

## 验证结果
```
bun test packages/daemon-core/  → exitCode: 0, all tests pass
```

## 残留硬编码扫描
`grep "specforge" | "specforge"` 在 tools/lib/ 下仅剩:
- sf_knowledge_base_core.ts L145: `.config/opencode/specforge/knowledge` — opencode 配置目录名，非 SpecForge 项目目录，无需替换
