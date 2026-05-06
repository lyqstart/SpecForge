import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  loadStore,
  saveStore,
  getGlobalStorePath,
  getLockPath,
  addEntry,
  updateEntry,
  removeEntry,
  getEntry,
  listEntries,
  searchEntries,
  calculateRelevanceScore,
  checkDuplicate,
  recordFeedback,
  qualityCheck,
  cleanup,
  addCategory,
} from "../../../.opencode/tools/lib/sf_knowledge_base_core"
import type {
  GlobalKnowledgeStore,
  KnowledgeEntry,
  AddEntryParams,
} from "../../../.opencode/tools/lib/sf_knowledge_base_core"

describe("sf_knowledge_base_core", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sf-kb-test-"))
    process.env.SF_KNOWLEDGE_STORE_DIR = tempDir
  })

  afterEach(async () => {
    delete process.env.SF_KNOWLEDGE_STORE_DIR
    await rm(tempDir, { recursive: true, force: true })
  })

  // ============================================================
  // Storage Layer
  // ============================================================

  describe("storage layer", () => {
    it("getGlobalStorePath returns correct path", () => {
      const storePath = getGlobalStorePath()
      expect(storePath).toContain("insights.json")
    })

    it("getLockPath returns correct path", () => {
      const lockPath = getLockPath()
      expect(lockPath).toContain("insights.lock")
    })

    it("loadStore creates empty store when file does not exist", async () => {
      const store = await loadStore()
      expect(store.version).toBe("1.0")
      expect(store.categories).toHaveLength(5)
      expect(store.entries).toHaveLength(0)
      expect(store.metadata.total_entries).toBe(0)
    })

    it("loadStore returns existing store", async () => {
      // Create a store first
      const store = await loadStore()
      store.entries.push({
        id: "KE-test-001",
        title: "Test Entry",
        content: "Test content",
        category: "failure_pattern",
        tags: ["test"],
        applicable_file_patterns: ["*.ts"],
        confidence: "high",
        status: "active",
        source_project: "test",
        source_work_item: "WI-001",
        usage_count: 0,
        helpful_count: 0,
        rejected_count: 0,
        last_used_at: null,
        anti_conditions: [],
        applicability: "",
        verification_status: "unverified",
        normalized_key: "failure_pattern:test",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      })
      await saveStore(store)

      // Reload
      const reloaded = await loadStore()
      expect(reloaded.entries).toHaveLength(1)
      expect(reloaded.entries[0].title).toBe("Test Entry")
    })

    it("loadStore throws on corrupted JSON", async () => {
      const storePath = getGlobalStorePath()
      const dir = join(storePath, "..")
      await mkdir(dir, { recursive: true })
      await writeFile(storePath, "not valid json{{{", "utf-8")

      await expect(loadStore()).rejects.toThrow("corrupted")
    })

    it("saveStore updates metadata", async () => {
      const store = await loadStore()
      store.entries.push({
        id: "KE-test-001",
        title: "Test",
        content: "Content",
        category: "checklist",
        tags: [],
        applicable_file_patterns: [],
        confidence: "low",
        status: "candidate",
        source_project: "test",
        source_work_item: "WI-001",
        usage_count: 0,
        helpful_count: 0,
        rejected_count: 0,
        last_used_at: null,
        anti_conditions: [],
        applicability: "",
        verification_status: "unverified",
        normalized_key: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      })
      await saveStore(store)

      const raw = JSON.parse(await readFile(getGlobalStorePath(), "utf-8"))
      expect(raw.metadata.total_entries).toBe(1)
      expect(raw.metadata.last_updated).toBeTruthy()
    })

    it("default categories include all 5 types", async () => {
      const store = await loadStore()
      const ids = store.categories.map((c) => c.id)
      expect(ids).toContain("failure_pattern")
      expect(ids).toContain("modification_pattern")
      expect(ids).toContain("stack_experience")
      expect(ids).toContain("workflow_tip")
      expect(ids).toContain("checklist")
    })
  })

  // ============================================================
  // CRUD Operations
  // ============================================================

  describe("CRUD operations", () => {
    const validParams: AddEntryParams = {
      title: "Handle port conflicts",
      content: "Always handle EADDRINUSE when starting HTTP servers",
      category: "failure_pattern",
      tags: ["nodejs", "http", "error-handling"],
      applicable_file_patterns: ["*.ts", "*server*"],
      confidence: "high",
      source_project: "test-project",
      source_work_item: "WI-001",
      anti_conditions: ["PM2 managed processes"],
      applicability: "Node.js HTTP servers",
      normalized_key: "failure_pattern:handle-port-conflict",
    }

    it("addEntry creates entry with candidate status", async () => {
      const result = await addEntry(validParams)
      expect(result.success).toBe(true)
      expect(result.entry_id).toMatch(/^KE-/)

      const entry = await getEntry(result.entry_id!)
      expect(entry).not.toBeNull()
      expect(entry!.status).toBe("candidate")
      expect(entry!.version).toBe(1)
      expect(entry!.usage_count).toBe(0)
      expect(entry!.helpful_count).toBe(0)
    })

    it("addEntry validates title length", async () => {
      const result = await addEntry({ ...validParams, title: "x".repeat(101) })
      expect(result.success).toBe(false)
      expect(result.error).toContain("title")
    })

    it("addEntry validates content length", async () => {
      const result = await addEntry({ ...validParams, content: "x".repeat(2001) })
      expect(result.success).toBe(false)
      expect(result.error).toContain("content")
    })

    it("addEntry validates category required", async () => {
      const result = await addEntry({ ...validParams, category: "" })
      expect(result.success).toBe(false)
      expect(result.error).toContain("category")
    })

    it("updateEntry updates fields and increments version", async () => {
      const { entry_id } = await addEntry(validParams)
      const result = await updateEntry({
        entry_id: entry_id!,
        title: "Updated title",
        confidence: "medium",
      })
      expect(result.success).toBe(true)

      const entry = await getEntry(entry_id!)
      expect(entry!.title).toBe("Updated title")
      expect(entry!.confidence).toBe("medium")
      expect(entry!.version).toBe(2)
    })

    it("updateEntry returns error for non-existent entry", async () => {
      const result = await updateEntry({ entry_id: "KE-nonexistent-000" })
      expect(result.success).toBe(false)
      expect(result.error).toContain("not found")
    })

    it("removeEntry marks as archived", async () => {
      const { entry_id } = await addEntry(validParams)
      await removeEntry(entry_id!)

      const entry = await getEntry(entry_id!)
      expect(entry!.status).toBe("archived")
    })

    it("listEntries filters by category", async () => {
      await addEntry(validParams)
      await addEntry({ ...validParams, category: "checklist" })

      const results = await listEntries({ category: "failure_pattern" })
      expect(results).toHaveLength(1)
      expect(results[0].category).toBe("failure_pattern")
    })

    it("listEntries filters by status", async () => {
      const { entry_id } = await addEntry(validParams)
      await addEntry(validParams)
      await updateEntry({ entry_id: entry_id!, status: "active" })

      const active = await listEntries({ status: "active" })
      expect(active).toHaveLength(1)

      const candidates = await listEntries({ status: "candidate" })
      expect(candidates).toHaveLength(1)
    })

    it("listEntries filters by tags", async () => {
      await addEntry(validParams)
      await addEntry({ ...validParams, tags: ["python", "flask"] })

      const results = await listEntries({ tags: ["nodejs"] })
      expect(results).toHaveLength(1)
    })
  })

  // ============================================================
  // Search & Relevance Score
  // ============================================================

  describe("search and relevance score", () => {
    const entry: KnowledgeEntry = {
      id: "KE-test-001",
      title: "Handle port conflicts in Node.js servers",
      content: "Always handle EADDRINUSE error when starting HTTP servers",
      category: "failure_pattern",
      tags: ["nodejs", "http", "error-handling"],
      applicable_file_patterns: ["*.ts", "*server*"],
      confidence: "high",
      status: "active",
      source_project: "test",
      source_work_item: "WI-001",
      usage_count: 5,
      helpful_count: 3,
      rejected_count: 0,
      last_used_at: new Date().toISOString(),
      anti_conditions: [],
      applicability: "Node.js HTTP servers",
      verification_status: "verified",
      normalized_key: "failure_pattern:handle-port-conflict",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    }

    it("calculateRelevanceScore returns score with reasons", () => {
      const { score, reasons } = calculateRelevanceScore(
        entry,
        ["nodejs", "server", "error"],
        ["*.ts"],
        "failure_pattern"
      )
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(100)
      expect(reasons.length).toBeGreaterThan(0)
    })

    it("calculateRelevanceScore gives higher score for more keyword matches", () => {
      const { score: score1 } = calculateRelevanceScore(entry, ["randomword"], [], undefined)
      const { score: score2 } = calculateRelevanceScore(entry, ["nodejs", "http", "server"], [], undefined)
      expect(score2).toBeGreaterThan(score1)
    })

    it("calculateRelevanceScore gives bonus for category match", () => {
      const { score: withCategory } = calculateRelevanceScore(entry, ["nodejs"], [], "failure_pattern")
      const { score: withoutCategory } = calculateRelevanceScore(entry, ["nodejs"], [], undefined)
      expect(withCategory).toBeGreaterThan(withoutCategory)
    })

    it("searchEntries returns results sorted by relevance", async () => {
      await addEntry({
        title: "Handle port conflicts",
        content: "EADDRINUSE error handling for Node.js",
        category: "failure_pattern",
        tags: ["nodejs", "http"],
        applicable_file_patterns: ["*.ts"],
        confidence: "high",
        source_project: "test",
        source_work_item: "WI-001",
        anti_conditions: [],
        applicability: "Node.js",
        normalized_key: "failure_pattern:port-conflict",
      })
      await addEntry({
        title: "Python virtual env setup",
        content: "Always use venv for Python projects",
        category: "stack_experience",
        tags: ["python", "venv"],
        applicable_file_patterns: ["*.py"],
        confidence: "medium",
        source_project: "test",
        source_work_item: "WI-002",
        anti_conditions: [],
        applicability: "Python projects",
        normalized_key: "stack_experience:python-venv",
      })

      const results = await searchEntries({ keywords: ["nodejs", "port"] })
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].entry.title).toContain("port")
    })
  })

  // ============================================================
  // Deduplication
  // ============================================================

  describe("deduplication", () => {
    it("checkDuplicate detects normalized_key match", async () => {
      await addEntry({
        title: "Test entry",
        content: "Content",
        category: "failure_pattern",
        tags: ["test"],
        applicable_file_patterns: ["*.ts"],
        confidence: "high",
        source_project: "test",
        source_work_item: "WI-001",
        anti_conditions: [],
        applicability: "",
        normalized_key: "failure_pattern:handle-port-conflict",
      })

      const result = await checkDuplicate("failure_pattern:handle-port-conflict", ["*.ts"], ["test"])
      expect(result.isDuplicate).toBe(true)
      expect(result.existingEntryId).toBeTruthy()
    })

    it("checkDuplicate detects scope overlap", async () => {
      await addEntry({
        title: "Test entry",
        content: "Content",
        category: "failure_pattern",
        tags: ["nodejs", "http", "server"],
        applicable_file_patterns: ["*.ts", "*.js"],
        confidence: "high",
        source_project: "test",
        source_work_item: "WI-001",
        anti_conditions: [],
        applicability: "",
        normalized_key: "failure_pattern:original-key",
      })

      // Different normalized_key but overlapping scope
      const result = await checkDuplicate(
        "failure_pattern:different-key",
        ["*.ts", "*.js"],  // 100% overlap
        ["nodejs", "http"]  // 2 tag overlap
      )
      expect(result.isDuplicate).toBe(true)
    })

    it("checkDuplicate returns false for no match", async () => {
      await addEntry({
        title: "Test entry",
        content: "Content",
        category: "failure_pattern",
        tags: ["python"],
        applicable_file_patterns: ["*.py"],
        confidence: "high",
        source_project: "test",
        source_work_item: "WI-001",
        anti_conditions: [],
        applicability: "",
        normalized_key: "failure_pattern:python-thing",
      })

      const result = await checkDuplicate("failure_pattern:nodejs-thing", ["*.ts"], ["nodejs"])
      expect(result.isDuplicate).toBe(false)
    })

    it("checkDuplicate ignores archived entries", async () => {
      const { entry_id } = await addEntry({
        title: "Archived entry",
        content: "Content",
        category: "failure_pattern",
        tags: ["test"],
        applicable_file_patterns: ["*.ts"],
        confidence: "high",
        source_project: "test",
        source_work_item: "WI-001",
        anti_conditions: [],
        applicability: "",
        normalized_key: "failure_pattern:archived-key",
      })
      await removeEntry(entry_id!)

      const result = await checkDuplicate("failure_pattern:archived-key", ["*.ts"], ["test"])
      expect(result.isDuplicate).toBe(false)
    })
  })

  // ============================================================
  // Feedback
  // ============================================================

  describe("feedback", () => {
    it("recordFeedback increments helpful_count", async () => {
      const { entry_id } = await addEntry({
        title: "Test",
        content: "Content",
        category: "checklist",
        tags: [],
        applicable_file_patterns: [],
        confidence: "medium",
        source_project: "test",
        source_work_item: "WI-001",
        anti_conditions: [],
        applicability: "",
        normalized_key: "",
      })

      await recordFeedback({ entry_id: entry_id!, outcome: "helpful" })
      const entry = await getEntry(entry_id!)
      expect(entry!.helpful_count).toBe(1)
    })

    it("recordFeedback increments rejected_count", async () => {
      const { entry_id } = await addEntry({
        title: "Test",
        content: "Content",
        category: "checklist",
        tags: [],
        applicable_file_patterns: [],
        confidence: "medium",
        source_project: "test",
        source_work_item: "WI-001",
        anti_conditions: [],
        applicability: "",
        normalized_key: "",
      })

      await recordFeedback({ entry_id: entry_id!, outcome: "rejected" })
      const entry = await getEntry(entry_id!)
      expect(entry!.rejected_count).toBe(1)
    })

    it("recordFeedback auto-archives when rejected >= 5 and helpful = 0", async () => {
      const { entry_id } = await addEntry({
        title: "Bad knowledge",
        content: "Content",
        category: "checklist",
        tags: [],
        applicable_file_patterns: [],
        confidence: "low",
        source_project: "test",
        source_work_item: "WI-001",
        anti_conditions: [],
        applicability: "",
        normalized_key: "",
      })

      for (let i = 0; i < 5; i++) {
        await recordFeedback({ entry_id: entry_id!, outcome: "rejected" })
      }

      const entry = await getEntry(entry_id!)
      expect(entry!.rejected_count).toBe(5)
      expect(entry!.status).toBe("archived")
    })
  })

  // ============================================================
  // Quality Management
  // ============================================================

  describe("quality management", () => {
    it("qualityCheck identifies stale entries", async () => {
      const { entry_id } = await addEntry({
        title: "Old entry",
        content: "Content",
        category: "checklist",
        tags: [],
        applicable_file_patterns: [],
        confidence: "medium",
        source_project: "test",
        source_work_item: "WI-001",
        anti_conditions: [],
        applicability: "",
        normalized_key: "",
      })
      // Make it active with old last_used_at
      await updateEntry({
        entry_id: entry_id!,
        status: "active",
      })
      // Manually set last_used_at to 100 days ago
      const store = await loadStore()
      const entry = store.entries.find((e) => e.id === entry_id)!
      entry.last_used_at = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
      entry.usage_count = 1
      await saveStore(store)

      const report = await qualityCheck()
      expect(report.stale.length).toBeGreaterThanOrEqual(1)
    })

    it("cleanup archives stale entries", async () => {
      const { entry_id } = await addEntry({
        title: "Stale entry",
        content: "Content",
        category: "checklist",
        tags: [],
        applicable_file_patterns: [],
        confidence: "medium",
        source_project: "test",
        source_work_item: "WI-001",
        anti_conditions: [],
        applicability: "",
        normalized_key: "",
      })
      await updateEntry({ entry_id: entry_id!, status: "active" })
      const store = await loadStore()
      const entry = store.entries.find((e) => e.id === entry_id)!
      entry.last_used_at = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
      entry.usage_count = 1
      await saveStore(store)

      const result = await cleanup()
      expect(result.archived_count).toBeGreaterThanOrEqual(1)

      const cleaned = await getEntry(entry_id!)
      expect(cleaned!.status).toBe("archived")
    })

    it("addCategory adds new category", async () => {
      const result = await addCategory("custom_type", "自定义类型", "用户自定义的知识类别")
      expect(result.success).toBe(true)

      const store = await loadStore()
      expect(store.categories.some((c) => c.id === "custom_type")).toBe(true)
    })

    it("addCategory rejects duplicate", async () => {
      const result = await addCategory("failure_pattern", "重复", "已存在")
      expect(result.success).toBe(false)
      expect(result.error).toContain("already exists")
    })
  })
})
