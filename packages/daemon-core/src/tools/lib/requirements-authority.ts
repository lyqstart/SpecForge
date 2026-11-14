import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { resolveSpecModuleIdentity } from '@specforge/types';
import {
  projectRoot as projectSpecRoot,
  workItemRoot,
  moduleRequirements,
} from '@specforge/types/directory-layout';
import {
  resolveWorkItemSpecArtifacts,
  targetPathForCandidate,
} from './governance-invariants-v11.js';
import { resolvedPathIdentity, isSameOrDescendantResolvedPath } from './path-identity.js';
import {
  inspectRequirementsGeneration,
  type RequirementDocument,
} from './requirements-generation.js';

type Entry = Record<string, unknown>;
export type RequirementsInputBinding = Array<{ path: string; sha256: string }>;
export type RequirementsAuthority = {
  artifacts: RequirementDocument[];
  inputFiles: string[];
  sealed: boolean;
};
function record(value: unknown): Entry {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('REQUIREMENTS_AUTHORITY_OBJECT_REQUIRED');
  return value as Entry;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('REQUIREMENTS_AUTHORITY_STRING_REQUIRED');
  return value;
}

export async function captureRequirementsInputBinding(
  input: Parameters<typeof resolveRequirementsAuthority>[0]
): Promise<RequirementsInputBinding> {
  const authority = await resolveRequirementsAuthority(input);
  const results = await Promise.allSettled(
    authority.inputFiles.map(async file => ({
      path: file,
      sha256: createHash('sha256')
        .update(await fs.readFile(file))
        .digest('hex'),
    }))
  );
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  return results.map(result => {
    if (result.status !== 'fulfilled') throw new Error('REQUIREMENTS_INPUT_READ_UNSETTLED');
    return result.value;
  });
}

export async function assertRequirementsInputBinding(
  input: Parameters<typeof resolveRequirementsAuthority>[0],
  expected: RequirementsInputBinding
): Promise<void> {
  const current = await captureRequirementsInputBinding(input);
  if (JSON.stringify(current) !== JSON.stringify(expected))
    throw new Error('REQUIREMENTS_GENERATION_INPUT_DRIFT');
}

