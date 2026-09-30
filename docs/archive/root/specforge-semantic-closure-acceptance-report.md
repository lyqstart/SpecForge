# SpecForge Semantic Closure 验收与收口报告

## 1. 本轮目标

本轮不继续扩散新规则，只把 `Governance Semantic Closure` 做成可回归验收项，验证它能挡住 fj1 类问题：实现了框架或文件，但没有证明用户目标真实完成。

## 2. 新增验收测试

新增文件：

```text
packages/daemon-core/tests/unit/semantic-closure-fj1-regression.test.ts
```

该测试固定 5 类验收场景：

| 场景 | 预期 |
|---|---|
| 本地落盘、flush 调用链、server upload 三类 L5 行为证据全部通过 | `validateSemanticClosure().passed === true` |
| 只有 framework / file-only / compile-only 证据 | 阻断 |
| `Logger.flush` 存在但没有接入真实运行路径证据 | 阻断 |
| 只有本地 evidence，缺 server upload evidence | 阻断 |
| evidence 通过但 project integration 仍 unknown | 阻断 |

## 3. 为什么能挡住 fj1 类问题

fj1 原问题不是“没有写文件”，而是“写了 logging 框架后把框架完成当成用户结果完成”。

语义闭包要求最终关闭前必须证明：

```text
OUT -> REQ -> DD -> TASK -> EV
```

并且 required evidence 必须是 passed、非弱证据。`file-only`、`compile-only`、`build-only`、L0/L1/L2 都不能证明完成。

因此：

```text
Logger.ts 存在 ≠ 日志本地落盘完成
LogPersistence.ts 存在 ≠ Logger.flush 已接入真实调用链
接口声明存在 ≠ /logs/batch 服务端上传完成
build 通过 ≠ 用户结果完成
```

## 4. 验证命令

在本地执行：

```powershell
cd D:\code\temp\SpecForge\packages\daemon-core

bun run test -- tests/unit/semantic-closure-core.test.ts tests/unit/semantic-closure-builder.test.ts tests/unit/sf-semantic-closure-run.test.ts tests/unit/close-gate-semantic-closure.test.ts tests/unit/close-gate-extension-request.test.ts tests/unit/sf-v11-close-gate.test.ts tests/unit/semantic-closure-fj1-regression.test.ts

bun run build
```

## 5. 收口判断

若以上测试和 build 通过，则本阶段完成以下闭环：

```text
Agent/Skill 规则说明
→ semantic_closure 机器可读模型
→ sf_semantic_closure_run 生产工具
→ close_gate fail-closed 消费
→ fj1 回归负向验收
```

这意味着后续 Work Item 不能仅凭“文件创建、框架存在、编译通过”关闭，必须提交能证明用户目标完成的语义证据。
