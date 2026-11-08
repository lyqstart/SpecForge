# Historical persistence implementation (retired)

> **历史实施证据**：本文件记录形成时的实现、测试和计划，不是当前 API、安装、权限或项目状态说明。原始字节封存于 `docs/archive/2026-11-08-crossplatform-consumer-audit/original-documents/`。当前产品边界见 SPS 与 Authority Registry；当前使用说明见本包 README，实际执行仍需当前受控入口。

SPS §8 assigns workflow-state persistence and recovery to Daemon StateManager/WAL. This old implementation is outside the current production API and build.

The unmodified document, implementation and tests are retained in [the raw baseline archive](../../docs/archive/2026-11-07-verification-production/workflow-persistence-baseline/original/packages/workflow-runtime/EVENT_REPLAY_COMPLETION_SUMMARY.md). They describe historical contracts, not current acceptance.
