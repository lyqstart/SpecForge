# Engineering Lessons（工程经验库）

> 把团队踩过的坑沉淀为结构化、工具无关、可复用的经验，让任何 AI 编程工具（Kiro / OpenCode / Codex / Cursor / Cline 等）都能"按需注入"，避免重复犯错。

---

## 三秒上手

| 我要 | 去哪 |
|------|------|
| **沉淀新经验**（用户对 AI 说："沉淀经验：<错误>"） | AI 自动读 [`ARCHITECTURE.md §3`](ARCHITECTURE.md#§3-任务流程沉淀新经验) |
| **修改现有经验** | [`ARCHITECTURE.md §4`](ARCHITECTURE.md) |
| **废弃 / 取代经验** | [`ARCHITECTURE.md §5`](ARCHITECTURE.md) |
| **加新 AI 工具适配器** | [`ARCHITECTURE.md §6`](ARCHITECTURE.md) |
| **复制到其他项目** | [`ARCHITECTURE.md §7`](ARCHITECTURE.md) |
| **看现有经验列表** | [本文档第 §3 节](#§3-现有经验索引) |
| **看为什么这么设计** | [`ARCHITECTURE.md §10` (Part B)](ARCHITECTURE.md) |

完整规则、决策标准、流程在 [`ARCHITECTURE.md`](ARCHITECTURE.md)。本文档只做导航 + 索引。

---

## §1 目录结构

```
docs/engineering-lessons/
├── README.md                  ← 你正在看（导航 + 经验索引）
├── ARCHITECTURE.md            ← 完整规则手册（AI 操作手册 + 设计文档）
├── _meta/
│   └── schema.md              ← lesson 文件格式规范
│
├── universal/                 ← 通用经验（所有项目所有工具）
├── ai-tools/                  ← AI 工具专属（按工具分子目录）
│   ├── kiro/
│   ├── opencode/              (未来)
│   └── codex/                 (未来)
└── projects/                  ← 项目专属
    └── specforge/             (未来)
```

**三层归属判断**（详见 [`ARCHITECTURE.md §8.1`](ARCHITECTURE.md)）：

| 层级 | 何时放这里 |
|------|-----------|
| `universal/` | 任何项目任何工具都可能撞的坑 |
| `ai-tools/<tool>/` | 仅特定 AI 工具上发生的坑 |
| `projects/<project>/` | 仅本项目的坑 |

---

## §2 用户怎么用

### §2.1 沉淀新经验（最常用）

直接对 AI 说：

```
沉淀经验：<错误描述>
```

或更完整：

```
沉淀经验：[错误描述 + 错误信息原文 + 触发上下文]
```

AI 会按 [`ARCHITECTURE.md §3`](ARCHITECTURE.md) 流程自动：
1. 搜库找重复
2. 5 Whys 根因分析
3. 决策树判断处理方式（新建 / 合并 / supersedes / 跳过）
4. 写文件 + 跑 PR checklist
5. 跑适配器更新注入点
6. 报告结果

### §2.2 跑适配器（手工触发）

```bash
# Kiro：渲染到 .kiro/steering/lessons-injected.md
bun run scripts/lessons/render-kiro-steering.ts

# 仅校验，不写文件（CI 用）
bun run scripts/lessons/render-kiro-steering.ts --check

# 复制到其他项目时，不含本项目专属经验
bun run scripts/lessons/render-kiro-steering.ts --no-project
```

完整命令清单见 [`ARCHITECTURE.md §2`](ARCHITECTURE.md)。

### §2.3 跨项目复用

参考 [`ARCHITECTURE.md §7`](ARCHITECTURE.md)，三步：复制源 + 删项目专属 + 跑 `--no-project` 适配器。

---

## §3 现有经验索引

### Universal

- [async-resource-lifecycle.md](universal/async-resource-lifecycle.md) ⚠️ HIGH — Promise.race / while 轮询 / setTimeout 资源泄漏的预防与修复
- [javascript-explicit-resource-management.md](universal/javascript-explicit-resource-management.md) ⚠️ HIGH — JS 没有析构函数；Disposable 协议 + 默认安全 + 自检 API + 测试断言四层防护体系
- [shell-command-execution.md](universal/shell-command-execution.md) ⚠️ HIGH — Shell 命令执行规范（跨平台 shell 选择 + UTF-8 强制 + 危险命令拦截 + 双层超时 + 结构化返回 + 审计日志）
- [host-environment-detection.md](universal/host-environment-detection.md) ⚠️ HIGH — 宿主机环境探测与 host-profile 规范（OS / locale / shell / 工具版本扫描，Windows 优先 pwsh）

### AI Tools / Kiro

- [execute-pwsh-constraints.md](ai-tools/kiro/execute-pwsh-constraints.md) ⚠️ HIGH — Kiro `execute_pwsh` 受控壳的硬约束（禁用 cd、heredoc、单行限制等）

### AI Tools / OpenCode

- [custom-tool-self-contained.md](ai-tools/opencode/custom-tool-self-contained.md) ⚠️ HIGH — OpenCode 自定义工具必须完全自包含（禁止跨目录 import，否则所有 agent 卡死）

### Projects / SpecForge

（待写）

---

## §4 当前状态

| 指标 | 值 |
|------|-----|
| 经验数 | 5 篇 |
| 适配器数 | 1 个（render-kiro-steering） |
| 支持工具 | Kiro |
| 角色定义 | 6 个（executor / orchestrator / reviewer / debugger / architect / *） |
| 生成产物 | `.kiro/steering/lessons-injected.md` |
| 依赖 | 零（手写 YAML 解析） |

完整路线图（P0-P3 共 13 项）见 [`ARCHITECTURE.md §15`](ARCHITECTURE.md)。

---

## §5 变更记录

- **2026-05-19 v0.3**：新增两篇核心 shell 经验——`shell-command-execution.md`（执行规范）和 `host-environment-detection.md`（环境探测），为 sf_safe_bash 工具和宿主机档案提供完整规则依据；更新 `kiro/execute-pwsh-constraints.md` 增加 related 引用
- **2026-05-16 v0.2**：README 简化为导航文档，详细规则迁移到 `ARCHITECTURE.md`（避免重复）；ARCHITECTURE.md 重写为 Part A（AI 操作手册）+ Part B（设计文档）结构
- **2026-05-16 v0.1**：初版骨架建立，三层目录 + 第一篇 Kiro 经验 + Kiro 适配器
