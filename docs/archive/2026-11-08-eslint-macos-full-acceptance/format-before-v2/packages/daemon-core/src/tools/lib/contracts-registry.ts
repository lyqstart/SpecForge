/**
 * Read-side access to the existing Project/Module Contract model.
 *
 * Project Contracts remain authoritative in extension_registry.json. Module
 * Contracts remain authoritative in each Module contracts.json. This module
 * combines both governance levels for validation and code reconciliation; it
 * never stores consumers because formal Trace is their only truth source.
 *
 * Brownfield compatibility applies only when a Module Contract path was never
 * declared. Once spec_manifest.json explicitly declares the file, a missing or
 * malformed file is an integrity error rather than an empty registry.
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
} from '@specforge/types';

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
  value: string | number,
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

export type ContractGovernanceLevel = 'project' | 'module';
export type ContractKind =
  | 'shared_enum'
  | 'invariant'
  | 'public_interface'
  | 'extension_point';

export type RuntimeContractDefinition = {
  id: string;
  kind: ContractKind;
  governance_level: ContractGovernanceLevel;
  owner_module: string;
  source_refs: string[];
  enforcement: string;
  definition_path: string;
  raw: Record<string, unknown>;
};

export type UnifiedContractsReadModel = {
  contracts: RuntimeContractDefinition[];
  project_registry: ContractRegistry;
  module_registries: Record<string, ContractRegistry>;
  input_files: string[];
  errors: string[];
};

function normalizePath(value: string): string {
  return String(value ?? '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function flattenRegistry(
  registry: ContractRegistry,
  governanceLevel: ContractGovernanceLevel,
  definitionPath: string,
): RuntimeContractDefinition[] {
  const result: RuntimeContractDefinition[] = [];
  const fields: Array<[ContractKind, keyof ContractRegistry]> = [
    ['shared_enum', 'shared_enums'],
    ['invariant', 'invariants'],
    ['public_interface', 'public_interfaces'],
    ['extension_point', 'extension_points'],
  ];
  for (const [kind, field] of fields) {
    for (const entry of registry[field] as unknown as Array<Record<string, unknown>>) {
      const id = String(entry.id ?? '').trim();
      if (!id) continue;
      result.push({
        id,
        kind,
        governance_level: governanceLevel,
        owner_module: String(entry.owner_module ?? '').trim().toUpperCase(),
        source_refs: unique(
          Array.isArray(entry.source_refs)
            ? entry.source_refs.map(value => String(value ?? '').trim())
            : [],
        ),
        enforcement: String(entry.enforcement ?? '').trim(),
        definition_path: normalizePath(definitionPath),
        raw: entry,
      });
    }
  }
  return result;
}

function normalizeRegistry(value: unknown): ContractRegistry {
  const record = value && typeof value === 'object' ? (value as any) : {};
  return {
    shared_enums: asArray<SharedEnumContract>(record.shared_enums),
    invariants: asArray<InvariantContract>(record.invariants),
    public_interfaces: asArray<PublicInterfaceContract>(record.public_interfaces),
    extension_points: asArray<ExtensionPointContract>(record.extension_points),
  };
}

/**
 * Read both Project Contracts and Module Contracts into one read-side view.
 * Consumer relationships are deliberately absent: Trace remains their only
 * truth source.
 */
