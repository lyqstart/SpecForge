import { createHash } from "node:crypto";

export type AssertionType =
  | "RULE_ID"
  | "SCHEMA"
  | "PARSER"
  | "STRUCTURED_STATE"
  | "IMMUTABLE_EVIDENCE"
  | "STRUCTURED_GIT"
  | "EXACT_HASH"
  | "NATURAL_LANGUAGE_AUX";

export type Comparator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "SET_EQUALS"
  | "SUBSET"
  | "ZERO"
  | "NO_NEW_FAILURES"
  | "HASH_EQUALS"
  | "EXIT_CODE_EQUALS";

export type BaselineMode = "ABSOLUTE" | "DELTA" | "NOT_APPLICABLE";

export interface ValidationAssertion {
  assertion_id: string;
  assertion_type: AssertionType;
  truth_source: string;
  contract_source: string;
  expected: unknown;
  comparator: Comparator;
  baseline_mode: BaselineMode;
  blocking: boolean;
}

export interface ValidationContract {
  validator_id: string;
  validation_target: string;
  validation_contract_id: string;
  validation_contract_frozen: boolean;
  validation_contract_hash: string;
  contract_source: string;
  truth_source: string;
  baseline_source: string;
  baseline_freshness: string;
  assertions: ValidationAssertion[];
}

export interface ValidationResult {
  validator_accepted: boolean;
  validation_result:
    | "PASS"
    | "FAIL"
    | "INSUFFICIENT_EVIDENCE"
    | "VALIDATION_HARNESS_DEFECT";
  error: string | null;
  declared_blocking_assertions: number;
  executed_blocking_assertions: number;
  extra_blocking_assertions: number;
  missing_blocking_assertions: number;
  assertion_results: Array<{
    assertion_id: string;
    blocking: boolean;
    passed: boolean;
    detail: Record<string, unknown>;
  }>;
  validation_contract_gap: boolean;
}

export class ValidationContractError extends Error {}

const ASSERTION_TYPES = new Set<AssertionType>([
  "RULE_ID",
  "SCHEMA",
  "PARSER",
  "STRUCTURED_STATE",
  "IMMUTABLE_EVIDENCE",
  "STRUCTURED_GIT",
  "EXACT_HASH",
  "NATURAL_LANGUAGE_AUX",
]);

const COMPARATORS = new Set<Comparator>([
  "EQUALS",
  "NOT_EQUALS",
  "SET_EQUALS",
  "SUBSET",
  "ZERO",
  "NO_NEW_FAILURES",
  "HASH_EQUALS",
  "EXIT_CODE_EQUALS",
]);

const BASELINE_MODES = new Set<BaselineMode>([
  "ABSOLUTE",
  "DELTA",
  "NOT_APPLICABLE",
]);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((key) => [key, canonicalize(obj[key])]),
    );
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function contractPayload(contract: Record<string, unknown>): string {
  const copy = { ...contract };
  delete copy.validation_contract_hash;
  return stableStringify(copy);
}

export function computeValidationContractHash(
  contract: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(contractPayload(contract), "utf8")
    .digest("hex")
    .toUpperCase();
}

export function freezeValidationContract(
  draft: Omit<
    ValidationContract,
    "validation_contract_frozen" | "validation_contract_hash"
  >,
): ValidationContract {
  const frozen = {
    ...draft,
    validation_contract_frozen: true,
    validation_contract_hash: "",
  } as ValidationContract;
  frozen.validation_contract_hash = computeValidationContractHash(
    frozen as unknown as Record<string, unknown>,
  );
  validateValidationContract(frozen);
  return frozen;
}

