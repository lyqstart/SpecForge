# SpecForge v1.1 Production Daemon Write Guard 集成整改提示词

## 任务背景

当前分支：

```text
v1.1-daemon-opencode-e2e
```

已发现生产链路断点：

```text
sf_specforge.ts plugin 已调用：
- daemonClient.checkWrite()
- daemonClient.bashGuard()
- daemonClient.changedFilesAudit()
- daemonClient.recordEscapedWrite()

但 ReconnectingDaemonClient 当前没有这些方法。
HTTPServer 当前也没有 write guard 路由。
```

当前 mini HTTP server 测试只能证明协议可行，不能证明生产链路已接通。

本轮目标：

```text
接通生产链路：
sf_specforge.ts
→ ReconnectingDaemonClient
→ production HTTPServer
→ write guard route
→ work_item.json
→ write-guard-v11
→ response
→ plugin throw / allow
```

本轮不做 Extension Subflow，不做 Runtime 重构，不声明 v1.1 complete。

---

## 一、必须修改的生产代码

### 1. ReconnectingDaemonClient

新增并实现：

```ts
checkWrite(request): Promise<response>
bashGuard(request): Promise<response>
changedFilesAudit(request): Promise<response>
recordEscapedWrite(request): Promise<response>
```

要求：

```text
必须通过 HTTP 调用 daemon route
daemon 不可达时 fail closed
不得吞异常后返回 allowed=true
plugin 调用不再 method not found
```

### 2. HTTPServer

新增生产路由，路径可按项目规范确定，例如：

```text
POST /api/v1/v11/write-guard/check
POST /api/v1/v11/write-guard/bash
POST /api/v1/v11/write-guard/changed-files-audit
POST /api/v1/v11/write-guard/escaped-write
```

要求：

```text
route handler 不能返回 mock
必须读取 projectRoot / workItemId / targetPath / operation / actor
必须从真实 projectRoot 读取 .specforge/work-items/<WI>/work_item.json
必须调用 write-guard-v11.ts 的 checkWrite / performChangedFilesAudit
必须写入 violation / audit 证据
无 active WI 返回 allowed=false
code_change_allowed=false 返回 allowed=false
allowed_write_files 外写入返回 allowed=false
```

### 3. 统一类型

如当前没有统一类型，新增或整理：

```ts
CheckWriteRequest
CheckWriteResponse
BashGuardRequest
BashGuardResponse
ChangedFilesAuditRequest
ChangedFilesAuditResponse
EscapedWriteRequest
EscapedWriteResponse
```

plugin、client、server、test 必须共用同一套字段语义。

---

## 二、测试要求

### 1. 调整 mini server 测试定位

如果保留 mini HTTP server 测试，必须改名或标注为：

```text
v11-live-daemon-protocol-prototype.test.ts
```

它只能证明：

```text
Live daemon protocol prototype verified
```

不能作为 production daemon integration 完成证据。

### 2. 新增生产 E2E 测试

新增：

```text
packages/daemon-core/tests/v11-production-daemon-writeguard-e2e.test.ts
```

如实际目录不同，按项目结构放置，但文件名必须包含：

```text
production-daemon-writeguard-e2e
```

测试必须启动真实 production HTTPServer，不能只用 mini server，不能只调用 checkWrite(ctx, ...) 纯函数。

---

## 三、必须覆盖的 5 个场景

### A1 daemon 不可达 fail closed

前置：

```text
不启动 daemon
```

输入：

```text
plugin / ReconnectingDaemonClient 尝试 checkWrite 写 src/app.ts
```

期望：

```text
checkWrite 抛错或返回 blocked
plugin before hook throw
文件未修改
reason 包含 daemon unavailable / fail closed
```

### A2 无 active WI 写入阻断

前置：

```text
启动真实 HTTPServer
项目目录存在
无 active WI
```

期望：

```text
HTTP route 被调用
daemon 读取项目目录
allowed=false
reason 包含 no active WI
plugin throw
文件未修改
violation 写出
```

### A3 code_change_allowed=false 阻断

前置真实创建：

```text
.specforge/work-items/WI-E2E-LIVE-001/work_item.json
```

内容至少包含：

```json
{
  "schema_version": "1.0",
  "work_item_id": "WI-E2E-LIVE-001",
  "status": "implementation_running",
  "workflow_path": "code_only_fast_path",
  "code_change_allowed": false,
  "allowed_write_files": []
}
```

期望：

```text
daemon route 读取真实 work_item.json
allowed=false
reason 包含 code_change_allowed=false
plugin throw
文件未修改
violation 或 changed_files_audit failed 写出
```

### A4 allowed_write_files 内写入允许

前置真实创建 active WI：

```json
{
  "schema_version": "1.0",
  "work_item_id": "WI-E2E-LIVE-002",
  "status": "implementation_running",
  "workflow_path": "code_only_fast_path",
  "code_change_allowed": true,
  "allowed_write_files": [
    { "path": "src/app.ts", "operation": "modify" }
  ]
}
```

