import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const PROJECT_SPEC_STORE_SCHEMA_VERSION = '1.2' as const;
export const INITIAL_PROJECT_SPEC_VERSION = 'PSV-0001' as const;

export type CandidateMergeMode = 'replace_file' | 'append_file' | 'replace_section';

export interface CandidateMergeEntry {
  candidate_path: string;
  target_project_path: string;
  merge_mode: CandidateMergeMode;
  section_marker?: string;
}

export interface CandidateManifestV12 {
  schema_version: string;
  work_item_id: string;
  workflow_type?: string;
  workflow_path?: string;
  base_project_spec_version?: string;
  entries: CandidateMergeEntry[];
  no_spec_impact?: boolean;
}

export interface ProjectSpecManifestV12 {
  schema_version: typeof PROJECT_SPEC_STORE_SCHEMA_VERSION;
  project_spec_version: string;
  updated_by_work_item_id: string;
  updated_at: string;
  files: {
    requirements_index: string;
    design_index: string;
    architecture: string;
    trace_matrix: string;
    extension_registry: string;
    versions_log: string;
  };
}

export interface ProjectSpecVersionEventV12 {
  schema_version: typeof PROJECT_SPEC_STORE_SCHEMA_VERSION;
  project_spec_version: string;
  previous_project_spec_version: string | null;
  work_item_id: string;
  reason: string;
  changed_paths: string[];
  created_at: string;
}

export interface CandidateValidationResult {
  valid: boolean;
  violations: string[];
}

export interface ProjectSpecMergeResult {
  merged: boolean;
  work_item_id: string;
  previous_project_spec_version: string;
  project_spec_version: string;
  changed_paths: string[];
}

export interface NoSpecImpactEvidence {
  schema_version: typeof PROJECT_SPEC_STORE_SCHEMA_VERSION;
  work_item_id: string;
  workflow_path: string;
  spec_impact: 'none';
  candidate_entries: [];
  reason: string;
  created_at: string;
}

export interface ProjectSpecStoreOptions {
  projectRoot: string;
  now?: () => Date;
}

export class ProjectSpecStoreError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'ProjectSpecStoreError';
  }
}

function toPosix(relativePath: string): string {
  return relativePath.replace(/\\/g, '/');
}

function isAbsoluteOrEscaping(inputPath: string): boolean {
  const normalized = toPosix(inputPath);
  return (
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.includes('..') ||
    normalized.includes('~')
  );
}

function nextVersion(current: string): string {
  const match = /^PSV-(\d+)$/.exec(current);
  if (!match) {
    throw new ProjectSpecStoreError(
      `Invalid project spec version: ${current}`,
      'INVALID_PROJECT_SPEC_VERSION',
      [current],
    );
  }
  const value = Number.parseInt(match[1] ?? '0', 10) + 1;
  return `PSV-${value.toString().padStart(4, '0')}`;
}

function stripProjectPrefix(targetProjectPath: string): string {
  const normalized = toPosix(targetProjectPath);
  const prefix = '.specforge/project/';
  if (!normalized.startsWith(prefix)) {
    throw new ProjectSpecStoreError(
      'target_project_path must be under .specforge/project/**',
      'TARGET_OUTSIDE_PROJECT_SPEC',
      [targetProjectPath],
    );
  }
  return normalized.slice(prefix.length);
}

export class ProjectSpecStore {
  private readonly root: string;
  private readonly now: () => Date;

  constructor(options: ProjectSpecStoreOptions) {
    this.root = options.projectRoot;
    this.now = options.now ?? (() => new Date());
  }

  specforgeRoot(): string {
    return path.join(this.root, '.specforge');
  }

  projectRoot(): string {
    return path.join(this.specforgeRoot(), 'project');
  }

  workItemsRoot(): string {
    return path.join(this.specforgeRoot(), 'work-items');
  }

  manifestPath(): string {
    return path.join(this.projectRoot(), 'spec_manifest.json');
  }

  versionsLogPath(): string {
    return path.join(this.projectRoot(), 'versions', 'spec_versions.jsonl');
  }

  extensionRegistryPath(): string {
    return path.join(this.projectRoot(), 'extension_registry.json');
  }

