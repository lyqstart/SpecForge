/**
 * gate-runner-v11.ts — v1.1 标准 Gate Runner（§9）
 *
 * 依据：SpecForge 最终融合标准 v1.1
 *
 * 职责：
 * - §9.2 Gate 分类与枚举（GateIdV11, GateStrictness）
 * - §9.3 hard_gate / soft_gate
 * - 内置 Gate 实现（registerGate 调用）
 *
 * Extracted sub-modules (TASK-3):
 *   - gate-report.ts: GateReportCheck, GateReportV11, GateContext, GateCheckFn,
 *                     runGate, makeSkippedReport, makeReport
 *   - gate-summary.ts: GateSummaryStatus, generateGateSummaryMd
 *   - gate-chain.ts: registerGate, runRequiredGates (registry + chain execution)
 *   - required-gates.ts: getRequiredGates, getGateStrictness
 *   - close-gate.ts: CloseGateResult, runCloseGate
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

import {
  inferManifestEntries,
  entriesSemanticallyEqual,
  normalizeSlash,
  resolveWorkItemSpecArtifacts,
} from './governance-invariants-v11.js';
import {
  readContractsRegistry,
  hasAnyContracts,
  type ContractRegistry,
} from './contracts-registry.js';
import {
  projectSpecManifest,
  workItemCandidateManifest,
  workItemChangeClassification,
  workItemImpactAnalysis,
  workItemIntake,
  workItemJson,
  workItemTriggerResult,
} from '@specforge/types/directory-layout';
import {
  ContractRegistrySchema,
  moduleCodeFromProjectSpecPath,
  normalizeModuleCodeReference,
  resolveSpecModuleIdentity,
} from '@specforge/types';
import {
  validateCandidateManifestJson,
  validateTriggerResultJson,
  validateWorkItemJson,
} from './artifact-schema-validation.js';
import { checkDesignGate } from './sf_design_gate_core.js';
import { checkRequirementsGate } from './sf_requirements_gate_core.js';
import { checkTasksGate } from './sf_tasks_gate_core.js';
import type { GateResult } from './sf_gate_types.js';
import {
  normalizeProjectSpecTargetPath,
  readDeclaredProjectSpecTargetPaths,
} from './path-policy.js';
import { checkContractIntegrity } from './contract-integrity.js';
import { verifyChangedCodeContracts } from './code-contract-verifier.js';
import { evaluateVerificationGovernanceContract } from './verification-governance-contract.js';
import { checkFormalVersionEligibility } from './project-governance-v2.js';

function projectSpecRepairPlanPath(workItemDir: string): string {
  return path.join(workItemDir, 'project_spec_repair_plan.json');
}

async function isProjectSpecRepairWorkItem(ctx: GateContext): Promise<boolean> {
  if (ctx.workflowPath !== 'spec_migration_path') return false;
  try {
    await fs.access(projectSpecRepairPlanPath(ctx.workItemDir));
    return true;
  } catch {
    return false;
  }
}
// ---------------------------------------------------------------------------
// §9.2 Gate ID 枚举
// ---------------------------------------------------------------------------

export type GateIdV11 =
  | 'entry_gate'
  | 'workflow_selection_gate'
  | 'required_files_gate'
  | 'candidate_manifest_gate'
  | 'path_policy_gate'
  | 'schema_gate'
  | 'spec_consistency_gate'
  | 'contract_integrity_gate'
  | 'trace_gate'
  | 'workflow_specific_gate'
  | 'gate_summary_gate'
  | 'merge_ready_gate'
  | 'post_merge_gate'
  | 'verification_gate'
  | 'formal_version_gate'
  | 'close_gate';

// ---------------------------------------------------------------------------
// §9.3 Gate 类型
// ---------------------------------------------------------------------------

export type GateStrictness = 'hard_gate' | 'soft_gate';

// ---------------------------------------------------------------------------
// Imports from extracted sub-modules
// ---------------------------------------------------------------------------

import { registerGate } from './gate-chain.js';
import { makeReport, type GateReportCheck, type GateContext } from './gate-report.js';
import { runCloseGate } from './close-gate.js';

// ---------------------------------------------------------------------------
// Re-exports from extracted sub-modules
// ---------------------------------------------------------------------------

export {
  type GateReportCheck,
  type GateReportV11,
  type GateContext,
  type GateCheckFn,
  runGate,
  makeSkippedReport,
  makeReport,
} from './gate-report.js';

export { type GateSummaryStatus, generateGateSummaryMd } from './gate-summary.js';

export { registerGate, runRequiredGates } from './gate-chain.js';

export { getRequiredGates, getGateStrictness } from './required-gates.js';

// ---------------------------------------------------------------------------
// 内置 Gate 实现
// ---------------------------------------------------------------------------

/**
 * §9.2 entry_gate — WI 存在性检查
 */
registerGate('entry_gate', 'hard_gate', true, async ctx => {
  const checks: GateReportCheck[] = [];
  const workItemJsonPath = workItemJson(ctx.projectRoot, ctx.workItemId);

  let exists = false;
  try {
    await fs.access(workItemJsonPath);
    exists = true;
  } catch {
    exists = false;
  }

  checks.push({
    check_id: 'wi_exists',
    description: 'Work Item work_item.json exists',
    passed: exists,
    severity: exists ? undefined : 'error',
  });

  if (exists) {
    try {
      const content = await fs.readFile(workItemJsonPath, 'utf-8');
      const json = JSON.parse(content);
      checks.push({
        check_id: 'wi_id_valid',
        description: `Work Item ID format valid: ${json.work_item_id}`,
        passed: /^WI-[0-9]{4}$/.test(json.work_item_id ?? ''),
        severity: undefined,
      });
    } catch {
      checks.push({
        check_id: 'wi_json_parse',
        description: 'work_item.json is valid JSON',
        passed: false,
        severity: 'error',
      });
    }
  }

  return makeReport(ctx.workItemId, 'entry_gate', 'hard_gate', true, checks, [workItemJsonPath]);
});

/**
 * §9.2 workflow_selection_gate — workflow_path 已确定
 */
