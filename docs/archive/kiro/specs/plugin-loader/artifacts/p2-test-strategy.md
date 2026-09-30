# Plugin Loader P2 测试策略

**文档版本**: 1.0  
**创建日期**: 2026-05-17  
**关联任务**: 9.3.3 设计 P2 测试策略  
**关联属性**: Property PL-7（沙箱隔离性）、Property PL-8（资源限制有效性）

---

## 1. 概述

### 1.1 P2 阶段目标

P2 阶段（V6.x）将把 P0 阶段的沙箱骨架升级为**真实的运行时隔离**，实现：

1. **真实进程隔离**：插件在独立子进程中运行，与 Daemon 主进程完全隔离
2. **资源限制强制执行**：内存、CPU、超时、文件描述符的硬性限制
3. **文件系统白名单强制执行**：白名单外路径访问被操作系统层面拒绝
4. **网络访问控制**：未授权网络访问被拦截

### 1.2 当前 P0 骨架状态

P0 阶段已完成的骨架（可直接复用）：

| 组件 | 文件 | 状态 |
|------|------|------|
| 沙箱接口定义 | `src/sandbox/index.ts` | ✅ 完整 |
| 进程管理器 | `src/sandbox/process-manager.ts` | ✅ 骨架 |
| IPC 通道 | `src/sandbox/ipc-channel.ts` | ✅ 骨架 |
| IPC 路由 | `src/sandbox/ipc-router.ts` | ✅ 骨架 |
| 资源监控器 | `src/sandbox/resource-monitor.ts` | ✅ 骨架 |
| PL-7 测试骨架 | `tests/property/sandbox-isolation.property.test.ts` | ✅ 占位 |
| PL-8 测试骨架 | `tests/property/resource-limits.property.test.ts` | ✅ 占位 |

P0 骨架测试已验证**接口正确性**和**配置语义**，P2 阶段需要将占位测试替换为**真实行为验证**。

---

## 2. P2 测试分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    P2 测试金字塔                                  │
├─────────────────────────────────────────────────────────────────┤
│  L4: Property-Based Tests（PBT）                                │
│      - PL-7: 沙箱隔离性（随机输入验证隔离边界）                  │
│      - PL-8: 资源限制有效性（随机限制值验证终止行为）            │
├─────────────────────────────────────────────────────────────────┤
│  L3: 集成测试（Integration Tests）                              │
│      - 真实子进程创建与通信                                      │
│      - 端到端资源限制触发                                        │
│      - 文件系统白名单强制执行                                    │
├─────────────────────────────────────────────────────────────────┤
│  L2: 单元测试（Unit Tests）                                     │
│      - SandboxEnforcer 路径检查逻辑                             │
│      - ResourceLimiter 超限检测逻辑                             │
│      - NetworkGuard 访问控制逻辑                                │
├─────────────────────────────────────────────────────────────────┤
│  L1: 骨架测试（已完成，P0 阶段）                                │
│      - 接口类型守卫                                             │
│      - 配置语义验证                                             │
│      - 默认值合理性                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Property PL-7 测试策略（沙箱隔离性）

### 3.1 属性定义

```
∀ plugin p, sandbox s, resource r:
  (r ∉ s.fsWhitelist ∧ r ∉ s.networkWhitelist ∧ r ∉ s.envWhitelist)
  → access(p, r) = DENIED
```

### 3.2 P2 阶段需要实现的测试

#### PL-7-P2-1: 文件系统隔离真实验证

**测试文件**: `tests/property/sandbox-isolation.property.test.ts`（替换占位）

**测试策略**:
```typescript
// 生成随机文件路径（白名单内 vs 白名单外）
// 在真实沙箱子进程中尝试访问
// 验证：白名单外路径访问返回 EACCES/EPERM

fc.property(
  arbitraryFSWhitelist,
  arbitraryOutsidePath,  // 生成白名单外的路径
  async (whitelist, outsidePath) => {
    const handle = await sandbox.createSandbox({ fsWhitelist: whitelist, ... });
    const result = await sandbox.execute(handle, 'readFile', [outsidePath]);
    expect(result.success).toBe(false);
    expect(result.error?.code).toMatch(/EACCES|EPERM|SANDBOX_VIOLATION/);
    await sandbox.destroySandbox(handle);
  }
)
```

