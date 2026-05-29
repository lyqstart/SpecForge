# 项目工程规则 — PostgreSQL

<!-- 继承 _BASE.md，本文件只写 PostgreSQL 特有规则 -->

---

## 版本

```yaml
postgresql_version: "[来自 prod-environment.md 的 services.database 版本]"
# 如何决策：
#   PostgreSQL 14：稳定，大多数云平台支持
#   PostgreSQL 15：改进的 MERGE 语句，推荐新项目
#   PostgreSQL 16：并行查询改进，高性能场景
```

---

## 连接规则（覆盖 R1）

**规则**：
1. 连接串必须从环境变量读取（`DATABASE_URL` 或分字段 `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD`）
2. 不得在代码中硬编码数据库密码
3. 生产环境必须使用连接池（pgBouncer 或 ORM 内置连接池）
4. 连接池大小必须配置（不得用默认无限制）

---

## 迁移规则

```yaml
migration_tool: "[TODO-FILL]"     # 数据库迁移工具
                                  # 如何决策：
                                  #   Flyway：Java 项目常用，SQL 文件管理
                                  #   Liquibase：XML/YAML/SQL，更灵活
                                  #   Alembic：Python/SQLAlchemy 项目
                                  #   Prisma Migrate：Node.js 项目
                                  #   golang-migrate：Go 项目
```

**规则**：
1. 数据库结构变更必须通过迁移脚本，不得手动执行 DDL
2. 迁移脚本必须提交到 git
3. 迁移脚本必须可回滚（写 down migration）
4. 不得在迁移脚本中写业务逻辑

---

## 查询规则（覆盖 R6）

**规则**：
1. 不得拼接 SQL 字符串（SQL 注入风险）——必须用参数化查询或 ORM
2. 复杂查询必须有索引分析（`EXPLAIN ANALYZE`）
3. 不得在循环中执行 N+1 查询

---

## 技术栈最佳实践 — 项目应同时做的事

1. **`.gitignore` 建议添加**：
   ```
   *.sql.bak
   dump.sql
   ```

2. **推荐同时配置**：
   - 连接池配置（pgBouncer 或 ORM 连接池参数）
   - 慢查询日志（`log_min_duration_statement = 1000`）
   - 定期 VACUUM 策略
