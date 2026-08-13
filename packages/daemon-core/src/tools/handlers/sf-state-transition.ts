import { access, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { registerHandler } from "../ToolDispatcher";
import { SPEC_DIR_NAME } from "@specforge/types/directory-layout";
import { join } from "node:path";
import {
  isValidV11Transition,
  isForbiddenTransition,
  WI_STATUSES_V11,
  checkCloseGateEvidenceRequirements,
} from "../lib/state-machine-v11";
import {
  WORKFLOW_PATH_TO_TYPE,
  WORKFLOW_TYPE_TO_PATH,
  type WorkflowPath,
  type WorkflowType,
  isWorkflowTypeCompatibleWithPath,
} from "../lib/state_machine";
import { isSealTransition, getSealTransition } from "@specforge/types/seal-transitions";
import {
  validateWorkItemId,
  parseWorkItemSequence,
  formatWorkItemId,
} from "../lib/work-item-id-validator";
import { guardHardStop } from "../lib/hard-stop-latch";
import { readAuthoritativeState, transitionWithEvidence } from "../lib/state-coordinator-v11";
import { parseChangedFilesAuditPass } from "../lib/write-guard-runtime-v12";
import { materializeCandidateManifestEntries } from "../lib/governance-invariants-v11";
import { resolveCanonicalCandidateWorkflowPath } from "../lib/artifact-schema-validation";
import {
  initializeClosureFiles,
  readAuthoritativeProjectSpecVersion,
} from "../lib/work-item-lifecycle-v11";

/**
 * Allocate next WI-NNNN from existing .specforge/work-items directories.
 *
 * This is intentionally daemon-side so the Agent does not invent WI IDs.
 */
async function allocateNextWorkItemId(projectRoot: string): Promise<string> {
  const wiRoot = join(projectRoot, SPEC_DIR_NAME, "work-items");
  await mkdir(wiRoot, { recursive: true });

  let max = 0;
  try {
    const entries = await readdir(wiRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const seq = parseWorkItemSequence(entry.name);
      if (seq !== null && seq > max) max = seq;
    }
  } catch {
    max = 0;
  }

  return formatWorkItemId(max + 1);
}

async function readJsonIfExists(filePath: string): Promise<Record<string, any> | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8"));
  } catch {
    return null;
  }
}

async function readExistingWorkflowFacts(
  projectRoot: string,
  workItemId: string,
): Promise<{ workflowType?: string; workflowPath?: string }> {
  const wiDir = join(projectRoot, SPEC_DIR_NAME, "work-items", workItemId);
  const candidates = [
    join(wiDir, "trigger_result.json"),
    join(wiDir, "candidate_manifest.json"),
    join(projectRoot, SPEC_DIR_NAME, "runtime", "state.json"),
    join(wiDir, "work_item.json"),
  ];

  for (const filePath of candidates) {
    const json = await readJsonIfExists(filePath);
    if (!json) continue;

    if (filePath.endsWith("state.json") && Array.isArray(json.workItems)) {
      const item = json.workItems.find((wi: any) => wi?.work_item_id === workItemId);
      if (item) {
        return {
          workflowType: item.workflow_type,
          workflowPath: item.workflow_path,
        };
      }
    }

    if (json.work_item_id === workItemId || !json.work_item_id) {
      if (json.workflow_type || json.workflow_path) {
        return {
          workflowType: json.workflow_type,
          workflowPath: json.workflow_path,
        };
      }
    }
  }

  return {};
}

function isKnownWorkflowType(value: string | undefined): value is WorkflowType {
  return !!value && Object.prototype.hasOwnProperty.call(WORKFLOW_TYPE_TO_PATH, value);
}

