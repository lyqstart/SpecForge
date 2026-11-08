# Internal JobPoller reference

JobPoller is retained internal CLI library code. The current released command tree does not register a job command, job service endpoint or public @specforge/cli/job installation entry. Do not use historical job CLI examples as an operating recipe.

Inspect the actual source under the CLI job directory for constructor options, polling callback/result types, cancellation, budgets and cleanup. A caller-supplied poll function must use an implemented authenticated owner; no generic /jobs route is implied.

Polling observations do not own workflow state or prove execution/closure. Preserve returned blocked/failed/cancelled results and actual errors. Clean timers/listeners when cancelling and keep progress output out of JSON stdout.

The former detailed tutorial is retained under [the audit archive](../../../docs/archive/2026-11-08-crossplatform-consumer-audit/original-documents/packages/cli/docs/JobPoller.md). Current user commands are in the [CLI reference](../../../docs/cli/command-reference.md).
