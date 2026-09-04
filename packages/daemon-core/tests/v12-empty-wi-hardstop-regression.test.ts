import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pluginPath = resolve(__dirname, "../../../setup/userlevel-opencode/plugins/sf_specforge.ts");

describe("current thin-plugin HardStop ownership boundary", () => {
  it("does not validate Work Item IDs or persist HardStop state", () => {
    const source = readFileSync(pluginPath, "utf-8");

    expect(source).toContain("Business state, WriteGuard decisions and filesystem tools remain Daemon-owned.");
    expect(source).not.toContain("NON_PERSISTENT_INVALID_WORK_ITEM_ID");
    expect(source).not.toContain("persistProjectLevelHardStop");
    expect(source).not.toContain("hard_stops.jsonl");
    expect(source).not.toContain("maybePersistHardStopFromGuardResult");
  });
});
