# 开发环境配置

<!-- 这是什么 -->
这份文件描述你的开发环境事实。SpecForge 的所有 Agent 在生成代码、选择命令、
做架构决策时，都会读取这里的值。**代码和文档中不得硬编码这里出现的任何值**——
必须引用这里的字段。

<!-- 谁在什么时候用 -->
- **sf-orchestrator**：初始化时自动扫描并填充，之后每次启动时与扫描结果比对
- **sf-design**：选择技术方案时参考运行时版本和资源限制
- **sf-executor**：执行命令时选择正确的 shell 和工具路径
- **sf-verifier**：兼容性测试时按此版本跑

<!-- 怎么用 -->
1. 首次使用 SpecForge 时，`scan-host-profile.ts` 会自动扫描并填充大部分字段
2. 扫描完成后，SpecForge 会展示结果让你确认
3. 扫描无法获取的字段（标有 `[TODO-FILL]`）需要你手动填写
4. 如果你有多个开发环境（笔记本 + 云服务器），在 `environments` 数组中添加多条，
   用 `primary: true` 标记主要使用的那个

---

## 使用说明

```yaml
# 多个开发环境示例
environments:
  - label: "本地笔记本"
    primary: true
    host_type: local-windows
    # ... 其他字段

  - label: "AWS 云开发机"
    primary: false
    host_type: cloud-aws
    # ... 其他字段
```

---

## 配置项

### 基本身份

```yaml
environments:
  - label: "主开发环境"          # 给这个环境起个名字，方便区分
    primary: true                 # 是否是主要使用的开发环境

    host_type: local-windows      # 这台机器的类型
                                  # 可选值：
                                  #   local-windows   本地 Windows 电脑
                                  #   local-mac       本地 Mac 电脑
                                  #   local-linux     本地 Linux 电脑
                                  #   wsl2            Windows 下的 WSL2
                                  #   docker-desktop  Docker Desktop 容器
                                  #   vm              虚拟机（VMware/VirtualBox）
                                  #   cloud-aws       AWS EC2 / Cloud9
                                  #   cloud-azure     Azure VM / Dev Box
                                  #   cloud-gcp       GCP Cloud Shell / VM
                                  #   remote-ssh      通过 SSH 连接的远程服务器
                                  # 为什么要配：不同类型的机器路径分隔符、
                                  # 换行符、权限模型不同，Agent 需要知道

    hostname: "[TODO-FILL]"       # 机器名（scan 自动填）
```

---

### 操作系统

```yaml
    os:
      platform: win32             # 平台标识（scan 自动填）
                                  # 可选：win32 / darwin / linux
      version: "[TODO-FILL]"      # 人类可读版本（scan 自动填）
                                  # 例：Windows 11 Pro 24H2 / macOS 14.5 / Ubuntu 22.04
      arch: x64                   # CPU 架构（scan 自动填）
                                  # 可选：x64 / arm64 / ia32
      totalmem_gb: 16             # 总内存 GB（scan 自动填）
      cpu_count: 8                # 逻辑 CPU 核数（scan 自动填）
      disk_free_gb: "[TODO-FILL]" # 可用磁盘 GB（scan 自动填，如未填请手动写）
```

---

### 语言运行时

```yaml
    runtimes:
      # 只填你实际安装的语言，没有的删掉这一行
      # 为什么要配：executor 在跑测试时必须用正确版本；
      #             design 在选库时要确认版本兼容性

      python: "3.10.12"           # python --version（scan 自动填）
      python3: "3.10.12"          # python3 --version（scan 自动填）
      node: "20.11.0"             # node --version（scan 自动填）
      bun: "1.1.0"                # bun --version（scan 自动填）
      java: "[TODO-FILL]"         # java -version（scan 暂不支持，手动填）
                                  # 例：17.0.9 / 21.0.1
      dotnet: "[TODO-FILL]"       # dotnet --version（scan 暂不支持，手动填）
      go: "[TODO-FILL]"           # go version（scan 自动填，如已安装）
      rust: "[TODO-FILL]"         # rustc --version（scan 自动填，如已安装）
      php: "[TODO-FILL]"          # php --version（scan 暂不支持，手动填）
      ruby: "[TODO-FILL]"         # ruby --version（scan 暂不支持，手动填）
```

---

### 包管理器

```yaml
    package_managers:
      # 只填你实际使用的，没有的删掉
      # 为什么要配：executor 在添加依赖时必须用正确的包管理器命令

      npm: "10.2.4"               # npm --version（scan 自动填）
      pnpm: "[TODO-FILL]"         # pnpm --version（scan 自动填，如已安装）
      yarn: "[TODO-FILL]"         # yarn --version（scan 自动填，如已安装）
      bun: "1.1.0"                # bun --version（scan 自动填）
      pip: "[TODO-FILL]"          # pip --version（scan 暂不支持，手动填）
      poetry: "[TODO-FILL]"       # poetry --version（手动填）
      maven: "[TODO-FILL]"        # mvn -v（手动填）
      gradle: "[TODO-FILL]"       # gradle -v（手动填）
      cargo: "[TODO-FILL]"        # cargo --version（scan 自动填，如已安装）
      go_mod: true                # 是否使用 go mod（手动填 true/false）
```

