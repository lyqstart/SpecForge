# Engineering Lessons 架构方案

> **本文档定位**：AI 操作手册（Part A）+ 人类设计文档（Part B）。
>
> AI 默认只读 Part A 完成任务；要解释设计决策时才读 Part B。
>
> **版本**：v0.2（2026-05-16，按 AI 友好结构重写）  
> **演进策略**：随每个里程碑更新；重大架构变更时升 minor 版本号

---

## §0 TL;DR

**做什么**：把团队踩过的坑沉淀为结构化、工具无关、可复用的 markdown，通过适配器渲染到各 AI 工具的实际注入点（Kiro steering / OpenCode agent / Codex system prompt）。

**核心数据流**：

```
源（不变）              适配器（每工具一个）            注入点（每工具不同）
docs/engineering-       →  scripts/lessons/         →   .kiro/steering/lessons-injected.md
lessons/                   render-kiro-...                .opencode/agents/<role>.md（未来）
                           render-opencode-...            system-prompt.txt（未来）
                           render-codex-...
```

**当前状态**：P0（骨架）+ P1（Kiro 适配器）✅ 已完成；扩展计划见 §15。

---

## §1 AI 任务路由表（必读）

**这是 AI 阅读本文档的入口**。看到 AI-TASK 标记的章节是任务执行点，不需要读其他章节。

| 我的任务 | 直接读这节 | 标记 |
|---------|-----------|------|
| 沉淀新经验（写 / 更新 / supersedes） | §3 | `AI-TASK: write-lesson` |
| 修改现有 lesson 内容 | §4 | `AI-TASK: update-lesson` |
| 废弃 / 取代 lesson | §5 | `AI-TASK: deprecate-lesson` |
| 加新 AI 工具适配器（OpenCode / Codex 等） | §6 | `AI-TASK: add-adapter` |
| 把经验库复制到其他项目 | §7 | `AI-TASK: replicate-to-project` |
| 决定 lesson 归哪层（universal/ai-tools/projects） | §8.1 | `AI-DECISION: scope` |
| 决定 severity（high/medium/low） | §8.2 | `AI-DECISION: severity` |
| 决定 roles | §8.3 | `AI-DECISION: roles` |
| PR review checklist | §9 | `AI-CHECK: pr-review` |
| 解释为什么这么设计 | §10 + §16 | (Part B) |
| 看路线图 / 待办 | §15 | (Part B) |

**AI 提示词模式**（用户对 AI 说什么）：

| 用户说 | AI 路由到 |
|-------|----------|
| `沉淀经验：<错误>` | §3（写 lesson 完整流程） |
| `修一下 <lesson-id>` | §4 |
| `废弃 <lesson-id>` | §5 |
| `加 OpenCode 适配器` | §6 |
| `把经验库复制到 <other-project>` | §7 |

---

## §2 快速命令速查

所有 CLI 命令集中表，按使用频率排序。

| 命令 | 何时用 |
|------|-------|
| `bun run scripts/lessons/render-kiro-steering.ts` | 改了任何 lesson 后必跑（更新 Kiro 注入文件） |
| `bun run scripts/lessons/render-kiro-steering.ts --check` | CI 中校验，不写文件，仅返回状态码 |
| `bun run scripts/lessons/render-kiro-steering.ts --no-project` | 复制到其他项目时用，不含本项目专属经验 |
| `bun run scripts/lessons/render-opencode-skill.ts` | 改了任何 lesson 后必跑（更新 OpenCode 注入文件） |
| `bun run scripts/lessons/render-opencode-skill.ts --check` | CI 中校验，不写文件，仅返回状态码 |
| `bun run scripts/lessons/render-opencode-skill.ts --no-project` | 复制到其他项目时用，不含本项目专属经验 |
| `bun run scripts/lessons/render-prompt-block.ts --role=<role>` | orchestrator 派 sub-agent 时，输出粘进 prompt 顶部的硬规则段（默认 high severity） |
| `bun run scripts/lessons/render-prompt-block.ts --tags=<tag1,tag2>` | 按任务类型筛选（如 shell / async / testing） |
| `grep -ril "<keyword>" docs/engineering-lessons/` | 搜重复 lesson（按关键词） |
| `grep -rl "tool: <name>" docs/engineering-lessons/ai-tools/` | 列某工具所有专属 lesson |
| `bun run scripts/lessons/search.ts --tag=<tag>` | （未来）按 tag 搜 lesson |

**输出文件**（AUTO-GENERATED，禁止手改）：

| 文件 | 谁生成 | 何时刷新 |
|------|--------|---------|
| `.kiro/steering/lessons-injected.md` | render-kiro-steering.ts | lesson 变化后 |
| `.opencode/skills/superpowers-engineering-lessons/SKILL.md` | render-opencode-skill.ts | lesson 变化后 |

---

# ═════════════════════════════════════════════════════════════════
# Part A：AI 操作手册
# ═════════════════════════════════════════════════════════════════

## §3 任务流程：沉淀新经验

<!-- AI-TASK: write-lesson -->
<!-- INPUTS: 错误描述 / 错误信息原文 / 触发上下文 -->
<!-- OUTPUTS: 一份新或更新的 markdown + rerun 适配器 -->
<!-- DEPENDS: §8 决策标准, §9 质量门槛 -->

**触发**：用户说"沉淀经验：<错误>"、"总结根因写进库"等。

**完整流程**（按顺序执行，不跳步）：

### §3.1 步骤 1：搜重复（必做）

按以下顺序至少搜 3 种关键词，找已有相关 lesson：

```bash
# 1. 错误信息原文
grep -ril "<错误信息>" docs/engineering-lessons/

# 2. 涉及的工具/命令名
grep -ril "<工具名>" docs/engineering-lessons/ai-tools/

# 3. 同 tag 类别（如 shell / async / testing）
grep -ril "tags: \[.*<tag>" docs/engineering-lessons/

# 4. 顺着相关 lesson 的 related 字段追
```

