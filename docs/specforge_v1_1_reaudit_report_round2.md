# SpecForge v1.1 自举整改复审报告（第二轮）

> 日期：2026-06-09  
> 审查对象：SpecForge 项目及 OpenCode 用户级扩展整改结果  
> 审查依据：`specforge_final_fused_standard_v1_1_patch1_zh`、上一轮复审意见、GitHub 主分支公开文件  
> 审查结论：未通过

---

## 1. 总结论

本轮复审结论：**没有通过**。

本轮确实补充了 `docs/bootstrap/` 和 Runtime 版 `PathPolicy.ts`，但最关键的安装器问题没有真正修掉。当前仍存在：

```text
文档 / 审计日志说已整改，
但实际代码仍然写 legacy 目录 ~/.specforge。
```

这个问题比“没改完”更危险，因为它会让后续 AI 或开发者误判为整改已经闭环。

当前状态应标记为：

```text
bootstrap partial-remediation
不得标记 v1.1 complete
不得打 complete tag
不得作为 final fused standard 的合格实现
```

---

## 2. 已经改好的部分

### 2.1 bootstrap 目录已经补上

当前 `docs/bootstrap/` 已经存在，并包含：

```text
docs/bootstrap/specforge-v1.1-bootstrap-audit-log.md
docs/bootstrap/specforge-v1.1-bootstrap-plan.md
docs/bootstrap/specforge-v1.1-compliance-gap.md
```

其中 audit log 已经明确说明：

```text
旧系统开发辅助产生的记录不是 v1.1 合规流程证据。
```

这个方向是正确的。

### 2.2 Runtime 版 PathPolicy 已经补充权限模型

新增的 Runtime PathPolicy 已经包含：

```text
canReadPath
canWritePath
canCreatePath
isForbiddenMvpPath
validateSpecReferencePath
assertPathAllowed
```

并且能阻断以下路径行为：

```text
legacy specs 写入
普通 agent 写 .specforge/project/**
普通 agent 写 user_decision.json
普通 agent 写 gates/**
普通 agent 写 gate_summary.md
普通 agent 写 merge_report.md
普通 agent 写 extension_registry.json
```

这比上一轮只在 `directory-layout.ts` 里做路径语法校验有明显进步。

### 2.3 Plugin 前置硬阻断仍然成立

`setup/userlevel-opencode/plugins/sf_specforge.ts` 的 `tool.execute.before` 已经具备硬阻断方向：

```text
写工具无法识别路径时 throw
daemon 不可达时 fail closed
校验失败时 throw
```

这符合 Write Guard 不能只记录、必须阻断的方向。

---

## 3. 仍然阻断的问题

## P0-1：安装器仍然默认写 `~/.specforge`

这是当前最大阻断项。

标准要求：

```text
新版本不得默认写入 ~/.specforge/
~/.specforge/ 只作为 legacy read-only 来源
OpenCode 扩展私有数据应放在 ~/.config/opencode/sf-user/
```

但当前 `scripts/sf-installer.ts` 仍然存在类似逻辑：

```ts
function getSpecForgeUserDir(): string {
  const home = require("node:os").homedir()
  return require("node:path").join(home, SPEC_DIR_NAME)
}
```

而 `SPEC_DIR_NAME` 仍然指向 `.specforge`。

安装流程仍然可能把内容部署到：

```text
~/.specforge/lib/
~/.specforge/templates/
~/.specforge/specforge-manifest.json
~/.specforge/install.json
```

这说明 audit log 中关于 `getSpecForgeUserDir()` 已经改为 `~/.config/opencode/sf-user/` 的说法与实际代码不一致。

### 判断

```text
未整改
```

### 整改要求

必须彻底区分三个目录概念：

```ts
getOpenCodeUserDir()        // ~/.config/opencode
getSpecForgeUserDataDir()   // ~/.config/opencode/sf-user
getLegacySpecForgeDir()     // ~/.specforge，只读迁移用
```

禁止 install / upgrade / verify / version / uninstall 的新 manifest、install.json、lib、templates 写入 `~/.specforge`。

---

## P0-2：README 与 installer 目录语义不一致

README 中描述安装目标是：

```text
~/.config/opencode/
```

并且说明 `specforge-manifest.json` 位于 OpenCode 用户级目录。

但 installer 中的 `showVersion()`、`write install.json`、`deployTemplates()`、`deploy lib()` 等逻辑仍然使用 `getSpecForgeUserDir()`，也就是 `~/.specforge`。

这会导致：

```text
文档认为运行态在 ~/.config/opencode/
实际安装器仍写 ~/.specforge/
verify / uninstall / version 可能读取另一套目录
```

### 判断

```text
运行态目录仍不可信
```

### 整改要求

统一 README、installer、verify、uninstall、version 的目录语义：

