/**
 * Canonical, machine-readable cross-module contract types.
 *
 * These types describe the optional `contracts` block inside
 * `.specforge/project/extension_registry.json`. They live in the shared type
 * package so contract consumers do not depend on the retired v1.1 extension
 * subflow implementation.
 */

import { z } from "zod";

export const SharedEnumContractSchema = z.object({
  id: z.string().min(1),
  owner_module: z.string().min(1),
  values: z.array(z.string().min(1)).min(1),
  change_policy: z.string().optional(),
  description: z.string().optional(),
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

export type SharedEnumContract = z.infer<typeof SharedEnumContractSchema>;
export type InvariantContract = z.infer<typeof InvariantContractSchema>;
export type PublicInterfaceContract = z.infer<
  typeof PublicInterfaceContractSchema
>;
export type ExtensionPointContract = z.infer<
  typeof ExtensionPointContractSchema
>;
export type ContractRegistry = z.infer<typeof ContractRegistrySchema>;
