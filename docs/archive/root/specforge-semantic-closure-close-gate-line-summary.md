# Semantic closure close gate line summary

## Files modified

```text
packages/daemon-core/src/tools/lib/close-gate.ts
packages/daemon-core/tests/unit/close-gate-extension-request.test.ts
packages/daemon-core/tests/unit/sf-v11-close-gate.test.ts
```

## Files added

```text
packages/daemon-core/tests/unit/close-gate-semantic-closure.test.ts
docs/specforge-semantic-closure-close-gate-result.md
docs/specforge-semantic-closure-close-gate-line-summary.md
```

## Key integration points

```text
close-gate.ts
- imports validateSemanticClosure from semantic-closure-core.ts
- adds .semantic_closure.json to required close files
- adds close_semantic_closure_valid hard check
- records semantic warnings as close gate warnings
- keeps all existing close checks: user decision, code permission revoked, trace non-empty, evidence manifest, merge report, changed files audit, gate summary, extension request
```

```text
close-gate-semantic-closure.test.ts
- positive close with full OUT -> REQ -> DD -> TASK -> EV chain
- missing .semantic_closure.json blocks close
- compile-only evidence blocks close
- missing project integration status blocks close
```

```text
close-gate-extension-request.test.ts
- existing extension_request tests preserved
- fixture now includes valid .semantic_closure.json
```

```text
sf-v11-close-gate.test.ts
- handler fixture now includes valid .semantic_closure.json
- success path checks close_gate.json includes close_semantic_closure_valid
- failure path checks semantic closure missing blocks close
```
