import { registerHandler } from '../ToolDispatcher';
import {
  detectContextExhaustion,
  extractContextSnapshot,
  generateContinuationPrompt,
  mergeArchives,
  enforceContinuationLimit,
} from '../lib/sf_continuity_core';
import type { TraceEntry, ArchiveResult, AgentRunArchive, ContextSnapshot, ExtractSnapshotOptions } from '../lib/sf_continuity_core';

registerHandler('sf_continuity', async (args, context, _deps) => {
  const operation = args['operation'] as string;
  if (!operation) {
    return { success: false, error: 'operation required' };
  }

  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  try {
    switch (operation) {
      case 'detect_exhaustion': {
        if (args['run_failed'] === undefined) return { error: 'run_failed required for detect_exhaustion' };
        if (!args['run_id'] || !args['session_id']) return { error: 'run_id and session_id required for detect_exhaustion' };

        let traceEntries: TraceEntry[] = [];
        if (args['trace_entries']) {
          traceEntries = JSON.parse(args['trace_entries'] as string);
        }
        let archiveResult: ArchiveResult | null = null;
        if (args['archive_result']) {
          archiveResult = JSON.parse(args['archive_result'] as string);
        }

        return detectContextExhaustion(
          args['run_failed'] as boolean,
          traceEntries,
          archiveResult,
          args['run_id'] as string,
          args['session_id'] as string
        );
      }
      case 'extract_snapshot': {
        if (!args['work_item_id'] || !args['workflow_type'] || !args['stage']) {
          return { error: 'work_item_id, workflow_type, and stage required for extract_snapshot' };
        }
        const options: ExtractSnapshotOptions = {
          workItemId: args['work_item_id'] as string,
          workflowType: args['workflow_type'] as any,
          stage: args['stage'] as string,
          runId: (args['run_id'] as string) || '',
          sessionId: (args['session_id'] as string) || '',
          baseDir,
        };
        return await extractContextSnapshot(options);
      }
      case 'generate_prompt': {
        if (!args['original_task'] || !args['snapshot'] || args['continuation_index'] === undefined) {
          return { error: 'original_task, snapshot, and continuation_index required for generate_prompt' };
        }
        const snapshot: ContextSnapshot = JSON.parse(args['snapshot'] as string);
        const prompt = generateContinuationPrompt(
          args['original_task'] as string,
          snapshot,
          args['continuation_index'] as number
        );
        return { prompt };
      }
      case 'merge_archives': {
        if (!args['original_archive'] || !args['continuation_archive']) {
          return { error: 'original_archive and continuation_archive required for merge_archives' };
        }
        const originalArchive: AgentRunArchive = JSON.parse(args['original_archive'] as string);
        const continuationArchive: AgentRunArchive = JSON.parse(args['continuation_archive'] as string);
        return mergeArchives(originalArchive, continuationArchive);
      }
      case 'check_continuation_limit': {
        if (!args['root_run_id']) return { error: 'root_run_id required for check_continuation_limit' };
        return await enforceContinuationLimit(args['root_run_id'] as string, baseDir);
      }
      default:
        return { error: `Unknown operation: ${operation}` };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
