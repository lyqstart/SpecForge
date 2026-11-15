/** D31: explicit finite requirements, never inferred from natural-language findings. */
import { z } from "zod";

export const REQUIRED_VERIFICATION_BEGIN =
  "SPECFORGE_REQUIRED_VERIFICATION_V1_BEGIN";
export const REQUIRED_VERIFICATION_END =
  "SPECFORGE_REQUIRED_VERIFICATION_V1_END";

const candidatePath = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => {
    if (!value.startsWith("candidates/") || value.includes("\\")) return false;
    const segments = value.split("/");
    return (
      segments.every(
        (segment) =>
          /^[A-Za-z0-9_.-]+$/.test(segment) &&
          !segment.startsWith(".") &&
          !segment.endsWith(".") &&
          !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment),
      ) && value.toLowerCase() !== "candidates/tasks.md"
    );
  }, "REQUIRED_VERIFICATION_CANDIDATE_PATH_INVALID");

export const RequiredVerificationDeclarationSchema = z
  .object({
    schema_version: z.literal("1.0"),
    profile: z.literal("candidate-exact-file-sha256/v1"),
    work_item_id: z.string().regex(/^WI-\d{4,}$/),
    // A source instruction must name the current baseline; callers cannot default it.
    project_spec_manifest_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    candidate_generation: z.string().regex(/^[a-f0-9]{64}$/),
    replacement: z
      .object({ prior_history_sha256: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .optional(),
    requirements: z
      .array(
        z
          .object({
            id: z.string().regex(/^RV-[A-Za-z0-9-]{1,64}$/),
            path: candidatePath,
            owner: z.enum(["sf-requirements", "sf-design", "sf-task-planner"]),
            expected_sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(16),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.requirements.length === 0 && !value.replacement)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "REQUIRED_VERIFICATION_EMPTY_REGISTRATION",
      });
    const ids = new Set<string>();
    const paths = new Set<string>();
    for (const item of value.requirements) {
      const normalizedPath = item.path.toLowerCase();
      if (ids.has(item.id) || paths.has(normalizedPath)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "REQUIRED_VERIFICATION_DUPLICATE",
        });
      }
      ids.add(item.id);
      paths.add(normalizedPath);
    }
  });

export type RequiredVerificationDeclaration = z.infer<
  typeof RequiredVerificationDeclarationSchema
>;

/** Null means no explicit declaration, not proof that prose contains no requirements. */
export function parseRequiredVerificationDeclaration(
  text: string,
): RequiredVerificationDeclaration | null {
  const hasMarker =
    text.includes(REQUIRED_VERIFICATION_BEGIN) ||
    text.includes(REQUIRED_VERIFICATION_END);
  if (!hasMarker) return null;
  if (Buffer.byteLength(text, "utf8") > 128 * 1024)
    throw new Error("REQUIRED_VERIFICATION_SOURCE_TOO_LARGE");
  const lines = text.split(/\r?\n/);
  const starts = lines.flatMap((line, index) =>
    line === REQUIRED_VERIFICATION_BEGIN ? [index] : [],
  );
  const ends = lines.flatMap((line, index) =>
    line === REQUIRED_VERIFICATION_END ? [index] : [],
  );
  if (starts.length !== 1 || ends.length !== 1 || ends[0]! <= starts[0]!) {
    throw new Error("REQUIRED_VERIFICATION_DECLARATION_INVALID");
  }
  const body = lines.slice(starts[0]! + 1, ends[0]!).join("\n");
  // Repeated marker tokens, even outside the block, are ambiguous rather than silently ignored.
  if (
    text.split(REQUIRED_VERIFICATION_BEGIN).length !== 2 ||
    text.split(REQUIRED_VERIFICATION_END).length !== 2
  ) {
    throw new Error("REQUIRED_VERIFICATION_DECLARATION_AMBIGUOUS");
  }
  const parsed: unknown = JSON.parse(body);
  // JSON.parse otherwise silently discards earlier duplicate keys. Inspect
  // valid JSON tokens, decoding escaped keys before comparing within each object.
  const objects: Array<Set<string> | null> = [];
  const tokens = /"(?:\\[\s\S]|[^"\\])*"|[{}]|\[|\]/g;
  for (const token of body.matchAll(tokens)) {
    if (token[0] === "{") objects.push(new Set());
    else if (token[0] === "[") objects.push(null);
    else if (token[0] === "}" || token[0] === "]") objects.pop();
    else if (/^\s*:/.test(body.slice(token.index! + token[0].length))) {
      const keys = objects[objects.length - 1];
      const key: string = JSON.parse(token[0]);
      if (!keys || keys.has(key))
        throw new Error("REQUIRED_VERIFICATION_DUPLICATE_JSON_KEY");
      keys.add(key);
    }
  }
  return RequiredVerificationDeclarationSchema.parse(parsed);
}

const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const RequiredVerificationSourceSchema = z
  .object({
    source: z.literal("required-verification-source/v1"),
    sessionId: z.string().regex(/^ses_[A-Za-z0-9]+$/),
    messageId: z.string().regex(/^msg_[A-Za-z0-9]+$/),
    callId: z.string().min(1),
    tool: z.string().min(1),
    inputSha256: sha,
    agent: z.string().min(1),
    directory: z.string().min(1),
    userSessionId: z.string().regex(/^ses_[A-Za-z0-9]+$/),
    userMessageId: z.string().regex(/^msg_[A-Za-z0-9]+$/),
    userTextSha256: sha,
    userCreatedAt: z.number().int().nonnegative(),
    observedAt: z.string().datetime(),
    declaration: RequiredVerificationDeclarationSchema.nullable(),
    chainSha256: sha,
  })
  .strict();
export const RequiredFileIdentitySchema = z
  .object({
    dev: z.string().regex(/^\d+$/),
    ino: z.string().regex(/^\d+$/),
    size: z.string().regex(/^\d+$/),
    mtimeNs: z.string().regex(/^-?\d+$/),
    ctimeNs: z.string().regex(/^-?\d+$/),
  })
  .strict();
const header = {
  contract: z.literal("required-verification-record/v1"),
  work_item_id: z.string().regex(/^WI-\d{4,}$/),
};
export const RequiredRegistrationRecordSchema = z
  .object({
    ...header,
    declaration: RequiredVerificationDeclarationSchema,
    source: RequiredVerificationSourceSchema,
  })
  .strict();
export const RequiredProofRecordSchema = z
  .object({
    ...header,
    requirement_key: z.string().min(1),
    generation: sha,
    outcome: z.enum(["passed", "failed", "unavailable"]),
    source: RequiredVerificationSourceSchema,
    actual_sha256: sha.optional(),
    identity: RequiredFileIdentitySchema.optional(),
    failure_code: z
      .string()
      .regex(/^[A-Z0-9_]{1,128}$/)
      .optional(),
  })
  .strict();
export type RequiredProofRecord = z.infer<typeof RequiredProofRecordSchema>;
export const RequiredConsumptionRecordSchema = z
  .object({
    ...header,
    prior_history_sha256: sha,
    merge_transition_event_id: z.string().min(1),
    merge_report_sha256: sha,
    resulting_spec_sha256: sha,
  })
  .strict();
export type RequiredVerificationSourceRecord = z.infer<
  typeof RequiredVerificationSourceSchema
>;
