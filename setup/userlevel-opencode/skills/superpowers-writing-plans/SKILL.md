---
name: superpowers-writing-plans
description: 指导 Agent 为每个 task 生成结构化的执行计划
autoload: phase_match
phases:
  - tasks
---

# Superpowers Writing Plans

### 当前验证能力边界（SPS §9.2.4 / D23）

当前只支持固定 Windows x64 单进程只读 Node 内置测试，以及已证明原判定/输出语义的有限文件存在性和 grep 检查。Node 测试还须满足受限语法、依赖和输入冻结合同；`node --test` 的命令名本身不是可执行性证明。

Task Planner 只规划新 Task 的原始验证声明，不执行命令。已批准 Task 由真实 `sf-orchestrator` 使用 `sf_verification_plan` 创建独立只读计划，真实 `sf-verifier` 使用 `sf_verification_run` prepare/run；代码写许可不能代替验证许可，`sf_safe_bash` 仍只读。类别 `integration`/`e2e` 不自动授权服务器、联网或子进程。

Bun、第三方测试框架、tsc、ESLint、构建、服务/网络、文件写入和需要子进程的检查不属于当前执行范围。若原验收确实需要这些能力，保留原要求并在候选批准前返回 `blocked` / `not_executed` finding，由 Orchestrator 处理能力缺口；不得换解释器、转普通宿主、以 grep 替代类型检查或降低验收。不得修改已封存 Task 来适配本能力。

### D24 有限计时声明（只规划，不提前实施）

每个 CJS 计时入口只允许一个无参数同步测试回调、一次本地核心调用和四条连续计时/断言语句。准备输入在起点之前，结果断言在计时断言之后；LIMIT 必须是原需求规定的正有限毫秒字面量，且不超过既有 120000ms 墙钟预算。其他时钟、别名、额外读取、闭包逃逸、成员替换或测量表达式内嵌套调用继续拒绝。以下仅说明可规划语法，不是已执行结果，也不授权在 Candidate 批准前写业务实现。

<!-- SPECFORGE_D24_TIMING_EXAMPLE:START -->
```javascript
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {operation}=require('./core.cjs');
test('one bounded synchronous operation',()=>{
  const input=41;
  const start=performance.now();
  const result=operation(input);
  const elapsed=performance.now()-start;
  assert.ok(elapsed<=50);
  assert.equal(result,42);
});
```
<!-- SPECFORGE_D24_TIMING_EXAMPLE:END -->

命令编译只证明受限形态；正式执行仍由 sf-orchestrator/sf-verifier 独立拥有并核验。核心规则测试、静态检查、真实浏览器交互必须分列证据，未执行或当前不支持的必需项标 not_executed/blocked；不能用 Node 计时或 grep 代替浏览器交互/类型检查。

## 指令

在为每个 task 生成执行计划时，你必须包含以下四个部分：

### 1. 前置条件（Prerequisites）
- 列出执行此 task 前必须满足的条件
- 包括：依赖的文件、已完成的前置 task、需要的环境配置

### 2. 执行步骤（Steps）
- 按顺序列出具体的执行步骤
- 每个步骤必须是可操作的、明确的
- 总步骤数不得超过 30 个（如果超过，说明 task 粒度过大，需要拆分）

### 3. 预期产物（Expected Outputs）
- 列出此 task 完成后应产生的文件或变更
- 包括：新建文件、修改文件、删除文件

### 4. 验证方法（Verification）
- 列出验证此 task 完成的具体命令或检查方法
- 必须包含 verification_commands 字段
- 每个验证命令必须是可自动执行的
- `verification_commands` 必须是类型化映射，合法键仅为 `unit`、`property`、`integration`、`e2e`、`regression`，不得使用平铺旧列表
- 使用 `property` 时，task 的 `refs` 必须包含对应的规范 `CP-<MODULE_CODE>-<NNN>`；`CP-N` 仅允许历史读取兼容

```markdown
### TASK-WI-0001-001 示例任务
- **refs**: [REQ-EXAMPLE-001, DD-EXAMPLE-001]
- **verification_commands**:
  - unit:
    - `node --test tests/unit/example.test.ts`
  - integration:
    - `node --test tests/integration/example.test.ts`
```

## 粒度控制

- 每个 task 的执行步骤不得超过 30 个
- 如果一个 task 需要超过 30 个步骤，必须将其拆分为多个子 task
- 每个 task 应该可以在单次子 Agent 执行中完成
