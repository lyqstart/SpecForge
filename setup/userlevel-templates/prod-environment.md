# 生产环境配置

<!-- 这是什么 -->
这份文件描述你的生产环境事实和部署要求。它有两个用途：
1. **设计参考**：sf-design 在做架构决策时，必须保证设计在生产环境能跑通
2. **部署 Gate**：未来的 `scan-prod-environment.ts` 会扫描真实生产环境，
   与这份文件对账——不满足则阻断部署

<!-- 谁在什么时候用 -->
- **sf-design**：架构设计时参考生产约束（版本/资源/网络）
- **sf-task-planner**：verification_command 必须能在生产最低版本通过
- **sf-verifier**：L9 兼容性测试按生产版本跑
- **sf-debugger**：排查问题时知道去哪里看日志、怎么登录

<!-- 怎么用 -->
1. 在 intake 阶段，orchestrator 会引导你填写这份文件
2. 只填与你项目相关的字段，不相关的字段删掉或填 null
3. 标有 `[TODO-FILL]` 的字段是必填项
4. 标有 `[SCAN-FUTURE]` 的字段未来会由扫描器自动填，现在手动填

---

## 配置项

### 基本身份

```yaml
deployment_target: docker         # 部署目标类型
                                  # 可选值：
                                  #   bare-metal      物理服务器或普通云 VM
                                  #   docker          Docker 容器（单机）
                                  #   docker-compose  Docker Compose 多容器
                                  #   k8s             Kubernetes
                                  #   serverless-aws  AWS Lambda
                                  #   serverless-gcp  GCP Cloud Functions
                                  #   serverless-azure Azure Functions
                                  #   desktop-app     桌面应用（Electron/Qt/WPF）
                                  #   mobile-ios      iOS App
                                  #   mobile-android  Android App
                                  # 为什么要配：部署方式决定了打包格式、
                                  # 配置注入方式、日志收集方式

environment_name: production      # 环境名称
                                  # 例：production / staging / uat
```

---

### 操作系统（生产服务器）

```yaml
os:
  platform: linux                 # 生产服务器平台
                                  # 可选：linux / windows / darwin（少见）
  distro: "[TODO-FILL]"           # Linux 发行版（如适用）
                                  # 例：Ubuntu 22.04 / CentOS 7 / Alpine 3.18
  arch: x64                       # CPU 架构
                                  # 可选：x64 / arm64
  totalmem_gb: "[TODO-FILL]"      # 生产服务器内存 GB [SCAN-FUTURE]
  cpu_count: "[TODO-FILL]"        # 生产服务器 CPU 核数 [SCAN-FUTURE]
  disk_free_gb: "[TODO-FILL]"     # 可用磁盘 GB [SCAN-FUTURE]
```

---

### 语言运行时（生产最低版本）

```yaml
runtimes:
  # ⚠️ 重要：这里填的是生产环境的最低版本
  # executor 写的代码必须在这个版本通过编译/lint
  # verifier 的 L9 兼容性测试必须在这个版本跑通

  # 只填项目实际使用的语言，其他删掉
  python_min: "3.8"               # 生产 Python 最低版本
                                  # 为什么要配：Python 3.9+ 有 walrus 等新语法，
                                  # 如果生产是 3.8，这些语法会报错
  node_min: "18.0.0"              # 生产 Node.js 最低版本
  java_min: "11"                  # 生产 Java 最低版本（LTS 版本号）
  dotnet_min: "6.0"               # 生产 .NET 最低版本
  go_min: "1.21"                  # 生产 Go 最低版本
```

---

### 本地化（生产环境）

```yaml
locale:
  # ⚠️ 重要：生产环境的时区可能与开发环境不同
  # 所有日期时间处理必须显式指定时区，不能依赖系统默认

  tz_name: UTC                    # 生产服务器时区
                                  # 推荐：UTC（避免夏令时问题）
                                  # 如果业务强依赖本地时间：Asia/Shanghai 等
                                  # 为什么要配：日志时间戳、定时任务的基准

  system_lang: en-US              # 生产服务器系统语言
                                  # 通常是 en-US（Linux 服务器默认）
                                  # 为什么要配：影响错误消息语言、日期格式解析
```

