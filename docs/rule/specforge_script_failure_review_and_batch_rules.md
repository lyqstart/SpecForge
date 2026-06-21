# SpecForge 批处理 / PowerShell 修复包错误复盘与后续强制规则

版本：v1.1  
日期：2026-06-21  
适用范围：以后所有涉及批处理、PowerShell、修复包、热修包、自动补丁脚本、部署脚本的对话与交付。

---

## 1. 复盘目的

本文件用于固化近期 SpecForge v1.2 治理过程中批处理 / PowerShell 修复包反复失败的问题分析。

以后每一轮只要涉及编写、修改、交付脚本，都必须先参考本文件，再设计脚本。不能继续用临时经验、脆弱正则、文本断言和理想路径脚本推进。

核心目标：

1. 防止脚本自身制造新问题；
2. 防止用脚本问题误判为产品问题；
3. 防止补丁没有真实验证就自动 commit / push / merge / tag；
4. 防止同类错误反复发生；
5. 保证每一轮修复都可重复执行、可恢复、可诊断。

---

## 2. 已发生的问题清单

### 2.1 补丁锚点不可靠，靠正则盲改源码

典型失败：

```text
Cannot find last_merged_targets assignment or spec_manifest write site.
```

问题表现：

脚本假设目标源码中一定存在某些结构，例如：

```text
last_merged_targets = ...
writeFileSync(... specManifest ...)
```

但真实源码 `merge-runner-v11.ts` 的结构与脚本假设不一致，导致脚本无法找到锚点。

本质问题：

没有先读取当前真实源码结构，没有确认目标函数和职责位置，就直接用通用正则补丁修改源码。

结论：

复杂源码修复不能靠猜测结构。脚本必须基于真实源码设计补丁。找不到锚点时必须停止，不能扩大正则继续赌。

---

### 2.2 文本断言代替真实编译验证

典型失败：

```text
hotfix test passed
workspace build failed
sf-artifact-write.ts TS1005
Unterminated template literal
```

问题表现：

测试只检查源码是否包含某些字符串：

```text
expect(text).toContain(...)
expect(text).not.toContain(...)
```

但没有在第一时间执行 TypeScript 编译。结果 TypeScript 语法已经损坏，文本测试仍然通过，直到 `workspace build` 才失败。

本质问题：

文本断言被当成了主验收，但文本断言只能证明“某段文字存在”，不能证明“代码语法正确、类型正确、系统可运行”。

结论：

以后文本断言只能作为辅助检查，不能替代：

```text
tsc
bun run test
bun run build
install/deployment consistency
```

---

### 2.3 插入代码本身不安全

问题表现：

PowerShell 脚本向 TypeScript 文件插入带有反引号、模板字符串、复杂正则的代码，最终破坏了 TypeScript 语法。

高风险组合：

```text
PowerShell here-string
TypeScript template literal
复杂正则替换
多行函数注入
```

本质问题：

脚本生成代码时没有把“转义、反引号、换行、正则边界、模板字符串”作为风险点处理。

结论：

以后插入 TypeScript 代码时：

1. 尽量避免 template literal；
2. 尽量用普通字符串拼接；
3. 尽量小范围函数级替换；
4. 替换后必须立即运行 TypeScript 编译；
5. 不允许只靠文本包含检查判断成功。

---

### 2.4 脚本自己污染 Git working tree

典型失败：

```text
?? .hotfix-backups/
```

问题表现：

脚本在仓库内创建：

```text
D:\code\temp\SpecForge\.hotfix-backups\
```

然后马上检查：

```text
git status --short
```

结果脚本自己创建的备份目录变成 untracked 文件，导致 clean check 失败。

本质问题：

脚本没有把自己的副作用纳入设计。它自己制造 dirty working tree，又要求 working tree clean。

结论：

备份目录必须放在仓库外，例如：

```text
D:\code\temp\SpecForge-hotfix-backups
```

或者放入系统临时目录。不得在仓库内生成未受控临时目录。

---

### 2.5 重置 / 恢复逻辑不完整

问题表现：

脚本失败后可能留下：

```text
hotfix 分支半修改状态
新增测试文件
新增报告文件
仓库内备份目录
telemetry.jsonl 修改
未跟踪文件
```

下一轮脚本如果只假设干净环境，就会被上一轮残留物卡住。

本质问题：

脚本只设计了成功路径，没有充分设计失败路径和重复运行路径。