**记录**：找到的相关 lesson id 和路径。

### §3.2 步骤 2：根因分析（5 Whys）

至少问 5 次"为什么"，分析到工具/系统/协议层面：

```
事件：sub-agent 跑 cd packages/cli && bun run build 失败
Why 1：因为 execute_pwsh 报 "cd not supported"
Why 2：因为 Kiro 的 execute_pwsh 是受控壳，禁了 cd
Why 3：因为 Kiro 用 cwd 参数指定工作目录，cd 和 cwd 会冲突
Why 4：因为 sub-agent 不知道 Kiro 受控壳的约束（按 bash 习惯写）
Why 5：因为 sub-agent 系统提示词没明文强调"禁 cd"
                                                          ↑
                                             停在这一层（系统/工具层）
```

**质量标准**：根因停在"代码写错"或"工具用错"是不够的——必须挖到系统/协议层。

### §3.3 步骤 3：决定处理方式（决策树）

<!-- AI-DECISION: duplicate-handling -->

```
搜库找到相关 lesson？
        │
   ┌────┴────┐
   NO       YES
   │         │
   ▼         ▼
 [新建]   ┌────────────────────────────────┐
          │ 完全相同的根因 + 解决方案？     │
          └─────┬──────────────────────────┘
                │
           ┌────┴────┐
           YES       NO
           │         │
           ▼         ▼
    [跳过/确认]  ┌────────────────────────────┐
    报告已有    │ 同根因，但解决方案不同？    │
                └──────┬─────────────────────┘
                       │
                  ┌────┴────┐
                  YES       NO
                  │         │
                  ▼         ▼
           ┌──────────────┐  ┌──────────────────────┐
           │ 旧的还有效吗？│  │ 子问题/相关但独立？  │
           └──────┬───────┘  └──────┬───────────────┘
                  │                 │
              ┌───┴───┐         ┌───┴────┐
              YES    NO         YES     NO
              │      │          │       │
              ▼      ▼          ▼       ▼
           [合并] [supersedes] [新建+related] [新建独立]
```

**5 种处理对应的具体操作**：

| 情况 | 操作 |
|------|------|
| **跳过** | 报告"库里已有 `<id>`，无需新增"，输出已有 lesson 路径，**不动文件** |
| **合并** | 编辑现有 lesson 的 `## 解决方案` 段，加入新方案；更新 frontmatter `updated`；rerun 适配器 |
| **supersedes** | 新建 lesson，frontmatter 加 `supersedes: <old-id>`；旧 lesson **保留不删**（适配器自动忽略） |
| **新建+related** | 新建独立 lesson，frontmatter 加 `related: [<id>, ...]` |
| **新建独立** | 完全新建，无引用 |

### §3.4 步骤 4：选模板写文件

文件路径：`docs/engineering-lessons/<scope>/<topic>.md`

- `<scope>` 按 §8.1 决定（universal / ai-tools/<tool> / projects/<project>）
- `<topic>` 用 kebab-case 描述性命名

**Frontmatter 模板**（见 `_meta/schema.md` 完整规范）：

```yaml
---
id: <kebab-case-id>                # = 文件名（去 .md），跨工具/项目时加前缀
scope: <universal|tool-specific|project-specific>
tool: <name>                       # 仅 tool-specific 时
project: <name>                    # 仅 project-specific 时
roles: [<roles>]                   # 见 §8.3
severity: <high|medium|low>        # 见 §8.2
tags: [<tags>]                     # 自由标签，便于搜索
created: YYYY-MM-DD
updated: YYYY-MM-DD                # 修改时更新
supersedes: <old-id>               # 仅取代旧 lesson 时
related: [<id>, ...]               # 仅相关引用时
---
```

**正文五段式骨架**（每段必填）：

```markdown
# <人类可读标题>

## 症状
<错误信息原文 + 用户能观察到的现象。让 Ctrl-F 搜得到。>

## 根因
<5 Whys 分析结果。停在工具/系统层，不要停在"代码写错"。>

## 解决方案
<可直接复制的代码 / 命令。✅ 推荐做法 + ❌ 错误做法对照。>

## 预防机制
<往哪里加约束让 AI 自动避开。具体到文件和段落。>

## 相关错误
<同根因可能撞到的其他症状。给出关联 lesson id。>
```

### §3.5 步骤 5：自检（必跑 §9 PR checklist）

参考 §9，逐项打勾。任一项不通过就回到对应步骤修。

### §3.6 步骤 6：跑适配器（必做，不可跳过）

> ⚠️ **没跑适配器 = 注入文件没更新 = AI 实际看不到你新写的 lesson。**
>
> 这一步**必须执行**。不能因为"看起来源文件已经改好了"就跳过——源文件改了但注入文件没刷新时，下次 sub-agent / 主 agent 看到的还是旧版规则，新经验静默失效。

```bash
bun run scripts/lessons/render-kiro-steering.ts --check    # 校验 frontmatter
bun run scripts/lessons/render-kiro-steering.ts             # 写注入文件
```

校验失败说明 frontmatter 有问题，按错误信息修。

**何时可以跳过**：从来不可以。每次源文件变化后必跑。

### §3.7 步骤 7：报告结果（强制 5 项）

向用户报告**必须包含以下 5 项**，缺一不可。这让用户能验证 §3 流程真的走完了，而不是中途跳步。

| 必报项 | 含义 | 不报的风险 |
|--------|------|----------|
| **处理方式** | 新建 / 合并 / supersedes / 跳过 | 用户不知道决策树走到哪 |
| **涉及文件** | 源文件相对路径 | 用户找不到文件 |
| **适配器：是否已跑 + 条数变化** | "✓ 已跑，从 N 条 → M 条" | **缺这条 = §3.6 可能跳了** |
| **注入文件：是否已更新** | "✓ `.kiro/steering/lessons-injected.md` 已更新" | 同上 |
| **自检结果** | "§9 PR checklist N/11 通过" | 用户不知道质量 |

