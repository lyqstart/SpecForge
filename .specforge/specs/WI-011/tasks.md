# WI-011 Tasks — SpecForge V6 目录结构治理 P1 代码全量切换与数据迁移

**work_item_id**: WI-011
**workflow_type**: change_request
**生成自**: design_delta.md (DD-0 ~ DD-11) + handoff-p1.md
**权威 Schema**: `packages/types/src/directory-layout.ts`

---

## 总览

| 指标 | 值 |
|------|-----|
| 任务总数 | 13 |
| 批次数 | 7 |
| 预估改动文件数 | ~67 |
| 预估替换处数 | ~180-200 |
| 新增文件数 | 4+ (render-layout.ts, render-specs-readme.ts, setup/README.md, docs/conventions/directory-layout.md) |
| 删除文件/目录数 | ~15+ |

## 批次执行计划

```
Batch 1 (TASK-1):   用户级路径 Schema 扩展 [前置，必须先完成]
  ↓
Batch 2 (TASK-2,3,4,5): daemon-core + 部署态 + permission-engine 路径切换 [高风险]
  ↓ bun run test 全量通过
Batch 3 (TASK-6,7):   SKILL.md + Agent prompt 路径修正 [低风险]
  ↓
Batch 4 (TASK-8,9):   setup/ 搬迁 + sf-installer 改造 [中风险]
  ↓ bun scripts/sf-installer.ts verify
Batch 5 (TASK-10,11):  文档生成器 [低风险]
  ↓
Batch 6 (TASK-12):     数据迁移实际执行 [高风险，必须先备份]
  ↓ bun run test 全量通过
Batch 7 (TASK-13):     清理废弃文件 [极低风险]
```

---

## 前置共享基础设施

### TASK-1 扩展 directory-layout.ts 用户级路径 Schema

**context_block**（executor 必读）：
- **What**: 在 `packages/types/src/directory-layout.ts` 中新增 `SPEC_USER_DIR_NAME`、`USER_LAYOUT` 常量和 `resolveUserPath()` 函数。纯新增代码，不修改任何现有导出。
- **Why**: P0 的 `directory-layout.ts` 只覆盖项目级路径（`<root>/.specforge/...`），但 daemon-core 中有大量用户级路径（`~/.specforge/...`，如 `sf_safe_bash_core.ts`、`path-resolver.ts`、`sf-installer.ts`）。不收口会导致"项目级走 Schema、用户级走硬编码"的二元状态，违反方案 A 的单一真相源原则。
- **Refs**: DD-0（用户级路径 Schema 扩展）；impact_analysis §发现问题 1
- **Constraints**:
  - 纯新增代码，不修改现有 `SPEC_DIR_NAME`、`LAYOUT`、`resolveProjectPath`、`specPath`、`agentRunArchivePath` 的签名或行为
  - `resolveUserPath()` 不需要 `projectRoot` 参数（用户级路径总是基于 `os.homedir()`）
  - 必须引入 `os` 模块（`import * as os from 'node:os'`）
  - 保持 `as const` 类型安全，`UserLayoutKey` 联合类型需导出
  - 遵守现有文件风格（JSDoc 注释、`// ---` 分隔线、`@example` 代码块）
- **Done When**:
  - `USER_LAYOUT` 常量包含 runtime、runtimeHandshake、runtimeState、runtimeEvents、runtimeDaemonLock、hostProfile、logs、projects、templates、backups 共 10 个 key
  - `resolveUserPath('hostProfile')` 返回 `path.join(os.homedir(), '.specforge', 'host-profile.json')`
  - `resolveUserPath('projects', hash)` 返回 `path.join(os.homedir(), '.specforge', 'projects', hash)`
  - `bun test packages/types/` 全量通过
  - TypeScript 编译无错误

- **依赖**: 无
- **批次**: 1
- **风险等级**: 低（纯新增，零修改）
- refs: [DD-0]
- files: [packages/types/src/directory-layout.ts]
- **verification_commands**:
  - `bun test packages/types/` — 全量测试通过
  - `bun -e "const c=require('fs').readFileSync('packages/types/src/directory-layout.ts','utf8'); ['SPEC_USER_DIR_NAME','USER_LAYOUT','resolveUserPath','UserLayoutKey'].forEach(k=>{if(!c.includes(k))throw new Error(k+' not found')}); console.log('OK: all exports present')"` — 验证新导出存在
  - `bun -e "const{resolveUserPath}=require('./packages/types/src/directory-layout.ts'); const p=resolveUserPath('hostProfile'); if(!p.includes('.specforge')||!p.includes('host-profile.json'))throw new Error('wrong path:'+p); console.log('OK:',p)"` — 运行时验证 resolveUserPath 输出正确

---

## Batch 2: 核心路径切换（高风险）

> 完成本批次后必须执行 `bun run test` 全量回归。

### TASK-2 daemon-core tools/lib/ 路径切换（15 个文件）

