---
inclusion: always
---

# V6.0 开发工作流（AI 必读）

**项目特征**：SpecForge V6 是多 spec 并行开发，有明确的 P0/P1/P2 范围、Wave 调度、Checkpoint 规则和 Correctness Property 归属。

**要求**：必须用中文反馈

## 已知工具 bug（关键，AI 必读）

Kiro 内置的 `task_update` 工具在 Windows 上存在 `EPERM: rename` bug——其 `writeFile(tmp) → rename(tmp, target)` 模式与 Kiro 扩展主机自身的 fs watcher 句柄竞态，每次调用都会失败。**清空 Defender 排除、SearchIndexer 排除、重试均无效**，因为凶手是同进程内的句柄占用。

**同源 bug**：`update_pbt_status`（PBT 状态回写工具）也被这个 bug 打中——它写的是 `<repo>/.kiro/specs/<spec>/tasks.meta.json` 顶层的 `pbtResults[taskId]`，同样走 VS Code workspace fs + rename 链，报错文案是 `Error(s) while updating property test status`。

**替代方案**：本仓库已实现 `scripts/sync-task-status.ts`（基于 bun + `proper-lockfile`，用 `copyFile + unlink` 绕开 rename），能安全读写：
- Kiro 的 `~/.kiro/tasks/<hash>/<spec>.meta.json`（executionStatus）
- spec 侧的 `.kiro/specs/<spec>/tasks.meta.json`（pbtResults）
- 各 spec 的 `tasks.md` checkbox

完整文档见 `docs/tools/sync-task-status.md`。

**规则**：
- ✅ AI **必须**用 `bun run scripts/sync-task-status.ts set ...` 而不是 `task_update` 来更新任务状态
- ✅ AI **必须**用 `bun run scripts/sync-task-status.ts set-pbt <spec> <taskId> <passed|failed|unexpected_pass> [--failing=...]` 而不是 `update_pbt_status` 来记录 PBT 结果
- ✅ `task_list` / `task_get` 仍可用于只读（它们从同一份 meta.json 读取）
- ❌ 禁止在 Windows 上调用 `task_update`（会失败，浪费回合）
- ❌ 禁止调用 `update_pbt_status`（同一 bug，用 `set-pbt` 替代；若误调并看到 `Error(s) while updating property test status`，立刻切到 `set-pbt` 重试）
- ❌ 禁止手动改 `tasks.md` 的 checkbox（用脚本，有一致性保护）
- ❌ 禁止把 `.kiro/specs/**/tasks.meta.json` 提交进 git（已在 `.gitignore` 屏蔽；它是运行时 PBT 状态，不是源真相）

## 智谱模型名称规范（AI 必读）

**智谱（Zhipu AI）的 provider 名称是 `zhipu-coding-plan`，不是 `zai-coding-plan`**。

- ✅ 正确：`zhipu-coding-plan/glm-5.1`
- ❌ 错误：`zai-coding-plan/glm-5.1`

在修改用户级 OpenCode 配置（`~/.config/opencode/opencode.json` 或 `~/.opencode/opencode.json`）时，**禁止**把 `zhipu-coding-plan` 改成 `zai-coding-plan`。

如果安装/升级脚本错误地修改了用户配置，AI 应提醒用户手动修正为正确的名称。

## 三份权威文档

开发相关提问/任务开工前，**必须按以下顺序阅读**：

1. `.kiro/specs/v6-architecture-overview/artifacts/PROGRESS.md` — **驾驶舱**，当前 Wave、活跃 spec、上次会话摘要
2. `.kiro/specs/v6-architecture-overview/artifacts/development-roadmap.md` — Wave 划分与依赖 DAG
3. 用户本次想动的 spec 的 `tasks.md` — 实际任务

**除非用户明确说"跳过进度检查"**，否则 AI 必须先读 PROGRESS.md 再动手。

## 用户提示词约定（识别意图）

