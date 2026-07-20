import { MODULE_CODE_PATTERN } from "./id-rules.js";

/** Canonical and legacy fields that have represented the same module identity. */
export const SPEC_MODULE_IDENTITY_FIELDS = [
  "module_code",
  "name",
  "module_id",
  "module",
  "id",
] as const;

export type SpecModuleIdentityField =
  (typeof SPEC_MODULE_IDENTITY_FIELDS)[number];

export interface SpecModuleIdentityResolution {
  valid: boolean;
  moduleCode?: string;
  sourceFields: SpecModuleIdentityField[];
  legacy: boolean;
  errors: string[];
}

/**
 * Converts an explicit module reference into canonical MODULE_CODE form.
 *
 * Compatibility is deliberately narrow: case differences and the historical
 * `MOD-` prefix are accepted. Separators and arbitrary path names are not
 * rewritten because doing so could silently change module identity.
 */
export function normalizeModuleCodeReference(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const withoutLegacyPrefix = raw.replace(/^MOD-/i, "");
  const canonical = withoutLegacyPrefix.toUpperCase();
  return MODULE_CODE_PATTERN.test(canonical) ? canonical : null;
}

/**
 * Resolves one manifest/reference value without assigning precedence to
 * competing identity fields. Conflicting explicit fields fail closed.
 */
export function resolveSpecModuleIdentity(
  value: unknown,
): SpecModuleIdentityResolution {
  if (typeof value === "string" || typeof value === "number") {
    const moduleCode = normalizeModuleCodeReference(value);
    return moduleCode
      ? {
          valid: true,
          moduleCode,
          sourceFields: [],
          legacy: String(value).trim() !== moduleCode,
          errors: [],
        }
      : {
          valid: false,
          sourceFields: [],
          legacy: true,
          errors: [`Invalid module reference: ${String(value)}`],
        };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      valid: false,
      sourceFields: [],
      legacy: false,
      errors: ["Module entry must be an object or explicit module reference"],
    };
  }

  const record = value as Record<string, unknown>;
  const sources: Array<{
    field: SpecModuleIdentityField;
    raw: string;
    code: string;
  }> = [];
  const errors: string[] = [];

  for (const field of SPEC_MODULE_IDENTITY_FIELDS) {
    const candidate = record[field];
    if (
      candidate === undefined ||
      candidate === null ||
      String(candidate).trim() === ""
    )
      continue;
    const code = normalizeModuleCodeReference(candidate);
    if (!code) {
      errors.push(`Invalid ${field}: ${String(candidate)}`);
      continue;
    }
    sources.push({ field, raw: String(candidate).trim(), code });
  }

  if (sources.length === 0) {
    errors.push(
      "Module entry does not declare module_code or a supported legacy identity field",
    );
  }

  const distinctCodes = Array.from(
    new Set(sources.map((source) => source.code)),
  );
  if (distinctCodes.length > 1) {
    errors.push(
      `Conflicting module identity fields: ${sources
        .map((source) => `${source.field}=${source.raw}`)
        .join(", ")}`,
    );
  }

  const moduleCode = distinctCodes.length === 1 ? distinctCodes[0] : undefined;
  const canonicalSource = sources.find(
    (source) => source.field === "module_code",
  );
  const legacy =
    !canonicalSource ||
    canonicalSource.raw !== moduleCode ||
    sources.some((source) => source.field !== "module_code");

  return {
    valid: errors.length === 0 && Boolean(moduleCode),
    moduleCode,
    sourceFields: sources.map((source) => source.field),
    legacy,
    errors,
  };
}

/** Extracts a canonical MODULE_CODE from a canonical Project Spec module path. */
export function moduleCodeFromProjectSpecPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  const match =
    /(?:^|\/)\.specforge\/project\/modules\/([^/]+)(?:\/|$)/.exec(normalized) ??
    /(?:^|\/)project\/modules\/([^/]+)(?:\/|$)/.exec(normalized);
  return match?.[1] ? normalizeModuleCodeReference(match[1]) : null;
}

export function canonicalProjectSpecModuleEntry(moduleCodeValue: unknown) {
  const moduleCode = normalizeModuleCodeReference(moduleCodeValue);
  if (!moduleCode) {
    throw new Error(`Invalid MODULE_CODE: ${String(moduleCodeValue)}`);
  }
  const root = `.specforge/project/modules/${moduleCode}`;
  return {
    module_code: moduleCode,
    path: root,
    module_file: `${root}/module.json`,
    requirements: `${root}/requirements.md`,
    design: `${root}/design.md`,
    trace: `${root}/trace.md`,
  };
}