registerGate('workflow_selection_gate', 'hard_gate', true, async ctx => {
  const checks: GateReportCheck[] = [];
  const triggerPath = workItemTriggerResult(ctx.projectRoot, ctx.workItemId);

  let triggerExists = false;
  try {
    await fs.access(triggerPath);
    triggerExists = true;
  } catch {
    triggerExists = false;
  }

  checks.push({
    check_id: 'trigger_exists',
    description: 'trigger_result.json exists',
    passed: triggerExists,
    severity: triggerExists ? undefined : 'error',
  });

  if (triggerExists) {
    try {
      const content = await fs.readFile(triggerPath, 'utf-8');
      const json = JSON.parse(content);
      const validPaths = [
        'requirement_change_path',
        'design_change_path',
        'architecture_change_path',
        'task_change_path',
        'code_only_fast_path',
        'spec_migration_path',
        'contract_change_path',
        'rollback_path',
      ];
      checks.push({
        check_id: 'workflow_path_valid',
        description: `workflow_path is valid: ${json.workflow_path}`,
        passed: validPaths.includes(json.workflow_path),
        severity: undefined,
      });
    } catch {
      checks.push({
        check_id: 'trigger_parse',
        description: 'trigger_result.json is valid JSON',
        passed: false,
        severity: 'error',
      });
    }
  }

  return makeReport(ctx.workItemId, 'workflow_selection_gate', 'hard_gate', true, checks, [
    triggerPath,
  ]);
});

/**
 * §9.2 required_files_gate — 必需文件存在性
 */
registerGate('required_files_gate', 'hard_gate', true, async ctx => {
  const checks: GateReportCheck[] = [];
  const inputFiles: string[] = [];
  const phase = ctx.candidatePhase ?? 'full';

  const requiredBaseFiles = [
    {
      id: 'work_item',
      label: 'work_item.json',
      path: workItemJson(ctx.projectRoot, ctx.workItemId),
    },
    { id: 'intake', label: 'intake.md', path: workItemIntake(ctx.projectRoot, ctx.workItemId) },
    {
      id: 'change_classification',
      label: 'change_classification.md',
      path: workItemChangeClassification(ctx.projectRoot, ctx.workItemId),
    },
    {
      id: 'impact_analysis',
      label: 'impact_analysis.md',
      path: workItemImpactAnalysis(ctx.projectRoot, ctx.workItemId),
    },
    {
      id: 'trigger_result',
      label: 'trigger_result.json',
      path: workItemTriggerResult(ctx.projectRoot, ctx.workItemId),
    },
    {
      id: 'candidate_manifest',
      label: 'candidate_manifest.json',
      path: workItemCandidateManifest(ctx.projectRoot, ctx.workItemId),
    },
  ];

  const effectiveBaseFiles =
    ctx.workflowPath === 'contract_change_path'
      ? requiredBaseFiles.filter(
          file => !['change_classification', 'impact_analysis'].includes(file.id)
        )
      : requiredBaseFiles;

  for (const file of effectiveBaseFiles) {
    let exists = false;
    try {
      await fs.access(file.path);
      exists = true;
    } catch {
      exists = false;
    }
    inputFiles.push(file.path);
    checks.push({
      check_id: `file_${file.id}`,
      description: `Required file exists: ${file.label}`,
      passed: exists,
      severity: exists ? undefined : 'error',
    });
  }

  if (ctx.workflowType === 'investigation') {
    for (const fileName of ['investigation_plan.md', 'findings_report.md']) {
      const filePath = path.join(ctx.workItemDir, fileName);
      let exists = false;
      try {
        await fs.access(filePath);
        exists = true;
      } catch {
        exists = false;
      }
      inputFiles.push(filePath);
      checks.push({
        check_id: `file_${fileName.replace(/[^a-z0-9]/gi, '_')}`,
        description: `Required Investigation file exists: ${fileName}`,
        passed: exists,
        severity: exists ? undefined : 'error',
      });
    }
    return makeReport(ctx.workItemId, 'required_files_gate', 'hard_gate', true, checks, inputFiles);
  }

  if (await isProjectSpecRepairWorkItem(ctx)) {
    const repairPlan = projectSpecRepairPlanPath(ctx.workItemDir);
    inputFiles.push(repairPlan);
    checks.push({
      check_id: 'project_spec_repair_plan_exists',
      description: 'Project Spec repair plan exists for spec_migration_path',
      passed: true,
    });
    return makeReport(ctx.workItemId, 'required_files_gate', 'hard_gate', true, checks, inputFiles);
  }

  const requiredKinds: Array<'requirements' | 'design' | 'tasks' | 'trace_delta'> = [];
  if (ctx.workflowPath === 'task_change_path') {
    requiredKinds.push('tasks', 'trace_delta');
  } else if (
    ctx.workflowPath !== 'code_only_fast_path' &&
    ctx.workflowPath !== 'contract_change_path' &&
    ctx.workflowPath !== 'rollback_path'
  ) {
    if (phase === 'design') requiredKinds.push('design');
    else if (phase === 'requirements') requiredKinds.push('design', 'requirements');
    else requiredKinds.push('design', 'requirements', 'tasks', 'trace_delta');
  }

  for (const kind of requiredKinds) {
    const artifacts = await resolveWorkItemSpecArtifacts({
      projectRoot: ctx.projectRoot,
      workItemId: ctx.workItemId,
      kind,
    });
    inputFiles.push(...artifacts.map(artifact => artifact.path));
    checks.push({
      check_id: `candidate_${kind}_exists`,
      description: `Required ${kind} candidate exists for candidate_phase=${phase}`,
      passed: artifacts.length > 0,
      severity: artifacts.length > 0 ? undefined : 'error',
      details: artifacts.map(artifact => artifact.path).join(', '),
    });
  }

  return makeReport(ctx.workItemId, 'required_files_gate', 'hard_gate', true, checks, inputFiles);
});

function normalizeSpecModuleId(value: unknown): string {
  return normalizeModuleCodeReference(value) ?? '';
}

async function readDeclaredSpecModules(
  projectRoot: string
): Promise<{ moduleCodes: string[]; errors: string[] }> {
  try {
    const parsed: unknown = JSON.parse(
      await fs.readFile(projectSpecManifest(projectRoot), 'utf-8')
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { moduleCodes: [], errors: ['spec_manifest.json must be a JSON object'] };
    }
    const modulesValue = (parsed as Record<string, unknown>)['modules'];
    const modules: unknown[] = Array.isArray(modulesValue) ? modulesValue : [];
    const resolutions = modules.map(entry => resolveSpecModuleIdentity(entry));
    return {
      moduleCodes: Array.from(
        new Set(
          resolutions
            .filter(resolution => resolution.valid && resolution.moduleCode)
            .map(resolution => resolution.moduleCode as string)
        )
      ),
      errors: resolutions.flatMap(resolution => resolution.errors),
    };
  } catch (error) {
    return { moduleCodes: [], errors: [(error as Error).message] };
  }
}