  async initializeProjectSpec(workItemId = 'SYSTEM'): Promise<ProjectSpecManifestV12> {
    await fs.mkdir(path.join(this.projectRoot(), 'versions'), { recursive: true });
    await fs.mkdir(path.join(this.projectRoot(), 'modules'), { recursive: true });

    await this.writeFileIfMissing('requirements_index.md', '# Requirements Index\n');
    await this.writeFileIfMissing('design_index.md', '# Design Index\n');
    await this.writeFileIfMissing('architecture.md', '# Architecture\n');
    await this.writeFileIfMissing('trace_matrix.md', '# Trace Matrix\n');
    await this.writeFileIfMissing('extension_registry.json', JSON.stringify({
      schema_version: PROJECT_SPEC_STORE_SCHEMA_VERSION,
      registry_version: 'EXT-0001',
      extensions: [],
    }, null, 2) + '\n');

    try {
      return await this.readManifest();
    } catch (error) {
      if (!(error instanceof ProjectSpecStoreError) || error.code !== 'PROJECT_SPEC_MANIFEST_MISSING') {
        throw error;
      }
    }

    const manifest: ProjectSpecManifestV12 = {
      schema_version: PROJECT_SPEC_STORE_SCHEMA_VERSION,
      project_spec_version: INITIAL_PROJECT_SPEC_VERSION,
      updated_by_work_item_id: workItemId,
      updated_at: this.now().toISOString(),
      files: {
        requirements_index: '.specforge/project/requirements_index.md',
        design_index: '.specforge/project/design_index.md',
        architecture: '.specforge/project/architecture.md',
        trace_matrix: '.specforge/project/trace_matrix.md',
        extension_registry: '.specforge/project/extension_registry.json',
        versions_log: '.specforge/project/versions/spec_versions.jsonl',
      },
    };

    await this.writeJson(this.manifestPath(), manifest);
    await this.appendVersionEvent({
      schema_version: PROJECT_SPEC_STORE_SCHEMA_VERSION,
      project_spec_version: INITIAL_PROJECT_SPEC_VERSION,
      previous_project_spec_version: null,
      work_item_id: workItemId,
      reason: 'initialize_project_spec',
      changed_paths: ['.specforge/project/spec_manifest.json'],
      created_at: this.now().toISOString(),
    });

    return manifest;
  }

  async readManifest(): Promise<ProjectSpecManifestV12> {
    try {
      const raw = await fs.readFile(this.manifestPath(), 'utf8');
      const parsed = JSON.parse(raw) as ProjectSpecManifestV12;
      if (parsed.schema_version !== PROJECT_SPEC_STORE_SCHEMA_VERSION) {
        throw new ProjectSpecStoreError(
          'Unsupported project spec manifest schema_version',
          'UNSUPPORTED_PROJECT_SPEC_MANIFEST_SCHEMA',
          [String(parsed.schema_version)],
        );
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ProjectSpecStoreError(
          'Project spec manifest is missing',
          'PROJECT_SPEC_MANIFEST_MISSING',
          [this.manifestPath()],
        );
      }
      throw error;
    }
  }

  async currentVersion(): Promise<string> {
    return (await this.readManifest()).project_spec_version;
  }

  validateCandidateManifest(manifest: CandidateManifestV12, currentVersion: string): CandidateValidationResult {
    const violations: string[] = [];

    if (manifest.schema_version !== PROJECT_SPEC_STORE_SCHEMA_VERSION) {
      violations.push('schema_version_must_be_1.2');
    }
    if (!manifest.work_item_id || !/^WI-\d+/.test(manifest.work_item_id)) {
      violations.push('work_item_id_required');
    }
    if (!Array.isArray(manifest.entries)) {
      violations.push('entries_must_be_array');
    }

    const entries = Array.isArray(manifest.entries) ? manifest.entries : [];

    if (manifest.no_spec_impact === true) {
      if (entries.length !== 0) {
        violations.push('no_spec_impact_requires_empty_entries');
      }
      return { valid: violations.length === 0, violations };
    }

    if (!manifest.base_project_spec_version) {
      violations.push('base_project_spec_version_required');
    } else if (manifest.base_project_spec_version !== currentVersion) {
      violations.push('base_project_spec_version_stale');
    }

    if (entries.length === 0) {
      violations.push('entries_required_for_project_spec_merge');
    }

    entries.forEach((entry, index) => {
      const prefix = `entries[${index}]`;
      if (!entry.candidate_path) {
        violations.push(`${prefix}.candidate_path_required`);
      } else if (isAbsoluteOrEscaping(entry.candidate_path)) {
        violations.push(`${prefix}.candidate_path_invalid`);
      }

      if (!entry.target_project_path) {
        violations.push(`${prefix}.target_project_path_required`);
      } else if (isAbsoluteOrEscaping(entry.target_project_path)) {
        violations.push(`${prefix}.target_project_path_invalid`);
      } else if (!toPosix(entry.target_project_path).startsWith('.specforge/project/')) {
        violations.push(`${prefix}.target_project_path_must_be_under_project_spec`);
      }

      if (!['replace_file', 'append_file', 'replace_section'].includes(entry.merge_mode)) {
        violations.push(`${prefix}.merge_mode_invalid`);
      }

      if (entry.merge_mode === 'replace_section' && !entry.section_marker) {
        violations.push(`${prefix}.section_marker_required_for_replace_section`);
      }
    });

    return { valid: violations.length === 0, violations };
  }

