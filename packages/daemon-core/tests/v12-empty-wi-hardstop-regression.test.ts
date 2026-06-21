import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pluginPath = resolve(__dirname, "../../../setup/userlevel-opencode/plugins/sf_specforge.ts");

describe("v1.2 empty work_item_id hard_stop regression", () => {
  it("does not persist project-level hard_stop for invalid or empty work_item_id", () => {
    const source = readFileSync(pluginPath, "utf-8");

    expect(source).toContain("NON_PERSISTENT_INVALID_WORK_ITEM_ID");
    expect(source).toContain("Invalid/retryable work_item_id must not persist project-level hard_stop");
    expect(source).not.toContain("persistProjectLevelHardStop");
    expect(source).not.toContain("hard_stops.jsonl");
    expect(source).not.toContain("Persisted project-level hard_stop for invalid/retryable work_item_id");
  });
});
