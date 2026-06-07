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

import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { existsSync } from 'node:fs';

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
