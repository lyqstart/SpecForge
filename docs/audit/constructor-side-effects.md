# 全仓 Constructor 副作用审计报告

**审计日期**：2026-05-17
**审计范围**：`packages/*/src/**/*.ts` 中所有 class 的 constructor
**审计依据**：[universal/javascript-explicit-resource-management](../engineering-lessons/universal/javascript-explicit-resource-management.md) 原则 P1（构造器不应该有副作用）

---

## 总览

| 状态 | 计数 | 含义 |
|------|------|------|
| 🔴 **违规** | 2 | 构造器内启动后台 timer，且**默认开启** |
| 🟡 **关注** | 1 | 构造器内启动后台 timer，但默认安全或调用者明确控制 |
| 🟢 **合规** | 多 | 副作用在显式 `start()` / 工厂方法中，构造器只赋值 |

---

## 🔴 违规清单（必须修复）

### V1. `packages/scope-gate/src/audit-logger.ts`

**问题**：
```ts
constructor(logDirectory = './logs', actor?, options?) {
  // ...字段初始化...
  this.enableTimer = options?.enableTimer ?? true;   // ← 默认 true，违反 P4 默认安全
  if (this.enableTimer) {
    this.startFlushTimer();     // ← 构造器内启动 setInterval，违反 P1
  }
}

private startFlushTimer(): void {
  this.flushTimer = setInterval(async () => { await this.flush(); }, 1000);
  this.flushTimer.unref();   // ← unref 在 vitest worker 子进程里失效（JS4）
}
```

**违反原则**：P1（构造器副作用）+ P4（默认安全）+ JS4（依赖 unref）

**实际影响**：
- ✅ scope-gate 5 个 e2e 测试卡死 30 分钟+，需要 OS 级 timeout 强杀（已发生）
- ✅ 生产代码中每次 `new AuditLogger()` 都泄漏一个 setInterval

**修复方案**：
1. 默认值翻转：`this.enableTimer = options?.enableTimer ?? false`
2. 生产代码（daemon 启动）显式传 `{ enableTimer: true }`
3. 实现 `[Symbol.asyncDispose]` + `dispose()`
4. 加 `getActiveTimerCount()` 自检 API

**修复优先级**：**P0**（眼下卡死的根因）

---

### V2. `packages/scope-gate/src/audit-logger-optimized.ts`

**问题**：
```ts
constructor(config: OptimizedAuditLoggerConfig = {}) {
  // ...字段初始化...
  // Start background flush timer
  this.startFlushTimer();   // ← 构造器无条件启动 setInterval，违反 P1
}
```

**违反原则**：P1（构造器副作用）

**实际影响**：与 V1 同源（任何 `new OptimizedAuditLogger()` 都泄漏 timer）

**修复方案**：
1. 加 `enableTimer?: boolean` 选项，默认 `false`
2. 实现 `[Symbol.asyncDispose]` + `dispose()`（已有 `dispose()`，需要补 Symbol）
3. 加 `getActiveTimerCount()` 自检 API

**修复优先级**：**P0**

---

## 🟡 关注清单（推荐改进，不阻塞）

### W1. `packages/scope-gate/src/req25-loader.ts:832`

**问题**：
```ts
private handleFileChange(parentSpecPath: string): void {
  setTimeout(async () => {       // ← 匿名 setTimeout，无句柄无法清理（违反 JS4 + AP3）
    const changeResult = this.detectChanges(parentSpecPath);
    // ...
  }, debounceMs);
}
```

**违反原则**：JS4（应可清理）

**实际影响**：每次文件变化触发一次 setTimeout，500ms 内连续多次变化会堆积；测试中如果在 timer 触发前结束，进程多挂 500ms

**修复方案**：
```ts
private debounceTimer?: ReturnType<typeof setTimeout>;

private handleFileChange(parentSpecPath: string): void {
  if (this.debounceTimer) clearTimeout(this.debounceTimer);  // 先清旧的
  this.debounceTimer = setTimeout(async () => {
    this.debounceTimer = undefined;
    // ...
  }, debounceMs);
}

dispose(): void {
  if (this.debounceTimer) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
  }
  // ...其他清理
}
```