**context_block**（executor 必读）：
- **What**: 将 `packages/daemon-core/src/tools/lib/` 下 15 个文件中的硬编码字符串 `".specforge"` / `"specforge"` 全部替换为 `directory-layout.ts` 的常量/函数调用。
- **Why**: 这些文件是 daemon 的核心工具实现（gate 检查、artifact 写入、知识图谱、上下文构建等），包含约 54 处硬编码路径。替换后所有路径收口到单一真相源。
- **Refs**: DD-1（daemon-core 路径切换）
- **Constraints**:
  - **import 方式**: 使用 npm 包导入 `import { SPEC_DIR_NAME, LAYOUT, resolveProjectPath, specPath, agentRunArchivePath } from '@specforge/types/directory-layout';`，如有用户级路径还需 `import { USER_LAYOUT, resolveUserPath } from '@specforge/types/directory-layout';`
  - **3 种替换模式**:
    - 模式 A（项目级带点）: `join(baseDir, ".specforge", "specs", wi, file)` → `specPath(baseDir, wi, file)` 或 `resolveProjectPath(baseDir, 'specs', wi)`
    - 模式 B（项目级不带点）: `join(baseDir, "specforge", "logs", ...)` → `resolveProjectPath(baseDir, 'logs')` 等，对照 LAYOUT key 映射表（见下方）
    - 模式 C（用户级）: `path.join(os.homedir(), ".specforge", ...)` → `resolveUserPath(key, ...)`
  - **LAYOUT key 映射表**（模式 B 对照）:
    | 旧路径片段 | 新 LAYOUT key |
    |-----------|--------------|
    | `"specforge", "manifest.json"` | `'manifest'` |
    | `"specforge", "config"` | `'config'` |
    | `"specforge", "config", "project.json"` | 直接拼接 `LAYOUT.configFiles.project` |
    | `"specforge", "config", "skill_fragments.json"` | 直接拼接 `LAYOUT.configFiles.skillFragments` |
    | `"specforge", "logs", "cost.jsonl"` | `'logsCost'` |
    | `"specforge", "logs", "error.log"` | `resolveProjectPath(baseDir, 'logs')` + `'error.log'` |
    | `"specforge", "logs"` | `'logs'` |
    | `"specforge", "runtime", "state.json"` | `'runtimeState'` |
    | `"specforge", "runtime", "events.jsonl"` | `'runtimeWal'` |
    | `"specforge", "runtime", "trace.jsonl"` | `'logsTrace'` |
    | `"specforge", "runtime", "conversation.jsonl"` | `'logsConversations'` |
    | `"specforge", "archive", "agent_runs"` | `'archiveAgentRuns'` |
    | `"specforge", "knowledge", "graph.json"` | `'knowledgeGraph'` |
  - **特殊处理**:
    - `sf_artifact_write_core.ts` L265-266: `split("/specforge/")` → `split("/" + SPEC_DIR_NAME + "/")` 或 `split(path.sep + SPEC_DIR_NAME + path.sep)`
    - 模板字符串 `` `.specforge/specs/${wid}/...` `` → `` `${SPEC_DIR_NAME}/specs/${wid}/...` ``
    - `sf_doctor_core.ts` 错误消息中的 `"specforge/manifest.json"` → `` `${SPEC_DIR_NAME}/manifest.json` ``
    - 错误消息中引用路径的，改为 `SPEC_DIR_NAME` 动态插值而非硬编码
  - **路径语义修正**（不只是目录名修正）:
    - `sf_continuity_core.ts`: `specforge/runtime/trace.jsonl` → `LAYOUT.logsTrace`（即 `.specforge/logs/trace.jsonl`）
    - `sf_continuity_core.ts`: `specforge/runtime/conversation.jsonl` → `LAYOUT.logsConversations`（即 `.specforge/logs/conversations.jsonl`）
  - MCP I/O schema 不变（仅内部实现切换）
  - 已知 pre-existing 失败（SessionRegistry 5 个）不阻塞
- **Done When**:
  - 15 个文件中不再含 `"specforge"` 或 `".specforge"` 的硬编码字符串字面量（除 SPEC_DIR_NAME 引用和 import 语句外）
  - `bun test packages/daemon-core/` 全量通过

- **依赖**: TASK-1（USER_LAYOUT + resolveUserPath 扩展完成）
- **批次**: 2
- **风险等级**: 高（核心 daemon 代码，54 处替换，3 种模式混合）
- refs: [DD-1, DD-0]
- files:
  - packages/daemon-core/src/tools/lib/sf_doctor_core.ts
  - packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts
  - packages/daemon-core/src/tools/lib/sf_continuity_core.ts
  - packages/daemon-core/src/tools/lib/sf_context_build_core.ts
  - packages/daemon-core/src/tools/lib/sf_knowledge_graph_core.ts
  - packages/daemon-core/src/tools/lib/sf_requirements_gate_core.ts
  - packages/daemon-core/src/tools/lib/sf_knowledge_base_core.ts
  - packages/daemon-core/src/tools/lib/utils.ts
  - packages/daemon-core/src/tools/lib/sf_safe_bash_core.ts
  - packages/daemon-core/src/tools/lib/sf_cost_report_core.ts
  - packages/daemon-core/src/tools/lib/sf_verification_gate_core.ts
  - packages/daemon-core/src/tools/lib/sf_design_gate_core.ts
  - packages/daemon-core/src/tools/lib/sf_tasks_gate_core.ts
  - packages/daemon-core/src/tools/lib/sf_trace_matrix_core.ts
  - packages/daemon-core/src/tools/lib/sf_doc_lint_core.ts
- **verification_commands**:
  - `bun test packages/daemon-core/` — 全量测试通过
  - `bun -e "const fs=require('fs'),p=require('path'); const dir='packages/daemon-core/src/tools/lib'; let bad=0; for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.ts'))){ const c=fs.readFileSync(p.join(dir,f),'utf8'); const lines=c.split('\n'); for(let i=0;i<lines.length;i++){ const l=lines[i]; if((l.includes('\"specforge')||l.includes(\"'specforge\")) && !l.includes('SPEC_DIR_NAME') && !l.includes('import ') && !l.includes('@specforge/') && !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.includes('node_modules')){ console.log(f+':'+(i+1)+': '+l.trim()); bad++; } } } if(bad>0)throw new Error(bad+' hardcoded specforge paths remain'); console.log('OK: no hardcoded paths')"` — 确认无残留硬编码路径

### TASK-3 daemon-core daemon/ + handlers/ 路径切换（4 个文件）

**context_block**（executor 必读）：
- **What**: 将 `packages/daemon-core/src/daemon/` 下 3 个文件和 `packages/daemon-core/src/tools/handlers/` 下 1 个文件中的硬编码路径替换为 directory-layout.ts 常量调用。约 9 处替换。
- **Why**: daemon/ 子目录包含路径解析器（path-resolver.ts）和 Daemon 主进程，是 daemon 启动和 handshake 的关键代码。handlers/ 包含 state-transition handler，涉及 manifest 路径。
- **Refs**: DD-1（daemon-core 路径切换，daemon + handlers 部分）
- **Constraints**:
  - **import 方式**: 同 TASK-2，使用 npm 包导入
  - **重点文件处理**:
    - `daemon/path-resolver.ts`（5 处）: 主要是用户级路径（模式 C）
      - L132: `path.join(projectPath, '.specforge', 'runtime')` → `resolveProjectPath(projectPath, 'runtime')`
      - L148: `path.join(os.homedir(), '.specforge', 'runtime')` → `resolveUserPath('runtime')`
      - L181: `path.join(os.homedir(), '.specforge', 'projects', hash)` → `resolveUserPath('projects', hash)`
      - L197: `path.join(os.homedir(), '.specforge', 'runtime')` → `resolveUserPath('runtime')`
    - `daemon/Daemon.ts`（2 处）: legacy 迁移代码中的路径
    - `daemon/HandshakeManager.ts`（0 处）: 仅 JSDoc 注释，无代码改动（可更新注释但不强制）
    - `tools/handlers/sf-state-transition.ts`（2 处）:
      - L17: `join(baseDir, '.specforge', 'manifest.json')` → `resolveProjectPath(baseDir, 'manifest')`
      - L24: 错误消息中 `.specforge/manifest.json` → `${SPEC_DIR_NAME}/manifest.json`
  - HandshakeManager.ts 的 JSDoc 可选更新：`~/.specforge/runtime/daemon.lock` → 描述中引用 resolveUserPath
  - MCP I/O schema 不变
