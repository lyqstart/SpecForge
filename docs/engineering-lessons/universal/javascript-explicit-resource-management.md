---
id: javascript-explicit-resource-management
scope: universal
roles: [executor, reviewer, debugger, architect]
severity: high
tags: [javascript, typescript, resource-management, disposable, lifecycle, design-pattern, dispose]
created: 2026-05-17
updated: 2026-05-17b
related: [async-resource-lifecycle]
---

# JavaScript 显式资源管理（4 层防护体系）

> **来源**：SpecForge V6 scope-gate 包 e2e 测试卡死事故的根因抽象。
> **适用范围**：所有 JavaScript / TypeScript 项目（不限运行时：Node.js / Bun / Deno / 浏览器）。
> **与 [async-resource-lifecycle](async-resource-lifecycle.md) 关系**：互补。本文聚焦"对象/类的设计如何让资源释放可靠"和"团队流程如何兜底"，对方聚焦"具体异步代码模式（Promise.race/while/超时）的正确写法"。

---

## 症状

### 典型场景 1：测试卡死

```
$ bun test tests/e2e/
✓ 5 files passed (30 tests)
[挂在这里 30 分钟+，不退出]
```

测试**逻辑全过了**，但进程不退出。orchestrator 派单的 sub-agent 永远拿不到返回。

### 典型场景 2：生产内存泄漏

```ts
// 看似无害的代码
async function handleRequest(req) {
  const audit = new AuditLogger('./logs');
  await audit.log(req);
  return response;
}
// 跑一天后内存暴涨：每个请求泄漏一个 setInterval
```

### 典型场景 3：开发感受

- 新手："我 `new` 完对象就不管了，垃圾回收不会处理吗？"
- 老手："要清理。但 5 个开发者里 3 个会忘。"
- 团队："review 抓不住，CI 不报错，等卡死才发现。"

---

## 根因

### 5 Whys（停在语言层）

```
事件：测试逻辑过了但 worker 进程不退出
Why 1：因为 Node.js 事件循环里有 setInterval 在响
Why 2：因为 AuditLogger 构造器里 setInterval 启动了，afterEach 没清理
Why 3：因为开发者 new 了对象就忘了——以为 GC 会处理
Why 4：因为 JavaScript 的 GC 只回收内存，不调你的清理代码（不像 C++/Rust 析构）
Why 5：因为 ECMAScript 规范从未定义对象销毁钩子，"对象生命周期"在 JS 里就只是"内存可达性"
                                                           ↑
                                              停在这一层（语言/规范层）
```

### 为什么这是结构性问题

各语言的资源销毁机制对比：

| 语言 | 销毁触发机制 | 谁来调 | 漏调后果 |
|------|------------|--------|---------|
| C++ | 析构函数 | 编译器自动（离开作用域） | 编译期定位 |
| Rust | `Drop` trait | 编译器自动（所有权移交） | 编译期定位 |
| C# | `IDisposable` + `using` | 语法糖自动 | lint 警告 |
| Java | `AutoCloseable` + try-with-resources | 语法糖自动 | lint 警告 |
| Python | `__exit__` + `with` | 语法糖自动 | lint 警告 |
| Go | `defer` | 显式但函数级保障 | go vet 警告 |
| **JavaScript** | **❌ 无** | **必须人手写** | **❌ 无任何提示** |

**关键洞察**：JS 不仅没有析构，连配套的工具链（lint / 类型系统 / IDE）历史上也没强制资源管理协议。`using` 语法直到 ES2023 才正式进入规范（TypeScript 5.2+ / Node 22+ 支持），生态远未铺开。

**结论**：JS 异步资源管理**没法靠语言机制保障**，必须靠**多层防护**——任何单点（开发者纪律、code review、测试断言）都会有漏网之鱼。

---

## 解决方案

### 核心命题

> JavaScript 里没有自动释放，只有显式释放。每个会创建异步资源的类都必须**默认安全 + Disposable 协议 + 自检 API + 测试断言清零**——四件套缺一不可。

### 四层防护体系

