/**
 * Performance benchmark tests for EARS validation
 *
 * Verifies that EARS validation completes within acceptable time limits
 * for documents of various sizes, and doesn't crash or hang on pathological input.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { describe, it, expect } from "vitest"
import { checkEarsCompliance } from "../../../.opencode/tools/lib/sf_ears_parser.ts"
import { FILE_SIZE_LIMIT } from "../../../.opencode/tools/lib/sf_ears_types.ts"

/**
 * Build a requirements.md document with the given number of ACs.
 * Each AC uses valid EARS Event-driven format.
 *
 * @param acCount - Number of acceptance criteria to generate
 * @param targetSizeBytes - Optional target size in bytes (pads AC text to reach target)
 */
function buildDocument(acCount: number, targetSizeBytes?: number): string {
  const header = `---
requirements_format: ears
---

### Requirement 1: Performance Test

#### Acceptance Criteria

`

  // Calculate per-AC size to reach target
  const headerSize = Buffer.byteLength(header, "utf-8")
  let padLength = 350 // default ~400 chars per AC line

  if (targetSizeBytes) {
    // Each AC line: "N. [Event-driven] WHEN <pad>, THE system SHALL <pad>.\n"
    // Estimate overhead per line (number, prefix, keywords, punctuation) ~80 chars
    const availableForPad = targetSizeBytes - headerSize
    const perAcAvailable = Math.floor(availableForPad / acCount)
    // Split padding between WHEN clause and SHALL clause
    padLength = Math.max(50, Math.floor((perAcAvailable - 80) / 2))
  }

  const lines: string[] = [header]

  for (let i = 1; i <= acCount; i++) {
    const whenText = "user performs action ".padEnd(padLength, "x")
    const shallText = "process the request ".padEnd(padLength, "y")
    lines.push(`${i}. [Event-driven] WHEN ${whenText}, THE system SHALL ${shallText}.`)
  }

  return lines.join("\n")
}

/**
 * Build a pathological document with deeply nested code blocks, many headings, etc.
 */
function buildPathologicalDocument(acCount: number): string {
  const parts: string[] = [
    `---\nrequirements_format: ears\n---\n`,
  ]

  // Add many headings and code blocks interspersed with AC sections
  for (let section = 1; section <= 10; section++) {
    parts.push(`\n### Requirement ${section}: Section ${section}\n`)
    parts.push(`\nSome description with \`inline code\` and **bold** text.\n`)

    // Add a fenced code block (should be ignored by parser)
    parts.push("\n```typescript\n")
    for (let j = 0; j < 20; j++) {
      parts.push(`// ${j}. [Event-driven] WHEN fake, THE system SHALL not parse this.\n`)
    }
    parts.push("```\n")

    // Add actual AC section
    parts.push(`\n#### Acceptance Criteria\n\n`)
    const acsPerSection = Math.ceil(acCount / 10)
    for (let i = 1; i <= acsPerSection; i++) {
      const padding = "a]b[c".repeat(10) // special chars that could trip up naive parsers
      parts.push(`${i}. [Event-driven] WHEN ${padding} event occurs, THE system SHALL handle ${padding} safely.\n`)
    }
  }

  return parts.join("")
}

describe("EARS Performance Benchmarks", { timeout: 10000 }, () => {
  it("200KB document with 500 ACs completes within 1 second", () => {
    // Build a ~200KB document with 500 ACs
    const targetSize = 200 * 1024 // 200KB
    const content = buildDocument(500, targetSize)

    // Verify document is approximately the target size
    const actualSize = Buffer.byteLength(content, "utf-8")
    expect(actualSize).toBeGreaterThan(150 * 1024) // at least 150KB
    expect(actualSize).toBeLessThan(300 * 1024) // no more than 300KB

    // Measure execution time
    const start = performance.now()
    const result = checkEarsCompliance(content)
    const elapsed = performance.now() - start

    // Assert completes within 1 second
    expect(elapsed).toBeLessThan(1000)

    // Assert correct AC count
    expect(result.details.total_acs).toBe(500)
  })

  it("Large document (>200KB, <=1MB) with >500 ACs completes within 5 seconds", () => {
    // Build a document with 800 ACs to exceed 200KB but stay under 1MB
    const targetSize = 500 * 1024 // 500KB target
    const content = buildDocument(800, targetSize)

    // Verify document size is in range
    const actualSize = Buffer.byteLength(content, "utf-8")
    expect(actualSize).toBeGreaterThan(200 * 1024)
    expect(actualSize).toBeLessThan(FILE_SIZE_LIMIT)

    // Measure execution time
    const start = performance.now()
    const result = checkEarsCompliance(content)
    const elapsed = performance.now() - start

    // Assert completes within 5 seconds
    expect(elapsed).toBeLessThan(5000)

    // Assert it returns a valid result (doesn't crash or hang)
    expect(result).toBeDefined()
    expect(result.details).toBeDefined()
    expect(result.details.total_acs).toBe(800)
    expect(result.details.mode).toBe("strict")
  })

  it("Document at exactly 1MB limit still processes", () => {
    // Build a document close to 1MB (but not exceeding FILE_SIZE_LIMIT)
    // Use enough ACs to approach 1MB
    const targetSize = FILE_SIZE_LIMIT - 1024 // just under 1MB
    const acCount = 1500
    const content = buildDocument(acCount, targetSize)

    // Verify document size is close to 1MB
    const actualSize = Buffer.byteLength(content, "utf-8")
    expect(actualSize).toBeGreaterThan(500 * 1024) // at least 500KB
    expect(actualSize).toBeLessThanOrEqual(FILE_SIZE_LIMIT)

    // Measure execution time
    const start = performance.now()
    const result = checkEarsCompliance(content)
    const elapsed = performance.now() - start

    // Assert it returns a result without crashing
    expect(result).toBeDefined()
    expect(result.details).toBeDefined()
    expect(result.details.total_acs).toBe(acCount)
    // Allow up to 10 seconds for near-limit documents
    expect(elapsed).toBeLessThan(10000)
  })

  it("Parser doesn't hang on pathological input", () => {
    // Build a document with deeply nested code blocks, many headings,
    // and special characters that could trip up regex engines
    const content = buildPathologicalDocument(200)

    // Measure execution time
    const start = performance.now()
    const result = checkEarsCompliance(content)
    const elapsed = performance.now() - start

    // Assert it completes within 5 seconds
    expect(elapsed).toBeLessThan(5000)

    // Assert it returns a valid result
    expect(result).toBeDefined()
    expect(result.details).toBeDefined()
    expect(result.details.total_acs).toBeGreaterThan(0)
  })
})
