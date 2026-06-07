# Design Delta — WI-008: v1.1 Review Fixes

## 增量设计描述
6 targeted fixes per review feedback. See tasks.md for detailed implementation.

## 受影响模块
- packages/types/src/directory-layout.ts
- scripts/render-layout.ts, README.md
- docs/standards/ (new)
- packages/workflow-runtime (2 WorkflowEngine files + types)
- packages/daemon-core/src/tools/lib/path-policy.ts
- packages/daemon-core/src/tools/lib/state-machine-v11.ts

## 兼容性影响
- LAYOUT key removal may break downstream consumers using removed keys
- WorkflowEngine gate behavior change: previously passing gates will now fail
- Path policy becomes stricter

## 回归风险
中 — CR-4 和 CR-6 影响核心行为

## KG 追溯关系
Maps to WI-007 DD-A24..DD-A27, DD-A4..DD-A6, DD-A22
