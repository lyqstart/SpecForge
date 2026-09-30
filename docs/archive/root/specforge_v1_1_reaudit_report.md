# SpecForge v1.1 自举整改复审报告

> 复审日期：2026-06-09  
> 复审对象：SpecForge 项目及 OpenCode 用户级扩展包整改结果  
> 标准依据：`SpecForge 最终融合标准 v1.1 Patch 1`  
> 当前判断：`bootstrap整改中 / v1.1 partial-compliance`

---

## 1. 总体结论

复审结论：**有明显进步，但还不能判定“整改完成”。**

当前项目已经从“旧系统不合规”推进到“v1.1 运行骨架初步接入”。仓库 README 已经声明 v1.1 主链路、Write Guard、Gate、Changed Files Audit、Legacy 只读、安装校验等能力；安装后目录也开始转向：

```text
.specforge/project/
.specforge/work-items/
.specforge/runtime/
```

并且已经把 `extension_registry.json` 纳入项目正式规格目录。

但是，当前仍不能判定为 `v1.1 final-complete`。主要原因是：

```text
1. bootstrap 自举边界没有看到固定文档；
2. 安装器仍然默认写 ~/.specforge；
3. Path Policy 还偏语法校验，不是完整权限治理；
4. Write Guard 对 bash / formatter / generator / package manager / git 等副作用写入的覆盖仍需加强；
5. 端到端硬阻断验收证据不足。
```

因此，当前状态应标记为：

```text
bootstrap整改中 / v1.1 partial-compliance
```

不能标记为：

```text
v1.1 complete
final-complete
production-compliant
```

---

## 2. 审查前提

本轮复审要特别注意：当前 SpecForge 是在老旧系统上自举整改自身。

也就是说：

```text
旧版 OpenCode 扩展 / 旧版 SpecForge Agent / 旧版 Plugin / 旧版 Tools
仍然可能被用于开发和整改 SpecForge 自己。
```

因此不能按“已有合规系统内正常执行 WI 流程”来判断。

正确判断逻辑是：

```text
旧系统只能作为开发辅助；
旧系统不能自证 v1.1 合规；
合规结论必须来自新 Runtime、State Machine、Path Policy、Write Guard、Gate、User Decision、Merge Runner、changed_files_audit、close_gate 的程序控制证据。
```

---

## 3. 已整改到位的部分

### 3.1 OpenCode 扩展包位置已有修正

之前的关键问题是：

```text
GitHub 仓库源码
和
~/.config/opencode/ 实际加载的插件、Agent、Tool、Skill
不一致
```

现在仓库中已经出现：

```text
setup/userlevel-opencode/
  agents/
  tools/
  plugins/
  skills/
```

这说明项目已经开始把 OpenCode 用户级扩展包作为正式分发对象处理。

这一步方向正确。

后续不要再把 `.opencode/` 或散落目录作为实际运行包真相源。

---

### 3.2 Agent 与 Tool 清单明显补齐

`setup/userlevel-opencode/agents` 中已经出现：

```text
sf-extension.md
```

这说明 Patch 1 要求的 Extension Subflow 专用 Agent 至少已经补入口。

`setup/userlevel-opencode/tools` 中也已经出现关键工具：

```text
sf_changed_files_audit.ts
sf_close_gate.ts
sf_code_permission.ts
sf_gate_run.ts
sf_merge_run.ts
sf_state_transition.ts
sf_user_decision_record.ts
sf_verification_gate.ts
```

这说明 v1.1 主链路中的受控主体已经开始落到工具层。

这比上一版明显更接近 final fused standard。

---

### 3.3 Plugin 的 Write Guard 已从“上报”转向“硬阻断”

上一版最大问题是：

```text
OpenCode Plugin 只是把事件 post 到 daemon；
失败后 warn；
不会阻断 edit/write/bash。
```

这次已经看到方向性改进：

```text
tool.execute.before 中检查写工具；
无法识别路径时 throw Error；
daemon 不可达时 fail closed；
校验失败时 throw Error 阻断。
```

这是非常关键的进步。

因为 final standard 的底层逻辑不是“提醒 Agent 不要乱写”，而是：

```text
违规写入必须无法发生。
```

---

## 4. 仍然存在的阻断问题

## 阻断 1：bootstrap 文档没有看到

需要存在：

```text
docs/bootstrap/specforge-v1.1-bootstrap-plan.md
docs/bootstrap/specforge-v1.1-bootstrap-audit-log.md
docs/bootstrap/specforge-v1.1-compliance-gap.md
```