结论：

每个修复包都必须考虑：

1. 上一轮失败残留；
2. 已存在 hotfix 分支；
3. 已存在半修改文件；
4. 未跟踪测试 / 报告文件；
5. telemetry / log 文件脏状态；
6. 如何备份、清理、恢复；
7. 重复运行是否安全。

---

### 2.6 过早自动 commit / push / merge / tag

问题表现：

脚本一旦局部测试通过，就自动执行：

```text
commit
push branch
merge main
push main
tag
push tag
```

但前面多次失败说明：局部文本测试通过并不代表补丁真实可用。

本质问题：

自动化发布动作过早，而前置验收不够强。

结论：

自动 commit / push / merge / tag 之前必须至少通过：

1. 目标包单测；
2. TypeScript 编译；
3. workspace build；
4. install/deployment consistency；
5. git diff 预期文件检查；
6. 没有仓库内临时文件；
7. 没有 telemetry/log 残留；
8. 报告生成；
9. live retest prompt 生成。

---

### 2.7 没有清晰区分脚本失败与产品缺陷

问题表现：

有些失败是产品逻辑缺陷，例如：

```text
candidate 写入 modules/core
candidate_manifest_gate 黑盒失败
merge_runner 不注册 modules[]
```

有些失败是脚本自身缺陷，例如：

```text
TypeScript 插入语法损坏
.hotfix-backups 污染 working tree
regex anchor 不匹配
文本测试不充分
```

本质问题：

没有在每次失败后先分类，而是直接继续生成下一轮脚本。

结论：

以后每次失败必须先分类：

```text
A. 产品缺陷：SpecForge 运行规则不符合设计；
B. 脚本缺陷：修复包自身写错；
C. 环境缺陷：working tree、进程、部署状态异常；
D. 验收缺陷：测试覆盖不够或测试逻辑错误。
```

只有分类清楚，才能决定是修产品、修脚本、清环境，还是补测试。

---

## 3. 根本原因总结

### 3.1 没有先读取真实源码结构

脚本补丁经常基于“我推测源码应该这么写”，而不是基于当前文件内容。

以后必须先确认：

1. 目标源码路径；
2. 目标函数名称；
3. 当前函数实际内容；
4. 职责边界；
5. 是否已有同职责函数；
6. 锚点是否唯一；
7. 如果锚点不存在，是否应停止。

---

### 3.2 过度依赖脆弱正则

正则适合简单替换，不适合复杂 TypeScript 函数重构。

以后正则只能用于：

1. 明确唯一的简单字符串替换；
2. 替换前后都有强校验；
3. 替换后立即编译；
4. 不跨多个复杂函数边界。

复杂修改优先采用：

1. 完整文件替换；
2. 精确 diff / patch；
3. 小函数级替换；
4. 先读取源码再生成专用补丁。

---

### 3.3 验收顺序错误

之前出现过“文本测试通过，build 失败”的情况，说明验收顺序不合理。

以后正确顺序是：

```text
1. 内容自检；
2. TypeScript 编译；
3. 目标包单测；
4. workspace build；
5. deployment consistency；
6. live retest prompt；
7. commit / push / merge / tag。
```

文本测试只能排在辅助位置，不能作为主验收。

---

### 3.4 没有把脚本自身当成被测试对象

脚本本身会：

1. 切分支；
2. 写文件；
3. 备份文件；
4. 清理现场；
5. 提交代码；
6. 推送远程；
7. 打 tag。

这些动作都会产生副作用。脚本自身也必须被设计、验证、复盘。

以后必须检查：

1. 脚本创建的文件是否污染 Git；
2. 脚本失败后是否可重复运行；
3. 脚本是否能处理上一轮残留；
4. 脚本的错误信息是否足够明确；
5. 脚本是否把备份放到仓库外；
6. 脚本是否只在强验收后才提交。

---

### 3.5 自动化成功路径设计过多，失败路径设计不足

以前脚本主要按“理想情况”设计：

```text
clean tree → patch → test → build → commit → merge → tag
```

但真实情况经常是：

```text
working tree 有 telemetry
上轮脚本有残留
目标源码结构变化
补丁锚点不存在
测试不充分
部分文件已经修改
tag 可能已存在
```

以后脚本必须默认环境不完美，必须有失败分支和恢复策略。

---

## 4. 以后必须遵守的脚本设计规则

### 4.1 脚本前必须做缺陷分类