export function validateValidationContract(contract: ValidationContract): void {
  if (contract.validation_contract_frozen !== true) {
    throw new ValidationContractError("VALIDATION_CONTRACT_NOT_FROZEN");
  }

  const expectedHash = computeValidationContractHash(
    contract as unknown as Record<string, unknown>,
  );
  if (contract.validation_contract_hash.toUpperCase() !== expectedHash) {
    throw new ValidationContractError(
      `VALIDATION_CONTRACT_HASH_MISMATCH:expected=${expectedHash}:actual=${contract.validation_contract_hash}`,
    );
  }

  if (!contract.validator_id.trim()) {
    throw new ValidationContractError("VALIDATOR_ID_REQUIRED");
  }
  if (!contract.validation_target.trim()) {
    throw new ValidationContractError("VALIDATION_TARGET_REQUIRED");
  }
  if (!contract.validation_contract_id.trim()) {
    throw new ValidationContractError("VALIDATION_CONTRACT_ID_REQUIRED");
  }
  if (!contract.contract_source.trim()) {
    throw new ValidationContractError("CONTRACT_SOURCE_REQUIRED");
  }
  if (!contract.truth_source.trim()) {
    throw new ValidationContractError("TRUTH_SOURCE_REQUIRED");
  }
  if (!contract.baseline_source.trim()) {
    throw new ValidationContractError("BASELINE_SOURCE_REQUIRED");
  }
  if (!contract.baseline_freshness.trim()) {
    throw new ValidationContractError("BASELINE_FRESHNESS_REQUIRED");
  }
  if (!Array.isArray(contract.assertions) || contract.assertions.length === 0) {
    throw new ValidationContractError("ASSERTIONS_REQUIRED");
  }

  const seen = new Set<string>();
  for (const assertion of contract.assertions) {
    if (seen.has(assertion.assertion_id)) {
      throw new ValidationContractError(
        `DUPLICATE_ASSERTION_ID:${assertion.assertion_id}`,
      );
    }
    seen.add(assertion.assertion_id);

    if (!ASSERTION_TYPES.has(assertion.assertion_type)) {
      throw new ValidationContractError(
        `UNSUPPORTED_ASSERTION_TYPE:${assertion.assertion_id}:${assertion.assertion_type}`,
      );
    }
    if (!COMPARATORS.has(assertion.comparator)) {
      throw new ValidationContractError(
        `UNSUPPORTED_COMPARATOR:${assertion.assertion_id}:${assertion.comparator}`,
      );
    }
    if (!BASELINE_MODES.has(assertion.baseline_mode)) {
      throw new ValidationContractError(
        `UNSUPPORTED_BASELINE_MODE:${assertion.assertion_id}:${assertion.baseline_mode}`,
      );
    }
    if (
      assertion.blocking &&
      assertion.assertion_type === "NATURAL_LANGUAGE_AUX"
    ) {
      throw new ValidationContractError(
        `NATURAL_LANGUAGE_AUX_CANNOT_BLOCK:${assertion.assertion_id}`,
      );
    }
    if (assertion.blocking && !assertion.truth_source.trim()) {
      throw new ValidationContractError(
        `BLOCKING_ASSERTION_TRUTH_SOURCE_REQUIRED:${assertion.assertion_id}`,
      );
    }
    if (assertion.blocking && !assertion.contract_source.trim()) {
      throw new ValidationContractError(
        `BLOCKING_ASSERTION_CONTRACT_SOURCE_REQUIRED:${assertion.assertion_id}`,
      );
    }
    if (
      assertion.comparator === "NO_NEW_FAILURES" &&
      assertion.baseline_mode !== "DELTA"
    ) {
      throw new ValidationContractError(
        `NO_NEW_FAILURES_REQUIRES_DELTA:${assertion.assertion_id}`,
      );
    }
  }
}

function asCanonicalSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) {
    throw new ValidationContractError("SET_COMPARATOR_REQUIRES_ARRAY");
  }
  return new Set(value.map((item) => stableStringify(item)));
}

function compareAssertion(
  assertion: ValidationAssertion,
  actual: unknown,
): { passed: boolean; detail: Record<string, unknown> } {
  const detail: Record<string, unknown> = {};
  let passed = false;

  switch (assertion.comparator) {
    case "EQUALS":
      passed = stableStringify(actual) === stableStringify(assertion.expected);
      break;
    case "NOT_EQUALS":
      passed = stableStringify(actual) !== stableStringify(assertion.expected);
      break;
    case "SET_EQUALS": {
      const actualSet = asCanonicalSet(actual);
      const expectedSet = asCanonicalSet(assertion.expected);
      passed =
        actualSet.size === expectedSet.size &&
        [...actualSet].every((item) => expectedSet.has(item));
      break;
    }
    case "SUBSET": {
      const actualSet = asCanonicalSet(actual);
      const expectedSet = asCanonicalSet(assertion.expected);
      passed = [...actualSet].every((item) => expectedSet.has(item));
      break;
    }
    case "ZERO":
      passed = actual === 0;
      break;
    case "HASH_EQUALS":
      passed =
        String(actual).toUpperCase() === String(assertion.expected).toUpperCase();
      break;
    case "EXIT_CODE_EQUALS":
      passed = Number(actual) === Number(assertion.expected);
      break;
    case "NO_NEW_FAILURES": {
      if (!actual || typeof actual !== "object") {
        throw new ValidationContractError("NO_NEW_FAILURES_REQUIRES_OBJECT");
      }
      const obj = actual as Record<string, unknown>;
      const baseline = new Set(
        Array.isArray(obj.baseline_failures)
          ? obj.baseline_failures.map((x) => String(x))
          : [],
      );
      const post = new Set(
        Array.isArray(obj.post_failures)
          ? obj.post_failures.map((x) => String(x))
          : [],
      );
      const newFailures = [...post].filter((item) => !baseline.has(item)).sort();
      detail.new_failures = newFailures;
      detail.baseline_failure_count = baseline.size;
      detail.post_failure_count = post.size;
      passed = newFailures.length === 0;
      break;
    }
  }

  return { passed, detail };
}