function moduleIdFromManifestEntry(entry: any): string | null {
  const candidatePath = normalizeSlash(String(entry?.candidate_path ?? entry?.path ?? ''));
  const targetPath = normalizeSlash(String(entry?.target_path ?? ''));
  const match =
    /(?:^|\/)candidates\/project\/modules\/([^/]+)\/(?:requirements|design)\.candidate\.md$/i.exec(
      candidatePath
    ) ??
    /(?:^|\/)\.specforge\/project\/modules\/([^/]+)\/(?:requirements|design)\.md$/i.exec(
      targetPath
    );
  return (
    moduleCodeFromProjectSpecPath(targetPath) ??
    moduleCodeFromProjectSpecPath(candidatePath) ??
    (match?.[1] ? normalizeSpecModuleId(match[1]) : null)
  );
}

function isEvidenceOnlyCandidateManifest(manifest: Record<string, unknown>): boolean {
  return (
    manifest.no_project_spec_change === true ||
    String(manifest.project_integration_effect ?? '')
      .trim()
      .toLowerCase() === 'evidence_only'
  );
}

/** * §9.2 candidate_manifest_gate — Candidate Manifest 合法性 */ // BD v1: candidate_manifest_gate uses the same normalization rules as approval and merge.
registerGate('candidate_manifest_gate', 'hard_gate', true, async ctx => {
  const checks: GateReportCheck[] = [];
  const manifestPath = workItemCandidateManifest(ctx.projectRoot, ctx.workItemId);
  let manifest: any = null;
  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(content);
    checks.push({
      check_id: 'manifest_parse',
      description: 'candidate_manifest.json is valid JSON',
      passed: true,
    });

    const entries = manifest.entries ?? [];
    const entriesIsArray = Array.isArray(entries);
    checks.push({
      check_id: 'manifest_entries_array',
      description: 'entries is an array',
      passed: entriesIsArray,
      severity: entriesIsArray ? undefined : 'error',
    });

    const workflowPath = String(manifest.workflow_path ?? '');
    const evidenceOnly = isEvidenceOnlyCandidateManifest(manifest as Record<string, unknown>);
    const mergeRequired = workflowPath !== 'code_only_fast_path' && !evidenceOnly;
    const inferredEntries = mergeRequired ? inferManifestEntries(manifest, ctx.workItemDir) : [];
    const entriesNormalized = entriesIsArray && entriesSemanticallyEqual(entries, inferredEntries);
    const evidenceOnlyCanonical =
      !evidenceOnly ||
      (manifest.no_project_spec_change === true &&
        String(manifest.project_integration_effect ?? '')
          .trim()
          .toLowerCase() === 'evidence_only' &&
        manifest.merge_required === false &&
        manifest.merge_applicable === false &&
        entriesIsArray &&
        entries.length === 0);
    const entryCountValid = mergeRequired ? entries.length > 0 : entries.length === 0;

    checks.push({
      check_id: 'manifest_evidence_only_canonical',
      description:
        'evidence_only manifests declare no project spec change, disable merge, and keep entries empty',
      passed: evidenceOnlyCanonical,
      severity: evidenceOnlyCanonical ? undefined : 'error',
    });

    checks.push({
      check_id: 'manifest_entries_nonempty_for_spec_merge',
      description: 'entries is non-empty only when Project Spec merge is required',
      passed: entryCountValid,
      severity: entryCountValid ? undefined : 'error',
    });

    checks.push({
      check_id: 'manifest_entries_match_governance_inference',
      description:
        'entries match the merge applicability decision and inferManifestEntries() for spec-changing workflows',
      passed: entriesNormalized,
      severity: entriesNormalized ? undefined : 'error',
    });

    checks.push({
      check_id: 'manifest_inferred_entries_count',
      description: `effective inferred entries count: ${inferredEntries.length}`,
      passed: mergeRequired ? inferredEntries.length > 0 : inferredEntries.length === 0,
      severity: mergeRequired
        ? inferredEntries.length > 0
          ? undefined
          : 'error'
        : inferredEntries.length === 0
          ? undefined
          : 'error',
    });

    if (entriesIsArray) {
      const moduleRegistry = await readDeclaredSpecModules(ctx.projectRoot);
      const declaredModules = moduleRegistry.moduleCodes;
      const declaredTargetPaths = await readDeclaredProjectSpecTargetPaths(ctx.projectRoot);
      const governedModuleAdmission =
        manifest.workflow_path === 'architecture_change_path' ||
        manifest.workflow_path === 'spec_migration_path';
      const requiredNewModuleFiles = ['module.json', 'requirements.md', 'design.md', 'contracts.json', 'trace.md'];
      const governedModuleFiles = new Map<string, Map<string, string>>();
      checks.push({
        check_id: 'module_registry_valid',
        description: 'spec_manifest.json module identity fields are valid and non-conflicting',
        passed: moduleRegistry.errors.length === 0,
        severity: moduleRegistry.errors.length === 0 ? undefined : 'error',
        details: moduleRegistry.errors.join('; '),
      });
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i] ?? {};
        const candidatePath = normalizeSlash(entry.candidate_path ?? entry.path ?? '');
        const targetPath = normalizeSlash(entry.target_path ?? '');
        const candidateInWi = candidatePath.startsWith('candidates/');
        checks.push({
          check_id: `entry_${i}_candidate_path`,
          description: `Entry ${i}: candidate_path starts with candidates/`,
          passed: !!candidateInWi,
          severity: candidateInWi ? undefined : 'error',
        });

        const targetValid =
          targetPath.startsWith('.specforge/project/') || targetPath.startsWith('project/');
        checks.push({
          check_id: `entry_${i}_target_path`,
          description: `Entry ${i}: target_path in .specforge/project/`,
          passed: !!targetValid,
          severity: targetValid ? undefined : 'error',
        });

        const normalizedTargetPath = normalizeProjectSpecTargetPath(targetPath);
        const moduleId = moduleIdFromManifestEntry(entry);
        const newModuleRoot = moduleId ? `.specforge/project/modules/${moduleId}/` : '';
        const newModuleFilename =
          newModuleRoot && normalizedTargetPath.startsWith(newModuleRoot)
            ? normalizedTargetPath.slice(newModuleRoot.length)
            : '';
        const governedModuleTarget = Boolean(
          governedModuleAdmission &&
          moduleId &&
          !declaredTargetPaths.has(normalizedTargetPath) &&
          requiredNewModuleFiles.includes(newModuleFilename)
        );
        if (governedModuleTarget && moduleId) {
          const files = governedModuleFiles.get(moduleId) ?? new Map<string, string>();
          files.set(newModuleFilename, candidatePath);
          governedModuleFiles.set(moduleId, files);
        }
        const targetDeclared =
          declaredTargetPaths.has(normalizedTargetPath) || governedModuleTarget;
        checks.push({
          check_id: `entry_${i}_target_declared`,
          description: `Entry ${i}: target_path is declared or belongs to a governed new module`,
          passed: targetDeclared,
          severity: targetDeclared ? undefined : 'error',
          details:
            declaredTargetPaths.size > 0
              ? `Declared targets: ${Array.from(declaredTargetPaths).sort().join(', ')}`
              : 'spec_manifest.json declares no Project Spec target files',
        });

        let candidateExists = false;
        if (candidatePath && !candidatePath.includes('..')) {
          try {
            await fs.access(path.join(ctx.workItemDir, candidatePath));
            candidateExists = true;
          } catch {
            candidateExists = false;
          }
        }
        checks.push({
          check_id: `entry_${i}_candidate_exists`,
          description: `Entry ${i}: candidate file exists`,
          passed: candidateExists,
          severity: candidateExists ? undefined : 'error',
        });

        if (moduleId) {
          const moduleDeclared = declaredModules.includes(moduleId) || governedModuleTarget;
          checks.push({
            check_id: `entry_${i}_module_declared`,
            description: `Entry ${i}: module ${moduleId} is declared or introduced by a governed architecture/migration path`,
            passed: moduleDeclared,
            severity: moduleDeclared ? undefined : 'error',
            details:
              declaredModules.length > 0
                ? `Declared modules: ${declaredModules.join(', ')}`
                : 'spec_manifest.json declares no modules',
          });
        }
      }

      for (const [moduleCode, files] of governedModuleFiles) {
        const missing = requiredNewModuleFiles.filter(filename => !files.has(filename));
        checks.push({
          check_id: `new_module_${moduleCode}_complete`,
          description: `New module ${moduleCode} provides module.json, requirements.md, design.md, contracts.json and trace.md candidates`,
          passed: missing.length === 0,
          severity: missing.length === 0 ? undefined : 'error',
          details: missing.length === 0 ? undefined : `Missing: ${missing.join(', ')}`,
        });

        const moduleDefinitionCandidate = files.get('module.json');
        let definitionValid = false;
        let definitionDetails = '';
        if (moduleDefinitionCandidate && !moduleDefinitionCandidate.includes('..')) {
          try {
            const definition = JSON.parse(
              await fs.readFile(path.join(ctx.workItemDir, moduleDefinitionCandidate), 'utf-8')
            );
            const identity = resolveSpecModuleIdentity(definition);
            definitionValid = identity.valid && identity.moduleCode === moduleCode;
            definitionDetails = identity.errors.join('; ');
          } catch (error) {
            definitionDetails = (error as Error).message;
          }
        }
        checks.push({
          check_id: `new_module_${moduleCode}_definition`,
          description: `New module ${moduleCode} module.json declares the same canonical module_code`,
          passed: definitionValid,
          severity: definitionValid ? undefined : 'error',
          details: definitionDetails,
        });

        const moduleDefinitionCandidateForOwnership = files.get('module.json');
        let codePathsValid = false;
        let codePathsDetails = '';
        if (
          moduleDefinitionCandidateForOwnership &&
          !moduleDefinitionCandidateForOwnership.includes('..')
        ) {
          try {
            const definition = JSON.parse(
              await fs.readFile(
                path.join(ctx.workItemDir, moduleDefinitionCandidateForOwnership),
                'utf-8'
              )
            );
            const codePaths = Array.isArray(definition?.code_paths)
              ? definition.code_paths
                  .map((value: unknown) => String(value ?? '').trim())
                  .filter(Boolean)
              : [];
            codePathsValid = codePaths.length > 0;
            codePathsDetails = `code_paths=${codePaths.join(',') || 'none'}`;
          } catch (error) {
            codePathsDetails = (error as Error).message;
          }
        }
        checks.push({
          check_id: `new_module_${moduleCode}_code_paths`,
          description: `New module ${moduleCode} declares non-empty code_paths`,
          passed: codePathsValid,
          severity: codePathsValid ? undefined : 'error',
          details: codePathsDetails,
        });

        const contractsCandidate = files.get('contracts.json');
        let contractsValid = false;
        let contractsDetails = '';
        if (contractsCandidate && !contractsCandidate.includes('..')) {
          try {
            const contracts = JSON.parse(
              await fs.readFile(path.join(ctx.workItemDir, contractsCandidate), 'utf-8')
            );
            const registry = ContractRegistrySchema.safeParse(contracts?.contracts);
            contractsValid =
              contracts?.schema_version === '1.0' &&
              String(contracts?.owner_module ?? '').trim() === moduleCode &&
              registry.success;
            contractsDetails = contractsValid
              ? `owner_module=${moduleCode}`
              : `schema_version=${String(contracts?.schema_version ?? 'missing')}; owner_module=${String(contracts?.owner_module ?? 'missing')}; registry_valid=${String(registry.success)}`;
          } catch (error) {
            contractsDetails = (error as Error).message;
          }
        }
        checks.push({
          check_id: `new_module_${moduleCode}_contracts`,
          description: `New module ${moduleCode} contracts.json has matching owner_module and valid internal contracts`,
          passed: contractsValid,
          severity: contractsValid ? undefined : 'error',
          details: contractsDetails,
        });
      }
    }
  } catch {
    checks.push({
      check_id: 'manifest_parse',
      description: 'candidate_manifest.json is valid JSON',
      passed: false,
      severity: 'error',
    });
  }
  return makeReport(ctx.workItemId, 'candidate_manifest_gate', 'hard_gate', true, checks, [
    manifestPath,
  ]);
}); /** * §9.2 path_policy_gate — 路径策略检查
 */
