# W3 集成测试设计

## 测试架构

W3 集成测试分为三层：

### 1. 端到端测试（tests/e2e/）
- `feature-spec-e2e.test.ts`：feature_spec workflow 完整流程
- `crash-recovery-e2e.test.ts`：崩溃恢复 10 次 kill 测试
- `openclaw-mock-e2e.test.ts`：OpenClaw 模拟集成

### 2. 跨模块集成测试（tests/integration/）
- `workflow-permission-integration.test.ts`：workflow + permission-engine
- `workflow-observability-integration.test.ts`：workflow + observability CAS
- `workflow-scope-gate-integration.test.ts`：workflow + scope-gate

### 3. 质量收敛验证
- 运行所有 packages 的测试套件
- 验证 Property 覆盖率 100%
- 运行架构检查工具

## 测试策略

### feature_spec 端到端
使用 WorkflowEngine + 真实 GateRunner（mock Agent 响应），验证完整状态机流转。

### 崩溃恢复
使用 `process.kill(pid, 'SIGKILL')` 模拟随机 kill，通过 WAL 验证数据完整性。

### OpenClaw 模拟
使用 HTTP mock server 模拟 OpenClaw 请求，验证 CLI 异步 jobId 流程。