| 用户说 | AI 该做什么 |
|---|---|
| `继续开发` / `继续` / `接着做` / `开始执行` | 走下面"『继续开发』标准流程"，按"并发自动伸缩档位"（见后文）跑跨 spec × 单 spec 内的两级并行循环，**每 10 个任务汇报一次进度但不停下**，自动持续直到 Wave 退出/连续报错降到 L1 仍卡住/用户中断 |
| `继续 <spec-name>` | 同上，但只推进指定 spec（单 spec 模式时档位上限 L2 = 3 路） |
| `进入 Wave <N>` / `切到 W<N>` | 先运行 `check-checkpoint`；通过才更新 PROGRESS.md"当前 Wave"并启动 W<N> |
| `查看进度` / `汇报进度` | 只读 PROGRESS.md + `bun run scripts/sync-task-status.ts list`，不动代码 |
| `检查 Checkpoint` | 读 PROGRESS.md 的 Checkpoint 速查表，对当前 Wave 逐项核对；结果写回"已完成 Checkpoint"区 |
| `整合/同步进度` / `对齐进度` | 运行 `bun run scripts/sync-task-status.ts verify --all`，有漂移时按 tasks.md 为真值反向同步（`sync --from=tasksmd --apply`），再更新 PROGRESS.md |
| `查看失败` / `列出 failed` / `失败任务` | 跑 `bun run scripts/sync-task-status.ts list`，过滤 `failed > 0` 的 spec，按 spec 列出每条 failed 任务的 taskId 和（如有）失败原因；不动状态，等用户指示重试/跳过/修 spec |
| `沉淀经验：<错误描述>` / `总结根因：<错误>` | 按 `docs/engineering-lessons/ARCHITECTURE.md` §3 "任务流程：沉淀新经验" 完整执行：搜重复 → 5 Whys 根因分析 → 决策树判断处理方式（新建/合并/supersedes/跳过）→ 写文件 → 跑 PR checklist → 跑适配器 → 报告结果。重复处理见 §3.3 决策树。 |
| `跑 Property <N>` | 找到承接该 Property 的 spec，跑对应 PBT；结果写入驾驶舱 Checkpoint 区 |
| `只更新 PROGRESS.md` | 不动代码，只同步驾驶舱数字到当前真值 |
| `跳过进度检查` / `跳过驾驶舱` | 本次不读 PROGRESS.md，直接执行后续指令（应急用） |

## "继续开发"标准流程

收到 `继续开发` / `继续` / `接着做` / `开始执行` 时，AI 必须按下列顺序：

1. **读驾驶舱**：`PROGRESS.md` → 拿到当前 Wave、活跃 spec、"下次入口"
2. **读路线图**：`development-roadmap.md` → 确认当前 Wave 还没退出、哪些 spec 可并行
3. **体检**：`bun run scripts/sync-task-status.ts verify --all`
   - 有 `upgradable` 漂移 → 先 `sync --from=meta --apply` 修掉再开工
   - 有 `mismatch` 漂移 → 报告用户确认（tasks.md 和 meta 都可能是真值）
   - 跑一次 `sync --all --from=tasksmd --apply` 清理任何残留 in_progress 孤儿
3a. **failed 必报（2026-05-16 新增，AI 必读）**：体检后立刻跑 `bun run scripts/sync-task-status.ts list`，扫描所有 spec 的 `failed` 列：
   - **全 0** → 输出"无 failed 任务，可开工"，进入 step 4
   - **任一 spec failed > 0** → **必须停下**，按 spec 列出每条 failed 任务（spec/taskId/failed 时间戳/已知失败原因），用 `user_input` 让用户三选一：
     1. 全部重派（`set ... not_started`）
     2. 逐条决定（重派/跳过/暂停）
     3. 跳过本次失败（保留 failed 状态，本轮不动）
   - 不允许在有未处理 failed 任务时直接进入 step 4 派单
4. **构造 ready 任务池**（**两级并行核心**）：
   - 顶层（跨 spec）：列出当前 Wave 内所有活跃 spec
   - 内层（单 spec）：对每个 spec，**直接读 tasks.md 的 wave/DAG 标注或 task_list 输出**，把所有"依赖已满足"的任务都收进池
   - 池的目标尺寸 = 当前档位的并发数（见下文档位规则）
**5.0 派单计划硬约束（2026-05-16 新增，AI 必读）**：

派 sub-agent 之前的【最后一个回合】**必须**先输出一行明确的派单计划，格式严格如下：

```
派单计划（档位 L<N>，本回合派 <N> 路并行）：
1. (<spec>, <taskId>) — <一句话目的>
2. (<spec>, <taskId>) — <一句话目的>
...
```

