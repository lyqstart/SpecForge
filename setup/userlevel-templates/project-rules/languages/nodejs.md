# 项目工程规则 — Node.js / TypeScript

<!-- 继承 _BASE.md 的 R1-R8，本文件只写 Node.js 特有规则 -->

---

## 版本兼容（覆盖 R3）

```yaml
node_target:
  min_version: "[来自 prod-environment.md 的 node_min]"
  # 为什么要配：Node.js 各版本对 ESM / CommonJS / 内置 API 支持不同
  # 如何决策：
  #   - Node 18 LTS：2025 年 4 月前维护，适合大多数项目
  #   - Node 20 LTS：当前主流，推荐新项目
  #   - Node 22 LTS：最新，激进项目可用

typescript_strict: true
  # 是否启用 TypeScript strict 模式
  # 为什么要配：strict 模式能在编译期发现大量运行时 bug
  # 如何决策：新项目强烈推荐 true；老项目迁移成本高可先 false
```

---

## 依赖管理（覆盖 R2）

**规则**：
1. 区分 `dependencies`（运行时需要）和 `devDependencies`（仅开发需要）
2. 锁文件（`package-lock.json` / `pnpm-lock.yaml` / `bun.lock`）必须提交
3. 不得使用 `*` 或 `latest` 作为版本号——必须指定具体版本或范围
4. 新增依赖前检查：包是否活跃维护（npm 最后发布时间）、周下载量是否合理

---

## 风格规则（覆盖 R5）

```yaml
style:
  formatter: prettier             # 代码格式化工具
                                  # 推荐：prettier（自动格式化，减少争议）
  linter: eslint                  # 代码检查工具
  indent: 2                       # 缩进空格数（prettier 默认 2）
  quotes: single                  # 字符串引号（single / double）
  semicolons: true                # 是否加分号
  import_order:                   # import 顺序
    - node-builtin                # 1. Node 内置（fs / path / os）
    - external                    # 2. 第三方包
    - internal                    # 3. 项目内部
```

---

## 日志规范（覆盖 R8）

**规则**：
1. 不得在生产代码中使用 `console.log` / `console.error`
2. 推荐日志库：`pino`（高性能）或 `winston`（功能丰富）
3. 日志必须包含 `timestamp`、`level`、`message` 三个字段

---

## 模块系统

```yaml
module_system: esm                # 模块系统
                                  # 可选：esm（推荐，现代标准）/ commonjs（老项目兼容）
                                  # 为什么要配：ESM 和 CommonJS 的 import/require 语法不同，
                                  # 混用会报错
```

---

## 测试

```yaml
test_framework: vitest            # 测试框架
                                  # 可选：
                                  #   vitest    现代，与 Vite 生态集成好，速度快
                                  #   jest      老牌，生态最大
                                  #   bun test  Bun 内置，最快
                                  # 如何决策：新项目用 vitest；已有 jest 的项目保持 jest

test_command: "bun test"          # 跑测试的命令
coverage_command: "bun test --coverage"
```

---

## 技术栈最佳实践 — 项目应同时做的事

orchestrator 在 intake 阶段会主动提醒你做以下事情：

1. **`.gitignore` 建议添加**：
   ```
   node_modules/
   dist/
   .env
   .env.local
   .env.*.local
   coverage/
   *.log
   .DS_Store
   ```

2. **推荐目录结构**：
   ```
   src/
   ├── index.ts          # 入口
   ├── config/           # 配置读取（不是配置值本身）
   ├── routes/           # 路由（Web 项目）
   ├── services/         # 业务逻辑
   ├── models/           # 数据模型
   ├── utils/            # 工具函数
   └── types/            # TypeScript 类型定义
   tests/
   ├── unit/
   ├── integration/
   └── e2e/
   ```

3. **推荐同时配置**：
   - `.editorconfig`（统一编辑器配置）
   - `tsconfig.json`（TypeScript 配置）
   - `.eslintrc.json` + `.prettierrc`（代码风格）
   - `Dockerfile`（如需容器化）
