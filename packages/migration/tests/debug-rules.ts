import { detectAndRepair, type RepairRuleId } from "../src/repair-engine"
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "fs"
import { join } from "path"

async function testAllRules() {
  const triggeredRules = new Set<RepairRuleId>()

  // Rule 1: rebuild_from_events - valid events, no state
  {
    const testDir = join(process.cwd(), "packages/migration/tests/temp/r1")
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
    writeFileSync(join(testDir, "events.jsonl"), '{"event":"design.started"}', "utf-8")
    const result = await detectAndRepair({ baseDir: testDir, logEvents: false })
    triggeredRules.add(result.ruleApplied)
    console.log("Rule 1:", result.ruleApplied)
    rmSync(testDir, { recursive: true, force: true })
  }

  // Rule 2: use_state_with_warning - valid state, corrupted events
  {
    const testDir = join(process.cwd(), "packages/migration/tests/temp/r2")
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
    writeFileSync(join(testDir, "state.json"), '{"phase":"design","schema_version":"1.0.0"}', "utf-8")
    writeFileSync(join(testDir, "events.jsonl"), "not valid jsonl", "utf-8")
    const result = await detectAndRepair({ baseDir: testDir, logEvents: false })
    triggeredRules.add(result.ruleApplied)
    console.log("Rule 2:", result.ruleApplied)
    rmSync(testDir, { recursive: true, force: true })
  }

  // Rule 3: rollback_to_requirements - state says design, no design.md
  {
    const testDir = join(process.cwd(), "packages/migration/tests/temp/r3")
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
    writeFileSync(join(testDir, "events.jsonl"), "", "utf-8")
    writeFileSync(join(testDir, "state.json"), '{"phase":"design","schema_version":"1.0.0"}', "utf-8")
    // No design.md
    const result = await detectAndRepair({ baseDir: testDir, checkDesignPhase: true, logEvents: false })
    triggeredRules.add(result.ruleApplied)
    console.log("Rule 3:", result.ruleApplied)
    console.log("state after:", readFileSync(join(testDir, "state.json"), "utf-8").substring(0, 100))
    rmSync(testDir, { recursive: true, force: true })
  }

  // Rule 4: fresh_start - both corrupted
  {
    const testDir = join(process.cwd(), "packages/migration/tests/temp/r4")
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
    writeFileSync(join(testDir, "events.jsonl"), "{{invalid", "utf-8")
    writeFileSync(join(testDir, "state.json"), "{{invalid", "utf-8")
    const result = await detectAndRepair({ baseDir: testDir, logEvents: false })
    triggeredRules.add(result.ruleApplied)
    console.log("Rule 4:", result.ruleApplied)
    rmSync(testDir, { recursive: true, force: true })
  }

  console.log("\nTriggered:", Array.from(triggeredRules))
}

testAllRules()