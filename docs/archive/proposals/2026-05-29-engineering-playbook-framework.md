# 方案 B：SpecForge 工程治理框架（Engineering Playbook）

**提案日期**：2026-05-29
**状态**：草案，待评审
**作者**：sf-orchestrator + 用户协作讨论
**关联**：本提案的前置基础——目录结构治理见 `2026-05-29-directory-structure-governance.md`（方案 A）
**依赖**：方案 A 必须先落地完成

---

## 1. 背景与目标

### 1.1 问题来源

用户在使用 Kiro 工具开发本项目时，发现其 `PROGRESS.md` + `v6-development-workflow.md`（路线图）+ `tasks.md` 三件套提供了极佳的开发体验：

- **任何时候退出再进入开发，都能秒接上次进度**
- **完成一个 feature，系统提示后面的开发任务**
- **能随时调整后续版本规划**
- **有完整的开发记录 + 路线图，用户可以专注开发**

用户希望在 OpenCode + SpecForge 的项目中也有类似机制，并且这套机制应能**通用化**，让每个新项目都能复用经验。

### 1.2 目标

从软件工程专业角度，建立一套**完整的项目治理框架**，覆盖：

| 维度 | 目标 |
|------|------|
| **有序** | 任何时候打开项目都能秒懂现状 |
| **可控** | 决策可追溯，变更可追踪 |
| **质量** | 完成有标准，评审有清单 |
| **效率** | 模板复用，AI 自动维护 |

### 1.3 业内标准命名

这套机制业内通行的名字叫 **"Engineering Playbook"**（工程手册），是 Microsoft、Spotify、ThoughtWorks 等公司倡导的实践。本提案沿用此命名。

---

## 2. 业界最佳实践参考

按重要度排序的业内成熟实践：

| 实践 | 来源 | 核心价值 | 本提案采纳 |
|------|------|---------|----------|
| **ADR (Architecture Decision Record)** | Michael Nygard, 2011 | 决策可追溯、不丢失"为什么" | ✅ |
| **Engineering Playbook** | Microsoft / Spotify | 一站式工程手册，新人 onboarding 利器 | ✅ |
| **Definition of Done (DoD)** | Scrum / 敏捷 | 明确"完成"的标准，防止 80% 完成度自欺欺人 | ✅ |
| **Definition of Ready (DoR)** | 敏捷 | 任务进入开发前的就绪标准 | ✅ |
| **PROGRESS.md / ROADMAP.md** | Linux Kernel / React | 状态可见性，断点续作 | ✅ |
| **ARCHITECTURE.md** | matklad (Rust-analyzer) | 单文件架构入口，新人 30 分钟理解系统 | ✅ |
| **Conventional Commits** | conventionalcommits.org | commit 信息标准化，自动生成 CHANGELOG | ✅ |
| **Semantic Versioning** | semver.org | 版本号语义化 | ✅ |
| **CONTRIBUTING.md** | GitHub 标准 | 协作规则入口 | ✅ |
| **Keep a Changelog** | keepachangelog.com | CHANGELOG 标准格式 | ✅ |
| **CODEOWNERS** | GitHub | 代码所有权 + 强制评审 | ⚠️ 团队场景 |
| **Postmortem / Engineering Lessons** | Google SRE | 故障复盘库 | ✅ SpecForge 已有 |
| **C4 Model** | Simon Brown | 架构 4 层可视化 | ⚠️ 进阶 |

---

## 3. ADR 与 WI design.md 的单向溯源关系

### 3.1 核心问题

WI 的 `design.md` 里也包含架构内容，与 ADR 是否冲突？

### 3.2 结论

**不冲突，但必须分层 + 单向溯源。**

### 3.3 两者的本质区别