---

### 网络与访问

```yaml
network:
  has_internet: true              # 生产服务器是否有外网访问
                                  # 为什么要配：无外网时代码不能调用外部 API，
                                  # 依赖包必须走内网镜像

  internal_only: false            # 是否仅内网访问（不对外暴露）

  pip_index_url: null             # 生产环境 Python 包镜像源
  npm_registry: null              # 生产环境 npm 镜像源
  maven_mirror: null              # 生产环境 Maven 镜像源

  # 服务器访问信息（sf-debugger 排查问题时需要）
  ssh_command: "[TODO-FILL]"      # SSH 连接命令
                                  # 例：ssh ops@prod-01.company.com
                                  # 无 SSH 访问填 null

  ssh_key_path: null              # SSH 私钥路径（如需要）
  jump_host: null                 # 跳板机（如需要）
  vpn_required: false             # 是否需要 VPN
```

---

### 服务地址（IP / 端口 / 域名 / SSL）

```yaml
services:
  # 为什么要配：代码中不得硬编码这些值，必须从配置文件或环境变量读取
  # 这里记录的是"事实"，代码里用环境变量名引用

  app:
    host: "[TODO-FILL]"           # 应用服务器 IP 或域名
                                  # 例：10.0.0.5 / app.company.com
    port: 8080                    # 应用监听端口
    domain: "[TODO-FILL]"         # 对外域名（如有）
                                  # 例：www.company.com
    ssl_enabled: true             # 是否启用 HTTPS
                                  # 为什么要配：影响 cookie 的 Secure 属性、
                                  # HSTS 配置、重定向逻辑
    ssl_cert_path: null           # SSL 证书路径（如自管理）
                                  # 例：/etc/ssl/certs/app.crt

  database:
    host: "[TODO-FILL]"           # 数据库服务器地址 [SCAN-FUTURE]
    port: 5432                    # 数据库端口（PostgreSQL 默认 5432）
    name: "[TODO-FILL]"           # 数据库名
    # ⚠️ 不要在这里填密码！密码必须用环境变量或密钥管理服务

  cache:
    host: null                    # 缓存服务器地址（无缓存填 null）
    port: 6379                    # Redis 默认端口

  message_queue:
    host: null                    # 消息队列地址（不用填 null）
    port: null

  object_storage:
    provider: null                # 对象存储提供商
                                  # 例：aws-s3 / azure-blob / minio / local-fs
    bucket: null                  # Bucket 名称
    region: null                  # 区域（AWS S3 等需要）
    endpoint: null                # 自定义端点（MinIO 等私有部署）
```

---

### 路径

```yaml
paths:
  # 为什么要配：代码中不得硬编码路径，必须从配置读取
  # sf-debugger 排查问题时需要知道去哪里看日志

  app_root: "[TODO-FILL]"         # 应用部署根目录
                                  # 例：/opt/myapp / C:\inetpub\myapp
  config_dir: "[TODO-FILL]"       # 配置文件目录
                                  # 例：/etc/myapp / /opt/myapp/config
  log_dir: "[TODO-FILL]"          # 日志目录
                                  # 例：/var/log/myapp
  temp_dir: null                  # 临时文件目录（null 表示用系统默认）
  data_dir: null                  # 数据目录（如有持久化数据）
```

---

### 资源限制

```yaml
resource_limits:
  # 为什么要配：executor 写代码时不能假设无限资源
  # 例如：不能无限制地开线程、不能假设内存够大

  max_memory_mb: null             # 内存上限（容器/JVM 等）
                                  # 例：512 / 2048 / null（无限制）
  max_cpu_cores: null             # CPU 核数上限
  max_file_handles: null          # 文件句柄上限（Linux ulimit）
  run_as_root: false              # 是否以 root 运行
                                  # 为什么要配：非 root 时某些操作需要 sudo 或权限调整
  container_runtime: docker       # 容器运行时（如适用）
                                  # 可选：docker / containerd / podman / null
```