**示例报告**：
```
沉淀经验完成。

处理方式：合并到现有 lesson
涉及文件：docs/engineering-lessons/ai-tools/kiro/execute-pwsh-constraints.md
  · ## 解决方案 段加入新错误模式（heredoc 不支持）

适配器：✓ 已跑，从 2 条 → 2 条（合并不增加条目数，但内容更全）
注入文件：✓ .kiro/steering/lessons-injected.md 已更新（17.7k → 18.2k 字符）
自检：11/11 通过

下一步建议：派 sub-agent 时可在 prompt 顶部加一句对 heredoc 错误的提醒（参见 §15.14 prompt 注入段适配器）
```

**用户验证方式**：看到报告后扫一眼"适配器已跑 ✓ + 注入文件已更新 ✓"两行，没看到这两行说明 §3.6 被跳了，要求 AI 重跑。

---

## §4 任务流程：修改现有 lesson

<!-- AI-TASK: update-lesson -->
<!-- INPUTS: lesson id 或路径 / 修改要点 -->
<!-- OUTPUTS: 更新文件 + rerun 适配器 -->

**触发**：用户说"修一下 `<lesson-id>`"、"`<lesson-id>` 的方案过时了"等。

**步骤**：

1. 读现有 lesson 完整内容
2. 应用修改（注意保留五段式结构）
3. 更新 frontmatter `updated: YYYY-MM-DD`
4. 跑 §9 PR checklist 自检
5. 跑 `render-kiro-steering.ts` 重新生成
6. 报告变更摘要给用户

**特殊情况**：

- 修改内容**与现有方案矛盾** → 不要直接覆盖，走 §5（supersedes）
- 修改导致 `severity` 变化 → 在 commit message 标 `lessons: bump severity of <id> from X to Y` + 写入 §16 决策日志

---

## §5 任务流程：废弃 / 取代 lesson

<!-- AI-TASK: deprecate-lesson -->
<!-- INPUTS: 旧 lesson id / 取代原因 / (可选) 新 lesson 内容 -->
<!-- OUTPUTS: 旧 lesson frontmatter 加 deprecated 状态 + (可选) 新 lesson -->

**触发**：用户说"废弃 `<id>`"、"`<id>` 用不上了"等。

**两种场景**：

### §5.1 仅废弃（无替代）

适用：经验本身错了，或场景消失（如某工具不再使用）。

步骤：
1. 编辑旧 lesson frontmatter 加 `status: deprecated`
2. 在文件头加 deprecated 说明：
   ```markdown
   > ⚠️ **DEPRECATED** since YYYY-MM-DD：<原因>
   ```
3. 跑适配器（filter.ts 自动排除 deprecated）
4. 半年后无引用 → 移到 `_archive/`（见 §13.1）

### §5.2 取代（有新 lesson）

适用：发现更好的方案，旧的应停用。

步骤：
1. 按 §3 流程写新 lesson，frontmatter 加 `supersedes: <old-id>`
2. 旧 lesson **不动 status**（让 supersedes 处理；filter.ts 自动忽略被 supersede 的）
3. 三个月后无引用 → 移到 `_archive/`

**为什么不删**：
- 历史搜索可能用到（"过去这是怎么处理的？"）
- supersedes 链清晰，方便追溯演进

---

## §6 任务流程：加新 AI 工具适配器

<!-- AI-TASK: add-adapter -->
<!-- INPUTS: 工具名 / 该工具的注入机制 -->
<!-- OUTPUTS: 新适配器脚本 + 文档更新 -->

**触发**：用户说"加 OpenCode 适配器"、"支持 Codex"等。

**步骤**：

1. **复制现有适配器作为骨架**：
   ```
   scripts/lessons/render-kiro-steering.ts → render-<tool>-<context>.ts
   ```

2. **改输出格式**：根据该工具的注入点格式调整 `renderSteering()`：
   - Kiro 用 `inclusion: always` frontmatter
   - OpenCode 用 `<!-- LESSONS START -->` / `<!-- LESSONS END -->` 标记之间增量替换
   - Codex 输出可粘贴的 markdown 到 stdout

3. **改 CLI 参数**：按需调整 `parseArgs()`：
   - 多角色工具：加 `--role=<role>` 区分
   - 多上下文工具：加 `--context=<system-prompt|agent-prompt>`

4. **不需要碰**：
   - `lib/parse-lesson.ts`（解析逻辑通用）
   - `lib/filter.ts`（过滤逻辑通用）
   - 任何 lesson 源文件

5. **更新文档**：
   - `README.md` "如何使用" 加该工具命令
   - `ARCHITECTURE.md §2 快速命令速查` 加一行
   - `ARCHITECTURE.md §11 当前架构` 更新支持工具列表

6. **自测**：
   - 跑 `--check` 模式
   - 跑实际渲染
   - 在该工具里验证经验真的被加载

---

## §7 任务流程：跨项目复用经验库

<!-- AI-TASK: replicate-to-project -->
<!-- INPUTS: 目标项目路径 -->
<!-- OUTPUTS: 目标项目里的经验库副本 + 适配器 + 注入文件 -->

**触发**：用户说"把经验库复制到 `<other-project>`"。

**步骤**：

1. **复制源文件**（在目标项目根下）：
   ```bash
   mkdir -p docs/engineering-lessons scripts/lessons
   cp -r <source-repo>/docs/engineering-lessons/{README.md,ARCHITECTURE.md,_meta,universal,ai-tools} docs/engineering-lessons/
   cp -r <source-repo>/scripts/lessons/* scripts/lessons/
   ```

2. **删除不适用的 projects/<other> 目录**：
   ```bash
   rm -rf docs/engineering-lessons/projects
   mkdir docs/engineering-lessons/projects/<new-project>
   ```