function resolveWorkflowTypeForTransition(input: {
  rawWorkflowType?: string;
  existingWorkflowType?: string;
  workflowPath?: string;
}): { workflowType?: string; error?: string; code?: string } {
  const candidate = input.rawWorkflowType ?? input.existingWorkflowType;

  if (input.workflowPath) {
    const pathValue = input.workflowPath as WorkflowPath;
    const defaultType = WORKFLOW_PATH_TO_TYPE[pathValue];

    if (!defaultType) {
      return {
        error: `Unknown workflow_path: ${input.workflowPath}. Valid paths: ${Object.keys(WORKFLOW_PATH_TO_TYPE).join(", ")}`,
        code: "UNKNOWN_WORKFLOW_PATH",
      };
    }

    if (candidate) {
      if (!isKnownWorkflowType(candidate)) {
        return {
          error: `Unknown workflow_type: ${candidate}. Valid workflow types: ${Object.keys(WORKFLOW_TYPE_TO_PATH).join(", ")}`,
          code: "UNKNOWN_WORKFLOW_TYPE",
        };
      }

      if (isWorkflowTypeCompatibleWithPath(candidate, input.workflowPath)) {
        return { workflowType: candidate };
      }

      if (input.rawWorkflowType) {
        return {
          error:
            `workflow_type ${candidate} is not compatible with workflow_path ${input.workflowPath}. ` +
            `Expected path for ${candidate}: ${WORKFLOW_TYPE_TO_PATH[candidate]}.`,
          code: "WORKFLOW_TYPE_PATH_CONFLICT",
        };
      }
    }

    return { workflowType: defaultType };
  }

  if (candidate) {
    if (!isKnownWorkflowType(candidate)) {
      return {
        error: `Unknown workflow_type: ${candidate}. Valid workflow types: ${Object.keys(WORKFLOW_TYPE_TO_PATH).join(", ")}`,
        code: "UNKNOWN_WORKFLOW_TYPE",
      };
    }
    return { workflowType: candidate };
  }

  return {};
}

async function ensureWorkItemJsonOnCreate(
  projectRoot: string,
  workItemId: string,
  workflowType: string | undefined,
  workflowPath: string | undefined,
): Promise<{ path: string; created: boolean }> {
  const baseSpecVersion = await readAuthoritativeProjectSpecVersion(projectRoot);
  const wiDir = join(projectRoot, SPEC_DIR_NAME, "work-items", workItemId);
  await mkdir(wiDir, { recursive: true });
  const workItemJsonPath = join(wiDir, "work_item.json");
  const existing = await readJsonIfExists(workItemJsonPath);
  if (existing) {
    // Even when work_item.json already exists, ensure non-Candidate lifecycle
    // files are present. Candidate tasks/trace artifacts are never synthesized.
    await initializeClosureFiles(wiDir, workItemId, workflowPath ?? null, baseSpecVersion);
    return { path: workItemJsonPath, created: false };
  }

  const now = new Date().toISOString();
  const workItem = {
    schema_version: "1.1",
    work_item_id: workItemId,
    workflow_type: workflowType ?? "quick_change",
    workflow_path: workflowPath,
    title: `Work Item ${workItemId}`,
    description: "Auto-created by sf_state_transition during Work Item creation.",
    created_at: now,
    updated_at: now,
    code_change_allowed: false,
    code_permission_revoked: false,
  };

  await writeFile(workItemJsonPath, JSON.stringify(workItem, null, 2) + "\n", "utf-8");

  // Initialize non-Candidate lifecycle files. tasks.md and trace_delta.md are
  // authored only at their canonical candidates/ paths.
  await initializeClosureFiles(wiDir, workItemId, workflowPath ?? null, baseSpecVersion);

  return { path: workItemJsonPath, created: true };
}


function sha256CandidateFreezeContent(content: string | Buffer): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

type ProjectSpecRepairPlanFreezeBinding = {
  path: string;
  previous_text: string;
};

