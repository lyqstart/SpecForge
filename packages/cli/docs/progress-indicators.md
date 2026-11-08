# CLI progress output boundary

Human progress indicators are presentation helpers. They cannot establish command success, workflow status, verification evidence or permission.

JSON mode must leave stdout as the command's machine-readable result. Diagnostic messages use stderr; animated progress must not contaminate JSON. Completion/failure display follows the actual returned result and numeric exit, not an optimistic timer.

The retained SimpleProgress/JobPoller helpers have internal tests. Their existence does not register a job command or imply that the Daemon implements historical job polling routes. See [current CLI commands](../../../docs/cli/command-reference.md) and [internal polling boundary](JobPoller.md).

Original presentation examples are preserved in [the audit archive](../../../docs/archive/2026-11-08-crossplatform-consumer-audit/original-documents/packages/cli/docs/progress-indicators.md).
