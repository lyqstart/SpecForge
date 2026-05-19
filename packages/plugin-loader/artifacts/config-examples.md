# Plugin Loader 配置示例文件

本文档提供 plugin-loader 的完整配置示例，展示不同场景下的配置方式。

## 目录

- [配置文件位置](#配置文件位置)
- [JSON Schema 定义](#json-schema-定义)
- [配置示例](#配置示例)
  - [最小配置](#最小配置)
  - [完整配置](#完整配置)
  - [插件级别权限配置](#插件级别权限配置)
  - [多层配置合并](#多层配置合并)
  - [带审计的配置](#带审计的配置)
- [插件清单配置](#插件清单配置)
- [错误处理示例](#错误处理示例)

---

## 配置文件位置

plugin-loader 使用四层配置模型，配置文件位置如下：

| 层级 | 位置 | 优先级 |
|------|------|--------|
| 1 (默认) | 内置 | 最低 |
| 2 (用户级) | `~/.specforge/config/plugin-grants.json` | |
| 3 (项目级) | `<project>/.specforge/config/plugin-grants.json` | |
| 4 (运行时) | 内存中 (CLI/API 设置) | 最高 |

**目录结构**：
```
~/.specforge/
└── config/
    └── plugin-grants.json

<project>/
└── .specforge/
    └── config/
        └── plugin-grants.json
```

---

## JSON Schema 定义

### GrantsConfig Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Plugin Grants Configuration",
  "description": "授权配置文件，定义授予插件的权限集合",
  "type": "object",
  "required": ["schema_version", "grantedPermissions"],
  "properties": {
    "schema_version": {
      "type": "string",
      "const": "1.0",
      "description": "配置格式版本，当前仅支持 1.0"
    },
    "grantedPermissions": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "filesystem.read",
          "filesystem.write",
          "network",
          "child_process",
          "env.read"
        ]
      },
      "description": "全局授权权限列表"
    },
    "plugins": {
      "type": "object",
      "additionalProperties": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": [
            "filesystem.read",
            "filesystem.write",
            "network",
            "child_process",
            "env.read"
          ]
        }
      },
      "description": "按插件细化的权限配置"
    },
    "comment": {
      "type": "string",
      "description": "配置说明注释"
    },
    "audit": {
      "type": "object",
      "properties": {
        "grantedBy": {
          "type": "string",
          "description": "授权者标识"
        },
        "grantedAt": {
          "type": "string",
          "format": "date-time",
          "description": "授权时间（ISO 8601）"
        },
        "source": {
          "type": "string",
          "enum": ["default", "user", "project", "runtime"],
          "description": "授权来源层级"
        }
      }
    }
  }
}
```

### PluginManifest Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Plugin Manifest",
  "description": "插件清单文件，定义插件的元数据和权限声明",
  "type": "object",
  "required": ["schema_version", "id", "version", "entry"],
  "properties": {
    "schema_version": {
      "type": "string",
      "const": "1.0",
      "description": "清单格式版本"
    },
    "id": {
      "type": "string",
      "pattern": "^[a-z0-9-]+$",
      "description": "插件唯一标识符（小写字母、数字、连字符）"
    },
    "name": {
      "type": "string",
      "description": "插件显示名称"
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$",
      "description": "语义化版本号（SemVer）"
    },
    "entry": {
      "type": "string",
      "description": "入口文件路径（相对插件目录）"
    },
    "description": {
      "type": "string",
      "description": "插件描述"
    },
    "author": {
      "type": "string",
      "description": "作者信息"
    },
    "license": {
      "type": "string",
      "description": "许可证"
    },
    "requires": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "filesystem.read",
          "filesystem.write",
          "network",
          "child_process",
          "env.read"
        ]
      },
      "description": "插件声明需要的权限"
    },
    "permissions": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "filesystem.read",
          "filesystem.write",
          "network",
          "child_process",
          "env.read"
        ]
      },
      "description": "权限声明（与 requires 等效）"
    },
    "dependencies": {
      "type": "object",
      "additionalProperties": {
        "type": "string"
      },
      "description": "插件依赖（键为依赖插件 ID，值为版本范围）"
    },
    "compatible": {
      "type": "string",
      "description": "兼容的 SpecForge 版本范围"
    }
  }
}
```

---

## 配置示例

### 最小配置

仅包含必填字段的最小化配置：

```json
{
  "schema_version": "1.0",
  "grantedPermissions": []
}
```

**说明**：
- 不授予任何权限，所有插件的加载请求都会被拒绝
- 适用于安全要求极高的场景

### 基础配置

授予常用基础权限：

```json
{
  "schema_version": "1.0",
  "grantedPermissions": [
    "filesystem.read",
    "filesystem.write"
  ]
}
```

**适用场景**：
- 本地文件处理插件
- 不需要网络访问的插件

### 完整配置

包含所有可用字段的完整配置：

```json
{
  "schema_version": "1.0",
  "grantedPermissions": [
    "filesystem.read",
    "filesystem.write",
    "network",
    "child_process",
    "env.read"
  ],
  "plugins": {
    "specforge-github-integration": ["network", "filesystem.read"],
    "specforge-report-generator": ["filesystem.write", "filesystem.read"],
    "specforge-data-importer": ["network", "filesystem.read", "env.read"],
    "specforge-code-formatter": ["child_process", "filesystem.read", "filesystem.write"]
  },
  "comment": "为团队工作区配���的标准权限集",
  "audit": {
    "grantedBy": "admin@specforge.io",
    "grantedAt": "2026-01-15T10:30:00Z",
    "source": "user"
  }
}
```

**说明**：
- `grantedPermissions`：全局默认权限，所有插件继承
- `plugins`：插件级别的细粒度权限覆盖
- `audit`：授权审计信息，便于追踪

### 插件级别权限配置

为不同插件配置不同权限：

```json
{
  "schema_version": "1.0",
  "grantedPermissions": ["filesystem.read"],
  "plugins": {
    "my-api-client": ["network", "filesystem.read"],
    "my-logger": ["filesystem.write", "filesystem.read"],
    "my-build-tool": ["child_process", "filesystem.read", "filesystem.write"],
    "my-config-loader": ["env.read", "filesystem.read"]
  }
}
```

**合并规则**：
- 插件首先继承全局 `grantedPermissions`
- 再应用插件特定配置进行覆盖/扩展

### 多层配置合并

#### 用户级配置 (`~/.specforge/config/plugin-grants.json`)

```json
{
  "schema_version": "1.0",
  "grantedPermissions": [
    "filesystem.read",
    "env.read"
  ],
  "comment": "用户级默认配置",
  "audit": {
    "grantedBy": "user@example.com",
    "grantedAt": "2026-01-10T09:00:00Z",
    "source": "user"
  }
}
```

#### 项目级配置 (`<project>/.specforge/config/plugin-grants.json`)

```json
{
  "schema_version": "1.0",
  "grantedPermissions": [
    "filesystem.read"
  ],
  "plugins": {
    "project-plugin": ["filesystem.write", "network"]
  },
  "audit": {
    "grantedBy": "project-admin",
    "grantedAt": "2026-01-12T14:00:00Z",
    "source": "project"
  }
}
```

**合并结果**：
- 全局权限：`filesystem.read`（项目级覆盖用户级）
- `project-plugin`：`filesystem.write`, `network`, `filesystem.read`（继承全局 + 插件特定）

### 带审计的配置

完整的审计追踪配置：

```json
{
  "schema_version": "1.0",
  "grantedPermissions": [
    "filesystem.read",
    "network"
  ],
  "comment": "生产环境配置 - 仅授予必要权限",
  "audit": {
    "grantedBy": "security-team",
    "grantedAt": "2026-01-20T11:15:00Z",
    "source": "project"
  }
}
```

**审计字段说明**：

| 字段 | 说明 | 示例 |
|------|------|------|
| `grantedBy` | 授权者标识 | 用户名、服务账号、CI 系统 |
| `grantedAt` | 授权时间 | ISO 8601 格式 |
| `source` | 授权来源 | `default`, `user`, `project`, `runtime` |

---

## 插件清单配置

### 最小清单

```json
{
  "schema_version": "1.0",
  "id": "my-plugin",
  "version": "1.0.0",
  "entry": "./dist/index.js"
}
```

### 带权限声明的清单

```json
{
  "schema_version": "1.0",
  "id": "github-integration",
  "name": "GitHub Integration",
  "version": "1.2.0",
  "entry": "./dist/index.js",
  "description": "GitHub API integration for SpecForge",
  "author": "SpecForge Team",
  "license": "MIT",
  "requires": [
    "network",
    "filesystem.read",
    "filesystem.write"
  ],
  "dependencies": {
    "octokit": "^3.0.0"
  },
  "compatible": "^6.0.0"
}
```

### 带依赖声明的清单

```json
{
  "schema_version": "1.0",
  "id": "data-processor",
  "name": "Data Processor",
  "version": "1.0.0",
  "entry": "./dist/index.js",
  "description": "Process data using logger service",
  "requires": [
    "filesystem.read",
    "filesystem.write"
  ],
  "dependencies": {
    "logger-base": "1.0.0",
    "data-transform": "^2.0.0"
  }
}
```

---

## 错误处理示例

### 权限不足错误

当插件请求的权限未被授权时：

```json
{
  "success": false,
  "error": {
    "code": "AUTH_DENIED",
    "message": "Authorization denied",
    "details": {
      "pluginId": "my-plugin",
      "requires": ["network", "filesystem.write"],
      "grants": ["filesystem.read"],
      "missing": ["network", "filesystem.write"]
    }
  }
}
```

### 静态检查失败

当源码包含禁止的 API 调用时：

```json
{
  "success": false,
  "error": {
    "code": "STATIC_CHECK_FAILED",
    "message": "Static check failed",
    "details": {
      "pluginId": "dangerous-plugin",
      "violations": [
        {
          "file": "src/index.ts",
          "line": 42,
          "column": 15,
          "api": "child_process.exec",
          "message": "Detected forbidden API call without required permission"
        },
        {
          "file": "src/utils.ts",
          "line": 18,
          "column": 8,
          "api": "fs.readFile",
          "message": "File system access outside plugin directory"
        }
      ]
    }
  }
}
```

### 清单格式错误

当插件清单文件格式不正确时：

```json
{
  "success": false,
  "error": {
    "code": "MANIFEST_ERROR",
    "message": "Invalid plugin manifest",
    "details": {
      "pluginId": "invalid-plugin",
      "errors": [
        {
          "field": "version",
          "message": "Must be a valid semantic version"
        },
        {
          "field": "entry",
          "message": "Entry file does not exist"
        }
      ]
    }
  }
}
```

### 依赖缺失错误

当插件依赖未满足时：

```json
{
  "success": false,
  "error": {
    "code": "DEPENDENCY_MISSING",
    "message": "Plugin dependency not satisfied",
    "details": {
      "pluginId": "data-processor",
      "missingDependencies": [
        {
          "id": "logger-base",
          "requiredVersion": "1.0.0",
          "available": false
        }
      ]
    }
  }
}
```

---

## 快速参考

### 可用权限列表

| 权限 | 说明 | 典型用途 |
|------|------|----------|
| `filesystem.read` | 读取文件系统 | 读取配置、加载资源 |
| `filesystem.write` | 写入文件系统 | 写日志、缓存、输出 |
| `network` | 网络访问 | API 调用、数据同步 |
| `child_process` | 子进程执行 | 运行命令行工具 |
| `env.read` | 读取环境变量 | 获取配置信息 |

### 权限检查流程

```
1. 解析 plugin.json → 提取 requires 字段
2. 执行静态检查 → 检测禁止 API
3. 验证权限声明 → requires ⊆ grants ?
4. 通过 → 加载插件
   失败 → 返回错误详情
```

### 配置优先级（从低到高）

1. 内置默认（空集合）
2. 用户级配置 (`~/.specforge/config/plugin-grants.json`)
3. 项目级配置 (`<project>/.specforge/config/plugin-grants.json`)
4. 运行时配置（CLI/API 动态设置）