**生成器设计**:
- `arbitraryOutsidePath`: 生成明确不在白名单中的路径
  - 系统路径：`/etc/passwd`, `/etc/shadow`, `C:\Windows\System32\`
  - 父目录逃逸：`../../../etc/passwd`
  - 绝对路径（非白名单目录）

**迭代次数**: ≥ 1000（安全关键，见 v6-development-workflow.md）

#### PL-7-P2-2: 进程隔离真实验证

**测试策略**:
```typescript
// 验证沙箱进程无法访问宿主进程内存
// 验证沙箱进程无法 fork 子进程（maxChildProcesses=0 时）
// 验证沙箱进程无法发送信号给宿主进程

it('沙箱进程不能 fork 子进程（maxChildProcesses=0）', async () => {
  const handle = await sandbox.createSandbox({
    resourceLimits: { maxChildProcesses: 0 },
    ...
  });
  const result = await sandbox.execute(handle, 'spawnChild', ['echo', ['hello']]);
  expect(result.success).toBe(false);
  expect(result.error?.code).toBe('CHILD_PROCESS_FORBIDDEN');
  await sandbox.destroySandbox(handle);
});
```

#### PL-7-P2-3: 网络隔离真实验证

**测试策略**:
```typescript
// 未声明 network 权限的插件尝试建立网络连接
// 验证连接被拒绝

fc.property(
  arbitraryExternalHost,  // 生成外部主机名（非 localhost）
  async (host) => {
    const handle = await sandbox.createSandbox({
      networkWhitelist: { enabled: false, rules: [] },
      ...
    });
    const result = await sandbox.execute(handle, 'httpGet', [host]);
    expect(result.success).toBe(false);
    expect(result.error?.code).toMatch(/NETWORK_FORBIDDEN|ECONNREFUSED/);
    await sandbox.destroySandbox(handle);
  }
)
```

#### PL-7-P2-4: 环境变量隔离验证

**测试策略**:
```typescript
// 验证沙箱只能访问 envWhitelist 中的环境变量
// 验证敏感环境变量（AWS_SECRET_KEY 等）不可见

it('沙箱不能访问白名单外的环境变量', async () => {
  process.env.SECRET_KEY = 'super-secret';
  const handle = await sandbox.createSandbox({
    envWhitelist: ['PATH', 'NODE_ENV'],  // 不包含 SECRET_KEY
    ...
  });
  const result = await sandbox.execute(handle, 'getEnv', ['SECRET_KEY']);
  expect(result.result).toBeUndefined();
  await sandbox.destroySandbox(handle);
});
```

### 3.3 PL-7 测试文件结构

```
tests/property/
└── sandbox-isolation.property.test.ts  （P0 骨架 → P2 替换）

tests/integration/
└── sandbox/
    ├── fs-isolation.test.ts            （新增：文件系统隔离集成测试）
    ├── process-isolation.test.ts       （新增：进程隔离集成测试）
    ├── network-isolation.test.ts       （新增：网络隔离集成测试）
    └── env-isolation.test.ts           （新增：环境变量隔离集成测试）
```

---

## 4. Property PL-8 测试策略（资源限制有效性）

### 4.1 属性定义

```
∀ plugin p, sandbox s, limits L:
  (p.memoryUsed > L.memoryLimitMB ∨
   p.cpuTimeUsed > L.cpuTimeLimitSec ∨
   p.executionTime > L.timeoutMs ∨
   p.fileDescriptors > L.maxFileDescriptors)
  → sandbox.terminate(p)
```

### 4.2 P2 阶段需要实现的测试

#### PL-8-P2-1: 内存超限触发终止

**测试文件**: `tests/property/resource-limits.property.test.ts`（替换占位）

**测试策略**:
```typescript
// 在沙箱中执行内存分配代码，超过限制后验证终止

