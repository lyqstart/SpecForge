# SpecForge 项目配置模板库

## 这是什么

这个目录包含 SpecForge 项目初始化时使用的配置模板。
每个项目在首次使用 SpecForge 时，orchestrator 会引导你从这里选择合适的模板，
复制到项目的 `.specforge/` 目录中，并根据你的具体情况填写。

## 文件结构

```
templates/
├── README.md                    ← 你正在看的这个文件
├── prod-environment.md          ← 生产环境模板
└── project-rules/               ← 项目工程规则（按技术栈拼装）
    ├── _BASE.md                 ← 通用基线（所有项目都用）
    ├── languages/               ← 主语言规则
    │   ├── nodejs.md
    │   ├── python.md
    │   ├── java.md
    │   └── go.md
    ├── frameworks/              ← 框架规则（按需选择）
    │   ├── react.md
    │   ├── vue.md
    │   ├── fastapi.md
    │   └── spring-boot.md
    ├── databases/               ← 数据库规则（按需选择）
    │   ├── postgresql.md
    │   ├── mysql.md
    │   ├── sqlite.md
    │   ├── mongodb.md
    │   └── redis.md
    └── infra/                   ← 基础设施规则（按需选择）
        ├── ci-github-actions.md
        └── docker.md
```

## 配置文件的关系

```
host-profile.json（自动扫描，用户级）
    ↓ 描述"这台机器有什么"
    ↓ 存储在 ~/.specforge/host-profile.json
    ↓ 由 @specforge/host-profile 包在 sf_project_init 时自动扫描
    ↓ sf_project_init 每次启动时检查新鲜度（30 天）

prod-environment.md（生产环境，项目级）
    ↓ 描述"生产部署的事实和要求"
    ↓ 用户在 intake 阶段填写

project-rules.md（项目规则，项目级）
    ↓ 描述"这个项目的工程纪律"
    ↓ 由 orchestrator 从本模板库拼装后，用户确认
```

## 怎么使用

### 自动方式（推荐）

首次使用 SpecForge 时，orchestrator 会自动引导你完成初始化：
1. `sf_project_init` 工具自动扫描主机环境 → 生成 `~/.specforge/host-profile.json`
2. 在 intake 阶段询问技术栈 → 拼装 `project-rules.md`
3. 在 intake 阶段询问生产环境信息 → 生成 `prod-environment.md`

### 手动方式

如果需要手动创建或修改：
1. 复制对应模板到 `.specforge/` 目录
2. 填写所有 `[TODO-FILL]` 标记的字段
3. 删除不适用的字段（或填 `null`）

## 如何扩展模板库

如果你的技术栈不在现有模板中：
1. 在对应子目录（`languages/` / `frameworks/` / `databases/` / `infra/`）新建 `.md` 文件
2. 参考现有模板的格式（继承 `_BASE.md` + 只写特有规则）
3. 每个配置项按"是什么 / 为什么要配 / 如何决策 / 默认值"四要素写

## 注意事项

- **不要把密码写在这些文件里**——密码通过环境变量或密钥管理服务注入
- **这些文件应该提交到 git**——它们描述的是配置结构，不是敏感值
- **修改后通知 SpecForge**——下次启动时 orchestrator 会检测变化并提示相关 Agent 重新评估
- **host-profile.json 是用户级的**——存储在 `~/.specforge/`，不属于任何项目，不应提交到 git
