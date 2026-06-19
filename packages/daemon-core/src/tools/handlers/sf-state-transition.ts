import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { registerHandler } from "../ToolDispatcher";
import { SPEC_DIR_NAME } from "@specforge/types/directory-layout";
import { join } from "node:path";
import {
  isValidV11Transition,
  isForbiddenTransition,
  WI_STATUSES_V11,
  checkCloseGateEvidenceRequirements,
} from "../lib/state-machine-v11";
import { WORKFLOW_PATH_TO_TYPE, type WorkflowPath } from "../lib/state_machine";
import { isSealTransition, getSealTransition } from "@specforge/types/seal-transitions";
import {
  validateWorkItemId,
  parseWorkItemSequence,
  formatWorkItemId,
} from "../lib/work-item-id-validator";
import { guardHardStop } from "../lib/hard-stop-latch";
import { transitionWithEvidence } from "../lib/state-coordinator-v11";

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

async function readJsonIfExists<T = any>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8")) as T;
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
    join(wiDir, "work_item.json"),
    join(wiDir, "trigger_result.json"),
    join(wiDir, "candidate_manifest.json"),
    join(projectRoot, SPEC_DIR_NAME, "runtime", "state.json"),
  ];

  for (const filePath of candidates) {
    const json = await readJsonIfExists<any>(filePath);
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

async function ensureWorkItemJsonOnCreate(
  projectRoot: string,
  workItemId: string,
  workflowType: string | undefined,
  workflowPath: string | undefined,
): Promise<{ path: string; created: boolean }> {
  const wiDir = join(projectRoot, SPEC_DIR_NAME, "work-items", workItemId);
  await mkdir(wiDir, { recursive: true });

  const workItemJsonPath = join(wiDir, "work_item.json");
  const existing = await readJsonIfExists(workItemJsonPath);
  if (existing) return { path: workItemJsonPath, created: false };

  const now = new Date().toISOString();
  const workItem = {
    schema_version: "1.1",
    work_item_id: workItemId,

    // Legacy display field only. Governance MUST NOT read this as authority.
    // It is kept short-term because schema_gate in v1.1 still checks the field.
    status: "created",

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
  return { path: workItemJsonPath, created: true };
}

/**
 * v1.1 state transition handler.
 *
 * V5 state authority alignment:
 * - This handler no longer calls workflowEngine.transitionFull().
 * - All durable state changes go through state-coordinator-v11 → StateManager.transition().
 * - WorkflowEngine's private in-memory instance map must not be a second state writer.
 */
registerHandler("sf_state_transition", async (args, context, deps) => {
  let workItemId = args["work_item_id"] as string | undefined;
  const fromState = ((args["from_state"] as string) ?? "");
  const toState = args["to_state"] as string;
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  if (!toState) {
    return { success: false, error: "to_state required" };
  }

  const isCreateTransition = fromState === "" && toState === "created";

  if ((!workItemId || workItemId.trim() === "") && isCreateTransition) {
    workItemId = await allocateNextWorkItemId(baseDir);
  }

  if (!workItemId) {
    return {
      success: false,
      error:
        "work_item_id required. For create transition, omit work_item_id to let daemon allocate WI-NNNN.",
      code: "WORK_ITEM_ID_REQUIRED",
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
  const existingWorkflowFacts = !isCreateTransition
    ? await readExistingWorkflowFacts(baseDir, workItemId)
    : {};

  const inheritedWorkflowPath = rawWorkflowPath ?? existingWorkflowFacts.workflowPath;
  let resolvedWorkflowType: string | undefined =
    rawWorkflowType ?? existingWorkflowFacts.workflowType;

  const useV11 =
    (args["use_v11_state_machine"] as boolean) ||
    !!inheritedWorkflowPath ||
    !!existingWorkflowFacts.workflowType ||
    isCreateTransition;

  if (inheritedWorkflowPath) {
    const mapped = WORKFLOW_PATH_TO_TYPE[inheritedWorkflowPath as WorkflowPath];
    if (!mapped) {
      return {
        success: false,
        error: `Unknown workflow_path: ${inheritedWorkflowPath}. Valid paths: ${Object.keys(
          WORKFLOW_PATH_TO_TYPE,
        ).join(", ")}`,
      };
    }

    // workflow_path is the source of truth for workflow type.
    resolvedWorkflowType = mapped;
  }

  if (useV11) {
    if (!(WI_STATUSES_V11 as readonly string[]).includes(toState)) {
      return {
        success: false,
        error: `Invalid v1.1 target state "${toState}". Valid states: ${(
          WI_STATUSES_V11 as readonly string[]
        ).join(", ")}`,
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
          error:
            "projectPath required for close gate evidence check — provide context.directory or context.worktree",
        };
      }

      const v11WorkItemDir = join(v11ProjectPath, SPEC_DIR_NAME, "work-items", workItemId);
      const evidenceResult = await checkCloseGateEvidenceRequirements(v11WorkItemDir);
      if (!evidenceResult.met) {
        return {
          success: false,
          error: `Close gate evidence requirements not met. Missing: ${evidenceResult.missing.join(
            ", ",
          )}. ${evidenceResult.descriptions.join("; ")}`,
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
      await ensureWorkItemJsonOnCreate(
        baseDir,
        workItemId,
        resolvedWorkflowType,
        inheritedWorkflowPath,
      );
    }
  }

  const projectPath = (context?.directory as string) || (context?.worktree as string) || "";
  if (!projectPath) {
    return {
      success: false,
      error: "projectPath required — provide context.directory or context.worktree",
    };
  }

  try {
    const transitionResult = await transitionWithEvidence({
      deps,
      context,
      projectRoot: projectPath,
      workItemId,
      workItemDir: join(projectPath, SPEC_DIR_NAME, "work-items", workItemId),
      fromState,
      toState,
      workflowType: resolvedWorkflowType || existingWorkflowFacts.workflowType || "quick_change",
      actorRole: typeof context?.agent === "string" ? context.agent : "system",
      evidence: (args["evidence"] as string) ?? "",
      transitionContext: args["transition_context"] as Record<string, unknown> | undefined,
    });

    return {
      success: true,
      work_item_id: workItemId,
      allocated_work_item_id: isCreateTransition && !args["work_item_id"] ? workItemId : undefined,
      workflow_type: resolvedWorkflowType || existingWorkflowFacts.workflowType || "quick_change",
      workflow_path: inheritedWorkflowPath,
      auto_work_item_json: isCreateTransition ? true : undefined,
      ...transitionResult,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
});
