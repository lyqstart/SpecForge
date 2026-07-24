/**
 * contract-authoring — unit tests.
 *
 * Verifies the contract-registration candidate authoring:
 *  - writes candidates/project/extension_registry.json with the contract added
 *  - registers a valid explicit entry in candidate_manifest.json
 *  - the manifest passes validateCandidateManifestJson
 *  - inferManifestEntries echoes the explicit extension_registry entry verbatim
 *    (so the merge "intake officer" accepts it, no bypass)
 *  - dedup guard rejects an already-registered contract
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { authorContractCandidate } from "../../src/tools/lib/contract-authoring";
import { validateCandidateManifestJson } from "../../src/tools/lib/artifact-schema-validation";
import { inferManifestEntries } from "../../src/tools/lib/governance-invariants-v11";

describe("contract-authoring", () => {
  let projectRoot: string;
  const workItemId = "WI-0001";

  beforeEach(async () => {
    projectRoot = path.join(os.tmpdir(), `sf-ca-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(path.join(projectRoot, ".specforge", "project"), { recursive: true });
    // A minimal current project registry (no contracts block yet — brownfield).
    await fs.writeFile(
      path.join(projectRoot, ".specforge", "project", "extension_registry.json"),
      JSON.stringify({
        schema_version: "1.0",
        project_spec_version: "PSV-0001",
        namespaces: { requirement_types: [], design_types: [], task_types: [], verification_types: [], gate_types: [] },
        updated_by_work_item: null,
        updated_at: null,
      }, null, 2),
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const wiDir = () => path.join(projectRoot, ".specforge", "work-items", workItemId);

  it("authors a candidate registry + valid manifest, and the intake officer echoes the entry", async () => {
    const res = await authorContractCandidate({
      projectRoot,
      workItemId,
      kind: "shared_enum",
      entry: { id: "PhotoStatus", owner_module: "CORE", values: ["pending", "uploaded", "failed"] },
    });

    expect(res.success).toBe(true);
    expect(res.candidate_path).toBe("candidates/project/extension_registry.json");
    expect(res.target_path).toBe(".specforge/project/extension_registry.json");
    expect(res.contract_ref).toContain("PhotoStatus");

    // Candidate registry contains the contract.
    const candidate = JSON.parse(
      await fs.readFile(path.join(wiDir(), "candidates", "project", "extension_registry.json"), "utf-8"),
    );
    expect(candidate.contracts.shared_enums).toHaveLength(1);
    expect(candidate.contracts.shared_enums[0].id).toBe("PhotoStatus");
    expect(candidate.updated_by_work_item).toBe(workItemId);

    // Manifest is valid + declares the explicit entry.
    const manifestRaw = await fs.readFile(path.join(wiDir(), "candidate_manifest.json"), "utf-8");
    const validation = validateCandidateManifestJson(manifestRaw, workItemId);
    expect(validation.valid, validation.errors.join("; ")).toBe(true);

    // The merge "intake officer" (inferManifestEntries) must echo the explicit
    // entry verbatim — proving no bypass is needed.
    const manifest = JSON.parse(manifestRaw);
    const inferred = inferManifestEntries(manifest, wiDir());
    const hit = inferred.find(
      (e: any) => e.target_path === ".specforge/project/extension_registry.json",
    );
    expect(hit).toBeTruthy();
    expect(hit!.candidate_path).toBe("candidates/project/extension_registry.json");
  });

  it("rejects an already-registered contract (dedup guard)", async () => {
    const first = await authorContractCandidate({
      projectRoot,
      workItemId,
      kind: "shared_enum",
      entry: { id: "PhotoStatus", owner_module: "CORE", values: ["a"] },
    });
    expect(first.success).toBe(true);

    // Simulate the contract already being in the project registry.
    await fs.writeFile(
      path.join(projectRoot, ".specforge", "project", "extension_registry.json"),
      JSON.stringify({
        schema_version: "1.0",
        project_spec_version: "PSV-0001",
        namespaces: { requirement_types: [], design_types: [], task_types: [], verification_types: [], gate_types: [] },
        updated_by_work_item: null,
        updated_at: null,
        contracts: { shared_enums: [{ id: "PhotoStatus", owner_module: "CORE", values: ["a"] }], invariants: [], public_interfaces: [], extension_points: [] },
      }, null, 2),
    );

    const dup = await authorContractCandidate({
      projectRoot,
      workItemId,
      kind: "shared_enum",
      entry: { id: "PhotoStatus", owner_module: "CORE", values: ["a"] },
    });
    expect(dup.success).toBe(false);
    expect(dup.error).toContain("already registered");
  });

  it("requires id and owner_module", async () => {
    const noId = await authorContractCandidate({
      projectRoot, workItemId, kind: "invariant", entry: { rule: "x" } as any,
    });
    expect(noId.success).toBe(false);
    expect(noId.error).toContain("id");

    const noOwner = await authorContractCandidate({
      projectRoot, workItemId, kind: "invariant", entry: { id: "MUST_X" } as any,
    });
    expect(noOwner.success).toBe(false);
    expect(noOwner.error).toContain("owner_module");
  });
});