  async mergeCandidateManifest(manifest: CandidateManifestV12): Promise<ProjectSpecMergeResult> {
    await this.initializeProjectSpec(manifest.work_item_id);
    const current = await this.currentVersion();
    const validation = this.validateCandidateManifest(manifest, current);

    if (!validation.valid) {
      throw new ProjectSpecStoreError(
        'Candidate manifest is not mergeable',
        'CANDIDATE_MANIFEST_INVALID',
        validation.violations,
      );
    }

    if (manifest.no_spec_impact === true) {
      return {
        merged: false,
        work_item_id: manifest.work_item_id,
        previous_project_spec_version: current,
        project_spec_version: current,
        changed_paths: [],
      };
    }

    const changedPaths: string[] = [];

    for (const entry of manifest.entries) {
      const candidatePath = path.join(this.root, entry.candidate_path);
      const targetRel = stripProjectPrefix(entry.target_project_path);
      const targetPath = path.join(this.projectRoot(), targetRel);
      const candidateContent = await fs.readFile(candidatePath, 'utf8');

      await fs.mkdir(path.dirname(targetPath), { recursive: true });

      if (entry.merge_mode === 'replace_file') {
        await fs.writeFile(targetPath, candidateContent, 'utf8');
      } else if (entry.merge_mode === 'append_file') {
        await fs.appendFile(targetPath, candidateContent.endsWith('\n') ? candidateContent : `${candidateContent}\n`, 'utf8');
      } else {
        await this.replaceSection(targetPath, entry.section_marker ?? '', candidateContent);
      }

      changedPaths.push(entry.target_project_path);
    }

    const next = nextVersion(current);
    const previous = await this.readManifest();
    const updated: ProjectSpecManifestV12 = {
      ...previous,
      project_spec_version: next,
      updated_by_work_item_id: manifest.work_item_id,
      updated_at: this.now().toISOString(),
    };

    await this.writeJson(this.manifestPath(), updated);
    await this.appendVersionEvent({
      schema_version: PROJECT_SPEC_STORE_SCHEMA_VERSION,
      project_spec_version: next,
      previous_project_spec_version: current,
      work_item_id: manifest.work_item_id,
      reason: 'candidate_manifest_merge',
      changed_paths: changedPaths,
      created_at: this.now().toISOString(),
    });

    return {
      merged: true,
      work_item_id: manifest.work_item_id,
      previous_project_spec_version: current,
      project_spec_version: next,
      changed_paths: changedPaths,
    };
  }

  async writeNoSpecImpactEvidence(input: {
    workItemId: string;
    workflowPath: string;
    reason: string;
  }): Promise<NoSpecImpactEvidence> {
    const evidence: NoSpecImpactEvidence = {
      schema_version: PROJECT_SPEC_STORE_SCHEMA_VERSION,
      work_item_id: input.workItemId,
      workflow_path: input.workflowPath,
      spec_impact: 'none',
      candidate_entries: [],
      reason: input.reason,
      created_at: this.now().toISOString(),
    };

    const target = path.join(this.workItemsRoot(), input.workItemId, 'no_spec_impact.json');
    await this.writeJson(target, evidence);
    return evidence;
  }

  assertProjectSpecWriteAllowed(input: {
    targetPath: string;
    viaProjectSpecMergeTool: boolean;
  }): void {
    const normalized = toPosix(input.targetPath);
    if (normalized.startsWith('.specforge/project/') && !input.viaProjectSpecMergeTool) {
      throw new ProjectSpecStoreError(
        'Direct project spec write is forbidden; use sf_project_spec_merge',
        'DIRECT_PROJECT_SPEC_WRITE_FORBIDDEN',
        [input.targetPath],
      );
    }
  }

  private async replaceSection(targetPath: string, sectionMarker: string, content: string): Promise<void> {
    const start = `<!-- SF_SECTION:${sectionMarker}:START -->`;
    const end = `<!-- SF_SECTION:${sectionMarker}:END -->`;
    let existing = '';

    try {
      existing = await fs.readFile(targetPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const replacement = `${start}\n${content.endsWith('\n') ? content : `${content}\n`}${end}`;
    const startIndex = existing.indexOf(start);
    const endIndex = existing.indexOf(end);

    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
      const prefix = existing.endsWith('\n') || existing.length === 0 ? existing : `${existing}\n`;
      await fs.writeFile(targetPath, `${prefix}${replacement}\n`, 'utf8');
      return;
    }

    const before = existing.slice(0, startIndex);
    const after = existing.slice(endIndex + end.length);
    await fs.writeFile(targetPath, `${before}${replacement}${after}`, 'utf8');
  }

  private async writeFileIfMissing(relativeProjectPath: string, content: string): Promise<void> {
    const target = path.join(this.projectRoot(), relativeProjectPath);
    try {
      await fs.access(target);
    } catch {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, 'utf8');
    }
  }

  private async writeJson(target: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  private async appendVersionEvent(event: ProjectSpecVersionEventV12): Promise<void> {
    await fs.mkdir(path.dirname(this.versionsLogPath()), { recursive: true });
    await fs.appendFile(this.versionsLogPath(), `${JSON.stringify(event)}\n`, 'utf8');
  }
}
