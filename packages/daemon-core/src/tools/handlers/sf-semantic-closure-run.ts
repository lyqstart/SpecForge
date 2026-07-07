/**
 * sf-semantic-closure-run — generate and validate .semantic_closure.json.
 *
 * Public alias: sf_semantic_closure_run.
 * This tool writes only semantic closure artifacts inside the current WI:
 * - .semantic_closure.json
 * - semantic_closure_report.md
 * It does not advance workflow state and does not modify code or project truth source.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { registerHandler } from '../ToolDispatcher.js';
import { buildSemanticClosureFromArtifacts } from '../lib/semantic-closure-builder.js';
import { validateSemanticClosure } from '../lib/semantic-closure-core.js';

async function readTextIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return undefined;
  }
}

async function readJsonIfExists<T = any>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function rel(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).replace(/\\/g, '/');
}

function renderReport(input: {
  workItemId: string;
  manifestPath: string;
  source: string;
  validation: ReturnType<typeof validateSemanticClosure>;
  diagnostics: string[];
}): string {
  const lines: string[] = [
    '# Semantic Closure Report',
    '',
    `- Work Item: ${input.workItemId}`,
    `- Status: ${input.validation.passed ? 'PASSED' : 'FAILED'}`,
    `- Source: ${input.source}`,
    `- Manifest: ${input.manifestPath}`,
    `- Timestamp: ${new Date().toISOString()}`,
    '',
    '## Errors',
    '',
  ];

  if (input.validation.errors.length === 0) {
    lines.push('- None', '');
  } else {
    for (const issue of input.validation.errors) {
      lines.push(`- ${issue.check_id}: ${issue.message}`);
      for (const detail of issue.details ?? []) lines.push(`  - ${detail}`);
    }
    lines.push('');
  }

  lines.push('## Warnings', '');
  if (input.validation.warnings.length === 0) {
    lines.push('- None', '');
  } else {
    for (const issue of input.validation.warnings) {
      lines.push(`- ${issue.check_id}: ${issue.message}`);
      for (const detail of issue.details ?? []) lines.push(`  - ${detail}`);
    }
    lines.push('');
  }

  lines.push('## Diagnostics', '');
  if (input.diagnostics.length === 0) {
    lines.push('- None', '');
  } else {
    for (const diagnostic of input.diagnostics) lines.push(`- ${diagnostic}`);
    lines.push('');
  }

  lines.push('## Checks', '', '| Check ID | Passed | Description |', '|---|---:|---|');
  for (const check of input.validation.checks) {
    lines.push(`| ${check.check_id} | ${check.passed ? 'yes' : 'no'} | ${check.description.replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  return lines.join('\n');
}

registerHandler('sf_v11_semantic_closure_run', async (args, context) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  const force = args['force'] === true;

  if (!workItemId) {
    return { success: false, error: 'work_item_id is required' };
  }

  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
  const semanticClosurePath = path.join(workItemDir, '.semantic_closure.json');
  const reportPath = path.join(workItemDir, 'semantic_closure_report.md');

  if (!force) {
    const existing = await readJsonIfExists(semanticClosurePath);
    if (existing) {
      const validation = validateSemanticClosure(existing);
      await fs.writeFile(
        reportPath,
        renderReport({
          workItemId,
          manifestPath: rel(projectRoot, semanticClosurePath),
          source: 'existing_semantic_closure',
          validation,
          diagnostics: ['Existing .semantic_closure.json preserved because force=true was not supplied.'],
        }),
        'utf-8',
      );
      return {
        success: validation.passed,
        work_item_id: workItemId,
        semantic_closure_valid: validation.passed,
        source: 'existing_semantic_closure',
        manifest_path: rel(projectRoot, semanticClosurePath),
        report_path: rel(projectRoot, reportPath),
        errors: validation.errors,
        warnings: validation.warnings,
      };
    }
  }

  const workItem = await readJsonIfExists<Record<string, any>>(path.join(workItemDir, 'work_item.json'));
  if (!workItem) {
    return { success: false, work_item_id: workItemId, error: `work_item.json not found at ${rel(projectRoot, path.join(workItemDir, 'work_item.json'))}` };
  }

  const evidenceManifest = await readJsonIfExists<Record<string, any>>(path.join(workItemDir, 'evidence', 'evidence_manifest.json'));
  const build = buildSemanticClosureFromArtifacts({
    workItemId,
    workItem,
    traceDeltaMd: await readTextIfExists(path.join(workItemDir, 'trace_delta.md')),
    verificationReportMd: await readTextIfExists(path.join(workItemDir, 'verification_report.md')),
    evidenceManifest,
    mergeReportMd: await readTextIfExists(path.join(workItemDir, 'merge_report.md')),
  });

  await fs.writeFile(semanticClosurePath, JSON.stringify(build.manifest, null, 2) + '\n', 'utf-8');
  await fs.writeFile(
    reportPath,
    renderReport({
      workItemId,
      manifestPath: rel(projectRoot, semanticClosurePath),
      source: build.source,
      validation: build.validation,
      diagnostics: build.diagnostics,
    }),
    'utf-8',
  );

  return {
    success: build.validation.passed,
    work_item_id: workItemId,
    semantic_closure_valid: build.validation.passed,
    source: build.source,
    manifest_path: rel(projectRoot, semanticClosurePath),
    report_path: rel(projectRoot, reportPath),
    errors: build.validation.errors,
    warnings: build.validation.warnings,
  };
});