async function bindProjectSpecRepairPlanToFrozenCandidateManifest(input: {
  workItemDir: string;
  workItemId: string;
  frozenManifestPath: string;
  previousManifestText: string;
}): Promise<ProjectSpecRepairPlanFreezeBinding | undefined> {
  const repairPlanPath = join(input.workItemDir, "project_spec_repair_plan.json");
  let previousRepairPlanText: string;
  try {
    previousRepairPlanText = await readFile(repairPlanPath, "utf-8");
  } catch (error: any) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }

  let repairPlan: Record<string, any>;
  try {
    repairPlan = JSON.parse(previousRepairPlanText);
  } catch {
    throw new Error("PROJECT_SPEC_REPAIR_PLAN_INVALID_DURING_CANDIDATE_FREEZE");
  }
  if (
    repairPlan.action !== "project_spec_repair" ||
    repairPlan.work_item_id !== input.workItemId
  ) {
    throw new Error("PROJECT_SPEC_REPAIR_PLAN_INVALID_DURING_CANDIDATE_FREEZE");
  }

  const expectedPreviousManifestHash = sha256CandidateFreezeContent(
    input.previousManifestText,
  );
  if (repairPlan.candidate_manifest_sha256 !== expectedPreviousManifestHash) {
    throw new Error("PROJECT_SPEC_REPAIR_PLAN_PRE_FREEZE_BINDING_STALE");
  }

  const frozenManifestRaw = await readFile(input.frozenManifestPath);
  const frozenManifestHash = sha256CandidateFreezeContent(frozenManifestRaw);
  const updatedRepairPlan = {
    ...repairPlan,
    candidate_manifest_sha256: frozenManifestHash,
  };
  const updatedRepairPlanText = JSON.stringify(updatedRepairPlan, null, 2) + "\n";
  const temporaryPath =
    `${repairPlanPath}.freezing-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporaryPath, updatedRepairPlanText, "utf-8");
    await rename(temporaryPath, repairPlanPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return {
    path: repairPlanPath,
    previous_text: previousRepairPlanText,
  };
}

async function restoreRepairPlanBinding(
  repairPlanPath: string,
  previousRepairPlanText: string,
): Promise<void> {
  const temporaryPath =
    `${repairPlanPath}.rollback-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporaryPath, previousRepairPlanText, "utf-8");
    await rename(temporaryPath, repairPlanPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function materializeCandidateManifestBeforePreparedTransition(
  projectRoot: string,
  workItemId: string,
): Promise<{
  manifest_path: string;
  entry_count: number;
  required_candidate_types: string[];
  ignored_candidate_paths: string[];
  previous_manifest_text: string;
}> {
  const workItemDir = join(projectRoot, SPEC_DIR_NAME, "work-items", workItemId);
  const manifestPath = join(workItemDir, "candidate_manifest.json");
  const triggerPath = join(workItemDir, "trigger_result.json");
  let previousManifestText = "";
  let manifest: Record<string, any> | null = null;
  try {
    previousManifestText = await readFile(manifestPath, "utf-8");
    manifest = JSON.parse(previousManifestText);
  } catch {
    manifest = null;
  }
  const trigger = await readJsonIfExists(triggerPath);
  if (!manifest) {
    throw new Error("CANDIDATE_MANIFEST_REQUIRED_BEFORE_CANDIDATE_PREPARED");
  }
  if (!trigger) {
    throw new Error("TRIGGER_RESULT_REQUIRED_BEFORE_CANDIDATE_PREPARED");
  }
  if (manifest.work_item_id && manifest.work_item_id !== workItemId) {
    throw new Error(
      `CANDIDATE_MANIFEST_WORK_ITEM_MISMATCH: ${manifest.work_item_id} != ${workItemId}`,
    );
  }

  const canonicalWorkflowPath = resolveCanonicalCandidateWorkflowPath(
    manifest.workflow_path,
    trigger.workflow_path,
  );
  const manifestForMaterialization = {
    ...manifest,
    workflow_path: canonicalWorkflowPath,
  };
  const materialized = materializeCandidateManifestEntries(
    manifestForMaterialization,
    workItemDir,
    trigger.classification,
  );
  const normalized = {
    ...manifestForMaterialization,
    schema_version: manifest.schema_version ?? "1.1",
    work_item_id: workItemId,
    workflow_path: canonicalWorkflowPath,
    workflow_type: manifest.workflow_type ?? trigger.workflow_type,
    entries: materialized.entries,
  };
  const materializedText = JSON.stringify(normalized, null, 2) + "\n";
  const temporaryPath = `${manifestPath}.materializing-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporaryPath, materializedText, "utf-8");
    await rename(temporaryPath, manifestPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return {
    manifest_path: manifestPath,
    entry_count: materialized.entries.length,
    required_candidate_types: materialized.required_candidate_types,
    ignored_candidate_paths: materialized.ignored_candidate_paths,
    previous_manifest_text: previousManifestText,
  };
}

async function restoreCandidateManifest(
  manifestPath: string,
  previousManifestText: string,
): Promise<void> {
  const temporaryPath = `${manifestPath}.rollback-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporaryPath, previousManifestText, "utf-8");
    await rename(temporaryPath, manifestPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * v1.1 state transition handler.
 *
 * V12:
 * - Work Item creation must use from_state="" and to_state="created".
 * - work_item_id may be omitted only on create; daemon allocates WI-NNNN.
 * - legacy target state "intake" is rejected with a retryable protocol error.
 * - workflow_path is a coarse route; compatible workflow_type is preserved.
 */
registerHandler("sf_state_transition", async (args, context, deps) => {
  let workItemId = args["work_item_id"] as string | undefined;
  const fromState = ((args["from_state"] as string) ?? "");
  const toState = args["to_state"] as string;
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  if (!toState) {
    return { success: false, error: "to_state required" };
  }

  if (fromState === "" && toState === "intake") {
    return {
      success: false,
      error: "LEGACY_INTAKE_STATE_FORBIDDEN_IN_V11",
      code: "LEGACY_INTAKE_STATE_FORBIDDEN",
      retry_allowed: true,
      remediation:
        "Create a v1.1 Work Item with from_state='' and to_state='created'. " +
        "After intake.md is written, transition created -> intake_ready.",
    };
  }

  const isCreateTransition = fromState === "" && toState === "created";
  if ((!workItemId || workItemId.trim() === "") && isCreateTransition) {
    workItemId = await allocateNextWorkItemId(baseDir);
  }

  if (!workItemId) {
    return {
      success: false,
      error: "work_item_id required. For create transition, omit work_item_id to let daemon allocate WI-NNNN.",
      code: "WORK_ITEM_ID_REQUIRED",
      retry_allowed: true,
    };
  }

  if (workItemId.trim() === "") {
    return {
      success: false,
      error: "work_item_id must not be an empty string. For create transition, omit work_item_id entirely.",
      code: "EMPTY_WORK_ITEM_ID_FORBIDDEN",
      retry_allowed: true,
    };
  }

  const idError = validateWorkItemId(workItemId);
  if (idError) {
    return {
      success: false,
      error: idError,
      code: "INVALID_WORK_ITEM_ID",
      hard_stop: false,
      retry_allowed: true,
      remediation:
        "Use WI-NNNN, for example WI-0001. For a new Work Item, omit work_item_id and call sf_state_transition with from_state='' and to_state='created' so daemon allocates it.",
    };
  }

  const hardStopGuard = guardHardStop(baseDir, workItemId, "sf_state_transition");
  if (!hardStopGuard.allowed) {
    return {
      success: false,
      error: hardStopGuard.error,
      hard_stop: true,
      hard_stop_record: hardStopGuard.hard_stop_record,
    };
  }

  const rawWorkflowPath = args["workflow_path"] as string | undefined;
  const rawWorkflowType = args["workflow_type"] as string | undefined;
  const existingWorkflowFacts = !isCreateTransition ? await readExistingWorkflowFacts(baseDir, workItemId) : {};
  const inheritedWorkflowPath = rawWorkflowPath ?? existingWorkflowFacts.workflowPath;

  const resolvedWorkflow = resolveWorkflowTypeForTransition({
    rawWorkflowType,
    existingWorkflowType: existingWorkflowFacts.workflowType,
    workflowPath: inheritedWorkflowPath,
  });
  if (resolvedWorkflow.error) {
    return {
      success: false,
      error: resolvedWorkflow.error,
      code: resolvedWorkflow.code,
      retry_allowed: true,
    };
  }

  const resolvedWorkflowType = resolvedWorkflow.workflowType;
  const useV11 =
    (args["use_v11_state_machine"] as boolean) ||
    !!inheritedWorkflowPath ||
    !!existingWorkflowFacts.workflowType ||
    !!rawWorkflowType ||
    isCreateTransition;

  if (useV11) {
    if (!(WI_STATUSES_V11 as readonly string[]).includes(toState)) {
      return {
        success: false,
        error: `Invalid v1.1 target state "${toState}". Valid states: ${(WI_STATUSES_V11 as readonly string[]).join(", ")}`,
        code: "INVALID_V11_TARGET_STATE",
        retry_allowed: true,
        remediation:
          toState === "intake"
            ? "Use to_state='created' for new WI creation, then created -> intake_ready after intake.md is written."
            : "Use the v1.1 state list returned in valid_states.",
      };
    }

    if (fromState !== "" && isForbiddenTransition(fromState, toState)) {
      return {
        success: false,
        error: `Forbidden v1.1 transition: ${fromState} → ${toState} (§5.2)`,
        forbidden: true,
      };
    }

    if (fromState !== "" && !isValidV11Transition(fromState, toState)) {
      return {
        success: false,
        error: `Invalid v1.1 transition: ${fromState} → ${toState}`,
        valid_from_states: `Use getTransitionTable() to see valid targets from ${fromState}`,
      };
    }

    if (fromState === "approved" && toState === "blocked") {
      return {
        success: false,
        error:
          "approved → blocked is reserved for sf_user_decision_record(action='invalidate')",
        code: "APPROVAL_INVALIDATION_ACTION_REQUIRED",
        retry_allowed: true,
      };
    }

    if (fromState !== "" && isSealTransition(fromState, toState)) {
      const sealEntry = getSealTransition(fromState, toState);
      const callerAgent = (context?.agent as string) ?? "";
      if (sealEntry && callerAgent !== sealEntry.authorizedSubject) {
        return {
          success: false,
          error: `Seal transition ${fromState} → ${toState} requires actor '${sealEntry.authorizedSubject}', got '${callerAgent || "none"}'. Only ${sealEntry.authorizedSubject} may perform this transition.`,
          seal_transition: true,
          required_actor: sealEntry.authorizedSubject,
          actual_actor: callerAgent || null,
        };
      }
    }

    if (toState === "closed") {
      const v11ProjectPath = (context?.directory as string) || (context?.worktree as string) || "";
      if (!v11ProjectPath) {
        return {
          success: false,
          error: "projectPath required for close gate evidence check — provide context.directory or context.worktree",
        };
      }
      const v11WorkItemDir = join(v11ProjectPath, SPEC_DIR_NAME, "work-items", workItemId);
      const evidenceResult = await checkCloseGateEvidenceRequirements(v11WorkItemDir);
      if (!evidenceResult.met) {
        return {
          success: false,
          error: `Close gate evidence requirements not met. Missing: ${evidenceResult.missing.join(", ")}. ${evidenceResult.descriptions.join("; ")}`,
          missing_evidence: evidenceResult.missing,
        };
      }
    }
  }

  if (fromState === "") {
    const manifestPath = join(baseDir, SPEC_DIR_NAME, "manifest.json");
    try {
      await access(manifestPath);
    } catch {
      return {
        success: false,
        error: "PROJECT_NOT_INITIALIZED",
        hint: `项目尚未初始化，请在项目根目录运行 SpecForge 初始化流程以创建 ${SPEC_DIR_NAME}/manifest.json`,
        recovery_action: "execute_startup_flow",
      };
    }

    if (toState === "created") {
      try {
        await ensureWorkItemJsonOnCreate(
          baseDir,
          workItemId,
          resolvedWorkflowType,
          inheritedWorkflowPath,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const projectSpecVersionUnavailable = message.startsWith(
          "PROJECT_SPEC_VERSION_UNAVAILABLE:",
        );
        return {
          success: false,
          error: message,
          code: projectSpecVersionUnavailable
            ? "PROJECT_SPEC_VERSION_UNAVAILABLE"
            : "WORK_ITEM_INITIALIZATION_FAILED",
          hard_stop: true,
          retry_allowed: false,
          remediation: projectSpecVersionUnavailable
            ? "Repair .specforge/project/spec_manifest.json before creating a Work Item."
            : "Inspect Work Item initialization evidence and retry only after the root cause is fixed.",
        };
      }
    }
  }

  const projectPath = (context?.directory as string) || (context?.worktree as string) || "";
  if (!projectPath) {
    return {
      success: false,
      error: "projectPath required - provide context.directory or context.worktree",
    };
  }

  if (!deps.projectManager) {
    return { success: false, error: "ProjectManager not available" };
  }

  const workItemDir = join(projectPath, SPEC_DIR_NAME, "work-items", workItemId);
  let candidateManifestMaterialization:
    | {
        manifest_path: string;
        entry_count: number;
        required_candidate_types: string[];
        ignored_candidate_paths: string[];
        previous_manifest_text: string;
      }
    | undefined;
  let projectSpecRepairPlanFreezeBinding:
    | ProjectSpecRepairPlanFreezeBinding
    | undefined;
  if (fromState === "candidate_preparing" && toState === "candidate_prepared") {
    const authoritativeState = await readAuthoritativeState({
      deps,
      projectRoot: projectPath,
      workItemId,
    });
    if (authoritativeState.current_state !== fromState) {
      return {
        success: false,
        error:
          `CANDIDATE_MANIFEST_STATE_MISMATCH: authoritative state ` +
          `${authoritativeState.current_state} != requested ${fromState}`,
        code: "CANDIDATE_MANIFEST_STATE_MISMATCH",
        retry_allowed: true,
        state_advanced: false,
      };
    }
    try {
      candidateManifestMaterialization =
        await materializeCandidateManifestBeforePreparedTransition(projectPath, workItemId);
      projectSpecRepairPlanFreezeBinding =
        await bindProjectSpecRepairPlanToFrozenCandidateManifest({
          workItemDir,
          workItemId,
          frozenManifestPath: candidateManifestMaterialization.manifest_path,
          previousManifestText:
            candidateManifestMaterialization.previous_manifest_text,
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (candidateManifestMaterialization) {
        try {
          await restoreCandidateManifest(
            candidateManifestMaterialization.manifest_path,
            candidateManifestMaterialization.previous_manifest_text,
          );
        } catch (rollbackError) {
          const rollbackMessage =
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError);
          return {
            success: false,
            error:
              `CANDIDATE_FREEZE_ROLLBACK_FAILED: ${rollbackMessage}; ` +
              `original freeze error: ${message}`,
            code: "CANDIDATE_FREEZE_ROLLBACK_FAILED",
            hard_stop: true,
            state_advanced: false,
          };
        }
      }
      return {
        success: false,
        error: message,
        code: "CANDIDATE_MANIFEST_MATERIALIZATION_FAILED",
        retry_allowed: true,
        state_advanced: false,
        candidate_manifest_rolled_back:
          candidateManifestMaterialization ? true : undefined,
        remediation:
          "Fix the missing/conflicting controlled Candidate artifacts or repair-plan binding and retry candidate_preparing -> candidate_prepared. Do not hand-edit candidate_manifest.json or project_spec_repair_plan.json.",
      };
    }
  }
  if (fromState === "implementation_running" && toState === "implementation_done") {
    const auditPath = join(workItemDir, "changed_files_audit.md");
    let auditText = "";
    try {
      auditText = await readFile(auditPath, "utf-8");
    } catch {
      return {
        success: false,
        error: "IMPLEMENTATION_AUDIT_NOT_PASSED: changed_files_audit.md is required before implementation_done",
        code: "IMPLEMENTATION_AUDIT_NOT_PASSED",
        retry_allowed: true,
      };
    }
    const auditCheck = parseChangedFilesAuditPass(auditText);
    if (!auditCheck.passed) {
      return {
        success: false,
        error: "IMPLEMENTATION_AUDIT_NOT_PASSED: " + (auditCheck.reason ?? "changed_files_audit is not clean"),
        code: "IMPLEMENTATION_AUDIT_NOT_PASSED",
        retry_allowed: true,
      };
    }
  }
  const finalWorkflowType = resolvedWorkflowType || existingWorkflowFacts.workflowType || "quick_change";

  let transitionResult;
  try {
    transitionResult = await transitionWithEvidence({
      deps,
      context,
      projectRoot: projectPath,
      workItemId,
      workItemDir,
      fromState,
      toState,
      workflowType: finalWorkflowType,
      actorRole: typeof context?.agent === "string" ? context.agent : "system",
      evidence: (args["evidence"] as string) ?? "",
      transitionContext: {
        source: "sf_state_transition",
        ...(args["transition_context"] as Record<string, unknown> | undefined ?? {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (candidateManifestMaterialization) {
      const rollbackErrors: string[] = [];
      try {
        await restoreCandidateManifest(
          candidateManifestMaterialization.manifest_path,
          candidateManifestMaterialization.previous_manifest_text,
        );
      } catch (rollbackError) {
        rollbackErrors.push(
          `candidate_manifest=${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        );
      }
      if (projectSpecRepairPlanFreezeBinding) {
        try {
          await restoreRepairPlanBinding(
            projectSpecRepairPlanFreezeBinding.path,
            projectSpecRepairPlanFreezeBinding.previous_text,
          );
        } catch (rollbackError) {
          rollbackErrors.push(
            `project_spec_repair_plan=${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
          );
        }
      }
      if (rollbackErrors.length > 0) {
        return {
          success: false,
          error:
            `CANDIDATE_FREEZE_ROLLBACK_FAILED: ${rollbackErrors.join("; ")}; ` +
            `original transition error: ${message}`,
          code: "CANDIDATE_FREEZE_ROLLBACK_FAILED",
          hard_stop: true,
          state_advanced: false,
        };
      }
      return {
        success: false,
        error: message,
        candidate_manifest_rolled_back: true,
        repair_plan_rolled_back:
          projectSpecRepairPlanFreezeBinding ? true : undefined,
        state_advanced: false,
      };
    }
    return { success: false, error: message };
  }

  const publicCandidateManifestMaterialization = candidateManifestMaterialization
    ? {
        manifest_path: candidateManifestMaterialization.manifest_path,
        entry_count: candidateManifestMaterialization.entry_count,
        required_candidate_types:
          candidateManifestMaterialization.required_candidate_types,
        ignored_candidate_paths: candidateManifestMaterialization.ignored_candidate_paths,
        repair_plan_binding_updated:
          projectSpecRepairPlanFreezeBinding !== undefined,
      }
    : undefined;

  return {
    success: true,
    work_item_id: workItemId,
    allocated_work_item_id: isCreateTransition && !args["work_item_id"] ? workItemId : undefined,
    workflow_type: finalWorkflowType,
    workflow_path: inheritedWorkflowPath,
    auto_work_item_json: isCreateTransition ? true : undefined,
    state_authority: "StateManager",
    workflow_engine_transition_full_used: false,
    candidate_manifest_materialization: publicCandidateManifestMaterialization,
    transition_result: transitionResult.transition_result,
  };
});