本轮没有看到这些固定文档。

这不是形式主义。

当前系统处于“旧系统整改自身”的自举阶段。如果没有 bootstrap 文档，后面会出现一个严重风险：

```text
旧系统生成的流程产物
被误认为
v1.1 合规流程证据
```

这是不能接受的。

### 必须整改

创建：

```text
docs/bootstrap/
```

并补齐：

```text
specforge-v1.1-bootstrap-plan.md
specforge-v1.1-bootstrap-audit-log.md
specforge-v1.1-compliance-gap.md
```

必须写清楚：

```text
当前仍是 bootstrap 自举期；
旧系统只作为开发辅助；
旧系统产生的 WI / Gate / Approval / Merge 结论不作为 v1.1 合规证据；
哪些能力已实现；
哪些能力尚未端到端验证；
bootstrap 结束条件是什么。
```

---

## 阻断 2：安装器仍在默认写 `~/.specforge/`

final standard 明确要求：

```text
新版本不得默认写入 ~/.specforge/；
~/.specforge/ 只作为 legacy read-only 来源。
```

但当前安装器仍然存在如下行为：

```text
getSpecForgeUserDir(): ~/.specforge
部署 templates 到 ~/.specforge/templates
部署 lib 到 ~/.specforge/lib
写 specforge-manifest.json 到 ~/.specforge
写 install.json 到 ~/.specforge
```

这与 v1.1 目录边界冲突。

注意：这不是“项目级 `.specforge/specs`”的问题，而是用户级 legacy 目录的问题。

标准要求 OpenCode 扩展层应位于：

```text
~/.config/opencode/
  agents/
  tools/
  plugins/
  skills/
  sf-user/
```

因此，`~/.specforge` 不应继续作为新版本安装写入目标。

### 必须整改

把新版本用户级私有数据迁移到：

```text
~/.config/opencode/sf-user/
```

或拆分为：

```text
~/.config/opencode/sf-user/
~/.config/opencode/sf-runtime/
```

例如：

```text
~/.specforge/lib                       → ~/.config/opencode/sf-user/lib
~/.specforge/templates                 → ~/.config/opencode/sf-user/templates
~/.specforge/specforge-manifest.json   → ~/.config/opencode/sf-user/specforge-manifest.json
~/.specforge/install.json              → ~/.config/opencode/sf-user/install.json
```

可以保留：

```text
legacy ~/.specforge reader
```

但只能用于 legacy read-only，不允许安装器默认写入。

---

## 阻断 3：Path Policy 还不够硬

当前 Path Service / directory layout 已经有进步，但 Path Policy 仍偏“路径语法检查”，还不是完整“路径权限治理”。

final standard 要求 Path Policy 负责判断：

```text
路径能否创建；
路径能否读取；
路径能否写入；
由谁写入；
在什么状态下写入；
是否属于 legacy read-only；
是否属于 MVP 禁止目录。
```

当前只检查：

```text
绝对路径
..
~
Windows 反斜杠
```

还不够。

另一个危险点是：如果 `isProjectSpecPath()` 同时接受：

```text
.specforge/project/
project/
```

那么在 Gate、Manifest、Agent 产物中可能违反：

```text
引用项目规格文件必须带 .specforge/ 前缀。
```

### 必须整改

把 Path Policy 拆成明确接口：

```ts
validateRelativePathSyntax(path)
validateSpecReferencePath(path)
canReadPath(actor, path, context)
canCreatePath(actor, path, context)
canWritePath(actor, path, context)
isLegacyReadOnlyPath(path)
isForbiddenMvpPath(path)
assertPathAllowed(action, actor, path, context)
```

必须阻断：

```text
普通 Agent 写 .specforge/project/**
普通 Agent 写 user_decision.json
普通 Agent 写 gates/**
普通 Agent 写 gate_summary.md
普通 Agent 写 merge_report.md
新流程写 .specforge/specs/**
创建 .specforge/archive/**
创建 .specforge/standards/**
创建 .specforge/state/**
创建 .specforge/reports/**
创建 .specforge/snapshots/**
```

### 必须补测试

至少覆盖：

```text
project/foo.md 作为规格引用必须失败
.specforge/project/foo.md 才能通过
普通 Agent 写 .specforge/project/** 必须失败
Merge Runner 写 manifest 内 .specforge/project/** 才能通过
新 WI 写 .specforge/specs/** 必须失败
读 .specforge/specs/** 可作为 legacy read-only 通过
写 .specforge/archive/** 必须失败
写 ../evil 必须失败
写绝对路径必须失败
写 Windows 反斜杠路径必须失败
```

