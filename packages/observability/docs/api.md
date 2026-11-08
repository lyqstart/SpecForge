# Current observability API

Derived from [public exports](../src/index.ts) and [configuration contract](../src/config-contract.ts).

| Runtime export | Contract |
| --- | --- |
| OBSERVABILITY_CONFIG_SCHEMA_VERSION | independent policy schema 1.0 |
| OBSERVABILITY_CONFIG_SCHEMA_DESCRIPTOR | required project policy descriptor |
| parseObservabilityConfigDocument(value) | validates object, exact supported keys/schema/mode |
| serializeObservabilityConfigDocument(mode) | serializes current policy; default standard |

The public type surface and event utilities are declared in [types/index.ts](../src/types/index.ts) and [event-utils](../src/types/event-utils.ts). Interfaces do not imply runtime constructors. Private historical QueryAPI/EventLogger/Analyst implementations are not a second current state owner.

Current shared EventCategory values are 'workflow', 'gate', 'permission', 'session', 'tool', 'system', 'llm' and 'migration'. A neutral diagnostic category does not enable a Migration product module or a separate state authority.

Accepted policy:

```json
{ "schema_version": "1.0", "mode": "standard" }
```

Modes: minimal, standard, deep. Extra keys, unsupported schema and invalid modes are rejected. Exact parser errors include OBSERVABILITY_CONFIG_INVALID_ROOT, OBSERVABILITY_CONFIG_UNKNOWN_FIELDS, OBSERVABILITY_CONFIG_SCHEMA_UNSUPPORTED and OBSERVABILITY_CONFIG_MODE_INVALID; suffixes may carry diagnostics and must be reviewed before sharing.

The [Daemon configuration adapter](../../daemon-core/src/observability/observability-config.ts) maps policy to collection behavior; [recorder](../../daemon-core/src/observability/observability-recorder.ts) writes neutral diagnostic records. Those schemas/timestamp domains differ from exported Event contracts and authoritative StateManager events. Use the producer's actual schema and resolver.

Project registration separately blocks unsupported persistent schemas. Diagnostic collection failure must not create permissions, successful Gates or workflow transitions. No independent observability rebuildState operation is authorized to rewrite StateManager truth.