fc.property(
  fc.integer({ min: 64, max: 512 }),  // 内存限制（MB）
  async (memoryLimitMB) => {
    const handle = await sandbox.createSandbox({
      resourceLimits: { memoryLimitMB },
      ...
    });
    // 执行分配超过限制的内存
    const result = await sandbox.execute(handle, 'allocateMemory', [memoryLimitMB + 100]);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MEMORY_EXCEEDED');
    // 验证沙箱已终止
    expect(sandbox.getStatus(handle)).toBe('terminated');
  }
)
```

**迭代次数**: ≥ 1000（安全关键）

#### PL-8-P2-2: 执行超时触发终止

**测试策略**:
```typescript
// 在沙箱中执行无限循环，超时后验证终止

fc.property(
  fc.integer({ min: 100, max: 5000 }),  // 超时（ms）
  async (timeoutMs) => {
    const handle = await sandbox.createSandbox({
      resourceLimits: { timeoutMs },
      ...
    });
    const start = Date.now();
    const result = await sandbox.execute(handle, 'infiniteLoop', []);
    const elapsed = Date.now() - start;
    
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('TIMEOUT_EXCEEDED');
    // 验证实际超时时间在合理范围内（±500ms 误差）
    expect(elapsed).toBeGreaterThanOrEqual(timeoutMs - 100);
    expect(elapsed).toBeLessThan(timeoutMs + 500);
  }
)
```

#### PL-8-P2-3: CPU 时间超限触发终止

**测试策略**:
```typescript
// 在沙箱中执行 CPU 密集型计算，超过 CPU 时间限制后验证终止

it('CPU 时间超限应触发沙箱终止', async () => {
  const handle = await sandbox.createSandbox({
    resourceLimits: { cpuTimeLimitSec: 1 },  // 1秒 CPU 时间
    ...
  });
  const result = await sandbox.execute(handle, 'cpuIntensiveTask', []);
  expect(result.success).toBe(false);
  expect(result.error?.code).toBe('CPU_TIME_EXCEEDED');
});
```

#### PL-8-P2-4: 文件描述符超限拒绝新打开

**测试策略**:
```typescript
// 在沙箱中打开大量文件，超过限制后验证新打开被拒绝

fc.property(
  fc.integer({ min: 5, max: 50 }),  // FD 限制
  async (maxFileDescriptors) => {
    const handle = await sandbox.createSandbox({
      resourceLimits: { maxFileDescriptors },
      ...
    });
    // 尝试打开超过限制数量的文件
    const result = await sandbox.execute(handle, 'openManyFiles', [maxFileDescriptors + 5]);
    // 验证超出限制的打开操作被拒绝
    expect(result.error?.code).toBe('FD_LIMIT_EXCEEDED');
  }
)
```

#### PL-8-P2-5: 资源限制单调性验证

**测试策略**:
```typescript
// 验证：更严格的限制产生更多违规（单调性）

fc.property(
  fc.integer({ min: 1, max: 100 }),   // 严格限制
  fc.integer({ min: 200, max: 8192 }), // 宽松限制
  async (strictLimit, looseLimit) => {
    // 相同的工作负载，严格限制下应该失败，宽松限制下应该成功
    const strictHandle = await sandbox.createSandbox({
      resourceLimits: { memoryLimitMB: strictLimit },
      ...
    });
    const looseHandle = await sandbox.createSandbox({
      resourceLimits: { memoryLimitMB: looseLimit },
      ...
    });
    
    const strictResult = await sandbox.execute(strictHandle, 'allocateMemory', [150]);
    const looseResult = await sandbox.execute(looseHandle, 'allocateMemory', [150]);
    
    // 严格限制下失败，宽松限制下成功
    expect(strictResult.success).toBe(false);
    expect(looseResult.success).toBe(true);
    
    await Promise.all([
      sandbox.destroySandbox(strictHandle),
      sandbox.destroySandbox(looseHandle),
    ]);
  }
)
```

### 4.3 PL-8 测试文件结构

```
tests/property/
└── resource-limits.property.test.ts   （P0 骨架 → P2 替换）