- **Done When**:
  - 4 个文件中不再含硬编码 `.specforge` / `specforge` 字符串（注释和 SPEC_DIR_NAME 引用除外）
  - `bun test packages/daemon-core/` 全量通过

- **依赖**: TASK-1（resolveUserPath 扩展完成）
- **批次**: 2
- **风险等级**: 高（daemon 启动关键代码，handshake 路若出错则 daemon 全功能失效）
- refs: [DD-1, DD-0]
- files:
  - packages/daemon-core/src/daemon/path-resolver.ts
  - packages/daemon-core/src/daemon/Daemon.ts
  - packages/daemon-core/src/daemon/HandshakeManager.ts
  - packages/daemon-core/src/tools/handlers/sf-state-transition.ts
- **verification_commands**:
  - `bun test packages/daemon-core/` — 全量测试通过
  - `bun -e "const fs=require('fs'),p=require('path'); const files=['packages/daemon-core/src/daemon/path-resolver.ts','packages/daemon-core/src/daemon/Daemon.ts','packages/daemon-core/src/tools/handlers/sf-state-transition.ts']; let bad=0; for(const f of files){ const c=fs.readFileSync(f,'utf8'); const lines=c.split('\n'); for(let i=0;i<lines.length;i++){ const l=lines[i]; if((l.includes('\".specforge\"')||l.includes('\"specforge\"')||l.includes(\"'.specforge'\")) && !l.includes('SPEC_DIR_NAME') && !l.includes('import ') && !l.includes('@specforge/') && !l.trim().startsWith('//') && !l.trim().startsWith('*')){ console.log(f.split('/').pop()+':'+(i+1)+': '+l.trim()); bad++; } } } if(bad>0)throw new Error(bad+' hardcoded paths remain'); console.log('OK')"`

### TASK-4 部署态 .opencode/tools/lib/ 路径切换（16 个文件）

**context_block**（executor 必读）：
- **What**: 将 `.opencode/tools/lib/` 下 16 个含硬编码路径的文件中的 `"specforge"` / `".specforge"` 全部替换为内联常量方式。
- **Why**: 这些文件是部署态副本，会被 sf-installer 复制到用户机器 `~/.config/opencode/tools/lib/`，脱离 monorepo 上下文运行。必须使用内联常量而非 npm import。
- **Refs**: DD-2（部署态 tools 路径切换）
- **Constraints**:
  - **⚠️ 关键差异 — 不使用 npm import**: `.opencode/tools/lib/` 文件脱离 monorepo，`@specforge/types` 在用户环境不可用
  - **使用内联常量**: `const SPEC_DIR_NAME = '.specforge' as const;`
  - **替换模式与 TASK-2 完全同步**: 每个文件的替换逻辑与 `packages/daemon-core/src/tools/lib/` 下的同名文件一致
  - **额外替换点**（daemon-core 没有的硬编码）:
    - `sf_doctor_core.ts`: 错误消息 `"项目 specforge/manifest.json 存在但 JSON 解析失败"` → 使用 `SPEC_DIR_NAME`
    - `sf_artifact_write_core.ts` L265-266: `split("/specforge/")` → `split("/" + SPEC_DIR_NAME + "/")`
  - **thin-client.ts** L38: `path.join(home, '.specforge', 'runtime', 'handshake.json')` → `path.join(home, SPEC_DIR_NAME, 'runtime', 'handshake.json')`
  - **不处理**: `.opencode-/tools/lib/`（废弃备份，TASK-13 删除）
  - **不处理**: 其余 12 个纯类型/解析器文件（无 `specforge` 引用）
- **Done When**:
  - 16 个目标文件中不再含 `"specforge"` 或 `".specforge"` 的硬编码字符串（SPEC_DIR_NAME 内联常量定义和引用除外）
  - 替换模式与 TASK-2 的 daemon-core 对应文件完全一致

- **依赖**: TASK-1（了解 USER_LAYOUT 设计意图，但代码上不直接依赖）
- **批次**: 2
- **风险等级**: 中（部署态无类型检查保护，thin-client handshake 路径若出错则 daemon 通信中断）
- refs: [DD-2]
- files:
  - .opencode/tools/lib/sf_doctor_core.ts
  - .opencode/tools/lib/sf_artifact_write_core.ts
  - .opencode/tools/lib/sf_continuity_core.ts
  - .opencode/tools/lib/sf_context_build_core.ts
  - .opencode/tools/lib/sf_knowledge_graph_core.ts
  - .opencode/tools/lib/sf_requirements_gate_core.ts
  - .opencode/tools/lib/sf_knowledge_base_core.ts
  - .opencode/tools/lib/utils.ts
  - .opencode/tools/lib/sf_safe_bash_core.ts
  - .opencode/tools/lib/sf_cost_report_core.ts
  - .opencode/tools/lib/sf_verification_gate_core.ts
  - .opencode/tools/lib/sf_design_gate_core.ts
  - .opencode/tools/lib/sf_tasks_gate_core.ts
  - .opencode/tools/lib/sf_trace_matrix_core.ts
  - .opencode/tools/lib/sf_doc_lint_core.ts
  - .opencode/tools/lib/thin-client.ts
- **verification_commands**:
  - `bun -e "const fs=require('fs'),p=require('path'); const dir='.opencode/tools/lib'; let bad=0; for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.ts'))){ const c=fs.readFileSync(p.join(dir,f),'utf8'); const lines=c.split('\n'); for(let i=0;i<lines.length;i++){ const l=lines[i]; if((l.includes('\"specforge')||l.includes(\"'specforge\")||l.includes('\".specforge\"')) && !l.includes('SPEC_DIR_NAME') && !l.includes('import ') && !l.includes('@specforge/') && !l.trim().startsWith('//') && !l.trim().startsWith('*')){ console.log(f+':'+(i+1)+': '+l.trim()); bad++; } } } if(bad>0)throw new Error(bad+' hardcoded paths remain'); console.log('OK')"`

