# Accepted configuration format

The production CLI and Daemon share [loadAcceptedConfigSync](../src/accepted-config.ts). Configuration is a JSON object. A declared `schema_version` must equal independent schema `1.0`.

| Layer | File or producer | Acceptance |
| --- | --- | --- |
| builtin | defaults in code | first layer |
| user | <OpenCode config>/sf-user/config/config.json | absent permitted; malformed rejected |
| project | <project>/.specforge/config/project.json | required with project context |
| runtime | SPECFORGE_CONFIG_OVERRIDES JSON plus trusted runtime arguments | validated after other layers |

The root follows `OPENCODE_CONFIG_DIR` when set, otherwise the shared resolver's default. It is not a project-local installation or a home-level `.specforge` root.

```json
{ "schema_version": "1.0", "logLevel": "info" }
```

Current validators and merge policy determine allowed values and sensitive-field protection. Project configuration cannot replace protected credential fields. Keep API keys, bearer tokens, passwords and provider credentials outside project configuration.

`ConfigAccess.get` and `getOr` return `{value, source, path}` and do not persist changes. Explicit library interpolation differs from production environment parsing: production does not automatically map every prefixed variable or accept an arbitrary workflow CLI command.

Errors fail closed: `CONFIGURATION_READ_FAILED`, `CONFIGURATION_INVALID_OBJECT`, `CONFIGURATION_SCHEMA_UNSUPPORTED`, `CONFIGURATION_VALIDATION_FAILED`. Record the exact code and file identity without exposing values. Resolve project changes through `sf_project_config`.

`sf_doctor` can diagnose before project acceptance. It reports missing/corrupt configuration as structured unhealthy diagnostic data, without activating configuration, initializing the project or persisting state. This exception belongs only to the exact diagnostic entry; it does not make the project layer optional for normal governance tools. Diagnostic configuration validation is not evidence that a changed configuration has been accepted for an active Work Item.
