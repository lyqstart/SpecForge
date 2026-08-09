/**
 * semantic-closure-core.ts — minimal semantic closure validator.
 *
 * This module is intentionally pure: it does not read files, write state,
 * advance workflow, or depend on daemon runtime objects. It validates a
 * machine-readable manifest produced by sf_semantic_closure_run and consumed
 * by verification_gate and close_gate.
 */

export type SemanticClosureSeverity = 'error' | 'warning';

export type SemanticEvidenceStatus = string;

export interface SemanticOutcome {
  id: string;
  description?: string;
  requirement_refs?: string[];
  required_evidence_refs?: string[];
}

export interface SemanticRequirement {
  id: string;
  description?: string;
  type?: string;
  requirement_type?: string;
  outcome_refs?: string[];
  design_refs?: string[];
  task_refs?: string[];
  required_evidence_refs?: string[];
}

export interface SemanticDesignDecision {
  id: string;
  description?: string;
  requirement_refs?: string[];
  task_refs?: string[];
}

export interface SemanticTask {
  id: string;
  description?: string;
  requirement_refs?: string[];
  design_refs?: string[];
  evidence_refs?: string[];
}

export interface SemanticEvidence {
  id: string;
  description?: string;
  status?: SemanticEvidenceStatus;
  level?: string;
  evidence_type?: string;
  supports?: string[];
  outcome_refs?: string[];
  requirement_refs?: string[];
  design_refs?: string[];
  task_refs?: string[];
}

export interface SemanticInvestigationQuestion {
  id: string;
  finding_refs?: string[];
  required_evidence_refs?: string[];
}

export interface SemanticFinding {
  id: string;
  question_refs?: string[];
  evidence_refs?: string[];
  root_cause_status?: string;
}

export interface SemanticSpecMigrationClosure {
  project_spec_version?: string;
  atomic_spec_merge_status?: string;
  post_merge_gate_status?: string;
  changed_files_audit_status?: string;
  verification_status?: string;
  trace_contract_status?: string;
}

export interface SemanticProjectIntegration {
  required?: boolean;
  status?: string;
  refs?: string[];
}

export interface SemanticClosureProvenance {
  contract_id: string;
  generated_at: string;
  source: string;
  semantic_payload_sha256: string;
  inputs: Array<{
    path: string;
    sha256: string;
  }>;
}

export interface SemanticClosureManifest {
  schema_version?: string;
  closure_profile?: string;
  workflow_type?: string;
  work_item_id?: string;
  outcomes?: SemanticOutcome[];
  requirements?: SemanticRequirement[];
  design_decisions?: SemanticDesignDecision[];
  tasks?: SemanticTask[];
  evidence?: SemanticEvidence[];
  investigation_questions?: SemanticInvestigationQuestion[];
  findings?: SemanticFinding[];
  spec_migration?: SemanticSpecMigrationClosure;
  project_integration?: SemanticProjectIntegration;
  provenance?: SemanticClosureProvenance;
}

export interface SemanticClosureCheck {
  check_id: string;
  description: string;
  passed: boolean;
  severity?: SemanticClosureSeverity;
  details?: string[];
}

export interface SemanticClosureIssue {
  check_id: string;
  message: string;
  severity: SemanticClosureSeverity;
  details?: string[];
}

export interface SemanticClosureValidationResult {
  passed: boolean;
  checks: SemanticClosureCheck[];
  errors: SemanticClosureIssue[];
  warnings: SemanticClosureIssue[];
}

