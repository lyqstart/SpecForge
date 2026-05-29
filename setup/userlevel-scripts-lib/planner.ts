/**
 * SpecForge Installer Reconcile — Planner Module
 *
 * Generates a ReconcilePlan by applying the R14 decision matrix to each file
 * in the union of DesiredState and CurrentState keys.
 *
 * The decision matrix determines the action for each file based on three hash inputs:
 * - sourceHash: hash from the source directory (DesiredState)
 * - currentHash: hash from the target filesystem (CurrentState)
 * - manifestHash: hash recorded in the Deployed Manifest
 *
 * Requirements: 2.1, 2.2, 2.3, 14.1–14.11, 3.1
 */

import type {
  DecisionAction,
  ExecutableAction,
  FileDecision,
  FileReconcileInput,
  ManagedComponentType,
  PlanDiagnostics,
  PlanEntry,
  PlanSummary,
  ReconcilePlan,
} from "./types"
import { isCustomizable } from "./types"
import type { DesiredState } from "./discovery"
import type { CurrentState } from "./state"

// ============================================================
// Types
// ============================================================

export interface PlannerOptions {
  force: boolean
}

// ============================================================
// Decision Matrix (R14)
// ============================================================

/**
 * Apply the R14 decision matrix to a single FileReconcileInput.
 * Exported for direct testing of all R14 rules including R14.8.
 *
 * Priority ordering:
 * 1. R14.2: sourceHash defined, currentHash undefined → create
 * 2. R14.3: sourceHash === currentHash → skip
 * 3. R14.9: sourceHash ≠ currentHash, manifestHash undefined → update (PRIORITY over R14.5/R14.6)
 * 4. R14.4: sourceHash ≠ currentHash, currentHash === manifestHash → update
 * 5. R14.5: all three differ, customizable type → conflict (only when manifestHash defined)
 * 6. R14.6: all three differ, non-customizable type → update + tamper warning
 * 7. R14.7: sourceHash undefined, currentHash defined, managed → delete
 * 8. R14.8: sourceHash undefined, currentHash defined, non-managed → ignore
 * 9. R14.10: sourceHash undefined, currentHash undefined, manifestHash defined → skip (stale entry)
 * 10. R14.11: sourceHash undefined, currentHash undefined, manifestHash undefined → none
 */
export function decideAction(input: FileReconcileInput): FileDecision {
  const { relativePath, sourceHash, currentHash, manifestHash, componentType, isManagedComponent } = input

  // --- Case: sourceHash defined ---
  if (sourceHash !== undefined) {
    // R14.2: source exists, target does not → create
    if (currentHash === undefined) {
      return {
        relativePath,
        decision: "create",
        componentType,
        reason: "Source file exists but target does not (R14.2)",
      }
    }

    // R14.3: source === current → skip (no change needed)
    if (sourceHash === currentHash) {
      return {
        relativePath,
        decision: "skip",
        componentType,
        reason: "Source hash matches current hash, no update needed (R14.3)",
      }
    }

    // sourceHash ≠ currentHash from here on

    // R14.9: manifestHash undefined → update (takes priority over R14.5/R14.6)
    // Cannot determine if user customized without manifest reference
    if (manifestHash === undefined) {
      return {
        relativePath,
        decision: "update",
        componentType,
        reason: "Source differs from current, no manifest reference available — update without conflict (R14.9)",
      }
    }

    // R14.4: currentHash === manifestHash → safe update (user hasn't modified)
    if (currentHash === manifestHash) {
      return {
        relativePath,
        decision: "update",
        componentType,
        reason: "Source differs from current, current matches manifest — safe update (R14.4)",
      }
    }

    // All three differ (sourceHash ≠ currentHash ≠ manifestHash, manifestHash defined)
    // R14.5: customizable type → conflict
    if (isCustomizable(componentType)) {
      return {
        relativePath,
        decision: "conflict",
        componentType,
        reason: "All three hashes differ, customizable type — user customization detected (R14.5)",
      }
    }

    // R14.6: non-customizable type → update + tamper warning
    return {
      relativePath,
      decision: "update",
      componentType,
      reason: "All three hashes differ, non-customizable type — tamper or corruption detected (R14.6)",
      tamperWarning: true,
    }
  }

  // --- Case: sourceHash undefined (file not in DesiredState) ---

  // R14.7 / R14.8: currentHash defined
  if (currentHash !== undefined) {
    // R14.7: managed component → delete (orphan)
    if (isManagedComponent) {
      return {
        relativePath,
        decision: "delete",
        componentType,
        reason: "File not in desired state but exists as managed component — orphan delete (R14.7)",
      }
    }

    // R14.8: non-managed → ignore
    return {
      relativePath,
      decision: "ignore",
      componentType,
      reason: "File not in desired state and not managed — ignored (R14.8)",
    }
  }

  // --- Case: sourceHash undefined, currentHash undefined ---

  // R14.10: manifestHash defined → skip + stale entry removal
  if (manifestHash !== undefined) {
    return {
      relativePath,
      decision: "skip",
      componentType,
      reason: "No source, no file on disk, but stale manifest entry — skip and remove entry (R14.10)",
    }
  }

  // R14.11: all undefined → no action
  return {
    relativePath,
    decision: "none",
    componentType,
    reason: "No source, no file, no manifest entry — no action (R14.11)",
  }
}