```text
共享组件：~/.config/opencode/
扩展私有数据：~/.config/opencode/sf-user/
legacy 读取：~/.specforge/
项目运行时：<project>/.specforge/
```

---

## P0-3：存在两个 PathPolicy，职责可能分裂

当前至少有两个位置在表达 Path Policy：

```text
packages/types/src/directory-layout.ts
packages/workflow-runtime/src/v11/runtime/PathPolicy.ts
```

Runtime 版 `PathPolicy.ts` 已经有权限模型，这是正确方向。

但 `directory-layout.ts` 中仍保留旧的：

```text
validatePathPolicy
isProjectSpecPath
isWorkItemPath
isLegacySpecPath
```

并且其中部分函数仍可能接受不带 `.specforge/` 前缀的路径，例如：

```text
project/
work-items/
specs/
```

这与标准要求冲突。标准要求：

```text
Path Policy 负责判断路径能否创建、读取、写入和由谁写入；
引用项目规格文件必须带 .specforge/ 前缀。
```

### 判断

```text
Path Policy 已经补充，但入口尚未统一。
```

### 整改要求

`directory-layout.ts` 只能保留：

```text
路径常量
Path Service
legacy path constants
```

权限判断必须统一转到：

```text
packages/workflow-runtime/src/v11/runtime/PathPolicy.ts
```

如果暂时保留 `directory-layout.ts` 的旧函数，也必须转调 Runtime PathPolicy，不能自己维护一套旧逻辑。

---

## P1：Plugin after-audit 仍主要审计 shell

当前 `sf_specforge.ts` 的 `tool.execute.after` 逻辑仍然偏向：

```ts
// Only audit shell tools for escaped writes
if (!isShellTool(toolName)) return
```

也就是说 after-audit 主要覆盖 shell/bash，而不是所有 side-effect tools。

标准要求 Write Guard 覆盖：

```text
edit 工具
SpecForge 写文件工具
bash
formatter
generator
package manager
snapshot update
Git 相关写入
```

changed_files_audit 也必须检查：

```text
formatter / generator / package manager 写入
间接写入副作用
escaped_write_incident
```

### 判断

```text
before hook 方向正确，但 after-audit 未完全闭环。
```

### 整改要求

`tool.execute.after` 不能只审计 shell，应扩展为：

```ts
if (!isShellTool(toolName) && !isSideEffectTool(toolName)) return
```

并且对以下工具同样调用 `changedFilesAudit()`：

```text
formatter
generator
package manager
snapshot update
git 写入类命令
SpecForge 写文件工具
```

---

## 4. 当前评分

```text
bootstrap 文档：80 分
Runtime PathPolicy：75 分
directory-layout 统一性：45 分
installer legacy 清理：0 分
README / installer 一致性：30 分
Write Guard before hook：80 分
Write Guard after audit：60 分
端到端证据：无法确认
```

总评：

```text
仍处于 bootstrap partial-remediation。
不能标记 v1.1 complete。
不能打 tag complete。
不能作为 final fused standard 的合格实现。
```

---

## 5. 必须立即整改的四个任务

### 任务 1：彻底移除 installer 对 `~/.specforge` 的新写入

必须修改：

```text
scripts/sf-installer.ts
```

把旧的：

```text
getSpecForgeUserDir() -> ~/.specforge
```

拆成：

```ts
getOpenCodeUserDir()        // ~/.config/opencode
getSpecForgeUserDataDir()   // ~/.config/opencode/sf-user
getLegacySpecForgeDir()     // ~/.specforge，只读迁移用
```

禁止以下内容再写入 `~/.specforge`：

```text
lib/
templates/
specforge-manifest.json
install.json
```

### 任务 2：修正文档与代码一致性

统一以下文件或逻辑：

```text
README
scripts/sf-installer.ts
verify
uninstall
version
```

目录模型必须统一为：

```text
共享组件：~/.config/opencode/
扩展私有数据：~/.config/opencode/sf-user/
legacy 读取：~/.specforge/
项目运行时：<project>/.specforge/
```

### 任务 3：统一 PathPolicy 入口

`directory-layout.ts` 不得继续维护权限判断。

保留：

```text
路径常量
Path Service
legacy path constants
```

删除、废弃或转调 Runtime PathPolicy：

```text
validatePathPolicy
isProjectSpecPath 的 project/ 宽松判断
isWorkItemPath 的 work-items/ 宽松判断
isLegacySpecPath 的 specs/ 宽松判断
```

引用项目规格文件必须带：

```text
.specforge/
```

### 任务 4：扩展 after-audit 到所有副作用工具

`tool.execute.after` 不能只审计 shell。

必须覆盖：

```text
bash / shell
formatter
generator
package manager
snapshot update
git 写入类命令
SpecForge 写文件工具
```

所有副作用工具都必须调用：