**约束**：
- 这一行【必须】出现，否则下一步派单视为违规
- 计划行数 **必须** = 当前档位数（L3=6, L4=10, L2=3, L1=1），不允许"派 1-2 路试试"
- 输出计划后，【下一个回合】只允许调 `invoke_sub_agent`，**不允许**再调 `task_update` / `sync-task-status set` / 文件读写
- 把准备阶段（list/verify/grep）和派单阶段彻底切开——准备阶段在前 N 回合做完，派单阶段就一个回合

**为什么强制**：之前出现过"已经准备好了但又多花 3 个回合做无用功，最后只标 in_progress 没派单"的退化模式。强制写出计划 + 限定下一回合只派单，让退化模式无处藏身。

5. **派 subagent（同一回合并发）**：执行上一步的派单计划，**在同一回合内一次性发起多个 `invoke_sub_agent`**（不要串行排队）。优先级：关键路径 > 阻塞下游的任务 > 其他。
   - **不要**在 invoke_sub_agent 前先标 in_progress（违反防孤儿规则 #1）
   - **每个 invoke_sub_agent 调用必须按"派单标准流程"**（见下文）：先跑 `render-prompt-block.ts` 拿硬规则，拼到 prompt 顶部，再派单。极简任务可省略（见例外）。
6. **同步状态**：每个 subagent 交付完成后立刻 `bun run scripts/sync-task-status.ts set <spec> <taskId> completed`，失败的不动状态
7. **本轮统计 + 档位升降**：
   - 数本轮 N 个 subagent 中有多少成功、多少平台错（"Invalid model ID" / "BAD_DECRYPT" 等）
   - 按"并发自动伸缩档位"调整下一轮档位
8. **每 10 个累计完成任务汇报一次**：用一行简报告知用户（当前 Wave、本批完成、累计、当前档位、连续成功/失败计数），但**不停下**继续循环
9. **循环**：回到 step 4，直到下列任意硬停条件触发：
   - 当前 Wave 任务全部完成 → 跑 Checkpoint 检查，通过才切 Wave（此时停下等用户授权切 Wave）
   - 在 L1 档连续 ≥3 轮全失败（平台层重大故障）→ 停下报告
   - sub-agent 报告任务实际失败（非平台错，是代码/测试错）→ 停下报告，不自动重试
   - 测试卡死触发 OS 级 timeout（参见"派单地雷区警告"）→ 停下报告
   - 用户中断
10. **收尾**：更新 PROGRESS.md 的"活跃 Spec"表、"上次会话摘要"、"变更日志"

用户没说"跳过"时，上述每一步都不得省略。

## 并发自动伸缩档位（2026-05-16 新增，AI 必读）

**目的**：在平台稳定时跑高速，遇到 `invoke_sub_agent` 平台层抽风（"Invalid model ID" / "BAD_DECRYPT"）自动降级，恢复后**自动升档**回到高速，不需要用户每次提醒。

### 档位定义

| 档位 | 并发数 | 含义 |
|------|--------|------|
| **L1（串行）** | 1 路 | 平台严重不稳定时的保命档 |
| **L2（保守）** | 3 路 | 单 spec 续接 / 平台一般不稳时 |
| **L3（标准）** | 6 路 | 默认起步：跨 5 spec × 1 任务 + 1 备用 |
| **L4（高速）** | 10 路 | 跨 5 spec × 2 任务，平台稳定时全速 |

### 升降级规则

**起步档**：每次进入"继续开发"流程默认从 **L3** 开始。

**降级**（错误优先，立即生效）：
- 一轮内任一 sub-agent 报"Invalid model ID" / "BAD_DECRYPT" / 类似平台错 → 当场降一档（L4→L3，L3→L2，L2→L1）
- 在 L1 仍报错 → 留在 L1，但记录"连续失败计数"
- 任一升级所需的"连续成功计数"清零

**升级**（保守，证据优先）：
- 维护两个计数器：`consecutiveSuccess`（无任何错误的轮数）和 `roundsAtCurrentLevel`
- 连续 3 轮零错误 → 升一档（L1→L2，L2→L3，L3→L4）
- 连续 5 轮零错误（且当前档 ≤ L2）→ **跳档**直接升到 L3（避免长期窝在低档）
- 升档后 `consecutiveSuccess` 清零重新计

**硬停条件**（不再升降，停下报用户）：
- L1 档连续 3 轮全失败 → 平台层重大故障，停下
- 一轮内有 sub-agent 报告任务真实失败（非平台错）→ 停下

### 状态在哪里维护

