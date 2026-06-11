---
name: sf-skill-playwright
description: SpecForge Playwright verification skill. Use when an AC requires browser-visible behavior, UI regression checks, screenshots, DOM assertions, console/network evidence, or end-to-end web testing.
compatibility: opencode
metadata:
  specforge_role: verification-evidence
  tool_contract: sf_playwright_run
---

# SpecForge Playwright Verification Skill

## Purpose

Use this skill to verify browser-observable acceptance criteria with structured evidence. It follows the Oh My OpenCode pattern where Playwright is a browser automation skill, but it is adapted to SpecForge: every browser action must be tied to REQ/AC/TASK traceability and consumed by verifier/reviewer.

## When to use

Load this skill when any TASK or AC mentions:

- browser, page, UI, DOM, selector, screenshot, viewport;
- login flow, form submit, navigation, client-side validation;
- Playwright, E2E, web test, regression, console, network;
- any `verification_evidence_expected` that requires UI-observable behavior.

## Hard rules

1. Playwright is not a free-form browsing tool. It is verification evidence.
2. Every assertion must reference at least one `AC-N.M`.
3. A screenshot without a machine assertion is insufficient.
4. Failed runs must preserve trace, console log, network log, and screenshot path where available.
5. Browser tests must not use production credentials or non-allowlisted production URLs.
6. Output must be consumed by `sf-verifier`; do not mark the TASK complete from this skill alone.

## TASK contract extension

When a TASK needs browser verification, `sf-task-planner` must add this field inside the TASK body and the `task_contract_summary.tasks[]` entry:

```json
{
  "ui_verification_plan": {
    "tool": "sf_playwright_run",
    "refs": ["AC-1.1"],
    "base_url": "http://127.0.0.1:3000",
    "allowlisted_hosts": ["127.0.0.1", "localhost"],
    "commands": ["bunx playwright test tests/e2e/login.spec.ts"],
    "assertions": [
      {
        "ref": "AC-1.1",
        "kind": "selector_visible",
        "selector": "[data-testid='login-success']",
        "expected": "visible"
      }
    ],
    "artifacts_dir": ".specforge/specs/<work_item_id>/evidence/playwright"
  }
}
```

## Tool call

Call:

```json
{
  "tool": "sf_playwright_run",
  "args": {
    "work_item_id": "<work_item_id>",
    "task_id": "TASK-1",
    "plan": {
      "refs": ["AC-1.1"],
      "base_url": "http://127.0.0.1:3000",
      "allowlisted_hosts": ["127.0.0.1", "localhost"],
      "commands": ["bunx playwright test tests/e2e/login.spec.ts"],
      "assertions": [
        {
          "ref": "AC-1.1",
          "kind": "selector_visible",
          "selector": "[data-testid='login-success']",
          "expected": "visible"
        }
      ],
      "artifacts_dir": ".specforge/specs/<work_item_id>/evidence/playwright"
    }
  }
}
```

## Output contract

The tool must return:

```json
{
  "status": "success | failed | blocked",
  "task_id": "TASK-1",
  "refs": ["AC-1.1"],
  "artifacts": {
    "screenshots": [],
    "trace": null,
    "console_log": null,
    "network_log": null,
    "raw_output": ".specforge/specs/<work_item_id>/evidence/playwright/run-output.json"
  },
  "assertions": [
    {
      "ref": "AC-1.1",
      "kind": "selector_visible",
      "expected": "visible",
      "actual": "visible",
      "result": "pass"
    }
  ],
  "blocking_issues": [],
  "warnings": []
}
```

## Routing

- `sf-task-planner`: creates `ui_verification_plan`.
- `sf-executor`: implements code, does not self-certify UI success.
- `sf-verifier`: calls `sf_playwright_run` and links artifacts to AC.
- `sf-reviewer`: reviews evidence and detects UI/code mismatch.
- `sf-orchestrator`: retries only via debugger/executor when failure is inside task scope.