```text
changedFilesAudit()
```

---

## 6. 必须补充的测试

### 6.1 installer-no-legacy-write.test.ts

必须证明以下操作不会新写 `~/.specforge`：

```text
install
upgrade
version
verify
```

并验证：

```text
manifest 写到 ~/.config/opencode/
install.json 写到 ~/.config/opencode/sf-user/
lib/templates 写到 ~/.config/opencode/sf-user/ 或正式 OpenCode 扩展目录
~/.specforge 只读
```

### 6.2 PathPolicy 测试

必须证明以下路径作为规格引用失败：

```text
project/foo.md
work-items/WI-0001/foo.md
specs/WI-0001/foo.md
```

必须使用：

```text
.specforge/project/foo.md
.specforge/work-items/WI-0001/foo.md
.specforge/specs/WI-0001/foo.md
```

同时证明：

```text
普通 Agent 写 .specforge/project/** 失败
普通 Agent 写 user_decision.json 失败
普通 Agent 写 gates/** 失败
普通 Agent 写 gate_summary.md 失败
普通 Agent 写 merge_report.md 失败
新流程写 .specforge/specs/** 失败
创建 .specforge/archive/** 失败
```

### 6.3 Plugin side-effect audit 测试

必须证明以下工具会进入 `changedFilesAudit()`：

```text
formatter
generator
package manager
snapshot update
git 写入类命令
SpecForge 写文件工具
```

### 6.4 bootstrap audit log 更新

测试结果必须写入：

```text
docs/bootstrap/specforge-v1.1-bootstrap-audit-log.md
```

---

## 7. 给开发 Agent 的精确提示词

```text
当前复审未通过。禁止总结“已完成”，先修阻断项。

必须整改 4 个问题：

1. installer 仍写 ~/.specforge
- scripts/sf-installer.ts 中 getSpecForgeUserDir() 仍返回 home + SPEC_DIR_NAME，实际就是 ~/.specforge。
- install / upgrade / version / uninstall 仍写或读 ~/.specforge/specforge-manifest.json、~/.specforge/install.json、~/.specforge/lib、~/.specforge/templates。
- 必须改为：
  - 共享组件：~/.config/opencode/
  - SpecForge 扩展私有数据：~/.config/opencode/sf-user/
  - legacy ~/.specforge 只能通过 getLegacySpecForgeDir() 读取，不能作为新写入目标。

2. README 与 installer 目录语义不一致
- README 说 manifest 在 ~/.config/opencode/，但 installer 仍写 ~/.specforge。
- 修正 README / installer / verify / uninstall / version，使目录语义一致。

3. PathPolicy 分裂
- packages/workflow-runtime/src/v11/runtime/PathPolicy.ts 已有权限模型。
- packages/types/src/directory-layout.ts 仍保留旧 validatePathPolicy / isProjectSpecPath / isWorkItemPath / isLegacySpecPath，且接受 project/、work-items/、specs/ 这种无 .specforge/ 前缀路径。
- directory-layout.ts 只能保留路径常量和 Path Service；权限判断必须统一转到 Runtime PathPolicy。
- 引用项目规格文件必须带 .specforge/ 前缀。

4. Plugin after-audit 仍只审计 shell
- setup/userlevel-opencode/plugins/sf_specforge.ts 的 tool.execute.after 仍有：
  if (!isShellTool(toolName)) return
- 必须扩展为审计所有 side-effect tools，包括 formatter、generator、package manager、snapshot update、git 写入类命令、SpecForge 写文件工具。
- 所有副作用工具都必须调用 changedFilesAudit。

补测试：
- installer-no-legacy-write.test.ts 必须证明 install / upgrade / version / verify 不会新写 ~/.specforge。
- PathPolicy 测试必须证明 project/foo.md、work-items/WI-0001/foo.md、specs/WI-0001/foo.md 作为规格引用失败，必须带 .specforge/ 前缀。
- Plugin 测试必须证明 formatter / generator / package manager / snapshot / git 写入会进入 changedFilesAudit。
- 测试输出必须保存到 docs/bootstrap/specforge-v1.1-bootstrap-audit-log.md。

完成后只汇报：
- 修改文件
- 测试命令
- 测试结果
- 仍未完成项

不要声称 v1.1 complete，除非端到端场景全部通过。
```

---

## 8. 最终判断

最严厉的结论：

```text
本轮补了表层证据，但 installer 仍在写 legacy 目录。
这说明运行态一致性还没过关。
```

下一步不要扩大范围，不要继续优化 Agent，不要继续写总结报告。

先修：

```text
installer 不再写 ~/.specforge
README / installer / verify / uninstall 目录一致
PathPolicy 单一入口
after-audit 覆盖全部副作用工具
```

这四件事没完成前，SpecForge v1.1 不能进入 final complete。
