/* eslint-disable */
/**
 * Bug condition exploration property test — Property 6 (P9 + cross-cutting)
 * Orchestrator Relays `blocking_issues` Without Prescribing Conclusions.
 *
 * **Validates: Requirements 2.7, 2.8**
 *
 * BUG CONDITION (isBugCondition('gate_failure_feedback')): when an investigation Gate
 * fails, the `sf-orchestrator` steering has NO contract requiring it to relay the gate's
 * structured `blocking_issues` to `sf-investigator` untouched. Under the A-cluster
 * failure loops the orchestrator instead reads `findings_report.md` and prescribes the
 * investigator's conclusions — dictating hypothesis verdict tokens, the final root-cause
 * status (e.g. "use `ROOT_CAUSE_PROBABLE`"), the premise status and verbatim
 * justification — crossing the §14.7.2 / §14.7.5 independence boundary.
 *
 * This is amplified by the CROSS-CUTTING opacity of the P4–P7 `blocking_issues`: they do
 * NOT name the exact expected header token, the canonical evidence-ID form `EV-<id>`, or
 * the accepted verdict vocabulary, so "prescribe the right answer" becomes the path of
 * least resistance.
 *
 * EXPECTED (fixed) BEHAVIOR:
 *   - The `sf-orchestrator` steering requires, on investigation-gate failure, relaying the
 *     gate's structured `blocking_issues` untouched and FORBIDS prescribing verdicts,
 *     root-cause status, premise status, or justification text (§14.7.2 / §14.7.5).
 *   - The gate's `blocking_issues` for a genuinely-missing section, an unrecognized
 *     verdict, and a sub-threshold evidence set are self-explanatory: they name the exact
 *     expected header token, the accepted verdict vocabulary, and the canonical
 *     evidence-ID form `EV-<id>` respectively.
 *
 * CRITICAL: This test is EXPECTED TO FAIL on the UNFIXED code/steering. The failure
 * confirms the bug exists (no failure-feedback independence contract; opaque
 * `blocking_issues`). DO NOT fix the code, the steering, or the test when it fails.
 */

import { describe, it, expect } from "vitest"
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { checkFindingsReportContent } from "../../packages/daemon-core/src/tools/lib/sf_design_gate_core"
import {
  checkRequirementsGate,
  REQUIREMENTS_GATE_SPECS,
} from "../../packages/daemon-core/src/tools/lib/sf_requirements_gate_core"
import { workItemRoot } from "@specforge/types/directory-layout"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, "../..")
const ORCHESTRATOR_STEERING = resolve(
  REPO_ROOT,
  "setup/userlevel-opencode/agents/sf-orchestrator.md"
)

// ============================================================
// Part A — P9: orchestrator independence on gate failure (steering contract)
// ============================================================

function readSteering(): string {
  return readFileSync(ORCHESTRATOR_STEERING, "utf8")
}

/**
 * The fixed steering must state that on investigation-gate FAILURE the orchestrator
 * relays the gate's structured `blocking_issues` to the investigator untouched.
 */
function steeringRelaysBlockingIssuesOnFailure(text: string): boolean {
  // The structured feedback token must appear at all...
  if (!/blocking_issues/i.test(text)) return false
  // ...tied to a "relay untouched / pass through as-is" instruction.
  return /(原样|untouched|逐字|如实|结构化).{0,40}(传递|返回|转交|relay|pass)/is.test(text)
}

/**
 * The fixed steering must FORBID prescribing the investigator's conclusions on failure:
 * hypothesis verdicts, final root-cause status, premise status, or justification text.
 */
function steeringForbidsPrescribingConclusionsOnFailure(text: string): boolean {
  const prohibition = /(不得|禁止|MUST NOT|不能)/i
  const conclusionTerms =
    /(判定|verdict|根因状态|root[-_ ]?cause[-_ ]?status|ROOT_CAUSE_(?:PROBABLE|CONFIRMED)|前提状态|premise|理由文本|justification)/i
  // Require the prohibition to co-occur with the structured feedback token so the rule is
  // scoped to the failure-feedback path (absent entirely on the unfixed steering).
  return prohibition.test(text) && conclusionTerms.test(text) && /blocking_issues/i.test(text)
}