/** D28 authority overlay. Registered formal files plus exact frozen replacements only. */
export async function resolveRequirementsAuthority(input: {
  projectRoot: string;
  workItemId: string;
  formalOnly?: boolean;
}): Promise<RequirementsAuthority> {
  const root = path.resolve(input.projectRoot);
  const project = projectSpecRoot(root);
  const wi = workItemRoot(root, input.workItemId);
  const candidateRoot = path.join(wi, 'candidates');
  const inputFiles = new Set<string>();
  async function read(file: string, boundary: string, optional = false): Promise<string | null> {
    if (!isSameOrDescendantResolvedPath(file, boundary))
      throw new Error('REQUIREMENTS_AUTHORITY_PATH_ESCAPE');
    try {
      const segments = path.relative(root, file).split(path.sep).filter(Boolean);
      let current = root;
      for (const segment of ['', ...segments]) {
        current = path.join(current, segment);
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink()) throw new Error('REQUIREMENTS_AUTHORITY_ALIAS');
        if (resolvedPathIdentity(current) === resolvedPathIdentity(file)) {
          if (!stat.isFile()) throw new Error('REQUIREMENTS_AUTHORITY_FILE_REQUIRED');
        } else if (!stat.isDirectory())
          throw new Error('REQUIREMENTS_AUTHORITY_DIRECTORY_REQUIRED');
      }
      const content = await fs.readFile(file, 'utf8');
      inputFiles.add(file);
      return content;
    } catch (error) {
      if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  const manifestPath = path.join(wi, 'candidate_manifest.json');
  const frozenText = input.formalOnly ? null : await read(manifestPath, wi, true);
  const manifestText = await read(path.join(project, 'spec_manifest.json'), project, true);
  const formal = manifestText === null ? {} : record(JSON.parse(manifestText));
  const frozen = frozenText === null ? null : record(JSON.parse(frozenText));
  if (!input.formalOnly && frozen === null) {
    // Authoring preview only. Runtime's sealed Gate entry must separately require its manifest.
    const artifacts = await resolveWorkItemSpecArtifacts({ ...input, kind: 'requirements' });
    return { artifacts, inputFiles: [...inputFiles, ...artifacts.map(a => a.path)], sealed: false };
  }
  const modules = new Map<string, { file: string; moduleCode: string }>();
  for (const raw of Array.isArray(formal.modules) ? formal.modules : []) {
    const identity = resolveSpecModuleIdentity(raw);
    if (!identity.valid || !identity.moduleCode)
      throw new Error('REQUIREMENTS_MODULE_IDENTITY_INVALID');
    if (modules.has(identity.moduleCode)) throw new Error('REQUIREMENTS_MODULE_DUPLICATE');
    const entry = typeof raw === 'object' && raw !== null ? record(raw) : {};
    const file = path.resolve(
      root,
      text(entry.requirements ?? moduleRequirements(root, identity.moduleCode))
    );
    if (!isSameOrDescendantResolvedPath(file, path.join(project, 'modules')))
      throw new Error('REQUIREMENTS_MODULE_PATH_INVALID');
    modules.set(identity.moduleCode, { file, moduleCode: identity.moduleCode });
  }
  const entries = (
    Array.isArray(frozen?.entries)
      ? frozen.entries
      : Array.isArray(frozen?.candidates)
        ? frozen.candidates
        : []
  ).map(record);
  function candidateFile(entry: Entry): string {
    const value = text(entry.candidate_path ?? entry.path ?? '');
    if (!value || path.isAbsolute(value) || value.split(/[\\/]/).includes('..'))
      throw new Error('REQUIREMENTS_CANDIDATE_PATH_INVALID');
    const normalized = value.replaceAll('\\', '/');
    const file = (process.platform === 'win32' ? normalized.toLowerCase() : normalized).startsWith(
      'candidates/'
    )
      ? path.resolve(wi, value)
      : path.resolve(root, value);
    if (!isSameOrDescendantResolvedPath(file, candidateRoot))
      throw new Error('REQUIREMENTS_CANDIDATE_PATH_INVALID');
    return file;
  }
  function targetFile(entry: Entry): string {
    const target =
      entry.target_path ??
      targetPathForCandidate(entry.type, text(entry.candidate_path ?? entry.path ?? ''));
    if (
      typeof target !== 'string' ||
      !target ||
      path.isAbsolute(target) ||
      target.split(/[\\/]/).includes('..')
    )
      throw new Error('REQUIREMENTS_TARGET_PATH_INVALID');
    const file = path.resolve(root, target);
    if (!isSameOrDescendantResolvedPath(file, project))
      throw new Error('REQUIREMENTS_TARGET_PATH_INVALID');
    return file;
  }
  const moduleTargets = new Map<string, Entry>();
  for (const entry of entries.filter(
    e =>
      e.type === 'module_definition' ||
      /\/modules\/[^/]+\/module\.json$/.test(text(e.target_path ?? '').replaceAll('\\', '/'))
  )) {
    const target = targetFile(entry);
    const match = /^modules\/([^/]+)\/module\.json$/i.exec(
      path.relative(project, target).replaceAll('\\', '/')
    );
    if (!match) throw new Error('REQUIREMENTS_MODULE_TARGET_INVALID');
    const key = resolvedPathIdentity(target);
    const previous = moduleTargets.get(key);
    if (previous) {
      if (
        previous.operation === entry.operation &&
        previous.module_id === entry.module_id &&
        resolvedPathIdentity(candidateFile(previous)) === resolvedPathIdentity(candidateFile(entry))
      )
        continue;
      throw new Error('REQUIREMENTS_MODULE_TARGET_DUPLICATE');
    }
    moduleTargets.set(key, entry);
    if (entry.operation === 'delete') {
      for (const code of modules.keys()) {
        if (resolvedPathIdentity(path.join(project, 'modules', code, 'module.json')) === key)
          modules.delete(code);
      }
      continue;
    }
    const definition = record(JSON.parse((await read(candidateFile(entry), candidateRoot))!));
    const identity = resolveSpecModuleIdentity(definition);
    if (
      !identity.valid ||
      !identity.moduleCode ||
      resolvedPathIdentity(path.join(project, 'modules', identity.moduleCode, 'module.json')) !==
        key ||
      (entry.module_id !== undefined && entry.module_id !== identity.moduleCode)
    )
      throw new Error('REQUIREMENTS_MODULE_OWNER_INVALID');
    modules.set(identity.moduleCode, {
      file: path.join(project, 'modules', identity.moduleCode, 'requirements.md'),
      moduleCode: identity.moduleCode,
    });
  }
  const replacements = new Map<string, Entry>();
  for (const entry of entries.filter(
    e =>
      ['requirements', 'requirement', 'requirements_index'].includes(String(e.type)) ||
      /\/requirements(?:_index)?\.md$/.test(text(e.target_path ?? '').replaceAll('\\', '/'))
  )) {
    const target = targetFile(entry),
      key = resolvedPathIdentity(target);
    const previous = replacements.get(key);
    if (previous) {
      const sameSource =
        resolvedPathIdentity(candidateFile(previous)) ===
        resolvedPathIdentity(candidateFile(entry));
      if (
        sameSource &&
        previous.operation === entry.operation &&
        previous.module_id === entry.module_id &&
        previous.type === entry.type
      )
        continue;
      throw new Error('REQUIREMENTS_TARGET_DUPLICATE');
    }
    replacements.set(key, entry);
  }
  const artifacts: RequirementDocument[] = [];
  const seen = new Set<string>();
  async function load(file: string, moduleCode?: string): Promise<void> {
    const key = resolvedPathIdentity(file),
      replacement = replacements.get(key);
    replacements.delete(key);
    if (replacement?.operation === 'delete') return;
    if (replacement?.module_id !== undefined && replacement.module_id !== moduleCode)
      throw new Error('REQUIREMENTS_TARGET_OWNER_INVALID');
    const actual = replacement ? candidateFile(replacement) : file;
    const actualKey = resolvedPathIdentity(actual);
    if (seen.has(actualKey)) throw new Error('REQUIREMENTS_DEFINITION_FILE_MULTIPLE_OWNERS');
    seen.add(actualKey);
    const content = await read(
      actual,
      replacement ? candidateRoot : project,
      !moduleCode && !replacement
    );
    if (content !== null) artifacts.push({ path: actual, content, moduleCode });
  }
  for (const module of modules.values()) await load(module.file, module.moduleCode);
  await load(path.join(project, 'requirements_index.md'), '');
  if (replacements.size > 0) throw new Error('REQUIREMENTS_UNREGISTERED_TARGET');
  return { artifacts, inputFiles: [...inputFiles].sort(), sealed: frozen !== null };
}

export async function inspectRequirementsAuthority(
  input: Parameters<typeof resolveRequirementsAuthority>[0]
): Promise<{ valid: boolean; errors: string[]; inputFiles: string[] }> {
  try {
    const authority = await resolveRequirementsAuthority(input);
    const generation = inspectRequirementsGeneration(authority.artifacts);
    if (
      generation.documents.some(document => document.role === 'reference_context') &&
      generation.declaredIds.length === 0
    ) {
      generation.errors.push('REFERENCE_CONTEXT_CANNOT_SATISFY_EMPTY_REQUIREMENTS_GENERATION');
    }
    return {
      valid: generation.errors.length === 0,
      errors: generation.errors,
      inputFiles: authority.inputFiles,
    };
  } catch (error) {
    return { valid: false, errors: [(error as Error).message], inputFiles: [] };
  }
}
