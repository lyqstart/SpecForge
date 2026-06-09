# SpecForge v1.1 自举整改复审报告（第三轮）

> 日期：2026-06-09  
> 审查对象：SpecForge 本轮整改结果、安装器实测输出、OpenCode 用户级扩展清理行为  
> 审查结论：本轮阻断项基本通过；仍不得直接标记 v1.1 final complete  
> 当前建议状态：`Round 2 remediation accepted / bootstrap e2e pending`

---

## 1. 总结论

本轮你提交的三项整改：

```text
P0-1: installer 写 ~/.specforge
P0-3: PathPolicy 分裂
P1: after-audit 只审计 shell
```

复审结论：

```text
P0-1：通过
P0-3：基本通过
P1：通过
```

同时，你提供了真实安装命令输出，证明安装器已经把共享组件部署到：

```text
C:\Users\luo\.config\opencode
```

并把 SpecForge 私有依赖、模板、install.json 部署到：

```text
C:\Users\luo\.config\opencode\sf-user
```

这说明上一轮最严重的问题：

```text
installer 仍默认写 ~/.specforge
```

已经得到实测层面的缓解。

但要注意：这只能说明本轮阻断项通过，不能直接说明整个 SpecForge v1.1 已经 final complete。完整 v1.1 还需要端到端验收：

```text
WI → workflow_path → Candidate → Gate → User Decision → Merge Runner
→ post_merge_gate → code_permission → Write Guard
→ verification → evidence → changed_files_audit → close_gate
```

---

## 2. P0-1：installer 写 `~/.specforge`

### 2.1 单元测试结果

你执行：

```powershell
bun test scripts/tests/installer-no-legacy-write.test.ts
```

结果：

```text
9 pass
0 fail
10 expect() calls
Ran 9 tests across 1 file. [162.00ms]
```

覆盖项包括：

```text
resolveUserLevelDirectory() 不解析到 ~/.specforge
resolveUserLevelDirectory() 解析到 ~/.config/opencode
getSpecForgeUserDir 等价路径不指向 ~/.specforge
getSpecForgeUserDir 等价路径指向 ~/.config/opencode/sf-user/
install.json 不在 ~/.specforge 下
specforge-manifest.json 不在 ~/.specforge 下
lib/ 不在 ~/.specforge 下
templates/ 不在 ~/.specforge 下
package.json 不在 ~/.specforge 下
```

### 2.2 安装器实测输出

你执行：

```powershell
bun scripts/sf-installer.ts install
```

输出显示：

```text
目标目录: C:\Users\luo\.config\opencode
安装 C:\Users\luo\.config\opencode\sf-user 依赖（zod 等）
install.json 已写入: C:\Users\luo\.config\opencode\sf-user\install.json
模板库已部署到 C:\Users\luo\.config\opencode\sf-user\templates
目录: C:\Users\luo\.config\opencode
```

这证明安装器的主安装路径与私有数据路径已经脱离 `~/.specforge`。

### 2.3 判断

```text
P0-1 通过。
```

### 2.4 仍建议补充的验证

你原来执行的命令：

```powershell
find ~/.specforge -maxdepth 2 -type f -newer <整改前标记文件>
```

在 PowerShell 中会报错，因为 `<整改前标记文件>` 是占位符，且 `<` 在 PowerShell 中不是这样使用。

PowerShell 推荐写法：

```powershell
$marker = "D:\code\temp\SpecForge\before-install.marker"
New-Item -ItemType File -Path $marker -Force | Out-Null

# 执行安装
bun scripts/sf-installer.ts install

# 检查 ~/.specforge 中是否有比 marker 更新的文件
Get-ChildItem "$HOME\.specforge" -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -gt (Get-Item $marker).LastWriteTime } |
  Select-Object FullName, LastWriteTime
```

如果是在 Git Bash / WSL 中，可以这样写：

```bash
touch /tmp/specforge-before-install.marker
bun scripts/sf-installer.ts install
find ~/.specforge -maxdepth 2 -type f -newer /tmp/specforge-before-install.marker
```

预期结果：

```text
没有输出
```

如果有输出，说明安装过程仍然写了 legacy `~/.specforge`。

---

## 3. P0-3：PathPolicy 分裂

### 3.1 当前判断

本轮已修：

```text
directory-layout.ts 移除了 project/、work-items/、specs/ 无前缀匹配
旧函数加 @deprecated
Runtime PathPolicy 成为权限判断主入口
```

这解决了上一轮的核心问题：

```text
project/foo.md
work-items/WI-0001/foo.md
specs/WI-0001/foo.md
```

不应再被当作合法规格引用路径。

### 3.2 判断

```text
P0-3 基本通过。
```

### 3.3 后续建议

仍建议增加一个静态检查，禁止新代码继续使用 deprecated 入口：

```text
validatePathPolicy
isProjectSpecPath
isWorkItemPath
isLegacySpecPath
```

推荐做法：

```text
新增 lint / grep test：
生产代码不得 import 或调用 deprecated PathPolicy helpers。
```

---

## 4. P1：after-audit 只审计 shell

### 4.1 当前判断

本轮已修：

```text
after-audit 扩展为审计所有 write tools + side-effect tools
```

这符合 Write Guard 的设计目标：

```text
不只拦截 edit/write/bash；
formatter、generator、package manager、snapshot update、git 写入类命令也必须进入 changed_files_audit。
```

### 4.2 判断

```text
P1 通过。
```

### 4.3 后续建议

下一步要补端到端测试，而不是继续只看集合定义。

必须证明这些工具真的会触发：

