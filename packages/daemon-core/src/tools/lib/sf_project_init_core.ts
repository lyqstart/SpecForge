/**
 * sf_project_init_core.ts — project bootstrap repair (Patch A.1)
 *
 * Fixes the bootstrap deadlock observed after Patch A:
 * - sf_project_init created .specforge/project/spec_manifest.json but root
 *   .specforge/manifest.json was missing in the runtime artifact.
 * - sf_state_transition requires .specforge/manifest.json when creating a WI.
 * - OBS-FULL Layer 1 requires project-local .specforge/config/observability.json.
 *
 * This implementation explicitly ensures critical bootstrap files before and
 * after layout traversal, independent of LAYOUT drift.
 */

import { mkdir, writeFile, access, readFile, readdir } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { LAYOUT, SPEC_DIR_NAME, legacyPaths } from '@specforge/types/directory-layout';
import {
  canonicalProjectSpecModuleEntry,
  normalizeModuleCodeReference,
  resolveSpecModuleIdentity,
} from '@specforge/types';
import { scanHostProfile, PROFILE_TTL_MS, getHostProfilePath } from '@specforge/host-profile';

export interface InitEntry {
  /** Relative path from project root, including .specforge */
  path: string;
  type: 'dir' | 'system_file' | 'user_file';
}

/**
 * Outcome of the idempotent module-registry normalization performed by
 * ensureProjectInit for pre-existing / upgraded / damaged projects.
 *
 * - `unchanged`: the registry was already canonical-healthy, or nothing safe
 *   could be read; no write was performed.
 * - `normalized`: an empty / legacy / non-canonical single-CORE registry was
 *   structurally repaired to the canonical CORE entry. Version was NOT bumped.
 * - `requires_spec_migration`: the registry is broken in a way that cannot be
 *   safely resolved as CORE-only (invalid entries, non-CORE modules, or a
 *   missing/invalid authoritative CORE definition). Init made NO change; a
 *   governed spec_migration_path is required.
 */
export interface ModuleRegistryNormalization {
  status: 'unchanged' | 'normalized' | 'requires_spec_migration';
  reason?: string;
  moduleCodes?: string[];
}

export interface InitResult {
  success: boolean;
  created: string[];
  existed: string[];
  errors: string[];
  placeholderFiles: string[];
  /** spec_manifest.json paths whose module registry was structurally normalized. */
  normalized: string[];
  /** Outcome of the idempotent module-registry normalization. */
  moduleRegistry: ModuleRegistryNormalization;
}

type SystemTemplate = (projectName: string, now: string) => string;

