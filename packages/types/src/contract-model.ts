/**
 * Canonical, machine-readable cross-module contract types.
 *
 * These types describe the optional `contracts` block inside
 * `.specforge/project/extension_registry.json`. They live in the shared type
 * package so contract consumers do not depend on the retired v1.1 extension
 * subflow implementation.
 */

import { z } from "zod";

export const SharedEnumValueTypeSchema = z.enum(["string", "number"]);

export const SharedEnumContractSchema = z
  .object({
    id: z.string().min(1),
    owner_module: z.string().min(1),
    value_type: SharedEnumValueTypeSchema.optional(),
    values: z.array(z.union([z.string(), z.number().finite()])).min(1),
    change_policy: z.string().optional(),
    description: z.string().optional(),
  })
  .superRefine((entry, ctx) => {
    const valueType = entry.value_type ?? "string";

    if (valueType === "string") {
      if (
        entry.values.some(
          (value) => typeof value !== "string" || value.trim().length === 0,
        ) ||
        new Set(entry.values).size !== entry.values.length
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["values"],
          message:
            'values must contain unique non-empty strings when value_type is "string"',
        });
      }
      return;
    }

    if (
      entry.values.some(
        (value) => typeof value !== "number" || !Number.isFinite(value),
      ) ||
      new Set(entry.values).size !== entry.values.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["values"],
        message:
          'values must contain unique finite numbers when value_type is "number"',
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
});

export const PublicInterfaceContractSchema = z.object({
  id: z.string().min(1),
  owner_module: z.string().min(1),
  surface: z.string().optional(),
  description: z.string().optional(),
});

export const ExtensionPointContractSchema = z.object({
  id: z.string().min(1),
  owner_module: z.string().min(1),
  interface: z.string().min(1),
  extend_by: z.string().min(1),
  description: z.string().optional(),
});

export const ContractRegistrySchema = z.object({
  shared_enums: z.array(SharedEnumContractSchema),
  invariants: z.array(InvariantContractSchema),
  public_interfaces: z.array(PublicInterfaceContractSchema),
  extension_points: z.array(ExtensionPointContractSchema),
});

export type SharedEnumValueType = z.infer<typeof SharedEnumValueTypeSchema>;
export type SharedEnumValue = string | number;
export type SharedEnumContract = z.infer<typeof SharedEnumContractSchema>;
export type InvariantContract = z.infer<typeof InvariantContractSchema>;
export type PublicInterfaceContract = z.infer<
  typeof PublicInterfaceContractSchema
>;
export type ExtensionPointContract = z.infer<
  typeof ExtensionPointContractSchema
>;
export type ContractRegistry = z.infer<typeof ContractRegistrySchema>;
