import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  CODE_WORKFLOWS,
  extractLatestUserInstruction,
  generateContinuationPrompt,
  type ContextSnapshot,
} from "../../src/tools/lib/sf_continuity_core";

function snapshot(boundary?: string): ContextSnapshot {
  return {
    completed_work: {
      files_created: [],
      files_modified: ["src/domain/status.js"],
      verification_commands_passed: [],
      description: "Implementation completed",
    },
    artifacts: {
      files: [],
      reports: [],
      commands: [],
      data: {},
    },
    pending_work: {
      description: "Workflow has later verification work",
      remaining_tasks: ["verification", "close"],
      expected_output: "verification report",
    },
    key_decisions: [],
    workflow_context: {
      workflow_type: "architecture_change",
      stage: "implementation_done",
      expected_output: "implementation_done",
      work_item_id: "WI-0002",
      run_id: "run-1",
    },
    ...(boundary
      ? {
          operation_boundary: {
            latest_user_instruction: boundary,
            source: "latest_user_instruction" as const,
            must_not_expand: true as const,
          },
        }
      : {}),
  };
}

describe("continuity current-user operation boundary", () => {
  test("selects the latest real user instruction exactly", () => {
    expect(
      extractLatestUserInstruction([
        { role: "user", content: "old broad task" },
        { role: "assistant", content: "working" },
        { role: "user", content: "STOP at implementation_done; Verification forbidden" },
      ]),
    ).toBe("STOP at implementation_done; Verification forbidden");
  });

  test("puts the current user boundary before Original Task and pending workflow work", () => {
    const boundary = "STOP at implementation_done; Verification forbidden";
    const prompt = generateContinuationPrompt(
      "Complete the whole workflow through Close",
      snapshot(boundary),
      1,
    );

    const boundaryIndex = prompt.indexOf("## Current User Authorization Boundary");
    const originalIndex = prompt.indexOf("## Original Task");
    expect(boundaryIndex).toBeGreaterThanOrEqual(0);
    expect(originalIndex).toBeGreaterThan(boundaryIndex);
    expect(prompt).toContain(boundary);
    expect(prompt).toContain("MUST NOT expand");
  });

  test("fails closed for side effects when the current user boundary is unavailable", () => {
    const prompt = generateContinuationPrompt(
      "Complete the whole workflow through Close",
      snapshot(),
      1,
    );
    expect(prompt).toContain("BOUNDARY_UNAVAILABLE");
    expect(prompt).toContain("side-effectful");
  });

  test("treats architecture_change as a code workflow", () => {
    expect(CODE_WORKFLOWS).toContain("architecture_change");
  });

  test("pins orchestrator and authority precedence contracts", async () => {
    const repoRoot = join(import.meta.dirname, "../../../..");
    const orchestrator = await readFile(
      join(repoRoot, "setup/userlevel-opencode/agents/sf-orchestrator.md"),
      "utf-8",
    );
    const authority = await readFile(
      join(repoRoot, "docs/design/SpecForge架构一致性治理最终实施方案.md"),
      "utf-8",
    );
    const ledger = await readFile(
      join(repoRoot, "docs/rule/specforge-development-error-ledger-and-experience.md"),
      "utf-8",
    );

    expect(orchestrator).toContain("旧 Prompt 可以说明长期目标，但不能替代最新用户授权");
    expect(orchestrator).toContain("达到用户明确 stop condition 后立即结束本轮");
    expect(authority).toContain("GOV-CONT-001");
    for (const token of ["ERR-189", "ERR-190", "ERR-191", "EXP-161", "EXP-162", "EXP-163"]) {
      expect(ledger).toContain(token);
    }
  });
});