每次脚本任务开始前，先判断：

```text
这是产品缺陷？
这是脚本缺陷？
这是环境缺陷？
这是验收缺陷？
```

分类不清楚时，不直接写脚本。

---

### 4.2 脚本前必须确认真实源码结构

必须确认：

1. 目标文件是否存在；
2. 目标函数是否存在；
3. 锚点是否唯一；
4. 修改点是否与职责一致；
5. 是否需要用户上传当前源码；
6. 是否应先生成 source-inspection 包。

如果不能确认，不允许写修改脚本。

---

### 4.3 不允许仓库内生成未跟踪临时文件

禁止：

```text
.repo/.hotfix-backups/
.repo/tmp/
.repo/backup/
```

推荐：

```text
D:\code\temp\SpecForge-hotfix-backups
%TEMP%\SpecForge-hotfix-backups
```

如果历史脚本已经生成仓库内备份目录，新脚本必须先安全移走。

---

### 4.4 必须先备份，再修改

备份要求：

1. 备份放仓库外；
2. 备份包含 `git diff`；
3. 备份包含 `git status --short`；
4. 备份文件名包含时间戳；
5. 失败时告诉用户备份路径。

---

### 4.5 必须可重复运行

脚本重复运行时应处理：

1. 分支已存在；
2. tag 已存在；
3. 上轮测试文件已存在；
4. 上轮报告已存在；
5. 上轮半补丁存在；
6. telemetry/log 脏文件存在；
7. live 项目旧现场存在。

不能要求用户手工清干净后才能运行，除非存在真实未提交业务改动。

---

### 4.6 正则替换必须有强约束

如果使用正则替换，必须满足：

1. 替换目标唯一；
2. 替换前检查锚点存在；
3. 替换后检查关键结构；
4. 替换次数必须符合预期；
5. 找不到锚点必须停止；
6. 不允许扩大正则继续猜。

---

### 4.7 插入代码必须降低转义风险

插入 TypeScript / Markdown / JSON 时：

1. 避免 TypeScript template literal；
2. 避免复杂 `$` / `${}`；
3. 避免多层转义；
4. 避免跨语言反引号混用；
5. 插入后立即编译；
6. 大段代码优先完整文件替换或专用 patch。

---

### 4.8 文本断言只能辅助，不能主验收

允许文本断言检查：

```text
某 helper 是否存在；
某旧硬编码是否不存在；
某报告是否生成；
某测试文件是否存在。
```

但最终必须通过：

```text
TypeScript 编译
单测
workspace build
install/deployment consistency
```

---

### 4.9 自动提交前必须强验收

自动 commit / push / merge / tag 前必须确认：

1. 新测试通过；
2. 相关回归测试通过；
3. workspace build 通过；
4. 部署一致性通过；
5. git diff 只包含预期文件；
6. 没有仓库内临时文件；
7. 没有 telemetry/log 残留；
8. 报告已生成；
9. live retest prompt 已生成。

---

### 4.10 失败输出必须标准化

失败必须输出：

```text
RESULT: FAILED
CAUSE: <真实原因>
NEXT ACTION: <下一步>
```

不能只输出 PowerShell 报错。

---

## 5. 每轮脚本任务强制自检清单

以后每一轮写批处理 / PowerShell / 修复包前，必须先执行以下自检：

```text
【脚本前自检】

1. 这次是产品缺陷、脚本缺陷、环境缺陷，还是验收缺陷？
2. 我是否已经知道目标源码真实路径和真实结构？
3. 是否已经确认目标函数 / 锚点存在且唯一？
4. 是否使用了脆弱正则？如果用了，替换边界是否足够小？
5. 备份目录是否在仓库外？
6. 脚本是否会污染 git status？
7. 是否先备份再修改？
8. 是否能处理上轮失败残留？
9. 是否能重复运行？
10. 是否会清理 telemetry/log 脏文件？
11. 是否有真实编译 / 测试 / build 验收？
12. 是否禁止用文本断言替代编译？
13. 自动 commit / merge / tag 之前是否有强验收？
14. 失败信息是否包含 RESULT / CAUSE / NEXT ACTION？
15. 是否生成 live retest prompt？
16. 是否把本轮失败原因转化为下一轮约束？
```

---

## 6. 当前任务的处理原则

当前最新失败：

```text
Cannot find last_merged_targets assignment or spec_manifest write site.
```

该失败属于：

```text
脚本缺陷 + 源码结构未确认
```