export function evaluateValidationContract(
  contract: ValidationContract,
  evidenceByAssertion: Record<string, unknown>,
  options?: {
    runtimeAssertions?: ValidationAssertion[];
    discoveredFacts?: Array<Record<string, unknown>>;
  },
): ValidationResult {
  try {
    validateValidationContract(contract);
  } catch (error) {
    return {
      validator_accepted: false,
      validation_result: "VALIDATION_HARNESS_DEFECT",
      error: error instanceof Error ? error.message : String(error),
      declared_blocking_assertions: 0,
      executed_blocking_assertions: 0,
      extra_blocking_assertions: 0,
      missing_blocking_assertions: 0,
      assertion_results: [],
      validation_contract_gap: false,
    };
  }

  const declaredIds = new Set(contract.assertions.map((a) => a.assertion_id));
  const blockingIds = new Set(
    contract.assertions.filter((a) => a.blocking).map((a) => a.assertion_id),
  );
  const evidenceIds = new Set(Object.keys(evidenceByAssertion));
  const runtimeAssertions = options?.runtimeAssertions ?? [];
  const extraEvidence = [...evidenceIds].filter((id) => !declaredIds.has(id));

  if (runtimeAssertions.length > 0 || extraEvidence.length > 0) {
    return {
      validator_accepted: false,
      validation_result: "VALIDATION_HARNESS_DEFECT",
      error: "RUNTIME_ASSERTION_CREATION_OR_EXTRA_EVIDENCE_FORBIDDEN",
      declared_blocking_assertions: blockingIds.size,
      executed_blocking_assertions: [...blockingIds].filter((id) =>
        evidenceIds.has(id),
      ).length,
      extra_blocking_assertions: runtimeAssertions.length + extraEvidence.length,
      missing_blocking_assertions: [...blockingIds].filter(
        (id) => !evidenceIds.has(id),
      ).length,
      assertion_results: [],
      validation_contract_gap: (options?.discoveredFacts?.length ?? 0) > 0,
    };
  }

  const missingBlocking = [...blockingIds]
    .filter((id) => !evidenceIds.has(id))
    .sort();
  if (missingBlocking.length > 0) {
    return {
      validator_accepted: false,
      validation_result: "INSUFFICIENT_EVIDENCE",
      error: `MISSING_BLOCKING_EVIDENCE:${missingBlocking.join(",")}`,
      declared_blocking_assertions: blockingIds.size,
      executed_blocking_assertions: blockingIds.size - missingBlocking.length,
      extra_blocking_assertions: 0,
      missing_blocking_assertions: missingBlocking.length,
      assertion_results: [],
      validation_contract_gap: (options?.discoveredFacts?.length ?? 0) > 0,
    };
  }

  const assertionResults: ValidationResult["assertion_results"] = [];
  let blockingFailed = false;

  for (const assertion of contract.assertions) {
    if (
      !Object.prototype.hasOwnProperty.call(
        evidenceByAssertion,
        assertion.assertion_id,
      )
    ) {
      continue;
    }
    const compared = compareAssertion(
      assertion,
      evidenceByAssertion[assertion.assertion_id],
    );
    assertionResults.push({
      assertion_id: assertion.assertion_id,
      blocking: assertion.blocking,
      passed: compared.passed,
      detail: compared.detail,
    });
    if (assertion.blocking && !compared.passed) blockingFailed = true;
  }

  return {
    validator_accepted: true,
    validation_result: blockingFailed ? "FAIL" : "PASS",
    error: null,
    declared_blocking_assertions: blockingIds.size,
    executed_blocking_assertions: blockingIds.size,
    extra_blocking_assertions: 0,
    missing_blocking_assertions: 0,
    assertion_results: assertionResults,
    validation_contract_gap: (options?.discoveredFacts?.length ?? 0) > 0,
  };
}
