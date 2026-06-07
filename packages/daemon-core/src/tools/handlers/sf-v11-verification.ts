/**
 * sf-v11-verification — §13 Trace/Verification/Evidence handler
 */
import { registerHandler } from '../ToolDispatcher';
import {
  validateTraceDelta,
  validateVerificationReport,
  validateEvidenceManifest,
  checkTraceChain,
  writeTraceDeltaTemplate,
  writeEvidenceManifestTemplate,
} from '../lib/verification-evidence-v11';
import * as path from 'node:path';
import { readFile } from 'node:fs/promises';

registerHandler('sf_v11_verification', async (args, context, _deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const action = (args['action'] as string) || 'validate';

  try {
    const workItemId = args['work_item_id'] as string;
    if (!workItemId) {
      return { success: false, error: 'work_item_id is required' };
    }

    const wiDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);

    if (action === 'validate_trace_delta') {
      const content = args['content'] as string;
      if (!content) {
        try {
          const raw = await readFile(path.join(wiDir, 'trace_delta.md'), 'utf-8');
          const result = validateTraceDelta(raw);
          return { success: true, action, ...result };
        } catch {
          return { success: false, error: 'trace_delta.md not found and no content provided' };
        }
      }
      const result = validateTraceDelta(content);
      return { success: true, action, ...result };
    }

    if (action === 'validate_verification_report') {
      const content = args['content'] as string;
      if (!content) {
        try {
          const raw = await readFile(path.join(wiDir, 'verification_report.md'), 'utf-8');
          const result = validateVerificationReport(raw);
          return { success: true, action, ...result };
        } catch {
          return { success: false, error: 'verification_report.md not found and no content provided' };
        }
      }
      const result = validateVerificationReport(content);
      return { success: true, action, ...result };
    }

    if (action === 'validate_evidence_manifest') {
      const manifest = args['manifest'];
      if (!manifest) {
        try {
          const raw = await readFile(path.join(wiDir, 'evidence', 'evidence_manifest.json'), 'utf-8');
          const parsed = JSON.parse(raw);
          const result = validateEvidenceManifest(parsed);
          return { success: true, action, ...result };
        } catch {
          return { success: false, error: 'evidence_manifest.json not found and no manifest provided' };
        }
      }
      const result = validateEvidenceManifest(manifest);
      return { success: true, action, ...result };
    }

    if (action === 'check_trace_chain') {
      const entries = args['entries'];
      if (!Array.isArray(entries)) {
        return { success: false, error: 'entries array is required' };
      }
      const result = checkTraceChain(entries);
      return { success: true, action, ...result };
    }

    if (action === 'create_trace_delta') {
      const impact = (args['impact'] as string) || 'none';
      const reason = (args['reason'] as string) || 'No trace impact (§13.2)';
      const filePath = await writeTraceDeltaTemplate(wiDir, workItemId, impact as any, reason);
      return { success: true, action, path: filePath };
    }

    if (action === 'create_evidence_manifest') {
      const filePath = await writeEvidenceManifestTemplate(wiDir, workItemId);
      return { success: true, action, path: filePath };
    }

    return { success: false, error: `Unknown action: ${action}.` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
