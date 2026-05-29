# 开发环境配置

## 配置项

### 基本身份

```yaml
environments:
  - label: "主开发环境"
    primary: true
    host_type: local-windows
    hostname: "lyq"
```

### 操作系统

```yaml
    os:
      platform: win32
      version: "Microsoft Windows 11 家庭版 中文版"
      arch: x64
      totalmem_gb: 32
      cpu_count: 18
      disk_free_gb: "[TODO-FILL]"
```

### 语言运行时

```yaml
    runtimes:
      python: "3.13.12"
      python3: "3.9.13"
      node: "24.12.0"
      bun: "1.3.11"
```

### 包管理器

```yaml
    package_managers:
      npm: "11.6.2"
      pnpm: "11.2.2"
      bun: "1.3.11"
```

### Shell

```yaml
    shell:
      preferred: pwsh
      encoding: UTF-8
      path_separator: "\\"
```

### 本地化（语言与时区）

```yaml
    locale:
      system_lang: zh-CN
      tz_name: Asia/Shanghai
      tz_offset_minutes: 480
      date_format: ISO-8601
```

### 网络

```yaml
    network:
      has_internet: true
      proxy: null
      pip_index_url: null
      npm_registry: null
      maven_mirror: null
```

### 工具

```yaml
    tools:
      git: { available: true, version: "2.52.0" }
      docker: { available: false }
      rg: { available: false }
      jq: { available: false }
      curl: { available: true, version: "8.19.0" }
```

### 远程访问

```yaml
    remote_access: null
```
