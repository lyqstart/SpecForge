<!--
  SpecForge V6 PR 模板
  
  按场景填写对应小节即可，无关小节可留空（用 `n/a` 标注）。
  填空时尽量保持简洁，链接 spec/issue 优于长篇描述。
-->

## 改动概要

<!-- 一两句话说"做了什么"，不要写"为什么"（放下面"动机"段）。 -->



## 动机

<!-- 关联 spec / issue / Wave / Property（如 #N、REQ-N、Property N）。-->



---

## ⚠️ 异步资源四问（持有 timer / handle / connection / subscription / stream / child_process 的类必填）

> 依据：[docs/engineering-lessons/universal/javascript-explicit-resource-management.md](../docs/engineering-lessons/universal/javascript-explicit-resource-management.md)
>
> **判断要不要填**：本 PR 是否新建/修改了带"异步资源"的 class？
> - ✅ 是 → 必须回答下面四问
> - ❌ 否 → 写 `n/a，不涉及异步资源`

### 四问

1. **这个类创建什么异步资源？**（`setInterval` / `setTimeout` / 文件流 / 网络连接 / 子进程 / 事件订阅 / WebSocket / Worker / 其他）
   <!-- 例：AuditLogger 创建一个 setInterval 用于定期 flush buffer 到磁盘 -->

2. **谁负责释放？**（构造它的代码点 / 工厂方法 / 调用方）
   <!-- 例：调用方负责。生产代码 daemon 启动时持有，进程退出时调 dispose() -->

3. **什么时机释放？**（生命周期事件 / using 自动 / try-finally）
   <!-- 例：daemon 监听 SIGTERM 时调 dispose；测试 afterEach 强制调 dispose -->

4. **测试如何验证已释放？**（哪个 afterEach + 哪个断言）
   <!-- 例：tests/audit-logger.test.ts afterEach 调 dispose 后断言 expect(audit.getActiveTimerCount()).toBe(0) -->

### 自检清单（依据本经验 4 层防护体系）

- [ ] **P1 构造器无副作用**：constructor 里没起 `setInterval` / 长期 `setTimeout` / 打开文件流 / 建立连接（除非有显式 `enableXxx: true` opt-in）
- [ ] **P4 默认安全**：所有 `enableXxx` / `autoStart` 这类选项默认 `false`，要主动开才有副作用
- [ ] **P2 Disposable 协议**：实现了 `dispose()`（同名约定，**不**用 close/destroy/shutdown）+ `Symbol.dispose` 或 `Symbol.asyncDispose`
- [ ] **P5 副作用可观测**：加了 `getActiveXxxCount()` / `isDisposed()` 自检 API
- [ ] **测试断言清零**：`afterEach` 调 dispose 后 `expect(x.getActiveTimerCount()).toBe(0)`

---

## 测试

- [ ] 单元测试通过（`bun test packages/<module>/tests/<your-test>.test.ts`）
- [ ] 全量回归（CI 跑，本地不必）
- [ ] 涉及修改异步资源时，已用 `bun test --reporter=hanging-process` 排查过无未关句柄

---

## Property / Checkpoint（如适用）

<!-- 如果改动影响 Correctness Property，列在此处。 -->
- 验证 Property: <!-- N/A 或 Property N -->
- Wave Checkpoint 影响: <!-- 无 / W2 退出条件 -->

---

## 相关文档/经验

<!-- 链接相关 lesson、spec、Issue。 -->



---

## Reviewer 重点关注

<!-- 一两句话指引 reviewer 看哪里。 -->
