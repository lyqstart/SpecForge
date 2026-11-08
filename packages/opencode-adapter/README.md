# @specforge/opencode-adapter

Internal workspace adapter between the independent SpecForge Daemon and a real OpenCode kernel. Deploy with the [official release](../../docs/user/install.md).

Production Daemon supplies the real runtime client. Global Thin Plugin is a Daemon client. Verify kernel/provider readiness, actual sessions/responses and real tool execution from those owners. Standalone library construction and test doubles do not prove production readiness.

Provider metadata is authoritative only when reported. Missing capability fields remain `null` / `unknown`; never infer structured output, tool support or context limits from model names.

See [installation](docs/installation.md), [source](src/) and [authority](../../docs/product-specification/authority-registry.md). Build/test through current workspace order. Recovery must preserve actual failure evidence and cannot manufacture WI completion or bypass controlled tools.