不是产品逻辑修复失败。

正确处理原则：

1. 不继续扩大正则；
2. 不继续猜 `merge-runner-v11.ts` 的结构；
3. 先查看真实源码；
4. 再做精确补丁；
5. 必要时要求上传当前文件：

```text
D:\code\temp\SpecForge\packages\daemon-core\src\tools\lib\merge-runner-v11.ts
```

也可以先生成 source-inspection 包，只收集并输出：

1. merge runner 文件路径；
2. spec_manifest 读取/写入位置；
3. last_merged_targets 写入位置；
4. project_spec_version 更新位置；
5. merge_report 生成位置；
6. 可安全插入 module registry 的位置。

在没有这些证据前，不应继续写修改脚本。

---

## 7. 固化规则

以后每次涉及脚本任务，我必须默认遵守本文件。

尤其必须避免以下重复错误：

```text
1. 不读真实源码就写 patch；
2. 用大正则盲改复杂函数；
3. 用文本断言替代编译；
4. 在仓库内生成备份目录；
5. 脚本自己污染 working tree；
6. 自动 commit/tag 前验收不足；
7. 失败后不区分产品缺陷和脚本缺陷；
8. 找不到锚点后继续猜。
```

本文件作为后续 SpecForge 脚本任务的强制前置规则。

---

## 8. 成功案例复盘：merge_runner module registry hotfix fix02

### 8.1 背景

在处理 `V12-LIVE-MERGE-MODULE-REGISTRY-001` 时，前一版修复包失败：

```text
RESULT: FAILED
CAUSE: Exact write-site anchor not found after helper insertion.
NEXT ACTION: Do not guess. Upload current merge-runner-v11.ts.
```

失败原因不是产品修复方向错误，而是脚本仍然使用了过长、过脆的源码锚点。

当时产品缺陷已经明确：

```text
sf_merge_run 已经把 .specforge/project/modules/todos/** 合并成功；
project_spec_version 已从 PSV-0001 升到 PSV-0002；
但 spec_manifest.json 的 modules[] 仍为空；
说明 merge_runner 写入了模块文件，却没有同步模块注册表。
```

该缺陷固定为：

```text
V12-LIVE-MERGE-MODULE-REGISTRY-001
```

---

### 8.2 fix02 为什么成功

fix02 成功的根本原因是：不再用猜测结构和长字符串锚点，而是基于真实源码结构做“短锚点 + 有界定位 + 真实运行测试”。

成功做法包括：

1. 先确认真实源码位置：

```text
packages/daemon-core/src/tools/lib/merge-runner-v11.ts
```

2. 先确认真实函数：

```text
export async function executeMerge
```

3. 先确认真实职责：

```text
executeMerge() 负责读取 candidate_manifest；
复制 candidate 到 .specforge/project/**；
更新 spec_manifest.project_spec_version；
更新 specManifest.last_merged_targets；
写回 spec_manifest.json；
生成 merge_report.md。
```

4. 不再使用整段精确字符串：

```text
specManifest.last_merged_targets = result.merged_files .filter(...).map(...); await fs.mkdir(...)
```

这种锚点对空格、换行、压缩格式极敏感，实际源码稍有变化就失败。

5. 改用短锚点、有界定位：

```text
export async function executeMerge
specManifest.last_merged_targets
await fs.writeFile(projectSpecManifestPath
```

6. 插入位置清晰：

```text
在 executeMerge 前插入 helper；
在 specManifest.last_merged_targets 之后、fs.writeFile(projectSpecManifestPath...) 之前插入：
registerMergedProjectModulesV12(specManifest);
```

7. 不再用“文本包含测试”作为主验收，而是增加真实 `executeMerge()` 测试：

```text
创建临时项目；
写 spec_manifest.json；
写 candidate_manifest.json；
写 user_decision.json；
写 gate_summary 和 gate json；
调用 executeMerge()；
断言 project_spec_version = PSV-0002；
断言 spec_manifest.modules[] 包含 MOD-TODOS。
```

8. 成功后再执行：

```text
相关回归测试；
workspace build；
install/deployment consistency；
commit；
push；
merge main；
tag。
```

---

### 8.3 fix02 与前几版失败的关键区别