档位状态**只在当前会话内**维护（不持久化），格式：

```
当前档位：L3
连续成功：2 轮
本档累计：5 轮
本会话累计完成任务：47
本会话累计 failed：2（plugin-loader 1.3.4, scope-gate 16.2）
```

每 10 个任务汇报里要带这五行。**新会话默认从 L3 重启**（前一会话的档位状态不带过来）。

**failed 行规则**：
- 计数对象是 sub-agent 返回 `failed` 状态的真实失败（不是 `Invalid model ID`/`BAD_DECRYPT` 这类平台错——平台错不计 failed）
- 列出最多 3 条 spec/taskId，超过 3 条用"… 共 N 条"省略
- 计数 ≥1 时**必须**在汇报后立刻调用 step 9 的"sub-agent 报告任务真实失败 → 停下报告"硬停条件，不能继续滚动派单

### 单 spec 续接模式

当用户说 `继续 <spec-name>` 时，跨 spec 并行不可用，档位上限锁定 **L2（3 路）**——因为单 spec 内同 wave 可并行任务数本来就有限。规则同上，只是 L4/L3 不可达。

## 开发执行规则

### 1. 单 spec 内
- 更新任务状态**必须**用 `bun run scripts/sync-task-status.ts`（set / batch / sync），**禁止**用 Kiro 内置 `task_update`
- 只读查询（ready 任务清单、任务详情）可以继续用 `task_list` / `task_get`
- 优先处理 `ready` 状态任务（依赖已满足）
- 每个 spec 的 tasks.md 底部有 `Task Dependency Graph` 或 waves 标注 — 同 wave 任务并行 dispatch

### 2. 跨 spec 并行
- 同一 Wave 内的 spec 可以并行推进，但**不要跨 Wave 取任务**
- 并行时在**同一个回合**调多个 subagent（不是串行排队）
- 关键路径（当前：`daemon-core`）永远最优先

### 3. Wave 切换
禁止在未验证 Checkpoint 的情况下进入下一 Wave。切换流程：
1. 运行 `.kiro/specs/v6-architecture-overview/artifacts/cp_allocation_verifier.ts` 检查 Property 覆盖率
2. 对照 PROGRESS.md 的 Checkpoint 速查表逐项勾选
3. 全部通过 → 更新 PROGRESS.md "当前 Wave" 字段 + 加一行变更日志
4. 未全过 → 报告阻塞项，不前进

### 4. 会话结束时
每次会话结束前，**主动**更新 PROGRESS.md 的：
- "活跃 Spec" 表：任务数和完成数（用 `bun run scripts/sync-task-status.ts list` 拉 summary）
- "上次会话摘要" 段：所做、阻塞、下次入口
- "变更日志" 段：日期 + 一句话

这让下次会话能秒接上。

### 5. 修改任何持久化文件
任何 JSON/YAML 持久化文件必须带 `schema_version` 字段（REQ-18；Property 14）。新增时默认 `"1.0"`。

## 承接 Correctness Property 的规矩

每个下游 spec 承接若干 Property（见 `correctness-property-allocation.json`）：

- 每条 Property 的 PBT 必须在对应 spec 的 `tests/` 目录下
- 测试文件名建议 `{module}-property-{n}.property.test.ts`
- 测试说明必须标注：`Feature: {module}, Property {n}: {text}; Derived-From: v6-architecture-overview Property {n}`
- 用 `fast-check` 写；迭代次数：普通 ≥ 100，安全关键（3/7/9/24）≥ 1000

## 不做边界（拒绝范围蔓延）

当用户请求涉及以下内容，先劝阻并引用 REQ-25 的 P1/P2 清单：
- **P1** 能力（15 项）：bugfix workflow、design-first workflow、Knowledge Graph、跨会话续接、用户自定义 Tool/Skill 的正式发版、workflow 数据驱动、Gate 组合等
- **P2** 能力：多模态完整支持、自愈完整闭环、V3.6 四 workflow、插件沙箱运行时、多机同步、Web UI

如用户坚持要做，先把它放进 REQ-25 的对应列表（需改父规范），再按 scope-gate 规则启用 feature flag。

## 禁止事项

