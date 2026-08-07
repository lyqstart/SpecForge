/**
 * spec-migration-v11 — §7.6 spec_migration_path
 *
 * 用于 legacy specs 向项目级正式规格真相源迁移。
 *
 * 规则：
 * 1. 不得静默迁移。
 * 2. 必须生成 migration inventory / migration plan / migration conflicts。
 * 3. 必须生成完整 project spec candidate。
 * 4. 必须经过 Gate、User Decision、Merge Runner。
 * 5. 默认不释放 code_permission。
 */

import { readFile, readdir, stat, writeFile, mkdir, copyFile, rename, rm } from 'node:fs/promises';
import { join, extname, relative, resolve, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import {
  canonicalProjectSpecModuleEntry,
  normalizeModuleCodeReference,
  resolveSpecModuleIdentity,
} from '@specforge/types';

// ── Types ──

export interface MigrationInventory {
  /** Legacy specs 目录下的所有文件 */
  legacyFiles: Array<{
    relativePath: string;
    absolutePath: string;
    size: number;
    type: 'requirements' | 'design' | 'tasks' | 'verification' | 'evidence' | 'other';
  }>;
  /** 项目级已存在的文件 */
  projectFiles: string[];
  /** 统计 */
  stats: {
    total: number;
    byType: Record<string, number>;
  };
}

export interface MigrationConflict {
  /** Legacy 文件路径 */
  legacyPath: string;
  /** 对应的项目级目标路径 */
  projectTargetPath: string;
  /** 冲突类型 */
  conflictType: 'already_exists' | 'ambiguous_mapping' | 'format_incompatible';
  /** 冲突描述 */
  description: string;
  /** 建议处理方式 */
  suggestion: string;
}

export interface MigrationPlan {
  /** 关联的 work item ID */
  workItemId: string;
  /** 迁移清单 */
  inventory: MigrationInventory;
  /** 冲突列表 */
  conflicts: MigrationConflict[];
  /** 迁移步骤 */
  steps: Array<{
    source: string;
    target: string;
    action: 'copy' | 'transform' | 'skip' | 'manual';
    description: string;
  }>;
  /** 是否可以自动迁移 */
  canAutoMigrate: boolean;
  /** 需要用户确认的项 */
  requiresUserConfirmation: string[];
}

export interface ProjectSpecRepairInspection {
  schema_version: '1.0';
  work_item_id: string;
  manifest_path: string;
  manifest_sha256: string | null;
  project_spec_version: string | null;
  declared_modules: Array<{
    index: number;
    module_code: string | null;
    legacy: boolean;
    valid: boolean;
    errors: string[];
  }>;
  module_directories: Array<{
    path: string;
    files: string[];
  }>;
  issues: string[];
  inspected_at: string;
}

export interface ProjectSpecRepairModuleMapping {
  module_code: string;
  requirements_source: string;
  design_source: string;
  trace_source: string;
  module_definition_source?: string;
}

export interface ProjectSpecRepairPreparation {
  expected_manifest_sha256: string;
  expected_project_spec_version: string;
  evidence_paths: string[];
  modules: ProjectSpecRepairModuleMapping[];
}

function sha256(content: Buffer | string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

function isSubPath(child: string, parent: string): boolean {
  const relativePath = relative(resolve(parent), resolve(child));
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

async function listDirectFiles(directory: string): Promise<string[]> {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter(entry => entry.isFile()).map(entry => entry.name).sort();
}

export async function inspectProjectSpecRepair(
  projectRoot: string,
  workItemId: string
): Promise<ProjectSpecRepairInspection> {
  const manifestPath = join(projectRoot, '.specforge', 'project', 'spec_manifest.json');
  const modulesRoot = join(projectRoot, '.specforge', 'project', 'modules');
  const issues: string[] = [];
  let manifestSha256: string | null = null;
  let projectSpecVersion: string | null = null;
  const declaredModules: ProjectSpecRepairInspection['declared_modules'] = [];

  if (!existsSync(manifestPath)) {
    issues.push('PROJECT_SPEC_MANIFEST_MISSING');
  } else {
    try {
      const raw = await readFile(manifestPath);
      manifestSha256 = sha256(raw);
      const manifest = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
      projectSpecVersion = typeof manifest.project_spec_version === 'string'
        ? manifest.project_spec_version
        : null;
      if (!projectSpecVersion || !/^PSV-[0-9]{4,}$/.test(projectSpecVersion)) {
        issues.push('PROJECT_SPEC_VERSION_INVALID');
      }
      const modules = Array.isArray(manifest.modules) ? manifest.modules : [];
      if (modules.length === 0) issues.push('MODULE_REGISTRY_EMPTY');
      modules.forEach((entry, index) => {
        const identity = resolveSpecModuleIdentity(entry);
        declaredModules.push({
          index,
          module_code: identity.moduleCode ?? null,
          legacy: identity.legacy,
          valid: identity.valid,
          errors: identity.errors,
        });
        if (!identity.valid) issues.push(`MODULE_REGISTRY_ENTRY_${index}_INVALID`);
        if (identity.legacy) issues.push(`MODULE_REGISTRY_ENTRY_${index}_LEGACY`);
      });
    } catch (error) {
      issues.push(`PROJECT_SPEC_MANIFEST_UNREADABLE: ${(error as Error).message}`);
    }
  }

  const moduleDirectories: ProjectSpecRepairInspection['module_directories'] = [];
  if (existsSync(modulesRoot)) {
    const entries = await readdir(modulesRoot, { withFileTypes: true });
    for (const entry of entries.filter(candidate => candidate.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      moduleDirectories.push({
        path: toPosix(relative(projectRoot, join(modulesRoot, entry.name))),
        files: await listDirectFiles(join(modulesRoot, entry.name)),
      });
    }
  }

  return {
    schema_version: '1.0',
    work_item_id: workItemId,
    manifest_path: toPosix(relative(projectRoot, manifestPath)),
    manifest_sha256: manifestSha256,
    project_spec_version: projectSpecVersion,
    declared_modules: declaredModules,
    module_directories: moduleDirectories,
    issues: Array.from(new Set(issues)),
    inspected_at: new Date().toISOString(),
  };
}

export async function writeProjectSpecRepairInspection(
  workItemDir: string,
  inspection: ProjectSpecRepairInspection
): Promise<string> {
  const target = join(workItemDir, 'project_spec_repair_inspection.json');
  await mkdir(workItemDir, { recursive: true });
  await writeFile(target, `${JSON.stringify(inspection, null, 2)}\n`, 'utf8');
  return target;
}

function resolveProjectSpecSource(projectRoot: string, value: string): string {
  const normalized = toPosix(value).replace(/^\.\//, '');
  if (!normalized.startsWith('.specforge/project/')) {
    throw new Error(`Repair source must be under .specforge/project/**: ${value}`);
  }
  const absolute = resolve(projectRoot, normalized);
  const projectSpecRoot = resolve(projectRoot, '.specforge', 'project');
  if (!isSubPath(absolute, projectSpecRoot)) {
    throw new Error(`Repair source escapes Project Spec: ${value}`);
  }
  if (!existsSync(absolute)) throw new Error(`Repair source does not exist: ${value}`);
  return absolute;
}

interface RuntimeEmptyCandidateScaffold {
  candidateRootExists: boolean;
  candidateManifestExists: boolean;
  candidateManifestContent: string | null;
}

async function inspectRuntimeEmptyCandidateScaffold(input: {
  candidateRoot: string;
  candidateManifestPath: string;
  repairPlanPath: string;
  workItemId: string;
  expectedProjectSpecVersion: string;
}): Promise<RuntimeEmptyCandidateScaffold | null> {
  const candidateRootExists = existsSync(input.candidateRoot);
  const candidateManifestExists = existsSync(input.candidateManifestPath);

  if (existsSync(input.repairPlanPath)) {
    throw new Error('PROJECT_SPEC_REPAIR_REFUSES_TO_OVERWRITE_EXISTING_CANDIDATES');
  }

  if (!candidateRootExists && !candidateManifestExists) {
    return null;
  }

  if (candidateRootExists) {
    const rootStat = await stat(input.candidateRoot);
    if (!rootStat.isDirectory()) {
      throw new Error('PROJECT_SPEC_REPAIR_REFUSES_TO_OVERWRITE_EXISTING_CANDIDATES');
    }
    const entries = await readdir(input.candidateRoot);
    if (entries.length !== 0) {
      throw new Error('PROJECT_SPEC_REPAIR_REFUSES_TO_OVERWRITE_EXISTING_CANDIDATES');
    }
  }

  let candidateManifestContent: string | null = null;
  if (candidateManifestExists) {
    candidateManifestContent = await readFile(input.candidateManifestPath, 'utf8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(candidateManifestContent);
    } catch {
      throw new Error('PROJECT_SPEC_REPAIR_REFUSES_TO_OVERWRITE_EXISTING_CANDIDATES');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('PROJECT_SPEC_REPAIR_REFUSES_TO_OVERWRITE_EXISTING_CANDIDATES');
    }

    const manifest = parsed as Record<string, unknown>;
    const canonicalKeys = [
      'base_spec_version',
      'entries',
      'merge_required',
      'schema_version',
      'work_item_id',
      'workflow_path',
    ];
    const actualKeys = Object.keys(manifest).sort();
    if (
      actualKeys.length !== canonicalKeys.length ||
      actualKeys.some((key, index) => key !== canonicalKeys[index])
    ) {
      throw new Error('PROJECT_SPEC_REPAIR_REFUSES_TO_OVERWRITE_EXISTING_CANDIDATES');
    }
    if (
      manifest.schema_version !== '1.0' ||
      manifest.work_item_id !== input.workItemId ||
      manifest.workflow_path !== 'spec_migration_path' ||
      manifest.base_spec_version !== input.expectedProjectSpecVersion ||
      manifest.merge_required !== true ||
      !Array.isArray(manifest.entries) ||
      manifest.entries.length !== 0
    ) {
      throw new Error('PROJECT_SPEC_REPAIR_REFUSES_TO_OVERWRITE_EXISTING_CANDIDATES');
    }
  }

  return {
    candidateRootExists,
    candidateManifestExists,
    candidateManifestContent,
  };
}

async function restoreRuntimeEmptyCandidateScaffold(input: {
  scaffold: RuntimeEmptyCandidateScaffold;
  candidateRoot: string;
  candidateManifestPath: string;
  repairPlanPath: string;
}): Promise<void> {
  await rm(input.candidateRoot, { recursive: true, force: true });
  await rm(input.candidateManifestPath, { force: true });
  await rm(input.repairPlanPath, { force: true });

  if (input.scaffold.candidateRootExists) {
    await mkdir(input.candidateRoot, { recursive: true });
  }
  if (
    input.scaffold.candidateManifestExists &&
    input.scaffold.candidateManifestContent !== null
  ) {
    await writeFile(
      input.candidateManifestPath,
      input.scaffold.candidateManifestContent,
      'utf8',
    );
  }
}

export async function prepareProjectSpecRepairCandidates(input: {
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  preparation: ProjectSpecRepairPreparation;
}): Promise<{ candidate_manifest_path: string; repair_plan_path: string; candidate_manifest_hash: string }> {
  const workItemPath = join(input.workItemDir, 'work_item.json');
  const workItem = JSON.parse(await readFile(workItemPath, 'utf8')) as Record<string, unknown>;
  if (workItem.workflow_path !== 'spec_migration_path') {
    throw new Error('PROJECT_SPEC_REPAIR_REQUIRES_SPEC_MIGRATION_PATH');
  }
  if (!Array.isArray(input.preparation.evidence_paths) || input.preparation.evidence_paths.length === 0) {
    throw new Error('PROJECT_SPEC_REPAIR_REQUIRES_ARCHITECTURE_EVIDENCE');
  }
  for (const evidencePath of input.preparation.evidence_paths) {
    resolveProjectSpecSource(input.projectRoot, evidencePath);
  }
  const manifestPath = join(input.projectRoot, '.specforge', 'project', 'spec_manifest.json');
  const manifestRaw = await readFile(manifestPath);
  const currentManifestHash = sha256(manifestRaw);
  const currentManifest = JSON.parse(manifestRaw.toString('utf8')) as Record<string, unknown>;
  if (currentManifestHash !== input.preparation.expected_manifest_sha256) {
    throw new Error('PROJECT_SPEC_REPAIR_MANIFEST_HASH_STALE');
  }
  if (currentManifest.project_spec_version !== input.preparation.expected_project_spec_version) {
    throw new Error('PROJECT_SPEC_REPAIR_VERSION_STALE');
  }
  if (!/^PSV-[0-9]{4,}$/.test(input.preparation.expected_project_spec_version)) {
    throw new Error('PROJECT_SPEC_REPAIR_VERSION_INVALID');
  }
  if (!Array.isArray(input.preparation.modules) || input.preparation.modules.length === 0) {
    throw new Error('PROJECT_SPEC_REPAIR_MODULE_MAPPINGS_REQUIRED');
  }

  const candidateRoot = join(input.workItemDir, 'candidates');
  const candidateManifestPath = join(input.workItemDir, 'candidate_manifest.json');
  const repairPlanPath = join(input.workItemDir, 'project_spec_repair_plan.json');
  const runtimeScaffold = await inspectRuntimeEmptyCandidateScaffold({
    candidateRoot,
    candidateManifestPath,
    repairPlanPath,
    workItemId: input.workItemId,
    expectedProjectSpecVersion: input.preparation.expected_project_spec_version,
  });

  const temporaryRoot = join(input.workItemDir, `.repair-staging-${randomUUID()}`);
  const stagedCandidates = join(temporaryRoot, 'candidates');
  const manifestEntries: Array<Record<string, unknown>> = [];
  const moduleCodes = new Set<string>();

  try {
    for (const mapping of input.preparation.modules) {
      const moduleCode = normalizeModuleCodeReference(mapping.module_code);
      if (!moduleCode || moduleCode !== mapping.module_code) {
        throw new Error(`Repair module_code must already be canonical MODULE_CODE: ${mapping.module_code}`);
      }
      if (moduleCodes.has(moduleCode)) {
        throw new Error(`Duplicate repair module mapping: ${moduleCode}`);
      }
      moduleCodes.add(moduleCode);

      const targetDirectory = join(stagedCandidates, 'project', 'modules', moduleCode);
      await mkdir(targetDirectory, { recursive: true });
      const definitionTarget = join(targetDirectory, 'module.candidate.json');

      if (mapping.module_definition_source) {
        const source = resolveProjectSpecSource(input.projectRoot, mapping.module_definition_source);
        const definition = JSON.parse(await readFile(source, 'utf8')) as unknown;
        const identity = resolveSpecModuleIdentity(definition);
        if (!identity.valid || identity.moduleCode !== moduleCode) {
          throw new Error(`Module definition source does not match ${moduleCode}`);
        }
        await copyFile(source, definitionTarget);
      } else {
        await writeFile(
          definitionTarget,
          `${JSON.stringify({ module_code: moduleCode, status: 'active' }, null, 2)}\n`,
          'utf8'
        );
      }

      const sources = [
        ['requirements', 'requirements.candidate.md', 'requirements.md', mapping.requirements_source],
        ['design', 'design.candidate.md', 'design.md', mapping.design_source],
        ['module_trace', 'trace.candidate.md', 'trace.md', mapping.trace_source],
      ] as const;

      for (const [, candidateFilename, , sourcePath] of sources) {
        await copyFile(
          resolveProjectSpecSource(input.projectRoot, sourcePath),
          join(targetDirectory, candidateFilename),
        );
      }

      manifestEntries.push({
        type: 'module_definition',
        module_id: moduleCode,
        candidate_path: `candidates/project/modules/${moduleCode}/module.candidate.json`,
        target_path: `.specforge/project/modules/${moduleCode}/module.json`,
        operation: 'replace',
      });

      for (const [type, candidateFilename, targetFilename] of sources) {
        manifestEntries.push({
          type,
          module_id: moduleCode,
          candidate_path: `candidates/project/modules/${moduleCode}/${candidateFilename}`,
          target_path: `.specforge/project/modules/${moduleCode}/${targetFilename}`,
          operation: 'replace',
        });
      }
    }

    const candidateManifest = {
      schema_version: '1.1',
      work_item_id: input.workItemId,
      workflow_path: 'spec_migration_path',
      base_spec_version: input.preparation.expected_project_spec_version,
      project_spec_precondition_sha256: currentManifestHash,
      repair_evidence_paths: input.preparation.evidence_paths,
      merge_required: true,
      entries: manifestEntries,
    };
    const candidateManifestContent = `${JSON.stringify(candidateManifest, null, 2)}\n`;
    const repairPlan = {
      schema_version: '1.0',
      work_item_id: input.workItemId,
      action: 'project_spec_repair',
      manifest_sha256_before: currentManifestHash,
      project_spec_version_before: input.preparation.expected_project_spec_version,
      modules: Array.from(moduleCodes),
      evidence_paths: input.preparation.evidence_paths,
      candidate_manifest_sha256: sha256(candidateManifestContent),
      prepared_at: new Date().toISOString(),
    };

    const stagedManifest = join(temporaryRoot, 'candidate_manifest.json');
    const stagedPlan = join(temporaryRoot, 'project_spec_repair_plan.json');
    await writeFile(stagedManifest, candidateManifestContent, 'utf8');
    await writeFile(stagedPlan, `${JSON.stringify(repairPlan, null, 2)}\n`, 'utf8');

    let scaffoldAdoptionStarted = false;
    try {
      if (runtimeScaffold) {
        scaffoldAdoptionStarted = true;
        if (runtimeScaffold.candidateRootExists) {
          await rm(candidateRoot, { recursive: true, force: true });
        }
        if (runtimeScaffold.candidateManifestExists) {
          await rm(candidateManifestPath, { force: true });
        }
      }

      await rename(stagedCandidates, candidateRoot);
      await rename(stagedManifest, candidateManifestPath);
      await rename(stagedPlan, repairPlanPath);
    } catch (commitError) {
      if (runtimeScaffold && scaffoldAdoptionStarted) {
        try {
          await restoreRuntimeEmptyCandidateScaffold({
            scaffold: runtimeScaffold,
            candidateRoot,
            candidateManifestPath,
            repairPlanPath,
          });
        } catch (restoreError) {
          const commitDetail =
            commitError instanceof Error ? commitError.message : String(commitError);
          const restoreDetail =
            restoreError instanceof Error ? restoreError.message : String(restoreError);
          throw new Error(
            `PROJECT_SPEC_REPAIR_SCAFFOLD_RESTORE_FAILED: commit=${commitDetail}; restore=${restoreDetail}`,
          );
        }
      }
      throw commitError;
    }

    await rm(temporaryRoot, { recursive: true, force: true });
    return {
      candidate_manifest_path: candidateManifestPath,
      repair_plan_path: repairPlanPath,
      candidate_manifest_hash: repairPlan.candidate_manifest_sha256,
    };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}
// ── Classification ──

function classifyFile(filename: string): MigrationInventory['legacyFiles'][number]['type'] {
  const lower = filename.toLowerCase();
  if (lower.includes('requirements') || lower.includes('req')) return 'requirements';
  if (lower.includes('design')) return 'design';
  if (lower.includes('tasks') || lower.includes('task')) return 'tasks';
  if (lower.includes('verification') || lower.includes('verify') || lower.includes('review')) return 'verification';
  if (lower.includes('evidence') || lower.includes('artifact')) return 'evidence';
  return 'other';
}

// ── Inventory ──

/**
 * 扫描 legacy specs 目录，生成迁移清单。
 */
export async function buildMigrationInventory(
  projectRoot: string,
): Promise<MigrationInventory> {
  const specsDir = join(projectRoot, '.specforge', 'specs');
  const projectDir = join(projectRoot, '.specforge', 'project');

  const legacyFiles: MigrationInventory['legacyFiles'] = [];
  const projectFiles: string[] = [];

  // 扫描 legacy specs
  if (existsSync(specsDir)) {
    await scanDirectory(specsDir, specsDir, legacyFiles);
  }

  // 扫描 project 目录
  if (existsSync(projectDir)) {
    const entries = await readdir(projectDir, { recursive: true });
    for (const entry of entries) {
      const fullPath = join(projectDir, entry as string);
      if (existsSync(fullPath) && (await stat(fullPath)).isFile()) {
        projectFiles.push(entry as string);
      }
    }
  }

  // 统计
  const byType: Record<string, number> = {};
  for (const f of legacyFiles) {
    byType[f.type] = (byType[f.type] || 0) + 1;
  }

  return {
    legacyFiles,
    projectFiles,
    stats: {
      total: legacyFiles.length,
      byType,
    },
  };
}

async function scanDirectory(
  dir: string,
  baseDir: string,
  result: MigrationInventory['legacyFiles'],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // 跳过 evidence 子目录（太大、不适合迁移）
      if (entry.name !== 'evidence') {
        await scanDirectory(fullPath, baseDir, result);
      }
    } else if (entry.isFile()) {
      const rel = relative(baseDir, fullPath);
      const info = await stat(fullPath);
      result.push({
        relativePath: rel,
        absolutePath: fullPath,
        size: info.size,
        type: classifyFile(entry.name),
      });
    }
  }
}

// ── Conflict Detection ──

/**
 * 检测迁移冲突。
 */
export function detectConflicts(
  inventory: MigrationInventory,
  projectRoot: string,
): MigrationConflict[] {
  const conflicts: MigrationConflict[] = [];
  const projectDir = join(projectRoot, '.specforge', 'project');

  for (const file of inventory.legacyFiles) {
    // 检查是否与 project 文件同名
    const targetPath = mapLegacyToProject(file.relativePath, file.type);
    if (!targetPath) {
      conflicts.push({
        legacyPath: file.relativePath,
        projectTargetPath: '(unmapped)',
        conflictType: 'ambiguous_mapping',
        description: `无法自动映射 legacy 文件 ${file.relativePath}`,
        suggestion: '手动确认目标路径后添加到迁移计划',
      });
      continue;
    }

    const fullTarget = join(projectDir, targetPath);
    if (existsSync(fullTarget)) {
      conflicts.push({
        legacyPath: file.relativePath,
        projectTargetPath: targetPath,
        conflictType: 'already_exists',
        description: `目标文件 ${targetPath} 已存在于 project/ 目录`,
        suggestion: '检查内容差异，选择保留版本或合并',
      });
    }

    // 检查格式兼容性
    if (file.type === 'evidence') {
      conflicts.push({
        legacyPath: file.relativePath,
        projectTargetPath: targetPath,
        conflictType: 'format_incompatible',
        description: 'Evidence 文件不参与 project 级迁移',
        suggestion: 'Evidence 保留在 work-items/ 结构中',
      });
    }
  }

  return conflicts;
}

function mapLegacyToProject(legacyPath: string, type: string): string | null {
  // Legacy specs/<WI-ID>/requirements.md → project/requirements_index.md (不直接映射)
  // Legacy specs/<WI-ID>/design.md → project/design_index.md
  // 这些是高层级索引文件，legacy 的是 WI 级别的
  switch (type) {
    case 'requirements':
    case 'design':
    case 'tasks':
    case 'verification':
      return null; // 需要手动映射，因为 legacy 是 WI 级别
    default:
      return null;
  }
}

// ── Plan Generation ──

/**
 * 生成迁移计划。
 */
export async function generateMigrationPlan(
  projectRoot: string,
  workItemId: string,
): Promise<MigrationPlan> {
  const inventory = await buildMigrationInventory(projectRoot);
  const conflicts = detectConflicts(inventory, projectRoot);

  const steps: MigrationPlan['steps'] = [];

  // 为每个可迁移文件生成步骤
  for (const file of inventory.legacyFiles) {
    if (file.type === 'evidence') {
      steps.push({
        source: file.relativePath,
        target: '(skip)',
        action: 'skip',
        description: 'Evidence 文件不迁移到 project 级',
      });
      continue;
    }

    // 检查是否有冲突
    const conflict = conflicts.find(c => c.legacyPath === file.relativePath);
    if (conflict) {
      if (conflict.conflictType === 'ambiguous_mapping') {
        steps.push({
          source: file.relativePath,
          target: '(manual)',
          action: 'manual',
          description: conflict.description,
        });
      } else {
        steps.push({
          source: file.relativePath,
          target: conflict.projectTargetPath,
          action: 'manual',
          description: conflict.description,
        });
      }
      continue;
    }

    // 可自动迁移的文件
    steps.push({
      source: file.relativePath,
      target: mapLegacyToProject(file.relativePath, file.type) || `(unmapped: ${file.type})`,
      action: 'copy',
      description: `迁移 ${file.type} 文件`,
    });
  }

  const autoSteps = steps.filter(s => s.action === 'copy');
  const canAutoMigrate = conflicts.length === 0 && autoSteps.length > 0;

  const requiresUserConfirmation: string[] = [];
  if (conflicts.length > 0) {
    requiresUserConfirmation.push(`${conflicts.length} 个冲突需要用户确认`);
  }
  if (inventory.legacyFiles.length === 0) {
    requiresUserConfirmation.push('未发现 legacy specs 文件');
  }

  return {
    workItemId,
    inventory,
    conflicts,
    steps,
    canAutoMigrate,
    requiresUserConfirmation,
  };
}

// ── Plan Writer ──

/**
 * 将迁移计划写入 WI 目录。
 */
export async function writeMigrationPlan(
  workItemDir: string,
  plan: MigrationPlan,
): Promise<string> {
  const planPath = join(workItemDir, 'migration_plan.md');
  await mkdir(workItemDir, { recursive: true });

  const lines: string[] = [
    '# Migration Plan',
    '',
    `**Work Item**: ${plan.workItemId}`,
    `**Can Auto-Migrate**: ${plan.canAutoMigrate}`,
    `**Total Legacy Files**: ${plan.inventory.stats.total}`,
    `**Conflicts**: ${plan.conflicts.length}`,
    '',
    '## Inventory',
    '',
    '| File | Type | Size |',
    '|------|------|------|',
  ];

  for (const f of plan.inventory.legacyFiles) {
    lines.push(`| ${f.relativePath} | ${f.type} | ${f.size} |`);
  }

  if (plan.conflicts.length > 0) {
    lines.push('', '## Conflicts', '');
    for (const c of plan.conflicts) {
      lines.push(`- **${c.legacyPath}**: ${c.description} (${c.conflictType})`);
      lines.push(`  - Suggestion: ${c.suggestion}`);
    }
  }

  lines.push('', '## Steps', '');
  for (const s of plan.steps) {
    lines.push(`- [${s.action.toUpperCase()}] ${s.source} → ${s.target}`);
    lines.push(`  ${s.description}`);
  }

  if (plan.requiresUserConfirmation.length > 0) {
    lines.push('', '## Requires User Confirmation', '');
    for (const item of plan.requiresUserConfirmation) {
      lines.push(`- ${item}`);
    }
  }

  lines.push('');

  await writeFile(planPath, lines.join('\n'), 'utf-8');
  return planPath;
}