describe("Property 6 (P9): orchestrator relays blocking_issues without prescribing conclusions", () => {
  it("sf-orchestrator steering relays the gate's structured blocking_issues untouched on investigation-gate failure", () => {
    const steering = readSteering()
    // Expected (fixed) behavior: failure feedback is the gate's structured blocking_issues,
    // passed through as-is.
    expect(steeringRelaysBlockingIssuesOnFailure(steering)).toBe(true)
  })

  it("sf-orchestrator steering forbids prescribing verdicts / root-cause status / premise / justification on failure (§14.7.2 / §14.7.5)", () => {
    const steering = readSteering()
    // Expected (fixed) behavior: on gate failure the orchestrator MUST NOT dictate the
    // investigator's conclusions.
    expect(steeringForbidsPrescribingConclusionsOnFailure(steering)).toBe(true)
  })
})

// ============================================================
// Part B — cross-cutting: P4–P7 blocking_issues must be self-explanatory (Req 2.8)
// ============================================================

// ---- P7 cross-cutting: the missing-verdict blocking issue names the accepted vocabulary ----

const ACCEPTED_VERDICT_VOCABULARY = ["confirmed", "rejected", "unknown", "partially_confirmed"]

function buildHypothesisSectionNoVerdict(): string {
  return [
    "### 假设验证结果",
    "",
    "- H1：主假设——初始化顺序错误。判定：rejected。实验结果：命令输出显示顺序正确，证据 EV-001。",
    // H2 carries NO recognized verdict token at all -> the missing-verdict issue fires on
    // both unfixed and fixed code, so the cross-cutting naming requirement is what varies.
    "- H2：竞争假设——缓存未失效。判定：待定XYZ。实际结果：日志证据表明缓存已失效，证据 EV-002。",
    "",
  ].join("\n")
}

function buildVerdictContent(hypothesisSection: string): string {
  return ["# Findings Report", "", "## 根因判定", "ROOT_CAUSE_PROBABLE", "", "## 假设验证结果", hypothesisSection, ""].join(
    "\n"
  )
}

const H2_MISSING_VERDICT_ISSUE = "假设 H2 必须在同一结果项中给出明确判定"

describe("Property 6 (cross-cutting, P7): missing-verdict blocking issue names the accepted verdict vocabulary", () => {
  it("lists the accepted verdict vocabulary so revision does not require reverse-engineering the parser", () => {
    const hypothesisSection = buildHypothesisSectionNoVerdict()
    const content = buildVerdictContent(hypothesisSection)
    const result = checkFindingsReportContent(content, { 假设验证结果: hypothesisSection })

    const verdictIssue = result.blocking_issues.find(issue => issue.includes(H2_MISSING_VERDICT_ISSUE))
    // Sanity: the missing-verdict issue must have fired for H2.
    expect(verdictIssue).toBeDefined()

    // Expected (fixed) behavior: the blocking issue NAMES the accepted verdict vocabulary.
    const namesVocabulary = ACCEPTED_VERDICT_VOCABULARY.every(token => verdictIssue!.includes(token))
    expect(namesVocabulary).toBe(true)
  })
})

// ---- P6 cross-cutting: the >=2-evidence blocking issue names the canonical form EV-<id> ----

const TWO_EVIDENCE_ISSUE = "ROOT_CAUSE_CONFIRMED 至少需要两个可区分的原始证据引用"

function buildEvidenceSections(ev1: string, ev2: string): Record<string, string> {
  return {
    调查结论: ["针对原始调查问题：为什么初始化在依赖注入之前完成？", "直接回答：根因是初始化顺序错误。"].join("\n"),
    问题前提与证据完整性: "PREMISE_REPRODUCED；OBSERVER_EFFECT_NONE。原始证据已在事件日志中固化。",
    假设验证结果: [
      `- H1：主假设——初始化顺序错误。判定：confirmed。实验结果：命令输出证实顺序错误（证据 ${ev1}）。`,
      `- H2：竞争假设——缓存未失效。判定：rejected。实验结果：命令输出排除该假设（证据 ${ev2}）。`,
    ].join("\n"),
    事实与证据: [
      "CODE_OBSERVED：命令输出显示初始化在依赖注入之前执行。",
      `一级原始证据 ${ev1} 与 ${ev2} 可回溯到 \`src/init.ts\` 的调用栈。`,
    ].join("\n"),
    调用链与首次偏离点: "首次偏离点：预期（expected）初始化在注入之后；实际（actual）在注入之前。",
    因果链: "根本缺陷 → 触发条件（启动时序）→ 用户症状（空引用）。",
  }
}

