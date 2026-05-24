# 项目工程规则 — MongoDB

<!-- 继承 _BASE.md，本文件只写 MongoDB 特有规则 -->

---

## 版本

```yaml
mongodb_version: "[来自 prod-environment.md]"
# 如何决策：
#   MongoDB 6.0：当前主流，推荐
#   MongoDB 7.0：最新，性能改进
```

---

## 连接规则（覆盖 R1）

连接串（`MONGODB_URI`）必须从环境变量读取，不得硬编码。

---

## Schema 规则

**规则**：
1. 虽然 MongoDB 是 schema-less，但应用层必须有 schema 定义（Mongoose / Pydantic / 等）
2. 不得直接存储未经验证的用户输入
3. 索引必须在代码中显式定义，不得依赖手动创建

---

## 查询规则（覆盖 R6）

**规则**：
1. 不得使用 `$where`（JavaScript 注入风险）
2. 不得使用 `eval()`
3. 用户输入的查询条件必须经过类型验证（防止 NoSQL 注入）

---

## 技术栈最佳实践 — 项目应同时做的事

1. 为高频查询字段创建索引
2. 设置文档大小限制（避免单文档过大）
3. 定期备份策略
