import { describe, it, expect } from "vitest"
import {
  parseVersion,
  compareVersions,
  satisfiesRange,
  validateSemverRangeFormat,
} from "../../../scripts/lib/semver"

describe("semver module", () => {
  describe("parseVersion", () => {
    it("should parse standard semver", () => {
      expect(parseVersion("3.4.0")).toEqual([3, 4, 0])
    })

    it("should parse version with leading operators", () => {
      expect(parseVersion(">=3.4.0")).toEqual([3, 4, 0])
      expect(parseVersion("<4.0.0")).toEqual([4, 0, 0])
    })

    it("should handle missing parts as 0", () => {
      expect(parseVersion("3")).toEqual([3, 0, 0])
      expect(parseVersion("3.4")).toEqual([3, 4, 0])
    })
  })

  describe("compareVersions", () => {
    it("should return 0 for equal versions", () => {
      expect(compareVersions([3, 4, 0], [3, 4, 0])).toBe(0)
    })

    it("should return -1 when a < b (major)", () => {
      expect(compareVersions([2, 0, 0], [3, 0, 0])).toBe(-1)
    })

    it("should return 1 when a > b (major)", () => {
      expect(compareVersions([4, 0, 0], [3, 0, 0])).toBe(1)
    })

    it("should compare minor versions", () => {
      expect(compareVersions([3, 3, 0], [3, 4, 0])).toBe(-1)
      expect(compareVersions([3, 5, 0], [3, 4, 0])).toBe(1)
    })

    it("should compare patch versions", () => {
      expect(compareVersions([3, 4, 0], [3, 4, 1])).toBe(-1)
      expect(compareVersions([3, 4, 2], [3, 4, 1])).toBe(1)
    })
  })

  describe("satisfiesRange", () => {
    it("should satisfy >=3.4.0 <4.0.0 for version 3.4.0", () => {
      expect(satisfiesRange("3.4.0", ">=3.4.0 <4.0.0")).toBe(true)
    })

    it("should satisfy >=3.4.0 <4.0.0 for version 3.5.1", () => {
      expect(satisfiesRange("3.5.1", ">=3.4.0 <4.0.0")).toBe(true)
    })

    it("should not satisfy >=3.4.0 <4.0.0 for version 3.3.9", () => {
      expect(satisfiesRange("3.3.9", ">=3.4.0 <4.0.0")).toBe(false)
    })

    it("should not satisfy >=3.4.0 <4.0.0 for version 4.0.0", () => {
      expect(satisfiesRange("4.0.0", ">=3.4.0 <4.0.0")).toBe(false)
    })

    it("should not satisfy >=3.4.0 <4.0.0 for version 4.1.0", () => {
      expect(satisfiesRange("4.1.0", ">=3.4.0 <4.0.0")).toBe(false)
    })

    it("should satisfy boundary: version equals lower bound", () => {
      expect(satisfiesRange("1.0.0", ">=1.0.0 <2.0.0")).toBe(true)
    })

    it("should not satisfy boundary: version equals upper bound", () => {
      expect(satisfiesRange("2.0.0", ">=1.0.0 <2.0.0")).toBe(false)
    })

    it("should return true for unsupported range formats (caret)", () => {
      expect(satisfiesRange("3.4.0", "^3.4.0")).toBe(true)
    })

    it("should return true for unsupported range formats (tilde)", () => {
      expect(satisfiesRange("3.4.0", "~3.4.0")).toBe(true)
    })

    it("should return true for unsupported range formats (x-range)", () => {
      expect(satisfiesRange("3.4.0", "3.x")).toBe(true)
    })

    it("should return true for unsupported range formats (OR)", () => {
      expect(satisfiesRange("3.4.0", ">=3.0.0 || <2.0.0")).toBe(true)
    })
  })

  describe("validateSemverRangeFormat", () => {
    it("should accept valid >=x.y.z <a.b.c format", () => {
      expect(validateSemverRangeFormat(">=3.4.0 <4.0.0")).toBe(true)
    })

    it("should accept valid format with different versions", () => {
      expect(validateSemverRangeFormat(">=1.0.0 <2.0.0")).toBe(true)
      expect(validateSemverRangeFormat(">=0.1.0 <1.0.0")).toBe(true)
    })

    it("should accept format with extra whitespace (trimmed)", () => {
      expect(validateSemverRangeFormat("  >=3.4.0 <4.0.0  ")).toBe(true)
    })

    it("should reject caret ranges", () => {
      expect(validateSemverRangeFormat("^3.4.0")).toBe(false)
    })

    it("should reject tilde ranges", () => {
      expect(validateSemverRangeFormat("~3.4.0")).toBe(false)
    })

    it("should reject single version", () => {
      expect(validateSemverRangeFormat("3.4.0")).toBe(false)
    })

    it("should reject x-range", () => {
      expect(validateSemverRangeFormat("3.x")).toBe(false)
    })

    it("should reject OR ranges", () => {
      expect(validateSemverRangeFormat(">=3.0.0 || <2.0.0")).toBe(false)
    })

    it("should reject missing lower bound", () => {
      expect(validateSemverRangeFormat("<4.0.0")).toBe(false)
    })

    it("should reject missing upper bound", () => {
      expect(validateSemverRangeFormat(">=3.4.0")).toBe(false)
    })

    it("should reject <= in upper bound", () => {
      expect(validateSemverRangeFormat(">=3.4.0 <=4.0.0")).toBe(false)
    })
  })
})
