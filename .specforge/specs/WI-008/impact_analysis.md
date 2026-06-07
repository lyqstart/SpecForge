# Impact Analysis — WI-008: v1.1 Review Fixes

## 变更范围

### CR-1: directory-layout.ts 重构
- **受影响文件**: `packages/types/src/directory-layout.ts`
- **变更**: LAYOUT 主区只保留 project/work-items/runtime；projectFiles 补齐 v1.1 MVP 文件；specs 降级为 legacy
- **风险**: 中 — 下游 daemon-core 依赖此布局定义

### CR-2: render-layout.ts + README.md
- **受影响文件**: `scripts/render-layout.ts`, `README.md`
- **变更**: 用户项目视角改为 project/work-items/runtime；specs 标记 legacy
- **风险**: 低 — 纯文档

### CR-3: docs/standards/ 创建
- **受影响文件**: `docs/standards/fused_standard.md`, `docs/standards/implementation_plan.md`, `docs/standards/source_mapping.md`
- **变更**: 新建标准文档目录
- **风险**: 低 — 纯新增

### CR-4: WorkflowEngine Gate 修复
- **受影响文件**: `packages/workflow-runtime/src/workflows/v11-engine-factory.ts` 或相关引擎文件
- **变更**: checkFn 缺失时 hard_gate 必须 failed；仅 not_enabled 非关键 gate 不阻断
- **风险**: 高 — 影响所有 Gate 行为

### CR-5: Path Policy 补强
- **受影响文件**: `packages/daemon-core/src/tools/lib/path-policy.ts`
- **变更**: 增加 actor + path + operation + WI status 四维检查；绑定写入角色限制
- **风险**: 中 — 可能影响 executor 写入权限

### CR-6: 状态机补强
- **受影响文件**: `packages/daemon-core/src/tools/lib/state-machine-v11.ts`
- **变更**: 关键状态绑定前置证据；approval_required/merge_ready/merging/closed 增加证据要求
- **风险**: 高 — 影响状态流转核心

## 风险评估
中 — CR-4 和 CR-6 影响核心运行时行为，需要仔细测试

## 回归测试范围
- v1.1 全部 94 个测试必须继续通过
- workflow-runtime 编译必须通过
- daemon-core 编译必须通过

## KG 关联
- WI-007 DD-A24..DD-A27 (path/layout), DD-A4..DD-A6 (gate), DD-A22 (state machine)
