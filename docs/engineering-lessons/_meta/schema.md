# Lesson 文件格式规范

每个 lesson 文件 = YAML frontmatter + Markdown 正文。

---

## YAML Frontmatter

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string (kebab-case) | ✅ | 全局唯一标识，用于跨文件引用和适配器去重 |
| `scope` | enum | ✅ | `universal` \| `tool-specific` \| `project-specific` |
| `tool` | string | scope=tool-specific 时✅ | 工具名小写：`kiro` / `opencode` / `codex` / `cursor` / `cline` 等 |
| `project` | string | scope=project-specific 时✅ | 项目名小写 |
| `roles` | array of string | ✅ | 适用的 agent 角色，见下表 |
| `severity` | enum | ✅ | `high` / `medium` / `low`——决定注入优先级 |
| `tags` | array of string | 可选 | 自由标签，用于检索 |
| `created` | string (YYYY-MM-DD) | ✅ | 创建日期 |
| `updated` | string (YYYY-MM-DD) | 可选 | 最后修改日期 |
| `supersedes` | string (id) | 可选 | 标记本文取代了哪条旧经验，旧条会被适配器忽略 |
| `related` | array of string (id) | 可选 | 相关 lesson 的 id 列表 |

### 标准角色定义（`roles` 字段取值）

| 角色 | 含义 | 何时需要这条经验 |
|------|------|-----------------|
| `executor` | 写代码、跑测试的执行者 | 涉及命令执行、文件操作、测试规范 |
| `orchestrator` | 派单、监控、调度 | 涉及任务调度、错误反馈、状态管理 |
| `reviewer` | 代码审查 | 涉及编码规范、安全规则、设计模式 |
| `debugger` | 排障定位 | 涉及错误分析、根因诊断、复现方法 |
| `architect` | 架构设计 | 涉及组件边界、依赖管理、可扩展性 |
| `*` | 所有角色 | 通用基础知识（如 shell 引号陷阱） |

可同时填多个：`roles: [executor, debugger]`。

### scope 取值规则

- **universal**：换工具、换项目都成立（Promise.race 清理、shell 引号、TCP 协议等）
- **tool-specific**：限定工具，跨项目成立（Kiro task_update bug、Cursor diff 拒接等）
- **project-specific**：限定项目（项目用 bun、特定脚本协议等）

---

## Markdown 正文五段式

```markdown
## 症状

用户/开发者能观察到的现象。最好附**真实错误信息**或**截图描述**，让人 Ctrl-F 搜得到。

## 根因

为什么会发生？分析到工具/系统/协议层面，不要停在"代码写错了"。

## 解决方案

具体怎么做对。给**可直接复制的代码或命令**，不要只说"改成正确写法"。

✅ 推荐做法：
\`\`\`bash
bun test packages/cli/tests/foo.test.ts
\`\`\`

❌ 错误做法：
\`\`\`bash
cd packages/cli && bun test tests/foo.test.ts
\`\`\`

## 预防机制

往哪里加约束让 AI 自动避开？比如：

- 加到 `.kiro/steering/<file>.md` 让 Kiro 主 agent 看到
- 加到 `.opencode/agents/<role>.md` 让 OpenCode sub-agent 看到
- 在 lint 规则里加检测
- 在 CI 加 grep 扫描

## 相关错误

同根因可能导致的其他症状。比如"也别试这些类似命令"。
```

---

## 命名约定

- 文件名：`kebab-case.md`，描述性，不带日期
- `id`：通常 = 文件名（去掉 `.md`），但可加前缀避免冲突，如 `kiro-execute-pwsh-cd-forbidden`
- 标题（# H1）：人类可读的中文/英文短句

---

## 完整示例

```markdown
---
id: kiro-execute-pwsh-cd-forbidden
scope: tool-specific
tool: kiro
roles: [executor, orchestrator]
severity: high
tags: [shell, command-execution]
created: 2026-05-16
updated: 2026-05-16
---

# Kiro execute_pwsh 禁用 `cd` 命令

## 症状

sub-agent 跑 `cd packages/cli && bun run build` 时报错……

## 根因

Kiro 内置的 `execute_pwsh` 是受控壳……

## 解决方案

✅ 用 `cwd` 参数：
\`\`\`
execute_pwsh(command="bun run build", cwd="<repo>/packages/cli")
\`\`\`

❌ 不要：
\`\`\`
execute_pwsh(command="cd packages/cli && bun run build")
\`\`\`

## 预防机制

加到 `.kiro/steering/v6-development-workflow.md` 的"禁止事项"段……

## 相关错误

- `find . -name ...` → 用 `file_search`
- `cat foo.txt` → 用 `read_file`
```

---

## 校验

适配器脚本 `scripts/lessons/lib/parse-lesson.ts` 会：

1. 验证 frontmatter 必填字段
2. 验证 `scope` 与 `tool`/`project` 字段的一致性
3. 验证 `roles` 取值在标准角色集合内
4. 验证 `id` 唯一
5. 跳过格式不合规的文件并报警

不合规不影响其他文件，但建议尽快修复。
