# Current observability operating guide

Policy owner: [current schema](../src/config-contract.ts). Runtime consumers: [Daemon adapter](../../daemon-core/src/observability/observability-config.ts) and [recorder](../../daemon-core/src/observability/observability-recorder.ts).

Controlled Project Init creates `<project>/.specforge/config/observability.json` with independent schema 1.0 and mode standard. Project registration validates it before runtime creation. Do not invent an unregistered mode-switching CLI or mutate policy through a historical QueryAPI object.

| Mode | Current Daemon collection |
| --- | --- |
| minimal | selected decision phases/categories; payload capture disabled |
| standard | enabled observations; redacted payload/error files; no inline payload by default |
| deep | enabled observations; redacted payload/error files; inline limit 64 KiB |

All modes retain secret redaction. Invalid/absent policy does not widen collection; the diagnostic adapter disables collection while project registration enforces persistent schema validity. A forced critical observation can be recorded through the existing owner.

Daemon records live under the producer-resolved project diagnostic log tree. They include trace/category/phase and content hashes when applicable. They are not StateManager workflow events and must not be replayed as authoritative transitions.

Use controlled read tools and minimum necessary sanitized evidence for investigation. Do not print credentials, modify authoritative events or delete logs to manufacture a clean run. [Troubleshooting](troubleshooting.md) explains evidence boundaries; [installation](../../../docs/user/install.md) owns deployment.
