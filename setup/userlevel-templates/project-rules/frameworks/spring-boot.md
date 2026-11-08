# 项目工程规则 — Spring Boot

> 使用边界：这是业务项目规则素材，模板值和版本示例不是已核验事实。命令仅作待批准 Task 的验收声明；D18 sf_safe_bash 保持只读。真实 sf-orchestrator 使用 sf_verification_plan，真实 sf-verifier 使用 sf_verification_run；不支持的命令保持 not_executed/blocked，不得改走 shell。模板不能扩大 D23 的 Windows x64 严格单进程只读 Node profile。

<!-- 继承 _BASE.md + languages/java.md，本文件只写 Spring Boot 特有规则 -->

---

## 版本

```yaml
spring_boot_version: "3.x"       # Spring Boot 版本
                                  # 如何决策：
                                  #   Spring Boot 2.x：支持 Java 8+，老项目

spring_data: jpa                  # 数据访问层
                                  # 可选：jpa（ORM）/ jdbc（原生 SQL）/ r2dbc（响应式）
```

---

## 配置规则（覆盖 R1）

**Spring Boot 特有**：
1. 配置文件用 `application.yml`（不用 `.properties`，YAML 更清晰）
2. 敏感配置（密码/密钥）必须用环境变量或 Spring Cloud Config / Vault
3. 不同环境用 Profile：`application-dev.yml` / `application-prod.yml`
4. 不得把 `application-prod.yml` 提交到 git（含生产密码）

---

## 技术栈最佳实践 — 项目应同时做的事

1. **`.gitignore` 建议添加**（在 java.md 基础上）：
   ```
   application-prod.yml
   application-local.yml
   *.jks
   *.p12
   ```

2. **推荐目录结构**：
   ```
   src/main/java/com/company/app/
   ├── Application.java
   ├── config/                   # @Configuration 类
   ├── controller/               # @RestController
   ├── service/                  # @Service（接口 + 实现）
   ├── repository/               # @Repository（JPA Repository）
   ├── entity/                   # @Entity（数据库实体）
   ├── dto/                      # 数据传输对象（请求/响应）
   └── exception/                # 自定义异常 + @ControllerAdvice
   ```