| 维度 | WI 的 design.md | docs/adr/ADR-XXX.md |
|------|----------------|---------------------|
| **粒度** | 单个 Work Item 的**完整设计**（含 5W2H） | 单条**跨 WI、影响系统级**的关键决策 |
| **生命周期** | 与 WI 绑定，随 WI 完成而封存 | 永久存活，是系统的"宪法" |
| **内容** | 设计细节、方案对比、技术选型、接口定义、数据模型、测试策略 | 只有：**Context（背景）+ Decision（决策）+ Consequences（后果）+ Status（状态）** |
| **可变性** | WI 内可迭代修改 | **不可变**，要撤销必须写新 ADR 标记旧的为 superseded |
| **数量** | 每个 WI 一份 | 整个系统 10-50 份足够（精炼） |
| **读者** | 当前/未来开发本 WI 的人 | 任何想理解"为什么系统长这样"的人（包括 5 年后的新人） |

### 3.4 单向溯源关系

```
                  WI design.md（设计的全部细节）
                          │
                          │ 提取关键决策
                          ▼
                  docs/adr/ADR-XXX.md（决策的精炼存档）
                  
                  反向引用：ADR 顶部必须有 "Source: WI-XXX"
                  WI 引用：design.md 可以写 "本设计基于 ADR-006"
```

**单向规则**：
- ✅ ADR **必须**反向引用来源 WI
- ✅ WI design.md **可以**引用现有 ADR（重用既有决策）
- ❌ 禁止"同一决策两边都详写"——只在 design.md 详写，ADR 写精炼版

### 3.5 ADR 升级判定标准

满足任一条件即应升级为 ADR：

| 判定条件 | 例子 |
|---------|------|
| 影响多个模块/包 | "全系统用 .specforge/ 而非 specforge/" |
| 改变后回滚成本极高 | "用 HTTP/1.1+SSE 而非 gRPC" |
| 与之前 ADR 冲突或修订 | "撤销 ADR-006，改用 specforge/" |
| 涉及外部依赖选型 | "用 Bun 不用 Node.js" |
| 安全/合规决策 | "敏感字段禁止项目级覆盖" |
| 引入新概念/抽象 | "引入 CAS 内容寻址存储" |

### 3.6 工作流集成

| 阶段 | Agent | 动作 |
|------|-------|------|
| design 阶段 | sf-design | 在 design.md 写"## 关键决策"段，并标注 `[ADR-CANDIDATE]` tag |
| review 阶段 | sf-reviewer | 校验候选 ADR 的判定（漏标/错标提醒） |
| WI 完成时 | sf-knowledge | 自动提取候选 ADR 写入 `docs/adr/`，标记 status="proposed" |
| WI 完成后 | 用户（人） | 最终评审并 promote 到 status="accepted" |

**冲突彻底消除的关键**：
- WI design.md 的"## 关键决策"段 = 候选 ADR 的**唯一源**
- ADR 是**派生物**，不是平行物
- 如果出现"ADR 和 design.md 内容不一致" → 必然是 ADR 落后于 WI，回去同步

---

## 4. Engineering Playbook 核心文件规范

### 4.1 文件清单

```
<用户项目>/
├── README.md                          # 项目门面（用户写）
├── ARCHITECTURE.md                    # ★ 架构总图（单文件入口）
├── PROGRESS.md                        # ★ 项目进度驾驶舱（daemon 自动维护机器区）
├── ROADMAP.md                         # ★ 路线图（用户 + AI 协作维护）
├── CHANGELOG.md                       # 变更日志（半自动）
├── CONTRIBUTING.md                    # 贡献指南
├── CODE_OF_CONDUCT.md                 # 行为准则（可选）
│
├── docs/
│   ├── conventions/                   # 约定中心（前面方案 A 已定）
│   │   ├── README.md
│   │   ├── coding-standards.md       # ★ 编码规范
│   │   ├── git-workflow.md           # ★ Git 工作流约定
│   │   ├── commit-convention.md      # ★ Conventional Commits 规则
│   │   ├── definition-of-done.md     # ★ 完成定义
│   │   ├── definition-of-ready.md    # ★ 就绪定义
│   │   ├── review-checklist.md       # ★ Code Review 清单
│   │   └── (其他 conventions)
│   ├── adr/                           # 架构决策记录
│   ├── engineering-lessons/           # 经验库
│   └── runbooks/                      # ★ 运维手册（部署/回滚/事故响应）
│
└── .specforge/                        # SpecForge 数据（方案 A 已定）
```

