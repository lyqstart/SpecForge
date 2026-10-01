import { describe, expect, it } from "vitest";
import { SchemaVersionManager } from "../../src/distribution/schema-version-manager";

describe("SchemaVersionManager publish contract", () => {
  it("parses MAJOR.MINOR versions", () => {
    const manager = new SchemaVersionManager();
    expect(manager.parseTuple("1.0")).toEqual([1, 0]);
    expect(manager.parseTuple("1.10")).toEqual([1, 10]);
    expect(manager.parseTuple("10.25")).toEqual([10, 25]);
  });

  it("rejects malformed versions", () => {
    const manager = new SchemaVersionManager();
    expect(() => manager.parseTuple("")).toThrow(/empty string/i);
    expect(() => manager.parseTuple("1")).toThrow(/exactly one dot/i);
    expect(() => manager.parseTuple("a.b")).toThrow(/must be integers/i);
    expect(() => manager.parseTuple("1.0a")).toThrow(/non-numeric/i);
  });

  it("allows first, equal, and ascending publish baselines", () => {
    const manager = new SchemaVersionManager();
    expect(manager.assertMonotonic("1.0", null).isValid).toBe(true);
    expect(manager.assertMonotonic("1.0", "1.0").isValid).toBe(true);
    expect(manager.assertMonotonic("1.1", "1.0").isValid).toBe(true);
    expect(manager.assertMonotonic("2.0", "1.10").isValid).toBe(true);
  });

  it("rejects descending publish baselines", () => {
    const result = new SchemaVersionManager().assertMonotonic("1.0", "1.1");
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "PUBLISH_BASELINE_DOWNGRADE",
        field: "schema_version",
      }),
    ]);
  });

  it("reports invalid publish baselines as validation errors", () => {
    const result = new SchemaVersionManager().assertMonotonic("invalid", "1.0");
    expect(result.isValid).toBe(false);
    expect(result.errors[0]?.code).toBe("PUBLISH_VALIDATION");
  });

  it("exposes the default and injected build baselines", () => {
    expect(new SchemaVersionManager().baseline).toBe("1.0");
    expect(new SchemaVersionManager("2.5").baseline).toBe("2.5");
  });
});