```
┌─────────────────────────────────────────────────────────────┐
│ 第 4 层：团队流程（兜底）                                   │
│   PR 模板 / Code review checklist / CI detectOpenHandles    │
├─────────────────────────────────────────────────────────────┤
│ 第 3 层：测试断言（早发现）                                 │
│   afterEach 强制 dispose + getActiveXxxCount() === 0        │
├─────────────────────────────────────────────────────────────┤
│ 第 2 层：API 设计（让正确做法简单）                         │
│   Disposable 协议 + Symbol.dispose + 默认安全 + using 语法  │
├─────────────────────────────────────────────────────────────┤
│ 第 1 层：架构原则（不埋雷）                                 │
│   构造器无副作用 + 所有权清晰 + 副作用可观测                │
└─────────────────────────────────────────────────────────────┘
```

任一层失守都不致命，但**四层都漏 = 必然事故**。

### 第 1 层：5 条架构原则

#### P1. 构造器不应该有副作用

`new X()` 的语义是"建一个对象"，不是"启动一个服务"。在构造器里启动后台任务 = 调用者根本不知道有东西要关。

❌ **反模式**：
```ts
class AuditLogger {
  constructor() {
    this.timer = setInterval(() => this.flush(), 1000);  // 调用者不知道有 timer
  }
}

new AuditLogger();  // 看着只是建对象，实际起了永动闹钟
```

✅ **正确**：
```ts
class AuditLogger {
  constructor() {
    // 构造器只赋值字段，不启动任何后台资源
  }
  start(): void {
    this.timer = setInterval(() => this.flush(), 1000);  // 显式启动
  }
}

const audit = new AuditLogger();
audit.start();  // 调用者知道自己启动了什么，自然记得关
```

#### P2. 资源对象必须实现统一的 Disposable 协议

```ts
interface Disposable {
  dispose(): void | Promise<void>;
  [Symbol.dispose]?(): void;            // 同步资源
  [Symbol.asyncDispose]?(): Promise<void>;  // 异步资源
}
```

**统一名字**：固定叫 `dispose`。**禁止**团队内 close / shutdown / destroy / cleanup / release 混用——搜索、IDE 跳转、lint 规则都靠这个名字工作。

#### P3. 所有权必须清晰

每个资源都有"谁负责销毁"的契约：
- **谁创建谁释放**（默认）
- 转移所有权时必须在 API 文档里写明 `// takes ownership of X`
- 嵌套资源**逆序释放**（A 创建 B，B 创建 C → 销毁顺序 C → B → A）

#### P4. 默认安全（fail-safe defaults）

不能保证调用者会释放的场景，**构造器默认不起后台资源**。

```ts
// ❌ 默认埋雷：忘了传选项就泄漏
constructor(opts?) {
  this.enableTimer = opts?.enableTimer ?? true;
}

// ✅ 默认安全：要主动开才有副作用
constructor(opts?) {
  this.enableTimer = opts?.enableTimer ?? false;
}
```

**判定标准**：如果"忘了释放"会泄漏，那就是埋雷；如果"忘了释放"无后果，那就是安全的。

#### P5. 副作用必须可观测

每个产生副作用的类都要有**自检 API**：

```ts
class AuditLogger {
  getActiveTimerCount(): number { ... }
  getActiveSubscriptionCount(): number { ... }
  isDisposed(): boolean { ... }
}
```

**为什么**：让"我以为清理了"在测试里立刻显形（`expect(x.getActiveTimerCount()).toBe(0)`），而不是等到生产环境内存爆了才发现。

### 第 2 层：6 条 JavaScript 专属规则

#### JS1. 构造器副作用黑名单

`constructor` 里**禁止**做以下事，除非通过显式 option 启用：

| 副作用 | 替代方案 |
|--------|---------|
| `setInterval` / 长期 `setTimeout` | 移到 `start()` / `dispose()` 配对 |
| 打开文件流（`fs.createReadStream`） | 工厂方法 + `await using` |
| 建立网络连接（`net.connect` / `WebSocket`） | 工厂方法 + 异步 `dispose` |
| 注册全局监听（`process.on` / `window.addEventListener`） | 显式 `attach()` / `detach()` |
| 启动子进程（`spawn` / `Worker`） | 显式 `start()` |
| 订阅事件总线（持续订阅） | 显式 `subscribe()` 返回 unsubscribe 函数 |

