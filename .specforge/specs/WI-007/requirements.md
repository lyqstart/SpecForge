# WI-007 Requirements (Impact Analysis): Property 21 重写与悬空契约清理（Phase 3）

## 变更范围

本变更影响 7 个文件，涵盖源码注释重写、死代码删除和文档同步三个维度。核心变更集中在 RecoverySubsystem.ts（Property 21 注释重写 L13-L17 + detectOldSessions/reconnectOldSessions 删除 L458-L538）和 Daemon.ts（L183-L188 调用点移除）。详见 impact_analysis.md。

## 风险评估

低风险。无业务逻辑变更，纯注释重写 + 死代码删除 + 文档同步。功能替代已由 Phase 2 verification_report.md 确认（startupReplay 上位替代 reconnectOldSessions）。

## 回归测试范围

需重写 property-21.test.ts（4 个测试用例从 detectOldSessions 改为 startupReplay）。需回归确认 daemon-lifecycle.test.ts 无 reconnectOldSessions 断言。新增 API 兼容性测试和冒烟测试。

## KG 关联

关联 WI-002 调查发现、Property 20/21 不变量、RecoverySubsystem/SessionRegistry/Daemon.ts 代码节点、WI-006 tasks。跨 WI 链：WI-002→WI-003→WI-004→WI-005→WI-006→WI-007。
