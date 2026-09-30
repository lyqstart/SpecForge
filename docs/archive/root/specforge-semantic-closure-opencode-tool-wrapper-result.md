# SpecForge v1.3.0 OpenCode Tool Wrapper Fix

## Problem

The daemon-core source and dist already register the semantic closure handler and public alias:

- internal handler: `sf_v11_semantic_closure_run`
- public daemon alias: `sf_semantic_closure_run`

However, OpenCode does not discover daemon handlers directly. OpenCode only exposes tools that exist as user-level plugin wrapper files under:

```text
setup/userlevel-opencode/tools/*.ts
```

Before this fix, the repository had the daemon handler but did not have:

```text
setup/userlevel-opencode/tools/sf_semantic_closure_run.ts
```

Therefore OpenCode sessions could see updated agent instructions that mention `sf_semantic_closure_run`, but the actual toolset still omitted it.

## Change

Added:

```text
setup/userlevel-opencode/tools/sf_semantic_closure_run.ts
```

The wrapper forwards OpenCode tool calls to the daemon public alias:

```ts
daemon.invokeTool("sf_semantic_closure_run", args, context)
```

## Tool behavior

The wrapper exposes:

```text
sf_semantic_closure_run(work_item_id, force?)
```

It must be called after verification evidence is produced and before `sf_close_gate`.

It writes only current Work Item semantic closure artifacts through the daemon handler:

```text
.specforge/work-items/WI-XXXX/.semantic_closure.json
.specforge/work-items/WI-XXXX/semantic_closure_report.md
```

It does not advance state and does not bypass close gate.

## Verification expectation

After copying this file and running installer upgrade, a fresh OpenCode session should include `sf_semantic_closure_run` in the available toolset. A probe call with a nonexistent Work Item should now return a business error such as missing `work_item.json`, not "tool unregistered".