---

### CI/CD

```yaml
cicd:
  platform: github-actions        # CI 平台
                                  # 可选：github-actions / gitlab-ci / jenkins /
                                  #        azure-devops / circleci / none
  trigger: push-to-main           # 触发条件
                                  # 例：push-to-main / tag / manual / pr
  test_command: "[TODO-FILL]"     # CI 中跑测试的命令
                                  # 例：bun test / pytest / mvn test
  deploy_command: "[TODO-FILL]"   # 部署命令
                                  # 例：./scripts/deploy.sh / kubectl apply -f k8s/
  rollback_command: null          # 回滚命令（如有）
  restart_command: "[TODO-FILL]"  # 重启服务命令
                                  # 例：systemctl restart myapp / docker restart myapp
```

---

### 观测（日志/指标/追踪）

```yaml
observability:
  log_framework: "[TODO-FILL]"    # 日志框架
                                  # 例：winston / pino / logback / zap / slog
                                  # 为什么要配：executor 写日志代码时用这个框架

  log_format: json                # 日志格式
                                  # 可选：json（推荐，便于机器解析）/ text
                                  # 为什么要配：json 格式便于 ELK/Loki 等收集

  log_level: info                 # 生产日志级别
                                  # 可选：debug / info / warn / error
                                  # 为什么要配：debug 级别在生产会产生大量日志

  metrics_system: null            # 指标系统（如有）
                                  # 例：prometheus / datadog / cloudwatch / null

  tracing_system: null            # 分布式追踪（如有）
                                  # 例：jaeger / zipkin / opentelemetry / null
```

---

### 安全

```yaml
security:
  credential_management: env-vars # 凭证管理方式
                                  # 可选：
                                  #   env-vars      环境变量（最简单）
                                  #   vault         HashiCorp Vault
                                  #   aws-secrets   AWS Secrets Manager
                                  #   azure-keyvault Azure Key Vault
                                  #   k8s-secrets   Kubernetes Secrets
                                  # 为什么要配：executor 写凭证读取代码时用这个方式

  tls_required: true              # 是否强制 TLS（HTTPS）
  auth_method: null               # 认证方式（如有）
                                  # 例：jwt / oauth2 / session / api-key / null
```

---

### 部署要求（未来 scan-prod-environment 对账用）

```yaml
deploy_requirements:
  # 这一段定义"部署前必须满足的条件"
  # 未来 scan-prod-environment.ts 会扫描生产环境，与这里对账
  # 不满足则阻断部署

  min_disk_free_gb: 5             # 部署前最少可用磁盘 GB
  min_memory_free_mb: 512         # 部署前最少可用内存 MB
  required_ports_open:            # 必须开放的端口
    - 80
    - 443
  required_services_reachable:    # 必须可连接的服务
    - database
    - cache
  required_env_vars:              # 必须存在的环境变量（不含值，只检查存在）
    - DATABASE_URL
    - SECRET_KEY
    - APP_ENV
```

---

## 常见问题

**Q：生产环境的密码/密钥填在哪里？**
A：**绝对不要填在这份文件里**。密码必须通过 `credential_management` 指定的
   方式管理（环境变量/Vault 等）。这份文件会提交到 git，密码不能出现在 git 里。

**Q：生产时区和开发时区不同怎么办？**
A：这是正常的。代码中所有日期时间操作必须显式指定时区，不能依赖系统默认。
   sf-executor 会按 prod-environment 的 tz_name 生成时区安全的代码。

**Q：我还没有生产服务器，怎么填？**
A：先填你计划的配置（例如"计划用 AWS EC2 + Ubuntu 22.04"），
   等服务器就绪后再更新实际值。

**Q：修改这份文件后会怎样？**
A：sf-design 和 sf-verifier 会在下次执行时重新评估受影响的决策。
   特别是 runtimes 中的最低版本变化，会触发 L9 兼容性测试重跑。