#### JS2. 实现 Symbol.dispose / Symbol.asyncDispose

让调用者能用 `using` / `await using` 语法（TS 5.2+ / Node 22+）：

```ts
class AuditLogger implements AsyncDisposable {
  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }
  async dispose(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }
}

// 使用方
{
  await using audit = new AuditLogger({ enableTimer: true });
  await audit.log(...);
}  // ← 离开作用域自动调 [Symbol.asyncDispose]()
```

**这是 JS 当前最接近 C++/Rust 的写法**。没实现 = 调用者只能手写 try/finally，错误率飙升。

#### JS3. 配对启动/销毁，不要"半开"状态

```ts
// ❌ 半开：start 和 dispose 不对称
class Foo {
  start() { this.timer = setInterval(...); }
  // 没有 dispose
}

// ✅ 对称配对
class Foo {
  start() { this.timer = setInterval(...); this.started = true; }
  dispose() {
    if (!this.started) return;            // 幂等
    clearInterval(this.timer);
    this.started = false;
  }
}
```

#### JS4. unref() 是优化不是依赖

`timer.unref()` 在 Node 子进程 / vitest worker 里**经常失效**。当作"如果生效更好"看待，**正确性必须靠显式 `clearInterval`**。

```ts
// ❌ 不能依赖
this.timer = setInterval(...).unref();  // worker 子进程里 unref 可能不生效

// ✅ 显式清理
this.timer = setInterval(...);
// dispose 里：
clearInterval(this.timer);
this.timer = undefined;
```

#### JS5. 测试 afterEach 必须断言资源清零

```ts
afterEach(() => {
  audit?.dispose();
  expect(audit?.getActiveTimerCount() ?? 0).toBe(0);  // ← 这一行必加
});
```

让漏调 dispose **第一次发生时就红**，不等卡死。

#### JS6. 准备好"开放句柄诊断"工具，排查卡死时立刻用

各测试框架的诊断机制：