**修复优先级**：**P2**（未直接导致卡死，但属于良好实践）

---

### W2. `packages/scope-gate/src/req25-loader.ts:908` — `createActiveDetector`

**问题**：返回的 detector 持有 `intervalId = setInterval(...)`，**有 `detector.stop()` 显式清理**——使用方不调就漏。

**评估**：测试里基本都调了 `detector.stop()`（已审）。生产代码有责任调。

**违反原则**：P3（所有权）已遵守（`stop` 是 owner 行为），但缺少 `Symbol.dispose` 让 `using` 自动化

**修复方案**：detector 实现 `Disposable`，让 `using detector = loader.createActiveDetector(...)` 自动 stop

**修复优先级**：P2

---

### W3. `packages/daemon-core/src/daemon/Daemon.ts:154`

**问题**：
```ts
this.idleTimeoutHandle = setInterval(() => { /* ... */ }, ...);
```

需要确认是在 constructor 还是 `start()` 内。

**待查**：是否有对应的 `stop()` / `dispose()` 清理 + 是否有自检 API

**修复优先级**：P2（daemon 是单例长期运行，泄漏影响小）

---

## 🟢 合规清单（已遵守原则）

以下 class 构造器只做字段初始化，副作用在显式方法中：

| 文件 | 副作用 | 启动方式 |
|------|--------|---------|
| `cli/src/progress/Spinner.ts` | 动画 timer | 显式 `start()` |
| `scope-gate/src/scope-configuration.ts` | syncTimer | 显式 `startFeatureFlagSync()` |
| `migration/src/runner.ts` | timeout timer | Promise.race 一次性，自带清理 |
| `observability/src/sf-analyst/index.ts` | timeout timer | Promise.race 一次性 |
| `opencode-adapter/src/OpenCodeAdapter.ts` | 多个 timer | Promise.race 一次性，已审过 [async-clean] |
| `opencode-adapter/src/integration/DaemonStartupManager.ts` | 多个 timer | Promise.race / abortable，已审过 [async-clean] |

---

## 行动计划

### P0（立即）

1. ✅ 沉淀经验：[universal/javascript-explicit-resource-management](../engineering-lessons/universal/javascript-explicit-resource-management.md)
2. 🔄 修 V1：`AuditLogger` 默认 `enableTimer: false` + 加 `Symbol.asyncDispose` + `getActiveTimerCount()`
3. 🔄 修 V2：`OptimizedAuditLogger` 加 `enableTimer` 选项 + 加 `Symbol.asyncDispose` + `getActiveTimerCount()`
4. 🔄 scope-gate 5 个 e2e 测试 `afterEach` 加 `dispose()`

### P1（本 Wave 内）

5. 🔄 所有 `packages/*/vitest.config.ts` 加 `detectOpenHandles: true`
6. 🔄 PR 模板加"异步资源四问"

### P2（下个 Wave）

7. 修 W1：`req25-loader` 的匿名 setTimeout 改为可清理
8. 检查 W3：`Daemon` 的 idleTimeoutHandle 是否有 dispose
9. 给 W2 的 detector 加 `Symbol.dispose`，支持 `using` 语法

---

## 审计方法

执行命令：
```bash
# 找所有 packages 中可能的构造器副作用
rg -n 'setInterval\(|setTimeout\(|createReadStream\(|createWriteStream\(|new Worker\(|child_process\.spawn|child_process\.fork' \
   packages/*/src/**/*.ts -B 30
```

人工审查每个匹配点：
1. 看是否在 `constructor` 体内（非辅助方法）
2. 看是否默认启用（`?? true` 模式）
3. 看是否提供 `dispose()` 配对清理
4. 看是否有 `Symbol.dispose` 让 `using` 可用

---

## 下次审计时机

- 加新 `class` 持有资源时（按 PR 模板四问检查）
- Wave 切换前（作为 Checkpoint 一项）
- 经验库更新时（看新原则是否引出新违规）