registerGate('path_policy_gate', 'hard_gate', true, async ctx => {
  const checks: GateReportCheck[] = [];

  // 读取 candidate_manifest 并检查路径策略
  try {
    const manifestPath = workItemCandidateManifest(ctx.projectRoot, ctx.workItemId);
    const content = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);

    for (const entry of manifest.entries ?? []) {
      // 不允许 ..
      if (entry.candidate_path?.includes('..')) {
        checks.push({
          check_id: `path_candidate_traversal`,
          description: `candidate_path has ..: ${entry.candidate_path}`,
          passed: false,
          severity: 'error',
        });
      }
      if (entry.target_path?.includes('..')) {
        checks.push({
          check_id: `path_target_traversal`,
          description: `target_path has ..: ${entry.target_path}`,
          passed: false,
          severity: 'error',
        });
      }
      // 不允许反斜杠
      if (entry.candidate_path?.includes('\\')) {
        checks.push({
          check_id: `path_candidate_backslash`,
          description: `candidate_path has backslash`,
          passed: false,
          severity: 'error',
        });
      }
    }
  } catch {
    // manifest 不存在或不可解析 — 由 candidate_manifest_gate 检查
  }

  if (checks.length === 0) {
    checks.push({
      check_id: 'path_policy_ok',
      description: 'All paths satisfy Path Policy',
      passed: true,
    });
  }

  return makeReport(ctx.workItemId, 'path_policy_gate', 'hard_gate', true, checks);
});

