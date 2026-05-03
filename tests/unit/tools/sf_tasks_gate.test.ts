import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { checkTasksGate } from "../../../.opencode/tools/lib/sf_tasks_gate_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("sf_tasks_gate", () => {
  const testDir = join(tmpdir(), `specforge-tasks-gate-${Date.now()}`)
  const workItemId = "WI-001"
  const specDir = join(testDir, "specforge", "specs", workItemId)

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe("gate pass", () => {
    it("should pass when all tasks have verification_commands", async () => {
      const content = `# 任务列表

## Task 1: 初始化项目

设置项目结构。

verification_commands:
- npm run build
- npm run test

## Task 2: 实现功能

实现核心功能。

verification_commands:
- npm run test:unit
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
      expect(result.next_action).toBe("continue")
    })

    it("should pass with single task having verification_commands", async () => {
      const content = `# Tasks

## Setup

Initialize the project.

verification_commands:
- npm install
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })
  })

  describe("gate fail", () => {
    it("should fail when tasks.md does not exist", async () => {
      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues).toContain("tasks.md not found")
      expect(result.next_action).toBe("revise")
    })

    it("should fail when a task is missing verification_commands", async () => {
      const content = `# 任务列表

## Task 1: 初始化项目

verification_commands:
- npm run build

## Task 2: 实现功能

Just a description without verification commands.
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues).toHaveLength(1)
      expect(result.blocking_issues[0]).toContain("Task 2")
      expect(result.blocking_issues[0]).toContain("verification_commands")
    })

    it("should fail when multiple tasks are missing verification_commands", async () => {
      const content = `# 任务列表

## Task 1: Setup

No verification.

## Task 2: Build

No verification either.

## Task 3: Deploy

verification_commands:
- deploy.sh
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues).toHaveLength(2)
    })

    it("should fail when no task sections found", async () => {
      const content = `# 任务列表

No tasks defined yet.
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues[0]).toContain("未找到任何任务章节")
    })
  })
})
