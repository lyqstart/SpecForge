import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ValidationContractError,
  evaluateValidationContract,
  freezeValidationContract,
  validateValidationContract,
} from "../../../scripts/validation-contract-kernel.ts";

function repoRoot(): string {
  return path.resolve(import.meta.dirname, "..", "..", "..");
}

function draft() {
  return {
    validator_id: "TEST_VALIDATOR",
    validation_target: "unit-fixture",
    validation_contract_id: "VC-TEST-001",
    contract_source: "TEST_CONTRACT",
    truth_source: "TEST_EVIDENCE",
    baseline_source: "NOT_APPLICABLE",
    baseline_freshness: "CURRENT_RUN",
    assertions: [
      {
        assertion_id: "A001",
        assertion_type: "SCHEMA" as const,
        truth_source: "fixture.value",
        contract_source: "VC-TEST-001",
        expected: 1,
        comparator: "EQUALS" as const,
        baseline_mode: "NOT_APPLICABLE" as const,
        blocking: true,
      },
    ],
  };
}

function validatorSection(): string {
  const authority = path.join(
    repoRoot(),
    "docs",
    "design",
    "SpecForge架构一致性治理最终实施方案.md",
  );
  const text = readFileSync(authority, "utf8").replace(/\r\n/g, "\n");
  const start = text.indexOf("**GOV-STAGE-VALIDATOR-001：**");
  const end = text.indexOf(
    "### 2.10 Delivery、Receipt 与 Delivery Identity",
    start,
  );
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

describe("validation contract kernel", () => {
  it("freezes and hashes a contract", () => {
    const contract = freezeValidationContract(draft());
    expect(contract.validation_contract_frozen).toBe(true);
    expect(contract.validation_contract_hash).toMatch(/^[A-F0-9]{64}$/);
    expect(() => validateValidationContract(contract)).not.toThrow();
  });

  it("rejects mutation after freeze", () => {
    const contract = freezeValidationContract(draft());
    contract.assertions[0]!.expected = 2;
    const result = evaluateValidationContract(contract, { A001: 2 });
    expect(result.validator_accepted).toBe(false);
    expect(result.validation_result).toBe("VALIDATION_HARNESS_DEFECT");
  });

  it("rejects runtime-added blocking assertions", () => {
    const contract = freezeValidationContract(draft());
    const result = evaluateValidationContract(
      contract,
      { A001: 1 },
      {
        runtimeAssertions: [
          {
            assertion_id: "RUNTIME-1",
            assertion_type: "SCHEMA",
            truth_source: "runtime",
            contract_source: "runtime",
            expected: true,
            comparator: "EQUALS",
            baseline_mode: "NOT_APPLICABLE",
            blocking: true,
          },
        ],
      },
    );
    expect(result.validator_accepted).toBe(false);
    expect(result.extra_blocking_assertions).toBe(1);
  });

  it("classifies missing blocking evidence as insufficient evidence", () => {
    const contract = freezeValidationContract(draft());
    const result = evaluateValidationContract(contract, {});
    expect(result.validator_accepted).toBe(false);
    expect(result.validation_result).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.missing_blocking_assertions).toBe(1);
  });

  it("forbids natural language auxiliary assertions from blocking", () => {
    const bad = draft();
    bad.assertions[0] = {
      ...bad.assertions[0]!,
      assertion_type: "NATURAL_LANGUAGE_AUX",
    };
    expect(() => freezeValidationContract(bad)).toThrow(
      ValidationContractError,
    );
  });

  it("passes DELTA when the same 159 historical failures remain", () => {
    const failures = Array.from({ length: 159 }, (_, i) => `test-${i}`);
    const delta = draft();
    delta.assertions[0] = {
      ...delta.assertions[0]!,
      expected: 0,
      comparator: "NO_NEW_FAILURES",
      baseline_mode: "DELTA",
    };
    const contract = freezeValidationContract(delta);
    const result = evaluateValidationContract(contract, {
      A001: {
        baseline_failures: failures,
        post_failures: failures,
      },
    });
    expect(result.validation_result).toBe("PASS");
    expect(result.assertion_results[0]!.detail.new_failures).toEqual([]);
  });

  it("fails DELTA only for a new failure", () => {
    const failures = Array.from({ length: 159 }, (_, i) => `test-${i}`);
    const delta = draft();
    delta.assertions[0] = {
      ...delta.assertions[0]!,
      expected: 0,
      comparator: "NO_NEW_FAILURES",
      baseline_mode: "DELTA",
    };
    const contract = freezeValidationContract(delta);
    const result = evaluateValidationContract(contract, {
      A001: {
        baseline_failures: failures,
        post_failures: [...failures, "new-regression"],
      },
    });
    expect(result.validation_result).toBe("FAIL");
    expect(result.assertion_results[0]!.detail.new_failures).toEqual([
      "new-regression",
    ]);
  });
});

describe("validator governance repository contract", () => {
  it("locks the authority contract and canonical typecheck entry", () => {
    const root = repoRoot();
    const section = validatorSection();
    for (const token of [
      "VALIDATION_CONTRACT_ID=",
      "VALIDATION_CONTRACT_FROZEN=YES|NO",
      "VALIDATION_CONTRACT_HASH=",
      "COMPARATOR=EQUALS|NOT_EQUALS|SET_EQUALS|SUBSET|ZERO|NO_NEW_FAILURES|HASH_EQUALS|EXIT_CODE_EQUALS",
      "BASELINE_MODE=ABSOLUTE|DELTA|NOT_APPLICABLE",
      "RUNTIME_BLOCKING_ASSERTION_CREATION_ALLOWED=NO",
      "RUNTIME_BLOCKING_ASSERTION_MUTATION_ALLOWED=NO",
      "CANONICAL_LOCAL_DELIVERY_VALIDATOR_KERNEL=scripts/validation-contract-kernel.ts",
      "CANONICAL_LOCAL_DELIVERY_VALIDATOR_TYPECHECK=bun run typecheck:validator-contract",
      "RUNTIME_COMPILER_OPTION_SYNTHESIS_ALLOWED=NO",
      "WINDOWS_NPM_SHIM_EXECUTION=CMD_CALL_REQUIRED",
      "VERSIONED_TOOLCHAIN_DEPRECATION_POLICY_REQUIRED=YES",
      "VALIDATOR_KERNEL_TYPE_ENVIRONMENT=NODE",
      "TYPE_ENVIRONMENT_SOURCE=VERSIONED_TSCONFIG_AND_DECLARED_DEPENDENCIES",
    ]) {
      expect(section).toContain(token);
    }

    const packageJson = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    );
    expect(packageJson.scripts["typecheck:validator-contract"]).toBe(
      "tsc --noEmit -p scripts/tsconfig.validation-contract.json",
    );

    const validatorTsconfig = JSON.parse(
      readFileSync(
        path.join(root, "scripts", "tsconfig.validation-contract.json"),
        "utf8",
      ),
    );
    expect(validatorTsconfig.extends).toBe("../tsconfig.json");
    expect(validatorTsconfig.compilerOptions.noEmit).toBe(true);
    expect(validatorTsconfig.compilerOptions.types).toEqual(["node"]);
    expect(validatorTsconfig.compilerOptions.ignoreDeprecations).toBe("6.0");
    expect(validatorTsconfig.compilerOptions.types).toEqual(["node"]);
    expect(validatorTsconfig.include).toEqual([
      "./validation-contract-kernel.ts",
    ]);
  });
});