- ❌ **不**调用 Kiro 内置 `task_update`（在 Windows 上必报 EPERM；用 `scripts/sync-task-status.ts` 替代）
- ❌ 不手动编辑 `tasks.md` 的 checkbox（用 `sync-task-status.ts set` 或 `sync --apply`）
- ❌ 不跨 Wave 预取任务
- ❌ 不修改 `correctness-property-allocation.json` 中某条 Property 的 `owners` 字段（除非用户明确要求重分派）
- ❌ 不在 V6.0 分支实现 P1/P2 能力的用户可见路径
- ❌ 不绕过 `sf_v6_arch_check` 工具提交架构变更
- ❌ **不**在 `invoke_sub_agent` 之前先标 `in_progress`（防孤儿规则 #1，见下）

## 防孤儿规则（2026-05-16 新增，AI 必读）

**背景**：`invoke_sub_agent` 存在平台层偶发失败（"Invalid model ID"、"BAD_DECRYPT"），如果先标 in_progress 再派单，失败后会留下"meta=running 但无人在跑"的孤儿状态，verify --all 无法检测。

**规则 1：不提前标 in_progress**
- 派单流程：直接 `invoke_sub_agent` → 等结果 → 成功后 `set ... completed`
- 失败时不动状态（保持 `not_started`），零孤儿
- sub-agent 自己结尾会 `set ... completed`，orchestrator 只做冗余确认

**规则 2：每次会话开工先扫孤儿**
- 在"继续开发"标准流程 step 3（体检）中增加：
  ```bash
  bun run scripts/sync-task-status.ts sync <spec|--all> --from=tasksmd --apply
  ```
- 这会把 meta 中残留的 running/in_progress 回退到 tasks.md 的真值（通常是 `[ ]`）

**规则 3：批量派单尺寸 = 当前档位**
- 派单数量**统一由"并发自动伸缩档位"决定**（L1=1, L2=3, L3=6, L4=10），见前文"并发自动伸缩档位"小节
- 进入流程默认 L3，不再是固定 2 个起步
- 升降规则参见档位小节，**降级立即、升级保守**：错误立刻降一档、连续 3 轮零错升一档、连续 5 轮零错且 ≤L2 跳到 L3
- L1 连续 3 轮全失败为硬停信号，不要继续盲目重试

**规则 4：信任 sub-agent 自报，不信任 orchestrator 调度回执**
- 派完一批后，先跑 `verify --all` 看 meta 真值
- 如果 meta=completed 但 invoke 报错 → 任务实际已完成，sync 到 tasks.md 即可
- 如果 meta 仍是 not_started → 任务确实没跑，重新派单

**规则 5：清理孤儿的标准命令**
```bash
# 把 meta 中残留的 running 状态回退到 tasks.md 真值
bun run scripts/sync-task-status.ts sync <spec> --from=tasksmd --apply
# 或全局
bun run scripts/sync-task-status.ts sync --all --from=tasksmd --apply
```

## 派单地雷区警告（2026-05-16 新增，AI 必读）

**背景**：`invoke_sub_agent` 调用 sub-agent 后，sub-agent 可能在子进程中跑测试。如果被测包里有未修干净的异步资源泄漏（违反 async-resource-coding-standards.md 的 A1/A2/A3），`bun test` 进程会无法退出，由于 `execute_pwsh` 默认无 hard timeout，可能卡死整个 orchestrator 数小时（实际事故见 docs/engineering-lessons/async-resource-lifecycle.md）。

**规则 1：派单 prompt 必须列已知地雷区**

派 sub-agent 给某个包做任何"会跑测试"的任务前，orchestrator 必须先：
1. 用 grep 检查该包源码 + 测试中的违规模式：
   - `Promise\.race` 后是否有 finally + clearTimeout（A1）
   - `while` 循环是否依赖外部信号且无超时兜底（A2）
   - `setTimeout` + 轮询模式（A3）
2. 如果有违规存量，**必须**在 prompt 里明确写出："警告：本包 src/foo.ts:NN 存在 Promise.race 未清理 timer 的问题，跑测试可能导致进程不退出。请用 PowerShell `Start-Job + Wait-Job -Timeout 90` 包裹任何 `bun test` 命令。"

**规则 2：跑命令必须有 OS 级 hard timeout**

任何可能调用 `bun test` 的 `execute_pwsh` 调用，必须用以下模板包裹：
```powershell
$job = Start-Job -ScriptBlock { Set-Location $using:PWD; bun test <文件路径> 2>&1 }
if (Wait-Job $job -Timeout 90) {
  Receive-Job $job
  Remove-Job $job
} else {
  Stop-Job $job
  Receive-Job $job
  Remove-Job $job -Force
  Write-Host "STILL_HUNG_AFTER_90s"
  exit 1
}
```

