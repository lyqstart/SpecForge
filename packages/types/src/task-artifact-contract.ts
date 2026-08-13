/**
 * Canonical machine-readable contract for tasks.md.
 *
 * Markdown decoration (for example `refs:` versus `**refs**:`) is deliberately
 * excluded from this model. Parsers normalize presentation variants before
 * validating this semantic contract.
 */

import { z } from "zod";
import {
  CP_ID_PATTERN,
  DD_ID_PATTERN,
  REQ_ID_PATTERN,
  TASK_ID_PATTERN,
} from "./id-rules.js";

export const TASK_ARTIFACT_CONTRACT_VERSION = "task-document/v1" as const;

export const TASK_VERIFICATION_TYPES = [
  "unit",
  "property",
  "integration",
  "e2e",
  "regression",
] as const;

export type TaskVerificationType = (typeof TASK_VERIFICATION_TYPES)[number];

const LegacyRequirementIdPattern = /^REQ-[0-9]+$/;
const LegacyDesignDecisionIdPattern = /^DD-[0-9]+$/;
const LegacyTaskIdPattern = /^TASK-[0-9]+$/;
const LegacyCorrectnessPropertyIdPattern = /^CP-[0-9]+$/;

export function isTaskRequirementRef(value: string): boolean {
  return REQ_ID_PATTERN.test(value) || LegacyRequirementIdPattern.test(value);
}

export function isTaskDesignDecisionRef(value: string): boolean {
  return DD_ID_PATTERN.test(value) || LegacyDesignDecisionIdPattern.test(value);
}

export function isTaskCorrectnessPropertyRef(value: string): boolean {
  return (
    CP_ID_PATTERN.test(value) || LegacyCorrectnessPropertyIdPattern.test(value)
  );
}

export function isLegacyTaskArtifactId(value: string): boolean {
  return (
    LegacyRequirementIdPattern.test(value) ||
    LegacyDesignDecisionIdPattern.test(value) ||
    LegacyTaskIdPattern.test(value) ||
    LegacyCorrectnessPropertyIdPattern.test(value)
  );
}

export const TaskArtifactReferenceSchema = z
  .string()
  .refine(
    (value) =>
      isTaskRequirementRef(value) ||
      isTaskDesignDecisionRef(value) ||
      isTaskCorrectnessPropertyRef(value),
    {
      message:
        "reference must be a REQ, DD, or CP identifier supported by task-document/v1",
    },
  );

export const TaskArtifactIdSchema = z
  .string()
  .refine(
    (value) => TASK_ID_PATTERN.test(value) || LegacyTaskIdPattern.test(value),
    {
      message:
        "task_id must use TASK-WI-NNNN-NNN; legacy TASK-N is read-only compatibility",
    },
  );


export const TaskAllowedWriteFileSchema = z
  .string()
  .trim()
  .min(1)
  .superRefine((value, ctx) => {
    const normalized = value.replace(/\\/g, "/");
    if (/^(?:\/|[A-Za-z]:\/)/.test(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "allowed_write_files paths must be repository-relative",
      });
    }
    if (normalized.includes("*") || normalized.includes("?")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "allowed_write_files paths must be concrete files without wildcards",
      });
    }
    if (
      normalized.endsWith("/") ||
      normalized.split("/").some((segment) => segment === ".." || segment.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "allowed_write_files paths must identify concrete files inside the repository",
      });
    }
  });

export const TaskAllowedWriteFilesSchema = z
  .array(TaskAllowedWriteFileSchema)
  .refine(
    (values) =>
      new Set(values.map((value) => value.replace(/\\/g, "/"))).size === values.length,
    { message: "allowed_write_files must not contain duplicate paths" },
  );

const VerificationCommandEntrySchema = z.union([
  z.string().trim().min(1),
  z.array(z.string().trim().min(1)).min(1),
]);

export const TaskVerificationCommandsSchema = z
  .object({
    unit: VerificationCommandEntrySchema.optional(),
    property: VerificationCommandEntrySchema.optional(),
    integration: VerificationCommandEntrySchema.optional(),
    e2e: VerificationCommandEntrySchema.optional(),
    regression: VerificationCommandEntrySchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "verification_commands must contain at least one typed command",
  });

export const TaskArtifactItemSchema = z
  .object({
    task_id: TaskArtifactIdSchema,
    refs: z.array(TaskArtifactReferenceSchema).min(1),
    allowed_write_files: TaskAllowedWriteFilesSchema.default([]),
    verification_commands: TaskVerificationCommandsSchema,
  })
  .superRefine((task, ctx) => {
    if (!task.refs.some(isTaskRequirementRef)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["refs"],
        message:
          "typed verification_commands require at least one requirement reference",
      });
    }
    if (
      task.verification_commands.property !== undefined &&
      !task.refs.some(isTaskCorrectnessPropertyRef)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["refs"],
        message:
          "property verification_commands require a correctness-property reference",
      });
    }
  });

export const TaskArtifactDocumentSchema = z.object({
  contract_version: z.literal(TASK_ARTIFACT_CONTRACT_VERSION),
  tasks: z.array(TaskArtifactItemSchema).min(1),
});

export type TaskVerificationCommands = z.infer<
  typeof TaskVerificationCommandsSchema
>;
export type TaskArtifactItem = z.infer<typeof TaskArtifactItemSchema>;
export type TaskArtifactDocument = z.infer<typeof TaskArtifactDocumentSchema>;