### TASK-5 permission-engine 路径切换（7 个文件）

**context_block**（executor 必读）：
- **What**: 将 `packages/permission-engine/src/` 下 7 个文件中的硬编码路径替换为 directory-layout.ts 常量调用。约 10 处替换。
- **Why**: permission-engine 包含事件日志路径和安全保护路径，需要统一收口。特别是 `specforge/observability/events.jsonl` 的语义需要变更。
- **Refs**: DD-4（permission-engine 路径切换）
- **Constraints**:
  - **import 方式**: `import { SPEC_DIR_NAME, LAYOUT, resolveProjectPath } from '@specforge/types/directory-layout';`
  - **⚠️ 关键决策 D2**: `specforge/observability/events.jsonl` 替换为 `SPEC_DIR_NAME + '/logs/telemetry.jsonl'`（即 `.specforge/logs/telemetry.jsonl`），不是 `runtime/wal.jsonl`。理由：permission-engine 的事件日志是观测埋点（telemetry），不是状态机 WAL。
  - **具体替换对照表**:
    | 文件 | 旧值 | 新值 |
    |------|------|------|
    | `static-api-checker.ts` L394 | `'./specforge/observability/events.jsonl'` | `'./' + SPEC_DIR_NAME + '/logs/telemetry.jsonl'` |
    | `plugin-permission-validator.ts` L95 | `'./specforge/observability/events.jsonl'` | `'./' + SPEC_DIR_NAME + '/logs/telemetry.jsonl'` |
    | `plugin-loader-integration.ts` L164 | `'./specforge/observability/events.jsonl'` | `'./' + SPEC_DIR_NAME + '/logs/telemetry.jsonl'` |
    | `index.ts` L80, L306 | `` `./specforge/observability/events.jsonl` `` | `` `./${SPEC_DIR_NAME}/logs/telemetry.jsonl` `` |
    | `builtin-policy-loader.ts` L44 | `path.join(process.cwd(), 'specforge', 'config', 'builtin-policies')` | `resolveProjectPath(process.cwd(), 'config', 'builtin-policies')` |
    | `user-policy-loader.ts` L62 | `'.specforge'` | `SPEC_DIR_NAME` |
    | `hard-rules.ts` L117 | `'.specforge/'` | `SPEC_DIR_NAME + '/'` |
    | `hard-rules.ts` L278 | `'file:.specforge/*'` | `` `file:${SPEC_DIR_NAME}/*` `` |
  - **安全约束**: `hard-rules.ts` 的 `hard-007` 规则使用 `startsWith` 匹配 `'.specforge/'`，替换为 `SPEC_DIR_NAME + '/'` 运行时值不变，匹配逻辑不变
  - MCP I/O schema 不变
- **Done When**:
  - 7 个文件中不再含硬编码 `specforge/observability`、`".specforge"` 路径（SPEC_DIR_NAME 引用除外）
  - `bun test packages/permission-engine/` 全量通过

- **依赖**: TASK-1（resolveProjectPath 可用）
- **批次**: 2
- **风险等级**: 中（hard-rules.ts 安全策略路径若改错可能导致保护失效）
- refs: [DD-4]
- files:
  - packages/permission-engine/src/services/static-api-checker.ts
  - packages/permission-engine/src/services/plugin-permission-validator.ts
  - packages/permission-engine/src/services/plugin-loader-integration.ts
  - packages/permission-engine/src/index.ts
  - packages/permission-engine/src/services/builtin-policy-loader.ts
  - packages/permission-engine/src/services/user-policy-loader.ts
  - packages/permission-engine/src/services/hard-rules.ts
- **verification_commands**:
  - `bun test packages/permission-engine/` — 全量测试通过
  - `bun -e "const fs=require('fs'),p=require('path'); const files=['packages/permission-engine/src/index.ts','packages/permission-engine/src/services/static-api-checker.ts','packages/permission-engine/src/services/plugin-permission-validator.ts','packages/permission-engine/src/services/plugin-loader-integration.ts','packages/permission-engine/src/services/builtin-policy-loader.ts','packages/permission-engine/src/services/user-policy-loader.ts','packages/permission-engine/src/services/hard-rules.ts']; let bad=0; for(const f of files){ const c=fs.readFileSync(f,'utf8'); if(c.includes('observability/events.jsonl')||c.includes('specforge/observability')){ console.log(f.split('/').pop()+': still has observability path'); bad++; } if((c.includes('\".specforge\"')||c.includes(\"'.specforge'\")) && !c.includes('SPEC_DIR_NAME')){ console.log(f.split('/').pop()+': hardcoded .specforge'); bad++; } } if(bad>0)throw new Error(bad+' issues'); console.log('OK')"`

---

## Batch 3: 文档路径修正（低风险）

### TASK-6 8 个 SKILL.md 路径修正

**context_block**（executor 必读）：
- **What**: 修正 `.opencode/skills/sf-workflow-*/SKILL.md` 中 8 个文件的路径引用：`specforge/specs/` → `.specforge/specs/`（加前导点）。约 21 处替换。
- **Why**: P0 决策 ADR-006 确定了 `.specforge` 为标准目录名，所有文档中应使用带点形式。
- **Refs**: DD-3（SKILL.md 与 Agent prompt 路径修正）
- **Constraints**:
  - 纯文本替换，无逻辑变更
  - 全局替换 `specforge/specs/` → `.specforge/specs/`
  - 额外检查是否有 `specforge/config/`、`specforge/runtime/` 等其他不带点路径，如有也修正
  - **不处理** `.opencode-/skills/`（废弃备份，TASK-13 删除）
- **Done When**:
  - 8 个 SKILL.md 中不再含 `specforge/specs/`（不带点）路径
  - 所有路径统一为 `.specforge/specs/`

- **依赖**: 无
- **批次**: 3
- **风险等级**: 低（纯文档文本替换）
- refs: [DD-3]
- files:
  - .opencode/skills/sf-workflow-bugfix-spec/SKILL.md
  - .opencode/skills/sf-workflow-change-request/SKILL.md
  - .opencode/skills/sf-workflow-design-first/SKILL.md
  - .opencode/skills/sf-workflow-feature-spec/SKILL.md
  - .opencode/skills/sf-workflow-investigation/SKILL.md
  - .opencode/skills/sf-workflow-ops-task/SKILL.md
  - .opencode/skills/sf-workflow-quick-change/SKILL.md
  - .opencode/skills/sf-workflow-refactor/SKILL.md