期望：

```text
HTTP route 返回 allowed=true
plugin 不 throw
src/app.ts 允许修改
changedFilesAudit route 被调用
changed_files_audit.json status=passed
verification_report.md 存在
evidence_manifest.json 存在
close_gate 可基于文件证据通过
```

### A5 allowed_write_files 外写入阻断

前置：

```text
active WI 只允许 src/app.ts
```

输入：

```text
尝试写 src/secret.ts
```

期望：

```text
HTTP route 返回 allowed=false
plugin throw
src/secret.ts 未修改
reason = outside_allowed_write_files 或等价原因
changed_files_audit failed
close_gate failed
```

---

## 四、必须验证

新增断言：

```ts
expect(typeof daemonClient.checkWrite).toBe('function')
expect(typeof daemonClient.bashGuard).toBe('function')
expect(typeof daemonClient.changedFilesAudit).toBe('function')
expect(typeof daemonClient.recordEscapedWrite).toBe('function')
```

并至少通过一次真实 HTTP 调用。

必须断言 plugin hook 行为：

```ts
await expect(pluginHook(event)).rejects.toThrow()
```

并断言文件未被越权修改。

---

## 五、文档同步

必须更新：

```text
docs/bootstrap/specforge-v1.1-bootstrap-audit-log.md
docs/bootstrap/specforge-v1.1-compliance-gap.md
docs/bootstrap/specforge-v1.1-runtime-execution-chain-merge-readiness.md
```

把错误状态：

```text
Live daemon integration E2E completed
```

改为：

```text
Live daemon protocol prototype verified;
Production daemon integration pending.
```

等生产链路接通并测试通过后，再写：

```text
Production daemon write guard E2E completed.
```

文档必须记录：

```text
分支名称
关键发现
生产代码修改
新增 route
新增 client methods
测试命令
测试结果
证据文件
仍未完成项
```

禁止写：

```text
v1.1 complete
final complete
production compliant
```

---

## 六、必须运行测试

至少运行：

```bash
npx vitest run packages/daemon-core/tests/v11-production-daemon-writeguard-e2e.test.ts
npx vitest run packages/daemon-core/tests/v11-daemon-opencode-writeguard-e2e.test.ts
```

如果保留 protocol prototype 测试，也运行：

```bash
npx vitest run packages/daemon-core/tests/v11-live-daemon-protocol-prototype.test.ts
```

回归 Runtime：

```bash
cd packages/workflow-runtime
npx vitest run tests/v11/e2e/v11-filesystem-lifecycle-e2e.test.ts
npx vitest run tests/v11/e2e/v11-code-only-filesystem-e2e.test.ts
npx vitest run tests/v11/e2e/v11-compliance-e2e.test.ts
npx vitest run tests/v11/unit/path-policy-permissions.test.ts
```

如果项目实际命令不同，按实际命令执行，但必须报告完整命令和结果。

---

## 七、汇报格式

完成后只按以下格式汇报：

```text
## 分支

## 关键发现修复

- ReconnectingDaemonClient 新增方法：
- HTTPServer 新增 route：
- route handler 如何读取 work_item.json：
- route handler 如何调用 write-guard-v11：
- plugin method not found 是否解决：

## 生产 Live daemon E2E

### A1 daemon 不可达 fail closed
- 结果：
- 证据：

### A2 无 active WI
- 结果：
- 证据：

### A3 code_change_allowed=false
- 结果：
- 证据：

### A4 allowed_write_files 内允许
- 结果：
- 证据：

### A5 allowed_write_files 外阻断
- 结果：
- 证据：

## 测试命令与结果

## bootstrap 文档同步

## 仍未完成项
```

---

## 八、失败规则

出现以下任意一项，本轮失败：

```text
ReconnectingDaemonClient 仍没有 checkWrite
ReconnectingDaemonClient 仍没有 bashGuard
ReconnectingDaemonClient 仍没有 changedFilesAudit
ReconnectingDaemonClient 仍没有 recordEscapedWrite
HTTPServer 没有 write guard route
route handler 只返回 mock，不读取真实 work_item.json
route handler 不调用 write-guard-v11.ts
daemon 不可达时允许写入
plugin 调用仍可能 method not found
测试只用 mini HTTP server，不测 production HTTPServer
测试只调用 checkWrite(ctx, ...) 纯函数，不经过 HTTP route
HTTP API 返回 blocked 但 plugin 没有 throw
无 active WI 时允许写入
code_change_allowed=false 时允许写入
allowed_write_files 外写入允许
文件实际被越权修改但测试仍通过
changed_files_audit failed 后 close_gate 仍通过
文档继续写 Live daemon integration E2E completed，但生产链路未实现
开始做 Extension Subflow，导致范围混乱
声明 v1.1 complete
```

---

## 九、完成标准

本轮完成后只能声明：

```text
Production daemon write guard E2E completed
```

不能声明：

```text
v1.1 complete
```

Extension Subflow 下一轮再做。
