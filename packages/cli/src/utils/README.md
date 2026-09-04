# Utils 模块

本目录包含 CLI 模块的通用工具类。

## PathResolver

跨平台路径解析工具，负责处理 SpecForge 安装路径和平台相关的路径解析。

### 功能

- **resolveInstallRoot(override?)**: 解析 `~/.specforge` 安装根目录
- **resolveHomeDirectory()**: 解析用户 HOME 目录（跨平台）
- **platform()**: 返回当前平台 (`"win32" | "darwin" | "linux"`)
- **arch()**: 返回当前架构 (`"x64" | "arm64"`)
- **installSourceFromArgv(argv)**: 判断安装来源 (`"npm-global" | "npm-local" | "dev"`)

### 使用示例

```typescript
import { pathResolver } from './utils/path-resolver.js';

// 获取安装根目录
const installRoot = pathResolver.resolveInstallRoot();
// => "/home/user/.specforge" (Linux/macOS)
// => "C:\Users\User\.specforge" (Windows)

// 获取 HOME 目录
const home = pathResolver.resolveHomeDirectory();

// 获取平台信息
const platform = pathResolver.platform(); // "win32" | "darwin" | "linux"
const arch = pathResolver.arch();         // "x64" | "arm64"

// 判断安装来源
const source = pathResolver.installSourceFromArgv(process.argv);
// => "npm-global" | "npm-local" | "dev"
```

### 平台差异处理

#### Windows
- HOME 目录解析为 `%USERPROFILE%`
- 路径分隔符为 `\`

#### macOS / Linux
- HOME 目录解析为 `$HOME` 环境变量
- 如果 `$HOME` 未设置或为空，抛出 `INIT_HOME_NOT_SET` 错误
- 路径分隔符为 `/`

### 错误处理

当 linux/darwin 下 `HOME` 环境变量未设置时，`resolveHomeDirectory()` 会抛出错误：

```typescript
try {
  const home = pathResolver.resolveHomeDirectory();
} catch (error) {
  if (error.code === 'INIT_HOME_NOT_SET') {
    console.error('HOME environment variable is not set');
  }
}
```

### 测试

单元测试位于 `tests/unit/path-resolver.test.ts`，覆盖所有平台和边界情况。

运行测试：
```bash
bun test packages/cli/tests/unit/path-resolver.test.ts
```

### 设计文档

详细设计参见：`.kiro/specs/distribution/design.md` § "Components and Interfaces" § 5