tests/integration/
└── sandbox/
    ├── memory-limit.test.ts            （新增：内存限制集成测试）
    ├── cpu-limit.test.ts               （新增：CPU 限制集成测试）
    ├── timeout-limit.test.ts           （新增：超时限制集成测试）
    └── fd-limit.test.ts                （新增：文件描述符限制集成测试）
```

---

## 5. 测试辅助基础设施

### 5.1 沙箱测试插件（Test Fixtures）

P2 测试需要一组专门的测试插件，用于触发各种资源超限场景：

```
tests/fixtures/sandbox-test-plugins/
├── memory-bomb/
│   ├── plugin.json
│   └── index.ts          # 分配大量内存
├── cpu-hog/
│   ├── plugin.json
│   └── index.ts          # CPU 密集型计算
├── infinite-loop/
│   ├── plugin.json
│   └── index.ts          # 无限循环
├── fd-leaker/
│   ├── plugin.json
│   └── index.ts          # 打开大量文件
├── fs-escaper/
│   ├── plugin.json
│   └── index.ts          # 尝试访问白名单外路径
├── network-caller/
│   ├── plugin.json
│   └── index.ts          # 尝试建立网络连接
└── child-spawner/
    ├── plugin.json
    └── index.ts          # 尝试创建子进程
```

### 5.2 SandboxTestHelper 工具类

```typescript
// tests/helpers/sandbox-test-helper.ts

export class SandboxTestHelper {
  private createdHandles: SandboxHandle[] = [];
  
  async createTracked(options: SandboxOptions): Promise<SandboxHandle> {
    const handle = await sandbox.createSandbox(options);
    this.createdHandles.push(handle);
    return handle;
  }
  
  async cleanup(): Promise<void> {
    for (const handle of this.createdHandles) {
      try {
        await sandbox.destroySandbox(handle);
      } catch {
        // 忽略已终止的沙箱
      }
    }
    this.createdHandles = [];
  }
  
  // 验证沙箱已终止
  assertTerminated(handle: SandboxHandle): void {
    expect(sandbox.getStatus(handle)).toBe('terminated');
  }
  
  // 验证错误码
  assertErrorCode(result: SandboxExecuteResult, code: string): void {
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(code);
  }
}
```

### 5.3 测试配置要求

P2 测试涉及真实子进程，必须配置适当的超时：

```typescript
// vitest.config.ts（P2 测试专用配置）
export default defineConfig({
  test: {
    testTimeout: 30000,      // 单测最多 30 秒（子进程启动需要时间）
    hookTimeout: 10000,      // setup/teardown 最多 10 秒
    teardownTimeout: 5000,   // 清理阶段最多 5 秒
    pool: 'forks',           // 进程隔离（防止沙箱测试互相干扰）
  },
});
```

**注意**：运行 P2 测试时必须使用 `Start-Job + Wait-Job -Timeout 90` 包裹（见工作流规则）。

---

## 6. P2 实现路径与测试依赖

### 6.1 实现依赖关系

```
P2 测试能够通过的前提条件：

SandboxEnforcer（文件系统白名单强制执行）
  └── 依赖：ProcessManager（真实子进程）
  └── 依赖：FSWhitelist 接口（已完成）

ResourceLimiter（资源限制强制执行）
  └── 依赖：ProcessManager（真实子进程）
  └── 依赖：ResourceMonitor（跨进程采集）
  └── 依赖：ResourceLimits 接口（已完成）

NetworkGuard（网络访问控制）
  └── 依赖：ProcessManager（真实子进程）
  └── 依赖：NetworkWhitelist 接口（已完成）
```

### 6.2 测试实现顺序

```
阶段 1: 单元测试（不需要真实子进程）
  ├── SandboxEnforcer.checkPath() 路径检查逻辑
  ├── ResourceLimiter.checkLimits() 超限检测逻辑
  └── NetworkGuard.isAllowed() 访问控制逻辑