describe("Property 6 (cross-cutting, P6): >=2-evidence blocking issue names the canonical evidence-ID form EV-<id>", () => {
  it("names the canonical evidence-ID form so the required form is not undocumented", () => {
    // Cite evidence in a form the gate genuinely CANNOT count so the >=2-evidence issue
    // fires; the cross-cutting requirement is that the issue names the canonical form
    // EV-<id>. NOTE: the P6 fix (task 16.4/16.5) settled the documented evidence-ID forms
    // as `EV-<id>` plus the concise `E<n>` shorthand (both are extracted — see
    // investigation-gate-evidence-id-form.property.test.ts, which requires E1/E7 to be
    // accepted). To exercise the ≥2-evidence blocking issue here we therefore cite evidence
    // in neither documented form (Chinese labels with no EV-/E<n> token) so extraction
    // yields zero references and the issue fires — without weakening the credibility rule.
    const sections = buildEvidenceSections("证据甲", "证据乙")
    const content = ["# Findings Report", "", "## 根因判定", "ROOT_CAUSE_CONFIRMED", ""].join("\n")
    const result = checkFindingsReportContent(content, sections)

    const evidenceIssue = result.blocking_issues.find(issue => issue.includes(TWO_EVIDENCE_ISSUE))
    // Sanity: the >=2-evidence issue must have fired.
    expect(evidenceIssue).toBeDefined()

    // Expected (fixed) behavior: the blocking issue names the canonical form `EV-<id>`.
    expect(evidenceIssue).toContain("EV-<id>")
  })
})

// ---- P4 cross-cutting: the Missing-section blocking issue names the exact expected header token ----

function investigationRequiredSections(): string[] {
  const spec = REQUIREMENTS_GATE_SPECS.find(s => s.mode === "investigation")
  if (!spec) throw new Error("investigation gate spec not found")
  return spec.requiredSections
}

/**
 * Build an investigation_plan.md that contains every required section EXCEPT `预期产出`
 * (genuinely absent — no header whose text starts with the canonical name). The gate must
 * report `Missing section: 预期产出`; the cross-cutting requirement is that the blocking
 * issue names the EXACT expected header token (canonical markdown header form) rather than
 * leaving the agent to reverse-engineer it.
 */
function buildInvestigationPlanMissingOneSection(omit: string): string {
  const lines: string[] = ["# 调查计划", ""]
  for (const name of investigationRequiredSections()) {
    if (name === omit) continue
    lines.push(`## ${name}`, `${name} 的正文内容。`, "")
  }
  return lines.join("\n")
}

describe("Property 6 (cross-cutting, P4): Missing-section blocking issue names the exact expected header token", () => {
  it("names the exact expected canonical header token for a genuinely-missing section", async () => {
    const omitted = "预期产出"
    const baseDir = mkdtempSync(join(tmpdir(), "sf-invgate-p9-"))
    try {
      const wiDir = workItemRoot(baseDir, "WI-0001")
      mkdirSync(wiDir, { recursive: true })
      writeFileSync(
        join(wiDir, "investigation_plan.md"),
        buildInvestigationPlanMissingOneSection(omitted),
        "utf8"
      )

      const result = await checkRequirementsGate("WI-0001", baseDir, { mode: "investigation" })

      const missingIssue = result.blocking_issues.find(issue => issue.includes(`Missing section: ${omitted}`))
      // Sanity: the section is genuinely reported missing.
      expect(missingIssue).toBeDefined()

      // Expected (fixed) behavior: the blocking issue names the EXACT expected header token
      // (canonical markdown header form), not just the bare name.
      expect(missingIssue).toContain(`## ${omitted}`)
    } finally {
      rmSync(baseDir, { recursive: true, force: true })
    }
  })
})
