# Configuration operating practices

Use the [shared acceptance owner](../src/accepted-config.ts) for CLI and Daemon. Keep schema identity separate from product release identity and preserve builtin → user → project → trusted runtime precedence.

Project values live at `<project>/.specforge/config/project.json`. Use `sf_project_config` for read, validation, update and restore. Check `expected_sha256`; do not overwrite concurrent changes. Runtime preserves an active WI's frozen configuration digest.

Credentials belong to their authorized user/provider owner. Project configuration rejects protected credential fields. Do not print complete configuration, tokens or environment dumps. Logger metadata is redacted, but callers must still disclose only necessary evidence.

Invalid object/schema/read/validation results block acceptance. Preserve exact error codes and relevant version/hash, resolve through the owner and resume legally. Library hot reload is not authorization to mutate active WI snapshots.

Use the [official installer](../../../docs/user/install.md), verify installed bytes and explicitly restart the independent Daemon when its runtime/configuration changes require it. Thin Plugin lifecycle does not substitute for Daemon lifecycle.