---

### Shell

```yaml
    shell:
      preferred: pwsh             # 首选 shell（scan 自动填）
                                  # 可选：pwsh / powershell / cmd / bash / zsh / sh
                                  # 为什么要配：verification_command 必须用这个 shell 跑
      encoding: UTF-8             # 控制台编码（scan 自动填）
                                  # 为什么要配：中文/特殊字符输出乱码的根源
      path_separator: "\\"        # 路径分隔符（scan 自动填）
                                  # Windows: "\\"  Linux/Mac: "/"
```

---

### 本地化（语言与时区）

```yaml
    locale:
      # ⚠️ 重要：以下两个值是"代码和文档的语言基准"
      # 所有代码注释、文档、日志消息的语言必须与 system_lang 一致
      # 所有日期时间值必须使用 tz_name 对应的时区

      system_lang: zh-CN          # 系统语言（scan 自动填）
                                  # 例：zh-CN / en-US / ja-JP
                                  # 为什么要配：Agent 生成的注释和文档语言由此决定

      tz_name: Asia/Shanghai      # IANA 时区名（scan 自动填）
                                  # 例：Asia/Shanghai / America/New_York / Europe/London
                                  # 为什么要配：日志时间戳、定时任务、日期计算的基准

      tz_offset_minutes: 480      # UTC 偏移分钟数（scan 自动填）
                                  # UTC+8 = 480 / UTC-5 = -300

      date_format: ISO-8601       # 日期格式偏好
                                  # 推荐：ISO-8601（2024-01-15）
                                  # 其他：YYYY/MM/DD / MM/DD/YYYY
```

---

### 网络

```yaml
    network:
      has_internet: true          # 是否有外网访问
                                  # 为什么要配：无外网时 executor 必须用内网镜像源

      proxy: null                 # HTTP 代理（如有）
                                  # 例：http://proxy.company.com:8080
                                  # 没有填 null

      pip_index_url: null         # Python 包镜像源
                                  # 例：https://pypi.tuna.tsinghua.edu.cn/simple
                                  # 没有填 null（使用官方源）

      npm_registry: null          # npm 镜像源
                                  # 例：https://registry.npmmirror.com
                                  # 没有填 null（使用官方源）

      maven_mirror: null          # Maven 镜像源（Java 项目）
                                  # 例：https://maven.aliyun.com/repository/public
                                  # 没有填 null
```

---

### 工具

```yaml
    tools:
      # scan 自动填，以下是常见工具示例
      # 为什么要配：verifier 在跑检查命令时需要知道哪些工具可用

      git: { available: true, version: "2.45.0" }
      docker: { available: true, version: "24.0.5" }
      rg: { available: false }    # ripgrep，不可用时 verifier 改用 grep
      jq: { available: true, version: "1.7" }
      curl: { available: true, version: "8.4.0" }
```

---

### 远程访问（如 host_type 是 remote-ssh / cloud-*）

```yaml
    remote_access:
      # 如果这个开发环境是远程的，填这里；本地机器填 null

      ssh_command: null           # SSH 连接命令
                                  # 例：ssh dev@192.168.1.100
                                  # 本地机器填 null

      ssh_key_path: null          # SSH 私钥路径（如需要）
                                  # 例：~/.ssh/id_rsa

      jump_host: null             # 跳板机（如需要）
                                  # 例：ssh -J jump@bastion.company.com dev@target

      vpn_required: false         # 是否需要 VPN 才能访问
```

---

## 常见问题

**Q：scan 自动填了，我还需要检查吗？**
A：需要。scan 只能探测已安装的工具，无法知道你的网络情况、镜像源配置、
   是否需要 VPN 等。标有 `[TODO-FILL]` 的字段必须手动填。

**Q：我有两台电脑，怎么同步这份配置？**
A：把这份文件提交到 git。每台电脑 pull 后，SpecForge 会自动比对扫描结果
   与文件内容，提示你确认差异。

**Q：system_lang 和 tz_name 影响什么？**
A：所有 Agent 生成的代码注释、文档、日志消息都会用 system_lang 的语言；
   所有日期时间相关的代码都会用 tz_name 的时区。这两个值一旦确定，
   整个项目的代码风格就固定了。

**Q：修改这份文件后会怎样？**
A：下次 SpecForge 启动时，orchestrator 会检测到变化，提示相关 Agent
   重新评估受影响的决策（主要是 sf-design 和 sf-executor）。
