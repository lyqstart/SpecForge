# 项目工程规则 — Java

> 使用边界：这是业务项目规则素材，模板值和版本示例不是已核验事实。命令仅作待批准 Task 的验收声明；D18 sf_safe_bash 保持只读。真实 sf-orchestrator 使用 sf_verification_plan，真实 sf-verifier 使用 sf_verification_run；不支持的命令保持 not_executed/blocked，不得改走 shell。模板不能扩大 D23 的 Windows x64 严格单进程只读 Node profile。

<!-- 继承 _BASE.md 的 R1-R8，本文件只写 Java 特有规则 -->

---

## 版本兼容（覆盖 R3）

```yaml
java_target:
  min_version: "[来自 prod-environment.md 的 java_min]"
  # 如何决策（选 LTS 版本）：
  #   - Java 8：老系统，2030 年前有商业支持，但语法落后

  build_tool: maven               # 构建工具
                                  # 可选：maven / gradle
                                  # 如何决策：
                                  #   maven：XML 配置，生态最大，企业项目常用
                                  #   gradle：Groovy/Kotlin DSL，灵活，Android 必用
```

---

## 依赖管理（覆盖 R2）

**规则**：
1. 依赖在 `pom.xml`（Maven）或 `build.gradle`（Gradle）中声明
2. 必须指定版本号，不得用 `LATEST` 或 `RELEASE`
3. 区分 `compile`（运行时）和 `test`（仅测试）scope
4. 使用 BOM（Bill of Materials）管理 Spring Boot 等框架的版本对齐

---

## 风格规则（覆盖 R5）

```yaml
style:
  formatter: google-java-format   # 代码格式化
                                  # 可选：google-java-format / checkstyle
  indent: 4                       # 缩进空格数（Java 惯例）
  max_line_length: 100
  naming:
    class: PascalCase             # 类名
    method: camelCase             # 方法名
    constant: UPPER_SNAKE_CASE    # 常量
    package: lowercase.with.dots  # 包名
```

---

## 日志规范（覆盖 R8）

**规则**：
1. 使用 SLF4J 接口 + Logback 实现（Spring Boot 默认）
2. 不得用 `System.out.println`
3. 用 `@Slf4j`（Lombok）或 `private static final Logger log = LoggerFactory.getLogger(X.class)`

---

## 测试

```yaml
test_framework: junit5            # 测试框架
                                  # 推荐：JUnit 5（现代，注解驱动）
mock_library: mockito             # Mock 库
                                  # 推荐：Mockito（Java 最流行）
test_command: "mvn test"          # 或 "gradle test"
pbt_library: jqwik                # 属性测试库（可选）
```

---

## 技术栈最佳实践 — 项目应同时做的事

1. **`.gitignore` 建议添加**：
   ```
   target/
   .class
   .jar
   .war
   .ear
   .idea/
   *.iml
   .eclipse/
   .settings/
   .project
   .classpath
   ```

2. **推荐目录结构（Maven 标准）**：
   ```
   src/
   ├── main/
   │   ├── java/com/company/app/
   │   │   ├── Application.java    # 入口
   │   │   ├── config/             # 配置类
   │   │   ├── controller/         # Web 控制器
   │   │   ├── service/            # 业务逻辑
   │   │   ├── repository/         # 数据访问
   │   │   └── model/              # 数据模型
   │   └── resources/
   │       ├── application.yml     # 配置文件（不含密码）
   │       └── application-prod.yml
   └── test/
       └── java/com/company/app/
   ```
