# Plugin Loader 权限配置指南

本文档详细说明 Plugin Loader 的权限模型、配置方式及可用权限。

## 目录

- [权限模型概述](#权限模型概述)
- [权限配置方式](#权限配置方式)
- [可用权限列表](#可用权限列表)
- [配置示例](#配置示例)
- [高级配置](#高级配置)
- [故障排查](#故障排查)

---

## 权限模型概述

Plugin Loader 采用**显式声明 + 最小权限**模型：

1. **显式声明**：插件必须在 `plugin.json` 的 `requires` 字段中声明所需权限
2. **最小权限**：默认拒绝所有未声明权限，插件仅获得明确授权的权限
3. **双重检查**：加载时既检查声明的权限，也检查源码是否使用禁止的 API

### 权限检查流程

```
插件加载请求
     │
     ▼
解析 plugin.json ────► 提取 requires 字段
     │
     ▼
静态检查源码 ────► 检测禁止的 API 调用
     │
     ▼
授权验证 ────► 对比 requires 与 grants
     │
     ▼
    ✓ 全部通过 → 允许加载
    ✗ 任一失败 → 拒绝加载
```

---

## 权限配置方式

### 配置文件位置

权限配置支持多层级，优先级从低到高：

| 层级 | 位置 | 说明 |
|------|------|------|
| 1 | 内置默认 | 无默认权限，全部拒绝 |
| 2 | 用户级 | `~/.specforge/config/plugin-grants.json` |
| 3 | 项目级 | `<project>/.specforge/config/plugin-grants.json` |
| 4 | 运行时 | CLI/API 动态更新 |

**合并规则**：高优先级覆盖低优先级。项目级可覆盖用户级，运行时覆盖所有持久化配置。

### 配置文件格式

```json
{
  "schema_version": "1.0",
  "grants": ["权限1", "权限2"],
  "plugins": {
    "插件ID": ["权限列表"]
  }
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `schema_version` | string | 是 | 固定值 "1.0" |
| `grants` | string[] | 是 | 全局授权权限列表 |
| `plugins` | object | 否 | 按插件细化的权限配置 |

---

## 可用权限列表

### 基础权限

| 权限名称 | 说明 | 典型用途 |
|---------|------|---------|
| `filesystem.read` | 读取文件系统 | 读取配置文件、加载资源文件 |
| `filesystem.write` | 写入文件系统 | 写入日志、缓存、输出文件 |
| `network` | 网络访问 | 调用外部 API、下载资源 |
| `child_process` | 子进程执行 | 运行命令行工具、执行脚本 |
| `env.read` | 读取环境变量 | 获取配置信息、API 密钥 |

### 权限说明

#### filesystem.read

允许插件读取文件系统的文件和目录。

**允许的操作**：
- `fs.readFile`, `fs.readFileSync`, `fs.readdir`
- `fs.createReadStream`
- `fs.stat`, `fs.access` (读)

**禁止的操作**（需要 `filesystem.write`）：
- `fs.writeFile`, `fs.writeFileSync`
- `fs.mkdir`, `fs.rmdir`
- `fs.unlink`, `fs.rm`

**使用场景**：数据导入工具、配置文件加载器、资源读取插件。

#### filesystem.write

允许插件写入文件系统。

**允许的操作**：
- `fs.writeFile`, `fs.writeFileSync`
- `fs.mkdir`, `fs.mkdirSync`
- `fs.createWriteStream`
- `fs.unlink`, `fs.rmdir`

**使用场景**：报告生成器、日志插件、缓存插件。

#### network

允许插件进行网络请求。

**允许的操作**：
- `fetch`, `http.request`, `https.request`
- `WebSocket`
- `require('http')`, `require('https')`

**使用场景**：API 客户端、数据同步插件、Webhook 处理插件。

#### child_process

允许插件执行子进程。

**允许的操作**：
- `child_process.exec`, `child_process.execSync`
- `child_process.spawn`, `child_process.spawnSync`
- `require('child_process')`

**使用场景**：构建工具、代码格式化、 lint 工具集成。

#### env.read

允许插件读取环境变量。

**允许的操作**：
- `process.env` 读取
- `require('dotenv')`

**使用场景**：配置加载、需要环境变量的工具集成。

---

## 配置示例

### 示例 1：最小权限配置

仅授予 `filesystem.read` 权限：

```json
{
  "schema_version": "1.0",
  "grants": ["filesystem.read"]
}
```

### 示例 2：多权限配置

授予常用权限：

```json
{
  "schema_version": "1.0",
  "grants": [
    "filesystem.read",
    "filesystem.write",
    "network"
  ]
}
```

### 示例 3：插件级别细粒度控制

不同插件授予不同权限：

```json
{
  "schema_version": "1.0",
  "grants": ["filesystem.read"],
  "plugins": {
    "specforge-github-integration": ["network", "filesystem.read"],
    "specforge-report-generator": ["filesystem.write", "filesystem.read"],
    "specforge-data-importer": ["network", "filesystem.read", "env.read"]
  }
}
```

### 示例 4：用户级 + 项目级覆盖

**用户级配置** (`~/.specforge/config/plugin-grants.json`)：

```json
{
  "schema_version": "1.0",
  "grants": ["filesystem.read", "env.read"]
}
```

**项目级配置** (`<project>/.specforge/config/plugin-grants.json`)：

```json
{
  "schema_version": "1.0",
  "grants": ["filesystem.read"],
  "plugins": {
    "specforge-github-integration": ["network", "filesystem.read"]
  }
}
```

**结果**：
- 全局权限：`filesystem.read`（项目级覆盖用户级）
- `specforge-github-integration`：`network` + `filesystem.read`（插件级别优先）

---

## 高级配置

### 运行时权限更新

通过 CLI 动态更新权限（需要 Daemon 运行）：

```bash
# 查看当前权限
specforge plugin grants list

# 添加权限
specforge plugin grants add filesystem.write

# 移除权限
specforge plugin grants remove network

# 为特定插件添加权限
specforge plugin grants add --plugin my-plugin network
```

### 权限与静态检查

权限配置需要配合静态检查使用。即使授予了 `child_process` 权限，静态检查仍会验证：

1. 代码中是否有**未声明权限**的敏感 API 调用
2. 文件系统访问是否**越界**（访问插件目录外）
3. 网络访问是否**声明了权限**

**示例**：

```json
// 授权了 child_process 权限
{
  "grants": ["child_process"]
}
```

但插件代码若访问越界路径：

```typescript
// 静态检查会拒绝，因为路径 ../ 逃逸了插件目录
const data = fs.readFileSync('../../../etc/passwd');
```

### 权限验证失败处理

当权限验证失败时，错误信息包含：

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

---

## 故障排查

### 常见权限错误

#### 错误：AUTH_DENIED

**症状**：
```
Plugin 'my-plugin' requires: ['network', 'filesystem.write']
Current grants: ['filesystem.read']
Missing permissions: ['network', 'filesystem.write']
```

**解决**：
1. 确认插件的 `requires` 字段
2. 在授权配置中添��缺失的权限

```json
{
  "grants": ["filesystem.read", "network", "filesystem.write"]
}
```

#### 错误：STATIC_CHECK_FAILED

**症状**：
```
Static check failed
Violation found at line 42:
- API: child_process.exec
- Message: Detected forbidden API call without required permission
```

**解决**：
1. 确认代码中确实使用了该 API
2. 在插件清单中添加对应权限声明
3. 在授权配置中授予该权限

#### 权限已添加但仍被拒绝

可能原因：

1. **配置路径错误**：确认配置文件在正确位置
2. **配置未重载**：需要重启 Daemon 或调用重载 API
3. **项目级覆盖了用户级**：检查项目级配置

### 调试命令

```bash
# 查看解析后的权限配置
specforge plugin validate-config

# 测试权限检查
specforge plugin check-permissions --plugin my-plugin

# 查看详细日志
DEBUG=specforge:plugin-loader:* bun run packages/plugin-loader/src/index.ts
```

---

## 最佳实践

1. **最小权限原则**：只授予插件必需权限，不过度授权
2. **插件级别配置**：对不同插件使用细粒度权限控制
3. **定期审计**：定期检查授权配置，移除不再使用的权限
4. **日志监控**：通过事件日志监控权限使用情况
5. **安全开发**：插件开发者应在 `requires` 中声明所有需要的权限