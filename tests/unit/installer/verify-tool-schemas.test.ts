import { describe, it, expect } from "vitest"
import { lintToolSchemaSource } from "../../../scripts/lib/verify-tool-schemas"

describe("lintToolSchemaSource — Zod v4 record arity guardrail", () => {
  it("flags single-arg .record()", () => {
    const src = `
      export default tool({
        args: {
          entry: tool.schema.record(tool.schema.any()).describe("x"),
        },
      })
    `
    const issues = lintToolSchemaSource("tools/sf_bad.ts", src)
    expect(issues).toHaveLength(1)
    expect(issues[0].code).toBe("ZOD_RECORD_SINGLE_ARG")
    expect(issues[0].line).toBe(4)
  })

  it("accepts two-arg .record()", () => {
    const src = `
      args: {
        entry: tool.schema.record(tool.schema.string(), tool.schema.any()),
        env: tool.schema.record(tool.schema.string(), tool.schema.string()),
      }
    `
    expect(lintToolSchemaSource("tools/sf_ok.ts", src)).toHaveLength(0)
  })

  it("does not miscount when the value schema itself contains parens/commas", () => {
    const src = `x.record(tool.schema.string(), tool.schema.array(tool.schema.enum(["a","b"])))`
    expect(lintToolSchemaSource("tools/sf_ok2.ts", src)).toHaveLength(0)
  })

  it("flags single-arg record even when the arg is a nested call with commas inside", () => {
    const src = `x.record(tool.schema.enum(["a", "b", "c"]))`
    const issues = lintToolSchemaSource("tools/sf_bad2.ts", src)
    expect(issues).toHaveLength(1)
    expect(issues[0].code).toBe("ZOD_RECORD_SINGLE_ARG")
  })

  it("ignores unrelated .record substrings when balanced", () => {
    const src = `const y = obj.record // property access, no call\n`
    expect(lintToolSchemaSource("tools/sf_x.ts", src)).toHaveLength(0)
  })
})