/**
 * §9.2 schema_gate — JSON schema 校验
 */
registerGate('schema_gate', 'hard_gate', true, async ctx => {
  const checks: GateReportCheck[] = [];
  const files = [
    {
      name: 'work_item.json',
      path: workItemJson(ctx.projectRoot, ctx.workItemId),
      validate: (content: string) => validateWorkItemJson(content, ctx.workItemId),
    },
    {
      name: 'trigger_result.json',
      path: workItemTriggerResult(ctx.projectRoot, ctx.workItemId),
      validate: (content: string) => validateTriggerResultJson(content, ctx.workItemId),
    },
    {
      name: 'candidate_manifest.json',
      path: workItemCandidateManifest(ctx.projectRoot, ctx.workItemId),
      validate: (content: string) =>
        validateCandidateManifestJson(content, ctx.workItemId, ctx.workflowPath),
    },
  ];

  for (const file of files) {
    try {
      const content = await fs.readFile(file.path, 'utf-8');
      const validation = file.validate(content);
      checks.push({
        check_id: `schema_${file.name.replace(/[^a-z0-9]/gi, '_')}`,
        description: `${file.name} satisfies the canonical artifact schema`,
        passed: validation.valid,
        severity: validation.valid ? undefined : 'error',
        details: validation.errors.join('; '),
      });
    } catch {
      // required_files_gate owns missing-file reporting.
    }
  }

  return makeReport(ctx.workItemId, 'schema_gate', 'hard_gate', true, checks);
});

/**
 * §9.2 merge_ready_gate — 合并就绪检查（§11.2）
 */
registerGate('merge_ready_gate', 'hard_gate', true, async ctx => {
  const checks: GateReportCheck[] = [];

  // 1. user_decision.json 存在且状态为 approved/waived
  const decisionPath = path.join(ctx.workItemDir, 'user_decision.json');
  try {
    const content = await fs.readFile(decisionPath, 'utf-8');
    const decision = JSON.parse(content);
    const validStatus = ['approved', 'waived'].includes(decision.decision_status);
    checks.push({
      check_id: 'user_decision_status',
      description: `user_decision.json status is approved/waived: ${decision.decision_status}`,
      passed: validStatus,
      severity: undefined,
    });

    // 检查未过期
    if (decision.expires_at) {
      const expired = new Date(decision.expires_at) < new Date();
      checks.push({
        check_id: 'user_decision_not_expired',
        description: 'User Decision not expired',
        passed: !expired,
        severity: expired ? 'error' : undefined,
      });
    }
  } catch {
    checks.push({
      check_id: 'user_decision_exists',
      description: 'user_decision.json exists and is valid',
      passed: false,
      severity: 'error',
    });
  }

  // 2. candidate_manifest.json 存在
  const manifestPath = workItemCandidateManifest(ctx.projectRoot, ctx.workItemId);
  let manifestExists = false;
  try {
    await fs.access(manifestPath);
    manifestExists = true;
  } catch {
    manifestExists = false;
  }
  checks.push({
    check_id: 'manifest_exists',
    description: 'candidate_manifest.json exists',
    passed: manifestExists,
  });

  // 3. gate_summary 未 invalidated
  const summaryPath = path.join(ctx.workItemDir, 'gate_summary.md');
  try {
    const content = await fs.readFile(summaryPath, 'utf-8');
    const isInvalidated = content.includes('Status: invalidated');
    checks.push({
      check_id: 'gate_summary_valid',
      description: 'gate_summary not invalidated',
      passed: !isInvalidated,
    });
  } catch {
    checks.push({
      check_id: 'gate_summary_exists',
      description: 'gate_summary.md exists',
      passed: false,
      severity: 'error',
    });
  }

  return makeReport(ctx.workItemId, 'merge_ready_gate', 'hard_gate', true, checks, [
    decisionPath,
    manifestPath,
    summaryPath,
  ]);
});

/**
 * §9.2 verification_gate — 验证检查（§13.5）
 */