const SYSTEM_FILE_CONTENT: Record<string, SystemTemplate> = {
  'manifest.json': (name, now) =>
    JSON.stringify(
      {
        schema_version: '6.0',
        project_name: name,
        created_at: now,
      },
      null,
      2
    ) + '\n',

  'config/project.json': () => JSON.stringify({ schema_version: '1.0' }, null, 2) + '\n',

  'config/risk_policy.json': () =>
    JSON.stringify({ schema_version: '1.0', rules: [] }, null, 2) + '\n',

  'config/skill_fragments.json': () =>
    JSON.stringify({ schema_version: '1.0', fragments: {} }, null, 2) + '\n',

  'config/observability.json': () =>
    JSON.stringify(
      {
        enabled: true,
        level: 'replay',
        capture_plugin_events: true,
        capture_tool_calls: true,
        capture_tool_context: true,
        capture_raw_context: true,
        capture_daemon_rpc: true,
        capture_handler_io: true,
        capture_state_snapshots: true,
        capture_artifact_io: true,
        capture_gate_inputs: true,
        capture_hardstop: true,
        capture_payload: true,
        redact_secrets: true,
        max_inline_payload_bytes: 0,
        payload_storage: 'file',
        capture_raw_context_full: false,
        capture_raw_context_summary: true,
        record_event_payload: false,
        ignored_events: [
          'message.part.updated',
          'message.updated',
          'session.updated',
          'session.status',
          'session.diff',
        ],
        summary_events: [
          'message.part.delta',
          'experimental.chat.messages.transform',
          'experimental.chat.system.transform',
          'chat.params',
          'chat.headers',
        ],
      },
      null,
      2
    ) + '\n',

  'knowledge/graph.json': () => JSON.stringify({ nodes: [], edges: [] }, null, 2) + '\n',

  'specs/README.md': () => '# Specs\n\nWork Item 规格文档目录。\n',

  'project/spec_manifest.json': name =>
    JSON.stringify(
      {
        schema_version: '1.0',
        project_spec_version: 'PSV-0001',
        project_name: name,
        project: {
          extension_registry: '.specforge/project/extension_registry.json',
          requirements_index: '.specforge/project/requirements_index.md',
          design_index: '.specforge/project/design_index.md',
          architecture: '.specforge/project/architecture.md',
          glossary: '.specforge/project/glossary.md',
          decisions: '.specforge/project/decisions.md',
          trace_matrix: '.specforge/project/trace_matrix.md',
        },
        default_module: 'CORE',
        modules: [
          {
            module_code: 'CORE',
            path: '.specforge/project/modules/CORE',
            module_file: '.specforge/project/modules/CORE/module.json',
            requirements: '.specforge/project/modules/CORE/requirements.md',
            design: '.specforge/project/modules/CORE/design.md',
            trace: '.specforge/project/modules/CORE/trace.md',
          },
        ],
      },
      null,
      2
    ) + '\n',

  'project/extension_registry.json': () =>
    JSON.stringify(
      {
        schema_version: '1.0',
        project_spec_version: 'PSV-0001',
        namespaces: {
          requirement_types: [],
          design_types: [],
          task_types: [],
          verification_types: [],
          gate_types: [],
        },
        updated_by_work_item: null,
        updated_at: null,
        contracts: {
          shared_enums: [],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
        },
      },
      null,
      2
    ) + '\n',

  'project/modules/CORE/module.json': () =>
    JSON.stringify({ module_code: 'CORE', status: 'active' }, null, 2) + '\n',

  '.gitignore': () => 'runtime/\nlogs/\nsessions/\narchive/\ncas/\n',
};

const PLACEHOLDER_CONTENT = '> TODO: 由首次 intake 阶段填充\n';

const PLACEHOLDER_CHECK_FILES = ['config/prod-environment.md', 'config/project-rules.md'];

const V1_1_PROJECT_USER_FILES = [
  'project/requirements_index.md',
  'project/design_index.md',
  'project/architecture.md',
  'project/glossary.md',
  'project/decisions.md',
  'project/trace_matrix.md',
  'project/modules/CORE/requirements.md',
  'project/modules/CORE/design.md',
  'project/modules/CORE/trace.md',
];

function normalizeLayoutPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function isCanonicalProjectSpecModuleEntry(entry: unknown, moduleCode: string): boolean {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const baseCanonical = canonicalProjectSpecModuleEntry(moduleCode);
  if (JSON.stringify(entry) === JSON.stringify(baseCanonical)) return true;

  const record = entry as Record<string, unknown>;
  const hasGovernanceShape =
    Object.prototype.hasOwnProperty.call(record, 'contracts') ||
    Object.prototype.hasOwnProperty.call(record, 'code_paths');
  if (!hasGovernanceShape) return false;

  const codePaths = Array.isArray(record.code_paths)
    ? record.code_paths.map(value => String(value ?? ''))
    : [];
  const governedCanonical = canonicalProjectSpecModuleEntry(moduleCode, {
    include_governance: true,
    code_paths: codePaths,
  });
  return JSON.stringify(entry) === JSON.stringify(governedCanonical);
}

/**
 * Ensure root .specforge/manifest.json explicitly.
 *
 * This is intentionally independent of LAYOUT. If directory-layout.ts drifts,
 * project bootstrap must still satisfy sf_state_transition's guard.
 */
