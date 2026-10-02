import { afterEach, describe, expect, it } from "vitest"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { findOrphanSfFiles } from "../../../scripts/sf-installer"

const tempRoots: string[] = []

async function createSkill(root: string, name: string): Promise<void> {
  const skillDir = join(root, "skills", name)
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, "SKILL.md"), `# ${name}\n`, "utf8")
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe("findOrphanSfFiles skill coverage", () => {
  it("finds retired SpecForge workflow skills without selecting current or third-party skills", async () => {
    const root = await mkdtemp(join(tmpdir(), "specforge-orphan-skills-"))
    tempRoots.push(root)

    await createSkill(root, "sf-workflow-feature-spec")
    await createSkill(root, "sf-workflow-bugfix-spec")
    await createSkill(root, "third-party-skill")

    const orphans = findOrphanSfFiles(root, [
      { targetPath: "skills/sf-workflow-feature-spec/SKILL.md" },
    ]).map(value => value.replace(/\\/g, "/"))

    expect(orphans).toEqual(["skills/sf-workflow-bugfix-spec/SKILL.md"])
  })
})