3. **跑适配器**（生成本项目注入文件）：
   ```bash
   bun run scripts/lessons/render-kiro-steering.ts --no-project
   ```
   `--no-project` 保证不带 source repo 的项目专属经验。

4. **验证**：检查目标项目的 `.kiro/steering/lessons-injected.md` 已生成且只含 universal + ai-tools 内容。

5. **可选**：根据目标项目的 AI 工具栈，启用对应适配器（render-opencode-agent / render-codex-prompt 等）。

**注意事项**：
- universal/ 和 ai-tools/ 直接用，不要修改
- projects/<source-project>/ 的经验不能盲目复制，应该按 §3 重新评估是否在新项目也成立

---

## §8 决策标准（AI 判断时直接查表）

### §8.1 决定 scope（归哪一层）

<!-- AI-DECISION: scope -->

```
触发问题：这条经验的根因是什么？
        │
        ▼
   ┌──────────────────────────────────────┐
   │ 换工具 / 换项目都成立？              │
   │ （任何 AI 工具任何项目都可能撞）       │
   └────┬─────────────────────────────────┘
        │
   ┌────┴────┐
   YES       NO
   │         │
   ▼         ▼
universal/  ┌──────────────────────────┐
            │ 只在某 AI 工具上发生？    │
            │ （其他工具不撞这个坑）     │
            └────┬─────────────────────┘
                 │
            ┌────┴────┐
            YES       NO
            │         │
            ▼         ▼
       ai-tools/    projects/<project>/
       <tool>/
```

**判定示例**：

| 经验 | 归属 | 理由 |
|------|------|------|
| Promise.race 不清理 timer 导致泄漏 | `universal/` | JS/TS 任何环境都成立 |
| Kiro execute_pwsh 禁 cd | `ai-tools/kiro/` | 仅 Kiro 这么实现 |
| 本仓库用 bun 不用 npm | `projects/specforge/` | 仅本仓库约定 |

**拿不准时**：往**更小范围**放（先 project，证明跨项目也成立后再升 universal）。升级路径：projects → universal 比反向降级容易。

### §8.2 决定 severity

<!-- AI-DECISION: severity -->

| 级别 | 标准 | 例子 |
|------|------|------|
| **high** | 不遵守会导致：（a）任务失败、（b）数据丢失、（c）卡死、（d）严重浪费 token | 异步资源泄漏、cd 命令失败 |
| **medium** | 不遵守会导致：代码质量下降、测试不稳定、调试困难 | 缺超时、错误信息不清晰 |
| **low** | 风格、可读性、最佳实践（违反不影响功能） | 命名约定、注释格式 |

**判定原则**：拿不准时**往低判**（medium 不到就 low）。high 应该稀少而珍贵。

**警戒线**：库里 high severity 占比应 ≤ 40%。超过说明 severity 通货膨胀，需要重新校准。

### §8.3 决定 roles

<!-- AI-DECISION: roles -->

| 角色 | 含义 | 何时填这个 |
|------|------|----------|
| `executor` | 写代码、跑测试 | 涉及命令执行、文件操作、测试规范 |
| `orchestrator` | 派单、监控、调度 | 涉及任务调度、错误反馈、状态管理 |
| `reviewer` | 代码审查 | 涉及编码规范、安全规则、设计模式 |
| `debugger` | 排障定位 | 涉及错误分析、根因诊断、复现方法 |
| `architect` | 架构设计 | 涉及组件边界、依赖管理、可扩展性 |
| `*` | 所有角色 | 通用基础知识（如 shell 引号陷阱） |

**多选**：可同时填多个：`roles: [executor, debugger]`。

**禁止**：图省事全填 `*`——这等于不过滤，浪费各角色的 token。每条 lesson 应该有明确的相关角色。

---

## §9 PR review checklist（写完必跑）

<!-- AI-CHECK: pr-review -->

每篇新 / 修改的 lesson 必须通过以下检查。任一不通过返回对应步骤修。

| # | 检查项 | 通过标准 | 不通过去哪修 |
|---|-------|---------|-------------|
| 1 | 唯一性 | 没有重复的现有 lesson | §3.1 重新搜重复 |
| 2 | 归属正确 | scope 符合 §8.1 决策树 | §8.1 |
| 3 | frontmatter 完整 | id/scope/roles/severity 必填齐 | _meta/schema.md |
| 4 | 症状可搜索 | 含真实错误信息原文 | §3.4 正文骨架 |
| 5 | 根因到工具/系统层 | 不停在"代码写错" | §3.2 5 Whys |
| 6 | 解决方案可复制 | 有具体代码/命令 | §3.4 正文骨架 |
| 7 | 预防机制具体 | 指明往哪个文件加什么 | §3.4 正文骨架 |
| 8 | 相关错误列举 | 至少思考一遍同根因还撞哪些坑 | §3.4 正文骨架 |
| 9 | severity 校准 | 符合 §8.2 标准 | §8.2 |
| 10 | roles 合理 | 不要全填 `*` | §8.3 |
| 11 | 适配器通过 | render-kiro-steering.ts --check 退出 0 | 按错误信息修 frontmatter |

**自动化部分**（CI 会检查）：
- 检查 11 由 `--check` 模式覆盖
- 其他 1-10 是人工/AI 自检（适配器无法验证）



---

# ═════════════════════════════════════════════════════════════════
# Part B：人类设计文档
# ═════════════════════════════════════════════════════════════════

## §10 设计原则（不可违反）

按重要性排序，越往前越优先。AI 修改任何东西前先读这一节。

### §10.1 工具无关存储（Tool-Agnostic Source of Truth）

经验文件本身**不内嵌任何 AI 工具的特定语法**。
- ❌ 不要在 lesson 文件里写 Kiro 的 `inclusion: always`
- ❌ 不要写 `<file:...>` / `#[[file:...]]` 这类工具私有引用
- ✅ 只写纯 markdown + 工具无关的 YAML frontmatter

