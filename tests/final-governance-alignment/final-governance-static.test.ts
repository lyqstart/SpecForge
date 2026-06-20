import { describe, expect, it } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf-8")

describe("Final Governance Alignment static invariants", () => {
  it("state_machine.ts exposes only final runtime states", () => {
    const file = read("packages/daemon-core/src/tools/lib/state_machine.ts")
    const forbidden = [
      '"intake"', '"requirements"', '"requirements_gate"', '"design_gate"',
      '"tasks_gate"', '"development"', '"review"', '"bugfix_analysis"',
      '"bugfix_gate"', '"fix_design"'
    ]
    for (const token of forbidden) expect(file.includes(token), token).toBe(false)
    for (const token of [
      '"created"','"approval_required"','"approved"','"implementation_done"',
      '"verification_done"','"closed"'
    ]) expect(file.includes(token), token).toBe(true)
  })

  it("workflow_type is not overwritten by workflow_path", () => {
    const file = read("packages/daemon-core/src/tools/lib/state_machine.ts")
    expect(file).toContain("isWorkflowTypeCompatibleWithPath")
    expect(file).toContain("return undefined")
    expect(file).toContain("bugfix_spec")
  })

  it("sf_user_decision_record wrapper exposes required evidence fields", () => {
    const file = read("setup/userlevel-opencode/tools/sf_user_decision_record.ts")
    expect(file).toContain("user_response_quote")
    expect(file).toContain("auto_approval_policy_id")
    expect(file).toContain("comments / reason")
    expect(file).not.toMatch(/comments\s*\|\|\s*payload\.user_response_quote/)
  })

  it("bugfix skill no longer uses legacy bugfix mainline", () => {
    const file = read("setup/userlevel-opencode/skills/sf-workflow-bugfix-spec/SKILL.md")
    for (const token of ["bugfix_gate", "fix_design", "gate_type", "mode"]) {
      expect(file.includes(token), token).toBe(false)
    }
    expect(file).toContain("Candidate 四件套")
  })

  it("work_item cannot carry user decision fields", () => {
    const files = [
      "packages/daemon-core/src/tools/handlers/sf-artifact-write.ts",
      "packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts",
      "packages/daemon-core/src/tools/lib/artifact-schema-validation.ts",
      "packages/daemon-core/src/tools/lib/governance-invariants-v11.ts",
      "packages/daemon-core/src/tools/lib/close-gate.ts",
    ].filter(existsSync)

    const combined = files.map(read).join("\n")
    expect(combined).toMatch(/WORK_ITEM_CANNOT_CARRY_USER_DECISION|decision_status|user_response_quote/)
  })
})
