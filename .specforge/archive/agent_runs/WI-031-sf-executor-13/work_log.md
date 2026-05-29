# TASK-13 工作日志

## 任务摘要
创建三个属性测试文件，覆盖 CP-1（路径不变式）、CP-3（注册幂等）、CP-4（ingest 非阻塞）的正确性属性。所有测试使用 vitest + fast-check。

## 执行过程

### 1. 环境准备
- 读取了 `.specforge/prod-environment.md`（不存在，跳过）
- 读取了 `.specforge/project-rules.md`（不存在，跳过）
- 探索了 `packages/daemon-core` 的源码结构
- 理解了关键组件：PathResolver (PersonalPathResolver, EnterprisePathResolver), SessionRegistry.registerPluginSession(), HTTPServer.handleIngestEvent()

### 2. 创建 CP-1 测试（path-resolver.property.test.ts）
- 使用 `fast-check` 生成绝对路径风格的 projectPath
- 通过 `safeProjectBase()` 创建跨平台安全前缀（Windows: C:\projects, POSIX: /home）
- 测试两个 resolver：PersonalPathResolver + EnterprisePathResolver
- 验证：返回绝对路径、不含 `..`、以 `state.json` 结尾
- 包含边界情况测试（空路径、纯空格路径应抛异常）
- **修复**：初始版本使用相对路径生成导致 `path.isAbsolute` 失败，改为使用绝对路径前缀拼接随机段

### 3. 创建 CP-3 测试（register-idempotent.property.test.ts）
- 测试 `SessionRegistry.registerPluginSession()` 的幂等性
- fast-check 生成随机 projectId/projectPath 对
- 验证：多次调用同一 projectPath 返回相同 sessionId
- 验证：不同 projectPath 返回不同 sessionId
- 验证：projectBindings 不产生重复条目
- 验证：跨交错注册的幂等性

### 4. 创建 CP-4 测试（ingest-nonblocking.property.test.ts）
- 启动真实 HTTPServer（端口 0），设置测试 token
- 对 7 种事件类型各采样 10 个随机 payload
- 通过 HTTP POST 发送请求，测量响应时间
- 验证：所有请求在 15s 内返回 HTTP 200
- 验证：无子系统依赖时也不阻塞（< 5s）
- 验证：无 token 返回 401，无效 JSON 返回 400
- 验证：20 个并行请求互不阻塞

### 5. 验证
- 初始运行：CP-3 和 CP-4 全部通过，CP-1 的 PersonalPathResolver fast-check 测试失败
- **根因**：`path.join` 对相对路径返回相对结果，`path.isAbsolute` 失败
- **修复**：改用绝对路径前缀生成测试输入
- 重新运行：3 个文件全部通过（18 tests passed）

## 遇到的问题及解决

| 问题 | 根因 | 解决 |
|------|------|------|
| fast-check 发现 counterexample "!" | 相对路径输入导致 `path.join` 返回相对路径 | 改用 `safeProjectBase()` 生成绝对路径前缀 |
| edge-case 测试失败 | 边案例使用相对路径如 "a", "a/b" | 使用 `path.join(base, ...)` 使所有边案例变为绝对路径 |

## 最终结论

3 个新的属性测试文件全部通过：

1. `tests/property/path-resolver.property.test.ts` — 8 tests passed
2. `tests/property/register-idempotent.property.test.ts` — 5 tests passed
3. `tests/property/ingest-nonblocking.property.test.ts` — 5 tests passed

完整的 `npx vitest run tests/property/` 中存在预存失败测试（property-2/6/7/20/21/30），均为 `RecoverySubsystem`/`StateManager` 构造函数 API 变更导致，不在本 task 范围内。

## 工具调用统计
- read_file: ~15 次
- write_file: 3 次
- edit_file: 3 次
- sf_safe_bash: 5 次
- sf_artifact_write: 1 次