---

## 阻断 4：Plugin 对副作用写入的覆盖仍需加强

当前 Plugin 已经对写工具做前置检查，并对 bash 做 after audit，这是正确方向。

但 final standard 要求 Write Guard 覆盖所有写入入口：

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

这意味着不能只管 `edit/write`，也不能只在 `bash` 后审计。

很多真实越界写入来自：

```text
bun install
npm install
pnpm install
formatter
codegen
test snapshot update
git checkout / apply / clean
脚本生成文件
```

### 必须整改

所有可能写文件的工具或命令都必须声明：

```json
{
  "expected_write_files": []
}
```

规则：

```text
没有 expected_write_files → 默认只读或阻断；
声明 expected_write_files → 执行前校验白名单；
执行后比对实际 changed files；
实际写多了 → changed_files_audit failed；
存在 violation → close_gate 不得通过。
```

`tool.execute.after` 不应只审计 bash，而应审计所有可能产生文件副作用的工具类型。

---

## 5. 重要但非立即阻断的问题

### 5.1 README 声明与 installer 行为不一致

README 已经声明：

```text
legacy 只读
新项目目录走 .specforge/project + work-items + runtime
```

但 installer 仍然写 `~/.specforge`。

这会造成：

```text
文档看起来是 v1.1；
安装行为仍残留 legacy；
最终运行态边界不可信。
```

必须以运行态为准，不以 README 为准。

---

### 5.2 extension_registry 入口已有，但端到端闭环仍需验证

已经看到 `sf-extension.md` 和相关工具入口，这是好事。

但 Patch 1 要求的是完整闭环：

```text
Agent 发现扩展缺口
→ 写 extension_request.json
→ 主流程 blocked
→ sf-orchestrator 调度 sf-extension
→ sf-extension 生成 extension_delta.md
→ 生成 candidates/project/extension_registry.json
→ candidate_manifest 登记
→ extension_gate
→ Gate Summary
→ User Decision
→ Merge Runner
→ post_merge_gate
→ 原主流程重新读取 extension_registry
→ 原 Candidate invalidated 并重新生成
```

目前只能确认入口方向，不能确认闭环完成。

---

### 5.3 需要端到端验收，而不是只跑单元测试

单元测试只能证明局部函数正确。

v1.1 合规必须证明：

```text
违规行为真的被阻断；
状态真的不能乱跳；
普通 Agent 真的不能写正式规格；
User Decision 真的不能被聊天同意替代；
Merge Runner 真的只按 manifest 合并；
close_gate 真的能阻断未闭环 WI。
```

---

## 6. 当前评分

| 项目 | 评分 | 判断 |
|---|---:|---|
| 路径方向 | 70 | 方向正确，但 Path Policy 还不够硬 |
| OpenCode 安装包同步 | 70 | setup/userlevel-opencode 已形成，但 installer 仍写 ~/.specforge |
| Write Guard Plugin | 80 | 已转向硬阻断，但副作用写入覆盖要加强 |
| Path Policy | 55 | 仍偏语法校验，不是完整权限治理 |
| bootstrap 审计 | 0 | 未看到固定文档 |
| extension_registry 入口 | 70 | 入口存在，闭环需验证 |
| 端到端合规证据 | 无法确认 | 需要 e2e 验收日志 |

总评：

```text
已从“旧系统不合规”推进到“v1.1 运行骨架初步接入”。
但还不能合并为 final-complete。
当前应标记为：bootstrap整改中 / v1.1 partial-compliance。
```

---

## 7. 下一步整改优先级

不要继续大范围重构。

按以下顺序补刀：

```text
1. 清除新版本安装器对 ~/.specforge 的默认写入；
2. 补 docs/bootstrap 三个自举整改文档；
3. 强化 Path Policy，从语法校验升级为权限治理；
4. 扩展 Write Guard 覆盖所有副作用写入；
5. 补端到端硬阻断验收；
6. 再检查 extension_registry + Extension Subflow 闭环。
```

---

## 8. 立即整改任务提示词

下面这段可以直接交给开发 Agent。