**禁止**：
- ❌ 直接 `bun test ...` 不带 timeout 包裹（会卡死 orchestrator）
- ❌ 派单 prompt 不带地雷区警告就让 sub-agent 在已知违规包里跑测试

**绿色信号**：当某个包通过审查（无违规存量），可以在 PROGRESS.md 的活跃 Spec 表"备注"列加 `[async-clean]` 标记，后续派单可省略警告（但 OS 级 timeout 仍建议保留）。

## 派单标准流程（2026-05-16 新增，AI 必读）

**背景**：实测确认 sub-agent 能看到 `.kiro/steering/lessons-injected.md`（见 `docs/engineering-lessons/ARCHITECTURE.md §11.4`），但 LLM 注意力分配下"看到 ≠ 重视"——历史上 cd 错误反复出现就是证据。解法：派单 prompt 顶部明文重复关键硬规则（双重曝光），比仅靠 steering 静默注入有效得多。

**适用范围**：所有 `invoke_sub_agent` 调用，无论 sub-agent 类型（spec-task-execution / general-task-execution / 其他）。

### 步骤 1：根据任务类型选 role 和 tags

| 任务类型 | role | tags |
|----------|------|------|
| 写代码、跑测试、跑构建 | `executor` | 视任务涉及的领域选：`shell` / `testing` / `async` / `command-execution` 等 |
| 调度、监控、状态管理 | `orchestrator` | `scheduling` / `error-handling` 等 |
| 代码审查 | `reviewer` | 视审查重点选 |
| 排障、根因分析 | `debugger` | 视错误类型选 |
| 架构设计、组件边界 | `architect` | `architecture` |

不确定时优先选 `executor`（最常见角色）。

### 步骤 2：跑 prompt-block 适配器

```bash
bun run scripts/lessons/render-prompt-block.ts --role=<role> --tags=<tag1,tag2>
```

例：派 sub-agent 干 cli 包的命令执行类任务：
```bash
bun run scripts/lessons/render-prompt-block.ts --role=executor --tags=shell,command-execution
```

输出形如：
```
## ⚠️ 必读硬规则（违反将导致任务失败）

1. [HIGH] Kiro execute_pwsh 受控壳的硬约束 (来源: kiro-execute-pwsh-constraints)
2. [HIGH] 异步资源生命周期管理经验总结 (来源: async-resource-lifecycle)
```

### 步骤 3：拼到派单 prompt 的最顶部

派单 prompt 结构应该是：

```
## ⚠️ 必读硬规则（违反将导致任务失败）
[prompt-block 输出的硬规则列表]

---

[正常的任务描述：spec/taskId、任务内容、要求、输出]
```

硬规则段**必须在最顶部**，让 sub-agent 一打开就看到（首因效应对 LLM 注意力最有利）。

### 步骤 4：调用 invoke_sub_agent

传完整 prompt（硬规则段 + 任务描述）。

### 例外情况

满足以下**任一**条件可省略步骤 2-3：

1. **任务极简**：纯读取信息（如"列出 X 目录所有文件"），不涉及任何 high severity 经验
2. **当前过滤无匹配**：跑 `render-prompt-block` 输出"（当前过滤条件下无相关经验）"
3. **派单地雷区警告已包含同类内容**：当任务命中"派单地雷区警告"小节的强制 prompt 模板（如 `Start-Job + Wait-Job` 包裹），且模板已包含相关硬规则时，可不重复

**禁止**：图省事跳过步骤 2-3 直接派单。这样 sub-agent 只能靠 steering 注入，违反 high severity 规则的概率显著上升。

### 与"派单地雷区警告"的关系

| 警告类型 | 适用范围 | 来源 |
|----------|----------|------|
| **派单地雷区警告**（前一节） | 已知违规包跑测试时的 OS 级 timeout | 项目特定（async-resource 事故） |
| **派单标准流程**（本节） | 所有派单的硬规则注入 | 经验库（lessons-injected.md） |

两者**互补不冲突**：地雷区警告是针对特定场景的强制 prompt 模板；派单标准流程是通用的硬规则注入机制。一个任务可能同时触发两者——派单 prompt 应该**先放硬规则，后放地雷区警告**。

## failed 任务处理规则（2026-05-16 新增，AI 必读）

