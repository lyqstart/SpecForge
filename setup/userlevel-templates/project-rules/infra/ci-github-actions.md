# 项目工程规则 — GitHub Actions CI

<!-- 继承 _BASE.md，本文件只写 GitHub Actions 特有规则 -->

---

## 规则

1. **Secrets 管理**：所有密钥必须存在 GitHub Secrets，不得写在 workflow 文件中
2. **权限最小化**：workflow 的 `permissions` 字段只给必要权限
3. **固定 Action 版本**：使用 `@v3` 等固定版本，不用 `@latest`（防止供应链攻击）
4. **缓存依赖**：使用 `actions/cache` 缓存 node_modules / pip / maven 等，加速构建

---

## 推荐 Workflow 结构

```yaml
# .github/workflows/ci.yml 基本结构
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup [语言]
        uses: actions/setup-[语言]@v4
        with:
          [语言]-version: "[版本]"
      - name: Cache dependencies
        uses: actions/cache@v3
        # ...
      - name: Install dependencies
        run: [安装命令]
      - name: Run tests
        run: [测试命令]
      - name: Run lint
        run: [lint 命令]
```

---

## 技术栈最佳实践 — 项目应同时做的事

1. **`.gitignore` 不需要额外添加**（`.github/` 目录应该提交）
2. **推荐同时配置**：
   - Branch protection rules（main 分支必须 CI 通过才能 merge）
   - Dependabot（自动更新依赖）
