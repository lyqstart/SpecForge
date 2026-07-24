/**
 * contracts-registry.ts — read-side access to the cross-module contract model.
 *
 * The canonical schema lives in @specforge/workflow-runtime
 * (ExtensionRegistry.ts `ContractRegistry` + entry types); the single source of
 * truth at runtime is the `contracts` block inside
 * `.specforge/project/extension_registry.json`. This module only READS and
 * normalizes it for conformance checks — it never writes the truth source
 * (writes go through the governed Extension Subflow → gate → user decision →
 * merge, and PathPolicy hard-blocks direct writes to extension_registry.json).
 *
 * Brownfield-safe: a project whose registry has no `contracts` block (or empty
 * arrays) yields an empty registry. Consumers must treat "empty" as "nothing
 * under contract governance yet" (warn, do not block) — see design doc §6.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import type {
  ContractRegistry,
  SharedEnumContract,
  InvariantContract,
  PublicInterfaceContract,
  ExtensionPointContract,
} from '@specforge/workflow-runtime';

export type {
  ContractRegistry,
  SharedEnumContract,
  InvariantContract,
  PublicInterfaceContract,
  ExtensionPointContract,
};

function emptyRegistry(): ContractRegistry {
  return {
    shared_enums: [],
    invariants: [],
    public_interfaces: [],
    extension_points: [],
  };
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Read and normalize the contract registry for a project. Never throws:
 * missing file / missing `contracts` block / malformed JSON all yield an empty
 * (brownfield-safe) registry.
 */
export function readContractsRegistry(projectRoot: string): ContractRegistry {
  try {
    const registryPath = path.join(
      projectRoot,
      SPEC_DIR_NAME,
      'project',
      'extension_registry.json',
    );
    const raw = fs.readFileSync(registryPath, 'utf-8');
    const data = JSON.parse(raw) as { contracts?: unknown };
    const c = data?.contracts as Partial<ContractRegistry> | undefined;
    if (!c || typeof c !== 'object') return emptyRegistry();
    return {
      shared_enums: asArray<SharedEnumContract>((c as any).shared_enums),
      invariants: asArray<InvariantContract>((c as any).invariants),
      public_interfaces: asArray<PublicInterfaceContract>((c as any).public_interfaces),
      extension_points: asArray<ExtensionPointContract>((c as any).extension_points),
    };
  } catch {
    return emptyRegistry();
  }
}

/** True when at least one contract of any kind is registered. */
export function hasAnyContracts(registry: ContractRegistry): boolean {
  return (
    registry.shared_enums.length > 0 ||
    registry.invariants.length > 0 ||
    registry.public_interfaces.length > 0 ||
    registry.extension_points.length > 0
  );
}

/** Find a registered shared enum by its canonical id. */
export function findSharedEnum(
  registry: ContractRegistry,
  enumId: string,
): SharedEnumContract | undefined {
  return registry.shared_enums.find((e) => e.id === enumId);
}

/** True when `value` is an authoritative member of the registered enum `enumId`. */
export function isRegisteredEnumValue(
  registry: ContractRegistry,
  enumId: string,
  value: string,
): boolean {
  const entry = findSharedEnum(registry, enumId);
  return !!entry && entry.values.includes(value);
}

/** The owning MODULE_CODE for a registered enum, if any. */
export function getEnumOwner(
  registry: ContractRegistry,
  enumId: string,
): string | undefined {
  return findSharedEnum(registry, enumId)?.owner_module;
}
