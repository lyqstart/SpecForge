# W3 集成测试任务清单

## Phase 1: feature_spec 端到端测试

### 1.1 编写 feature_spec 端到端测试
- [x] 创建 tests/e2e/feature-spec-e2e.test.ts
- [x] 实现 WorkflowEngine 初始化与 feature_spec 定义加载
- [x] 实现四个 Gate 顺序执行验证（Requirements→Design→Tasks→Verification）
- [x] 验证每个 Gate 产生对应 workflow 事件
- [x] 验证 workflow 实例状态持久化

### 1.2 编写 workflow 状态恢复集成测试
- [x] 创建 tests/integration/workflow-state-recovery.test.ts
- [x] 实现 WAL 写入顺序验证（events.jsonl 先于 state.json）
- [x] 实现 workflow 中断后恢复测试
- [x] 验证恢复后状态与中断前一致

## Phase 2: 崩溃恢复测试

### 2.1 编写崩溃恢复 e2e 测试
- [x] 创建 tests/e2e/crash-recovery-e2e.test.ts
- [x] 实现 10 次随机 kill 测试循环
- [x] 验证每次 kill 后 WAL 数据完整性
- [x] 验证重启后 workflow 可继续执行
- [x] 统计 0 数据丢失结果

### 2.2 编写 WAL 一致性验证测试
- [x] 创建 tests/integration/wal-consistency.test.ts
- [x] 验证 WAL 写入原子性
- [x] 验证 fsync 顺序（events.jsonl → state.json）
- [x] 验证并发写入安全性

## Phase 3: 跨模块集成测试

### 3.1 workflow + permission-engine 集成
- [x] 创建 tests/integration/workflow-permission-integration.test.ts
- [x] 验证 workflow 执行前权限检查
- [x] 验证权限拒绝时 workflow 不执行
- [x] 验证权限事件记录

### 3.2 workflow + observability 集成
- [x] 创建 tests/integration/workflow-observability-integration.test.ts
- [x] 验证 workflow 事件写入 CAS 存储
- [x] 验证事件 schema 符合规范
- [x] 验证事件查询接口

### 3.3 scope-gate 集成验证
- [x] 创建 tests/integration/scope-gate-integration.test.ts
- [x] 验证 P1/P2 能力默认关闭
- [x] 验证 scope-gate 拦截未授权能力调用
- [x] 验证 V6.0 分支 scope tag 正确

## Phase 4: OpenClaw 模拟集成

### 4.1 编写 OpenClaw 模拟 e2e 测试
- [x] 创建 tests/e2e/openclaw-mock-e2e.test.ts
- [x] 实现 HTTP mock server 模拟 OpenClaw 请求
- [x] 验证 CLI `--json` 模式返回 jobId
- [x] 验证 webhook 回调触发
- [x] 验证端到端流程在 60 秒内完成

## Phase 5: 质量收敛验证

### 5.1 全量测试套件验证
- [x] 运行所有 packages 测试（bun run test）
- [x] 验证测试通过率 100%
- [x] 生成覆盖率报告

### 5.2 架构检查
- [x] 运行 sf_v6_arch_check.ts 验证架构合规
- [x] 运行 cp_allocation_verifier.ts 验证 Property 覆盖率 100%
- [x] 验证所有 W2 PBT 结果仍为 passed

### 5.3 W3 Checkpoint 验证
- [x] 确认 10 次随机 kill 测试 0 数据丢失
- [x] 确认 feature_spec workflow 端到端集成通过
- [x] 更新 PROGRESS.md W3 Checkpoint 状态

## Task Dependency Graph

```
Phase 1 (feature_spec e2e)
  └── Phase 2 (崩溃恢复) [依赖 Phase 1 的 WAL 基础]
  └── Phase 3 (跨模块集成) [可与 Phase 2 并行]
  └── Phase 4 (OpenClaw 模拟) [可与 Phase 2/3 并行]
Phase 2 + Phase 3 + Phase 4
  └── Phase 5 (质量收敛) [依赖所有前置 Phase]
```

Wave 1（可并行）: 1.1, 1.2
Wave 2（可并行）: 2.1, 2.2, 3.1, 3.2, 3.3, 4.1
Wave 3（串行）: 5.1, 5.2, 5.3