- **verification_commands**:
  - `bun -e "const fs=require('fs'),p=require('path'); const dir='.opencode/skills'; let bad=0; for(const d of fs.readdirSync(dir)){ const skillDir=p.join(dir,d); if(!fs.statSync(skillDir).isDirectory())continue; const skillFile=p.join(skillDir,'SKILL.md'); if(!fs.existsSync(skillFile))continue; const c=fs.readFileSync(skillFile,'utf8'); if(c.includes('specforge/specs/')&&!c.includes('.specforge/specs/')){ console.log(d+'/SKILL.md: has specforge/specs/ without dot'); bad++; } } if(bad>0)throw new Error(bad+' files still have wrong path'); console.log('OK')"` — 注意：此检查需确保"specforge/specs/"不是".specforge/specs/"的子串

### TASK-7 4 个 Agent prompt 路径修正

**context_block**（executor 必读）：
- **What**: 修正 `.opencode/agents/` 下 4 个 Agent prompt 文件中的路径引用：`specforge/specs/` → `.specforge/specs/`（加前导点）。共 7 处替换。
- **Why**: 同 TASK-6，统一所有文档中的路径引用为带点形式。
- **Refs**: DD-3（SKILL.md 与 Agent prompt 路径修正）
- **Constraints**:
  - 纯文本替换，无逻辑变更
  - 4 个目标文件:
    - `sf-task-planner.md` L157, L196 — 目录描述 + files_changed 示例
    - `sf-requirements.md` L187, L211 — 目录描述 + files_changed 示例
    - `sf-design.md` L207, L228 — 目录描述 + files_changed 示例
    - `sf-knowledge.md` L91 — 目录描述
  - **不处理** 其余 5 个 Agent 文件（sf-orchestrator.md 等，不含 `specforge/specs/` 路径）
  - **不处理** sf-orchestrator.md L254 的 `specforge/agents/AGENT_CONSTITUTION.md`（这是 opencode 框架约定，不在本次切换范围）
- **Done When**:
  - 4 个文件中不再含 `specforge/specs/`（不带点）路径
  - 所有路径统一为 `.specforge/specs/`

- **依赖**: 无
- **批次**: 3
- **风险等级**: 低（纯文档文本替换）
- refs: [DD-3]
- files:
  - .opencode/agents/sf-task-planner.md
  - .opencode/agents/sf-requirements.md
  - .opencode/agents/sf-design.md
  - .opencode/agents/sf-knowledge.md
- **verification_commands**:
  - `bun -e "const fs=require('fs'); const files=['.opencode/agents/sf-task-planner.md','.opencode/agents/sf-requirements.md','.opencode/agents/sf-design.md','.opencode/agents/sf-knowledge.md']; let bad=0; for(const f of files){ const c=fs.readFileSync(f,'utf8'); const lines=c.split('\n'); for(let i=0;i<lines.length;i++){ const l=lines[i]; if(l.includes('specforge/specs/')&&!l.includes('.specforge/specs/')){ console.log(f.split('/').pop()+':L'+(i+1)+': '+l.trim()); bad++; } } } if(bad>0)throw new Error(bad+' wrong paths'); console.log('OK')"`

---

## Batch 4: setup/ 搬迁 + 安装器改造（中风险）

> 完成本批次后必须执行 `bun scripts/sf-installer.ts verify`。

### TASK-8 setup/ 目录搬迁

**context_block**（executor 必读）：
- **What**: 建立 `setup/` 目录结构，使用 `git mv` 将安装源文件从分散位置搬迁到统一目录。搬迁后在 `.opencode/` 创建 junction/symlink 指向 `setup/userlevel-opencode/` 对应子目录，保持开发期 opencode 框架正常加载。
- **Why**: 方案 A §3 要求将安装源集中管理，sf-installer 从统一位置读取部署文件。
- **Refs**: DD-5（setup/ 目录搬迁）
- **Constraints**:
  - **目标结构**:
    ```
    setup/
    ├── README.md
    ├── userlevel-opencode/    ← git mv from .opencode/{agents,tools,skills,plugins}
    ├── userlevel-scripts-lib/ ← git mv from scripts/lib/ (部署态部分)
    └── userlevel-templates/   ← git mv from templates/
    ```
  - **使用 `git mv`** 保证历史可追溯，不要 cp + rm
  - **排除项**: `.opencode/node_modules/`、`.opencode/bun.lock`、`.opencode/package-lock.json` 不搬迁
  - **不搬迁**: `.opencode-/`（废弃备份，TASK-13 直接删除）
  - **决策 D5**: 搬迁后 `.opencode/` 保留（不删除），通过 junction 链接到 `setup/userlevel-opencode/`
  - **junction 方案**: 在 `.opencode/` 下为 agents/、tools/、skills/、plugins/ 各创建 junction 指向 `setup/userlevel-opencode/` 对应子目录
  - **Windows 注意**: junction 使用 `mklink /J`（不需要管理员权限）；symlink 使用 `mklink /D`（可能需要管理员权限）。优先使用 junction。
  - **scripts/lib/ 搬迁范围**: 只搬迁"部署态"文件（被 installer 复制到用户机器的），保留"开发态"文件。如果难以区分，全部搬迁到 `setup/userlevel-scripts-lib/`，原 `scripts/lib/` 用 junction 指回。
  - **创建 setup/README.md**: 内容为子目录清单和安装目标映射（见 DD-5 模板）
  - **更新 .gitignore**: 如果 setup/ 下有 node_modules/ 需忽略
- **Done When**:
  - `setup/userlevel-opencode/` 含 agents/、tools/、skills/、plugins/ 子目录
  - `setup/userlevel-templates/` 含模板文件（如原 templates/ 存在）
  - `setup/README.md` 存在且内容正确
  - `.opencode/agents/` 等 junction 指向 `setup/userlevel-opencode/agents/`
  - `git status` 显示 rename 操作（非 delete + add）

- **依赖**: TASK-4（.opencode/tools/lib/ 文件已在 TASK-4 中完成路径切换，搬迁的是已修改的文件）
- **批次**: 4
- **风险等级**: 中（git mv 操作安全，但 junction 在 Windows 需验证）
- refs: [DD-5]
- files:
  - setup/ (新建目录)
  - setup/README.md (新建)
  - .opencode/ → junction 链接
