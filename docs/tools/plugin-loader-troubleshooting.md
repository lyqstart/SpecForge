# Plugin Loader 故障排查指南

本文档提供 plugin-loader 模块的常见问题诊断与解决方案。

## 目录

- [快速诊断](#快速诊断)
- [常见错误及解决方案](#常见错误及解决方案)
- [调试技巧](#调试技巧)
- [日志分析](#日志分析)

---

## 快速诊断

### 诊断命令

```bash
# 查看插件加载状态
bun run scripts/sync-task-status.ts list

# 运行 plugin-loader 测试
bun test packages/plugin-loader/tests/

# 检查配置文件
cat ~/.specforge/config/plugin-grants.json
cat <project>/.specforge/config/plugin-grants.json
```

### 错误代码速查

| 错误代码 | 含义 | 常见原因 |
|---------|------|---------|
| `MANIFEST_ERROR` | 清单文件错误 | 格式错误、缺少必需字段、schema_version 不匹配 |
| `STATIC_CHECK_FAILED` | 静态检查失败 | 源码包含禁止的 API 调用 |
| `AUTH_DENIED` | 授权被拒 | 插件声明的权限未被授权 |
| `DEPENDENCY_MISSING` | 依赖缺失 | 声明的依赖未满足 |

---

## 常见错误及解决方案

### 1. 清单文件错误 (MANIFEST_ERROR)

#### 症状

```
Error: Plugin manifest validation failed
Missing required field: 'id'
```

或

```
Error: Invalid schema_version: '2.0'. Supported versions: ['1.0']
```

#### 原因

- 清单文件 `plugin.json` 格式不正确
- 缺少必需字段（`id`, `version`, `requires`, `entry`）
- `schema_version` 值不支持

#### 解决方案

确保 `plugin.json` 包含所有必需字段：

```json
{
  "schema_version": "1.0",
  "id": "my-plugin",
  "version": "1.0.0",
  "requires": ["filesystem.read"],
  "entry": "./dist/index.js"
}
```

**检查清单**：
- [ ] `id` 是唯一字符串
- [ ] `version` 符合语义化版本号格式
- [ ] `requires` 是数组，包含有效的权限类型
- [ ] `entry` 是相对于插件目录的路径
- [ ] `schema_version` 为 "1.0"

#### 权限类型有效值

```
filesystem.read
filesystem.write
network
child_process
env.read
```

---

### 2. 静态检查失败 (STATIC_CHECK_FAILED)

#### 症状

```
Error: Static check failed
Violation found at line 42:
- API: child_process.exec
- Message: Detected forbidden API call without required permission
```

或

```
Error: Static check failed
Violation found at line 15:
- API: fs path traversal
- Message: Path escapes plugin directory: ../../etc/passwd
```

#### 原因

- 插件源码使用了禁止的敏感 API
- 代码尝试访问插件目录外的文件系统路径

#### 解决方案

**情况 A：使用了 child_process**

如果你需要执行子进程，在清单中声明权限：

```json
{
  "requires": ["child_process"]
}
```

并确保在授权配置中也开启该权限。

**情况 B：文件系统路径越界**

检查代码中的路径操作，确保所有文件访问都在插件目录内：

```typescript
// ❌ 错误：路径逃逸
const data = fs.readFileSync('../../etc/passwd');

// ✅ 正确：使用插件目录内的路径
const data = fs.readFileSync(path.join(__dirname, 'data/config.json'));
```

**情况 C：未声明的网络访问**

如果需要网络访问，在清单中声明：

```json
{
  "requires": ["network"]
}
```

---

### 3. 授权被拒 (AUTH_DENIED)

#### 症状

```
Error: Authorization denied
Plugin 'my-plugin' requires: ['network', 'filesystem.write']
Current grants: ['filesystem.read']
Missing permissions: ['network', 'filesystem.write']
```

#### 原因

- 插件声明的权限未在授权配置中开启
- 授权配置层级问题（用户级 vs 项目级）

#### 解决方案

**步骤 1：检查当前授权**

```bash
# 查看当前授权
cat ~/.specforge/config/plugin-grants.json
```

**步骤 2：添加授权**

在用户级配置添加权限：

```json
{
  "schema_version": "1.0",
  "grants": ["filesystem.read", "network", "filesystem.write"]
}
```

或在项目级配置覆盖：

```json
{
  "schema_version": "1.0",
  "grants": ["filesystem.read", "network"],
  "plugins": {
    "my-plugin": ["filesystem.read", "network", "filesystem.write"]
  }
}
```

**步骤 3：重载配置**

如果使用运行时更新授权，可能需要重启 Daemon 或调用配置重载 API。

---

### 4. 依赖缺失 (DEPENDENCY_MISSING)

#### 症状

```
Error: Dependency missing
Plugin 'my-plugin' requires:
- plugin: specforge-utils (>=2.0.0)
- library: octokit (^3.0.0)
```

#### 原因

- 插件依赖的其他插件未安装
- 依赖的 npm 包未安装
- 版本不满足要求

#### 解决方案

**插件依赖**：确保依赖的插件已加载

**npm 依赖**：在插件目录安装

```bash
cd <plugin-dir>
bun install
```

或使用 package.json：

```json
{
  "dependencies": {
    "octokit": "^3.0.0"
  }
}
```

---

### 5. 热加载问题

#### 症状

- 修改插件后行为未更新
- 出现旧版本插件的错误
- 热加载导致崩溃

#### 原因

- 文件监听未正确配置
- 缓存未清除
- 热加载逻辑错误

#### 解决方案

**检查 1：确认文件监听已启动**

查看日志中是否有 `Watching <plugin-dir> for changes`

**检查 2：手动触发重载**

```typescript
// 通过 API 手动重载
await pluginLoader.reloadPlugin('plugin-id');
```

**检查 3：查看热加载事件**

```bash
# 查看插件事件日志
cat <data-dir>/events.jsonl | grep -i reload
```

---

### 6. 加载性能问题

#### 症状

- 插件加载时间超过 100ms
- 并发加载时卡顿

#### 原因

- 静态检查分析了大量文件
- AST 解析耗时
- 依赖解析递归过深

#### 解决方案

**优化 1：减少分析文件数量**

在清单中指定要检查的文件：

```json
{
  "entry": "./dist/index.js",
  "checkPatterns": ["src/**/*.ts"]
}
```

**优化 2：排除不需要检查的文件**

```json
{
  "excludePatterns": ["node_modules/**", "dist/**", "**/*.test.ts"]
}
```

**优化 3：使用构建后的代码**

加载编译后的 JavaScript 而非 TypeScript 源码，减少解析时间。

---

## 调试技巧

### 1. 启用详细日志

#### 运行时日志

在启动 Daemon 时设置环境变量：

```bash
DEBUG=specforge:plugin-loader bun run packages/daemon-core/src/index.ts
```

#### 事件日志

所有插件操作都会记录到事件日志：

```bash
# 查看最近 50 条插件事件
tail -n 50 <data-dir>/events.jsonl | grep plugin
```

### 2. 使用调试模式

#### 代码级调试

在 VS Code 中添加调试配置：

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Plugin Loader",
  "runtimeExecutable": "bun",
  "runtimeArgs": ["run", "packages/plugin-loader/src/index.ts"],
  "env": {
    "DEBUG": "specforge:*"
  }
}
```

#### 逐步加载调试

```typescript
import { PluginLoader } from '@specforge/plugin-loader';

const loader = new PluginLoader({
  debug: true,  // 启用调试模式
  logLevel: 'verbose'
});

// 单步执行
const manifest = await loader.parseManifest(pluginDir);
console.log('Manifest:', manifest);

const checkResult = await loader.checkStatic(pluginDir);
console.log('Static check:', checkResult);

const loadResult = await loader.loadPlugin(pluginDir);
console.log('Load result:', loadResult);
```

### 3. 测试清单文件

#### 验证清单格式

```typescript
import { ManifestParser } from '@specforge/plugin-loader';

const parser = new ManifestParser();
const manifest = await parser.parse('./plugin.json');
const validation = parser.validate(manifest);

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}
```

#### 测试静态检查

```typescript
import { StaticChecker } from '@specforge/plugin-loader';

const checker = new StaticChecker();
const result = checker.checkSource(sourceCode, filePath);

console.log('Passed:', result.passed);
console.log('Violations:', result.violations);
```

### 4. 模拟授权环境

```typescript
import { AuthValidator } from '@specforge/plugin-loader';

const validator = new AuthValidator();

// 模拟不同的授权场景
const testCases = [
  { requires: ['network'], grants: ['network'], expected: 'authorized' },
  { requires: ['network'], grants: [], expected: 'denied' },
  { requires: ['filesystem.read', 'network'], grants: ['network'], expected: 'denied' },
];

for (const tc of testCases) {
  const result = validator.validate(tc.requires, tc.grants);
  console.log(`Requires: ${tc.requires}, Grants: ${tc.grants}`);
  console.log(`Result: ${result.authorized}, Missing: ${result.missing}`);
}
```

---

## 日志分析

### 事件日志格式

每条事件记录为 JSON Lines 格式：

```json
{
  "eventId": "evt-20240520-001",
  "ts": 1716200000000,
  "category": "plugin",
  "action": "load",
  "pluginId": "specforge-github-integration",
  "success": true,
  "requires": ["network", "filesystem.read"],
  "grants": ["network", "filesystem.read"],
  "staticCheckPassed": true,
  "loadTimeMs": 45
}
```

### 常见事件类型

| action | 含义 | 关键字段 |
|--------|------|---------|
| `load` | 加载插件 | `success`, `requires`, `grants` |
| `reload` | 热重载 | `success`, `reason` |
| `unload` | 卸载插件 | `success` |
| `error` | 加载错误 | `errorCode`, `errorMessage` |

### 日志查询示例

#### 查询所有失败事件

```bash
grep '"success":false' <data-dir>/events.jsonl | jq '.'
```

#### 查询特定插件的事件

```bash
grep 'specforge-github-integration' <data-dir>/events.jsonl | jq '.'
```

#### 查询授权被拒事件

```bash
grep 'AUTH_DENIED' <data-dir>/events.jsonl | jq '.'
```

#### 查询静态检查失败

```bash
grep 'STATIC_CHECK_FAILED' <data-dir>/events.jsonl | jq '.'
```

#### 按时间范围查询

```bash
# 查询 2024-05-20 当天的事件
grep '"ts":1[6-7].*' <data-dir>/events.jsonl | jq 'select(.ts >= 1716153600000 and .ts < 1716240000000)'
```

### 日志分析脚本

创建一个分析脚本 `scripts/analyze-plugin-logs.ts`：

```typescript
#!/usr/bin/env bun
import { readFileSync } from 'fs';

const logFile = process.argv[2] || './events.jsonl';

interface Event {
  eventId: string;
  ts: number;
  category: string;
  action: string;
  pluginId: string;
  success: boolean;
  errorCode?: string;
}

const events = readFileSync(logFile, 'utf-8')
  .split('\n')
  .filter(Boolean)
  .map(line => JSON.parse(line) as Event);

// 统计
const stats = {
  total: events.length,
  success: events.filter(e => e.success).length,
  failed: events.filter(e => !e.success).length,
  byAction: {} as Record<string, number>,
  byError: {} as Record<string, number>,
};

for (const e of events) {
  stats.byAction[e.action] = (stats.byAction[e.action] || 0) + 1;
  if (e.errorCode) {
    stats.byError[e.errorCode] = (stats.byError[e.errorCode] || 0) + 1;
  }
}

console.log('=== Plugin Loader Statistics ===');
console.log(`Total events: ${stats.total}`);
console.log(`Success: ${stats.success}`);
console.log(`Failed: ${stats.failed}`);
console.log('\nBy action:', stats.byAction);
console.log('\nBy error code:', stats.byError);
```

运行分析：

```bash
bun run scripts/analyze-plugin-logs.ts <data-dir>/events.jsonl
```

### 性能日志分析

#### 加载时间统计

```bash
# 提取加载时间
grep '"action":"load"' <data-dir>/events.jsonl | \
  jq -r '.loadTimeMs' | \
  awk '{sum+=$1; count++} END {print "Average:", sum/count "ms, Total:", count}'
```

#### 识别慢加载

```bash
# 找出加载时间超过 100ms 的事件
grep '"action":"load"' <data-dir>/events.jsonl | \
  jq 'select(.loadTimeMs > 100)' | \
  jq '.pluginId, .loadTimeMs'
```

---

## 调试检查清单

当你遇到问题时，按顺序检查：

### 清单 A：清单文件

- [ ] `plugin.json` 存在于插件目录根
- [ ] `schema_version` 为 "1.0"
- [ ] 包含所有必需字段：`id`, `version`, `requires`, `entry`
- [ ] `requires` 数组只包含有效值
- [ ] `entry` 路径相对于插件目录

### 清单 B：授权配置

- [ ] 授权配置文件存在（用户级或项目级）
- [ ] 插件需要的权限在 `grants` 数组中
- [ ] 检查配置合并是否正确（项目级覆盖用户级）

### 清单 C：源码检查

- [ ] 源码中没有使用禁止的 API
- [ ] 文件系统访问路径没有逃逸
- [ ] 网络访问已声明权限

### 清单 D：依赖

- [ ] 所有 npm 依赖已安装
- [ ] 所有插件依赖已加载
- [ ] 版本满足要求

### 清单 E：环境

- [ ] Node.js/Bun 版本满足要求
- [ ] 插件目录有读取权限
- [ ] 入口文件存在且可访问

---

## 获取帮助

如果以上指南无法解决你的问题：

1. **收集信息**：运行诊断命令，保存完整错误信息
2. **查看日志**：提取相关时间范围的事件日志
3. **搜索已知问题**：查看 [GitHub Issues](https://github.com/specforge/specforge/issues)
4. **提交 Issue**：包含完整的错误信息、重现步骤和环境信息

### 报告问题时请提供

- Plugin Loader 版本
- Node.js/Bun 版本
- 操作系统
- 完整的错误堆栈
- 相关日志片段
- 重现步骤