**为什么**：源文件能被任何工具读、任何项目复用、任何文本工具搜索。绑工具就毁了复用价值。

### §10.2 存读分离（Storage vs Consumption Separation）

经验**只存数据**，注入到工具上下文的工作完全交给适配器。

**为什么**：未来工具变了（新增 Codex / Cursor / Cline），只加一个适配器即可，源文件零修改。

### §10.3 分层归类（Three-Tier Classification）

universal / ai-tools / projects 三层不混放。判断方法见 §8.1。

### §10.4 角色感知（Role-Aware Injection）

每篇 lesson frontmatter 标 `roles: [...]`，适配器按角色过滤注入。

**为什么**：reviewer 不需要 orchestrator 的调度规则；executor 不需要 architect 的边界设计。注入越精准，token 越省。

### §10.5 生成可重现（Reproducible Output）

适配器输出文件头加 `AUTO-GENERATED`，禁止手改（手改下次会被覆盖）。

**为什么**：生成路径是单向的（源 → 注入点），双向同步会引入冲突。强制单向，简单可靠。

### §10.6 零依赖优先（Zero New Dependency）

适配器实现优先用 stdlib + 项目已有依赖，不引入新 npm 包。

**为什么**：经验库要能被复制到任何项目用，依赖少 = 复制成本低。当前 `parse-lesson.ts` 手写了简版 YAML 解析器就是这个原则的体现。

### §10.7 单源单渲染（Single Source, Multiple Renders）

一个事实、一份经验、一处编辑；多种渲染、多处生效。**禁止**在不同地方维护同一经验的多份拷贝。

---

## §11 当前架构（v0.1）

### §11.1 目录结构

```
SpecForge/
├── docs/engineering-lessons/                    [源]
│   ├── README.md                                ← 用户入口（索引 + 使用指南）
│   ├── ARCHITECTURE.md                          ← 本文档（设计依据 + AI 操作手册）
│   ├── _meta/
│   │   └── schema.md                            ← lesson 文件格式规范
│   ├── universal/
│   │   └── async-resource-lifecycle.md
│   ├── ai-tools/
│   │   └── kiro/
│   │       └── execute-pwsh-constraints.md
│   └── projects/
│       └── specforge/                            (待填)
│
├── scripts/lessons/                             [适配器]
│   ├── lib/
│   │   ├── parse-lesson.ts                      ← frontmatter 解析（零依赖）
│   │   └── filter.ts                            ← scope/tool/role/severity 过滤
│   ├── render-kiro-steering.ts                  ← Kiro 适配器（已实现）
│   ├── render-opencode-skill.ts                 ← OpenCode 适配器（已实现）
│   └── render-prompt-block.ts                   ← 派单 prompt 注入段（已实现）
│
└── .kiro/steering/                              [Kiro 注入点]
    └── lessons-injected.md                      ← AUTO-GENERATED
```

### §11.2 数据流

```
                      ┌─────────────────────────────────┐
                      │  docs/engineering-lessons/      │
                      │  (单一事实源，工具无关 markdown) │
                      └──────────────┬──────────────────┘
                                     │
                       parse-lesson.ts (frontmatter + body)
                                     │
                                     ▼
                              ┌──────────────┐
                              │   Lesson[]    │  (内存模型)
                              └──────┬───────┘
                                     │
                          filter.ts (按 scope/tool/role/severity)
                                     │
              ┌──────────────────────┼─────────────────────────┐
              ▼                      ▼                         ▼
      render-kiro-steering   render-opencode-agent      render-codex-prompt
              │                      │                         │
              ▼                      ▼                         ▼
   .kiro/steering/         .opencode/agents/             stdout (可粘贴)
   lessons-injected.md     <role>.md 片段
   (AUTO-GENERATED)        (AUTO-GENERATED)
```

### §11.3 当前快照

- **经验数**：6 篇（universal 4 + ai-tools/kiro 1 + ai-tools/opencode 1）
- **适配器数**：3 个（render-kiro-steering、render-opencode-skill、render-prompt-block）
- **支持工具**：Kiro、OpenCode
- **支持角色**：6 个（executor / orchestrator / reviewer / debugger / architect / *）
- **生成产物**：`.kiro/steering/lessons-injected.md`、`.opencode/skills/superpowers-engineering-lessons/SKILL.md`、stdout（prompt-block）
- **依赖**：零（手写 YAML 解析）

### §11.4 Sub-agent 注入机制（实测验证）

**问题**：`.kiro/steering/lessons-injected.md` 通过 `inclusion: always` 注入主 agent，sub-agent 也能看到吗？

**实测结果**（2026-05-16，派 general-task-execution 内省验证）：

✅ **能看到**。所有 `.kiro/steering/*.md` 以 `user-rule` 形式完整注入 sub-agent 的 system context。当时 sub-agent 看到 4 个 steering 文件：
- `v6-development-workflow.md`
- `lessons-injected.md`
- `project-structure.md`
- `async-resource-coding-standards.md`

并能引用 `lessons-injected.md` 中关于 cd 禁令的具体条款。

**结论**：经验库 → 适配器 → `.kiro/steering/` → sub-agent 这条路径**完整闭环**。

**遗留问题**（看到 ≠ 重视）：
- LLM 在长 steering 里注意力会稀释
- 同一规则主 agent 重视、sub-agent 偶尔忽略（如历史上 cd 错误反复出现）
- 解法：派单 prompt 里**显式重复关键硬规则**——见 §15.14 `render-prompt-block` 适配器

**注意**：
- `docs/engineering-lessons/ARCHITECTURE.md` **不在 steering 目录**，正文不被自动注入。sub-agent 知道它存在（因 v6-development-workflow.md 提及），但要**read_file 才能拿到完整流程**
- 这是预期行为：ARCHITECTURE.md 是"按需查阅"的手册，不是每次都注入的硬规则

---

