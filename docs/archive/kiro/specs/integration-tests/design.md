# W3 集成测试设计

## 当前发布对齐

- **上游权威**：V6 REQ-27、REQ-30、REQ-31 与 design release gates。
- **分类/状态**：`CURRENT_RELEASE_SUPPORTING` 验证表面；测试通过只证明其消费的当前合同，不能独立启用模块。
- **当前范围**：只验证当前 artifact、`feature_spec` 主链路、Daemon 权威、当前 schema 安全和真实安装边界。
- **排除**：legacy fixtures、P1/P2 runtime enablement 和未获批准 workflow 不得计入发布全量回归；历史回归可作为 `HISTORICAL_EVIDENCE_ONLY` 单独保留。

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