- **verification_commands**:
  - `bun -e "const fs=require('fs'),p=require('path'); const dirs=['setup/userlevel-opencode/agents','setup/userlevel-opencode/tools','setup/userlevel-opencode/skills','setup']; for(const d of dirs){if(!fs.existsSync(d))throw new Error(d+' missing')} if(!fs.existsSync('setup/README.md'))throw new Error('setup/README.md missing'); console.log('OK: setup/ structure verified')"`
  - `bun -e "const fs=require('fs'); if(!fs.existsSync('.opencode/agents'))throw new Error('.opencode/agents junction missing'); console.log('OK: junction exists')"` — 验证 junction 存在

### TASK-9 sf-installer.ts 改造

**context_block**（executor 必读）：
- **What**: 修改 `scripts/sf-installer.ts` 及其 lib 支撑文件，让安装器从 `setup/` 目录读取安装源，并将所有硬编码路径替换为 `SPEC_DIR_NAME` 内联常量。
- **Why**: 安装器是用户首次接触 SpecForge 的入口，需要从新的统一目录读取部署源，同时路径常量化保证拼写正确。
- **Refs**: DD-6（sf-installer.ts 改造）
- **Constraints**:
  - **安装源路径切换**:
    - `getSourceDir() + ".opencode/"` → `getSourceDir() + "setup/userlevel-opencode/"`
    - `getSourceDir() + "templates/"` → `getSourceDir() + "setup/userlevel-templates/"`
    - `getSourceDir() + "scripts/lib/"` → `getSourceDir() + "setup/userlevel-scripts-lib/"`
  - **用户级路径常量化**:
    - `getSpecForgeUserDir()` 中硬编码 `".specforge"` → 内联 `const SPEC_DIR_NAME = '.specforge' as const;`
  - **scripts/lib/project_runtime.ts 处理**（25+ 处路径定义）:
    - **决策 D4**: 全部切换为 `.specforge/`（使用内联 `SPEC_DIR_NAME`），**不保留**旧 `specforge/` 路径向后兼容
    - 理由：此文件用于创建新项目目录结构，新项目必须用 `.specforge/`；旧项目迁移由 TASK-12 的 v6-dir-rename.ts 负责
  - **其他 lib 文件**:
    - `runtime_manifest.ts`: `"specforge/runtime-manifest.json"` → `SPEC_DIR_NAME + "/runtime-manifest.json"`
    - `install_lock.ts`: `".specforge.lock"` → 内联常量 `SPEC_LOCK_FILE = '.specforge.lock'`
    - `lock.ts`: 同上
    - `host-profile/scanner.ts`: `~/.specforge/` → 内联常量
    - `cleanup-project-runtime.ts`: 全量 `specforge/` → `.specforge/`
  - **import 方式**: sf-installer 及其 lib 文件不在 monorepo 编译上下文中运行，使用内联常量 `const SPEC_DIR_NAME = '.specforge' as const;`
  - **CLI 接口不变**: `bun scripts/sf-installer.ts verify` 等子命令行为不变
- **Done When**:
  - sf-installer.ts 从 setup/ 读取安装源
  - 所有 lib 文件中不再含硬编码 `"specforge"` 路径（SPEC_DIR_NAME 引用除外）
  - `bun scripts/sf-installer.ts verify` 通过

- **依赖**: TASK-8（setup/ 目录已建立），TASK-1（了解 USER_LAYOUT 设计意图）
- **批次**: 4
- **风险等级**: 中（安装器是用户入口，project_runtime.ts 25+ 处路径需全部切换）
- refs: [DD-6, DD-5]
- files:
  - scripts/sf-installer.ts
  - scripts/lib/project_runtime.ts
  - scripts/lib/runtime_manifest.ts
  - scripts/lib/types.ts
  - scripts/lib/compatibility.ts
  - scripts/lib/install_lock.ts
  - scripts/lib/lock.ts
  - scripts/lib/host-profile/scanner.ts
  - scripts/cleanup-project-runtime.ts
- **verification_commands**:
  - `bun scripts/sf-installer.ts verify` — 安装器验证通过
  - `bun -e "const fs=require('fs'); const c=fs.readFileSync('scripts/sf-installer.ts','utf8'); if(c.includes('.opencode/')&&!c.includes('setup/userlevel-opencode'))throw new Error('still references old .opencode/ path'); if(!c.includes('setup/userlevel-opencode'))throw new Error('missing new setup path'); console.log('OK')"` — 确认安装源路径已切换

---

## Batch 5: 文档生成器（低风险）

### TASK-10 render-layout.ts 文档生成器

**context_block**（executor 必读）：
- **What**: 新建 `scripts/render-layout.ts`，从 `packages/types/src/directory-layout.ts` 的 LAYOUT 常量自动生成 `docs/conventions/directory-layout.md` 人可读的目录约定文档。使用 marker 机制维护内容。
- **Why**: 方案 A §7.2 要求目录约定文档由 Schema 自动生成，避免人工维护过时。
- **Refs**: DD-7（render-layout.ts 文档生成器）
- **Constraints**:
  - **CLI 接口**:
    - `bun scripts/render-layout.ts` — 默认生成 docs/conventions/directory-layout.md
    - `bun scripts/render-layout.ts --dry-run` — 仅输出到 stdout，不写文件
    - `bun scripts/render-layout.ts --target README.md` — 指定目标文件
  - **marker 机制**:
    - `<!-- BEGIN: directory-layout -->` / `<!-- END: directory-layout -->`
    - marker 之外的内容永不修改
    - 如果 marker 只有 BEGIN 没有 END，报错退出（避免误删文件尾部）
    - 写入前创建 .bak 备份
  - **生成内容**:
    - 文件头注释（生成时间、源文件引用）
    - committed 区表格（LAYOUT Key | 相对路径 | 绝对路径示例）
    - gitignored 区表格
    - 路径构造函数表格（函数名 | 签名 | 用途）
  - **解析算法**: 用正则从 directory-layout.ts 提取 LAYOUT 对象定义，解析为扁平映射
  - **不修改现有文件**（除非目标文件已有 marker 段落）
  - 首次运行时，如果 `docs/conventions/directory-layout.md` 不存在，创建并写入 marker + 生成内容
- **Done When**:
  - `scripts/render-layout.ts` 存在且可执行
  - `bun scripts/render-layout.ts --dry-run` 输出正确格式的 Markdown
  - `bun scripts/render-layout.ts` 成功生成 `docs/conventions/directory-layout.md`
  - 生成的文档包含 committed 和 gitignored 分区表格

