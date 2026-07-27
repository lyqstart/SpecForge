/**
 * Canonical, machine-readable project and module contract types.
 */
import { z } from "zod";

const ProvenanceSchema = {
  source_refs: z.array(z.string().min(1)).optional(),
  enforcement: z.string().min(1).optional(),
};

export const SharedEnumValueTypeSchema = z.enum(["string", "number"]);
export const SharedEnumContractSchema = z
  .object({
    id: z.string().min(1),
    owner_module: z.string().min(1),
    value_type: SharedEnumValueTypeSchema.optional(),
    values: z.array(z.union([z.string(), z.number().finite()])).min(1),
    change_policy: z.string().optional(),
    description: z.string().optional(),
    ...ProvenanceSchema,
  })
  .superRefine((entry, ctx) => {
    const valueType = entry.value_type ?? "string";
    if (valueType === "string") {
      if (
        entry.values.some(
          (value) => typeof value !== "string" || value.trim().length === 0,
        ) || new Set(entry.values).size !== entry.values.length
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["values"],
          message: 'values must contain unique non-empty strings when value_type is "string"',
        });
      }
      return;
    }
    if (
      entry.values.some(
        (value) => typeof value !== "number" || !Number.isFinite(value),
      ) || new Set(entry.values).size !== entry.values.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["values"],
        message: 'values must contain unique finite numbers when value_type is "number"',
      });
    }
  });

export const InvariantContractSchema = z.object({
  id: z.string().min(1),
  rule: z.string().min(1),
  scope: z.enum(["global", "module"]),
  owner_module: z.string().min(1),
  enforcement: z.string().optional(),
  rationale: z.string().optional(),
  source_refs: z.array(z.string().min(1)).optional(),
});

export const PublicInterfaceContractSchema = z.object({
  id: z.string().min(1),
  owner_module: z.string().min(1),
  surface: z.string().optional(),
  description: z.string().optional(),
  ...ProvenanceSchema,
});

export const ExtensionPointContractSchema = z.object({
  id: z.string().min(1),
  owner_module: z.string().min(1),
  interface: z.string().min(1),
  extend_by: z.string().min(1),
  description: z.string().optional(),
  ...ProvenanceSchema,
});

export const ContractRegistrySchema = z.object({
  shared_enums: z.array(SharedEnumContractSchema),
  invariants: z.array(InvariantContractSchema),
  public_interfaces: z.array(PublicInterfaceContractSchema),
  extension_points: z.array(ExtensionPointContractSchema),
});

export const ModuleContractFileSchema = z.object({
  schema_version: z.literal("1.0"),
  owner_module: z.string().min(1),
  contracts: ContractRegistrySchema,
});

export type SharedEnumValueType = z.infer<typeof SharedEnumValueTypeSchema>;
export type SharedEnumValue = string | number;
export type SharedEnumContract = z.infer<typeof SharedEnumContractSchema>;
export type InvariantContract = z.infer<typeof InvariantContractSchema>;
export type PublicInterfaceContract = z.infer<typeof PublicInterfaceContractSchema>;
export type ExtensionPointContract = z.infer<typeof ExtensionPointContractSchema>;
export type ContractRegistry = z.infer<typeof ContractRegistrySchema>;
export type ModuleContractFile = z.infer<typeof ModuleContractFileSchema>;
