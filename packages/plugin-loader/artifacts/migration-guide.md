# Plugin Loader 迁移指南

本文档帮助开发者将现有插件或系统迁移到 V6.0 Plugin Loader。

## 目录

- [概述](#概述)
- [从 V5 或无插件系统迁移](#从-v5-或无插件系统迁移)
- [清单文件迁移](#清单文件迁移)
- [权限声明迁移](#权限声明迁移)
- [配置迁移](#配置迁移)
- [常见迁移场景](#常见迁移场景)
- [回滚与故障排查](#回滚与故障排查)

---

## 概述

V6.0 的 Plugin Loader 引入了以下重大变化：

| 特性 | V5/旧版本 | V6.0 |
|------|----------|------|
| 插件清单 | 无标准格式 | `plugin.json`（必需） |
| 权限控制 | 无 | 显式声明 + 静态检查 |
| 加载验证 | 无 | 权限声明 vs 授权对比 |
| 热加载 | 不支持 | 支持 |

**迁移原则**：V6.0 的插件系统是全新设计的，无需从旧版本"升级"，而是需要为现有插件**添加清单文件**和**声明权限**。

---

## 从 V5 或无插件系统迁移

### 步骤 1：创建插件清单文件

在插件根目录创建 `plugin.json`：

```json
{
  "schema_version": "1.0",
  "id": "your-plugin-id",
  "version": "1.0.0",
  "entry": "./dist/index.js",
  "description": "插件功能描述",
  "requires": []
}
```

### 步骤 2：声明所需权限

根据插件实际使用的功能，填写 `requires` 字段：

| 功能 | 所需权限 |
|------|----------|
| 读取文件 | `filesystem.read` |
| 写入文件 | `filesystem.write` |
| 发起网络请求 | `network` |
| 执行子进程 | `child_process` |
| 读取环境变量 | `env.read` |

示例：

```json
{
  "schema_version": "1.0",
  "id": "github-integration",
  "version": "1.0.0",
  "entry": "./dist/index.js",
  "description": "GitHub API integration",
  "requires": ["network", "filesystem.read", "filesystem.write"]
}
```

### 步骤 3：配置授权

在以下位置之一创建授权配置文件：

**用户级配置**：
```bash
mkdir -p ~/.specforge/config/
cat > ~/.specforge/config/plugin-grants.json << 'EOF'
{
  "schema_version": "1.0",
  "grantedPermissions": ["filesystem.read", "filesystem.write", "network"]
}
EOF
```

**项目级配置**：
```bash
mkdir -p .specforge/config/
cat > .specforge/config/plugin-grants.json << 'EOF'
{
  "schema_version": "1.0",
  "grantedPermissions": ["filesystem.read", "filesystem.write"]
}
EOF
```

---

## 清单文件迁移

### 清单字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `schema_version` | string | 是 | 格式版本，当前为 `"1.0"` |
| `id` | string | 是 | 插件唯一标识（小写字母、数字、连字符） |
| `version` | string | 是 | 语义化版本号（x.y.z） |
| `entry` | string | 是 | 入口文件路径（相对插件目录） |
| `name` | string | 否 | 显示名称 |
| `description` | string | 否 | 插件描述 |
| `author` | string | 否 | 作者信息 |
| `requires` | array | 否 | 权限声明数组 |
| `dependencies` | object | 否 | 插件依赖 |
| `compatible` | string | 否 | 兼容的 SpecForge 版本 |

### 迁移检查清单

- [ ] 已创建 `plugin.json` 文件
- [ ] `id` 字段符合格式（小写字母、数字、连字符）
- [ ] `version` 字段符合语义化版本格式
- [ ] `entry` 指向的入口文件存在
- [ ] 已声明所有需要的权限
- [ ] 已验证清单格式正确（可使用 JSON Schema 验证工具）

---

## 权限声明迁移

### 权限类型

V6.0 提供以下权限类型：

| 权限 | 说明 | 典型用途 |
|------|------|----------|
| `filesystem.read` | 读取文件系统 | 读取配置、加载资源文件 |
| `filesystem.write` | 写入文件系统 | 写日志、缓存、输出文件 |
| `network` | 网络访问 | 调用外部 API、下载资源 |
| `child_process` | 子进程执行 | 运行 CLI 工具、构建脚本 |
| `env.read` | 读取环境变量 | 获取运行时配置 |

### 权限声明示例

**不需要任何特殊权限的插件**：
```json
{
  "requires": []
}
```

**需要读取文件和环境的插件**：
```json
{
  "requires": ["filesystem.read", "env.read"]
}
```

**需要完整功能的插件**：
```json
{
  "requires": [
    "filesystem.read",
    "filesystem.write",
    "network",
    "child_process",
    "env.read"
  ]
}
```

### 常见权限需求映射

| 插件功能 | 需要的权限 |
|----------|------------|
| 读取 JSON 配置文件 | `filesystem.read` |
| 写入日志文件 | `filesystem.write` |
| 调用 GitHub API | `network` |
| 运行 prettier/eslint | `child_process` |
| 读取 `NODE_ENV` 等环境变量 | `env.read` |

---

## 配置迁移

### 授权配置结构

```json
{
  "schema_version": "1.0",
  "grantedPermissions": ["filesystem.read"],
  "plugins": {
    "plugin-id": ["network", "filesystem.write"]
  }
}
```

### 配置层级

授权配置按以下优先级合并（从低到高）：

1. **内置默认**：`[]`（空集合，拒绝所有权限）
2. **用户级**：`~/.specforge/config/plugin-grants.json`
3. **项目级**：`<project>/.specforge/config/plugin-grants.json`
4. **运行时**：通过 CLI/API 动态设置

### 迁移步骤

1. **确定需要的权限**：分析插件代码，列出所需权限
2. **创建配置文件**：在合适层级创建授权配置
3. **测试加载**：验证插件能正常加载

---

## 常见迁移场景

### 场景 1：纯文件处理插件

**插件功能**：读取配置文件，处理后写入输出文件

**清单文件**：
```json
{
  "schema_version": "1.0",
  "id": "file-processor",
  "version": "1.0.0",
  "entry": "./dist/index.js",
  "description": "Process configuration files",
  "requires": ["filesystem.read", "filesystem.write"]
}
```

**授权配置**：
```json
{
  "schema_version": "1.0",
  "grantedPermissions": ["filesystem.read", "filesystem.write"]
}
```

### 场景 2：API 集成插件

**插件功能**：调用外部 API，缓存结果到本地文件

**清单文件**：
```json
{
  "schema_version": "1.0",
  "id": "github-integration",
  "version": "1.0.0",
  "entry": "./dist/index.js",
  "description": "GitHub API integration",
  "requires": ["network", "filesystem.read", "filesystem.write"]
}
```

**授权配置**：
```json
{
  "schema_version": "1.0",
  "grantedPermissions": ["filesystem.read", "filesystem.write"],
  "plugins": {
    "github-integration": ["network"]
  }
}
```

### 场景 3：CLI 工具集成

**插件功能**：封装命令行工具（如 prettier）

**清单文件**：
```json
{
  "schema_version": "1.0",
  "id": "code-formatter",
  "version": "1.0.0",
  "entry": "./dist/index.js",
  "description": "Code formatting using prettier",
  "requires": ["child_process", "filesystem.read", "filesystem.write"]
}
```

**授权配置**：
```json
{
  "schema_version": "1.0",
  "grantedPermissions": ["child_process", "filesystem.read", "filesystem.write"]
}
```

---

## 回滚与故障排查

### 常见错误

#### 错误：权限被拒绝

```json
{
  "success": false,
  "error": {
    "code": "AUTH_DENIED",
    "message": "Authorization denied",
    "details": {
      "requires": ["network"],
      "grants": [],
      "missing": ["network"]
    }
  }
}
```

**解决方案**：在授权配置中添加缺失的权限。

#### 错误：静态检查失败

```json
{
  "success": false,
  "error": {
    "code": "STATIC_CHECK_FAILED",
    "message": "Static check failed",
    "details": {
      "violations": [
        {
          "line": 42,
          "api": "child_process.exec",
          "message": "Detected forbidden API call"
        }
      ]
    }
  }
}
```

**解决方案**：
1. 在清单中添加 `child_process` 权限（如果确实需要）
2. 或重构代码，避免使用被禁止的 API

#### 错误：清单格式错误

```json
{
  "success": false,
  "error": {
    "code": "MANIFEST_ERROR",
    "message": "Invalid plugin manifest",
    "details": {
      "errors": [
        { "field": "id", "message": "Must be lowercase alphanumeric with dashes" }
      ]
    }
  }
}
```

**解决方案**：修复清单文件中的格式问题。

### 调试步骤

1. **验证清单格式**：使用 JSON 验证工具检查 `plugin.json` 格式
2. **检查权限声明**：确保 `requires` 包含所有需要的权限
3. **验证授权配置**：确认授权配置文件中包含了所需权限
4. **查看日志**：检查 Plugin Loader 的事件日志获取详细错误信息

### 回滚方案

如果迁移遇到问题：

1. **临时禁用权限检查**：在开发环境设置宽松的授权配置
2. **移除清单文件**：如果不需要权限检查，可以不提供清单（但会使用默认安全策略）
3. **联系支持**：如果问题无法解决，请提交 issue 并附上错误信息和日志

---

## 附录

### JSON Schema 验证

可以使用以下命令验证清单文件：

```bash
# 使用 node 验证 JSON 格式
node -e "JSON.parse(require('fs').readFileSync('./plugin.json'))"
```

### 相关文档

- [配置示例](./config-examples.md)
- [API 参考](../README.md)
- [故障排查指南](./troubleshooting.md)（如有）