阶段 2: 集成测试（需要真实子进程）
  ├── 文件系统隔离（fs-isolation.test.ts）
  ├── 进程隔离（process-isolation.test.ts）
  ├── 资源限制（memory/cpu/timeout/fd）
  └── 网络隔离（network-isolation.test.ts）

阶段 3: Property-Based 测试（替换 P0 骨架占位）
  ├── sandbox-isolation.property.test.ts（PL-7）
  └── resource-limits.property.test.ts（PL-8）
```

---

## 7. 测试覆盖率目标

| 测试类型 | 目标覆盖率 | 关键场景 |
|---------|-----------|---------|
| 单元测试 | ≥ 90% | 路径检查、限制检测、访问控制 |
| 集成测试 | ≥ 80% | 真实子进程隔离、资源超限 |
| PBT（PL-7） | ≥ 1000 次迭代 | 随机路径、随机白名单 |
| PBT（PL-8） | ≥ 1000 次迭代 | 随机限制值、随机工作负载 |

---

## 8. 已知风险与缓解措施

### 8.1 平台差异

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Windows 无 seccomp/cgroups | 文件系统隔离实现不同 | 使用 Node.js 层面的路径检查 |
| macOS 沙箱 API 不同 | 进程隔离实现差异 | 抽象 SandboxBackend 接口 |
| Bun vs Node.js 内存 API 差异 | 内存监控实现不同 | 运行时检测，选择合适 API |

### 8.2 测试稳定性

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 子进程启动时间不确定 | 测试超时 | 设置足够的 testTimeout（30s） |
| 资源限制触发时间不精确 | 断言失败 | 允许 ±500ms 误差范围 |
| 并发测试互相干扰 | 测试不稳定 | 使用 `pool: 'forks'` 进程隔离 |
| 测试插件进程泄漏 | 测试卡死 | SandboxTestHelper 追踪清理 |

### 8.3 异步资源管理

P2 测试涉及真实子进程，必须严格遵循 `async-resource-lifecycle` 规范：

- **A1 败者清理**：`Promise.race` 超时后必须清理 timer
- **A2 终止可达性**：沙箱终止信号必须在 `finally` 中可达
- **A4 所有者原则**：`SandboxTestHelper` 负责所有创建的沙箱的清理
- **T1 对称清理**：`afterEach` 必须调用 `helper.cleanup()`

---

## 9. 与 P0 骨架测试的关系

P0 骨架测试（已通过）验证了：
- 接口类型守卫正确性
- 配置语义（默认值、枚举值）
- 白名单结构合法性

P2 测试将**替换**骨架中的 `[P2 占位]` 测试，将其从"验证配置结构"升级为"验证真实行为"：

```typescript
// P0 骨架（当前）
it('[P2 占位] 不在白名单中的路径应被拒绝访问', () => {
  // 只验证白名单结构语义
  expect(allowedPaths.size).toBeLessThanOrEqual(whitelist.rules.length);
});

// P2 替换（目标）
it('不在白名单中的路径应被拒绝访问', async () => {
  // 验证真实沙箱行为
  const result = await sandbox.execute(handle, 'readFile', [outsidePath]);
  expect(result.success).toBe(false);
  expect(result.error?.code).toMatch(/EACCES|SANDBOX_VIOLATION/);
});
```

---

## 10. 参考文档

- `src/sandbox/index.ts` — 沙箱接口定义
- `src/sandbox/process-manager.ts` — 进程管理器骨架
- `src/sandbox/resource-monitor.ts` — 资源监控器骨架
- `artifacts/process-isolation-design.md` — 进程隔离机制设计
- `artifacts/resource-limits-design.md` — 资源限制接口设计
- `artifacts/communication-protocol-design.md` — IPC 通信协议设计
- `tests/property/sandbox-isolation.property.test.ts` — PL-7 测试骨架
- `tests/property/resource-limits.property.test.ts` — PL-8 测试骨架
- `docs/engineering-lessons/universal/async-resource-lifecycle.md` — 异步资源管理规范