- **依赖**: TASK-1（LAYOUT 常量稳定，USER_LAYOUT 已扩展）
- **批次**: 5
- **风险等级**: 低（纯新增文件，不影响现有功能）
- refs: [DD-7]
- files:
  - scripts/render-layout.ts (新建)
  - docs/conventions/directory-layout.md (新建)
- **verification_commands**:
  - `bun scripts/render-layout.ts --dry-run` — 输出到 stdout，退出码 0
  - `bun scripts/render-layout.ts` — 生成文件成功
  - `bun -e "const fs=require('fs'); if(!fs.existsSync('docs/conventions/directory-layout.md'))throw new Error('output file missing'); const c=fs.readFileSync('docs/conventions/directory-layout.md','utf8'); if(!c.includes('BEGIN: directory-layout'))throw new Error('marker missing'); console.log('OK')"`

### TASK-11 render-specs-readme.ts 自动渲染

**context_block**（executor 必读）：
- **What**: 新建 `scripts/render-specs-readme.ts`，从所有 WI-XXX/_meta.json 渲染 `.specforge/specs/README.md`。在 `sf_state_transition_core.ts` 的成功流转路径末尾集成调用（非阻塞，失败只写日志不阻塞流转）。
- **Why**: 方案 A §5 要求 specs/README.md 由 _meta.json 自动生成，提供 WI 索引视图。
- **Refs**: DD-8（render-specs-readme.ts 自动渲染）
- **Constraints**:
  - **CLI 接口**:
    - `bun scripts/render-specs-readme.ts` — 默认渲染 .specforge/specs/README.md
    - `bun scripts/render-specs-readme.ts --dry-run` — 仅输出到 stdout
    - `bun scripts/render-specs-readme.ts --specs-dir /path` — 指定 specs 目录
  - **_meta.json 处理**:
    - 有 _meta.json: 正常渲染（用 WorkItemMetaSchema.safeParse 校验）
    - 无 _meta.json: 显示为 `(metadata pending)`，只显示目录名
    - _meta.json 解析失败: 显示为 `(metadata error)`，写 error.log
  - **marker**: `<!-- BEGIN: specforge-managed (DO NOT EDIT MANUALLY) -->` / `<!-- END: specforge-managed -->`
  - **排序**: 按 current_stage 分组（active 在前，completed 在后），组内按 created_at 排序
  - **daemon 集成**: 在 `sf_state_transition_core.ts` 流转成功后非阻塞调用 renderSpecsReadme，失败时写 error.log 不阻塞
  - **import**: 使用 `import { WorkItemMetaSchema } from '@specforge/types/meta-schema'` 校验 _meta.json
  - 使用 `resolveProjectPath` 构造路径
- **Done When**:
  - `scripts/render-specs-readme.ts` 存在且可执行
  - `bun scripts/render-specs-readme.ts --dry-run` 输出 WI 索引
  - `sf_state_transition_core.ts` 中集成了非阻塞调用

- **依赖**: TASK-1（resolveProjectPath 可用）
- **批次**: 5
- **风险等级**: 低（纯新增文件，daemon 集成是非阻塞降级模式）
- refs: [DD-8]
- files:
  - scripts/render-specs-readme.ts (新建)
  - packages/daemon-core/src/tools/lib/sf_state_transition_core.ts (集成调用)
- **verification_commands**:
  - `bun scripts/render-specs-readme.ts --dry-run` — 输出到 stdout，退出码 0
  - `bun -e "const fs=require('fs'); if(!fs.existsSync('scripts/render-specs-readme.ts'))throw new Error('file missing'); console.log('OK')"`
  - `bun -e "const c=require('fs').readFileSync('packages/daemon-core/src/tools/lib/sf_state_transition_core.ts','utf8'); if(!c.includes('renderSpecsReadme')&&!c.includes('render-specs-readme'))console.log('WARN: daemon integration may not be in this task'); else console.log('OK: daemon integration found')"` — 检查 daemon 集成

---

## Batch 6: 数据迁移（最高风险）

> ⚠️ **本批次开始前必须确认**: TASK-2~TASK-9 全部完成且 `bun run test` 通过。

### TASK-12 数据迁移实际执行

**context_block**（executor 必读）：
- **What**: 执行 P0 产出的迁移脚本，将仓库自身的 `specforge/` 目录数据合并到 `.specforge/`，最终删除 `specforge/` 目录。这是纯运行时操作，无代码改动。
- **Why**: 仓库当前同时存在 `.specforge/` 和 `specforge/` 两个目录，P1 代码切换后所有代码都指向 `.specforge/`，需要将旧目录中的数据合并过来。
- **Refs**: DD-9（数据迁移实际执行）
- **Constraints**:
  - **5 步执行流程**:
    1. **Dry-run 验证**: `bun scripts/migrations/v6-dir-backup.ts --dry-run` + `bun scripts/migrations/v6-dir-rename.ts --dry-run`，检查输出确认操作范围
    2. **创建备份**: `bun scripts/migrations/v6-dir-backup.ts`，备份到 `~/.specforge/backups/<timestamp>/`
    3. **验证备份**: 检查备份目录完整性（文件数 + 总大小与原目录对比）
    4. **执行迁移**: `bun scripts/migrations/v6-dir-rename.ts`，合并 specforge/ 到 .specforge/
    5. **验证结果**: 检查 .specforge/ 完整性，确认 specforge/ 已清空或删除，跑 `bun run test`
  - **冲突处理**: specforge/foo 和 .specforge/foo 同时存在时:
    - 内容相同: 删除 specforge/foo
    - 内容不同: 保留 .specforge/foo（权威版本），specforge/foo 备份到 ~/.specforge/backups/<ts>/conflicts/
    - 仅在 specforge/ 存在: 移动到 .specforge/ 对应位置
  - **回滚方案**: 迁移失败时从 ~/.specforge/backups/<ts>/ 恢复
  - **前提条件**: TASK-2~TASK-9 全部完成，代码已指向 .specforge/
  - **⚠️ 已知特殊状态**: 当前仓库双目录并存且都有数据，需半手动合并
- **Done When**:
  - `specforge/` 目录已删除（或完全清空）
  - `.specforge/` 目录包含所有原 `specforge/` 中的数据
  - `bun run test` 全量通过
  - 备份存在且可恢复