## §12 Frontmatter Schema 详细

完整格式见 `_meta/schema.md`。简版：

```yaml
---
id: <kebab-case>                    # 必填，全局唯一
scope: universal | tool-specific | project-specific  # 必填
tool: <name>                        # scope=tool-specific 时必填
project: <name>                     # scope=project-specific 时必填
roles: [executor, ...]              # 必填，至少一个
severity: high | medium | low       # 必填
tags: [...]                         # 可选
created: YYYY-MM-DD                 # 可选（推荐）
updated: YYYY-MM-DD                 # 可选
status: active | deprecated         # 可选（默认 active），见 §13
supersedes: <other-lesson-id>       # 可选（标记取代关系）
related: [<id>, ...]                # 可选（关联引用）
---
```

---

## §13 治理与维护

### §13.1 Lesson 生命周期

```
   ┌─────────┐  PR 审过  ┌──────────┐  半年未触发?  ┌─────────────┐
   │  Draft  │ ────────→ │ Active   │ ───────────→ │ Stale (待审)│
   └─────────┘           └──────────┘               └─────────────┘
                              │                            │
                       supersedes 出现                  仍有效?
                              │                            │
                              ▼                  ┌─────────┴─────────┐
                        ┌───────────┐            ▼                   ▼
                        │ Superseded│      ┌──────────┐       ┌────────────┐
                        └───────────┘      │ Refresh  │       │ Deprecated │
                              │            └──────────┘       └────────────┘
                              ▼                                     │
                        3 月无引用                                   ▼
                              │                              半年无引用
                              ▼                                     │
                        ┌──────────┐                                ▼
                        │ Archive  │←────────────────────────────────
                        └──────────┘
```

操作落地：通过 `status` frontmatter 字段（待加，见 §15.2）+ 季度 review。

### §13.2 季度 Review

每季度做一次 lessons 健康检查：

| 检查项 | 工具 | 处理 |
|--------|------|------|
| 重复 / 接近重复的 lessons | grep + 人工对比 | 合并或加 `supersedes` |
| 半年没更新的 lesson | `git log --since="6 months ago"` | 标 stale |
| 适配器输出文件臃肿（>30k 字符） | `wc -c` | 提升过滤精度 / 拆分注入点 |
| 高 severity lesson 是否过多（占比 >40%） | grep frontmatter | 重新校准 severity |

### §13.3 Token 预算

每个 AI 工具的注入容量有限：

| 工具 | 主提示词容量 | 建议 lessons 上限 |
|------|------------|------------------|
| Kiro steering | ~10k tokens | 总和 ≤ 8k tokens |
| OpenCode agent | ~5k tokens / 角色 | 按角色过滤后 ≤ 4k |
| Codex system prompt | ~4k tokens | ≤ 3k |

**触发警戒**：适配器输出超阈值时打印 WARN（待实现，见 §15.7）。

### §13.4 命名约定

- **文件名**：`kebab-case.md`，描述性，不带日期
- **id**：通常 = 文件名（去 `.md`），跨工具/项目时加前缀避免冲突
- **标题**：人类可读短句，中英文均可，但**同一文件内保持一种语言**

### §13.5 语言约定

经验库**默认中文**（项目主语言），但：
- 标题、id、frontmatter 字段：英文 / kebab-case
- 错误信息引用：保留原文（不翻译）
- 代码示例：保留原文 + 中文注释

跨项目复用时若新项目主语言是英文，**保留中文版作为存档**，新建英文版（不要直接翻译覆盖，避免丢失语境）。

---

## §14 风险登记

| ID | 风险 | 影响 | 缓解 |
|----|------|------|------|
| R1 | Lessons 越来越多，注入点爆炸 | token 超限、AI 上下文被挤占 | §13.3 容量监控；按角色过滤；medium/low 不进主注入 |
| R2 | 经验过时，AI 按错误经验执行 | 修复反而引入新错 | §13.1 lifecycle；§13.2 季度 review；`supersedes` 机制 |
| R3 | 工具变了，适配器维护跟不上 | 新功能用不上 / 旧适配器输出失效 | 适配器解耦在 `scripts/lessons/`；CI 跑 `--check` |
| R4 | 多人写 lesson 风格不一 | 质量参差 | §9 PR checklist；模板（§15.4） |
| R5 | 经验冲突（A 项目用 X，B 项目用 Y） | AI 不知道按哪个 | scope=project-specific 隔离 |
| R6 | 适配器有 bug，渲染缺漏经验 | 漏注入导致重复犯错 | §15.6 单元测试；CI 比对生成产物 |
| R7 | 源文件和注入文件不同步 | 经验改了但 AI 没看到 | §15.1 CI 检查；提交时 source + output 一起提交 |
| R8 | 经验库没人维护 | 烂尾，不再有人写新 lesson | 把"沉淀经验"做进开发流程；§13.2 季度 review |
| R9 | AI 把 lessons 当作权威指令而非建议 | AI 拒绝执行用户的合理需求 | lesson 不写"绝对禁止 X"，改写"X 可能导致 Y，请使用 Z 替代" |
| R10 | 跨项目复用时 ai-tools/ 不通用 | 复制错经验 | scope 标注严格；定期审计 |
| R11 | "沉淀经验"流程被 AI 跳过（图省事直接新建） | 重复 lesson 堆积 | §3 流程标记 AI-TASK + 必跑 §3.1 搜重复 |

---

## §15 路线图（待办与优先级）

按 P0-P3 排序，每项标"什么时候做、怎么做"。

### §15.1 [P0] CI 集成 — 防止源/输出不同步

**问题**：开发者改了源文件忘记跑适配器，注入文件就老旧了。

**做法**：在 `.github/workflows/code-quality.yml` 加 step：
```yaml
- name: Verify lessons-injected.md is up-to-date
  run: |
    bun run scripts/lessons/render-kiro-steering.ts
    git diff --exit-code .kiro/steering/lessons-injected.md
```

