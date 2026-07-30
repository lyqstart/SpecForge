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
import {
  buildSemanticClosureFromArtifacts,
  parseSemanticClosureManifest,
} from '../lib/semantic-closure-builder.js';
import { validateSemanticClosure } from '../lib/semantic-closure-core.js';
import {
  captureSemanticClosureProvenance,
  SEMANTIC_CLOSURE_ACCEPTED_SOURCES,
  SEMANTIC_CLOSURE_CONTRACT_ID,
  validateSemanticClosureProvenance,
} from '../lib/semantic-closure-provenance.js';
import { readAuthoritativeState } from '../lib/state-coordinator-v11.js';
import {
  extractStructuredVerificationReport,
  validateVerificationReportContract,
  VERIFICATION_REPORT_CONTRACT_ID,
} from '../lib/verification-report-contract.js';
import { resolveWorkItemSpecArtifacts } from '../lib/governance-invariants-v11.js';
import { isWorkItemSpecArtifactPlaceholder } from '@specforge/types/directory-layout';

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
  overallPassed?: boolean;
}): string {
  const overallPassed = input.overallPassed ?? input.validation.passed;
  const lines: string[] = [
    '# Semantic Closure Report',
    '',
    `- Work Item: ${input.workItemId}`,
    `- Status: ${overallPassed ? 'PASSED' : 'FAILED'}`,
    `- Source: ${input.source}`,
    `- Contract: ${SEMANTIC_CLOSURE_CONTRACT_ID}`,
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

  lines.push('## Recovery Contract', '');
  lines.push(`- Preferred input: typed \`semantic_closure\` argument.`);
  lines.push(
    '- Required normal-flow sections: outcomes, requirements, design_decisions, tasks, evidence, project_integration.'
  );
  lines.push(
    '- Evidence used for completion must be passed, non-weak, and reference the semantic target it proves.'
  );
  lines.push(
    '- After any verification input changes, regenerate with force=true before running verification_gate.'
  );
  lines.push('');

  lines.push('## Checks', '', '| Check ID | Passed | Description |', '|---|---:|---|');
  for (const check of input.validation.checks) {
    lines.push(
      `| ${check.check_id} | ${check.passed ? 'yes' : 'no'} | ${check.description.replace(/\|/g, '\\|')} |`
    );
  }
  lines.push('');
  return lines.join('\n');
}

registerHandler('sf_v11_semantic_closure_run', async (args, context, deps) => {
  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  const suppliedSemanticClosure = args['semantic_closure'];
  const force = args['force'] === true || suppliedSemanticClosure !== undefined;

  if (!workItemId) {
    return { success: false, error: 'work_item_id is required' };
  }

  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
  const semanticClosurePath = path.join(workItemDir, '.semantic_closure.json');
  const reportPath = path.join(workItemDir, 'semantic_closure_report.md');
  const verificationReportPath = path.join(workItemDir, 'verification_report.md');

  const authoritativeState = await readAuthoritativeState({
    deps,
    projectRoot,
    workItemId,
  });
  const inputsFrozen = ['verification_done', 'closed', 'rejected', 'superseded'].includes(
    String(authoritativeState.current_state ?? '')
  );
  if (force && inputsFrozen) {
    return {
      success: false,
      work_item_id: workItemId,
      error: 'SEMANTIC_CLOSURE_INPUTS_FROZEN',
      current_state: authoritativeState.current_state,
      semantic_closure_valid: false,
      retry_allowed: false,
      recovery:
        'Recover the Work Item from verification_done to implementation_ready, update verification artifacts, regenerate semantic closure, then rerun verification_gate.',
    };
  }

  const verificationReportText = await readTextIfExists(verificationReportPath);
  const verificationReport = verificationReportText
    ? extractStructuredVerificationReport(verificationReportText)
    : null;
  const verificationContract = validateVerificationReportContract(verificationReport);
  if (!verificationContract.valid) {
    return {
      success: false,
      work_item_id: workItemId,
      error: 'VERIFICATION_INPUT_CONTRACT_INVALID',
      semantic_closure_valid: false,
      retry_allowed: !inputsFrozen,
      verification_contract_id: VERIFICATION_REPORT_CONTRACT_ID,
      validation_errors: verificationContract.errors,
      verification_report_path: rel(projectRoot, verificationReportPath),
      recovery: inputsFrozen
        ? `Recover the Work Item to implementation_ready, have sf-verifier rewrite verification_report with the complete ${VERIFICATION_REPORT_CONTRACT_ID} contract, then regenerate semantic closure.`
        : `Have sf-verifier rewrite verification_report with the complete ${VERIFICATION_REPORT_CONTRACT_ID} contract, then call sf_semantic_closure_run again.`,
    };
  }

  if (!force) {
    const existing = await readJsonIfExists<Record<string, any>>(semanticClosurePath);
    if (existing) {
      const validation = validateSemanticClosure(existing);
      const provenanceValidation = await validateSemanticClosureProvenance(workItemDir, existing);
      const closureValid = validation.passed && provenanceValidation.passed;
      await fs.writeFile(
        reportPath,
        renderReport({
          workItemId,
          manifestPath: rel(projectRoot, semanticClosurePath),
          source: 'existing_semantic_closure',
          validation,
          overallPassed: closureValid,
          diagnostics: [
            'Existing .semantic_closure.json preserved because force=true was not supplied.',
            ...provenanceValidation.errors,
          ],
        }),
        'utf-8'
      );
      return {
        success: closureValid,
        work_item_id: workItemId,
        semantic_closure_valid: closureValid,
        source: 'existing_semantic_closure',
        manifest_path: rel(projectRoot, semanticClosurePath),
        report_path: rel(projectRoot, reportPath),
        errors: validation.errors,
        warnings: validation.warnings,
        provenance_valid: provenanceValidation.passed,
        provenance_errors: provenanceValidation.errors,
        contract_id: SEMANTIC_CLOSURE_CONTRACT_ID,
        accepted_sources: SEMANTIC_CLOSURE_ACCEPTED_SOURCES,
        next_action: closureValid
          ? 'Run verification_gate.'
          : inputsFrozen
            ? 'Recover to implementation_ready, then regenerate semantic closure with force=true.'
            : 'Regenerate semantic closure with force=true after correcting its inputs.',
      };
    }
  }

  if (inputsFrozen) {
    return {
      success: false,
      work_item_id: workItemId,
      error: 'SEMANTIC_CLOSURE_INPUTS_FROZEN',
      current_state: authoritativeState.current_state,
      semantic_closure_valid: false,
      retry_allowed: false,
      recovery:
        'No existing semantic closure is available to validate. Recover the Work Item to implementation_ready, regenerate semantic closure, then rerun verification_gate.',
    };
  }

  const workItem = await readJsonIfExists<Record<string, any>>(
    path.join(workItemDir, 'work_item.json')
  );
  if (!workItem) {
    return {
      success: false,
      work_item_id: workItemId,
      error: `work_item.json not found at ${rel(projectRoot, path.join(workItemDir, 'work_item.json'))}`,
    };
  }

  const evidenceManifest = await readJsonIfExists<Record<string, any>>(
    path.join(workItemDir, 'evidence', 'evidence_manifest.json')
  );

  if (suppliedSemanticClosure !== undefined) {
    const parsed = parseSemanticClosureManifest(suppliedSemanticClosure);
    if (!parsed) {
      return {
        success: false,
        work_item_id: workItemId,
        error: 'INVALID_SEMANTIC_CLOSURE_ARGUMENT',
        semantic_closure_valid: false,
        contract_id: SEMANTIC_CLOSURE_CONTRACT_ID,
        accepted_sources: SEMANTIC_CLOSURE_ACCEPTED_SOURCES,
        recovery:
          'Pass semantic_closure as a manifest object with outcomes, requirements, design_decisions, tasks, evidence, and project_integration.',
      };
    }
    if (parsed.work_item_id && parsed.work_item_id !== workItemId) {
      return {
        success: false,
        work_item_id: workItemId,
        error: 'SEMANTIC_CLOSURE_WORK_ITEM_MISMATCH',
        supplied_work_item_id: parsed.work_item_id,
        semantic_closure_valid: false,
        retry_allowed: true,
      };
    }
  }

  const traceDeltaArtifact = (
    await resolveWorkItemSpecArtifacts({
      projectRoot,
      workItemId,
      kind: 'trace_delta',
    })
  )[0];
  const traceDeltaMd =
    traceDeltaArtifact &&
    !isWorkItemSpecArtifactPlaceholder('trace_delta', traceDeltaArtifact.content)
      ? traceDeltaArtifact.content
      : undefined;

  const build = buildSemanticClosureFromArtifacts({
    workItemId,
    workItem,
    curatedSemanticClosure: suppliedSemanticClosure,
    traceDeltaMd,
    verificationReportMd: verificationReportText,
    evidenceManifest,
    mergeReportMd: await readTextIfExists(path.join(workItemDir, 'merge_report.md')),
  });

  const manifest = {
    ...build.manifest,
    provenance: await captureSemanticClosureProvenance({
      workItemDir,
      source: build.source,
      manifest: build.manifest,
    }),
  };
  const validation = validateSemanticClosure(manifest);

  await fs.writeFile(semanticClosurePath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  await fs.writeFile(
    reportPath,
    renderReport({
      workItemId,
      manifestPath: rel(projectRoot, semanticClosurePath),
      source: build.source,
      validation,
      diagnostics: build.diagnostics,
    }),
    'utf-8'
  );

  return {
    success: validation.passed,
    work_item_id: workItemId,
    semantic_closure_valid: validation.passed,
    source: build.source,
    manifest_path: rel(projectRoot, semanticClosurePath),
    report_path: rel(projectRoot, reportPath),
    errors: validation.errors,
    warnings: validation.warnings,
    provenance_valid: true,
    contract_id: SEMANTIC_CLOSURE_CONTRACT_ID,
    accepted_sources: SEMANTIC_CLOSURE_ACCEPTED_SOURCES,
    next_action: validation.passed
      ? 'Run verification_gate. Do not mutate verification inputs after the gate passes.'
      : 'Correct the returned validation errors and call sf_semantic_closure_run again with the typed semantic_closure argument.',
  };
});
