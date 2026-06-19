/**
 * governance-invariants-v11.ts — SpecForge v1.1 P0 hard governance invariants
 *
 * This module is intentionally daemon-side. Agent / Skill text may guide the
 * process, but these checks are the trust boundary for approval, merge and close.
 */
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export type GovernanceValidationResult = {
  valid: boolean;
  errors: string[];
  facts?: Record<string, unknown>;
};

export type ManifestEntry = {
  candidate_path: string;
  target_path: string;
  operation: string;
  type?: string;
  inferred?: boolean;
  normalized?: boolean;
};

export const VALID_WORKFLOW_PATHS = new Set([
  "requirement_change_path",
  "design_change_path",
  "architecture_change_path",
  "task_change_path",
  "code_only_fast_path",
  "spec_migration_path",
  "rollback_path",
]);

export const USER_APPROVAL_REQUIRED_PATHS = new Set([
  "requirement_change_path",
  "design_change_path",
  "architecture_change_path",
  "task_change_path",
  "spec_migration_path",
]);

export function normalizeSlash(value: string): string {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isKnownAgentActor(actor: string | undefined | null): boolean {
  const value = String(actor ?? "").trim().toLowerCase();
  if (!value) return true;
  if (value === "unknown") return true;
  if (value.startsWith("sf-")) return true;
  return ["orchestrator", "agent", "assistant", "model", "system"].includes(value);
}

export async function readTextOrNull(filePath: string): Promise<string | null> {
  try { return await fs.readFile(filePath, "utf-8"); } catch { return null; }
}

export async function readJsonOrNull<T = any>(filePath: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(filePath, "utf-8")) as T; } catch { return null; }
}

export async function computeFileHash(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath);
    return "sha256:" + crypto.createHash("sha256").update(content).digest("hex");
  } catch { return ""; }
}

async function walkDir(dir: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...await walkDir(full));
      else out.push(full);
    }
  } catch { /* absent directory */ }
  return out;
}

export async function computeCandidateHash(workItemDir: string): Promise<string> {
  const candidatesDir = path.join(workItemDir, "candidates");
  const hash = crypto.createHash("sha256");
  const files = await walkDir(candidatesDir);
  for (const file of files.sort()) {
    try { hash.update(await fs.readFile(file)); } catch { /* skip */ }
  }
  return "sha256:" + hash.digest("hex");
}

export function targetPathForCandidate(type: string, candidatePath: string): string | null {
  const t = String(type ?? "").toLowerCase();
  const p = normalizeSlash(candidatePath).toLowerCase();
   const moduleRequirementsCandidate = p.match(/(?:^|\/)candidates\/project\/modules\/([^\/]+)\/requirements\.candidate\.md$/); if (moduleRequirementsCandidate) return `.specforge/project/modules/${moduleRequirementsCandidate[1]}/requirements.md`; const moduleDesignCandidate = p.match(/(?:^|\/)candidates\/project\/modules\/([^\/]+)\/design\.candidate\.md$/); if (moduleDesignCandidate) return `.specforge/project/modules/${moduleDesignCandidate[1]}/design.md`;if (t === "requirements" || p.endsWith("/requirements.md") || p === "requirements.md") return ".specforge/project/requirements_index.md";
  if (t === "design" || p.endsWith("/design.md") || p === "design.md") return ".specforge/project/design_index.md";
  if (t === "trace" || t === "trace_delta" || p.endsWith("/trace_delta.md") || p === "trace_delta.md") return ".specforge/project/trace_matrix.md";
  if (t === "architecture" || p.endsWith("/architecture.md") || p === "architecture.md") return ".specforge/project/architecture.md";
  if (t === "glossary" || p.endsWith("/glossary.md") || p === "glossary.md") return ".specforge/project/glossary.md";
  if (t === "decisions" || p.endsWith("/decisions.md") || p === "decisions.md") return ".specforge/project/decisions.md";
  return null;
}