async function ensureRootManifest(
  projectRoot: string,
  projectName: string,
  now: string,
  result: InitResult
): Promise<void> {
  const manifestRel = join(SPEC_DIR_NAME, 'manifest.json');
  const manifestPath = join(projectRoot, manifestRel);
  const content = SYSTEM_FILE_CONTENT['manifest.json'](projectName, now);

  await mkdir(dirname(manifestPath), { recursive: true });

  const exists = await fileExists(manifestPath);
  if (!exists) {
    await writeFile(manifestPath, content, 'utf-8');
    if (!result.created.includes(manifestRel)) result.created.push(manifestRel);
    return;
  }

  try {
    const existing = await readFile(manifestPath, 'utf-8');
    if (!existing.trim()) {
      await writeFile(manifestPath, content, 'utf-8');
      if (!result.created.includes(manifestRel)) result.created.push(manifestRel);
    } else if (!result.existed.includes(manifestRel)) {
      result.existed.push(manifestRel);
    }
  } catch {
    await writeFile(manifestPath, content, 'utf-8');
    if (!result.created.includes(manifestRel)) result.created.push(manifestRel);
  }
}

function buildManifest(): InitEntry[] {
  const entries: InitEntry[] = [];

  // Root manifest is critical and must always be present, regardless of LAYOUT.
  entries.push({ path: join(SPEC_DIR_NAME, 'manifest.json'), type: 'system_file' });

  // Observability config is project-local and must be visibly present after sf_project_init.
  // If missing, OBS is off by design, so project initialization must deploy it.
  entries.push({ path: join(SPEC_DIR_NAME, 'config', 'observability.json'), type: 'system_file' });
  entries.push({
    path: join(SPEC_DIR_NAME, 'project', 'modules', 'CORE', 'module.json'),
    type: 'system_file',
  });
  for (const filename of ['requirements.md', 'design.md', 'trace.md']) {
    entries.push({
      path: join(SPEC_DIR_NAME, 'project', 'modules', 'CORE', filename),
      type: 'user_file',
    });
  }

  for (const [key, value] of Object.entries(LAYOUT as Record<string, unknown>)) {
    if (key === 'configFiles' || key === 'projectFiles' || key === 'workItemFiles') continue;

    if (typeof value === 'string') {
      const normalized = normalizeLayoutPath(value);
      const hasExt = extname(normalized) !== '';
      if (hasExt) {
        const entry = makeFileEntry(normalized);
        if (entry) entries.push(entry);
      } else {
        entries.push({ path: join(SPEC_DIR_NAME, normalized), type: 'dir' });
      }
    }
  }

  for (const subValue of Object.values(legacyPaths.configFiles ?? {})) {
    if (typeof subValue === 'string') {
      const entry = makeFileEntry(normalizeLayoutPath(subValue));
      if (entry) entries.push(entry);
    }
  }

  const projectFiles = (LAYOUT as any).projectFiles ?? {};
  for (const [key, subValue] of Object.entries(projectFiles)) {
    if (typeof subValue === 'string') {
      const normalized = normalizeLayoutPath(subValue);
      if (key === 'modulesRoot') {
        entries.push({ path: join(SPEC_DIR_NAME, normalized), type: 'dir' });
      } else {
        const entry = makeFileEntry(normalized);
        if (entry) entries.push(entry);
      }
    }
  }

  entries.push({ path: join(SPEC_DIR_NAME, '.gitignore'), type: 'system_file' });

  // Dedupe by path; root manifest may appear from both explicit entry and LAYOUT.
  const seen = new Set<string>();
  return entries.filter(entry => {
    const key = entry.path.replace(/\\/g, '/');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeFileEntry(relativePath: string): InitEntry | null {
  const normalized = normalizeLayoutPath(relativePath);
  const fullPath = join(SPEC_DIR_NAME, normalized);

  if (PLACEHOLDER_CHECK_FILES.includes(normalized)) {
    return { path: fullPath, type: 'user_file' };
  }

  if (V1_1_PROJECT_USER_FILES.includes(normalized)) {
    return { path: fullPath, type: 'user_file' };
  }

  if (normalized in SYSTEM_FILE_CONTENT) {
    return { path: fullPath, type: 'system_file' };
  }

  return null;
}

export async function ensureProjectInit(
  projectRoot: string,
  projectName?: string
): Promise<InitResult> {
  const result: InitResult = {
    success: true,
    created: [],
    existed: [],
    errors: [],
    placeholderFiles: [],
    normalized: [],
    moduleRegistry: { status: 'unchanged' },
  };

  const name = projectName || projectRoot.split(/[/\\]/).pop() || 'untitled';
  const now = new Date().toISOString();

  try {
    await ensureRootManifest(projectRoot, name, now, result);
  } catch (err: any) {
    result.errors.push(`${SPEC_DIR_NAME}/manifest.json: ${err.message}`);
    result.success = false;
  }

  const manifest = buildManifest();

  const dirs = manifest.filter(e => e.type === 'dir');
  for (const entry of dirs) {
    const fullPath = join(projectRoot, entry.path);
    try {
      await mkdir(fullPath, { recursive: true });
    } catch (err: any) {
      if (err.code !== 'EEXIST') {
        result.errors.push(`${entry.path}: ${err.message}`);
        result.success = false;
      }
    }
  }

  const files = manifest.filter(e => e.type !== 'dir');
  for (const entry of files) {
    const fullPath = join(projectRoot, entry.path);
    const normalizedRel = normalizeLayoutPath(
      entry.path.startsWith(SPEC_DIR_NAME + '/')
        ? entry.path.slice(SPEC_DIR_NAME.length + 1)
        : entry.path.startsWith(SPEC_DIR_NAME + '\\')
          ? entry.path.slice(SPEC_DIR_NAME.length + 1)
          : entry.path
    );

    try {
      await mkdir(dirname(fullPath), { recursive: true });

      const exists = await fileExists(fullPath);

      if (entry.type === 'system_file') {
        const content = await getSystemFileContent(entry, name, now);

        if (exists) {
          try {
            const existing = await readFile(fullPath, 'utf-8');
            // Do not overwrite a non-empty root manifest if it already exists.
            // Do not overwrite a non-empty observability config because it is user/project policy.
            // Do not overwrite a non-empty extension_registry.json: it is a governed
            // project-spec truth source (namespaces + cross-module contracts) written
            // only by the Merge Runner. Bootstrap must create it when missing, never
            // reset it — otherwise every project-register/sync (e.g. on OpenCode start)
            // would silently wipe registered contracts back to the empty template.
            // Do not overwrite a non-empty .gitignore. Bootstrap owns only its initial
            // creation; ProjectManager exclusively maintains the managed block.
            if (
              (normalizedRel === 'manifest.json' ||
                normalizedRel === 'config/observability.json' ||
                normalizedRel === 'project/spec_manifest.json' ||
                normalizedRel === 'project/modules/CORE/module.json' ||
                normalizedRel === 'project/extension_registry.json' ||
                normalizedRel === '.gitignore') &&
              existing.trim()
            ) {
              result.existed.push(entry.path);
            } else if (existing !== content) {
              await writeFile(fullPath, content, 'utf-8');
              result.created.push(entry.path);
            } else {
              result.existed.push(entry.path);
            }
          } catch {
            await writeFile(fullPath, content, 'utf-8');
            result.created.push(entry.path);
          }
        } else {
          await writeFile(fullPath, content, 'utf-8');
          result.created.push(entry.path);
        }
      } else {
        if (exists) {
          result.existed.push(entry.path);
        } else {
          await writeFile(fullPath, PLACEHOLDER_CONTENT, 'utf-8');
          result.created.push(entry.path);
        }
      }

      if (PLACEHOLDER_CHECK_FILES.includes(normalizedRel)) {
        try {
          const content = await readFile(fullPath, 'utf-8');
          if (content.startsWith('> TODO')) {
            result.placeholderFiles.push(entry.path);
          }
        } catch {
          result.placeholderFiles.push(entry.path);
        }
      }
    } catch (err: any) {
      result.errors.push(`${entry.path}: ${err.message}`);
      result.success = false;
    }
  }

  // Re-check critical root manifest after layout traversal.
  try {
    await ensureRootManifest(projectRoot, name, now, result);
  } catch (err: any) {
    result.errors.push(`${SPEC_DIR_NAME}/manifest.json: ${err.message}`);
    result.success = false;
  }

  try {
    await ensureHostProfile();
  } catch (err: any) {
    result.errors.push(`host-profile: ${err.message}`);
    result.success = false;
  }

  // Idempotent module-registry normalization for pre-existing / upgraded /
  // damaged projects. The main file loop never rewrites a non-empty
  // spec_manifest.json, so an existing `modules: []` (or legacy/invalid) entry
  // would otherwise stay unrepairable and deadlock every candidate write with
  // MODULE_OWNERSHIP_UNRESOLVED. This step only performs the CORE structural
  // normalization that init itself is authorized to declare; anything broader
  // is deferred to the governed spec_migration_path.
  try {
    await normalizeModuleRegistry(projectRoot, result);
  } catch (err: any) {
    // A normalization failure must not fail bootstrap; it is an advisory repair.
    result.moduleRegistry = {
      status: 'requires_spec_migration',
      reason: `normalization_error: ${err?.message ?? String(err)}`,
    };
  }

  return result;
}

/**
 * Idempotently normalize the Project Spec module registry for the default CORE
 * module only.
 *
 * Compliance boundary (sf-orchestrator §L175): init is the authority that
 * declares the default CORE module. This function ONLY re-establishes that
 * declaration; it never invents business modules from directory names, never
 * drops a declared non-CORE module, and never touches project_spec_version,
 * project metadata, or any other user field. Real multi-module / rename
 * migrations remain spec_migration_path scope.
 */
async function normalizeModuleRegistry(projectRoot: string, result: InitResult): Promise<void> {
  const manifestPath = join(projectRoot, SPEC_DIR_NAME, 'project', 'spec_manifest.json');
  const modulesRoot = join(projectRoot, SPEC_DIR_NAME, 'project', 'modules');

  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf-8');
  } catch {
    result.moduleRegistry = { status: 'unchanged', reason: 'spec_manifest_missing' };
    return;
  }

  let manifest: any;
  try {
    manifest = JSON.parse(raw);
  } catch {
    result.moduleRegistry = { status: 'requires_spec_migration', reason: 'spec_manifest_unreadable' };
    return;
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    result.moduleRegistry = { status: 'requires_spec_migration', reason: 'spec_manifest_not_object' };
    return;
  }

  const rawModules: unknown[] = Array.isArray(manifest.modules) ? manifest.modules : [];

  // 1) Idempotent: a non-empty registry whose every entry is already the exact
  //    canonical shape (and has no duplicate codes) is left untouched. This
  //    covers fresh projects (template seeds canonical CORE) and healthy
  //    multi-module projects.
  if (rawModules.length > 0) {
    const codes: string[] = [];
    let allCanonical = true;
    for (const entry of rawModules) {
      const identity = resolveSpecModuleIdentity(entry);
      if (!identity.valid || !identity.moduleCode) {
        allCanonical = false;
        break;
      }
      if (!isCanonicalProjectSpecModuleEntry(entry, identity.moduleCode)) {
        allCanonical = false;
        break;
      }
      codes.push(identity.moduleCode);
    }
    if (allCanonical && new Set(codes).size === codes.length) {
      result.moduleRegistry = { status: 'unchanged', moduleCodes: codes };
      return;
    }
  }

  // 2) Registry needs normalization. Only the single-CORE structural case is in
  //    scope; anything else fails closed to spec_migration_path.
  const resolutions = rawModules.map(entry => resolveSpecModuleIdentity(entry));
  const hasInvalidEntry = resolutions.some(resolution => !resolution.valid);
  const validCodes = Array.from(
    new Set(
      resolutions
        .filter(resolution => resolution.valid && resolution.moduleCode)
        .map(resolution => resolution.moduleCode as string)
    )
  );
  const hasNonCoreValid = validCodes.some(code => code !== 'CORE');

  // The authoritative CORE definition must already exist on disk and resolve to
  // canonical CORE. init itself lays this file down, so this is normally true.
  const coreModuleJson = join(modulesRoot, 'CORE', 'module.json');
  let coreDefinitionValid = false;
  if (existsSync(coreModuleJson)) {
    try {
      const identity = resolveSpecModuleIdentity(JSON.parse(await readFile(coreModuleJson, 'utf-8')));
      coreDefinitionValid = identity.valid && identity.moduleCode === 'CORE';
    } catch {
      coreDefinitionValid = false;
    }
  }

  // Any non-CORE module directory that carries its own module.json signals a
  // real multi-module / rename migration → spec_migration_path scope.
  let otherModuleDirsWithDefinition = 0;
  try {
    const dirents = await readdir(modulesRoot, { withFileTypes: true });
    for (const dirent of dirents) {
      if (!dirent.isDirectory() || dirent.name === 'CORE') continue;
      if (existsSync(join(modulesRoot, dirent.name, 'module.json'))) {
        otherModuleDirsWithDefinition += 1;
      }
    }
  } catch {
    // modules root unreadable → coreDefinitionValid gate below fails closed.
  }

  const safeCoreOnly =
    coreDefinitionValid &&
    !hasInvalidEntry &&
    !hasNonCoreValid &&
    otherModuleDirsWithDefinition === 0;

  if (!safeCoreOnly) {
    const reasons: string[] = [];
    if (!coreDefinitionValid) reasons.push('core_module_definition_missing_or_invalid');
    if (hasInvalidEntry) reasons.push('invalid_module_entry_present');
    if (hasNonCoreValid) reasons.push('non_core_module_declared');
    if (otherModuleDirsWithDefinition > 0) reasons.push('non_core_module_directory_present');
    result.moduleRegistry = {
      status: 'requires_spec_migration',
      reason: reasons.join(','),
    };
    return;
  }

  // Perform the minimal structural repair: seed the canonical CORE entry and,
  // when default_module is missing/invalid, set it to CORE. Everything else —
  // including project_spec_version — is preserved verbatim.
  const normalizedManifest: Record<string, unknown> = {
    ...manifest,
    modules: [canonicalProjectSpecModuleEntry('CORE')],
  };
  if (normalizeModuleCodeReference(manifest.default_module) !== 'CORE') {
    normalizedManifest.default_module = 'CORE';
  }

  await writeFile(manifestPath, JSON.stringify(normalizedManifest, null, 2) + '\n', 'utf-8');

  const rel = join(SPEC_DIR_NAME, 'project', 'spec_manifest.json');
  if (!result.normalized.includes(rel)) result.normalized.push(rel);
  result.moduleRegistry = { status: 'normalized', moduleCodes: ['CORE'] };
}

async function getSystemFileContent(
  entry: InitEntry,
  projectName: string,
  now: string
): Promise<string> {
  const relativePath = normalizeLayoutPath(
    entry.path.startsWith(SPEC_DIR_NAME + '/')
      ? entry.path.slice(SPEC_DIR_NAME.length + 1)
      : entry.path.startsWith(SPEC_DIR_NAME + '\\')
        ? entry.path.slice(SPEC_DIR_NAME.length + 1)
        : entry.path
  );

  const template = SYSTEM_FILE_CONTENT[relativePath];
  if (template) {
    return template(projectName, now);
  }

  return '';
}

async function ensureHostProfile(): Promise<void> {
  const profilePath = getHostProfilePath();

  if (existsSync(profilePath)) {
    try {
      const stat = statSync(profilePath);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs < PROFILE_TTL_MS) return;
    } catch {
      // continue to scan
    }
  }

  await scanHostProfile({ force: false, verbose: false });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