### 4.2 ① PROGRESS.md 规范

**作用**：用户任何时候打开都能秒懂"现在到哪了"。

**结构样式**：

```md
# 项目进度

<!-- BEGIN: specforge-managed -->
## 当前状态
- **里程碑**：M2 用户管理系统
- **当前 Wave**：W3 用户认证
- **活跃 WI**：WI-031（登录功能修复）、WI-032（注册流程）
- **下次入口**：WI-031 的 review 阶段

## 活跃 Work Items
| WI | 工作流 | 阶段 | 阻塞 | 备注 |
|---|---|---|---|---|
| WI-031 | bugfix_spec | review | — | 等用户确认 review_report |
| WI-032 | feature_spec | tasks | — | tasks_gate 通过待开始 development |

## 上次会话摘要
- 完成了 WI-030 的验证
- WI-031 进入 review 阶段
- 发现 WI-032 的设计有边界条件遗漏，已回退到 design 阶段

## 变更日志
- 2026-05-29 WI-031 流转到 review
- 2026-05-28 WI-030 流转到 completed
<!-- END: specforge-managed -->

<!-- BEGIN: user-managed -->
## 已完成里程碑
- M1 基础架构（2026-04-01 完成，含 WI-001 ~ WI-015）

## 阻塞 / 开放问题
- WI-028 因外部依赖未就绪暂停
<!-- END: user-managed -->
```

**维护责任**：
- `<!-- BEGIN: specforge-managed -->` 区域：**daemon 在每次 sf_state_transition 自动更新**
- `<!-- BEGIN: user-managed -->` 区域：**用户手动维护**（里程碑、阻塞）
- 关键设计：marker 区分"机器维护区"和"人维护区"，互不覆盖

### 4.3 ② ROADMAP.md 规范

**作用**：长期规划。用户决定"做什么"，AI 知道"接下来该提什么"。

**结构样式**：

```md
# 项目路线图

## 愿景
（一句话讲清产品要解决的问题）

## 里程碑

### M1 基础架构（已完成 2026-04-01）
- ✅ 选型与脚手架
- ✅ 数据库 schema
- ✅ 用户模型

### M2 用户管理系统（进行中，预计 2026-06-15）
#### Wave 3：用户认证（当前）
- ⏳ WI-031 登录修复
- ⏳ WI-032 注册流程
- 📋 WI-033 OAuth 集成（待启动）

#### Wave 4：用户中心（下一步）
- 📋 个人资料管理
- 📋 隐私设置

### M3 内容系统（规划中）
- 文章 CRUD
- 评论系统

## 已弃用 / 不做的事
- ❌ 多语言（暂时只做中文，留 V2）
- ❌ 移动端 App（先做 Web）
```

**维护责任**：用户手写为主，AI 在 WI 完成时**提议**追加新条目（"我建议把 X 加入 Wave 5"），用户决定接不接受。

### 4.4 ③ ARCHITECTURE.md 规范

**作用**：matklad 著名博客倡导的"单文件让新人 30 分钟懂全局"。

**结构样式**：

```md
# 架构总览

## 大局图
（用 mermaid 画系统的 3-5 个核心组件 + 数据流）

## 核心概念
- **Daemon**：单例进程，所有状态的 Source of Truth
- **WI（Work Item）**：一次完整开发任务的容器
- **Gate**：阶段流转的质量门禁

## 模块清单
| 模块 | 路径 | 职责 | 关键 ADR |
|---|---|---|---|
| daemon-core | packages/daemon-core | 状态管理 + 事件溯源 | ADR-008 |
| auth | packages/auth | 用户认证 | ADR-012 |

## 关键设计决策
（链接到 docs/adr/，不重复内容）

## 不要这么做
（业内最有价值的部分：踩过的坑，避免重蹈覆辙）
- 不要在 WI design.md 里写跨 WI 的决策（用 ADR）
- 不要绕过 Gate 工具
```

**维护责任**：用户/架构师手写，**每次 ADR 新增时强制同步**（CI 检查）。