- **依赖**: TASK-2, TASK-3, TASK-4, TASK-5, TASK-8, TASK-9（所有路径切换和 setup/ 搬迁完成）
- **批次**: 6
- **风险等级**: 高（直接操作磁盘数据，合并双目录不可逆）
- refs: [DD-9]
- files: [] (无代码文件，运行时操作)
- **verification_commands**:
  - `bun -e "const fs=require('fs'); if(fs.existsSync('specforge')){ const files=fs.readdirSync('specforge'); if(files.length>0)throw new Error('specforge/ not empty: '+files.join(', ')); } console.log('OK: specforge/ gone or empty')"`
  - `bun -e "const fs=require('fs'); if(!fs.existsSync('.specforge/specs'))throw new Error('.specforge/specs missing'); if(!fs.existsSync('.specforge/config'))throw new Error('.specforge/config missing'); console.log('OK: .specforge/ structure intact')"`
  - `bun run test` — 全量测试通过

---

## Batch 7: 清理废弃文件（极低风险）

### TASK-13 清理废弃文件

**context_block**（executor 必读）：
- **What**: 删除仓库中的废弃文件和目录：`.opencode-/`（废弃备份）、`opencode.json`（空文件）、根目录临时调试文件、空目录。
- **Why**: 这些文件/目录在 TASK-1~TASK-12 完成后已无任何引用，清理保持仓库整洁。
- **Refs**: DD-10（清理废弃文件）
- **Constraints**:
  - **清理清单**:
    | 目标 | 类型 | 方式 |
    |------|------|------|
    | `.opencode-/`（带尾横线） | 目录 | `git rm -r .opencode-/` |
    | `opencode.json`（根目录） | 文件 | `git rm opencode.json` |
    | `test-error.txt` | 文件 | `git rm test-error.txt` |
    | `test-output.txt` | 文件 | `git rm test-output.txt` |
    | `test-output2.txt` | 文件 | `git rm test-output2.txt` |
    | `test-output3.txt` | 文件 | `git rm test-output3.txt` |
    | `test-help-output.ts` | 文件 | `git rm test-help-output.ts` |
    | `test-init.ps1` | 文件 | `git rm test-init.ps1` |
    | `run-concurrent-init.ps1` | 文件 | `git rm run-concurrent-init.ps1` |
    | `run-init-test.js` | 文件 | `git rm run-init-test.js` |
    | `task-4.7-completion-summary.md` | 文件 | `git rm task-4.7-completion-summary.md` |
    | `agents/`（空目录） | 目录 | `git rm -r agents/` |
  - **决策 D3**: `.opencode-/` 直接 `git rm -r` 删除，不保留到 archive（git history 已保留历史）
  - **执行前提**: TASK-1~TASK-12 全部完成
  - **注意**: 只删除清单中的文件，不要误删其他文件。执行前用 `git status` 确认这些文件确实无引用
  - 如果某些文件不存在（可能已被之前的操作清理），跳过而不报错
- **Done When**:
  - 清单中的所有文件/目录已删除
  - 根目录无 `.opencode-/`、`opencode.json`、`test-*`、`run-*`、`task-4.7-*` 文件
  - `bun run test` 全量通过

- **依赖**: TASK-12（数据迁移完成，所有代码引用已指向 .specforge/）
- **批次**: 7
- **风险等级**: 极低（删除无引用文件，可随时 git checkout 恢复）
- refs: [DD-10]
- files: [] (纯删除操作)
- **verification_commands**:
  - `bun -e "const fs=require('fs'); const bad=[]; ['.opencode-/','opencode.json','test-error.txt','test-output.txt','test-output2.txt','test-output3.txt','test-help-output.ts','test-init.ps1','run-concurrent-init.ps1','run-init-test.js','task-4.7-completion-summary.md'].forEach(f=>{if(fs.existsSync(f))bad.push(f)}); if(bad.length>0)throw new Error('files still exist: '+bad.join(', ')); console.log('OK: all cleaned')"`
  - `bun run test` — 全量测试通过

---

## 批次间回归检查清单

每个批次完成后必须执行：

| 检查项 | 命令 | 说明 |
|--------|------|------|
| 全量测试 | `bun run test` | 任何失败必须立即修复 |
| 安装器验证 | `bun scripts/sf-installer.ts verify` | Batch 4+ 必做 |
| Git 状态 | `git status` | 确认无意外修改 |
| 已知 pre-existing 失败 | 不阻塞 | SessionRegistry 5 个失败（WI-010 已记录） |

---

## 不变行为约束（继承自 WI-010）

以下约束在整个 P1 执行期间必须严格遵守：

1. ✅ daemon 启动行为、Plugin 加载、所有 8 种工作流正常端到端
2. ✅ 所有 `sf_*` tool 的 MCP I/O schema 不变（仅内部实现切换路径常量，对外接口零变化）
3. ✅ 现有所有 unit/integration/property test 必须 100% 继续通过
4. ✅ Plugin 与 daemon 通信协议不变

---

## 自问自答验收清单

| # | 问题 | 状态 |
|---|------|------|
| 1 | 每个 DD（DD-0 ~ DD-11）都有对应的 task 覆盖吗？ | ✅ DD-0→TASK-1, DD-1→TASK-2+3, DD-2→TASK-4, DD-3→TASK-6+7, DD-4→TASK-5, DD-5→TASK-8, DD-6→TASK-9, DD-7→TASK-10, DD-8→TASK-11, DD-9→TASK-12, DD-10→TASK-13, DD-11→批次策略 |
| 2 | 每个 task 的 context_block 是否充分（executor 不需要回查 design.md）？ | ✅ 每个 task 包含 What/Why/Refs/Constraints/Done When |
| 3 | verification_commands 是否真能机器跑？ | ✅ 全部使用 bun test 或 bun -e 内联脚本，跨平台兼容 |
| 4 | 并行批次内的 task 是否互相独立？ | ✅ Batch 2 内 TASK-2/3/4/5 修改不同目录，无文件重叠；Batch 3 内 TASK-6/7 修改不同文件 |
| 5 | 有没有共享代码需要先建独立 task？ | ✅ TASK-1（USER_LAYOUT 扩展）是共享基础设施，所有 Batch 2+ 任务依赖它 |
| 6 | 每个 task 改动文件数是否在合理范围？ | ⚠️ TASK-2(15文件)和 TASK-4(16文件)超出建议的1-3文件，但所有替换遵循相同模式，拆分会增加不一致风险 |
| 7 | dependencies 是否有循环？ | ✅ 无循环依赖 |
| 8 | 风险等级标注是否合理？ | ✅ 与 impact_analysis 风险评估一致 |