**背景**：`failed` 状态意味着 sub-agent 实际启动了但任务跑挂了（编译错、测试不通过、需求理解错等真实失败），不同于 `Invalid model ID`/`BAD_DECRYPT` 这类**平台错**（平台错不写 meta，任务仍是 `not_started`，下一轮自然重派；failed 是真实失败，必须人工决策才能继续）。

防止 failed 任务被静默忽略，定义三条强制规则：

### 规则 F1：开工前必报（对应 step 3a）

每次进入"继续开发"流程的体检阶段，跑完 verify 后必须：
1. 跑 `bun run scripts/sync-task-status.ts list`
2. 扫所有 spec 的 `failed` 列
3. 任一 spec `failed > 0` → **停下**，按 spec/taskId 列出，调 `user_input` 让用户三选一（全部重派 / 逐条决定 / 跳过）
4. 全 0 才进入 step 4

**禁止**：在有未处理 failed 任务时直接派新任务（容易让用户忘记 failed 任务的存在）。

### 规则 F2：滚动派单中带 failed 行（对应 step 8）

每 10 个完成任务的汇报必须 5 行（不是 4 行）：

```
当前档位：L3
连续成功：2 轮
本档累计：5 轮
本会话累计完成任务：47
本会话累计 failed：2（plugin-loader 1.3.4, scope-gate 16.2）
```

`failed = 0` 时也要写出来（写"0"），让用户对 failed 数有持续可见性。

### 规则 F3：单任务 failed 立刻打断（对应 step 9）

sub-agent 返回 `failed` 状态的瞬间：
1. **不自动重试**（避免撞同一堵墙）
2. 立刻停下当前派单循环
3. 报告：sub-agent 错误信息 + 失败的 spec/taskId
4. 调 `user_input` 让用户三选一：
   - **重试**（`set ... not_started` 让下一轮自然重派）
   - **跳过**（`set ... aborted`，记录原因到 PROGRESS.md 的"Blocked / 开放问题"区）
   - **暂停修 spec**（停下整个会话，等用户修完 tasks.md 再 `开始执行`）
5. 用户作选择前不再派新任务

**唯一例外**：bugfix workflow 的 Task 1 "Write bug condition exploration property test"——这类任务**预期失败**（失败代表成功检测到 bug），按 bugfix workflow 特殊规则处理，不触发 F3。

## 快速命令速查

```bash
# --- 任务状态管理（替代失效的 task_update） ---

# 看全部 spec 进度汇总
bun run scripts/sync-task-status.ts list

# 单任务更新
bun run scripts/sync-task-status.ts set <spec> <taskId> <status>
# status: completed | in_progress | queued | failed | aborted | not_started
# 例：bun run scripts/sync-task-status.ts set daemon-core 4.2 completed

# PBT 结果回写（替代失效的 update_pbt_status）
bun run scripts/sync-task-status.ts set-pbt <spec> <taskId> <pbt-status> [--failing=<example>]
# pbt-status: passed | failed | unexpected_pass
# 例：bun run scripts/sync-task-status.ts set-pbt configuration 5.1 passed
# 例：bun run scripts/sync-task-status.ts set-pbt daemon-core 4.2 failed --failing="seed=42 n=7"

# 批量更新（跨 spec 原子）
bun run scripts/sync-task-status.ts batch <file.json>
# file.json: { "entries": [{"spec":..., "taskId":..., "status":...}, ...] }

# 漂移体检
bun run scripts/sync-task-status.ts verify --all

# 按 meta 修 tasks.md（升级方向，不降级）
bun run scripts/sync-task-status.ts sync <spec|--all> --from=meta --apply

# 按 tasks.md 修 meta（开发者刚手动打勾，要回写 meta）
bun run scripts/sync-task-status.ts sync <spec|--all> --from=tasksmd --apply

# --- Property & 架构验证 ---

# 跑 Property 覆盖验证
bun run .kiro/specs/v6-architecture-overview/artifacts/cp_allocation_verifier.ts

# 跑架构总检
bun run .opencode/tools/sf_v6_arch_check.ts

# --- 工作空间巡视 ---

# 查所有 P0 spec
powershell -Command "Get-ChildItem .kiro/specs -Directory | Where-Object { (Get-Content (Join-Path $_.FullName '.config.kiro') -Raw) -match 'scopeTag.*p0' } | Select-Object Name"
```