**何时做**：下次 CI 调整时（约 10 分钟）。

### §15.2 [P0] Frontmatter 加 `status` 字段

**问题**：当前没法标"已停用 / 待审 / 草稿"。

**做法**：
1. schema.md 加 `status: draft | active | stale | deprecated | archived`
2. 默认 `active`
3. filter.ts 默认排除 `deprecated` 和 `archived`
4. CLI flag `--include-deprecated` 用于历史查询

**何时做**：第一次有 lesson 真要 deprecate 时（约 30 分钟）。

### §15.3 [P0] OpenCode / Codex 适配器

**问题**：当前只有 Kiro 适配器。

**做法**：
- `render-opencode-skill.ts`：✅ **已完成**。输出到 `.opencode/skills/superpowers-engineering-lessons/SKILL.md`，`autoload: true` 让所有 agent 自动获得经验注入
- `render-system-prompt.ts`：输出到 stdout（Codex 用，待实现）

**何时做**：~~第一次用 OpenCode 时（约 1 小时）~~ ✅ 已实现（2026-05-20）。

### §15.4 [P1] Lesson 模板

**问题**：新人写 lesson 没参考。

**做法**：建 `_meta/lesson.template.md`，含完整 frontmatter + 五段式骨架 + 引导注释。

**何时做**：第二个人开始写 lesson 时（约 15 分钟）。

### §15.5 [P1] 归档目录

**问题**：deprecated lesson 长期堆积。

**做法**：建 `_archive/`，把 `status=archived` 的文件移过去；适配器忽略此目录。

**何时做**：第一篇 lesson 准备彻底归档时（约 10 分钟）。

### §15.6 [P1] 适配器单元测试

**问题**：parse-lesson.ts / filter.ts / render-*.ts 没测试。

**做法**：在 `scripts/lessons/tests/` 写 vitest 测试覆盖各分支。

**何时做**：适配器扩展前（约 2 小时）。

### §15.7 [P1] 容量监控

**问题**：lessons 多了 token 超限没人察觉。

**做法**：适配器输出时打印 token 估算（按 char/4 简易估算），超阈值打 WARN。

**何时做**：lessons 超过 10 篇时（约 30 分钟）。

### §15.8 [P2] 经验搜索 CLI

**问题**：开发者想查"shell 相关 high severity 经验"没工具。

**做法**：`scripts/lessons/search.ts`：
```bash
bun run scripts/lessons/search.ts --tag=shell --severity=high
bun run scripts/lessons/search.ts --tool=kiro --role=executor
bun run scripts/lessons/search.ts --grep="cd"
```

**何时做**：lessons 超过 20 篇 / 团队"找不到经验"时（约 2 小时）。

### §15.9 [P2] 自动检测 lesson 候选

**问题**：sub-agent 多次撞同一坑没人意识到要写 lesson。

**做法**：
1. 收集 sub-agent 错误日志
2. 跑 grep 找重复模式（≥3 次同模式 → 候选）
3. 输出"建议 lesson"列表给人写

**何时做**：日志收集机制就绪后（约 4 小时）。

### §15.10 [P2] Lint 规则联动

**问题**：A1（Promise.race 清理）这类经验完全可以被 ESLint 强制。

**做法**：lesson frontmatter 加 `enforced_by: <eslint-rule-id>`，在 `eslint.config.js` 引入对应自定义 rule。

**何时做**：发现哪条经验靠"自觉"反复出错时（每条 1-3 小时）。

### §15.11 [P3] 独立 npm 包 / git 子模块

**问题**：经验库稳定后想跨仓库统一维护。

**做法**：
- 选项 A：发布 `@yourname/engineering-lessons` 包
- 选项 B：git submodule
- 选项 C：保持复制（≤3 仓库时最简单）

**判断阈值**：≥ 3 个仓库使用 → 评估 A 或 B。

### §15.12 [P3] AI 自治更新经验

**愿景**：AI 完成任务时识别"踩了新坑"，自动起草 lesson PR 到 `_drafts/`。

**何时做**：基础设施稳定后探索（无明确时间）。

### §15.13 [P3] 国际化

**做法**：frontmatter 加 `lang: zh-CN | en | ...`，适配器加 `--lang` 选输出语言。

**何时做**：项目有英文使用方时。

### §15.14 [P1] 派单 prompt 注入段适配器（render-prompt-block）

**问题**：sub-agent 能看到 steering 但偶尔忽略。LLM 注意力分配机制下，"派单 prompt 顶部明文重复"比"steering 静默注入"更有效。

**做法**：实现 `scripts/lessons/render-prompt-block.ts`：
- 默认输出 high severity 经验的紧凑版（每条 1-3 行）
- 支持 `--role <role>` 按角色过滤
- 支持 `--tags <tag1,tag2>` 按标签过滤
- 支持 `--max-tokens <N>` 软上限（超了打 WARN）
- 输出到 stdout，方便 orchestrator 拷贝到派单 prompt 顶部

**用法示例**：
```bash
# orchestrator 派 sub-agent 干 cli 包活前
bun run scripts/lessons/render-prompt-block.ts --role=executor --tags=shell,command-execution
# 输出粘贴到派单 prompt 的"## 必读硬规则"段
```

**何时做**：发现 sub-agent 仍频繁违反 high severity 经验时（约 1-2 小时）。

**当前状态**：v0.2 已实现初版（仅 high severity 输出，含 fallback 模板）。

---

## §16 决策日志

