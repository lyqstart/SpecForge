# Observability troubleshooting

Check the actual installed release with installer verify and independent Daemon status/health before diagnosing collection. A library object or historical example is not proof of a running diagnostic service.

Missing records can reflect policy filtering, disabled/invalid collection, different project context or a recorder failure. Read the real policy through its owner and compare the producer's trace/category/phase. Absence of a log does not prove an action did not occur. Preserve original errors and do not alter policy or retry governance mutations merely to generate logs.

Schema problems must fail closed during registration. Unsupported policy is not automatically migrated. Use current Project Init/configuration ownership and explicit legal recovery; do not add arbitrary schema fields or invoke a retired migration product.

Keep the StateManager event source separate from diagnostic JSONL/payload files. Repairing collection cannot rewrite workflow state, Gate evidence or permission history. No current standalone EventLogger rebuildState, QueryAPI mode-switch or CAS garbage-collection command is advertised.

Sanitize reports: tokens, credentials, complete configuration, raw prompts and user payloads are not ordinary diagnostic output. Preserve necessary hashes, owner-produced sanitized errors, exact numeric status and observation effects. See [current API](api.md), [policy behavior](user-guide.md) and [evidence guide](../../../docs/user/evidence-and-audit.md).