export function readUnifiedContracts(projectRoot: string): UnifiedContractsReadModel {
  const errors: string[] = [];
  const inputFiles: string[] = [];
  const contracts: RuntimeContractDefinition[] = [];
  const projectRegistry = readContractsRegistry(projectRoot);
  const projectRegistryPath = path.join(
    projectRoot,
    SPEC_DIR_NAME,
    'project',
    'extension_registry.json',
  );
  inputFiles.push(projectRegistryPath);
  if (fs.existsSync(projectRegistryPath)) {
    try {
      JSON.parse(fs.readFileSync(projectRegistryPath, 'utf-8'));
    } catch (error) {
      errors.push(`Cannot read extension_registry.json: ${(error as Error).message}`);
    }
  }
  contracts.push(...flattenRegistry(projectRegistry, 'project', projectRegistryPath));

  const moduleRegistries: Record<string, ContractRegistry> = {};
  const manifestPath = path.join(projectRoot, SPEC_DIR_NAME, 'project', 'spec_manifest.json');
  inputFiles.push(manifestPath);
  let manifest: any = null;
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch (error) {
      errors.push(`Cannot read spec_manifest.json: ${(error as Error).message}`);
    }
  }

  for (const raw of Array.isArray(manifest?.modules) ? manifest.modules : []) {
    const moduleCode = String(raw?.module_code ?? raw?.module ?? '').trim().toUpperCase();
    if (!moduleCode) continue;
    const explicitlyDeclared =
      (typeof raw?.contracts === 'string' && raw.contracts.trim().length > 0) ||
      (typeof raw?.contract_file === 'string' && raw.contract_file.trim().length > 0);
    const relative = normalizePath(
      String(
        raw?.contracts ??
          raw?.contract_file ??
          `${SPEC_DIR_NAME}/project/modules/${moduleCode}/contracts.json`,
      ),
    );
    const contractPath = path.isAbsolute(relative)
      ? relative
      : path.join(projectRoot, ...relative.split('/'));
    inputFiles.push(contractPath);
    if (!fs.existsSync(contractPath) && !explicitlyDeclared) {
      moduleRegistries[moduleCode] = emptyRegistry();
      continue;
    }
    try {
      const data = JSON.parse(fs.readFileSync(contractPath, 'utf-8')) as any;
      const owner = String(data?.owner_module ?? '').trim().toUpperCase();
      if (owner && owner !== moduleCode) {
        errors.push(`${relative}: owner_module=${owner}, expected ${moduleCode}`);
      }
      const registry = normalizeRegistry(data?.contracts);
      moduleRegistries[moduleCode] = registry;
      contracts.push(...flattenRegistry(registry, 'module', relative));
    } catch (error) {
      errors.push(`${relative}: ${(error as Error).message}`);
    }
  }

  const definitionsById = new Map<string, RuntimeContractDefinition[]>();
  for (const contract of contracts) {
    const entries = definitionsById.get(contract.id) ?? [];
    entries.push(contract);
    definitionsById.set(contract.id, entries);
  }
  for (const [contractId, definitions] of definitionsById) {
    if (definitions.length > 1) {
      errors.push(
        `Contract ${contractId} has multiple formal definitions: ${definitions
          .map(definition => definition.definition_path)
          .join(', ')}`,
      );
    }
  }

  return {
    contracts,
    project_registry: projectRegistry,
    module_registries: moduleRegistries,
    input_files: unique(inputFiles),
    errors,
  };
}

function globToRegex(pattern: string): RegExp {
  const value = normalizePath(pattern).replace(/^\/+/, '');
  let expression = '^';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '*') {
      if (value[index + 1] === '*') {
        index += 1;
        expression += '.*';
      } else {
        expression += '[^/]*';
      }
    } else if (char === '?') {
      expression += '[^/]';
    } else {
      expression += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${expression}$`);
}

/** Resolve a production file to exactly the Modules whose code_paths own it. */
export function resolveCodePathModules(projectRoot: string, filePath: string): string[] {
  const normalized = normalizePath(
    path.isAbsolute(filePath) ? path.relative(projectRoot, filePath) : filePath,
  );
  const manifestPath = path.join(projectRoot, SPEC_DIR_NAME, 'project', 'spec_manifest.json');
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as any;
    const owners: string[] = [];
    for (const raw of Array.isArray(manifest?.modules) ? manifest.modules : []) {
      const moduleCode = String(raw?.module_code ?? raw?.module ?? '').trim().toUpperCase();
      const codePaths = Array.isArray(raw?.code_paths) ? raw.code_paths : [];
      if (
        moduleCode &&
        codePaths.some((pattern: unknown) => globToRegex(String(pattern ?? '')).test(normalized))
      ) {
        owners.push(moduleCode);
      }
    }
    return unique(owners);
  } catch {
    return [];
  }
}
