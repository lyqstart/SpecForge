import { registerHandler } from '../ToolDispatcher';

registerHandler('sf_knowledge_query', async (args, _context, _deps) => {
  const queryType = args['query_type'] as string;

  if (!queryType) {
    return { success: false, error: 'query_type required' };
  }

  return { success: true, query_type: queryType, result: null };
});