| 测试框架 | 机制 | 配置/命令 | 是否常驻 |
|---------|------|----------|---------|
| **Jest** | 配置选项 | `--detectOpenHandles` flag 或 CLI 参数 | 可常驻（性能开销小） |
| **Vitest** | 内置 reporter | `--reporter=hanging-process` 或 `reporters: ['default', 'hanging-process']` | ⚠️ 不建议常驻（[官方警告](https://main.vitest.dev/guide/reporters#hanging-process-reporter) 资源开销大），仅排查时启用 |
| **Mocha** | 配置选项 | `mocha --check-leaks` | 可常驻 |
| **Node Test Runner** | 内置 | 自动检查（无需配置）| 默认开启 |

**重点**：
- **Vitest 没有 `detectOpenHandles` 这个配置选项**——这是 Jest 的 API。Vitest 用 reporter 机制：[hanging-process reporter](https://main.vitest.dev/guide/reporters#hanging-process-reporter)
- Vitest 卡死的真正兜底是 **`testTimeout` + `pool: 'forks'`** 组合：单测超时强杀 fork → 整个测试套件不会被一个泄漏拖垮

**Vitest 排查卡死的标准操作**：

```bash
# 看具体哪些 handle 没关
bun test --reporter=hanging-process

# 或者临时改 vitest.config.ts
test: {
  reporters: ['default', 'hanging-process'],
}
```

输出形如：
```
✓ 30 tests passed
⚠️  Hanging processes detected:
  Timer (setInterval) at packages/scope-gate/src/audit-logger.ts:133:24
  FileHandle at packages/scope-gate/src/audit-logger-optimized.ts:200:15
```

**为什么不建议常驻**：
1. 官方明确说 resource-intensive
2. 你已经有最强兜底（`pool: 'forks'` + `testTimeout`），单文件卡死不会拖垮全局
3. 真正的根治在代码层（默认安全 + Disposable 协议），reporter 只是排查工具

**推荐做法**：
- 在 `vitest.config.ts` 顶部加注释指引："如何排查卡死：临时加 `--reporter=hanging-process`"
- CI / 本地常态跑时不加 reporter（依赖 testTimeout + forks 兜底）
- 出现卡死症状时，开发者照注释指引启用 reporter 定位泄漏点

### 第 3 层：5 条反模式（看到立刻警惕）

| # | 反模式 | 表现 | 修法 |
|---|-------|------|------|
| **AP1** | 构造器起后台 timer | `new X()` 后冒出 setInterval | 移到 `start()` 或 opt-in |
| **AP2** | 默认 `enableXxx: true` | 默认值埋雷 | 改 `false`，opt-in |
| **AP3** | dispose 改名 close/destroy/shutdown | 团队内不统一 | 统一叫 `dispose` |
| **AP4** | 没有 `getActiveXxxCount` | 测试无法验证清零 | 强制加 |
| **AP5** | 测试用真实 setTimeout 等 | 测试慢 + 不确定 | 用 fake timer（[async-resource-lifecycle T3](async-resource-lifecycle.md#t3)）|

### 第 4 层：决策树（碰到新场景照着走）

```
我在写一个新 class
       │
       ▼
持有异步资源吗？（timer / handle / connection / subscription）
       │
   ┌───┴───┐
   否      是
   │       │
   ▼       ▼
普通 class  实现 Disposable 协议（dispose + Symbol.dispose）
            │
            ▼
        构造器要不要默认启动后台资源？
            │
       ┌────┴─────┐
       │          │
       ▼          ▼
 进程级单例    短生命周期/测试场景频繁创建
 (daemon等)        │
       │           ▼
       ▼      默认 false，opt-in
 默认启动 OK   （要求调用者主动开 enableXxx: true）
       │
       ▼
   加 getActive*Count() 自检 API
       │
       ▼
   JSDoc 标注"调用者必须 dispose"
       │
       ▼
   测试时 afterEach 必含：
     1. 调 dispose
     2. expect(getActive*Count()).toBe(0)
```

---

## 预防机制

### 项目层落地（按优先级）

#### 步骤 1（必做）：审查所有 class 的 constructor

用 grep 扫"构造器埋雷"模式：

```bash
# 找构造器内的副作用调用
grep -rn "constructor" packages/*/src/ -A 30 | grep -E "setInterval|setTimeout|createReadStream|\.on\(|spawn|connect"
```

每条命中记录到 `docs/audit/constructor-side-effects.md`，逐条评估是否要改 opt-in。

#### 步骤 2（必做）：统一 Disposable 协议

加一个共享类型文件 `packages/types/src/disposable.ts`：

```ts
export interface Disposable {
  dispose(): void | Promise<void>;
}

export interface AsyncDisposable extends Disposable {
  [Symbol.asyncDispose](): Promise<void>;
}
```

所有持有资源的类都 `implements Disposable` / `AsyncDisposable`。

#### 步骤 3（必做）：改默认值

把所有 `enableXxx: true` 默认值翻成 `false`。生产代码里**显式开**：

```ts
// 找所有
grep -rn "enableTimer\s*\?\?\s*true" packages/*/src/

// 改为
this.enableTimer = options?.enableTimer ?? false;

// 生产代码显式打开
const audit = new AuditLogger('./logs', actor, { enableTimer: true });
```

#### 步骤 4（必做）：测试配置加最后防线

每个包的 `vitest.config.ts` 都加：

```ts
test: {
  testTimeout: 10000,        // 单测最多 10s
  hookTimeout: 5000,
  teardownTimeout: 3000,
  pool: 'forks',             // 进程隔离（一个泄漏不影响别的）

  // 排查卡死时，临时启用 hanging-process reporter（见下方注释）
  // reporters: ['default', 'hanging-process'],
}
```

**Vitest 注**：`hanging-process` reporter 官方警告 resource-intensive，**不建议常驻**。
正确做法：`pool: 'forks'` + `testTimeout` 是常态兜底（一个文件卡死不拖垮全局），
出现卡死症状时再临时启用 `--reporter=hanging-process` 定位泄漏点。

**Jest 用户**：上面 `reporters` 那行替换为 `detectOpenHandles: true`，可常驻（性能开销小）。

#### 步骤 5（推荐）：自检 API 强制化

任何持有资源的类必须实现 `getActiveXxxCount()`，CI 加 lint 规则检查：

```js
// .eslintrc 自定义规则伪代码
'specforge/disposable-must-have-getter': {
  paths: ['packages/*/src/**/*.ts'],
  classes_implementing: 'Disposable',
  required_method: /^getActive[A-Z]\w+Count$/,
}
```

#### 步骤 6（推荐）：CI 排查机制

**Jest 项目**：
```yaml
- name: Test with handle leak detection
  run: jest --detectOpenHandles
```

**Vitest 项目**：常态 CI 不加 hanging-process reporter（资源开销大）；
但加 **OS 级 timeout 兜底**：
```yaml
- name: Run tests
  timeout-minutes: 10              # ← 整个 step 最多 10 分钟，防卡死
  run: bun test
```
出现卡死时，开发者本地用 `bun test --reporter=hanging-process` 定位。

#### 步骤 7（推荐）：PR 模板四问

新建 `class` 持有资源的 PR，模板必填：

```markdown
## 异步资源四问（持有 timer/handle/connection 的类必填）
1. 这个类创建什么异步资源？
2. 谁负责释放？（在哪个调用点）
3. 什么时机释放？（生命周期事件）
4. 测试如何验证已释放？（哪个 afterEach + 哪个断言）
```

### Steering 注入

在 `.kiro/steering/` 注入这条经验后，AI 派单 / 写代码时会主动遵循。本文档由经验库适配器自动同步到 `.kiro/steering/lessons-injected.md`。

### 派单 prompt 强化

orchestrator 派 sub-agent 写新 class 时，prompt 顶部应包含：

```
## 异步资源硬规则（违反 = 任务失败）

如果你要写的 class 持有 timer/handle/connection，必须：
1. 不在 constructor 里启动后台资源（用 start() 配对）
2. 实现 dispose() + Symbol.dispose
3. 加 getActiveXxxCount() 自检 API
4. 写测试时 afterEach 必含 dispose + 断言清零
```

由 `bun run scripts/lessons/render-prompt-block.ts --tags=javascript,resource-management,disposable` 生成。

---

## 相关错误

同根因可能撞到的其他症状：

| 症状 | lesson |
|------|--------|
| `bun test` 跑完不退出 | 本文 |
| Promise.race 后败者 timer 泄漏 | [async-resource-lifecycle](async-resource-lifecycle.md) A1 / D1 |
| while 循环依赖外部信号无超时兜底 | [async-resource-lifecycle](async-resource-lifecycle.md) A2 |
| 测试用 setTimeout 轮询慢且不稳 | [async-resource-lifecycle](async-resource-lifecycle.md) T3 |
| 异步流测试中途异常没清理 | [async-resource-lifecycle](async-resource-lifecycle.md) T1 |
| 派 sub-agent 跑测试卡死无反馈 | [kiro/execute-pwsh-constraints](../ai-tools/kiro/execute-pwsh-constraints.md) |

**判断本文 vs async-resource-lifecycle 的标准**：
- 你在**写新类**、决定 API 形态、设计构造器 → 本文（架构层）
- 你在**写具体异步代码**（Promise.race / while / 超时） → async-resource-lifecycle（代码层）

两者**不重叠不矛盾**：本文给出"对象层契约"，async-resource-lifecycle 给出"代码层模式"。

---

## 参考

- ECMAScript Explicit Resource Management 提案：https://github.com/tc39/proposal-explicit-resource-management
- TypeScript 5.2 `using` 语法：https://devblogs.microsoft.com/typescript/announcing-typescript-5-2/#using-declarations-and-explicit-resource-management
- 本仓库 SpecForge V6 scope-gate 包 e2e 测试卡死事故（2026-05-17 修复）
- 互补经验：[async-resource-lifecycle.md](async-resource-lifecycle.md)