| 对比项 | 失败版本 | fix02 成功版本 |
|---|---|---|
| 源码依据 | 推测源码结构 | 基于 GitHub / 本地同步后的真实源码结构 |
| 锚点策略 | 长字符串精确锚点 | 短锚点 + 有界定位 |
| 失败策略 | 找不到锚点后继续改脚本猜 | 找不到锚点就停止，并要求确认真实源码 |
| 修改范围 | 容易跨大段替换 | 只在明确位置插入 helper 和调用 |
| 验收方式 | 文本断言偏多 | 真实调用 `executeMerge()` |
| 发布前验证 | 局部验证不够 | 测试 + build + 部署一致性 |
| 脚本副作用 | 曾污染 working tree | 备份在仓库外，避免污染 Git |
| 可重复运行 | 对失败残留考虑不足 | 支持已有分支 reset、外部备份、重新执行 |

---

### 8.4 这次成功说明了什么

这次成功证明：

1. 复杂 TypeScript 补丁不能靠猜；
2. 长字符串锚点不可靠；
3. 源码压缩成一行时，整段匹配非常脆弱；
4. 短锚点必须来自真实源码；
5. 短锚点之间要有顺序约束，不能全文件乱找；
6. 插入点必须与业务职责一致；
7. 真实函数调用测试比文本断言更可信；
8. 自动 commit / push / merge / tag 必须放在强验收之后。

---

### 8.5 后续脚本必须吸收的成功经验

以后类似脚本必须遵守以下新增规则。

#### 8.5.1 优先使用“短锚点 + 有界定位”

禁止优先使用长段源码作为锚点。

推荐形式：

```text
先找函数起点；
再找目标赋值点；
再找目标写入点；
确认顺序为：函数起点 < 赋值点 < 写入点；
只在这个有界区间内插入代码。
```

例如：

```text
executeMerge 起点
→ specManifest.last_merged_targets
→ await fs.writeFile(projectSpecManifestPath
```

#### 8.5.2 锚点必须来自真实源码

锚点不能来自“我以为源码应该这样写”。

锚点来源必须是：

1. 用户上传源码；
2. 本地源码检查报告；
3. GitHub 当前分支源码；
4. 已确认与本地同步的远程源码。

#### 8.5.3 找不到锚点必须停止

找不到锚点时，不能继续扩大正则或猜测。

必须输出：

```text
RESULT: FAILED
CAUSE: Source shape mismatch: <具体锚点> not found.
NEXT ACTION: Upload current source or run source inspection.
```

#### 8.5.4 真实运行测试优先于文本测试

只要目标函数可被调用，就必须写真实运行测试。

例如本次 `executeMerge()` 修复，正确测试不是检查源码里有没有 `registerMergedProjectModulesV12`，而是：

```text
真的创建临时 WI；
真的调用 executeMerge()；
真的读取 spec_manifest.json；
真的断言 modules[] 出现 todos。
```

#### 8.5.5 自动发布前必须验证业务效果

不能只验证“脚本插入成功”。

必须验证“业务结果出现”。

本次业务结果是：

```text
spec_manifest.modules[] 包含：
module_id = MOD-TODOS
name = todos
requirements_file = project/modules/todos/requirements.md
design_file = project/modules/todos/design.md
```

---

### 8.6 新增强制规则：成功经验版脚本设计流程

以后写修复脚本，应按下面流程：

```text
1. 缺陷分类：
   产品缺陷 / 脚本缺陷 / 环境缺陷 / 验收缺陷。

2. 源码确认：
   确认目标文件、目标函数、目标职责。

3. 锚点设计：
   使用真实源码中的短锚点；
   确认锚点顺序；
   避免长字符串整段匹配。

4. 插入策略：
   helper 插入到函数前；
   调用插入到明确业务动作之前或之后；
   插入点必须与职责一致。

5. 验证策略：
   优先真实函数调用测试；
   文本断言只做辅助；
   必须跑 build 和部署一致性。

6. Git 策略：
   备份在仓库外；
   处理已有分支；
   检查 working tree；
   只有强验收通过才 commit / push / merge / tag。

7. 失败策略：
   找不到锚点立即停止；
   输出 RESULT / CAUSE / NEXT ACTION；
   不扩大正则继续猜。
```

---

### 8.7 本次成功经验的固定结论

本次成功经验可以压缩成一句话：

```text
复杂补丁必须基于真实源码，用短锚点有界定位，用真实运行测试证明业务效果，强验收通过后再自动发布。
```

以后每一轮写批处理 / PowerShell / 修复包，都必须把这句话作为前置原则。

