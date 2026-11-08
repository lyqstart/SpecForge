# Evidence-based investigation

The historical five-minute objective is an investigation aspiration, not an implemented automatic root-cause or closure guarantee. Current observability supplies neutral contracts and diagnostic evidence; it does not deploy a standalone AnalystEngine or QueryAPI service.

For Gate failure, permission denial, tool error, startup/upgrade failure, blocked workflow, session/Skill loading or result deviation:

1. Capture the exact error/result and relevant release/process/project/WI identities.
2. Read authoritative Runtime events and owner-produced Gate/Decision/Permission/Verification/Merge/Close artifacts.
3. Correlate sanitized diagnostic records by trace/session/WI identity without treating timestamps from different producers as one monotonic clock.
4. Separate directly confirmed facts, corroboration and hypotheses. Missing evidence remains INSUFFICIENT_EVIDENCE.
5. Locate the first deviation and its owner; resume the same legal breakpoint after the owner repairs the capability.

Logs show what was recorded. Agent text records claims. Neither alone proves actual command/model execution, valid approval, successful verification or workflow closure.

Do not add speculative dependencies, reopen closed work, edit truth sources, bypass HardStops or reconstruct workflow state through observability. Current product behavior remains in [SPS](../../../docs/product-specification/specforge-product-specification.md); recovery uses the [operating guide](../../../docs/user/recovery-and-rollback.md).
