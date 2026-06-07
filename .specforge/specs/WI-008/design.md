# Design — WI-008: v1.1 Review Fixes

## 简介
本设计文档描述 WI-007 v1.1 标准对齐改造后的 6 项评审修正。

## 需求
- 需求 REQ-1: directory-layout.ts 重构为 v1.1 MVP 路径 (CR-1)
- 需求 REQ-2: render-layout.ts 和 README.md 更新为 project/work-items/runtime 视角 (CR-2)
- 需求 REQ-3: 创建 docs/standards/ 标准文档 (CR-3)
- 需求 REQ-4: WorkflowEngine Gate 无 checkFn 时不得默认 passed (CR-4)
- 需求 REQ-5: Path Policy 增加 actor+path+operation+WI status 四维检查 (CR-5)
- 需求 REQ-6: 状态机关键状态绑定前置证据 (CR-6)

## 设计方案

### DD-1: directory-layout.ts 重构
- LAYOUT 主区只保留 project/work-items/runtime/config/manifest
- projectFiles 补齐 9 个 v1.1 MVP 文件
- specs 标记 legacy read-only
- logs/archive/sessions/cas 移到 runtime/ 下

### DD-2: 文档更新
- README.md 改为 project/work-items/runtime 视角

### DD-3: docs/standards/ 创建
- 3 个标准文档文件

### DD-4: WorkflowEngine Gate 修复
- checkFn 缺失时 hard_gate 必须 failed
- 仅 not_enabled/soft gate 不阻断

### DD-5: Path Policy 四维检查
- actor + path + operation + WI status

### DD-6: 状态机证据绑定
- approval_required/merge_ready/merging/closed 各绑前置证据