### 4.5 ④ CHANGELOG.md 规范

遵循 [Keep a Changelog](https://keepachangelog.com/) 标准 + Conventional Commits。

**结构样式**：

```md
# Changelog

## [Unreleased]
### Added
- 用户邮箱验证功能 (WI-031)

## [1.2.0] - 2026-05-20
### Added
- OAuth 登录 (WI-025)
### Fixed
- 修复并发注册时的竞态 (WI-028)
### Changed
- Token 过期时间改为 15 分钟 (ADR-014)
```

**维护责任**：
- daemon 在 WI 完成时**自动追加** Unreleased 段
- 用户在发布时手动 promote Unreleased → 新版本号

### 4.6 ⑤ Definition of Done 规范

**作用**：Scrum 最有价值的实践之一，防止"我觉得做完了"。

**结构样式**（写入 `docs/conventions/definition-of-done.md`）：

```md
# Definition of Done

一个 Work Item 只有满足以下**全部**条件才算"完成"：

## 代码
- [ ] 所有 tasks.md 的任务勾选完成
- [ ] 代码遵循 coding-standards.md
- [ ] 无 TODO/FIXME 注释（或已转为新 WI）

## 测试
- [ ] 单元测试覆盖率 ≥ 80%（核心模块 ≥ 90%）
- [ ] 集成测试通过
- [ ] 手动验证通过

## 文档
- [ ] CHANGELOG 已追加
- [ ] 影响公共 API 时已更新 API 文档
- [ ] 关键决策已写入 design.md 的"关键决策"段（候选 ADR）

## 评审
- [ ] sf-reviewer 通过
- [ ] sf-verifier 通过
- [ ] 用户最终确认

## 治理
- [ ] _meta.json 的 summary / key_decisions 字段已填
- [ ] PROGRESS.md 自动更新已生效
```

**SpecForge 集成**：`sf_verification_gate` 把 DoD 作为检查清单的输入。

### 4.7 ⑥ Definition of Ready 规范

**作用**：任务进入开发前的就绪标准，防止"还没想清楚就开干"。

**结构样式**（写入 `docs/conventions/definition-of-ready.md`）：

```md
# Definition of Ready

一个 Work Item 进入 development 阶段前必须满足：

## 需求清晰
- [ ] requirements.md 已通过 requirements_gate
- [ ] 所有验收标准已用 EARS 格式表达
- [ ] 边界场景已识别（拒绝项、未来项已分类）

## 设计就绪
- [ ] design.md 已通过 design_gate
- [ ] 关键决策段已填（候选 ADR 已标记）
- [ ] 涉及的模块路径已识别（写入 _meta.json）

## 任务可执行
- [ ] tasks.md 已通过 tasks_gate
- [ ] 每个 task 有明确的验证命令
- [ ] 依赖关系已标注（同 Wave 任务可并行）

## 资源到位
- [ ] 外部依赖可用（API、Token、测试数据）
- [ ] 必要的环境变量已配置
```

**SpecForge 集成**：`sf_tasks_gate` 把 DoR 作为检查清单的输入。

---

## 5. 治理框架与 SpecForge 集成

这套"工程手册"和 SpecForge 不是两套东西，而是**互相支撑**：

| 治理文件 | SpecForge 中由谁/怎么维护 |
|---------|--------------------------|
| PROGRESS.md | daemon 在 sf_state_transition 自动更新机器维护区 |
| ROADMAP.md | 用户手写 + orchestrator 在 WI 完成时建议追加 |
| ARCHITECTURE.md | 用户手写 + CI 检查"ADR 是否被引用" |
| CHANGELOG.md | daemon 在 WI 完成时自动追加 Unreleased |
| ADR | sf-knowledge 从 WI design.md 自动提取候选 |
| DoD | sf_verification_gate 内置检查清单 |
| DoR | sf_tasks_gate 内置检查清单 |
| coding-standards.md | 用户从模板修改 + sf-reviewer 引用 |
| engineering-lessons | sf-knowledge 在 WI 完成时沉淀 |

**关键洞察**：你之前看到的 Kiro 的 PROGRESS.md + roadmap 模式好用，**本质上是因为 AI 把"项目状态可见性"做成了基础设施**。SpecForge 已经有这个基础（state.json + events.jsonl），但**没暴露给用户视图**。补上 PROGRESS.md / ROADMAP.md / ARCHITECTURE.md / CHANGELOG.md 就完整了。

---

## 6. 模板包结构

### 6.1 位置

所有模板放在 `setup/userlevel-templates/engineering-playbook/`：

```
setup/userlevel-templates/
├── dev-environment.md             # 已有
├── prod-environment.md            # 已有
├── project-rules/                 # 已有（保留，作为 conventions/ 的内容）
│   ├── _BASE.md
│   ├── languages/
│   ├── frameworks/
│   └── ...
└── engineering-playbook/          # ★ 新建：项目治理模板包
    ├── README.md                  # 模板说明
    ├── ARCHITECTURE.md.template
    ├── PROGRESS.md.template
    ├── ROADMAP.md.template
    ├── CHANGELOG.md.template
    ├── CONTRIBUTING.md.template
    ├── docs/
    │   ├── adr/0000-template.md
    │   ├── runbooks/template.md
    │   └── conventions/
    │       ├── coding-standards.md.template
    │       ├── definition-of-done.md.template
    │       ├── definition-of-ready.md.template
    │       ├── git-workflow.md.template
    │       ├── commit-convention.md.template
    │       └── review-checklist.md.template
    └── .github/
        ├── pull_request_template.md
        └── ISSUE_TEMPLATE/
            ├── feature_request.md
            └── bug_report.md
```

### 6.2 用户体验流程

1. 安装 SpecForge：`bun scripts/sf-installer.ts install`
2. 在新项目目录开 OpenCode
3. Plugin 检测到项目未初始化，引导：
   > "检测到这是一个新项目。是否启用工程手册（Engineering Playbook）？
   > - 推荐：是（部署完整模板，30+ 文件）
   > - 最小：否（只创建 .specforge/，自己定治理方式）
   > - 自定义：选择要部署的模块（架构/进度/规范/CI...）"
4. 用户选完 → Plugin 复制模板到项目根 → 引导用户填关键字段（项目名、技术栈等）
5. 后续 SpecForge 工作流自动维护这些文件的"机器维护区"

---

## 7. 提升 4 维度的关键机制

### 7.1 有序

- **强制状态机**（SpecForge 已有）：所有变更走 sf_state_transition
- **WI 唯一标识**（已有）：所有产物挂在 WI 下
- **Gate 不可绕过**（已有）：质量门禁
- **新增：PROGRESS.md + ROADMAP.md**：长尾可见性

### 7.2 可控

- **ADR 单向溯源**（本提案新增）：决策有迹可循
- **CHANGELOG 半自动**（本提案新增）：变更可追踪
- **Definition of Done**（本提案新增）：完成有标准
- **CI Lint + Architecture Test**（方案 A 已定）：偏离立刻发现

### 7.3 质量

- **三道强制门**（方案 A 已定）：layout 偏离不可入主干
- **engineering-lessons**（已有）：故障不重蹈
- **Review Checklist**（本提案新增）：评审有标准
- **TDD 流程**（已有 skill）：测试驱动

### 7.4 效率

- **断点续作**（已有 sf_continuity）：跨会话续接
- **PROGRESS.md 驾驶舱**（本提案新增）：30 秒回到上下文
- **AI 自动维护机器区**（本提案新增）：用户不用手动同步
- **模板包**（本提案新增）：新项目 5 分钟初始化

---

## 8. 落地路径（独立于方案 A，待方案 A 完成后启动）

### Phase Q0：基础设施搭建

**预估改动量**：< 1500 行

| 任务 | 内容 |
|------|------|
| T1 | 设计 `_meta.json` 的 zod schema |
| T2 | 实现 `scripts/render-progress-md.ts` 生成器 |
| T3 | 实现 `scripts/render-changelog.ts` 生成器 |
| T4 | daemon 集成：状态流转后调用生成器 |
| T5 | 扩展 `sf_design_gate` 检查"## 关键决策"段 |
| T6 | 扩展 `sf_requirements_gate` 检查"## 摘要"段 |

### Phase Q1：模板包建设

**预估改动量**：30+ 模板文件

| 任务 | 内容 |
|------|------|
| T1 | 编写 `setup/userlevel-templates/engineering-playbook/` 全部模板 |
| T2 | 实现 Plugin 的"是否启用工程手册"交互引导 |
| T3 | sf-installer.ts 支持模板部署 |
| T4 | 编写每个模板的使用文档 |

### Phase Q2：ADR 自动提取与 DoD/DoR 集成

**预估改动量**：< 1000 行

| 任务 | 内容 |
|------|------|
| T1 | sf-knowledge 实现"WI 完成时提取候选 ADR" |
| T2 | sf_verification_gate 集成 DoD 检查清单 |
| T3 | sf_tasks_gate 集成 DoR 检查清单 |
| T4 | sf-reviewer 集成 review-checklist.md |
| T5 | ADR-WI 双向引用的 CI 校验 |

### Phase Q3：体验打磨与文档完善

**预估改动量**：纯文档

| 任务 | 内容 |
|------|------|
| T1 | 完善 `docs/conventions/` 全部内容 |
| T2 | 写"快速上手"指南 |
| T3 | 录制简短演示视频（可选） |
| T4 | 在 README 加入工程手册入口 |

---

## 9. 决策记录

| ID | 决策 | 来源 | 状态 |
|----|------|------|------|
| 新-7 | ADR 与 WI design.md 单向溯源：ADR 是 WI design.md 的派生物 | 用户讨论 | 待确认 |
| 新-8 | 引入完整 Engineering Playbook 模板包 | 用户讨论 | 待确认 |
| 新-9 | daemon 自动维护机器维护区（PROGRESS、CHANGELOG） | 用户讨论 | 待确认 |
| 新-10 | Definition of Done 集成到 sf_verification_gate | 用户讨论 | 待确认 |
| 新-11 | Definition of Ready 集成到 sf_tasks_gate | 本提案新增 | 待确认 |

---

## 10. 验收标准

本方案的落地完成时必须满足：

- [ ] 用户项目首次初始化时，Plugin 引导部署 Engineering Playbook
- [ ] 项目根有 ARCHITECTURE.md / PROGRESS.md / ROADMAP.md / CHANGELOG.md
- [ ] PROGRESS.md 在状态流转后自动更新机器维护区
- [ ] CHANGELOG.md 在 WI 完成时自动追加 Unreleased
- [ ] design.md 缺"## 关键决策"段时 design_gate 拒绝
- [ ] WI 完成时 sf-knowledge 输出候选 ADR
- [ ] sf_verification_gate 输出 DoD 满足情况
- [ ] sf_tasks_gate 输出 DoR 满足情况
- [ ] `docs/conventions/` 内容完整
- [ ] 用户能从模板包修改得到自己的项目治理规则

---

## 11. 与方案 A 的依赖关系

| 维度 | 方案 A 提供 | 方案 B 使用 |
|------|-----------|------------|
| 目录结构 | `.specforge/` 下完整结构 | 在结构上加载 PROGRESS.md / ROADMAP.md 等 |
| Schema | `directory-layout.ts` | 引用其中的 specsReadme 等常量 |
| _meta.json | 字段定义和 zod schema | 用于驱动 specs/README.md 渲染 |
| 模板系统 | `setup/userlevel-templates/` 框架 | 增加 `engineering-playbook/` 子目录 |
| 自动维护 | specs/README.md 由 daemon 维护 | 类比扩展到 PROGRESS.md / CHANGELOG.md |

**严格依赖**：方案 A 不完成，方案 B 无法启动。

---

## 12. 引用

- ADR (Michael Nygard)：https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- ARCHITECTURE.md (matklad)：https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html
- Keep a Changelog：https://keepachangelog.com/
- Conventional Commits：https://conventionalcommits.org/
- 关联方案：`docs/proposals/2026-05-29-directory-structure-governance.md`（方案 A）