```text
changedFilesAudit()
```

而不是只在代码里列了工具名。

---

## 5. 为什么安装时删除 `sf-evidence-collector.md` 和 `sf-investigator.md`

安装输出显示：

```text
清理 12 个旧版本残留文件:
✓ 已删除: agents\sf-evidence-collector.md
✓ 已删除: agents\sf-investigator.md
...
```

这个行为本身不一定是错误。

### 5.1 它为什么会删除

从安装器输出看，这是安装器的“旧版本残留文件清理”机制。

也就是说：

```text
当前版本 setup/userlevel-opencode/ 中不再包含这些文件，
但用户目录 C:\Users\luo\.config\opencode 中还残留旧版本文件，
安装器为了避免 OpenCode 继续加载旧 Agent / 旧 Tool，
主动把这些残留文件删除。
```

这是合理的。因为 OpenCode 会从用户级目录加载 agents/tools/plugins/skills，如果旧文件继续留在那里，就可能出现：

```text
仓库里已经删除旧 Agent
但 OpenCode 仍然能调用旧 Agent
```

这会破坏运行态一致性。

### 5.2 删除是否安全

要分两种情况判断。

#### 情况 A：这些 Agent 已经被新流程替代

如果 `sf-evidence-collector` 的职责已经合并到：

```text
sf_changed_files_audit
sf_verification_gate
evidence_manifest
verification_report
close_gate
```

如果 `sf-investigator` 的职责已经合并到：

```text
sf-orchestrator
sf-verifier
sf-gate-runner
diagnostic / audit 工具
```

那么删除是正确的。

因为旧 Agent 留在 OpenCode 用户目录里，反而会让 AI 走旧流程。

#### 情况 B：这些 Agent 仍是 v1.1 流程必须角色

如果当前标准或当前 Agent 协作链仍然依赖：

```text
sf-evidence-collector
sf-investigator
```

那删除就是问题。

这时不应该靠“安装器残留清理”解决，而应该把它们重新纳入：

```text
setup/userlevel-opencode/agents/
scripts/lib/registry
安装 manifest
测试用例
```

### 5.3 我的判断

从你当前安装器的表述看，它删除的是“旧版本残留文件”，不是删除源代码中的当前文件。

所以我的初步判断是：

```text
删除本身合理。
```

但要补一个确认动作：

```powershell
Get-ChildItem "D:\code\temp\SpecForge\setup\userlevel-opencode\agents" |
  Select-Object Name
```

确认当前分发源里是否已经没有：

```text
sf-evidence-collector.md
sf-investigator.md
```

如果源目录没有它们，安装器删除用户目录残留就是正确行为。

---

## 6. 当前状态评级

```text
installer legacy 清理：90 分
真实安装路径一致性：85 分
PathPolicy 统一性：80 分
after-audit 覆盖：80 分
bootstrap 记录：80 分
v1.1 端到端闭环：尚未验收
```

本轮状态：

```text
Round 2 remediation accepted
```

不能标记为：

```text
v1.1 final complete
production compliant
```

---

## 7. 下一步建议

不要继续围绕局部修补项反复改。

现在应该进入端到端验收。

至少跑 6 个场景：

```text
1. requirement_change_path：
   用户提出需求变化
   → WI
   → Candidate
   → Gate
   → User Decision
   → Merge
   → post_merge_gate
   → verification
   → close_gate

2. code_only_fast_path：
   不改需求设计
   → candidate_manifest.entries = []
   → merge_report.not_applicable
   → Write Guard
   → changed_files_audit
   → close_gate

3. 越界写入：
   Agent 修改 allowed_write_files 外文件
   → Write Guard 阻断
   → changed_files_audit 失败
   → close_gate 不通过

4. User Decision 失效：
   approved 后 Candidate 或 base_spec_version 变化
   → merge_ready_gate failed

5. Extension Subflow：
   缺少 design type
   → extension_request
   → sf-extension
   → extension_registry candidate
   → User Decision
   → Merge
   → 主流程恢复

6. legacy specs：
   读取 .specforge/specs/** 可以
   任何新写入必须失败
```

通过后可以标记：

```text
v1.1-bootstrap-e2e-complete
```

不要直接标记：

```text
v1.1-complete
```

除非端到端证据、测试输出、evidence_manifest、changed_files_audit、close_gate 全部闭环。

---

## 8. 给开发 Agent 的下一轮提示词

```text
本轮整改项已经通过复审。不要继续围绕 installer / PathPolicy / after-audit 做重复总结。

下一步进入 v1.1 端到端验收。

请设计并执行最少 6 个 E2E 场景：
1. requirement_change_path
2. code_only_fast_path
3. 越界写入
4. User Decision 失效
5. Extension Subflow
6. legacy specs read-only

每个场景必须输出：
- 输入请求
- 创建的 WI
- workflow_path
- 生成文件
- Gate 结果
- User Decision 结果
- Merge / not_applicable 结果
- Write Guard 结果
- changed_files_audit 结果
- verification_report
- evidence_manifest
- close_gate 结果
- 测试命令和输出

禁止只写说明。
必须有实际文件、实际命令、实际结果。

完成后不要直接声明 v1.1 complete。
只允许声明是否达到 v1.1-bootstrap-e2e-complete。
```

---

## 9. 最终判断

本轮三个阻断项已经基本解决。

你现在真正要攻的是：

```text
端到端闭环证明。
```

以前的问题是“运行态目录不一致”；现在这个问题基本过去了。

下一关是：

```text
SpecForge 是否真的能用自己的 v1.1 控制链跑完一次受控变更。
```