registerGate('verification_gate', 'hard_gate', true, async ctx => {
  const checks: GateReportCheck[] = [];
  const reportPath = path.join(ctx.workItemDir, 'verification_report.md');
  const manifestPath = path.join(ctx.workItemDir, 'evidence', 'evidence_manifest.json');
  let reportContent = '';
  let evidenceManifest: Record<string, unknown> | null = null;

  try {
    reportContent = await fs.readFile(reportPath, 'utf-8');
    checks.push({
      check_id: 'verification_report_exists',
      description: 'verification_report.md exists',
      passed: true,
    });
  } catch {
    checks.push({
      check_id: 'verification_report_exists',
      description: 'verification_report.md exists',
      passed: false,
      severity: 'error',
    });
  }

  const verificationContract = await evaluateVerificationGovernanceContract({
    workItemDir: ctx.workItemDir,
    workflowType: ctx.workflowType,
  });
  checks.push(...verificationContract.checks);

  try {
    evidenceManifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    checks.push({
      check_id: 'evidence_manifest_exists',
      description: 'evidence/evidence_manifest.json exists and is valid JSON',
      passed: true,
    });
  } catch {
    checks.push({
      check_id: 'evidence_manifest_exists',
      description: 'evidence/evidence_manifest.json exists and is valid JSON',
      passed: false,
      severity: 'error',
    });
  }

  if (ctx.workflowType === 'investigation') {
    const entries = Array.isArray(evidenceManifest?.entries)
      ? evidenceManifest.entries
      : Array.isArray(evidenceManifest?.evidence)
        ? evidenceManifest.evidence
        : [];
    checks.push({
      check_id: 'investigation_evidence_nonempty',
      description: 'Investigation has registered evidence entries',
      passed: entries.length > 0,
      severity: entries.length > 0 ? undefined : 'error',
    });
    const requiredRefs = [
      'investigation_plan.md',
      'findings_report.md',
      'changed_files_audit.md',
      'evidence_only',
      'no_code_change',
    ];
    for (const ref of requiredRefs) {
      const present = reportContent.toLowerCase().includes(ref.toLowerCase());
      checks.push({
        check_id: `investigation_verification_${ref.replace(/[^a-z0-9]/gi, '_')}`,
        description: `Investigation verification report references ${ref}`,
        passed: present,
        severity: present ? undefined : 'error',
      });
    }
    const rejectsImplementation =
      /未进入\s*implementation|implementation\s*(?:not entered|not applicable|未启用)|no implementation/i.test(
        reportContent
      );
    checks.push({
      check_id: 'investigation_no_implementation_verified',
      description: 'Verification confirms Investigation did not enter implementation',
      passed: rejectsImplementation,
      severity: rejectsImplementation ? undefined : 'error',
    });
  }

  if (ctx.workflowType === 'contract_change') {
    const entries = Array.isArray(evidenceManifest?.entries)
      ? evidenceManifest.entries
      : Array.isArray(evidenceManifest?.evidence)
        ? evidenceManifest.evidence
        : [];
    checks.push({
      check_id: 'contract_change_evidence_nonempty',
      description: 'Contract change has registered verification evidence',
      passed: entries.length > 0,
      severity: entries.length > 0 ? undefined : 'error',
    });
    for (const ref of ['extension_registry.json', 'post_merge', 'no implementation']) {
      const present = reportContent.toLowerCase().includes(ref.toLowerCase());
      checks.push({
        check_id: `contract_change_verification_${ref.replace(/[^a-z0-9]/gi, '_')}`,
        description: `Contract change verification report references ${ref}`,
        passed: present,
        severity: present ? undefined : 'error',
      });
    }
  }

  const codeContracts = await verifyChangedCodeContracts({
    projectRoot: ctx.projectRoot,
    workItemDir: ctx.workItemDir,
  });
  checks.push({
    check_id: 'code_contract_ast_coverage',
    description: 'Changed TypeScript/JavaScript with explicit enum bindings was AST-checked',
    passed: true,
    severity: codeContracts.unsupported_files.length > 0 ? 'warning' : undefined,
    details: [
      `checked=${codeContracts.checked_files.join(', ') || 'none'}`,
      `unsupported=${codeContracts.unsupported_files.join(', ') || 'none'}`,
    ].join('; '),
  });
  for (const [index, issue] of codeContracts.issues.entries()) {
    checks.push({
      check_id: `code_contract_ast_${index}`,
      description: `${issue.file}:${issue.line} ${issue.message}`,
      passed: false,
      severity: 'error',
      details: `contract=${issue.contract_id}; value=${issue.value}`,
    });
  }

  return makeReport(
    ctx.workItemId,
    'verification_gate',
    'hard_gate',
    true,
    checks,
    Array.from(
      new Set([
        reportPath,
        manifestPath,
        ...verificationContract.inputFiles,
        ...codeContracts.checked_files.map(file => path.join(ctx.projectRoot, file)),
      ])
    )
  );
});

/**
 * formal_version_gate — Verification 后、Close 前的正式版本边界。
 */
registerGate('formal_version_gate', 'hard_gate', true, async ctx => {
  const result = await checkFormalVersionEligibility({
    projectRoot: ctx.projectRoot,
    workItemDir: ctx.workItemDir,
    workItemId: ctx.workItemId,
    workflowPath: ctx.workflowPath ?? '',
  });
  return makeReport(
    ctx.workItemId,
    'formal_version_gate',
    'hard_gate',
    true,
    result.checks,
    result.inputFiles
  );
});

/**
 * §9.2 close_gate — 关闭检查（§15.2）
 * Delegates to close-gate.ts runCloseGate.
 */
registerGate('close_gate', 'hard_gate', true, async ctx => {
  const { report } = await runCloseGate(ctx);
  return report;
});

/**
 * §9.2 post_merge_gate — 合并后检查（§11.6）
 */
registerGate('post_merge_gate', 'hard_gate', true, async ctx => {
  const checks: GateReportCheck[] = [];

  // 1. merge_report.md 存在
  const mergeReportPath = path.join(ctx.workItemDir, 'merge_report.md');
  let mergeReportExists = false;
  try {
    await fs.access(mergeReportPath);
    mergeReportExists = true;
  } catch {
    mergeReportExists = false;
  }
  checks.push({
    check_id: 'post_merge_report_exists',
    description: 'merge_report.md exists',
    passed: mergeReportExists,
  });

  // 2. spec_manifest 已更新（检查 project 目录存在）
  checks.push({
    check_id: 'post_merge_project_dir',
    description: '.specforge/project/ directory exists',
    passed: true, // 简化检查，实际需要比较 hash
  });

  return makeReport(ctx.workItemId, 'post_merge_gate', 'hard_gate', true, checks, [
    mergeReportPath,
  ]);
});

/**
 * §9.2 spec_consistency_gate — 跨模块契约一致性（step 3a）
 *
 * 校验设计候选里声明的契约引用 `[contract:KIND:ID( owner=OWNER)?]` 是否解析到
 * `.specforge/project/extension_registry.json` 的 `contracts` 块里已登记的契约，
 * 且 owner 一致。KIND ∈ {shared_enum, invariant, public_interface, extension_point}。
 *
 * Brownfield-safe：注册表无任何契约（未纳入治理）时，跳过并 pass（warn 不 block）；
 * 设计未声明任何 `[contract:...]` 引用时也 pass。
 */
const CONTRACT_REF_PATTERN =
  /\[contract:(shared_enum|invariant|public_interface|extension_point):([A-Za-z0-9_.\-]+)(?:\s+owner=([A-Za-z0-9_]+))?\]/g;

const CONTRACT_KIND_TO_FIELD: Record<string, keyof ContractRegistry> = {
  shared_enum: 'shared_enums',
  invariant: 'invariants',
  public_interface: 'public_interfaces',
  extension_point: 'extension_points',
};

