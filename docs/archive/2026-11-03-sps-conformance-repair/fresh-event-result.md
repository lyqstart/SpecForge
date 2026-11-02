# Fresh OpenCode event probe

RUN_ID=CODEX-SF-20261103-SPS-GAP-REPAIR-A01

At 2026-11-02T17:19:29.259Z, a temporary OpenCode 1.18.35 server on 127.0.0.1:4096 emitted a `session.updated` event after the isolated session title was updated. The built `@specforge/opencode-adapter` HTTP client subscribed to the actual SSE endpoint and the Adapter delivered `opencode.session.updated` with matching session ID `ses_e62ba143affeQIEQD2WcbxZSiy`. Probe `node docs/archive/2026-11-03-sps-conformance-repair/fresh-event-probe.cjs` returned numeric exit code 0. The temporary host was stopped with Ctrl+C; its process exit was 1.

Scope: real host SSE through the built Adapter library; not proof of the installed daemon's end-to-end event consumption. The host plugin logged `REGISTER_FAILED: UNSUPPORTED_PROJECT_LAYOUT` while started from the SpecForge repository root, so no successful daemon registration is claimed. The host created an isolated OpenCode session and its normal session database/log entries; no SpecForge Work Item was created. Existing WI-0001 remains untouched.
