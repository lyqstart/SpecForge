import { registerHandler } from '../ToolDispatcher';

registerHandler('sf_knowledge_base', async (args, _context, _deps) => {
  const operation = args['operation'] as string;

  if (!operation) {
    return { success: false, error: 'operation required' };
  }

  switch (operation) {
    case 'list':
      return { success: true, entries: [] };
    case 'search':
      return { success: true, results: [] };
    case 'get':
      return { success: true, entry: null };
    default:
      return { success: true, operation };
  }
});