| 日期 | 决策 | 备选 | 选择原因 |
|------|------|------|----------|
| 2026-05-16 | 用纯 markdown + YAML frontmatter | JSON / TOML / 自定义格式 | markdown 渲染友好、人类可读、所有工具都支持 |
| 2026-05-16 | 三层目录（universal/ai-tools/projects） | 单一目录 + tags 区分 | 目录结构本身即文档，复制时按需取舍简单 |
| 2026-05-16 | 适配器 = 一个工具一个脚本 | 单一适配器 + 配置驱动 | 配置驱动看起来通用，实际每工具特殊性大；脚本明确好维护 |
| 2026-05-16 | 零依赖手写 YAML 解析 | js-yaml / gray-matter | 经验库要复制到任何项目，依赖少 = 复制成本低 |
| 2026-05-16 | 输出文件加 AUTO-GENERATED 头 + 提交进 git | 不进 git（每次 build 生成） | 进 git 让 PR 能看 diff、CI 能验一致性 |
| 2026-05-16 | 默认中文 | 默认英文 | 项目主语言中文；保留英文版迁移路径（§15.13） |
| 2026-05-16 | v0.2 文档结构改为 Part A（AI 手册）+ Part B（设计文档） | 单一线性叙述 | 大部分情况 AI 读，AI 友好结构能让 AI 直接路由到任务节，不必扫全文 |
| 2026-05-16 | 沉淀经验流程明确 5 种重复处理方式（决策树） | 让 AI 自由判断 | 自由判断会导致重复 lesson 堆积；明确决策树可强制走标准路径 |
| 2026-05-16 | 不强加 CI 一致性检查作为 P0 | CI 跑 `--check` + `git diff --exit-code` 作为兜底 | §3.6/§3.7 强制 AI 流程内必跑适配器 + 必报"适配器已跑"，覆盖 95% 场景。CI 检查降级到 P1，等真发生过"绕过流程"事故再加 |
| 2026-05-16 | 实测确认 sub-agent 能看到 `.kiro/steering/*.md` | 推测 / 不验证 | 派 general-task-execution 内省回答，证据明确（见 §11.4），后续设计有事实基础 |
| 2026-05-16 | 加 prompt-block 适配器（§15.14） | 仅靠 steering 注入 | 实测虽然 sub-agent 能看到，但"看到 ≠ 重视"（历史 cd 反复违反佐证）；派单 prompt 顶部明文重复对 LLM 注意力更有效 |

---

## §17 FAQ

**Q：经验库和 steering 怎么分？**

A：
- **经验库**（lessons）：踩坑的总结，**事后沉淀**，多工具共享，会随时间演化
- **steering**：项目工作流规则，**事前约定**，和具体工具/项目绑定，相对稳定

经验库的部分会**通过适配器注入**到 steering，但 steering 还有更多内容（工作流、提示词字典等）不会从经验库来。

**Q：为什么不用某某现成的知识库系统（Notion / Confluence 等）？**

A：
- AI 工具读 markdown 容易，读外部知识库难（要爬 API）
- 知识库平台变了源就丢，markdown 永远能 git 管
- 经验注入需要按角色、按工具精准过滤，外部平台不可控

**Q：新加的 lesson 多久生效？**

A：跑完 `render-kiro-steering.ts` 立刻生效（下次 Kiro 会话加载新 steering）。

**Q：lesson 出错怎么回滚？**

A：git revert 源文件 + rerun 适配器。AUTO-GENERATED 文件会跟着源文件版本走。

**Q：能给非软件项目用吗？**

A：架构是通用的（任何"踩坑沉淀"场景都适用），但当前 universal/ 下的内容偏软件工程。文档/法律/医疗等领域要建自己的 universal/ 集合。

**Q：AI 怎么知道某条经验"已经在库里了"？会不会漏看？**

A：见 §3.1，AI 必须按 3 种关键词搜+追 related 链。漏看的最大保险是 §9 PR checklist 的检查 1（唯一性），和 季度 review（§13.2）。

**Q：用户怎么写"沉淀经验"提示词？**

A：
- 最短：`沉淀经验：<错误>。按 ARCHITECTURE.md 流程做`
- 完整版示例见 §3 开头注释。

**Q：sub-agent 能看到 lessons-injected.md 吗？**

A：✅ 能看到。详见 §11.4 实测结论。所有 `.kiro/steering/*.md` 通过 `inclusion: always` 自动注入 sub-agent。

**Q：sub-agent 能看到 ARCHITECTURE.md 吗？**

A：⚠️ 部分。它"知道存在"（因 v6-development-workflow.md 提及），但**正文要 read_file 才能拿到**。这是设计选择——ARCHITECTURE.md 是按需查阅的手册，不是每次都注入。

**Q：经验都写在 lessons-injected.md 里了，sub-agent 还会忽略吗？**

A：可能。LLM 在长 steering 里注意力会稀释。最稳妥的做法是 orchestrator 派单时**在 prompt 顶部明文重复关键硬规则**——用 `bun run scripts/lessons/render-prompt-block.ts --role=<role>` 生成，详见 §15.14。

**Q：怎么验证 §3 流程真的走完了？**

A：看 AI 的报告（§3.7）有没有这两行：
- `适配器：✓ 已跑，从 N 条 → M 条`
- `注入文件：✓ .kiro/steering/lessons-injected.md 已更新`

缺这两行说明 §3.6 被跳了，要求 AI 重跑。

---

## 变更记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-05-16 | v0.1 | 初稿。定义原则、当前架构、生命周期、路线图。对应 P0+P1 已落地阶段。 |
| 2026-05-16 | v0.2 | 重写为 Part A（AI 操作手册）+ Part B（设计文档）结构。新增 §1 任务路由表、§2 命令速查、§3-7 任务流程、§8 决策标准、§9 PR checklist。AI-TASK / AI-DECISION / AI-CHECK 标记便于 grep 定位。R11 风险新增。决策日志加 v0.2 设计原因。 |
| 2026-05-16 | v0.3 | §3.6 加强措辞（必做不可跳过）；§3.7 强制 5 项报告（含"适配器已跑/注入更新"两行）；§11.4 写入 sub-agent 注入机制实测结论；§15.14 新增 render-prompt-block 适配器路线图项；FAQ 新增 4 条；决策日志加 3 条。 |
