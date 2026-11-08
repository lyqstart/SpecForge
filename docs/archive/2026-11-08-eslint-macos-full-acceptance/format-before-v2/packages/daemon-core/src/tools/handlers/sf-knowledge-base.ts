import { registerHandler } from '../ToolDispatcher';
import {
  addEntry,
  updateEntry,
  removeEntry,
  getEntry,
  listEntries,
  searchEntries,
  addCategory,
  qualityCheck,
  cleanup,
  recordFeedback,
  checkDuplicate,
} from '../lib/sf_knowledge_base_core';
import type { AddEntryParams, UpdateEntryParams, SearchParams, RecordFeedbackParams, EntryStatus } from '../lib/sf_knowledge_base_core';

registerHandler('sf_knowledge_base', async (args, _context, _deps) => {
  const operation = args['operation'] as string;
  if (!operation) {
    return { success: false, error: 'operation required' };
  }

  try {
    switch (operation) {
      case 'add': {
        const params: AddEntryParams = {
          title: (args['title'] as string) || '',
          content: (args['content'] as string) || '',
          category: (args['category'] as string) || '',
          tags: args['tags'] ? JSON.parse(args['tags'] as string) : [],
          applicable_file_patterns: args['applicable_file_patterns'] ? JSON.parse(args['applicable_file_patterns'] as string) : [],
          confidence: (args['confidence'] as any) || 'medium',
          source_project: (args['source_project'] as string) || '',
          source_work_item: (args['source_work_item'] as string) || '',
          anti_conditions: args['anti_conditions'] ? JSON.parse(args['anti_conditions'] as string) : [],
          applicability: (args['applicability'] as string) || '',
          normalized_key: (args['normalized_key'] as string) || '',
        };
        return await addEntry(params);
      }
      case 'update': {
        if (!args['entry_id']) return { success: false, error: 'entry_id required for update' };
        const params: UpdateEntryParams = {
          entry_id: args['entry_id'] as string,
          title: args['title'] as string | undefined,
          content: args['content'] as string | undefined,
          tags: args['tags'] ? JSON.parse(args['tags'] as string) : undefined,
          status: args['status'] as any,
          verification_status: args['verification_status'] as any,
          confidence: args['confidence'] as any,
        };
        return await updateEntry(params);
      }
      case 'remove': {
        if (!args['entry_id']) return { success: false, error: 'entry_id required for remove' };
        return await removeEntry(args['entry_id'] as string);
      }
      case 'get': {
        if (!args['entry_id']) return { success: false, error: 'entry_id required for get' };
        const entry = await getEntry(args['entry_id'] as string);
        if (!entry) return { success: false, error: `Entry not found: ${args['entry_id']}` };
        return { success: true, entry };
      }
      case 'list': {
        const filter: { category?: string; tags?: string[]; status?: EntryStatus } = {};
        if (args['category']) filter.category = args['category'] as string;
        if (args['tags']) filter.tags = JSON.parse(args['tags'] as string);
        if (args['status']) filter.status = args['status'] as EntryStatus;
        const entries = await listEntries(filter);
        return { success: true, count: entries.length, entries };
      }
      case 'search': {
        const params: SearchParams = {};
        if (args['keywords']) params.keywords = JSON.parse(args['keywords'] as string);
        if (args['file_patterns']) params.file_patterns = JSON.parse(args['file_patterns'] as string);
        if (args['category']) params.category = args['category'] as string;
        if (args['tags']) params.tags = JSON.parse(args['tags'] as string);
        if (args['status']) params.status = args['status'] as EntryStatus;
        if (args['limit']) params.limit = args['limit'] as number;
        const results = await searchEntries(params);
        return { success: true, count: results.length, results };
      }
      case 'add_category': {
        if (!args['category_id'] || !args['category_name']) {
          return { success: false, error: 'category_id and category_name required for add_category' };
        }
        return await addCategory(
          args['category_id'] as string,
          args['category_name'] as string,
          (args['category_description'] as string) || ''
        );
      }
      case 'quality_check': {
        const report = await qualityCheck();
        return { success: true, report };
      }
      case 'cleanup': {
        return await cleanup();
      }
      case 'record_feedback': {
        if (!args['entry_id'] || !args['outcome']) {
          return { success: false, error: 'entry_id and outcome required for record_feedback' };
        }
        const params: RecordFeedbackParams = {
          entry_id: args['entry_id'] as string,
          outcome: args['outcome'] as any,
          task_id: args['task_id'] as string | undefined,
          work_item_id: args['work_item_id'] as string | undefined,
        };
        return await recordFeedback(params);
      }
      case 'check_duplicate': {
        const normalizedKey = (args['normalized_key'] as string) || '';
        const filePatterns = args['file_patterns'] ? JSON.parse(args['file_patterns'] as string) : [];
        const tags = args['tags'] ? JSON.parse(args['tags'] as string) : [];
        return await checkDuplicate(normalizedKey, filePatterns, tags);
      }
      default:
        return { success: false, error: `Unknown operation: ${operation}` };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