```text
当前 SpecForge 处于 v1.1 bootstrap 自举整改阶段，不是 final-complete 合规态。旧版 SpecForge / OpenCode 扩展只能作为开发辅助，不能用旧流程结论证明 v1.1 合规。

本轮只做四件事，不做大范围重构：

一、清除新版本安装器对 ~/.specforge 的默认写入
检查 scripts/sf-installer.ts 及相关安装逻辑。
要求：
1. 新版本不得默认创建或写入 ~/.specforge。
2. 原写入 ~/.specforge/lib、~/.specforge/templates、~/.specforge/specforge-manifest.json、~/.specforge/install.json 的内容，迁移到 ~/.config/opencode/sf-user/ 或 ~/.config/opencode/sf-runtime/。
3. ~/.specforge 只能作为 legacy read-only 来源。
4. 保留 legacy reader，但禁止 installer 默认写 legacy 用户目录。
5. 增加测试证明 installer 不写 ~/.specforge。

二、补 bootstrap 文档
创建：
- docs/bootstrap/specforge-v1.1-bootstrap-plan.md
- docs/bootstrap/specforge-v1.1-bootstrap-audit-log.md
- docs/bootstrap/specforge-v1.1-compliance-gap.md

要求写明：
1. 当前是 bootstrap 自举整改期；
2. 旧系统只作为开发辅助；
3. 旧系统产生的 WI / Gate / Approval / Merge 结论不作为 v1.1 合规证据；
4. 已实现能力、未实现能力、未端到端验证能力；
5. bootstrap 结束条件。

三、强化 Path Policy
检查 directory-layout.ts、path-service.ts、path-policy.ts、legacy-paths.ts 等相关文件。
要求增加或明确以下能力：
- validateRelativePathSyntax(path)
- validateSpecReferencePath(path)
- canReadPath(actor, path, context)
- canCreatePath(actor, path, context)
- canWritePath(actor, path, context)
- isLegacyReadOnlyPath(path)
- isForbiddenMvpPath(path)
- assertPathAllowed(action, actor, path, context)

必须阻断：
1. 普通 Agent 写 .specforge/project/**；
2. 普通 Agent 写 user_decision.json；
3. 普通 Agent 写 gates/**；
4. 普通 Agent 写 gate_summary.md；
5. 普通 Agent 写 merge_report.md；
6. 新流程写 .specforge/specs/**；
7. 创建 .specforge/archive/**、.specforge/standards/**、.specforge/state/**、.specforge/reports/**、.specforge/snapshots/**；
8. 规格引用路径不带 .specforge/ 前缀。

测试必须覆盖：
- project/foo.md 作为规格引用失败；
- .specforge/project/foo.md 通过；
- 普通 Agent 写 .specforge/project/** 失败；
- Merge Runner 写 manifest 内 .specforge/project/** 通过；
- 新 WI 写 .specforge/specs/** 失败；
- legacy read-only 读取 .specforge/specs/** 通过；
- 写 .specforge/archive/** 失败；
- 写 ../evil、绝对路径、Windows 反斜杠路径失败。

四、扩展 Write Guard 副作用写入审计
检查 setup/userlevel-opencode/plugins/sf_specforge.ts 及 daemon 校验接口。
要求：
1. 所有可能写文件的工具或命令都必须支持 expected_write_files。
2. 没有 expected_write_files 时默认只读或阻断。
3. formatter、generator、package manager、snapshot update、Git 相关写入必须纳入审计。
4. tool.execute.after 不只审计 bash，也要审计所有可能产生文件副作用的工具类型。
5. 实际写入超出 expected_write_files 时，changed_files_audit 必须 failed，并阻止 close_gate。

最后输出：
1. 修改文件清单；
2. 每个修改对应的 final fused standard 条款；
3. 测试命令；
4. 测试结果；
5. 仍未完成的 v1.1 合规缺口。

禁止：
1. 不要声称系统已经 v1.1 final-complete；
2. 不要删除 legacy read-only 读取能力；
3. 不要把 README 声明当成运行态合规证据；
4. 不要只改 Agent 提示词而不改程序硬控制。
```

---

## 9. 复审结论

当前不是失败状态，而是**未完成状态**。

正确评价是：

```text
已经完成 v1.1 运行骨架接入的一部分；
Write Guard 和工具链方向正确；
但 installer legacy 写入、bootstrap 文档、Path Policy 硬化、端到端审计证据仍未闭环。
```

下一轮复审重点只看四件事：

```text
1. ~/.specforge 是否已经完全停止新写入；
2. docs/bootstrap 是否补齐；
3. Path Policy 是否能按 actor/action/state 做权限判断；
4. e2e 是否证明违规写入、非法 merge、未处理 extension_request、未撤销 code_permission 都无法 close。
```
