/**
 * Independent regression coverage for authoritative Project Spec version
 * binding in the sf_state_transition Work Item creation entry point.
 *
 * This file must remain independently executable. Do not merge these tests
 * into a broad legacy test file or rely on test-name filtering.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { getHandler } from "../../src/tools/ToolDispatcher";
import "../../src/tools/handlers/sf-state-transition";

async function writeProjectManifests(
  projectRoot: string,
  projectSpecVersion: string,
): Promise<void> {
  const specforgeDir = path.join(projectRoot, ".specforge");
  const projectDir = path.join(specforgeDir, "project");
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(
    path.join(specforgeDir, "manifest.json"),
    "{}\n",
    "utf-8",
  );
  await fs.writeFile(
    path.join(projectDir, "spec_manifest.json"),
    JSON.stringify(
      {
        schema_version: "1.0",
        project_spec_version: projectSpecVersion,
        modules: [],
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );
}

async function writeRootManifestOnly(projectRoot: string): Promise<void> {
  const specforgeDir = path.join(projectRoot, ".specforge");
  await fs.mkdir(specforgeDir, { recursive: true });
  await fs.writeFile(
    path.join(specforgeDir, "manifest.json"),
    "{}\n",
    "utf-8",
  );
}

function makeStateManagerDeps() {
  const transition = vi.fn().mockResolvedValue(undefined);
  const getProjectStateManager = vi.fn().mockResolvedValue({ transition });
  return {
    deps: {
      projectManager: { getProjectStateManager },
    },
    transition,
  };
}

describe("sf_state_transition - authoritative Project Spec version binding", () => {
  let projectRoot: string;
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    handler = getHandler("sf_state_transition")!;
    expect(handler).toBeDefined();
  });

  beforeEach(async () => {
    projectRoot = path.join(
      os.tmpdir(),
      `sf-state-transition-psv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(projectRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it("writes candidate_manifest.base_spec_version from authoritative PSV-0002", async () => {
    await writeProjectManifests(projectRoot, "PSV-0002");
    const { deps, transition } = makeStateManagerDeps();

    const result = await handler(
      {
        work_item_id: "WI-0003",
        from_state: "",
        to_state: "created",
        workflow_type: "feature_spec",
      },
      { directory: projectRoot },
      deps,
    );

    expect(result.success).toBe(true);
    expect(transition).toHaveBeenCalledTimes(1);

    const candidateManifest = JSON.parse(
      await fs.readFile(
        path.join(
          projectRoot,
          ".specforge",
          "work-items",
          "WI-0003",
          "candidate_manifest.json",
        ),
        "utf-8",
      ),
    );
    expect(candidateManifest.base_spec_version).toBe("PSV-0002");
  });

  it("hard-stops before creating a WI directory when spec authority is unavailable", async () => {
    await writeRootManifestOnly(projectRoot);
    const { deps, transition } = makeStateManagerDeps();

    const result = await handler(
      {
        work_item_id: "WI-0004",
        from_state: "",
        to_state: "created",
        workflow_type: "feature_spec",
      },
      { directory: projectRoot },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("PROJECT_SPEC_VERSION_UNAVAILABLE");
    expect(result.hard_stop).toBe(true);
    expect(transition).not.toHaveBeenCalled();
    await expect(
      fs.access(
        path.join(projectRoot, ".specforge", "work-items", "WI-0004"),
      ),
    ).rejects.toBeTruthy();
  });
});