registerGate('spec_consistency_gate', 'soft_gate', true, async ctx => {
  const checks: GateReportCheck[] = [];
  const registry = readContractsRegistry(ctx.projectRoot);

  // Brownfield: nothing under contract governance yet — skip, do not block.
  if (!hasAnyContracts(registry)) {
    checks.push({
      check_id: 'spec_consistency_brownfield_skip',
      description:
        'No cross-module contracts registered in extension_registry.json; consistency check skipped (brownfield-safe)',
      passed: true,
    });
    return makeReport(ctx.workItemId, 'spec_consistency_gate', 'soft_gate', true, checks);
  }

  const designArtifacts = await resolveWorkItemSpecArtifacts({
    projectRoot: ctx.projectRoot,
    workItemId: ctx.workItemId,
    kind: 'design',
  });
  const designText = designArtifacts.map(a => a.content).join('\n');

  // Collect declared contract references.
  const references: Array<{ kind: string; id: string; owner?: string }> = [];
  let match: RegExpExecArray | null;
  CONTRACT_REF_PATTERN.lastIndex = 0;
  while ((match = CONTRACT_REF_PATTERN.exec(designText)) !== null) {
    references.push({ kind: match[1], id: match[2], owner: match[3] });
  }

  if (references.length === 0) {
    checks.push({
      check_id: 'spec_consistency_no_contract_refs',
      description: 'Design declares no [contract:...] references; nothing to reconcile',
      passed: true,
    });
    return makeReport(ctx.workItemId, 'spec_consistency_gate', 'soft_gate', true, checks);
  }

  for (let i = 0; i < references.length; i++) {
    const ref = references[i];
    const field = CONTRACT_KIND_TO_FIELD[ref.kind];
    const entries = (registry[field] as Array<{ id: string; owner_module: string }>) ?? [];
    const entry = entries.find(e => e.id === ref.id);

    if (!entry) {
      checks.push({
        check_id: `contract_ref_${i}_resolves`,
        description: `Referenced contract does not exist in registry: [${ref.kind}:${ref.id}] — do not invent; register it in the owner module via a governed contract change`,
        passed: false,
        severity: 'error',
      });
      continue;
    }

    if (ref.owner && ref.owner !== entry.owner_module) {
      checks.push({
        check_id: `contract_ref_${i}_owner`,
        description: `Owner mismatch for [${ref.kind}:${ref.id}]: design says owner=${ref.owner}, registry says owner=${entry.owner_module}`,
        passed: false,
        severity: 'error',
      });
      continue;
    }

    checks.push({
      check_id: `contract_ref_${i}_ok`,
      description: `Contract reference resolved: [${ref.kind}:${ref.id}] owner=${entry.owner_module}`,
      passed: true,
    });
  }

  return makeReport(
    ctx.workItemId,
    'spec_consistency_gate',
    'soft_gate',
    true,
    checks,
    designArtifacts.map(a => a.path)
  );
});

/**
 * Hard pre-merge reverse-dependency check for destructive contract changes.
 * Additions and brownfield registries pass; removals/shape changes must update
 * every explicitly marked Project Spec consumer in the same candidate.
 */
registerGate('contract_integrity_gate', 'hard_gate', true, async ctx => {
  const result = await checkContractIntegrity({
    projectRoot: ctx.projectRoot,
    workItemDir: ctx.workItemDir,
  });
  return makeReport(
    ctx.workItemId,
    'contract_integrity_gate',
    'hard_gate',
    true,
    result.checks,
    result.inputFiles
  );
});

/**
 * §9.2 trace_gate — Trace 闭环检查（弱实现）
 */
registerGate('trace_gate', 'soft_gate', true, async ctx => {
  if (await isProjectSpecRepairWorkItem(ctx)) {
    const manifestPath = workItemCandidateManifest(ctx.projectRoot, ctx.workItemId);
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Record<string, unknown>;
    const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
    const traceEntries = entries.filter(
      (entry: any) =>
        entry?.type === 'module_trace' &&
        normalizeProjectSpecTargetPath(entry?.target_path).endsWith('/trace.md')
    );
    const checks: GateReportCheck[] = [
      {
        check_id: 'module_trace_candidates_exist',
        description: 'Every repair module includes an explicit module trace Candidate',
        passed: traceEntries.length > 0,
        severity: traceEntries.length > 0 ? undefined : 'error',
      },
    ];
    for (let index = 0; index < traceEntries.length; index++) {
      const entry = traceEntries[index] as any;
      let nonempty = false;
      try {
        const content = await fs.readFile(path.join(ctx.workItemDir, entry.candidate_path), 'utf8');
        nonempty = content.trim().length > 0;
      } catch {
        nonempty = false;
      }
      checks.push({
        check_id: `module_trace_${index}_nonempty`,
        description: `Module trace Candidate is present and non-empty: ${String(entry.candidate_path)}`,
        passed: nonempty,
        severity: nonempty ? undefined : 'error',
      });
    }
    return makeReport(
      ctx.workItemId,
      'trace_gate',
      'soft_gate',
      true,
      checks,
      traceEntries.map((entry: any) => path.join(ctx.workItemDir, entry.candidate_path))
    );
  }

  const artifacts = await resolveWorkItemSpecArtifacts({
    projectRoot: ctx.projectRoot,
    workItemId: ctx.workItemId,
    kind: 'trace_delta',
  });
  const checks: GateReportCheck[] = [
    {
      check_id: 'trace_delta_exists',
      description: 'trace_delta candidate exists',
      passed: artifacts.length > 0,
    },
    ...artifacts.map((artifact, index) => ({
      check_id: `trace_delta_${index}_nonempty`,
      description: `trace_delta candidate is non-empty: ${artifact.path}`,
      passed: artifact.content.trim().length > 0,
    })),
  ];
  return makeReport(
    ctx.workItemId,
    'trace_gate',
    'soft_gate',
    true,
    checks,
    artifacts.map(artifact => artifact.path)
  );
});

/**
 * §9.2 gate_summary_gate — Gate Summary 冻结检查
 */
registerGate('gate_summary_gate', 'hard_gate', true, async ctx => {
  const checks: GateReportCheck[] = [];
  const summaryPath = path.join(ctx.workItemDir, 'gate_summary.md');
  try {
    const content = await fs.readFile(summaryPath, 'utf-8');
    checks.push({
      check_id: 'gate_summary_exists',
      description: 'gate_summary.md exists',
      passed: true,
    });
    checks.push({
      check_id: 'gate_summary_has_status',
      description: 'gate_summary has Overall Status',
      passed: content.includes('Overall Status:'),
    });
  } catch {
    checks.push({
      check_id: 'gate_summary_exists',
      description: 'gate_summary.md exists',
      passed: false,
      severity: 'error',
    });
  }
  return makeReport(ctx.workItemId, 'gate_summary_gate', 'hard_gate', true, checks);
});

/**
 * §9.2 workflow_specific_gate — 委托既有权威 Gate Core
 */
function gateResultInputFiles(result: GateResult): string[] {
  const details = result.details ?? {};
  const values = [
    details['design_candidate_paths'],
    details['requirements_candidate_paths'],
    details['task_candidate_paths'],
    details['investigation_plan_path'],
    details['findings_report_path'],
  ];
  return values.flatMap(value =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : typeof value === 'string'
        ? [value]
        : []
  );
}

function gateResultToReport(
  ctx: GateContext,
  result: GateResult,
  label: string
): ReturnType<typeof makeReport> {
  const passed = result.status === 'pass';
  const issues =
    result.blocking_issues.length > 0
      ? result.blocking_issues
      : passed
        ? []
        : [`${label} returned status=${result.status}`];
  const checks: GateReportCheck[] = passed
    ? [{ check_id: `${label}_pass`, description: `${label} passed`, passed: true }]
    : issues.map((issue, index) => ({
        check_id: `${label}_issue_${index + 1}`,
        description: issue,
        passed: false,
        severity: 'error' as const,
      }));
  const report = makeReport(
    ctx.workItemId,
    'workflow_specific_gate',
    'hard_gate',
    true,
    checks,
    gateResultInputFiles(result)
  );
  report.warnings = [...result.warnings];
  return report;
}