export function inferManifestEntries(manifest: any, workItemDir: string): ManifestEntry[] {
  const normalized: ManifestEntry[] = [];
  const rawEntries = Array.isArray(manifest?.entries) ? manifest.entries : [];

  for (const entry of rawEntries) {
    if (!entry || typeof entry !== "object") continue;
    const candidatePath = entry.candidate_path ?? entry.path;
    const targetPath = entry.target_path;
    if (!candidatePath || !targetPath) continue;
    normalized.push({
      candidate_path: normalizeSlash(candidatePath),
      target_path: normalizeSlash(targetPath),
      operation: entry.operation ?? "replace",
      type: entry.type,
      inferred: Boolean(entry.inferred),
      normalized: Boolean(entry.normalized),
    });
  }

  if (normalized.length === 0 && Array.isArray(manifest?.candidates)) {
    for (const candidate of manifest.candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const candidatePath = normalizeSlash(candidate.candidate_path ?? candidate.path ?? "");
      if (!candidatePath) continue;
      const targetPath = targetPathForCandidate(candidate.type, candidatePath);
      if (!targetPath) continue;
      normalized.push({
        candidate_path: candidatePath,
        target_path: targetPath,
        operation: candidate.operation ?? "replace",
        type: candidate.type,
        inferred: false,
        normalized: true,
      });
    }
  }

  if (normalized.length === 0) { const moduleCandidatesRoot = path.join(workItemDir, "candidates", "project", "modules"); try { for (const moduleName of fsSync.readdirSync(moduleCandidatesRoot)) { const moduleDir = path.join(moduleCandidatesRoot, moduleName); if (!fsSync.statSync(moduleDir).isDirectory()) continue; const reqCandidate = path.join(moduleDir, "requirements.candidate.md"); const designCandidate = path.join(moduleDir, "design.candidate.md"); if (fsSync.existsSync(reqCandidate)) normalized.push({ candidate_path: normalizeSlash(path.relative(workItemDir, reqCandidate)), target_path: `.specforge/project/modules/${moduleName}/requirements.md`, operation: "replace", type: "requirements", inferred: true, normalized: true }); if (fsSync.existsSync(designCandidate)) normalized.push({ candidate_path: normalizeSlash(path.relative(workItemDir, designCandidate)), target_path: `.specforge/project/modules/${moduleName}/design.md`, operation: "replace", type: "design", inferred: true, normalized: true }); } } catch { /* absent v1.14 module candidates */ } } // Important P0 follow-up:
  // Do not infer a root-level trace_delta.md entry here. Candidate Gate requires
  // candidate_path to be under candidates/, and approval/merge must compare the
  // manifest against exactly the same normalized object that Gate accepted.
  // If trace_delta is intended to be merged, it must be explicitly present as
  // candidates/trace_delta.md in candidate_manifest entries or candidates[].
  const traceDeltaCandidatePath = path.join(workItemDir, "candidates", "trace_delta.md");
  const alreadyHasTrace = normalized.some((entry) => normalizeSlash(entry.target_path).endsWith("trace_matrix.md"));
  if (fsSync.existsSync(traceDeltaCandidatePath) && !alreadyHasTrace && manifest?.workflow_path !== "code_only_fast_path") {
    normalized.push({
      candidate_path: "candidates/trace_delta.md",
      target_path: ".specforge/project/trace_matrix.md",
      operation: "replace",
      type: "trace_delta",
      inferred: false,
      normalized: true,
    });
  }

  const seen = new Set<string>();
  return normalized.filter((entry) => {
    const key = (entry.candidate_path + "=>" + entry.target_path).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function entriesSemanticallyEqual(a: ManifestEntry[], b: ManifestEntry[]): boolean {
  const canon = (items: ManifestEntry[]) => items
    .map((e) => ({
      candidate_path: normalizeSlash(e.candidate_path),
      target_path: normalizeSlash(e.target_path),
      operation: String(e.operation ?? "replace"),
      type: e.type,
    }))
    .sort((x, y) => `${x.candidate_path}|${x.target_path}`.localeCompare(`${y.candidate_path}|${y.target_path}`));
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

export function extractOverallGateStatus(summary: string | null): string {
  if (!summary) return "missing";
  const match = summary.match(/Overall Status:\s*([^\r\n]+)/i);
  return match ? match[1].trim().toLowerCase() : "missing";
}

async function readWorkItemFacts(projectRoot: string, workItemDir: string, workItemId: string): Promise<Record<string, any>> {
  const workItem = await readJsonOrNull<Record<string, any>>(path.join(workItemDir, "work_item.json"));
  const trigger = await readJsonOrNull<Record<string, any>>(path.join(workItemDir, "trigger_result.json"));
  const manifest = await readJsonOrNull<Record<string, any>>(path.join(workItemDir, "candidate_manifest.json"));
  const runtime = await readJsonOrNull<Record<string, any>>(path.join(projectRoot, ".specforge", "runtime", "state.json"));
  let runtimeItem: any = null;
  if (runtime?.work_item_id === workItemId) runtimeItem = runtime;
  if (!runtimeItem && Array.isArray(runtime?.workItems)) runtimeItem = runtime.workItems.find((x: any) => x?.work_item_id === workItemId) ?? null;
  const workflowPath = workItem?.workflow_path ?? trigger?.workflow_path ?? manifest?.workflow_path ?? runtimeItem?.workflow_path;
  const currentState = runtimeItem?.current_state ?? runtimeItem?.status ?? null;
  return { workItem, trigger, manifest, runtimeItem, workflowPath, currentState };
}

async function validateCandidateManifest(projectRoot: string, workItemDir: string, workItemId: string, errors: string[]): Promise<any> {
  const manifestPath = path.join(workItemDir, "candidate_manifest.json");
  const manifest = await readJsonOrNull<Record<string, any>>(manifestPath);
  if (!manifest) {
    errors.push("candidate_manifest.json is missing or invalid JSON");
    return null;
  }
  if (manifest.work_item_id && manifest.work_item_id !== workItemId) errors.push(`candidate_manifest.work_item_id mismatch: ${manifest.work_item_id}`);
  const workflowPath = manifest.workflow_path;
  if (!VALID_WORKFLOW_PATHS.has(String(workflowPath))) errors.push(`candidate_manifest.workflow_path invalid: ${workflowPath ?? "missing"}`);
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const inferred = inferManifestEntries(manifest, workItemDir);
  if (workflowPath !== "code_only_fast_path") {
    if (entries.length === 0) errors.push("candidate_manifest.entries must be non-empty before approval/merge for spec-changing workflows");
    if (!entriesSemanticallyEqual(entries, inferred)) errors.push("candidate_manifest.entries must be normalized before approval; merge_runner must not infer or mutate entries after approval");
  }
  for (const [i, entry] of entries.entries()) {
    const candidatePath = normalizeSlash(entry?.candidate_path ?? entry?.path ?? "");
    const targetPath = normalizeSlash(entry?.target_path ?? "");
    if (!candidatePath) errors.push(`candidate_manifest.entries[${i}].candidate_path missing`);
    if (!targetPath) errors.push(`candidate_manifest.entries[${i}].target_path missing`);
    if (candidatePath.includes("..")) errors.push(`candidate_manifest.entries[${i}].candidate_path contains ..`);
    if (targetPath.includes("..")) errors.push(`candidate_manifest.entries[${i}].target_path contains ..`);
    if (targetPath && !targetPath.startsWith(".specforge/project/") && !targetPath.startsWith("project/")) {
      errors.push(`candidate_manifest.entries[${i}].target_path must point to .specforge/project/: ${targetPath}`);
    }
    const candidateFullPath = path.resolve(workItemDir, candidatePath);
    const workItemRoot = path.resolve(workItemDir);
    if (!candidateFullPath.toLowerCase().startsWith(workItemRoot.toLowerCase())) errors.push(`candidate_manifest.entries[${i}].candidate_path outside WI`);
    try { await fs.access(candidateFullPath); } catch { errors.push(`candidate file missing: ${candidatePath}`); }
  }
  return manifest;
}

async function validateGatePassed(workItemDir: string, errors: string[]): Promise<void> {
  const summary = await readTextOrNull(path.join(workItemDir, "gate_summary.md"));
  const status = extractOverallGateStatus(summary);
  if (!["passed", "passed_with_waiver_required"].includes(status)) errors.push(`gate_summary Overall Status must be passed before approval/merge/close, got ${status}`);
  if (summary && /Some hard gates failed/i.test(summary)) errors.push("gate_summary says hard gates failed; user cannot approve");
  const gatesDir = path.join(workItemDir, "gates");
  for (const gateName of ["required_files_gate", "candidate_manifest_gate", "path_policy_gate"]) {
    const gate = await readJsonOrNull<Record<string, any>>(path.join(gatesDir, `${gateName}.json`));
    if (gate && gate.required !== false && !["passed", "not_applicable"].includes(String(gate.status))) {
      errors.push(`${gateName}.json status must be passed/not_applicable, got ${gate.status}`);
    }
  }
}

export async function validateDecisionRecordPreconditions(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
  requestedWorkflowPath?: string;
  decisionStatus: string;
  decisionType: string;
  decidedBy: string; currentState?: string; }): Promise<GovernanceValidationResult> { const errors: string[] = []; const facts = await readWorkItemFacts(input.projectRoot, input.workItemDir, input.workItemId); if (typeof input.currentState === "string" && input.currentState.length > 0) facts.currentState = input.currentState;
  const workflowPath = input.requestedWorkflowPath || facts.workflowPath;
  if (!workflowPath || workflowPath === "unknown" || !VALID_WORKFLOW_PATHS.has(String(workflowPath))) errors.push(`workflow_path invalid for user_decision: ${workflowPath ?? "missing"}`);
  if (input.requestedWorkflowPath && facts.workflowPath && input.requestedWorkflowPath !== facts.workflowPath) errors.push(`workflow_path mismatch: requested=${input.requestedWorkflowPath}, work_item=${facts.workflowPath}`);
  if (facts.workItem?.workflow_path && workflowPath !== facts.workItem.workflow_path) errors.push(`user_decision.workflow_path must equal work_item.workflow_path: ${workflowPath} != ${facts.workItem.workflow_path}`);
  if (facts.trigger?.workflow_path && workflowPath !== facts.trigger.workflow_path) errors.push(`user_decision.workflow_path must equal trigger_result.workflow_path: ${workflowPath} != ${facts.trigger.workflow_path}`);
  if (facts.manifest?.workflow_path && workflowPath !== facts.manifest.workflow_path) errors.push(`user_decision.workflow_path must equal candidate_manifest.workflow_path: ${workflowPath} != ${facts.manifest.workflow_path}`);

  await validateCandidateManifest(input.projectRoot, input.workItemDir, input.workItemId, errors);

  if (USER_APPROVAL_REQUIRED_PATHS.has(String(workflowPath))) {
    if (facts.currentState !== "approval_required") errors.push(`user_decision_record requires approval_required state for ${workflowPath}, current=${facts.currentState ?? "missing"}`);
    await validateGatePassed(input.workItemDir, errors);
    if (input.decisionStatus === "approved" && input.decisionType === "user_approved" && isKnownAgentActor(input.decidedBy)) {
      errors.push(`user_approved cannot be recorded by Agent actor: ${input.decidedBy}`);
    }
    if (input.decisionStatus === "approved" && input.decisionType !== "user_approved") errors.push(`approved decision for ${workflowPath} must use decision_type=user_approved`);
  }
  return { valid: errors.length === 0, errors, facts: { workflowPath, currentState: facts.currentState, decidedBy: input.decidedBy } };
}

export async function validateApprovedUserDecisionForMerge(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
  candidateManifestPath: string;
  userDecisionPath: string;
}): Promise<GovernanceValidationResult> {
  const errors: string[] = [];
  const facts = await readWorkItemFacts(input.projectRoot, input.workItemDir, input.workItemId);
  const decision = await readJsonOrNull<Record<string, any>>(input.userDecisionPath);
  if (!decision) errors.push("user_decision.json is missing or invalid JSON");
  const workflowPath = decision?.workflow_path;
  if (!workflowPath || workflowPath === "unknown" || !VALID_WORKFLOW_PATHS.has(String(workflowPath))) errors.push(`user_decision.workflow_path invalid: ${workflowPath ?? "missing"}`);
  if (facts.workItem?.workflow_path && workflowPath !== facts.workItem.workflow_path) errors.push(`user_decision.workflow_path != work_item.workflow_path: ${workflowPath} != ${facts.workItem.workflow_path}`);
  if (facts.trigger?.workflow_path && workflowPath !== facts.trigger.workflow_path) errors.push(`user_decision.workflow_path != trigger_result.workflow_path: ${workflowPath} != ${facts.trigger.workflow_path}`);
  if (facts.manifest?.workflow_path && workflowPath !== facts.manifest.workflow_path) errors.push(`user_decision.workflow_path != candidate_manifest.workflow_path: ${workflowPath} != ${facts.manifest.workflow_path}`);

  await validateCandidateManifest(input.projectRoot, input.workItemDir, input.workItemId, errors);
  await validateGatePassed(input.workItemDir, errors);

  if (USER_APPROVAL_REQUIRED_PATHS.has(String(workflowPath))) {
    if (decision?.decision_status !== "approved") errors.push(`spec-changing workflow requires decision_status=approved, got ${decision?.decision_status}`);
    if (decision?.decision_type !== "user_approved") errors.push(`spec-changing workflow requires decision_type=user_approved, got ${decision?.decision_type}`);
    if (isKnownAgentActor(decision?.decided_by)) errors.push(`user approval cannot be by Agent actor: ${decision?.decided_by}`);
  } else if (decision && !["approved", "waived"].includes(String(decision.decision_status))) {
    errors.push(`User Decision status is not approved/waived: ${decision.decision_status}`);
  }

  const currentManifestHash = await computeFileHash(input.candidateManifestPath);
  const currentGateSummaryHash = await computeFileHash(path.join(input.workItemDir, "gate_summary.md"));
  const currentCandidateHash = await computeCandidateHash(input.workItemDir);
  if (decision?.manifest_hash && decision.manifest_hash !== currentManifestHash) errors.push("user_decision.manifest_hash does not match current candidate_manifest.json; approval target changed");
  if (decision?.gate_summary_hash && decision.gate_summary_hash !== currentGateSummaryHash) errors.push("user_decision.gate_summary_hash does not match current gate_summary.md; gate result changed after approval");
  if (decision?.candidate_hash && decision.candidate_hash !== currentCandidateHash) errors.push("user_decision.candidate_hash does not match current candidates/ content; candidate changed after approval");

  return { valid: errors.length === 0, errors, facts: { workflowPath, decidedBy: decision?.decided_by } };
}

export async function validateApprovedUserDecisionForClose(input: { projectRoot: string; workItemDir: string; workItemId: string; candidateManifestPath: string; userDecisionPath: string; }): Promise<GovernanceValidationResult> {
  const errors: string[] = [];
  const facts = await readWorkItemFacts(input.projectRoot, input.workItemDir, input.workItemId);
  const decision = await readJsonOrNull<Record<string, any>>(input.userDecisionPath);
  if (!decision) errors.push("user_decision.json is missing or invalid JSON");

  const workflowPath = String(decision?.workflow_path ?? facts.workflowPath ?? "");
  if (!workflowPath || workflowPath === "unknown" || !VALID_WORKFLOW_PATHS.has(workflowPath)) {
    errors.push(`user_decision.workflow_path invalid for close: ${workflowPath || "missing"}`);
  }
  if (facts.workItem?.workflow_path && workflowPath !== facts.workItem.workflow_path) {
    errors.push(`user_decision.workflow_path != work_item.workflow_path: ${workflowPath} != ${facts.workItem.workflow_path}`);
  }
  if (facts.trigger?.workflow_path && workflowPath !== facts.trigger.workflow_path) {
    errors.push(`user_decision.workflow_path != trigger_result.workflow_path: ${workflowPath} != ${facts.trigger.workflow_path}`);
  }
  if (facts.manifest?.workflow_path && workflowPath !== facts.manifest.workflow_path) {
    errors.push(`user_decision.workflow_path != candidate_manifest.workflow_path: ${workflowPath} != ${facts.manifest.workflow_path}`);
  }

  if (USER_APPROVAL_REQUIRED_PATHS.has(workflowPath)) {
    if (decision?.decision_status !== "approved") errors.push(`spec-changing workflow requires decision_status=approved for close, got ${decision?.decision_status}`);
    if (decision?.decision_type !== "user_approved") errors.push(`spec-changing workflow requires decision_type=user_approved for close, got ${decision?.decision_type}`);
    if (isKnownAgentActor(decision?.decided_by)) errors.push(`user approval cannot be by Agent actor for close: ${decision?.decided_by}`);
  } else if (decision && !["approved", "waived"].includes(String(decision.decision_status))) {
    errors.push(`User Decision status is not approved/waived for close: ${decision.decision_status}`);
  }

  // Close is post-merge. Pre-merge hashes (candidate_hash, manifest_hash,
  // gate_summary_hash) are enforced by validateApprovedUserDecisionForMerge().
  // Rechecking them here incorrectly blocks a completed, verified workflow after
  // merge has normalized candidate_manifest or gate_summary has been overwritten
  // by close-gate output. Close must validate the approval subject and rely on
  // merge_report, verification_report, evidence_manifest and write-permission
  // revocation checks for post-merge integrity.
  return {
    valid: errors.length === 0,
    errors,
    facts: { workflowPath, decidedBy: decision?.decided_by, close_validation: "post_merge_no_pre_merge_hash_recheck" },
  };
}

