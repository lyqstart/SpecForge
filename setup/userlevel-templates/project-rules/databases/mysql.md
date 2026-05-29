# 项目工程规则 — MySQL / MariaDB

<!-- 继承 _BASE.md，本文件只写 MySQL 特有规则 -->

---

## 版本

```yaml
mysql_version: "[来自 prod-environment.md]"
# 如何决策：
#   MySQL 8.0：当前主流，支持 JSON、窗口函数，推荐
#   MySQL 5.7：EOL（2023 年 10 月），仅维护老项目
#   MariaDB 10.6+：MySQL 兼容，开源，部分云平台默认
```

---

## 连接规则（覆盖 R1）

与 PostgreSQL 相同：连接串从环境变量读，必须用连接池，不得硬编码密码。

---

## 字符集规则

**规则**：
1. 数据库和表必须使用 `utf8mb4` 字符集（不是 `utf8`——MySQL 的 utf8 是残缺的）
2. 排序规则（collation）使用 `utf8mb4_unicode_ci`（大小写不敏感）或 `utf8mb4_bin`（大小写敏感）
3. 为什么：`utf8` 不支持 emoji 等 4 字节字符，会导致数据截断

---

## 迁移规则

与 PostgreSQL 相同：必须用迁移工具，不得手动执行 DDL。

---

## 技术栈最佳实践 — 项目应同时做的事

1. 建表时显式指定 `ENGINE=InnoDB`（支持事务）
2. 所有表必须有主键
3. 外键约束显式声明（不依赖应用层保证）