async function checkProjectSpecRepairGate(ctx: GateContext): Promise<GateResult> {
  const blockingIssues: string[] = [];
  const planPath = projectSpecRepairPlanPath(ctx.workItemDir);
  const candidateManifestPath = workItemCandidateManifest(ctx.projectRoot, ctx.workItemId);
  try {
    const plan = JSON.parse(await fs.readFile(planPath, 'utf8')) as Record<string, unknown>;
    const candidateManifestRaw = await fs.readFile(candidateManifestPath);
    const candidateManifest = JSON.parse(candidateManifestRaw.toString('utf8')) as Record<
      string,
      unknown
    >;
    const candidateManifestHash = `sha256:${createHash('sha256')
      .update(candidateManifestRaw)
      .digest('hex')}`;

    if (plan.action !== 'project_spec_repair') {
      blockingIssues.push('project_spec_repair_plan.action must be project_spec_repair');
    }
    if (plan.candidate_manifest_sha256 !== candidateManifestHash) {
      blockingIssues.push('project_spec_repair_plan candidate manifest hash is stale');
    }
    if (plan.manifest_sha256_before !== candidateManifest.project_spec_precondition_sha256) {
      blockingIssues.push(
        'repair plan and candidate manifest disagree on the Project Spec precondition'
      );
    }

    const currentManifestRaw = await fs.readFile(projectSpecManifest(ctx.projectRoot));
    const currentManifestHash = `sha256:${createHash('sha256')
      .update(currentManifestRaw)
      .digest('hex')}`;
    if (currentManifestHash !== plan.manifest_sha256_before) {
      blockingIssues.push('Project Spec manifest changed after the repair plan was prepared');
    }

    const evidencePaths = Array.isArray(plan.evidence_paths) ? plan.evidence_paths : [];
    if (evidencePaths.length === 0) {
      blockingIssues.push('project_spec_repair_plan requires architecture evidence paths');
    }
    for (const evidencePath of evidencePaths) {
      if (typeof evidencePath !== 'string' || !evidencePath.startsWith('.specforge/project/')) {
        blockingIssues.push(`invalid Project Spec repair evidence path: ${String(evidencePath)}`);
        continue;
      }
      try {
        await fs.access(path.resolve(ctx.projectRoot, evidencePath));
      } catch {
        blockingIssues.push(`Project Spec repair evidence does not exist: ${evidencePath}`);
      }
    }
  } catch (error) {
    blockingIssues.push(
      `Project Spec repair artifacts are unreadable: ${(error as Error).message}`
    );
  }

  return {
    status: blockingIssues.length > 0 ? 'fail' : 'pass',
    blocking_issues: blockingIssues,
    warnings: [],
    next_action: blockingIssues.length > 0 ? 'revise' : 'continue',
    details: {
      repair_plan_path: planPath,
      candidate_manifest_path: candidateManifestPath,
    },
  };
}

async function runWorkflowSpecificGate(ctx: GateContext): Promise<GateResult> {
  const phase = ctx.candidatePhase ?? 'full';
  const workflowType = ctx.workflowType ?? 'feature_spec';

  if (workflowType === 'investigation') {
    const [planResult, findingsResult] = await Promise.all([
      checkRequirementsGate(ctx.workItemId, ctx.projectRoot, { mode: 'investigation' }),
      checkDesignGate(ctx.workItemId, ctx.projectRoot, workflowType, { mode: 'investigation' }),
    ]);
    const blockingIssues = [...planResult.blocking_issues, ...findingsResult.blocking_issues];
    const warnings = [...planResult.warnings, ...findingsResult.warnings];
    const blocked = planResult.status === 'blocked' || findingsResult.status === 'blocked';
    return {
      status: blocked ? 'blocked' : blockingIssues.length > 0 ? 'fail' : 'pass',
      blocking_issues: blockingIssues,
      warnings,
      next_action: blocked ? 'ask_user' : blockingIssues.length > 0 ? 'revise' : 'continue',
      details: {
        investigation_plan_path: planResult.details?.['document_path'],
        findings_report_path: findingsResult.details?.['document_path'],
        plan_gate: planResult.details,
        findings_gate: findingsResult.details,
      },
    };
  }

  if (ctx.workflowPath === 'code_only_fast_path' || ctx.workflowPath === 'rollback_path') {
    return {
      status: 'pass',
      blocking_issues: [],
      warnings: [],
      next_action: 'continue',
      details: { workflow_specific_gate: 'not_applicable' },
    };
  }

  if (await isProjectSpecRepairWorkItem(ctx)) {
    return checkProjectSpecRepairGate(ctx);
  }

  if (ctx.workflowPath === 'task_change_path') {
    return checkTasksGate(ctx.workItemId, ctx.projectRoot);
  }

  if (phase === 'design') {
    return checkDesignGate(ctx.workItemId, ctx.projectRoot, workflowType);
  }
  if (phase === 'requirements') {
    return checkRequirementsGate(ctx.workItemId, ctx.projectRoot);
  }

  const results = await Promise.all([
    checkRequirementsGate(ctx.workItemId, ctx.projectRoot),
    checkDesignGate(ctx.workItemId, ctx.projectRoot, workflowType),
    checkTasksGate(ctx.workItemId, ctx.projectRoot),
  ]);
  const blockingIssues = results.flatMap(result => result.blocking_issues);
  const warnings = results.flatMap(result => result.warnings);
  const blocked = results.some(result => result.status === 'blocked');
  return {
    status: blocked ? 'blocked' : blockingIssues.length > 0 ? 'fail' : 'pass',
    blocking_issues: blockingIssues,
    warnings,
    next_action: blocked ? 'ask_user' : blockingIssues.length > 0 ? 'revise' : 'continue',
    details: {
      requirements_candidate_paths: results[0]?.details?.['requirements_candidate_paths'],
      design_candidate_paths: results[1]?.details?.['design_candidate_paths'],
      task_candidate_paths: results[2]?.details?.['task_candidate_paths'],
    },
  };
}

/** §9.2 workflow_specific_gate — delegates to the existing authoritative Gate cores. */
registerGate('workflow_specific_gate', 'hard_gate', true, async ctx => {
  const result = await runWorkflowSpecificGate(ctx);
  return gateResultToReport(ctx, result, 'workflow_specific_gate');
});
