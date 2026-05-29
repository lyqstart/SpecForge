#!/usr/bin/env bun
/**
 * render-specs-readme.ts — 自动生成 .specforge/specs/README.md
 *
 * 用法：
 *   bun run scripts/render-specs-readme.ts                  # 生成 specs/README.md
 *   bun run scripts/render-specs-readme.ts --dry-run         # 只输出到 stdout，不写文件
 *
 * 功能：
 *   1. 扫描 .specforge/specs/ 下所有 WI-XXX/ 目录
 *   2. 读取每个 WI 的 _meta.json（如果存在）
 *   3. 生成 .specforge/specs/README.md
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

interface MetaJson {
  id: string;
  workflow_type: string;
  title: string;
  summary: string;
  key_decisions: string[];
  current_stage: string;
  created_at: string;
  completed_at?: string;
  related_modules?: string[];
  upstream_wis?: string[];
  downstream_wis?: string[];
}

interface WorkItemInfo {
  id: string;
  dirName: string;
  meta: MetaJson | null;
  files: string[];
}

// ---------------------------------------------------------------------------
// WI 目录扫描
// ---------------------------------------------------------------------------

const WI_DIR_PATTERN = /^WI-\d+$/;

function scanWorkItems(specsDir: string): WorkItemInfo[] {
  if (!fs.existsSync(specsDir)) {
    return [];
  }

  const entries = fs.readdirSync(specsDir, { withFileTypes: true });
  const workItems: WorkItemInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !WI_DIR_PATTERN.test(entry.name)) {
      continue;
    }

    const dirPath = path.join(specsDir, entry.name);

    // 读取 _meta.json
    const metaPath = path.join(dirPath, '_meta.json');
    let meta: MetaJson | null = null;
    if (fs.existsSync(metaPath)) {
      try {
        const raw = fs.readFileSync(metaPath, 'utf-8');
        meta = JSON.parse(raw) as MetaJson;
      } catch {
        // _meta.json 损坏时跳过
        console.warn(`Warning: Failed to parse ${metaPath}`);
      }
    }

    // 列出 WI 目录下的文件
    const files = fs
      .readdirSync(dirPath)
      .filter((f) => f !== '_meta.json');

    workItems.push({
      id: entry.name,
      dirName: entry.name,
      meta,
      files,
    });
  }

  // 按 WI 编号排序
  workItems.sort((a, b) => {
    const numA = parseInt(a.id.replace('WI-', ''), 10);
    const numB = parseInt(b.id.replace('WI-', ''), 10);
    return numA - numB;
  });

  return workItems;
}

// ---------------------------------------------------------------------------
// Markdown 生成
// ---------------------------------------------------------------------------

const WORKFLOW_DISPLAY_NAMES: Record<string, string> = {
  feature_spec: 'Feature Spec',
  bugfix_spec: 'Bugfix Spec',
  feature_spec_design_first: 'Design-First',
  quick_change: 'Quick Change',
  change_request: 'Change Request',
  refactor: 'Refactor',
  ops_task: 'Ops Task',
  investigation: 'Investigation',
};

const STAGE_DISPLAY: Record<string, string> = {
  intake: '📋 Intake',
  requirements: '📝 Requirements',
  design: '🎨 Design',
  tasks: '📋 Tasks',
  development: '🔨 Development',
  review: '👀 Review',
  verification: '✅ Verification',
  completed: '✅ Completed',
  blocked: '🚫 Blocked',
  refactor_analysis: '🔍 Refactor Analysis',
  refactor_plan: '📋 Refactor Plan',
  refactor_analysis_gate: '🔒 Analysis Gate',
  refactor_plan_gate: '🔒 Plan Gate',
  verification_gate: '🔒 Verification Gate',
};

function stageIcon(stage: string): string {
  return STAGE_DISPLAY[stage] || stage;
}

function workflowDisplayName(type: string): string {
  return WORKFLOW_DISPLAY_NAMES[type] || type;
}

function generateReadme(workItems: WorkItemInfo[]): string {
  const timestamp = new Date().toISOString();
  const total = workItems.length;

  // 统计各状态数量
  const stageCounts: Record<string, number> = {};
  for (const wi of workItems) {
    const stage = wi.meta?.current_stage || 'unknown';
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  }

  const statsLine = Object.entries(stageCounts)
    .map(([stage, count]) => `${stage}: ${count}`)
    .join(', ');

  // 生成各 WI 条目
  const sections = workItems.map((wi) => {
    const meta = wi.meta;
    const title = meta?.title || wi.id;
    const workflow = meta
      ? workflowDisplayName(meta.workflow_type)
      : '—';
    const stage = meta ? stageIcon(meta.current_stage) : '—';
    const summary = meta?.summary || '';
    const created = meta?.created_at
      ? meta.created_at.split('T')[0]
      : '—';

    let section = `## ${wi.id} ${title}\n`;
    section += `- **工作流**：${workflow}\n`;
    section += `- **状态**：${stage}\n`;
    section += `- **创建日期**：${created}\n`;

    if (summary) {
      section += `- **摘要**：${summary}\n`;
    }

    if (meta?.upstream_wis && meta.upstream_wis.length > 0) {
      section += `- **上游 WI**：${meta.upstream_wis.join(', ')}\n`;
    }

    if (meta?.downstream_wis && meta.downstream_wis.length > 0) {
      section += `- **下游 WI**：${meta.downstream_wis.join(', ')}\n`;
    }

    if (meta?.related_modules && meta.related_modules.length > 0) {
      section += `- **相关模块**：${meta.related_modules.join(', ')}\n`;
    }

    section += `\n---\n`;
    return section;
  });

  return `<!-- BEGIN: specforge-managed (DO NOT EDIT MANUALLY) -->
<!-- 由 scripts/render-specs-readme.ts 自动生成 -->

# Work Items 总索引

最后更新：${timestamp}
总数：${total} (${statsLine})

---

${sections.join('\n')}

<!-- END: specforge-managed -->
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const projectRoot = path.resolve(import.meta.dir, '..');
  const specsDir = path.join(projectRoot, '.specforge', 'specs');

  // 扫描 WI 目录
  const workItems = scanWorkItems(specsDir);

  if (workItems.length === 0) {
    console.log('No work items found in .specforge/specs/');
    return;
  }

  console.log(
    `Found ${workItems.length} work items: ${workItems.map((w) => w.id).join(', ')}`,
  );

  // 统计有 _meta.json 的 WI 数量
  const withMeta = workItems.filter((w) => w.meta !== null).length;
  console.log(`  → ${withMeta} have _meta.json`);

  // 生成 README.md
  const readme = generateReadme(workItems);

  if (dryRun) {
    console.log('\n' + readme);
    return;
  }

  // 写入 .specforge/specs/README.md
  const outputPath = path.join(specsDir, 'README.md');
  fs.writeFileSync(outputPath, readme, 'utf-8');
  console.log(`\n✓ Generated: ${path.relative(projectRoot, outputPath)}`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