const PASS_STATUSES = new Set(['passed', 'pass', 'success', 'succeeded']);
const FAIL_STATUSES = new Set(['failed', 'fail', 'blocked', 'unknown', 'pending']);
const VALID_PROJECT_INTEGRATION_STATUSES = new Set(['merged', 'not_applicable', 'not-applicable']);
const WEAK_EVIDENCE_LEVELS = new Set(['L0', 'L1', 'L2']);
const INVESTIGATION_ROOT_CAUSE_STATUSES = new Set([
  'ROOT_CAUSE_CONFIRMED',
  'ROOT_CAUSE_PROBABLE',
  'ROOT_CAUSE_UNCONFIRMED',
  'INSUFFICIENT_EVIDENCE',
]);
const WEAK_EVIDENCE_TYPE_TOKENS = [
  'file-only',
  'file_only',
  'file existence',
  'file_exists',
  'compile-only',
  'compile_only',
  'build-only',
  'build_only',
  'static-only',
  'static_only',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function refs(value: string[] | undefined): string[] {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function normalize(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function normalizeLevel(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function requirementKind(requirement: SemanticRequirement): string {
  return String(requirement.type ?? requirement.requirement_type ?? '')
    .trim()
    .toUpperCase();
}

function isMustRequirement(requirement: SemanticRequirement): boolean {
  return requirementKind(requirement) === 'MUST';
}

function isPassedEvidence(evidence: SemanticEvidence): boolean {
  return PASS_STATUSES.has(normalize(evidence.status));
}

function isTerminalBadEvidence(evidence: SemanticEvidence): boolean {
  return FAIL_STATUSES.has(normalize(evidence.status));
}

function isWeakEvidence(evidence: SemanticEvidence): boolean {
  const level = normalizeLevel(evidence.level);
  const evidenceType = normalize(evidence.evidence_type);

  // Evidence that has neither a meaningful level nor a meaningful type is not
  // allowed to prove completion. This prevents sparse evidence_manifest entries
  // such as { id, status } from becoming accidental close evidence.
  if (!level && !evidenceType) {
    return true;
  }

  if (WEAK_EVIDENCE_LEVELS.has(level)) {
    return true;
  }

  return WEAK_EVIDENCE_TYPE_TOKENS.some(token => evidenceType.includes(token));
}

function evidenceRefs(evidence: SemanticEvidence, targetId: string): boolean {
  return (
    refs(evidence.supports).includes(targetId) ||
    refs(evidence.outcome_refs).includes(targetId) ||
    refs(evidence.requirement_refs).includes(targetId) ||
    refs(evidence.design_refs).includes(targetId) ||
    refs(evidence.task_refs).includes(targetId)
  );
}

function isClosureEvidenceFor(evidence: SemanticEvidence, targetId: string): boolean {
  return (
    isPassedEvidence(evidence) && !isWeakEvidence(evidence) && evidenceRefs(evidence, targetId)
  );
}

function linkedRequirementIds(
  outcome: SemanticOutcome,
  requirements: SemanticRequirement[]
): string[] {
  const explicit = refs(outcome.requirement_refs);
  const reverse = requirements
    .filter(requirement => refs(requirement.outcome_refs).includes(outcome.id))
    .map(requirement => requirement.id);
  return Array.from(new Set([...explicit, ...reverse]));
}

function linkedTaskIdsForRequirement(
  requirement: SemanticRequirement,
  tasks: SemanticTask[]
): string[] {
  const explicit = refs(requirement.task_refs);
  const reverse = tasks
    .filter(task => refs(task.requirement_refs).includes(requirement.id))
    .map(task => task.id);
  return Array.from(new Set([...explicit, ...reverse]));
}

function linkedDesignIdsForRequirement(
  requirement: SemanticRequirement,
  designDecisions: SemanticDesignDecision[]
): string[] {
  const explicit = refs(requirement.design_refs);
  const reverse = designDecisions
    .filter(decision => refs(decision.requirement_refs).includes(requirement.id))
    .map(decision => decision.id);
  return Array.from(new Set([...explicit, ...reverse]));
}

function linkedTaskIdsForDesign(decision: SemanticDesignDecision, tasks: SemanticTask[]): string[] {
  const explicit = refs(decision.task_refs);
  const reverse = tasks
    .filter(task => refs(task.design_refs).includes(decision.id))
    .map(task => task.id);
  return Array.from(new Set([...explicit, ...reverse]));
}

function linkedRequirementIdsForTask(
  task: SemanticTask,
  requirements: SemanticRequirement[]
): string[] {
  const explicit = refs(task.requirement_refs);
  const reverse = requirements
    .filter(requirement => refs(requirement.task_refs).includes(task.id))
    .map(requirement => requirement.id);
  return Array.from(new Set([...explicit, ...reverse]));
}

function linkedDesignIdsForTask(
  task: SemanticTask,
  designDecisions: SemanticDesignDecision[]
): string[] {
  const explicit = refs(task.design_refs);
  const reverse = designDecisions
    .filter(decision => refs(decision.task_refs).includes(task.id))
    .map(decision => decision.id);
  return Array.from(new Set([...explicit, ...reverse]));
}

function requirementHasClosureEvidence(
  requirement: SemanticRequirement,
  _tasks: SemanticTask[],
  evidence: SemanticEvidence[]
): boolean {
  // A MUST requirement must be proven by evidence that directly supports the
  // requirement id. Do not let evidence for another requirement pass merely
  // because both requirements are implemented by the same task. This closes the
  // fj1-style gap where local logging evidence could otherwise make server
  // upload or flush wiring look complete through a shared task reference.
  return evidence.some(item => isClosureEvidenceFor(item, requirement.id));
}

function outcomeHasClosureEvidence(
  outcome: SemanticOutcome,
  requirements: SemanticRequirement[],
  tasks: SemanticTask[],
  evidence: SemanticEvidence[]
): boolean {
  if (evidence.some(item => isClosureEvidenceFor(item, outcome.id))) {
    return true;
  }

  const requirementById = new Map(requirements.map(requirement => [requirement.id, requirement]));
  return linkedRequirementIds(outcome, requirements).some(requirementId => {
    const requirement = requirementById.get(requirementId);
    return requirement ? requirementHasClosureEvidence(requirement, tasks, evidence) : false;
  });
}

function explicitRequiredEvidenceIsPassed(
  refId: string,
  evidenceById: Map<string, SemanticEvidence>
): boolean {
  const evidence = evidenceById.get(refId);
  return !!evidence && isPassedEvidence(evidence) && !isWeakEvidence(evidence);
}

function duplicateIds(items: Array<{ id: string }>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const item of items) {
    if (seen.has(item.id)) {
      duplicates.add(item.id);
    }
    seen.add(item.id);
  }

  return Array.from(duplicates);
}

function missingRefs(refIds: string[], knownIds: Set<string>): string[] {
  return refIds.filter(refId => !knownIds.has(refId));
}

function validateInvestigationSemanticClosure(
  manifest: SemanticClosureManifest
): SemanticClosureValidationResult {
  const checks: SemanticClosureCheck[] = [];
  const questions = asArray(manifest.investigation_questions);
  const findings = asArray(manifest.findings);
  const evidence = asArray(manifest.evidence);
  const questionIds = new Set(questions.map(item => item.id));
  const findingIds = new Set(findings.map(item => item.id));
  const evidenceIds = new Set(evidence.map(item => item.id));
  const evidenceById = new Map(evidence.map(item => [item.id, item]));

  checks.push({
    check_id: 'investigation_semantic_profile',
    description: 'Semantic closure profile is investigation',
    passed:
      normalize(manifest.closure_profile) === 'investigation' &&
      normalize(manifest.workflow_type) === 'investigation',
    severity:
      normalize(manifest.closure_profile) === 'investigation' &&
      normalize(manifest.workflow_type) === 'investigation'
        ? undefined
        : 'error',
  });
  checks.push({
    check_id: 'investigation_semantic_has_questions',
    description: 'At least one investigation question is declared',
    passed: questions.length > 0,
    severity: questions.length > 0 ? undefined : 'error',
  });
  checks.push({
    check_id: 'investigation_semantic_has_findings',
    description: 'At least one finding is declared',
    passed: findings.length > 0,
    severity: findings.length > 0 ? undefined : 'error',
  });
  checks.push({
    check_id: 'investigation_semantic_has_evidence',
    description: 'At least one investigation evidence item is declared',
    passed: evidence.length > 0,
    severity: evidence.length > 0 ? undefined : 'error',
  });

  const duplicateEntityIds = duplicateIds([...questions, ...findings, ...evidence]);
  checks.push({
    check_id: 'investigation_semantic_unique_ids',
    description: 'Investigation semantic entity ids are unique',
    passed: duplicateEntityIds.length === 0,
    severity: duplicateEntityIds.length === 0 ? undefined : 'error',
    details: duplicateEntityIds,
  });

  for (const question of questions) {
    const linkedFindings = refs(question.finding_refs);
    const missingFindingRefs = missingRefs(linkedFindings, findingIds);
    checks.push({
      check_id: `investigation_question_${question.id}_findings_exist`,
      description: `Investigation question ${question.id} links to existing findings`,
      passed: linkedFindings.length > 0 && missingFindingRefs.length === 0,
      severity: linkedFindings.length > 0 && missingFindingRefs.length === 0 ? undefined : 'error',
      details: missingFindingRefs,
    });

    const requiredEvidenceRefs = refs(question.required_evidence_refs);
    const badEvidenceRefs = requiredEvidenceRefs.filter(
      refId => !explicitRequiredEvidenceIsPassed(refId, evidenceById)
    );
    const hasDirectEvidence = evidence.some(item => isClosureEvidenceFor(item, question.id));
    checks.push({
      check_id: `investigation_question_${question.id}_evidence`,
      description: `Investigation question ${question.id} has passed, non-weak evidence`,
      passed:
        (requiredEvidenceRefs.length > 0 && badEvidenceRefs.length === 0) || hasDirectEvidence,
      severity:
        (requiredEvidenceRefs.length > 0 && badEvidenceRefs.length === 0) || hasDirectEvidence
          ? undefined
          : 'error',
      details: badEvidenceRefs,
    });
  }

  for (const finding of findings) {
    const linkedQuestions = refs(finding.question_refs);
    const missingQuestionRefs = missingRefs(linkedQuestions, questionIds);
    const linkedEvidence = refs(finding.evidence_refs);
    const missingEvidenceRefs = missingRefs(linkedEvidence, evidenceIds);
    const badEvidenceRefs = linkedEvidence.filter(
      refId => !explicitRequiredEvidenceIsPassed(refId, evidenceById)
    );
    const rootStatus = String(finding.root_cause_status ?? '')
      .trim()
      .toUpperCase();

    checks.push({
      check_id: `investigation_finding_${finding.id}_questions_exist`,
      description: `Finding ${finding.id} links to existing investigation questions`,
      passed: linkedQuestions.length > 0 && missingQuestionRefs.length === 0,
      severity:
        linkedQuestions.length > 0 && missingQuestionRefs.length === 0 ? undefined : 'error',
      details: missingQuestionRefs,
    });
    checks.push({
      check_id: `investigation_finding_${finding.id}_evidence`,
      description: `Finding ${finding.id} is supported by passed, non-weak evidence`,
      passed:
        linkedEvidence.length > 0 &&
        missingEvidenceRefs.length === 0 &&
        badEvidenceRefs.length === 0,
      severity:
        linkedEvidence.length > 0 &&
        missingEvidenceRefs.length === 0 &&
        badEvidenceRefs.length === 0
          ? undefined
          : 'error',
      details: Array.from(new Set([...missingEvidenceRefs, ...badEvidenceRefs])),
    });
    checks.push({
      check_id: `investigation_finding_${finding.id}_root_status`,
      description: `Finding ${finding.id} declares a valid root-cause confidence status`,
      passed: INVESTIGATION_ROOT_CAUSE_STATUSES.has(rootStatus),
      severity: INVESTIGATION_ROOT_CAUSE_STATUSES.has(rootStatus) ? undefined : 'error',
      details: rootStatus ? [rootStatus] : ['missing'],
    });
  }

  for (const item of evidence) {
    const supports = refs(item.supports);
    const unknownSupports = supports.filter(
      refId => !questionIds.has(refId) && !findingIds.has(refId)
    );
    checks.push({
      check_id: `investigation_evidence_${item.id}_refs_exist`,
      description: `Evidence ${item.id} references existing questions or findings`,
      passed: supports.length > 0 && unknownSupports.length === 0,
      severity: supports.length > 0 && unknownSupports.length === 0 ? undefined : 'error',
      details: unknownSupports,
    });
  }

  const implementationArtifactsAbsent =
    asArray(manifest.requirements).length === 0 &&
    asArray(manifest.design_decisions).length === 0 &&
    asArray(manifest.tasks).length === 0;
  checks.push({
    check_id: 'investigation_semantic_no_fabricated_implementation_chain',
    description:
      'Investigation semantic closure does not fabricate requirements, design decisions, or tasks',
    passed: implementationArtifactsAbsent,
    severity: implementationArtifactsAbsent ? undefined : 'error',
  });

  const integrationStatus = normalize(manifest.project_integration?.status);
  checks.push({
    check_id: 'investigation_semantic_integration_not_applicable',
    description: 'Investigation project integration is not_applicable',
    passed: integrationStatus === 'not_applicable' || integrationStatus === 'not-applicable',
    severity:
      integrationStatus === 'not_applicable' || integrationStatus === 'not-applicable'
        ? undefined
        : 'error',
    details: integrationStatus ? [integrationStatus] : ['missing'],
  });

  return buildResult(checks);
}

function validateSpecMigrationSemanticClosure(
  manifest: SemanticClosureManifest
): SemanticClosureValidationResult {
  const checks: SemanticClosureCheck[] = [];
  const evidence = asArray(manifest.evidence);
  const migration = manifest.spec_migration;
  const profileValid =
    normalize(manifest.closure_profile) === 'spec_migration' &&
    normalize(manifest.workflow_type) === 'spec_migration';
  checks.push({
    check_id: 'spec_migration_profile_identity',
    description: 'Spec Migration semantic closure declares the canonical spec_migration profile',
    passed: profileValid,
    severity: profileValid ? undefined : 'error',
  });
  const noFabricatedImplementationChain =
    asArray(manifest.outcomes).length === 0 &&
    asArray(manifest.requirements).length === 0 &&
    asArray(manifest.design_decisions).length === 0 &&
    asArray(manifest.tasks).length === 0;
  checks.push({
    check_id: 'spec_migration_no_fabricated_implementation_chain',
    description: 'Spec Migration semantic closure does not fabricate OUT/REQ/DD/TASK implementation entities',
    passed: noFabricatedImplementationChain,
    severity: noFabricatedImplementationChain ? undefined : 'error',
  });
  checks.push({
    check_id: 'spec_migration_has_evidence',
    description: 'Spec Migration semantic closure has explicit evidence',
    passed: evidence.length > 0,
    severity: evidence.length > 0 ? undefined : 'error',
  });
  const duplicateEvidenceIds = duplicateIds(evidence);
  checks.push({
    check_id: 'spec_migration_unique_evidence_ids',
    description: 'Spec Migration semantic evidence ids are unique',
    passed: duplicateEvidenceIds.length === 0,
    severity: duplicateEvidenceIds.length === 0 ? undefined : 'error',
    details: duplicateEvidenceIds,
  });
  const strongPassedEvidence = evidence.filter(item => isPassedEvidence(item) && !isWeakEvidence(item));
  checks.push({
    check_id: 'spec_migration_has_strong_passed_evidence',
    description: 'Spec Migration has passed non-weak behavioral evidence',
    passed: strongPassedEvidence.length > 0,
    severity: strongPassedEvidence.length > 0 ? undefined : 'error',
  });
  const terminalBadEvidence = evidence.filter(isTerminalBadEvidence).map(item => item.id);
  checks.push({
    check_id: 'spec_migration_no_terminal_bad_evidence',
    description: 'Spec Migration has no failed, blocked, unknown, or pending terminal evidence',
    passed: terminalBadEvidence.length === 0,
    severity: terminalBadEvidence.length === 0 ? undefined : 'error',
    details: terminalBadEvidence,
  });
  const integrationStatus = normalize(manifest.project_integration?.status);
  checks.push({
    check_id: 'spec_migration_project_integration_merged',
    description: 'Spec Migration Project Spec integration is merged',
    passed: integrationStatus === 'merged',
    severity: integrationStatus === 'merged' ? undefined : 'error',
    details: integrationStatus ? [integrationStatus] : ['missing'],
  });
  const psv = String(migration?.project_spec_version ?? '').trim();
  const psvValid = /^PSV-\d+$/.test(psv);
  checks.push({
    check_id: 'spec_migration_project_spec_version',
    description: 'Spec Migration declares a canonical Project Spec Version',
    passed: psvValid,
    severity: psvValid ? undefined : 'error',
    details: psv ? [psv] : ['missing'],
  });
  const mergeStatus = normalize(migration?.atomic_spec_merge_status);
  const mergePassed = PASS_STATUSES.has(mergeStatus) || mergeStatus === 'merged';
  checks.push({
    check_id: 'spec_migration_atomic_spec_merge_passed',
    description: 'Atomic Spec Merge succeeded',
    passed: mergePassed,
    severity: mergePassed ? undefined : 'error',
  });
  for (const [checkId, description, raw] of [
    ['spec_migration_post_merge_gate_passed', 'Post-Spec-Merge Gate passed', migration?.post_merge_gate_status],
    ['spec_migration_changed_files_audit_passed', 'No-code Changed Files Audit passed', migration?.changed_files_audit_status],
    ['spec_migration_verification_passed', 'Verification passed', migration?.verification_status],
    ['spec_migration_trace_contract_passed', 'Trace and Contract reconciliation passed', migration?.trace_contract_status],
  ] as Array<[string, string, string | undefined]>) {
    const status = normalize(raw);
    const passed = PASS_STATUSES.has(status);
    checks.push({
      check_id: checkId,
      description,
      passed,
      severity: passed ? undefined : 'error',
      details: status ? [status] : ['missing'],
    });
  }
  return buildResult(checks);
}

export function validateSemanticClosure(manifest: unknown): SemanticClosureValidationResult {
  const checks: SemanticClosureCheck[] = [];

  const addCheck = (check: SemanticClosureCheck): void => {
    checks.push(check);
  };

  if (!isRecord(manifest)) {
    addCheck({
      check_id: 'semantic_manifest_object',
      description: '.semantic_closure.json must be a JSON object',
      passed: false,
      severity: 'error',
    });

    return buildResult(checks);
  }

  const typedManifest = manifest as SemanticClosureManifest;
  if (
    normalize(typedManifest.closure_profile) === 'spec_migration' ||
    normalize(typedManifest.workflow_type) === 'spec_migration'
  ) {
    return validateSpecMigrationSemanticClosure(typedManifest);
  }
  if (
    normalize(typedManifest.closure_profile) === 'investigation' ||
    normalize(typedManifest.workflow_type) === 'investigation'
  ) {
    return validateInvestigationSemanticClosure(typedManifest);
  }

  const outcomes = asArray(typedManifest.outcomes);
  const requirements = asArray(typedManifest.requirements);
  const designDecisions = asArray(typedManifest.design_decisions);
  const tasks = asArray(typedManifest.tasks);
  const evidence = asArray(typedManifest.evidence);

  addCheck({
    check_id: 'semantic_has_outcomes',
    description: 'At least one user outcome is declared',
    passed: outcomes.length > 0,
    severity: outcomes.length > 0 ? undefined : 'error',
  });
  addCheck({
    check_id: 'semantic_has_requirements',
    description: 'At least one requirement is declared',
    passed: requirements.length > 0,
    severity: requirements.length > 0 ? undefined : 'error',
  });
  addCheck({
    check_id: 'semantic_has_design_decisions',
    description: 'At least one design decision is declared',
    passed: designDecisions.length > 0,
    severity: designDecisions.length > 0 ? undefined : 'error',
  });
  addCheck({
    check_id: 'semantic_has_tasks',
    description: 'At least one task is declared',
    passed: tasks.length > 0,
    severity: tasks.length > 0 ? undefined : 'error',
  });
  addCheck({
    check_id: 'semantic_has_evidence',
    description: 'At least one evidence item is declared',
    passed: evidence.length > 0,
    severity: evidence.length > 0 ? undefined : 'error',
  });

  const allEntities = [...outcomes, ...requirements, ...designDecisions, ...tasks, ...evidence];
  const duplicateEntityIds = duplicateIds(allEntities);
  addCheck({
    check_id: 'semantic_unique_ids',
    description: 'Semantic closure entity ids are unique',
    passed: duplicateEntityIds.length === 0,
    severity: duplicateEntityIds.length === 0 ? undefined : 'error',
    details: duplicateEntityIds,
  });

  const outcomeIds = new Set(outcomes.map(outcome => outcome.id));
  const requirementIds = new Set(requirements.map(requirement => requirement.id));
  const designDecisionIds = new Set(designDecisions.map(decision => decision.id));
  const taskIds = new Set(tasks.map(task => task.id));
  const evidenceIds = new Set(evidence.map(item => item.id));
  const evidenceById = new Map(evidence.map(item => [item.id, item]));

  for (const outcome of outcomes) {
    const missingRequirementRefs = missingRefs(refs(outcome.requirement_refs), requirementIds);
    addCheck({
      check_id: `semantic_outcome_${outcome.id}_requirements_exist`,
      description: `Outcome ${outcome.id} references existing requirements`,
      passed: missingRequirementRefs.length === 0,
      severity: missingRequirementRefs.length === 0 ? undefined : 'error',
      details: missingRequirementRefs,
    });

    const linkedRequirements = linkedRequirementIds(outcome, requirements);
    addCheck({
      check_id: `semantic_outcome_${outcome.id}_has_requirement`,
      description: `Outcome ${outcome.id} is covered by at least one requirement`,
      passed: linkedRequirements.length > 0,
      severity: linkedRequirements.length > 0 ? undefined : 'error',
    });

    const explicitEvidenceRefs = refs(outcome.required_evidence_refs);
    const missingEvidenceRefs = missingRefs(explicitEvidenceRefs, evidenceIds);
    const badEvidenceRefs = explicitEvidenceRefs.filter(
      refId => !explicitRequiredEvidenceIsPassed(refId, evidenceById)
    );
    addCheck({
      check_id: `semantic_outcome_${outcome.id}_required_evidence_passed`,
      description: `Outcome ${outcome.id} required evidence exists, passed, and is not weak evidence`,
      passed: missingEvidenceRefs.length === 0 && badEvidenceRefs.length === 0,
      severity:
        missingEvidenceRefs.length === 0 && badEvidenceRefs.length === 0 ? undefined : 'error',
      details: Array.from(new Set([...missingEvidenceRefs, ...badEvidenceRefs])),
    });

    const hasEvidence = outcomeHasClosureEvidence(outcome, requirements, tasks, evidence);
    addCheck({
      check_id: `semantic_outcome_${outcome.id}_has_passed_evidence`,
      description: `Outcome ${outcome.id} is proven by passed behavioral evidence`,
      passed: hasEvidence,
      severity: hasEvidence ? undefined : 'error',
    });
  }

  for (const requirement of requirements) {
    const missingOutcomeRefs = missingRefs(refs(requirement.outcome_refs), outcomeIds);
    const missingDesignRefs = missingRefs(refs(requirement.design_refs), designDecisionIds);
    const missingTaskRefs = missingRefs(refs(requirement.task_refs), taskIds);
    const refErrors = [...missingOutcomeRefs, ...missingDesignRefs, ...missingTaskRefs];
    addCheck({
      check_id: `semantic_requirement_${requirement.id}_refs_exist`,
      description: `Requirement ${requirement.id} references existing outcomes, design decisions, and tasks`,
      passed: refErrors.length === 0,
      severity: refErrors.length === 0 ? undefined : 'error',
      details: refErrors,
    });

    const linkedDesigns = linkedDesignIdsForRequirement(requirement, designDecisions);
    addCheck({
      check_id: `semantic_requirement_${requirement.id}_has_design`,
      description: `Requirement ${requirement.id} is realized by at least one design decision`,
      passed: linkedDesigns.length > 0,
      severity: linkedDesigns.length > 0 ? undefined : 'error',
    });

    if (isMustRequirement(requirement)) {
      const linkedTasks = linkedTaskIdsForRequirement(requirement, tasks);
      addCheck({
        check_id: `semantic_requirement_${requirement.id}_has_task`,
        description: `MUST requirement ${requirement.id} is covered by at least one task`,
        passed: linkedTasks.length > 0,
        severity: linkedTasks.length > 0 ? undefined : 'error',
      });

      const explicitEvidenceRefs = refs(requirement.required_evidence_refs);
      const missingEvidenceRefs = missingRefs(explicitEvidenceRefs, evidenceIds);
      const badEvidenceRefs = explicitEvidenceRefs.filter(
        refId => !explicitRequiredEvidenceIsPassed(refId, evidenceById)
      );
      addCheck({
        check_id: `semantic_requirement_${requirement.id}_required_evidence_passed`,
        description: `MUST requirement ${requirement.id} required evidence exists, passed, and is not weak evidence`,
        passed: missingEvidenceRefs.length === 0 && badEvidenceRefs.length === 0,
        severity:
          missingEvidenceRefs.length === 0 && badEvidenceRefs.length === 0 ? undefined : 'error',
        details: Array.from(new Set([...missingEvidenceRefs, ...badEvidenceRefs])),
      });

      const hasEvidence = requirementHasClosureEvidence(requirement, tasks, evidence);
      addCheck({
        check_id: `semantic_requirement_${requirement.id}_has_passed_evidence`,
        description: `MUST requirement ${requirement.id} is proven by passed behavioral evidence`,
        passed: hasEvidence,
        severity: hasEvidence ? undefined : 'error',
      });
    }
  }

  for (const decision of designDecisions) {
    const missingRequirementRefs = missingRefs(refs(decision.requirement_refs), requirementIds);
    const missingTaskRefs = missingRefs(refs(decision.task_refs), taskIds);
    const linkedRequirements = refs(decision.requirement_refs);
    addCheck({
      check_id: `semantic_design_${decision.id}_refs_exist`,
      description: `Design decision ${decision.id} references existing requirements and tasks`,
      passed: missingRequirementRefs.length === 0 && missingTaskRefs.length === 0,
      severity:
        missingRequirementRefs.length === 0 && missingTaskRefs.length === 0 ? undefined : 'error',
      details: [...missingRequirementRefs, ...missingTaskRefs],
    });
    addCheck({
      check_id: `semantic_design_${decision.id}_has_requirement`,
      description: `Design decision ${decision.id} is justified by at least one requirement`,
      passed: linkedRequirements.length > 0,
      severity: linkedRequirements.length > 0 ? undefined : 'error',
    });
    const linkedTasks = linkedTaskIdsForDesign(decision, tasks);
    addCheck({
      check_id: `semantic_design_${decision.id}_has_task`,
      description: `Design decision ${decision.id} is implemented by at least one task`,
      passed: linkedTasks.length > 0,
      severity: linkedTasks.length > 0 ? undefined : 'error',
    });
  }

  for (const task of tasks) {
    const missingRequirementRefs = missingRefs(refs(task.requirement_refs), requirementIds);
    const missingDesignRefs = missingRefs(refs(task.design_refs), designDecisionIds);
    const missingEvidenceRefs = missingRefs(refs(task.evidence_refs), evidenceIds);
    const refErrors = [...missingRequirementRefs, ...missingDesignRefs, ...missingEvidenceRefs];
    addCheck({
      check_id: `semantic_task_${task.id}_refs_exist`,
      description: `Task ${task.id} references existing requirements, design decisions, and evidence`,
      passed: refErrors.length === 0,
      severity: refErrors.length === 0 ? undefined : 'error',
      details: refErrors,
    });

    const linkedRequirements = linkedRequirementIdsForTask(task, requirements);
    addCheck({
      check_id: `semantic_task_${task.id}_has_requirement`,
      description: `Task ${task.id} implements at least one requirement`,
      passed: linkedRequirements.length > 0,
      severity: linkedRequirements.length > 0 ? undefined : 'error',
    });
    const linkedDesigns = linkedDesignIdsForTask(task, designDecisions);
    addCheck({
      check_id: `semantic_task_${task.id}_has_design`,
      description: `Task ${task.id} implements at least one design decision`,
      passed: linkedDesigns.length > 0,
      severity: linkedDesigns.length > 0 ? undefined : 'error',
    });

    const explicitEvidenceRefs = refs(task.evidence_refs);
    const badEvidenceRefs = explicitEvidenceRefs.filter(
      refId => !explicitRequiredEvidenceIsPassed(refId, evidenceById)
    );
    addCheck({
      check_id: `semantic_task_${task.id}_evidence_passed`,
      description: `Task ${task.id} evidence exists, passed, and is not weak evidence`,
      passed: explicitEvidenceRefs.length > 0 && badEvidenceRefs.length === 0,
      severity:
        explicitEvidenceRefs.length > 0 && badEvidenceRefs.length === 0 ? undefined : 'error',
      details: badEvidenceRefs,
    });
  }

  for (const item of evidence) {
    const refErrors = [
      ...missingRefs(refs(item.outcome_refs), outcomeIds),
      ...missingRefs(refs(item.requirement_refs), requirementIds),
      ...missingRefs(refs(item.design_refs), designDecisionIds),
      ...missingRefs(refs(item.task_refs), taskIds),
    ];
    const unknownSupports = refs(item.supports).filter(
      refId =>
        !outcomeIds.has(refId) &&
        !requirementIds.has(refId) &&
        !designDecisionIds.has(refId) &&
        !taskIds.has(refId)
    );
    addCheck({
      check_id: `semantic_evidence_${item.id}_refs_exist`,
      description: `Evidence ${item.id} references existing semantic targets`,
      passed: refErrors.length === 0 && unknownSupports.length === 0,
      severity: refErrors.length === 0 && unknownSupports.length === 0 ? undefined : 'error',
      details: [...refErrors, ...unknownSupports],
    });

    if (isTerminalBadEvidence(item)) {
      addCheck({
        check_id: `semantic_evidence_${item.id}_not_used_as_completion`,
        description: `Evidence ${item.id} is not a passed completion proof`,
        passed: !evidenceRefsAnyRequiredTarget(item, outcomes, requirements, tasks),
        severity: evidenceRefsAnyRequiredTarget(item, outcomes, requirements, tasks)
          ? 'error'
          : 'warning',
      });
    }
  }

  const integrationStatus = normalize(typedManifest.project_integration?.status);
  const projectIntegrationPassed = VALID_PROJECT_INTEGRATION_STATUSES.has(integrationStatus);
  addCheck({
    check_id: 'semantic_project_integration_closed',
    description: 'Project integration is merged or not_applicable',
    passed: projectIntegrationPassed,
    severity: projectIntegrationPassed ? undefined : 'error',
    details: integrationStatus ? [integrationStatus] : ['missing'],
  });

  return buildResult(checks);
}

function evidenceRefsAnyRequiredTarget(
  evidence: SemanticEvidence,
  outcomes: SemanticOutcome[],
  requirements: SemanticRequirement[],
  tasks: SemanticTask[]
): boolean {
  const outcomeRequiredRefs = outcomes.flatMap(outcome => refs(outcome.required_evidence_refs));
  const requirementRequiredRefs = requirements.flatMap(requirement =>
    refs(requirement.required_evidence_refs)
  );
  const taskEvidenceRefs = tasks.flatMap(task => refs(task.evidence_refs));
  return [...outcomeRequiredRefs, ...requirementRequiredRefs, ...taskEvidenceRefs].includes(
    evidence.id
  );
}

function buildResult(checks: SemanticClosureCheck[]): SemanticClosureValidationResult {
  const issues = checks
    .filter(check => !check.passed)
    .map(check => ({
      check_id: check.check_id,
      message: check.description,
      severity: check.severity ?? 'error',
      details: check.details,
    }));

  const errors = issues.filter(issue => issue.severity === 'error');
  const warnings = issues.filter(issue => issue.severity === 'warning');

  return {
    passed: errors.length === 0,
    checks,
    errors,
    warnings,
  };
}
