/**
 * Unit tests for sf_markdown_verification_parser.ts
 * Tests: parseTaskVerification, parseTypedCommandBlock, extractFieldSection, parseStringList
 *
 * Requirements: REQ-9 AC-2, REQ-9 AC-5
 */

import { describe, it, expect } from "vitest"
import {
  parseTaskVerification,
  parseTypedCommandBlock,
  extractFieldSection,
  parseStringList,
} from "../../../../.opencode/tools/lib/sf_markdown_verification_parser"

describe("sf_markdown_verification_parser", () => {
  // ============================================================
  // parseTaskVerification — 格式检测
  // ============================================================

  describe("parseTaskVerification", () => {
    describe("format detection", () => {
      it("typed format with dash prefix: `- unit:` → format typed", () => {
        const content = `
- **verification_commands**:
  - unit: \`bun test tests/unit/foo.test.ts\`
  - property: \`bun test tests/property/foo.property.test.ts\`
`
        const result = parseTaskVerification(content)
        expect(result.format).toBe("typed")
        expect(result.typedCommands).toBeDefined()
        expect(result.typedCommands!.unit).toBe("bun test tests/unit/foo.test.ts")
        expect(result.typedCommands!.property).toBe("bun test tests/property/foo.property.test.ts")
      })

      it("typed format without dash: `unit:` → format typed", () => {
        const content = `
- **verification_commands**:
  unit: \`bun test tests/unit/foo.test.ts\`
`
        const result = parseTaskVerification(content)
        expect(result.format).toBe("typed")
        expect(result.typedCommands).toBeDefined()
        expect(result.typedCommands!.unit).toBe("bun test tests/unit/foo.test.ts")
      })

      it("legacy format: backtick lines only → format legacy", () => {
        const content = `
- **verification_commands**:
  - \`bun test tests/unit/foo.test.ts\`
  - \`bun test tests/integration/bar.test.ts\`
`
        const result = parseTaskVerification(content)
        expect(result.format).toBe("legacy")
        expect(result.legacyCommands).toHaveLength(2)
        expect(result.legacyCommands![0]).toBe("bun test tests/unit/foo.test.ts")
        expect(result.legacyCommands![1]).toBe("bun test tests/integration/bar.test.ts")
      })

      it("empty format: no verification_commands field → format empty", () => {
        const content = `
- **some_other_field**: value
`
        const result = parseTaskVerification(content)
        expect(result.format).toBe("empty")
      })
    })

    describe("multi-line commands", () => {
      it("type key followed by indented command list", () => {
        const content = `
- **verification_commands**:
  - unit:
    - \`bun test tests/unit/a.test.ts\`
    - \`bun test tests/unit/b.test.ts\`
`
        const result = parseTaskVerification(content)
        expect(result.format).toBe("typed")
        expect(result.typedCommands!.unit).toEqual([
          "bun test tests/unit/a.test.ts",
          "bun test tests/unit/b.test.ts",
        ])
      })
    })

    describe("invalid typed keys", () => {
      it("smoke: → recorded in invalidTypedKeys, format still typed", () => {
        const content = `
- **verification_commands**:
  - smoke: \`bun test tests/smoke/foo.test.ts\`
  - unit: \`bun test tests/unit/foo.test.ts\`
`
        const result = parseTaskVerification(content)
        expect(result.format).toBe("typed")
        expect(result.invalidTypedKeys).toContain("smoke")
        expect(result.typedCommands!.unit).toBe("bun test tests/unit/foo.test.ts")
        // smoke commands should NOT be in typedCommands
        expect(result.typedCommands!).not.toHaveProperty("smoke")
      })
    })

    describe("manual_verification_checks coexistence", () => {
      it("manual_verification_checks alongside verification_commands", () => {
        const content = `
- **verification_commands**:
  - unit: \`bun test tests/unit/foo.test.ts\`
- **manual_verification_checks**:
  - \`确认 src/parser.ts 文件已创建\`
`
        const result = parseTaskVerification(content)
        expect(result.format).toBe("typed")
        expect(result.typedCommands!.unit).toBe("bun test tests/unit/foo.test.ts")
        expect(result.manualChecks).toHaveLength(1)
        expect(result.manualChecks![0]).toBe("确认 src/parser.ts 文件已创建")
      })
    })

    describe("refs field extraction", () => {
      it("parses [REQ-1, REQ-3, CP-2] refs", () => {
        const content = `
- **verification_commands**:
  - unit: \`bun test tests/unit/foo.test.ts\`
- **refs**: [REQ-1, REQ-3, CP-2]
`
        const result = parseTaskVerification(content)
        expect(result.refs).toEqual(["REQ-1", "REQ-3", "CP-2"])
      })

      it("parses refs with extra whitespace", () => {
        const content = `
- **refs**: [ REQ-1 ,  REQ-5 ]
- **verification_commands**:
  - unit: \`bun test tests/unit/foo.test.ts\`
`
        const result = parseTaskVerification(content)
        expect(result.refs).toEqual(["REQ-1", "REQ-5"])
      })

      it("no refs field → refs undefined", () => {
        const content = `
- **verification_commands**:
  - unit: \`bun test tests/unit/foo.test.ts\`
`
        const result = parseTaskVerification(content)
        expect(result.refs).toBeUndefined()
      })
    })
  })

  // ============================================================
  // parseTypedCommandBlock
  // ============================================================

  describe("parseTypedCommandBlock", () => {
    it("parses single inline commands per type", () => {
      const section = `- unit: \`bun test tests/unit/foo.test.ts\`
- property: \`bun test tests/property/foo.property.test.ts\``

      const { commands, invalidKeys } = parseTypedCommandBlock(section)
      expect(commands.unit).toBe("bun test tests/unit/foo.test.ts")
      expect(commands.property).toBe("bun test tests/property/foo.property.test.ts")
      expect(invalidKeys).toHaveLength(0)
    })

    it("parses multi-line commands under a type key", () => {
      const section = `- unit:
  - \`bun test tests/unit/a.test.ts\`
  - \`bun test tests/unit/b.test.ts\``

      const { commands, invalidKeys } = parseTypedCommandBlock(section)
      expect(commands.unit).toEqual([
        "bun test tests/unit/a.test.ts",
        "bun test tests/unit/b.test.ts",
      ])
      expect(invalidKeys).toHaveLength(0)
    })

    it("records invalid keys and excludes them from commands", () => {
      const section = `- smoke: \`bun test tests/smoke/foo.test.ts\`
- unit: \`bun test tests/unit/foo.test.ts\``

      const { commands, invalidKeys } = parseTypedCommandBlock(section)
      expect(invalidKeys).toEqual(["smoke"])
      expect(commands.unit).toBe("bun test tests/unit/foo.test.ts")
      expect(commands).not.toHaveProperty("smoke")
    })

    it("handles mixed inline and multi-line commands", () => {
      const section = `- unit: \`bun test tests/unit/foo.test.ts\`
- integration:
  - \`bun test tests/integration/a.test.ts\`
  - \`bun test tests/integration/b.test.ts\`
- e2e: \`bun test tests/e2e/flow.test.ts\``

      const { commands, invalidKeys } = parseTypedCommandBlock(section)
      expect(commands.unit).toBe("bun test tests/unit/foo.test.ts")
      expect(commands.integration).toEqual([
        "bun test tests/integration/a.test.ts",
        "bun test tests/integration/b.test.ts",
      ])
      expect(commands.e2e).toBe("bun test tests/e2e/flow.test.ts")
      expect(invalidKeys).toHaveLength(0)
    })

    it("handles type keys without dash prefix", () => {
      const section = `unit: \`bun test tests/unit/foo.test.ts\`
property: \`bun test tests/property/bar.test.ts\``

      const { commands, invalidKeys } = parseTypedCommandBlock(section)
      expect(commands.unit).toBe("bun test tests/unit/foo.test.ts")
      expect(commands.property).toBe("bun test tests/property/bar.test.ts")
      expect(invalidKeys).toHaveLength(0)
    })
  })

  // ============================================================
  // extractFieldSection
  // ============================================================

  describe("extractFieldSection", () => {
    it("returns content when field exists with subsequent lines", () => {
      const content = `
- **verification_commands**:
  - unit: \`bun test tests/unit/foo.test.ts\`
  - property: \`bun test tests/property/bar.test.ts\`
`
      const result = extractFieldSection(content, "verification_commands")
      expect(result).not.toBeNull()
      expect(result).toContain("unit:")
      expect(result).toContain("property:")
    })

    it("returns null when field does not exist", () => {
      const content = `
- **some_other_field**: value
`
      const result = extractFieldSection(content, "verification_commands")
      expect(result).toBeNull()
    })

    it("returns inline value when field has inline content only", () => {
      const content = `
- **refs**: [REQ-1, REQ-3]
- **verification_commands**:
  - unit: \`bun test tests/unit/foo.test.ts\`
`
      const result = extractFieldSection(content, "refs")
      expect(result).not.toBeNull()
      expect(result).toContain("REQ-1")
    })

    it("stops at the next field boundary", () => {
      const content = `
- **verification_commands**:
  - unit: \`bun test tests/unit/foo.test.ts\`
- **manual_verification_checks**:
  - \`check something\`
`
      const result = extractFieldSection(content, "verification_commands")
      expect(result).not.toBeNull()
      expect(result).toContain("unit:")
      expect(result).not.toContain("check something")
    })
  })

  // ============================================================
  // parseStringList
  // ============================================================

  describe("parseStringList", () => {
    it("extracts commands from `- \\`command\\`` lines", () => {
      const section = `- \`bun test tests/unit/foo.test.ts\`
- \`bun test tests/integration/bar.test.ts\``

      const result = parseStringList(section)
      expect(result).toEqual([
        "bun test tests/unit/foo.test.ts",
        "bun test tests/integration/bar.test.ts",
      ])
    })

    it("extracts commands from `\\`command\\`` lines (no dash)", () => {
      const section = `\`bun test tests/unit/foo.test.ts\`
\`bun test tests/integration/bar.test.ts\``

      const result = parseStringList(section)
      expect(result).toEqual([
        "bun test tests/unit/foo.test.ts",
        "bun test tests/integration/bar.test.ts",
      ])
    })

    it("skips empty lines", () => {
      const section = `- \`bun test tests/unit/foo.test.ts\`

- \`bun test tests/integration/bar.test.ts\`

`
      const result = parseStringList(section)
      expect(result).toEqual([
        "bun test tests/unit/foo.test.ts",
        "bun test tests/integration/bar.test.ts",
      ])
    })

    it("returns empty array for empty input", () => {
      const result = parseStringList("")
      expect(result).toEqual([])
    })

    it("ignores lines without backtick-wrapped content", () => {
      const section = `- \`valid command\`
- plain text without backticks
- \`another valid command\``

      const result = parseStringList(section)
      expect(result).toEqual(["valid command", "another valid command"])
    })
  })
})