// ============================================================
// Plan Generation
// ============================================================

/**
 * Build FileReconcileInput[] from the union of desired and current state keys.
 *
 * All entries in DesiredState are managed (source has them).
 * All entries in CurrentState are managed (state module only includes managed files:
 * manifest entries + sf-/sf_ prefix scan results).
 *
 * Therefore isManagedComponent is true for all entries in the union.
 * R14.8 (ignore non-managed) is a safety net handled by decideAction but
 * cannot trigger through normal generatePlan usage.
 */
export function buildReconcileInputs(
  desired: DesiredState,
  current: CurrentState,
): FileReconcileInput[] {
  const allKeys = new Set<string>()

  for (const key of desired.entries.keys()) {
    allKeys.add(key)
  }
  for (const key of current.entries.keys()) {
    allKeys.add(key)
  }

  const inputs: FileReconcileInput[] = []

  for (const relativePath of allKeys) {
    const desiredEntry = desired.entries.get(relativePath)
    const currentEntry = current.entries.get(relativePath)

    const sourceHash = desiredEntry?.sourceHash
    const currentHash = currentEntry?.currentHash
    const manifestHash = currentEntry?.manifestHash
    const componentType: ManagedComponentType =
      desiredEntry?.componentType ?? currentEntry?.componentType ?? "tool"

    // All entries in the union are managed:
    // - DesiredState entries: always managed (source has them)
    // - CurrentState entries: always managed (state module only includes
    //   manifest entries + sf-/sf_ prefix scan results)
    const isManagedComponent = true

    inputs.push({
      relativePath,
      sourceHash,
      currentHash,
      manifestHash,
      componentType,
      isManagedComponent,
    })
  }

  return inputs
}

/**
 * Check if a DecisionAction is executable (enters the plan entries).
 * "ignore" and "none" do NOT enter plan entries — they go to diagnostics only.
 */
function isExecutableAction(action: DecisionAction): action is ExecutableAction {
  return action !== "ignore" && action !== "none"
}

/**
 * Generate a ReconcilePlan from DesiredState and CurrentState using the R14 decision matrix.
 *
 * Steps:
 * 1. Build FileReconcileInput[] from union(desired.keys, current.keys)
 * 2. Apply R14 decision matrix to each input
 * 3. Handle force flag: resolve conflicts to updates
 * 4. Separate executable actions from diagnostics-only actions
 * 5. Compute PlanSummary counts
 *
 * Requirements: 2.1, 2.2, 2.3, 14.1–14.11, 3.1
 */
export function generatePlan(
  desired: DesiredState,
  current: CurrentState,
  options: PlannerOptions,
): ReconcilePlan {
  const inputs = buildReconcileInputs(desired, current)

  const allDecisions: FileDecision[] = []
  const ignored: FileDecision[] = []
  const noAction: FileDecision[] = []
  const entries: PlanEntry[] = []

  const summary: PlanSummary = {
    create: 0,
    update: 0,
    delete: 0,
    skip: 0,
    conflict: 0,
  }

  for (const input of inputs) {
    let decision = decideAction(input)

    // Handle force flag: resolve conflicts to updates
    if (decision.decision === "conflict" && options.force) {
      decision = {
        ...decision,
        decision: "update",
        reason: `${decision.reason} — resolved to update by --force flag`,
      }
    }

    // Record in allDecisions for diagnostics
    allDecisions.push(decision)

    // Route to diagnostics-only or executable plan
    if (decision.decision === "ignore") {
      ignored.push(decision)
    } else if (decision.decision === "none") {
      noAction.push(decision)
    } else {
      // Executable action — create PlanEntry
      const action = decision.decision as ExecutableAction
      summary[action]++

      const desiredEntry = desired.entries.get(input.relativePath)

      const planEntry: PlanEntry = {
        relativePath: input.relativePath,
        action,
        componentType: decision.componentType,
        reason: decision.reason,
      }

      // Attach sourceHash for create/update actions
      if ((action === "create" || action === "update") && desiredEntry) {
        planEntry.sourceHash = desiredEntry.sourceHash
      }

      // Attach currentHash for conflict actions
      if (action === "conflict" && input.currentHash !== undefined) {
        planEntry.currentHash = input.currentHash
      }

      // Attach tamperWarning flag
      if (decision.tamperWarning) {
        planEntry.tamperWarning = true
      }

      entries.push(planEntry)
    }
  }

  const diagnostics: PlanDiagnostics = {
    allDecisions,
    ignored,
    noAction,
  }

  return {
    entries,
    summary,
    diagnostics,
  }
}
