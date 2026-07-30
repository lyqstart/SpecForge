import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  checkTraceMatrix,
  extractDesignReqReferences,
  extractDesignSections,
  extractRequirementIds,
} from "./sf_trace_matrix_core"

describe("sf_trace_matrix canonical trace parsing", () => {
  let projectRoot: string
  const workItemId = "WI-0002"

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "specforge-trace-matrix-"))
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  it("extracts declared IDs without treating prose fragments or ordinary headings as nodes", () => {
    const requirements = [
      "# Requirements",
      "REQ-NNN is a format example; EVREQ-010a is evidence.",
      "### REQ-CORE-001 Create item",
      "### REQ-CORE-002 Start item",
      "REQ-CORE-001~002 is a range summary.",
    ].join("\n")
    const design = [
      "## Existing Architecture Analysis",
      "#### DD-DOMAIN-001 Entity",
      "#### DD-STORAGE-001 Repository",
    ].join("\n")

    expect(extractRequirementIds(requirements)).toEqual([
      "REQ-CORE-001",
      "REQ-CORE-002",
    ])
    expect(extractDesignSections(design)).toEqual([
      "DD-DOMAIN-001",
      "DD-STORAGE-001",
    ])
  })

  it("expands structured legacy requirement ranges without accepting invalid fragments", () => {
    const refs = extractDesignReqReferences(
      "- **refs**: [REQ-001..REQ-003, EVREQ-010a, REQ-NNN]"
    )

    expect(refs).toEqual(["REQ-001", "REQ-002", "REQ-003"])
  })

  it("checks canonical requirements, DD declarations, and task refs while excluding explicit projections", async () => {
    const candidateRoot = join(
      projectRoot,
      ".specforge",
      "work-items",
      workItemId,
      "candidates"
    )
    const coreDir = join(candidateRoot, "project", "modules", "CORE")
    const domainDir = join(candidateRoot, "project", "modules", "DOMAIN")
    await mkdir(coreDir, { recursive: true })
    await mkdir(domainDir, { recursive: true })

    await writeFile(
      join(coreDir, "requirements.candidate.md"),
      [
        "# Canonical Requirements",
        "### REQ-CORE-001 Create item",
        "### REQ-CORE-002 Start item",
      ].join("\n")
    )
    await writeFile(
      join(domainDir, "requirements.candidate.md"),
      [
        "# Domain projection",
        "> 投影声明：本文件是 CORE canonical 源在 DOMAIN 模块视角的投影。",
        "### REQ-DOMAIN-001 Create item projection",
        "### REQ-DOMAIN-002 Start item projection",
      ].join("\n")
    )
    await writeFile(
      join(domainDir, "design.candidate.md"),
      [
        "# Design",
        "## Existing Architecture Analysis",
        "#### DD-DOMAIN-001 Entity",
        "- **refs**: [REQ-001]",
        "#### DD-DOMAIN-002 Transition",
        "- **refs**: [REQ-002]",
      ].join("\n")
    )
    await writeFile(
      join(candidateRoot, "tasks.md"),
      [
        "# Tasks",
        "### TASK-WI-0002-001 Implement domain",
        "- **refs**: [REQ-CORE-001, REQ-CORE-002, DD-DOMAIN-001, DD-DOMAIN-002]",
      ].join("\n")
    )

    const result = await checkTraceMatrix(workItemId, projectRoot)

    expect(result).toMatchObject({
      status: "pass",
      uncovered_requirements: [],
      uncovered_designs: [],
      coverage_summary: {
        total_requirements: 2,
        covered_requirements: 2,
        total_design_sections: 2,
        covered_design_sections: 2,
        requirement_coverage_pct: 100,
        design_coverage_pct: 100,
      },
    })
  })

  it("reports a canonical DD that no task refs field covers", async () => {
    const candidateRoot = join(
      projectRoot,
      ".specforge",
      "work-items",
      workItemId,
      "candidates"
    )
    const coreDir = join(candidateRoot, "project", "modules", "CORE")
    await mkdir(coreDir, { recursive: true })
    await writeFile(
      join(coreDir, "requirements.candidate.md"),
      "### REQ-CORE-001 Create item\n"
    )
    await writeFile(
      join(coreDir, "design.candidate.md"),
      [
        "#### DD-CORE-001 Covered design",
        "- **refs**: [REQ-CORE-001]",
        "#### DD-CORE-002 Uncovered design",
        "- **refs**: [REQ-CORE-001]",
      ].join("\n")
    )
    await writeFile(
      join(candidateRoot, "tasks.md"),
      [
        "### TASK-WI-0002-001 Implement",
        "- **refs**: [REQ-CORE-001, DD-CORE-001]",
      ].join("\n")
    )

    const result = await checkTraceMatrix(workItemId, projectRoot)

    expect(result.status).toBe("fail")
    expect(result.uncovered_designs).toEqual(["DD-CORE-002"])
  })
})
